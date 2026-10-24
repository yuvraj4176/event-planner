/** @module ai/cache */

// In-memory cache that works well for the standalone Node server. On serverless
// platforms each cold start creates a fresh cache; a shared store (Redis, KV)
// would be needed for consistent hit rates across instances. This trade-off keeps
// the project dependency-free while still avoiding repeated AI calls in
// development and single-instance deployments.

/**
 * Creates an in-memory TTL cache with LRU-style eviction on max capacity.
 * @param {{ maxEntries: number, ttlMs: number, now?: () => number }} options
 * @returns {{ get: (key: string) => any, set: (key: string, value: any) => void, size: number }}
 */
export function createTtlCache({ maxEntries, ttlMs, now = Date.now }) {
  const entries = new Map();

  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt <= now()) {
        entries.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set(key, value) {
      entries.delete(key);
      entries.set(key, { value, expiresAt: now() + ttlMs });
      if (entries.size > maxEntries) {
        entries.delete(entries.keys().next().value);
      }
    },
    get size() {
      return entries.size;
    },
  };
}
