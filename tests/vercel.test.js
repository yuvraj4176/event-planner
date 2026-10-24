import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { SECURITY_HEADERS } from '../src/http/security.js';
import { createApiRoutes } from '../src/routes/api.js';
import { addDays, todayIso } from '../src/planner/dates.js';
import { validInput } from './helpers/fixtures.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...segments) => readFileSync(path.join(ROOT, ...segments), 'utf8');
const vercel = JSON.parse(read('vercel.json'));

// The functions read their settings when they are first loaded, as they do on Vercel.
process.env.GEMINI_API_KEY = '';
process.env.RATE_LIMIT_MAX = '5';
process.env.MAX_BODY_BYTES = '32768';
delete process.env.ALLOWED_HOSTS;
const { default: handler } = await import('../api/_handler.js');

const apiPaths = createApiRoutes({ assistant: { enabled: false } }).map((route) => route.path);

describe('Vercel project settings', () => {
  it('serves the website from public and needs no build step', () => {
    assert.equal(vercel.outputDirectory, 'public');
    assert.equal(vercel.framework, null);
    assert.equal(vercel.buildCommand, null);
    assert.equal(vercel.installCommand, null, 'there is nothing to install');
    assert.ok(existsSync(path.join(ROOT, 'public', 'index.html')));
  });

  it('sends the same security headers as the server does, so deployed pages are just as protected', () => {
    const everything = vercel.headers.find((rule) => rule.source === '/(.*)');
    const sent = Object.fromEntries(everything.headers.map(({ key, value }) => [key, value]));
    assert.deepEqual(sent, { ...SECURITY_HEADERS });
  });

  it('never caches API answers', () => {
    const api = vercel.headers.find((rule) => rule.source === '/api/(.*)');
    assert.deepEqual(api.headers, [{ key: 'Cache-Control', value: 'no-store' }]);
  });

  it('allows enough time for the model chain without outlasting the function limit', () => {
    const { maxDuration } = vercel.functions['api/*.js'];
    const timeout = Number(/AI_TIMEOUT_MS: '(\d+)'/.exec(read('api', '_handler.js'))[1]);
    assert.ok(maxDuration <= 60, 'within what the free plan allows');
    assert.ok((timeout * 2) / 1000 < maxDuration, 'the time budget for trying models fits inside the limit');
  });

  it('keeps secrets, tests and tooling out of the upload', () => {
    const ignored = read('.vercelignore').split(/\r?\n/);
    for (const entry of ['.env', '.env.*', 'tests', 'scripts', 'node_modules', 'coverage']) {
      assert.ok(ignored.includes(entry), entry);
    }
    assert.ok(ignored.includes('!.env.example'));
    assert.ok(!ignored.includes('src') && !ignored.includes('public') && !ignored.includes('api'));
  });
});

describe('serverless functions', () => {
  it('has one function for every API route, and nothing else is routed', () => {
    const files = apiPaths.map((route) => route.replace('/api/', 'api/') + '.js').sort();
    for (const file of files) assert.ok(existsSync(path.join(ROOT, file)), file);
    assert.deepEqual(files, ['api/ask.js', 'api/chat.js', 'api/health.js', 'api/ideas.js', 'api/meta.js', 'api/plan.js']);
  });

  it('shares one handler between them, and its helper file is not routed', async () => {
    for (const route of apiPaths) {
      const file = route.replace('/api/', '');
      assert.equal(read('api', `${file}.js`), "export { default } from './_handler.js';\n");
      assert.equal((await import(`../api/${file}.js`)).default, handler);
    }
    assert.equal(typeof handler, 'function');
    assert.ok(path.basename('api/_handler.js').startsWith('_'), 'files starting with an underscore are not turned into functions');
  });
});

describe('the API running the way Vercel runs it', () => {
  let server;
  let port;
  before(async () => {
    server = http.createServer(handler);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = server.address().port;
  });
  after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));

  const send = ({ method = 'GET', path: target, headers = {}, body }) =>
    new Promise((resolve, reject) => {
      const all = { host: 'planner.vercel.app', 'x-forwarded-for': '203.0.113.1', ...headers };
      if (body !== undefined) Object.assign(all, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) });
      const req = http.request({ host: '127.0.0.1', port, method, path: target, headers: all }, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
      });
      req.on('error', reject);
      req.end(body);
    });

  const planBody = () =>
    JSON.stringify({ event: validInput({ eventDate: addDays(todayIso(), 200) }), today: todayIso() });

  it('answers on the public host name with the security headers', async () => {
    const response = await send({ path: '/api/health', headers: { 'x-forwarded-for': '203.0.113.10' } });
    assert.equal(response.status, 200);
    assert.deepEqual(JSON.parse(response.body), { status: 'ok' });
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) assert.equal(response.headers[name.toLowerCase()], value, name);
    assert.equal(response.headers['cache-control'], 'no-store');
  });

  it('reports the settings, with Gemini off when no key is configured', async () => {
    const { body } = await send({ path: '/api/meta', headers: { 'x-forwarded-for': '203.0.113.11' } });
    assert.equal(JSON.parse(body).aiEnabled, false);
  });

  it('builds a plan for a request from the site itself', async () => {
    const response = await send({
      method: 'POST',
      path: '/api/plan',
      headers: { origin: 'https://planner.vercel.app', 'x-forwarded-for': '203.0.113.12' },
      body: planBody(),
    });
    assert.equal(response.status, 200);
    assert.equal(JSON.parse(response.body).plan.input.eventName, 'Asha and Ravi');
  });

  it('answers a chat message with the built-in assistant when there is no key', async () => {
    const response = await send({
      method: 'POST',
      path: '/api/chat',
      headers: { 'x-forwarded-for': '203.0.113.13' },
      body: JSON.stringify({ message: 'How do I start?' }),
    });
    assert.equal(JSON.parse(response.body).source, 'builtin');
  });

  it('refuses changes requested by other websites', async () => {
    const response = await send({
      method: 'POST',
      path: '/api/chat',
      headers: { origin: 'https://evil.example', 'x-forwarded-for': '203.0.113.14' },
      body: JSON.stringify({ message: 'hello' }),
    });
    assert.equal(response.status, 403);
  });

  it('rate limits each visitor separately, using the address Vercel forwards', async () => {
    const hit = (address) => send({ path: '/api/health', headers: { 'x-forwarded-for': address } });
    const statuses = [];
    for (let n = 0; n < 7; n += 1) statuses.push((await hit('198.51.100.1')).status);
    assert.deepEqual(statuses, [200, 200, 200, 200, 200, 429, 429]);
    assert.equal((await hit('198.51.100.2')).status, 200, 'another visitor is not affected');
    assert.equal((await hit('198.51.100.1, 10.0.0.1')).status, 429, 'the first address in the list is the visitor');
  });

  it('does not serve pages itself, because Vercel serves them', async () => {
    const response = await send({ path: '/plan.html', headers: { 'x-forwarded-for': '203.0.113.15' } });
    assert.equal(response.status, 404);
    assert.deepEqual(JSON.parse(response.body), { error: { message: 'Not found.' } });
  });

  it('keeps wrong methods and bad input as clear errors', async () => {
    const wrongMethod = await send({ path: '/api/plan', headers: { 'x-forwarded-for': '203.0.113.16' } });
    assert.equal(wrongMethod.status, 405);
    const invalid = await send({ method: 'POST', path: '/api/plan', headers: { 'x-forwarded-for': '203.0.113.17' }, body: '{"event":{}}' });
    assert.equal(invalid.status, 400);
  });
});
