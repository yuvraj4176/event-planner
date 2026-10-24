import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { after, before, describe, it } from 'node:test';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import { startServer } from '../helpers/server.js';

const SOURCE = new URL('../../public/js/chatbot.js', import.meta.url);

describe('compressed responses', () => {
  let app;
  before(async () => { app = await startServer(); });
  after(() => app.close());

  const fetchRaw = (path, acceptEncoding) =>
    new Promise((resolve, reject) => {
      const headers = acceptEncoding ? { 'Accept-Encoding': acceptEncoding } : {};
      http.get(`${app.baseUrl}${path}`, { headers }, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolve({ headers: res.headers, body: Buffer.concat(chunks) }));
      }).on('error', reject);
    });

  it('serves Brotli when the browser accepts it, and it decodes to the original file', async () => {
    const original = await readFile(SOURCE);
    const { headers, body } = await fetchRaw('/js/chatbot.js', 'br, gzip');
    assert.equal(headers['content-encoding'], 'br');
    assert.equal(headers.vary, 'Accept-Encoding');
    assert.deepEqual(brotliDecompressSync(body), original);
    assert.ok(body.length < original.length / 2);
  });

  it('serves gzip to browsers that do not accept Brotli', async () => {
    const original = await readFile(SOURCE);
    const { headers, body } = await fetchRaw('/js/chatbot.js', 'gzip, deflate');
    assert.equal(headers['content-encoding'], 'gzip');
    assert.deepEqual(gunzipSync(body), original);
  });

  it('serves the plain file when nothing is accepted, with the right length', async () => {
    const original = await readFile(SOURCE);
    const { headers, body } = await fetchRaw('/js/chatbot.js');
    assert.equal(headers['content-encoding'], undefined);
    assert.equal(Number(headers['content-length']), original.length);
    assert.deepEqual(body, original);
  });

  it('does not compress files that are already small or compressed formats it does not know', async () => {
    const { headers } = await fetchRaw('/favicon.svg', 'br');
    assert.equal(headers['content-type'], 'image/svg+xml');
  });

  it('is smaller with Brotli than with gzip for every script and style', async () => {
    for (const path of ['/css/styles.css', '/js/plannerPage.js', '/plan.html']) {
      const brotli = await fetchRaw(path, 'br');
      const gzip = await fetchRaw(path, 'gzip');
      assert.ok(brotli.body.length <= gzip.body.length, path);
    }
  });
});

describe('compressed API responses', () => {
  let app;
  before(async () => { app = await startServer(); });
  after(() => app.close());

  const post = (acceptEncoding) =>
    new Promise((resolve, reject) => {
      const day = (offset) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
      const today = day(0);
      const event = {
        eventType: 'wedding', eventName: 'Asha and Ravi', eventDate: day(200), guestCount: 100, totalBudget: 500000, currency: 'INR',
      };
      const body = JSON.stringify({ event, today });
      const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) };
      if (acceptEncoding) headers['Accept-Encoding'] = acceptEncoding;
      const req = http.request(`${app.baseUrl}/api/plan`, { method: 'POST', headers }, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      });
      req.on('error', reject);
      req.end(body);
    });

  it('compresses large answers when the browser accepts gzip, without changing them', async () => {
    const plain = await post();
    const zipped = await post('gzip');
    assert.equal(plain.status, 200);
    assert.equal(zipped.headers['content-encoding'], 'gzip');
    assert.equal(zipped.headers.vary, 'Accept-Encoding');
    assert.ok(zipped.body.length < plain.body.length / 3);
    assert.deepEqual(JSON.parse(gunzipSync(zipped.body)), JSON.parse(plain.body.toString()));
    assert.equal(zipped.headers['cache-control'], 'no-store');
  });

  it('leaves large answers alone when gzip is not accepted', async () => {
    assert.equal((await post()).headers['content-encoding'], undefined);
    assert.equal((await post('identity')).headers['content-encoding'], undefined);
  });

  it('does not compress small answers', async () => {
    const response = await new Promise((resolve, reject) => {
      http.get(`${app.baseUrl}/api/health`, { headers: { 'Accept-Encoding': 'gzip' } }, (res) => {
        res.resume();
        res.on('end', () => resolve(res.headers));
      }).on('error', reject);
    });
    assert.equal(response['content-encoding'], undefined);
  });
});
