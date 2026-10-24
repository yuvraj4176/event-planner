import { HttpError } from './errors.js';

// Maps "METHOD /path" to handlers and distinguishes an unknown path (404) from
// a known path used with the wrong method (405).
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
