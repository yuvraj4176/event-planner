/** @module app */
import http from 'node:http';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { gzip } from 'node:zlib';
import { createAssistantService } from './ai/assistantService.js';
import { readJsonBody } from './http/body.js';
import { HttpError } from './http/errors.js';
import { silentLogger } from './logger.js';
import { clientAddress } from './http/clientAddress.js';
import { createHostGuard } from './http/hostGuard.js';
import { createRateLimiter } from './http/rateLimiter.js';
import { createRouter } from './http/router.js';
import { applySecurityHeaders } from './http/security.js';
import { loadStaticFiles, serveStatic } from './http/staticFiles.js';
import { createApiRoutes } from './routes/api.js';

const gzipAsync = promisify(gzip);
const DEFAULT_PUBLIC_DIR = fileURLToPath(new URL('../public/', import.meta.url));
const MAX_URL_LENGTH = 2048;
// Smaller answers are not worth the time it takes to compress them.
const COMPRESS_JSON_ABOVE_BYTES = 1024;

async function sendJson(req, res, status, payload, headers = {}) {
  let body = Buffer.from(JSON.stringify(payload));
  const compressed = body.length > COMPRESS_JSON_ABOVE_BYTES && /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''));
  if (compressed) body = await gzipAsync(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
    Vary: 'Accept-Encoding',
    ...(compressed ? { 'Content-Encoding': 'gzip' } : {}),
    ...headers,
  });
  res.end(body);
}

function parsePathname(req) {
  if (typeof req.url !== 'string' || req.url.length > MAX_URL_LENGTH) {
    throw new HttpError(414, 'Request URL is too long.');
  }
  try {
    return new URL(req.url, 'http://localhost').pathname;
  } catch {
    throw new HttpError(400, 'Malformed URL.');
  }
}

/**
 * Builds the HTTP request listener dispatching API and static file requests.
 * @param {{ config: object, aiClient: object, logger?: object, now?: () => number, staticFiles?: object | null }} options
 * @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => Promise<void>}
 */
export function createRequestHandler({ config, aiClient, logger = silentLogger, now = Date.now, staticFiles = null }) {
  const assistant = createAssistantService({ aiClient, logger, now });
  const router = createRouter(createApiRoutes({ assistant, now }));
  const hostGuard = createHostGuard({ allowedHosts: config.allowedHosts });
  const limiters = {
    general: createRateLimiter({ windowMs: config.rateLimitWindowMs, max: config.rateLimitMax, now }),
    ai: createRateLimiter({ windowMs: config.rateLimitWindowMs, max: config.aiRateLimitMax, now }),
  };

  function enforceRateLimits(req, route) {
    const client = clientAddress(req, config.trustProxy);
    const buckets = route.limit === 'ai' ? [limiters.general, limiters.ai] : [limiters.general];
    for (const limiter of buckets) {
      const { allowed, retryAfterSeconds } = limiter.check(client);
      if (!allowed) {
        throw new HttpError(429, 'Too many requests. Please wait a moment and try again.', {
          headers: { 'Retry-After': String(retryAfterSeconds) },
        });
      }
    }
  }

  async function handleApi(req, res, pathname) {
    const route = router.resolve(req.method, pathname);
    enforceRateLimits(req, route);
    const body = req.method === 'POST' ? await readJsonBody(req, { maxBytes: config.maxBodyBytes }) : undefined;
    await sendJson(req, res, 200, await route.handler({ body }));
  }

  async function sendError(req, res, error) {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    if (error instanceof HttpError) {
      const payload = { error: { message: error.message, ...(error.details ?? {}) } };
      await sendJson(req, res, error.status, payload, error.headers);
      return;
    }
    logger.error('unhandled_error', { name: error?.name, message: error?.message, stack: error?.stack });
    await sendJson(req, res, 500, { error: { message: 'Something went wrong on our side. Please try again.' } });
  }

  return async function handleRequest(req, res) {
    applySecurityHeaders(res, req);
    const startedAt = performance.now();
    res.once('finish', () => {
      logger.info('request', {
        method: req.method,
        path: req.url?.split('?')[0].slice(0, 120),
        status: res.statusCode,
        ms: Math.round(performance.now() - startedAt),
      });
    });

    try {
      hostGuard.check(req);
      const pathname = parsePathname(req);
      if (pathname.startsWith('/api/')) await handleApi(req, res, pathname);
      else if (staticFiles) serveStatic(req, res, pathname, staticFiles);
      else throw new HttpError(404, 'Not found.');
    } catch (error) {
      await sendError(req, res, error);
    }
  };
}

/**
 * Builds the HTTP server without starting it. Static files are read once at startup.
 * @param {{ publicDir?: string, [key: string]: any }} options
 * @returns {Promise<import('node:http').Server>}
 */
export async function createApp({ publicDir = DEFAULT_PUBLIC_DIR, ...options }) {
  const staticFiles = await loadStaticFiles(publicDir);
  const server = http.createServer(createRequestHandler({ ...options, staticFiles }));
  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;
  server.keepAliveTimeout = 5_000;
  return server;
}
