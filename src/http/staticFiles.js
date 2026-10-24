/** @module http/staticFiles */
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { HttpError } from './errors.js';

const MIME_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
});

const COMPRESSIBLE = new Set(['.html', '.css', '.js', '.json', '.svg', '.txt']);

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const full = path.join(directory, entry.name);
      return entry.isDirectory() ? listFiles(full) : [full];
    }),
  );
  return nested.flat();
}

/**
 * Pre-loads static assets into memory with ETag hashes and pre-compressed buffers.
 * @param {string} root - Path to public folder
 * @returns {Promise<{ serve: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => boolean }>}
 */
export async function loadStaticFiles(root) {
  const files = new Map();
  for (const filePath of await listFiles(root)) {
    const extension = path.extname(filePath).toLowerCase();
    const type = MIME_TYPES[extension];
    if (!type) continue;

    const body = await readFile(filePath);
    const urlPath = `/${path.relative(root, filePath).split(path.sep).join('/')}`;
    files.set(urlPath, {
      type,
      body,
      gzip: COMPRESSIBLE.has(extension) ? gzipSync(body) : null,
      br: COMPRESSIBLE.has(extension) ? brotliCompressSync(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }) : null,
      etag: `"${createHash('sha256').update(body).digest('base64url').slice(0, 27)}"`,
    });
  }
  return files;
}

function lookupPath(rawPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    throw new HttpError(400, 'Malformed URL.');
  }
  return decoded === '/' ? '/index.html' : decoded;
}

export function serveStatic(req, res, pathname, files) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    throw new HttpError(405, 'Method not allowed.', { headers: { Allow: 'GET, HEAD' } });
  }

  const file = files.get(lookupPath(pathname));
  if (!file) throw new HttpError(404, 'Not found.');

  res.setHeader('Content-Type', file.type);
  res.setHeader('ETag', file.etag);
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Vary', 'Accept-Encoding');

  if (req.headers['if-none-match'] === file.etag) {
    res.writeHead(304);
    res.end();
    return;
  }

  const accepted = String(req.headers['accept-encoding'] ?? '');
  const encoding = file.br && /\bbr\b/.test(accepted) ? 'br' : file.gzip && /\bgzip\b/.test(accepted) ? 'gzip' : null;
  const body = encoding ? file[encoding] : file.body;
  if (encoding) res.setHeader('Content-Encoding', encoding);
  res.setHeader('Content-Length', body.length);
  res.writeHead(200);
  res.end(req.method === 'HEAD' ? undefined : body);
}
