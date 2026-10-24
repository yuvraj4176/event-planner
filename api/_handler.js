// The API as Vercel serverless functions. Vercel serves the website from
// public/ itself, so only the API runs here. Each file in this folder re-exports
// this handler, and Vercel routes /api/<name> to api/<name>.js.
import { createGeminiClient } from '../src/ai/geminiClient.js';
import { createRequestHandler } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createLogger } from '../src/logger.js';

// Defaults suited to a serverless host. Anything set in the project's environment
// variables overrides the first two. The host check is left open because the
// site is reached by its public address, and the visitor's address is read from
// the header that Vercel sets.
const config = loadConfig({ AI_TIMEOUT_MS: '8000', TRUST_PROXY: 'true', ...process.env, HOST: '0.0.0.0' });
const logger = createLogger();

export default createRequestHandler({
  config,
  logger,
  aiClient: createGeminiClient({
    apiKey: config.geminiApiKey,
    models: config.geminiModels,
    timeoutMs: config.aiTimeoutMs,
    logger,
  }),
});
