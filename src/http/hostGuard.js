/** @module http/hostGuard */
import { HttpError } from './errors.js';

// A Host header is a name or an address in brackets, with an optional port.
const HOST_HEADER = /^(?<name>[a-z0-9.-]+|\[[0-9a-f:.]+\])(?::\d{1,5})?$/i;

function hostnameOf(value) {
  return HOST_HEADER.exec(value)?.groups.name.toLowerCase() ?? null;
}

/**
 * Creates defensive middleware guarding against DNS rebinding and cross-origin tampering.
 * @param {{ allowedHosts: readonly string[] | null }} options
 * @returns {{ check: (req: import('node:http').IncomingMessage) => void }}
 */
export function createHostGuard({ allowedHosts }) {
  const allowed = allowedHosts ? new Set(allowedHosts.map((host) => host.toLowerCase())) : null;

  return {
    check(req) {
      const host = String(req.headers.host ?? '');
      const hostname = hostnameOf(host);
      if (hostname === null) throw new HttpError(400, 'Invalid Host header.');
      if (allowed && !allowed.has(hostname)) throw new HttpError(421, 'This server does not answer for that host name.');

      const origin = req.headers.origin;
      if (origin === undefined || req.method === 'GET' || req.method === 'HEAD') return;
      const authority = String(origin).replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').toLowerCase();
      if (origin === 'null' || authority !== host.toLowerCase()) {
        throw new HttpError(403, 'Requests from other sites are not allowed.');
      }
    },
  };
}
