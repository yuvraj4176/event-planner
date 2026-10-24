import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PRIORITY_BOOST, allocate, buildBudget } from '../../src/planner/budget.js';
import { EVENT_TYPES, EVENT_TYPE_KEYS } from '../../src/planner/eventTypes.js';
import { validInput } from '../helpers/fixtures.js';

const sum = (values) => values.reduce((total, value) => total + value, 0);

describe('allocate', () => {
  it('splits proportionally', () => {
    assert.deepEqual(allocate(100, [1, 1]), [50, 50]);
    assert.deepEqual(allocate(1000, [1, 3]), [250, 750]);
  });

  it('never loses or invents a unit', () => {
    const weightSets = [[1, 1, 1], [22, 28, 10, 10, 7, 8, 2, 3], [0.3, 0.3, 0.4], [7, 13, 29, 1]];
    for (const weights of weightSets) {
      for (const total of [1, 2, 7, 99, 100, 101, 12_345, 2_500_000, 999_999_999]) {
        const amounts = allocate(total, weights);
        assert.equal(sum(amounts), total, `${total} over ${weights}`);
        assert.ok(amounts.every((amount) => Number.isInteger(amount) && amount >= 0));
      }
    }
  });

  it('gives leftover units to the largest remainders first', () => {
    assert.deepEqual(allocate(10, [1, 1, 1]), [4, 3, 3]);
  });

  it('handles a zero total', () => {
    assert.deepEqual(allocate(0, [1, 2]), [0, 0]);
  });

  it('rejects invalid totals and weights', () => {
    assert.throws(() => allocate(10.5, [1]), RangeError);
    assert.throws(() => allocate(-1, [1]), RangeError);
    assert.throws(() => allocate(10, [0, 0]), RangeError);
    assert.throws(() => allocate(10, []), RangeError);
  });
});

describe('buildBudget', () => {
  for (const key of EVENT_TYPE_KEYS) {
    it(`adds up exactly for ${key} events at many budget sizes`, () => {
      for (const totalBudget of [100, 999, 12_345, 250_000, 2_500_001, 1_000_000_000]) {
        const budget = buildBudget(EVENT_TYPES[key], validInput({ eventType: key, totalBudget, priorities: [] }));
        assert.equal(sum(budget.lines.map((line) => line.amount)), totalBudget);
        assert.equal(budget.total, totalBudget);
      }
    });
  }

  it('keeps the reserve at its configured share regardless of priorities', () => {
    const definition = EVENT_TYPES.wedding;
    const plain = buildBudget(definition, validInput({ priorities: [] }));
    const boosted = buildBudget(definition, validInput({ priorities: ['venue', 'decor', 'catering'] }));
    const reserve = (budget) => budget.lines.find((line) => line.key === 'contingency').amount;
    assert.equal(reserve(plain), 250_000);
    assert.equal(reserve(boosted), 250_000);
  });

  it('gives prioritised categories a larger share and flags them', () => {
    const definition = EVENT_TYPES.wedding;
    const plain = buildBudget(definition, validInput({ priorities: [] }));
    const boosted = buildBudget(definition, validInput({ priorities: ['photography'] }));
    const line = (budget, key) => budget.lines.find((entry) => entry.key === key);

    assert.ok(line(boosted, 'photography').amount > line(plain, 'photography').amount);
    assert.ok(line(boosted, 'venue').amount < line(plain, 'venue').amount);
    assert.equal(line(boosted, 'photography').priority, true);
    assert.equal(line(boosted, 'venue').priority, false);
    assert.ok(PRIORITY_BOOST > 1);
  });

  it('reports shares that total about one hundred percent', () => {
    const budget = buildBudget(EVENT_TYPES.birthday, validInput({ eventType: 'birthday', totalBudget: 54_321, priorities: [] }));
    assert.ok(Math.abs(sum(budget.lines.map((line) => line.share)) - 100) < 0.6);
  });

  it('preserves line order, labels and currency', () => {
    const budget = buildBudget(EVENT_TYPES.community, validInput({ eventType: 'community', currency: 'EUR', priorities: [] }));
    assert.equal(budget.currency, 'EUR');
    assert.deepEqual(budget.lines.map((line) => line.key), EVENT_TYPES.community.budget.map((line) => line.key));
    assert.ok(budget.lines.every((line) => line.label && line.hint));
  });

  it('distributes minimum budget cleanly with priorities enabled for all event types', () => {
    for (const key of EVENT_TYPE_KEYS) {
      const budget = buildBudget(EVENT_TYPES[key], validInput({
        eventType: key,
        totalBudget: 100,
        priorities: [EVENT_TYPES[key].budget[0].key],
      }));
      assert.equal(sum(budget.lines.map((line) => line.amount)), 100);
      assert.ok(budget.lines.every((line) => line.amount >= 0));
    }
  });
});

