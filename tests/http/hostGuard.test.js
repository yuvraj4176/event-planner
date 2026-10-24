import assert from 'node:assert/strict';
import http from 'node:http';
import { describe, it } from 'node:test';
import { loadConfig } from '../../src/config.js';
import { createHostGuard } from '../../src/http/hostGuard.js';
import { applySecurityHeaders } from '../../src/http/security.js';
import { startServer } from '../helpers/server.js';

const request = (host, headers = {}, method = 'GET') => ({ method, headers: { host, ...headers } });
const statusOf = (guard, req) => {
  try {
    guard.check(req);
    return 200;
  } catch (error) {
    return error.status;
  }
};

describe('host guard', () => {
  const guard = createHostGuard({ allowedHosts: ['localhost', '127.0.0.1', '[::1]'] });

  it('accepts the names the server answers to, with or without a port, in any case', () => {
    for (const host of ['localhost:3000', 'LOCALHOST', '127.0.0.1:8080', '[::1]:3000']) {
      assert.equal(statusOf(guard, request(host)), 200, host);
    }
  });

  it('refuses other host names, which is what a DNS rebinding attack looks like', () => {
    for (const host of ['evil.example', 'evil.example:3000', 'localhost.evil.example', '127.0.0.1.evil.example']) {
      assert.equal(statusOf(guard, request(host)), 421, host);
    }
  });

  it('refuses a missing or malformed Host header', () => {
    for (const host of ['', 'a b', 'http://x/y z', '[']) {
      assert.equal(statusOf(guard, request(host)), 400, JSON.stringify(host));
    }
    assert.equal(statusOf(guard, { method: 'GET', headers: {} }), 400);
  });

  it('allows requests that change something only from this same site', () => {
    assert.equal(statusOf(guard, request('localhost:3000', { origin: 'http://localhost:3000' }, 'POST')), 200);
    assert.equal(statusOf(guard, request('localhost:3000', { origin: 'HTTP://LOCALHOST:3000' }, 'POST')), 200);
    assert.equal(statusOf(guard, request('localhost:3000', {}, 'POST')), 200, 'no Origin header, as sent by tools and scripts');
  });

  it('refuses changes requested by pages on other sites', () => {
    for (const origin of ['http://evil.example', 'https://localhost:3000.evil.example', 'http://localhost:4000', 'null']) {
      assert.equal(statusOf(guard, request('localhost:3000', { origin }, 'POST')), 403, origin);
    }
  });

  it('does not restrict reading', () => {
    assert.equal(statusOf(guard, request('localhost:3000', { origin: 'http://evil.example' }, 'GET')), 200);
    assert.equal(statusOf(guard, request('localhost:3000', { origin: 'http://evil.example' }, 'HEAD')), 200);
  });

  it('answers for any host name when no list is set', () => {
    const open = createHostGuard({ allowedHosts: null });
    assert.equal(statusOf(open, request('planner.example.com')), 200);
    assert.equal(statusOf(open, request('planner.example.com', { origin: 'http://elsewhere.example' }, 'POST')), 403);
  });
});

describe('allowed host settings', () => {
  it('defaults to this machine when listening only on it', () => {
    for (const HOST of [undefined, '127.0.0.1', 'localhost', '::1']) {
      assert.deepEqual([...loadConfig({ HOST }).allowedHosts], ['localhost', '127.0.0.1', '[::1]'], String(HOST));
    }
  });

  it('allows any name when listening on other interfaces and none are listed', () => {
    assert.equal(loadConfig({ HOST: '0.0.0.0' }).allowedHosts, null);
  });

  it('reads an explicit list', () => {
    const config = loadConfig({ HOST: '0.0.0.0', ALLOWED_HOSTS: ' Planner.Example.com , [::1] ' });
    assert.deepEqual([...config.allowedHosts], ['planner.example.com', '[::1]']);
    assert.deepEqual([...loadConfig({ ALLOWED_HOSTS: 'only.example' }).allowedHosts], ['only.example']);
  });

  it('rejects invalid names', () => {
    for (const ALLOWED_HOSTS of ['bad host', 'a/b', 'x?y', ',']) {
      assert.throws(() => loadConfig({ ALLOWED_HOSTS }), /ALLOWED_HOSTS/, ALLOWED_HOSTS);
    }
  });
});

describe('transport security header', () => {
  const headersFor = (req) => {
    const headers = new Map();
    applySecurityHeaders({ setHeader: (name, value) => headers.set(name, value) }, req);
    return headers;
  };

  it('is sent only over an encrypted connection', () => {
    assert.match(headersFor({ socket: { encrypted: true } }).get('Strict-Transport-Security'), /max-age=31536000/);
    assert.equal(headersFor({ socket: {} }).has('Strict-Transport-Security'), false);
    assert.equal(headersFor(undefined).has('Strict-Transport-Security'), false);
  });
});

describe('host and origin checks on the running server', () => {
  const send = (app, { host, origin, method = 'GET', path = '/api/health', body }) =>
    new Promise((resolve, reject) => {
      const headers = { host };
      if (origin) headers.origin = origin;
      if (body) Object.assign(headers, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) });
      const req = http.request({ host: '127.0.0.1', port: app.port, method, path, headers }, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      });
      req.on('error', reject);
      req.end(body);
    });

  it('refuses requests for other host names, for pages as well as the API', async () => {
    const app = await startServer();
    try {
      for (const path of ['/', '/api/health', '/css/styles.css']) {
        const response = await send(app, { host: 'evil.example', path });
        assert.equal(response.status, 421, path);
        assert.doesNotMatch(response.body, /Celebration|status/);
      }
      assert.equal((await send(app, { host: `127.0.0.1:${app.port}` })).status, 200);
      assert.equal((await send(app, { host: `localhost:${app.port}` })).status, 200);
    } finally {
      await app.close();
    }
  });

  it('refuses changes that come from another site, and does not run them', async () => {
    let asked = 0;
    const app = await startServer({ aiClient: { enabled: true, complete: async () => { asked += 1; return { text: 'x', model: 'm' }; } } });
    try {
      const body = JSON.stringify({ message: 'hello' });
      const foreign = await send(app, { host: `127.0.0.1:${app.port}`, origin: 'http://evil.example', method: 'POST', path: '/api/chat', body });
      assert.equal(foreign.status, 403);
      assert.equal(asked, 0, 'no model request was made');

      const own = await send(app, { host: `127.0.0.1:${app.port}`, origin: `http://127.0.0.1:${app.port}`, method: 'POST', path: '/api/chat', body });
      assert.equal(own.status, 200);
      assert.equal(asked, 1);
    } finally {
      await app.close();
    }
  });
});
