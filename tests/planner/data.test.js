import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CURRENCIES } from '../../src/planner/currencies.js';
import {
  EVENT_TYPES,
  EVENT_TYPE_KEYS,
  describeCurrencies,
  describeEventTypes,
  getEventType,
  priorityOptions,
} from '../../src/planner/eventTypes.js';

describe('event type definitions', () => {
  it('offers wedding, birthday and community events', () => {
    assert.deepEqual([...EVENT_TYPE_KEYS].sort(), ['birthday', 'community', 'wedding']);
  });

  for (const key of EVENT_TYPE_KEYS) {
    describe(key, () => {
      const definition = EVENT_TYPES[key];
      const budgetKeys = definition.budget.map((line) => line.key);

      it('has budget percentages that total exactly one hundred', () => {
        assert.equal(definition.budget.reduce((total, line) => total + line.percent, 0), 100);
      });

      it('has unique budget keys and a reserve line', () => {
        assert.equal(new Set(budgetKeys).size, budgetKeys.length);
        assert.ok(budgetKeys.includes(definition.contingencyKey));
      });

      it('has unique timeline ids and valid categories', () => {
        const ids = definition.timeline.map((task) => task.id);
        assert.equal(new Set(ids).size, ids.length);
        for (const task of definition.timeline) {
          assert.ok(task.category === 'planning' || budgetKeys.includes(task.category), task.id);
          assert.ok(Number.isInteger(task.daysBefore));
        }
      });

      it('has a day-of task and at least one task after the event', () => {
        assert.ok(definition.timeline.some((task) => task.daysBefore === 0));
        assert.ok(definition.timeline.some((task) => task.daysBefore < 0));
      });

      it('has vendors that map to budget lines and are not the reserve', () => {
        for (const vendor of definition.vendors) {
          assert.ok(budgetKeys.includes(vendor.key), vendor.key);
          assert.notEqual(vendor.key, definition.contingencyKey);
          assert.ok(vendor.questions.length >= 3, vendor.key);
        }
        assert.equal(new Set(definition.vendors.map((vendor) => vendor.key)).size, definition.vendors.length);
      });

      it('has enough ideas with tags and increasing tier thresholds', () => {
        assert.ok(definition.ideas.length >= 12);
        assert.ok(definition.ideas.every((idea) => idea.tags.length > 0 && idea.title && idea.detail));
        const [low, high] = definition.tierThresholdsUsd;
        assert.ok(low > 0 && high > low);
      });
    });
  }
});

describe('event type helpers', () => {
  it('finds known types and rejects everything else', () => {
    assert.equal(getEventType('wedding').key, 'wedding');
    for (const key of ['nope', '', undefined, null, 5, 'toString', '__proto__']) {
      assert.equal(getEventType(key), null, String(key));
    }
  });

  it('lists priorities without the reserve', () => {
    const options = priorityOptions(EVENT_TYPES.wedding);
    assert.ok(options.length > 0);
    assert.ok(options.every((option) => option.key !== 'contingency' && option.label));
  });

  it('describes event types for the client', () => {
    const described = describeEventTypes();
    assert.equal(described.length, EVENT_TYPE_KEYS.length);
    assert.ok(described.every((type) => type.key && type.label && type.summary && type.priorities.length > 0));
  });

  it('describes currencies for the client', () => {
    const described = describeCurrencies();
    assert.deepEqual(described.map((currency) => currency.code), Object.keys(CURRENCIES));
    assert.ok(Object.values(CURRENCIES).every((currency) => currency.usdRate > 0));
  });
});
