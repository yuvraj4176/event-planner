import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';
import { silentLogger } from '../../src/logger.js';

export const disabledAi = { enabled: false, async complete() { throw new Error('not configured'); } };

// Starts the real application on a random port and returns helpers for tests.
export async function startServer({ config = {}, aiClient = disabledAi, logger = silentLogger, ...options } = {}) {
  const server = await createApp({
    config: { ...loadConfig({}), ...config },
    aiClient,
    logger,
    ...options,
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  return {
    baseUrl,
    port,
    async close() {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
    get: (path, init) => fetch(`${baseUrl}${path}`, init),
    post: (path, body, headers = { 'Content-Type': 'application/json' }) =>
      fetch(`${baseUrl}${path}`, { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) }),
  };
}
