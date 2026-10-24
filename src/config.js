// Gemini models to try, in order of preference. When one is out of quota,
// overloaded or retired, the next one is used automatically.
export const DEFAULT_GEMINI_MODELS = Object.freeze([
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-2.5-pro',
]);

const MODEL_NAME = /^[a-z0-9][a-z0-9.-]{1,60}$/;
const HOST_NAME = /^(?:[a-z0-9.-]{1,253}|\[[0-9a-f:]{2,45}\])$/i;
const LOOPBACK_ADDRESSES = ['localhost', '127.0.0.1', '::1'];
const LOOPBACK_HOST_NAMES = Object.freeze(['localhost', '127.0.0.1', '[::1]']);

function readInteger(env, name, fallback, min, max) {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  }
  return value;
}

function readModels(env) {
  const raw = env.GEMINI_MODELS;
  if (raw === undefined || raw.trim() === '') return DEFAULT_GEMINI_MODELS;
  const models = [...new Set(raw.split(',').map((name) => name.trim()).filter(Boolean))];
  if (models.length === 0 || models.some((name) => !MODEL_NAME.test(name))) {
    throw new Error('GEMINI_MODELS must be a comma separated list of model names such as gemini-2.5-flash.');
  }
  return Object.freeze(models);
}

function readFlag(env, name) {
  const raw = (env[name] ?? '').trim().toLowerCase();
  if (raw === '' || raw === 'false' || raw === '0') return false;
  if (raw === 'true' || raw === '1') return true;
  throw new Error(`${name} must be true or false.`);
}

// Host names this server answers to. When it listens only on this machine, that
// is the usual local names; otherwise ALLOWED_HOSTS lists them, or any name is
// accepted when it is not set.
function readAllowedHosts(env, listenHost) {
  const raw = env.ALLOWED_HOSTS;
  if (raw === undefined || raw.trim() === '') return LOOPBACK_ADDRESSES.includes(listenHost) ? LOOPBACK_HOST_NAMES : null;
  const hosts = raw.split(',').map((name) => name.trim().toLowerCase()).filter(Boolean);
  if (hosts.length === 0 || hosts.some((name) => !HOST_NAME.test(name))) {
    throw new Error('ALLOWED_HOSTS must be a comma separated list of host names such as example.com.');
  }
  return Object.freeze(hosts);
}

// Reads settings from environment variables. Nothing is required: without a
// Gemini API key the application runs entirely on the built-in planner.
export function loadConfig(env = process.env) {
  const host = env.HOST || '127.0.0.1';
  return Object.freeze({
    port: readInteger(env, 'PORT', 3000, 0, 65535),
    host,
    allowedHosts: readAllowedHosts(env, host),
    trustProxy: readFlag(env, 'TRUST_PROXY'),
    geminiApiKey: (env.GEMINI_API_KEY ?? '').trim(),
    geminiModels: readModels(env),
    aiTimeoutMs: readInteger(env, 'AI_TIMEOUT_MS', 20_000, 1000, 120_000),
    rateLimitWindowMs: readInteger(env, 'RATE_LIMIT_WINDOW_MS', 60_000, 1000, 3_600_000),
    rateLimitMax: readInteger(env, 'RATE_LIMIT_MAX', 120, 1, 100_000),
    aiRateLimitMax: readInteger(env, 'AI_RATE_LIMIT_MAX', 20, 1, 10_000),
    maxBodyBytes: readInteger(env, 'MAX_BODY_BYTES', 32 * 1024, 1024, 1024 * 1024),
  });
}
