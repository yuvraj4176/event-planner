/** @module ai/geminiClient */
// Client for the Gemini API with automatic model failover.
//
// Models are tried in the configured order. A model that is out of quota,
// overloaded, retired, slow or that returns nothing is set aside for a short
// while and the next model is used, so the assistant keeps working as long as
// any one model can answer. Only a rejected API key stops the whole chain.

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const THINKING_CAN_BE_DISABLED = /^gemini-2\.5-flash/;
const TOTAL_BUDGET_FACTOR = 2;

export const COOLDOWNS_MS = Object.freeze({
  quota: 60_000,
  busy: 30_000,
  retired: 3_600_000,
  other: 120_000,
  transient: 15_000,
});

export class AiUnavailableError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'AiUnavailableError';
  }
}

// Raised for a failure that only affects one model: the next one may succeed.
class ModelSkipped extends Error {
  constructor(reason, cooldownMs) {
    super(reason);
    this.cooldownMs = cooldownMs;
  }
}

// Remembers which models are temporarily set aside.
export function createModelPool({ models, now = Date.now }) {
  const blockedUntil = new Map();
  return {
    // Preferred order, skipping models that are cooling down. If every model is
    // cooling down, try them all anyway, soonest to recover first.
    order() {
      const current = now();
      const ready = models.filter((model) => (blockedUntil.get(model) ?? 0) <= current);
      if (ready.length > 0) return ready;
      return [...models].sort((a, b) => blockedUntil.get(a) - blockedUntil.get(b));
    },
    block: (model, ms) => blockedUntil.set(model, now() + ms),
    clear: (model) => blockedUntil.delete(model),
    isBlocked: (model) => (blockedUntil.get(model) ?? 0) > now(),
  };
}

// Gemini needs turns that alternate and start with the user.
export function normaliseTurns(turns) {
  const merged = [];
  for (const turn of turns) {
    const last = merged[merged.length - 1];
    if (last && last.role === turn.role) last.text += `\n${turn.text}`;
    else if (last || turn.role === 'user') merged.push({ ...turn });
  }
  return merged;
}

function cooldownFor(status, response) {
  if (status === 429) {
    const seconds = Number(response.headers?.get?.('retry-after'));
    return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, 3_600_000) : COOLDOWNS_MS.quota;
  }
  if (status === 404) return COOLDOWNS_MS.retired;
  if (status >= 500) return COOLDOWNS_MS.busy;
  return COOLDOWNS_MS.other;
}

async function readErrorMessage(response) {
  try {
    return String((await response.json())?.error?.message ?? '');
  } catch {
    return '';
  }
}

function extractText(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts
    .filter((part) => typeof part?.text === 'string')
    .map((part) => part.text)
    .join('')
    .trim();
}

// The key is held in this closure and sent in a header, never in the URL, so it
// does not appear in logs or error messages.
/**
 * Creates a resilient Gemini API client with model pooling and cooldown management.
 * @param {{ apiKey?: string, models: string[], timeoutMs: number, fetchImpl?: typeof fetch, now?: () => number, logger?: object }} options
 * @returns {{ enabled: boolean, complete: Function, pool: object }}
 */
export function createGeminiClient({ apiKey, models, timeoutMs, fetchImpl = fetch, now = Date.now, logger }) {
  const enabled = typeof apiKey === 'string' && apiKey.length > 0 && models.length > 0;
  const pool = createModelPool({ models, now });

  async function callModel(model, { system, turns, maxTokens }) {
    const generationConfig = { maxOutputTokens: maxTokens, temperature: 0.7 };
    if (THINKING_CAN_BE_DISABLED.test(model)) generationConfig.thinkingConfig = { thinkingBudget: 0 };

    let response;
    try {
      response = await fetchImpl(`${BASE_URL}/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: turns.map((turn) => ({ role: turn.role, parts: [{ text: turn.text }] })),
          generationConfig,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new ModelSkipped('network', COOLDOWNS_MS.transient);
    }

    if (!response.ok) {
      const detail = await readErrorMessage(response);
      if ([400, 401, 403].includes(response.status) && /api key/i.test(detail)) {
        throw new AiUnavailableError('The Gemini API key was rejected.');
      }
      throw new ModelSkipped(`status ${response.status}`, cooldownFor(response.status, response));
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new ModelSkipped('unreadable response', COOLDOWNS_MS.other);
    }
    const text = extractText(payload);
    if (!text) throw new ModelSkipped('empty response', COOLDOWNS_MS.transient);
    return text;
  }

  // Returns { text, model }. `history` is earlier turns as { role, text }.
  async function complete({ system, prompt, history = [], maxTokens }) {
    if (!enabled) throw new AiUnavailableError('AI service is not configured.');

    const turns = normaliseTurns([...history, { role: 'user', text: prompt }]);
    const startedAt = now();
    for (const model of pool.order()) {
      if (now() - startedAt > timeoutMs * TOTAL_BUDGET_FACTOR) break;
      try {
        const text = await callModel(model, { system, turns, maxTokens });
        pool.clear(model);
        return { text, model };
      } catch (error) {
        if (!(error instanceof ModelSkipped)) throw error;
        pool.block(model, error.cooldownMs);
        logger?.warn('ai_model_skipped', { model, reason: error.message });
      }
    }
    throw new AiUnavailableError('No Gemini model is available right now.');
  }

  return { enabled, complete, pool };
}
