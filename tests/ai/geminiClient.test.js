import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AiUnavailableError,
  COOLDOWNS_MS,
  createGeminiClient,
  createModelPool,
  normaliseTurns,
} from '../../src/ai/geminiClient.js';

const SECRET = 'AIza-test-secret-value';
const MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash'];

const ok = (text) => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }) });
const fail = (status, message = 'Something failed', headers = {}) => ({
  ok: false,
  status,
  headers: new Headers(headers),
  json: async () => ({ error: { message } }),
});
const modelOf = (url) => /models\/([^:]+):/.exec(url)[1];

// A fake network: `behaviour` maps a model name to a response (or a function).
function network(behaviour) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    const model = modelOf(url);
    calls.push({ model, url, options });
    const result = typeof behaviour === 'function' ? behaviour(model, calls.length) : behaviour[model];
    if (result instanceof Error) throw result;
    return result ?? fail(500);
  };
  return { fetchImpl, calls, models: () => calls.map((call) => call.model) };
}

function clientWith(net, extra = {}) {
  return createGeminiClient({ apiKey: SECRET, models: MODELS, timeoutMs: 1000, fetchImpl: net.fetchImpl, ...extra });
}

const request = { system: 'sys', prompt: 'hello', maxTokens: 50 };

describe('createGeminiClient basics', () => {
  it('is disabled without a key or models and never touches the network', async () => {
    for (const options of [{ apiKey: '' }, { models: [] }]) {
      const net = network(() => ok('x'));
      const client = clientWith(net, options);
      assert.equal(client.enabled, false);
      await assert.rejects(client.complete(request), AiUnavailableError);
      assert.equal(net.calls.length, 0);
    }
  });

  it('sends the documented request and returns the text with the model that answered', async () => {
    const net = network({ 'gemini-2.5-flash': ok('Hi there') });
    const result = await clientWith(net).complete({ ...request, history: [{ role: 'user', text: 'earlier' }, { role: 'model', text: 'reply' }] });

    assert.deepEqual(result, { text: 'Hi there', model: 'gemini-2.5-flash' });
    const [{ url, options }] = net.calls;
    assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers['x-goog-api-key'], SECRET);
    assert.ok(!url.includes(SECRET), 'the key is sent in a header, never in the URL');
    assert.ok(options.signal);

    const body = JSON.parse(options.body);
    assert.deepEqual(body.systemInstruction, { parts: [{ text: 'sys' }] });
    assert.deepEqual(body.contents.map((turn) => [turn.role, turn.parts[0].text]), [
      ['user', 'earlier'],
      ['model', 'reply'],
      ['user', 'hello'],
    ]);
    assert.equal(body.generationConfig.maxOutputTokens, 50);
    assert.deepEqual(body.generationConfig.thinkingConfig, { thinkingBudget: 0 });
  });

  it('only turns thinking off for models that allow it', async () => {
    const net = network(() => ok('x'));
    await clientWith(net, { models: ['gemini-2.0-flash', 'gemini-2.5-pro'] }).complete(request);
    assert.equal(JSON.parse(net.calls[0].options.body).generationConfig.thinkingConfig, undefined);
  });

  it('joins text parts and ignores other parts', async () => {
    const net = network(() => ({
      ok: true,
      status: 200,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'One ' }, { inlineData: {} }, { text: 'two' }] } }] }),
    }));
    assert.equal((await clientWith(net).complete(request)).text, 'One two');
  });
});

describe('model failover', () => {
  it('moves to the next model when one is out of quota', async () => {
    const net = network({ 'gemini-2.5-flash': fail(429, 'quota'), 'gemini-2.5-flash-lite': ok('from lite') });
    const result = await clientWith(net).complete(request);
    assert.deepEqual(result, { text: 'from lite', model: 'gemini-2.5-flash-lite' });
    assert.deepEqual(net.models(), ['gemini-2.5-flash', 'gemini-2.5-flash-lite']);
  });

  for (const [label, response] of [
    ['an overloaded model (503)', fail(503)],
    ['a server error (500)', fail(500)],
    ['a retired model (404)', fail(404, 'model not found')],
    ['a rejected request for one model (400)', fail(400, 'thinking is not supported')],
    ['a forbidden model (403)', fail(403, 'model access denied')],
    ['a network failure', new TypeError('fetch failed')],
    ['an empty answer', ok('   ')],
    ['an unreadable answer', { ok: true, status: 200, json: async () => { throw new SyntaxError('bad'); } }],
    ['an answer with no candidates', { ok: true, status: 200, json: async () => ({ promptFeedback: { blockReason: 'OTHER' } }) }],
  ]) {
    it(`falls back after ${label}`, async () => {
      const net = network({ 'gemini-2.5-flash': response, 'gemini-2.5-flash-lite': ok('ok') });
      assert.equal((await clientWith(net).complete(request)).model, 'gemini-2.5-flash-lite');
    });
  }

  it('keeps going down the list until a model answers', async () => {
    const net = network({ 'gemini-2.5-flash': fail(429), 'gemini-2.5-flash-lite': fail(503), 'gemini-2.0-flash': ok('last one') });
    assert.deepEqual(await clientWith(net).complete(request), { text: 'last one', model: 'gemini-2.0-flash' });
  });

  it('skips an exhausted model on later requests and tries it again after the cooldown', async () => {
    let clock = 0;
    const net = network({ 'gemini-2.5-flash': fail(429), 'gemini-2.5-flash-lite': ok('lite'), 'gemini-2.0-flash': ok('older') });
    const client = clientWith(net, { now: () => clock });

    await client.complete(request);
    net.calls.length = 0;
    await client.complete(request);
    assert.deepEqual(net.models(), ['gemini-2.5-flash-lite'], 'the exhausted model is not retried straight away');

    clock += COOLDOWNS_MS.quota + 1;
    net.calls.length = 0;
    net.fetchImpl; // behaviour unchanged: the preferred model is still exhausted
    await client.complete(request);
    assert.equal(net.models()[0], 'gemini-2.5-flash', 'the preferred model is tried again after the cooldown');
  });

  it('returns to the preferred model once it recovers', async () => {
    let clock = 0;
    let recovered = false;
    const net = network((model) => (model === 'gemini-2.5-flash' ? (recovered ? ok('primary') : fail(429)) : ok('backup')));
    const client = clientWith(net, { now: () => clock });

    assert.equal((await client.complete(request)).model, 'gemini-2.5-flash-lite');
    recovered = true;
    clock += COOLDOWNS_MS.quota + 1;
    assert.equal((await client.complete(request)).model, 'gemini-2.5-flash');
    assert.equal(client.pool.isBlocked('gemini-2.5-flash'), false);
  });

  it('honours a Retry-After header', async () => {
    let clock = 0;
    const net = network({ 'gemini-2.5-flash': fail(429, 'slow down', { 'retry-after': '5' }), 'gemini-2.5-flash-lite': ok('ok') });
    const client = clientWith(net, { now: () => clock });
    await client.complete(request);
    clock = 4_000;
    assert.equal(client.pool.isBlocked('gemini-2.5-flash'), true);
    clock = 5_001;
    assert.equal(client.pool.isBlocked('gemini-2.5-flash'), false);
  });

  it('tries models even when all of them are cooling down, soonest to recover first', async () => {
    let clock = 0;
    const net = network({ 'gemini-2.5-flash': fail(404), 'gemini-2.5-flash-lite': fail(429), 'gemini-2.0-flash': fail(503) });
    const client = clientWith(net, { now: () => clock });
    await assert.rejects(client.complete(request), AiUnavailableError);

    net.calls.length = 0;
    await assert.rejects(client.complete(request), AiUnavailableError);
    assert.deepEqual(net.models(), ['gemini-2.0-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-flash']);
  });

  it('gives up with one error when every model fails, and logs each skip without secrets', async () => {
    const warnings = [];
    const net = network(() => fail(503, `leaked ${SECRET}`));
    const client = clientWith(net, { logger: { warn: (event, fields) => warnings.push({ event, fields }) } });

    await assert.rejects(client.complete(request), (error) => {
      assert.ok(error instanceof AiUnavailableError);
      assert.ok(!error.message.includes(SECRET));
      return true;
    });
    assert.equal(net.calls.length, MODELS.length);
    assert.deepEqual(warnings.map((entry) => entry.fields.model), MODELS);
    assert.ok(!JSON.stringify(warnings).includes(SECRET));
  });

  it('stops trying once the overall time budget is spent', async () => {
    let clock = 0;
    const net = network(() => {
      clock += 1500;
      return fail(503);
    });
    await assert.rejects(clientWith(net, { now: () => clock }).complete(request), AiUnavailableError);
    assert.equal(net.calls.length, 2, 'the third model is not attempted after the budget is exceeded');
  });

  it('stops immediately when the API key is rejected, because no model can help', async () => {
    for (const status of [400, 401, 403]) {
      const net = network(() => fail(status, 'API key not valid. Please pass a valid API key.'));
      await assert.rejects(clientWith(net).complete(request), /API key was rejected/);
      assert.equal(net.calls.length, 1, String(status));
    }
  });
});

describe('model pool and turns', () => {
  it('orders models by preference and sets blocked ones aside', () => {
    let clock = 0;
    const pool = createModelPool({ models: ['a', 'b', 'c'], now: () => clock });
    assert.deepEqual(pool.order(), ['a', 'b', 'c']);
    pool.block('a', 1000);
    assert.deepEqual(pool.order(), ['b', 'c']);
    clock = 1000;
    assert.deepEqual(pool.order(), ['a', 'b', 'c']);
    pool.block('b', 5000);
    pool.clear('b');
    assert.equal(pool.isBlocked('b'), false);
  });

  it('merges repeated roles and removes leading model turns', () => {
    assert.deepEqual(
      normaliseTurns([
        { role: 'model', text: 'greeting' },
        { role: 'user', text: 'one' },
        { role: 'user', text: 'two' },
        { role: 'model', text: 'answer' },
        { role: 'user', text: 'three' },
      ]),
      [
        { role: 'user', text: 'one\ntwo' },
        { role: 'model', text: 'answer' },
        { role: 'user', text: 'three' },
      ],
    );
    assert.deepEqual(normaliseTurns([]), []);
  });

  it('does not change the turns it was given', () => {
    const turns = [{ role: 'user', text: 'a' }, { role: 'user', text: 'b' }];
    normaliseTurns(turns);
    assert.equal(turns[0].text, 'a');
  });
});
