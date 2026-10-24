/** @module http/clientAddress */

const MAX_ADDRESS_LENGTH = 64;

/**
 * Resolves the client IP address for rate limiting, respecting trusted proxy headers when configured.
 * @param {import('node:http').IncomingMessage} req
 * @param {boolean} trustProxy - Whether trusted reverse proxy (e.g. Vercel) is active
 * @returns {string} Sanitized client IP address
 */
export function clientAddress(req, trustProxy) {
  if (trustProxy) {
    const [first] = String(req.headers['x-forwarded-for'] ?? '').split(',');
    const forwarded = first.trim().slice(0, MAX_ADDRESS_LENGTH);
    if (forwarded) return forwarded;
  }
  return req.socket.remoteAddress ?? 'unknown';
}
