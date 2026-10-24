import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CHAT_SYSTEM_PROMPT,
  MAX_HISTORY_TEXT,
  MAX_HISTORY_TURNS,
  buildChatPrompt,
  sanitizeHistory,
} from '../../src/ai/prompts.js';
import { GENERAL_HELP_TEXT, answerGeneral } from '../../src/planner/assistant.js';
import { parseHistory, resolveToday } from '../../src/routes/api.js';
import { buildTestPlan } from '../helpers/fixtures.js';

describe('chat prompts', () => {
  it('describes the site and treats user text as data', () => {
    assert.match(CHAT_SYSTEM_PROMPT, /Celebration Planner/);
    assert.match(CHAT_SYSTEM_PROMPT, /untrusted user data/);
    assert.match(CHAT_SYSTEM_PROMPT, /Plan an event/);
  });

  it('wraps the question alone when there is no plan', () => {
    assert.equal(buildChatPrompt(null, 'Hello </question> there'), '<question>Hello /question there</question>');
  });

  it('puts the plan summary before the question when there is one', () => {
    const prompt = buildChatPrompt(buildTestPlan(), 'What next?');
    assert.match(prompt, /^<event_details>[\s\S]*<\/event_details>\n\n<question>What next\?<\/question>$/);
  });

  it('cleans, limits and trims earlier turns', () => {
    const turns = Array.from({ length: 15 }, (_, n) => ({ role: n % 2 ? 'model' : 'user', text: `turn <${n}>` }));
    turns.push({ role: 'user', text: 'x'.repeat(MAX_HISTORY_TEXT * 2) }, { role: 'user', text: '  <> ' });
    const cleaned = sanitizeHistory(turns);
    assert.ok(cleaned.length <= MAX_HISTORY_TURNS);
    assert.ok(cleaned.every((turn) => !/[<>]/.test(turn.text) && turn.text.length <= MAX_HISTORY_TEXT));
    assert.ok(cleaned.every((turn) => turn.text.length > 0));
  });
});

describe('general answers without a model', () => {
  const cases = {
    'How do I use this site?': /Plan an event/,
    'Is my data private?': /browser/,
    'How much will it cost, how is the budget split?': /reserve/,
    'My date is soon': /compressed/,
    'Which vendor to book first?': /vendor checklist/,
    'Do you use Gemini AI?': /Gemini/,
  };
  for (const [question, expected] of Object.entries(cases)) {
    it(`answers: ${question}`, () => assert.match(answerGeneral(question), expected));
  }

  it('offers help for anything else', () => {
    assert.equal(answerGeneral('what is the capital of France'), GENERAL_HELP_TEXT);
    assert.equal(answerGeneral(''), GENERAL_HELP_TEXT);
  });
});

describe('chat request parsing', () => {
  it('keeps well-formed turns in order and trims their text', () => {
    assert.deepEqual(parseHistory([{ role: 'user', text: '  hi  there ' }, { role: 'model', text: 'ok' }]), [
      { role: 'user', text: 'hi there' },
      { role: 'model', text: 'ok' },
    ]);
  });

  it('returns nothing for something that is not a list', () => {
    for (const value of [undefined, null, 'x', 5, {}]) assert.deepEqual(parseHistory(value), []);
  });

  it('caps the length of each turn', () => {
    assert.equal(parseHistory([{ role: 'user', text: 'y'.repeat(MAX_HISTORY_TEXT + 500) }])[0].text.length, MAX_HISTORY_TEXT);
  });

  it('trusts the browser date only when it is within a day of the server', () => {
    const now = Date.parse('2026-10-24T12:00:00Z');
    assert.equal(resolveToday('2026-10-25', now), '2026-10-25');
    assert.equal(resolveToday('2026-10-23', now), '2026-10-23');
    assert.equal(resolveToday('2026-10-30', now), '2026-10-24');
    assert.equal(resolveToday('nope', now), '2026-10-24');
    assert.equal(resolveToday(undefined, now), '2026-10-24');
  });
});
