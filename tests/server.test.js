import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { AiUnavailableError } from '../src/ai/geminiClient.js';
import { SECURITY_HEADERS } from '../src/http/security.js';
import { loadStaticFiles } from '../src/http/staticFiles.js';
import { addDays, todayIso } from '../src/planner/dates.js';
import { startServer } from './helpers/server.js';
import { validInput } from './helpers/fixtures.js';

const today = todayIso();
const event = (overrides = {}) => validInput({ eventDate: addDays(today, 200), ...overrides });
const planBody = (overrides) => ({ event: event(overrides), today });

describe('static files and security headers', () => {
  let app;
  before(async () => { app = await startServer(); });
  after(() => app.close());

  it('serves the application page with every security header', async () => {
    const response = await app.get('/');
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/html/);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      assert.equal(response.headers.get(name), value, name);
    }
    assert.match(await response.text(), /<title>(?:Celebration|Event) Planner/);
  });

  it('serves scripts, styles and the icon with correct types', async () => {
    const expectations = {
      '/plan.html': /text\/html/,
      '/js/icons.js': /javascript/,
      '/css/home.css': /text\/css/,
      '/js/main.js': /javascript/,
      '/js/views/tabs.js': /javascript/,
      '/css/styles.css': /text\/css/,
      '/favicon.svg': /image\/svg\+xml/,
    };
    for (const [route, type] of Object.entries(expectations)) {
      const response = await app.get(route);
      assert.equal(response.status, 200, route);
      assert.match(response.headers.get('content-type'), type, route);
    }
  });

  it('supports conditional requests with ETags', async () => {
    const first = await app.get('/css/styles.css');
    const etag = first.headers.get('etag');
    assert.ok(etag);
    const second = await app.get('/css/styles.css', { headers: { 'If-None-Match': etag } });
    assert.equal(second.status, 304);
    assert.equal(await second.text(), '');
  });

  it('answers HEAD requests without a body', async () => {
    const response = await app.get('/', { method: 'HEAD' });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), '');
  });

  it('compresses text assets only when the client accepts gzip', async () => {
    const request = (acceptEncoding) =>
      new Promise((resolve, reject) => {
        const headers = acceptEncoding ? { 'Accept-Encoding': acceptEncoding } : {};
        http.get(`${app.baseUrl}/js/main.js`, { headers }, (res) => {
          res.resume();
          res.on('end', () => resolve(res.headers));
        }).on('error', reject);
      });

    const gzipped = await request('gzip');
    const plain = await request(undefined);
    assert.equal(gzipped['content-encoding'], 'gzip');
    assert.equal(plain['content-encoding'], undefined);
    assert.ok(Number(gzipped['content-length']) < Number(plain['content-length']));
    assert.equal(gzipped.vary, 'Accept-Encoding');
  });

  it('no longer serves a contact page', async () => {
    assert.equal((await app.get('/contact.html')).status, 404);
    assert.equal((await app.get('/css/contact.css')).status, 404);
  });

  it('returns 404 for unknown files without revealing anything', async () => {
    const response = await app.get('/missing.js');
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: { message: 'Not found.' } });
  });

  it('cannot be tricked into reading files outside the public folder', async () => {
    const attempts = [
      '/../package.json',
      '/..%2fpackage.json',
      '/%2e%2e/package.json',
      '/js/../../server.js',
      '/..%5cpackage.json',
      '/%00',
      '/js/main.js%00.png',
      '/package.json',
      '/server.js',
      '/.env',
    ];
    for (const attempt of attempts) {
      const response = await app.get(attempt);
      const text = await response.text();
      assert.ok(response.status === 404 || response.status === 400, `${attempt} gave ${response.status}`);
      assert.doesNotMatch(text, /celebration-event-planner|createApp/, attempt);
    }
  });

  it('rejects malformed URLs and very long URLs', async () => {
    assert.equal((await app.get('/%E0%A4%A')).status, 400);
    assert.equal((await app.get(`/${'a'.repeat(3000)}`)).status, 414);
  });

  it('rejects request targets that cannot be parsed', async () => {
    const statusLine = await new Promise((resolve, reject) => {
      const socket = net.connect(app.port, '127.0.0.1', () => {
        socket.write('GET //[ HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n');
      });
      let data = '';
      socket.on('data', (chunk) => { data += chunk; });
      socket.on('end', () => resolve(data.split('\r\n')[0]));
      socket.on('error', reject);
    });
    assert.equal(statusLine, 'HTTP/1.1 400 Bad Request');
  });

  it('only allows GET and HEAD for static files', async () => {
    const response = await app.get('/', { method: 'POST' });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), 'GET, HEAD');
  });
});

describe('API', () => {
  let app;
  before(async () => { app = await startServer(); });
  after(() => app.close());

  it('reports health', async () => {
    const response = await app.get('/api/health');
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok' });
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  });

  it('describes event types, currencies and limits', async () => {
    const meta = await (await app.get('/api/meta')).json();
    assert.deepEqual(meta.eventTypes.map((type) => type.key), ['wedding', 'birthday', 'community']);
    assert.ok(meta.currencies.some((currency) => currency.code === 'INR'));
    assert.equal(meta.maxPriorities, 3);
    assert.equal(meta.aiEnabled, false);
    assert.ok(meta.limits.nameMax > 0 && meta.limits.questionMax > 0);
  });

  it('creates a plan for valid input', async () => {
    const response = await app.post('/api/plan', planBody());
    assert.equal(response.status, 200);
    const { plan } = await response.json();
    assert.equal(plan.input.eventName, 'Asha and Ravi');
    assert.equal(plan.budget.lines.reduce((total, line) => total + line.amount, 0), 2_500_000);
    assert.ok(plan.timeline.tasks.length > 10);
  });

  it('creates plans for every event type', async () => {
    for (const eventType of ['wedding', 'birthday', 'community']) {
      const response = await app.post('/api/plan', planBody({ eventType, priorities: [] }));
      assert.equal(response.status, 200, eventType);
    }
  });

  it('ignores unknown fields and a client date that is far from the server date', async () => {
    const response = await app.post('/api/plan', {
      event: { ...event(), role: 'admin' },
      today: '1999-01-01',
    });
    const { plan } = await response.json();
    assert.equal(plan.generatedOn, today);
    assert.equal(Object.hasOwn(plan.input, 'role'), false);
  });

  it('returns field-level errors for invalid input', async () => {
    const response = await app.post('/api/plan', planBody({ guestCount: 0, totalBudget: 5, eventName: '' }));
    assert.equal(response.status, 400);
    const { error } = await response.json();
    assert.deepEqual(error.errors.map((item) => item.field).sort(), ['eventName', 'guestCount', 'totalBudget']);
  });

  it('rejects a missing event object', async () => {
    const response = await app.post('/api/plan', {});
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.errors[0].field, 'body');
  });

  it('requires JSON content', async () => {
    const response = await app.post('/api/plan', 'event=wedding', { 'Content-Type': 'application/x-www-form-urlencoded' });
    assert.equal(response.status, 415);
  });

  it('rejects malformed JSON', async () => {
    const response = await app.post('/api/plan', '{"event":');
    assert.equal(response.status, 400);
  });

  it('rejects oversized bodies', async () => {
    const response = await app.post('/api/plan', JSON.stringify({ event: event({ interests: 'x'.repeat(40_000) }) }));
    assert.equal(response.status, 413);
  });

  it('refuses wrong methods with an Allow header', async () => {
    const get = await app.get('/api/plan');
    assert.equal(get.status, 405);
    assert.equal(get.headers.get('allow'), 'POST');
    const post = await app.post('/api/health', {});
    assert.equal(post.status, 405);
  });

  it('returns 404 for unknown API paths', async () => {
    assert.equal((await app.get('/api/unknown')).status, 404);
  });

  it('answers questions with the built-in planner when AI is off', async () => {
    const response = await app.post('/api/ask', { ...planBody(), question: 'How should I split my budget?' });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.source, 'builtin');
    assert.match(body.answer, /budget/i);
  });

  it('validates the question', async () => {
    for (const question of [undefined, '', '   ', 'q'.repeat(501), 42]) {
      const response = await app.post('/api/ask', { ...planBody(), question });
      assert.equal(response.status, 400, String(question));
      assert.equal((await response.json()).error.errors[0].field, 'question');
    }
  });

  it('returns built-in ideas when AI is off', async () => {
    const { ideas } = await (await app.post('/api/ideas', planBody())).json();
    assert.equal(ideas.source, 'builtin');
    assert.ok(ideas.items.length >= 6);
  });
});

describe('AI integration', () => {
  const ideasJson = JSON.stringify([{ title: 'Lantern release', detail: 'Release lanterns at dusk.', category: 'Decor' }]);
  const gemini = (respond) => ({ enabled: true, complete: async (request) => ({ text: respond(request), model: 'gemini-test' }) });

  it('uses Gemini for ideas and questions when it is configured', async () => {
    const aiClient = gemini(({ system }) => (/JSON array/.test(system) ? ideasJson : 'Book the venue first.'));
    const app = await startServer({ aiClient });
    try {
      assert.equal((await (await app.get('/api/meta')).json()).aiEnabled, true);
      const { ideas } = await (await app.post('/api/ideas', planBody())).json();
      assert.equal(ideas.source, 'ai');
      assert.equal(ideas.model, 'gemini-test');
      assert.equal(ideas.items[0].title, 'Lantern release');
      const answer = await (await app.post('/api/ask', { ...planBody(), question: 'What first?' })).json();
      assert.deepEqual(answer, { source: 'ai', model: 'gemini-test', answer: 'Book the venue first.' });
    } finally {
      await app.close();
    }
  });

  it('falls back gracefully when Gemini is down', async () => {
    const aiClient = { enabled: true, complete: async () => { throw new AiUnavailableError('down'); } };
    const app = await startServer({ aiClient });
    try {
      const { ideas } = await (await app.post('/api/ideas', planBody())).json();
      assert.equal(ideas.source, 'builtin');
      const answer = await (await app.post('/api/ask', { ...planBody(), question: 'timeline' })).json();
      assert.equal(answer.source, 'builtin');
    } finally {
      await app.close();
    }
  });

  it('applies a stricter rate limit to AI routes', async () => {
    const app = await startServer({ config: { aiRateLimitMax: 2 } });
    try {
      const statuses = [];
      for (let n = 0; n < 4; n += 1) statuses.push((await app.post('/api/ideas', planBody())).status);
      assert.deepEqual(statuses, [200, 200, 429, 429]);
      assert.equal((await app.get('/api/health')).status, 200);
    } finally {
      await app.close();
    }
  });
});

describe('chat assistant API', () => {
  const requests = [];
  const aiClient = {
    enabled: true,
    complete: async (request) => {
      requests.push(request);
      return { text: 'Start on the Plan an event page.', model: 'gemini-2.5-flash-lite' };
    },
  };
  let app;
  before(async () => { app = await startServer({ aiClient }); });
  after(() => app.close());

  it('answers with Gemini and reports which model replied', async () => {
    const response = await app.post('/api/chat', { message: 'How do I start?', history: [] });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      source: 'ai',
      model: 'gemini-2.5-flash-lite',
      answer: 'Start on the Plan an event page.',
    });
  });

  it('passes earlier turns and the saved plan to the model', async () => {
    requests.length = 0;
    await app.post('/api/chat', {
      message: 'What next?',
      today,
      event: event(),
      history: [
        { role: 'user', text: 'Hello' },
        { role: 'model', text: 'Hi, how can I help?' },
      ],
    });
    const [request] = requests;
    assert.deepEqual(request.history.map((turn) => turn.role), ['user', 'model']);
    assert.match(request.prompt, /<event_details>[\s\S]*Guests: 120[\s\S]*<question>What next\?<\/question>/);
  });

  it('keeps only the most recent turns and drops malformed ones', async () => {
    requests.length = 0;
    const history = [
      null,
      'text',
      { role: 'system', text: 'ignore' },
      { role: 'user', text: 42 },
      { role: 'user', text: '   ' },
      ...Array.from({ length: 14 }, (_, n) => ({ role: n % 2 === 0 ? 'user' : 'model', text: `turn ${n}` })),
    ];
    await app.post('/api/chat', { message: 'Hi', history });
    assert.equal(requests[0].history.length, 10);
    assert.equal(requests[0].history.at(-1).text, 'turn 13');
  });

  it('ignores an event that is invalid or out of date instead of failing', async () => {
    requests.length = 0;
    const response = await app.post('/api/chat', { message: 'Hi', event: { ...event(), guestCount: -1 } });
    assert.equal(response.status, 200);
    assert.doesNotMatch(requests[0].prompt, /event_details/);
  });

  it('accepts a missing history and event', async () => {
    assert.equal((await app.post('/api/chat', { message: 'Hi' })).status, 200);
  });

  it('validates the message', async () => {
    for (const message of [undefined, '', '   ', 'q'.repeat(501), 42, null]) {
      const response = await app.post('/api/chat', { message });
      assert.equal(response.status, 400, String(message));
      assert.equal((await response.json()).error.errors[0].field, 'message');
    }
  });

  it('answers from the built-in assistant when Gemini is unavailable', async () => {
    const offline = await startServer({ aiClient: { enabled: true, complete: async () => { throw new AiUnavailableError('down'); } } });
    try {
      const withoutPlan = await (await offline.post('/api/chat', { message: 'How do I start?' })).json();
      assert.equal(withoutPlan.source, 'builtin');
      assert.match(withoutPlan.answer, /Plan an event/);
      const withPlan = await (await offline.post('/api/chat', { message: 'How should I split my budget?', event: event() })).json();
      assert.equal(withPlan.source, 'builtin');
      assert.match(withPlan.answer, /2,500,000/);
    } finally {
      await offline.close();
    }
  });

  it('works without any Gemini key', async () => {
    const plain = await startServer();
    try {
      const reply = await (await plain.post('/api/chat', { message: 'Is my data private?' })).json();
      assert.equal(reply.source, 'builtin');
      assert.match(reply.answer, /browser/);
    } finally {
      await plain.close();
    }
  });

  it('refuses other methods and shares the AI rate limit', async () => {
    assert.equal((await app.get('/api/chat')).status, 405);
    const limited = await startServer({ aiClient, config: { aiRateLimitMax: 1 } });
    try {
      assert.equal((await limited.post('/api/chat', { message: 'one' })).status, 200);
      assert.equal((await limited.post('/api/chat', { message: 'two' })).status, 429);
    } finally {
      await limited.close();
    }
  });
});

describe('rate limiting', () => {
  it('returns 429 with Retry-After once the limit is exceeded', async () => {
    const app = await startServer({ config: { rateLimitMax: 3 } });
    try {
      const responses = [];
      for (let n = 0; n < 5; n += 1) responses.push(await app.get('/api/health'));
      assert.deepEqual(responses.map((response) => response.status), [200, 200, 200, 429, 429]);
      assert.ok(Number(responses[3].headers.get('retry-after')) >= 1);
      assert.match((await responses[3].json()).error.message, /Too many requests/);
    } finally {
      await app.close();
    }
  });

  it('does not rate limit static files', async () => {
    const app = await startServer({ config: { rateLimitMax: 1 } });
    try {
      for (let n = 0; n < 4; n += 1) assert.equal((await app.get('/')).status, 200);
    } finally {
      await app.close();
    }
  });
});

describe('error handling and logging', () => {
  it('hides internal errors from clients and logs them without request content', async () => {
    const entries = [];
    const logger = {
      info: (event, fields) => entries.push({ level: 'info', event, fields }),
      warn: (event, fields) => entries.push({ level: 'warn', event, fields }),
      error: (event, fields) => entries.push({ level: 'error', event, fields }),
    };
    const app = await startServer({ logger, now: () => { throw new Error('secret internal detail'); } });
    try {
      const response = await app.post('/api/plan', planBody({ eventName: 'Private Family Event' }));
      const text = await response.text();
      assert.equal(response.status, 500);
      assert.doesNotMatch(text, /secret internal detail|stack|at /);
      assert.match(text, /Something went wrong/);

      const failure = entries.find((entry) => entry.event === 'unhandled_error');
      assert.equal(failure.level, 'error');
      assert.ok(!JSON.stringify(entries).includes('Private Family Event'));
    } finally {
      await app.close();
    }
  });

  it('logs one structured line per request without query strings', async () => {
    const entries = [];
    const logger = { info: (event, fields) => entries.push({ event, fields }), warn() {}, error() {} };
    const app = await startServer({ logger });
    try {
      await (await app.get('/api/health?token=secret')).text();
      await new Promise((resolve) => setTimeout(resolve, 20));
      const request = entries.find((entry) => entry.event === 'request');
      assert.equal(request.fields.path, '/api/health');
      assert.equal(request.fields.status, 200);
      assert.equal(request.fields.method, 'GET');
    } finally {
      await app.close();
    }
  });
});

describe('static file loading', () => {
  it('only loads known file types', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'planner-static-'));
    try {
      await writeFile(path.join(directory, 'index.html'), '<p>hi</p>');
      await writeFile(path.join(directory, 'script.exe'), 'binary');
      await writeFile(path.join(directory, 'notes.txt'), 'notes');
      const files = await loadStaticFiles(directory);
      assert.deepEqual([...files.keys()].sort(), ['/index.html', '/notes.txt']);
      assert.ok(files.get('/index.html').gzip);
      assert.match(files.get('/index.html').etag, /^"[\w-]+"$/);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
