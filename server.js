/** @module server */
import { createApp } from './src/app.js';
import { createGeminiClient } from './src/ai/geminiClient.js';
import { loadConfig } from './src/config.js';
import { loadDotEnv } from './src/env.js';
import { createLogger } from './src/logger.js';

const SHUTDOWN_GRACE_MS = 5000;

const logger = createLogger();
loadDotEnv();

let config;
try {
  config = loadConfig();
} catch (error) {
  logger.error('invalid_configuration', { message: error.message });
  process.exit(1);
}
const aiClient = createGeminiClient({
  apiKey: config.geminiApiKey,
  models: config.geminiModels,
  timeoutMs: config.aiTimeoutMs,
  logger,
});

const server = await createApp({ config, aiClient, logger });

server.listen(config.port, config.host, () => {
  const { port } = server.address();
  logger.info('listening', { url: `http://${config.host}:${port}`, ai: aiClient.enabled, models: config.geminiModels });
});

function shutdown(signal) {
  logger.info('shutting_down', { signal });
  server.close(() => process.exit(0));
  server.closeIdleConnections();
  setTimeout(() => process.exit(1), SHUTDOWN_GRACE_MS).unref();
}

// A failure nobody handled leaves the program in an unknown state: log it and stop.
for (const event of ['uncaughtException', 'unhandledRejection']) {
  process.on(event, (error) => {
    logger.error('fatal', { event, message: error?.message, stack: error?.stack });
    process.exit(1);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
