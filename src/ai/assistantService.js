import { answerGeneral, answerLocally } from '../planner/assistant.js';
import { selectIdeas } from '../planner/ideas.js';
import { getEventType } from '../planner/eventTypes.js';
import {
  ASK_SYSTEM_PROMPT,
  CHAT_SYSTEM_PROMPT,
  IDEAS_SYSTEM_PROMPT,
  buildAskPrompt,
  buildChatPrompt,
  buildIdeasPrompt,
  cleanAnswer,
  parseIdeasResponse,
  sanitizeHistory,
} from './prompts.js';
import { createTtlCache } from './cache.js';

const IDEAS_MAX_TOKENS = 1200;
const ANSWER_MAX_TOKENS = 600;
const CACHE_MAX_ENTRIES = 100;
const CACHE_TTL_MS = 10 * 60 * 1000;

// Combines the Gemini client with the built-in planner. Every method returns a
// usable result: when no model can answer, or an answer is unusable, the
// built-in planner answers instead and `source` says which one did.
export function createAssistantService({ aiClient, logger, now = Date.now }) {
  const ideasCache = createTtlCache({ maxEntries: CACHE_MAX_ENTRIES, ttlMs: CACHE_TTL_MS, now });

  async function tryAi(request) {
    if (!aiClient.enabled) return null;
    try {
      return await aiClient.complete(request);
    } catch (error) {
      logger.warn('ai_request_failed', { reason: error.message });
      return null;
    }
  }

  async function generateIdeas(plan) {
    const cacheKey = JSON.stringify(plan.input);
    const cached = ideasCache.get(cacheKey);
    if (cached) return cached;

    const reply = await tryAi({
      system: IDEAS_SYSTEM_PROMPT,
      prompt: buildIdeasPrompt(plan),
      maxTokens: IDEAS_MAX_TOKENS,
    });
    const aiIdeas = reply ? parseIdeasResponse(reply.text) : [];

    if (aiIdeas.length > 0) {
      const result = { source: 'ai', model: reply.model, items: aiIdeas };
      ideasCache.set(cacheKey, result);
      return result;
    }
    const definition = getEventType(plan.input.eventType);
    return { source: 'builtin', items: selectIdeas(definition, plan.input) };
  }

  async function answerQuestion(plan, question, today) {
    const reply = await tryAi({
      system: ASK_SYSTEM_PROMPT,
      prompt: buildAskPrompt(plan, question),
      maxTokens: ANSWER_MAX_TOKENS,
    });
    if (reply) return { source: 'ai', model: reply.model, answer: cleanAnswer(reply.text) };
    return { source: 'builtin', answer: answerLocally(question, plan, today) };
  }

  // The floating chat assistant. `plan` is null when the visitor has no saved plan.
  async function chat({ plan, message, history, today }) {
    const reply = await tryAi({
      system: CHAT_SYSTEM_PROMPT,
      prompt: buildChatPrompt(plan, message),
      history: sanitizeHistory(history),
      maxTokens: ANSWER_MAX_TOKENS,
    });
    if (reply) return { source: 'ai', model: reply.model, answer: cleanAnswer(reply.text) };
    const answer = plan ? answerLocally(message, plan, today) : answerGeneral(message);
    return { source: 'builtin', answer };
  }

  return { enabled: aiClient.enabled, generateIdeas, answerQuestion, chat };
}
