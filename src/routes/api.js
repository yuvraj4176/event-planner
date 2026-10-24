import { HttpError } from '../http/errors.js';
import { diffDays, parseIsoDate, todayIso } from '../planner/dates.js';
import { describeCurrencies, describeEventTypes, MAX_PRIORITIES } from '../planner/eventTypes.js';
import { planFromRequest } from '../planner/plan.js';
import { LIMITS, cleanText } from '../planner/validate.js';
import { MAX_HISTORY_TEXT, MAX_HISTORY_TURNS, MAX_QUESTION_LENGTH } from '../ai/prompts.js';

// The client sends its own calendar date so "today" matches the user's time
// zone. It is only trusted when it is within one day of the server's date.
export function resolveToday(candidate, nowMs) {
  const serverToday = todayIso(new Date(nowMs));
  const usable =
    typeof candidate === 'string' && parseIsoDate(candidate) && Math.abs(diffDays(serverToday, candidate)) <= 1;
  return usable ? candidate : serverToday;
}

function requirePlan(body, nowMs) {
  const today = resolveToday(body?.today, nowMs);
  const result = planFromRequest(body?.event, today);
  if (!result.ok) {
    throw new HttpError(400, 'Some event details need attention.', { details: { errors: result.errors } });
  }
  return { plan: result.plan, today };
}

function requireText(value, field) {
  const text = cleanText(value);
  if (text.length === 0 || text.length > MAX_QUESTION_LENGTH) {
    const message = `Enter a ${field} of up to ${MAX_QUESTION_LENGTH} characters.`;
    throw new HttpError(400, message, { details: { errors: [{ field, message }] } });
  }
  return text;
}

// Earlier chat turns, oldest first. Anything malformed is dropped rather than
// rejected, so a stale browser can never block the chat.
export function parseHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((turn) => turn && (turn.role === 'user' || turn.role === 'model') && typeof turn.text === 'string')
    .slice(-MAX_HISTORY_TURNS)
    .map((turn) => ({ role: turn.role, text: cleanText(turn.text).slice(0, MAX_HISTORY_TEXT) }))
    .filter((turn) => turn.text.length > 0);
}

// Each route is { method, path, limit, handler }. Handlers receive the parsed
// body and return a JSON-serialisable result.
export function createApiRoutes({ assistant, now = Date.now }) {
  return [
    {
      method: 'GET',
      path: '/api/health',
      limit: 'general',
      handler: () => ({ status: 'ok' }),
    },
    {
      method: 'GET',
      path: '/api/meta',
      limit: 'general',
      handler: () => ({
        eventTypes: describeEventTypes(),
        currencies: describeCurrencies(),
        maxPriorities: MAX_PRIORITIES,
        limits: {
          nameMax: LIMITS.nameMax,
          locationMax: LIMITS.locationMax,
          themeMax: LIMITS.themeMax,
          interestsMax: LIMITS.interestsMax,
          guestsMax: LIMITS.guestsMax,
          budgetMin: LIMITS.budgetMin,
          questionMax: MAX_QUESTION_LENGTH,
          historyMax: MAX_HISTORY_TURNS,
        },
        aiEnabled: assistant.enabled,
      }),
    },
    {
      method: 'POST',
      path: '/api/plan',
      limit: 'general',
      handler: ({ body }) => ({ plan: requirePlan(body, now()).plan }),
    },
    {
      method: 'POST',
      path: '/api/ideas',
      limit: 'ai',
      handler: async ({ body }) => {
        const { plan } = requirePlan(body, now());
        return { ideas: await assistant.generateIdeas(plan) };
      },
    },
    {
      method: 'POST',
      path: '/api/ask',
      limit: 'ai',
      handler: async ({ body }) => {
        const { plan, today } = requirePlan(body, now());
        const question = requireText(body?.question, 'question');
        return assistant.answerQuestion(plan, question, today);
      },
    },
    {
      method: 'POST',
      path: '/api/chat',
      limit: 'ai',
      handler: ({ body }) => {
        const message = requireText(body?.message, 'message');
        // The saved plan is optional context: a missing or stale one is ignored.
        const today = resolveToday(body?.today, now());
        const planned = body?.event === undefined ? null : planFromRequest(body.event, today);
        return assistant.chat({
          plan: planned?.ok ? planned.plan : null,
          message,
          history: parseHistory(body?.history),
          today,
        });
      },
    },
  ];
}
