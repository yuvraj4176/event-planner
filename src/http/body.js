/** @module http/body */
import { HttpError } from './errors.js';

const TOO_LARGE_MESSAGE = 'Request body is too large.';

/**
 * Reads, verifies byte size limits, and parses incoming JSON request stream.
 * @param {import('node:http').IncomingMessage} req
 * @param {{ maxBytes: number }} options
 * @returns {Promise<unknown>} Parsed JSON object
 */
export async function readJsonBody(req, { maxBytes }) {
  const contentType = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
  if (contentType !== 'application/json') {
    throw new HttpError(415, 'Content-Type must be application/json.');
  }

  const declaredLength = Number(req.headers['content-length']);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new HttpError(413, TOO_LARGE_MESSAGE, { headers: { Connection: 'close' } });
  }

  const chunks = [];
  let received = 0;
  for await (const chunk of req) {
    received += chunk.length;
    if (received > maxBytes) {
      throw new HttpError(413, TOO_LARGE_MESSAGE, { headers: { Connection: 'close' } });
    }
    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Request body is not valid JSON.');
  }
}
