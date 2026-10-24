import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Runs the real program in a separate process. An empty key is set on purpose:
// variables that are already set win over a local .env file.
function start(env = {}) {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: '0', HOST: '127.0.0.1', GEMINI_API_KEY: '', ...env },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  const lines = [];
  let buffer = '';
  child.stderr.on('data', (chunk) => {
    buffer += chunk;
    const parts = buffer.split('\n');
    buffer = parts.pop();
    lines.push(...parts.filter(Boolean).map((line) => JSON.parse(line)));
  });
  return { child, lines };
}

const waitFor = async (predicate, timeoutMs = 10_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = predicate();
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('Timed out waiting for the server');
};

describe('the server program', () => {
  it('starts, serves the site and the API, and logs in a structured way', async () => {
    const { child, lines } = start();
    try {
      const listening = await waitFor(() => lines.find((line) => line.event === 'listening'));
      assert.equal(listening.ai, false);
      assert.ok(listening.models.length >= 3);
      assert.match(listening.url, /^http:\/\/127\.0\.0\.1:\d+$/);

      const health = await fetch(`${listening.url}/api/health`);
      assert.deepEqual(await health.json(), { status: 'ok' });
      const page = await fetch(`${listening.url}/`);
      assert.match(await page.text(), /<title>(?:Celebration|Event) Planner/);
      assert.ok(!JSON.stringify(lines).includes('GEMINI_API_KEY'));
    } finally {
      child.kill();
      await once(child, 'exit');
    }
  });

  it('reports a configuration mistake clearly and stops', async () => {
    const { child } = start({ PORT: 'not-a-port' });
    let errors = '';
    child.stderr.on('data', (chunk) => { errors += chunk; });
    const [code] = await once(child, 'exit');
    assert.equal(code, 1);
    const [firstLine] = errors.trim().split(/\r?\n/);
    const entry = JSON.parse(firstLine);
    assert.equal(entry.event, 'invalid_configuration');
    assert.match(entry.message, /PORT must be an integer/);
    assert.doesNotMatch(errors, /at file:|node:internal/, 'no stack trace');
  });
});
