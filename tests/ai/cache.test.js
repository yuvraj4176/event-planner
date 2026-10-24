import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createTtlCache } from '../../src/ai/cache.js';

describe('createTtlCache', () => {
  it('returns stored values and undefined for unknown keys', () => {
    const cache = createTtlCache({ maxEntries: 5, ttlMs: 1000 });
    cache.set('a', 1);
    assert.equal(cache.get('a'), 1);
    assert.equal(cache.get('missing'), undefined);
  });

  it('expires entries after the time limit', () => {
    let clock = 0;
    const cache = createTtlCache({ maxEntries: 5, ttlMs: 1000, now: () => clock });
    cache.set('a', 1);
    clock = 999;
    assert.equal(cache.get('a'), 1);
    clock = 1000;
    assert.equal(cache.get('a'), undefined);
    assert.equal(cache.size, 0);
  });

  it('evicts the oldest entry when full', () => {
    const cache = createTtlCache({ maxEntries: 2, ttlMs: 1000 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    assert.equal(cache.get('a'), undefined);
    assert.equal(cache.get('b'), 2);
    assert.equal(cache.get('c'), 3);
    assert.equal(cache.size, 2);
  });

  it('refreshes position and lifetime when a key is set again', () => {
    let clock = 0;
    const cache = createTtlCache({ maxEntries: 2, ttlMs: 1000, now: () => clock });
    cache.set('a', 1);
    cache.set('b', 2);
    clock = 500;
    cache.set('a', 10);
    cache.set('c', 3);
    assert.equal(cache.get('b'), undefined);
    assert.equal(cache.get('a'), 10);
    clock = 1200;
    assert.equal(cache.get('a'), 10);
  });
});
