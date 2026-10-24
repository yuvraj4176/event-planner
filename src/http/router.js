/** @module http/router */
import { HttpError } from './errors.js';

/**
 * Creates an HTTP router with automatic 404 Not Found and 405 Method Not Allowed resolution.
 * @param {Array<{ method: string, path: string, handler: Function, limit?: string }>} routes
 * @returns {{ resolve: (method: string, path: string) => object }}
 */
export function createRouter(routes) {
  const byPath = new Map();
  for (const route of routes) {
    if (!byPath.has(route.path)) byPath.set(route.path, new Map());
    byPath.get(route.path).set(route.method, route);
  }

  return {
    resolve(method, path) {
      const methods = byPath.get(path);
      if (!methods) throw new HttpError(404, 'Not found.');
      const route = methods.get(method);
      if (!route) {
        throw new HttpError(405, 'Method not allowed.', { headers: { Allow: [...methods.keys()].join(', ') } });
      }
      return route;
    },
  };
}
