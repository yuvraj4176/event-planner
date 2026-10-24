import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { addDays, diffDays, parseIsoDate, todayIso, toIsoDate } from '../../src/planner/dates.js';

describe('dates', () => {
  it('parses real calendar dates', () => {
    assert.equal(toIsoDate(parseIsoDate('2028-02-29')), '2028-02-29');
  });

  it('rejects malformed or impossible dates', () => {
    for (const value of ['2027-02-29', '2027-13-01', '2027-00-10', '27-01-01', '2027-1-1', '', null, undefined, 20270101]) {
      assert.equal(parseIsoDate(value), null, String(value));
    }
  });

  it('adds days across month and year boundaries', () => {
    assert.equal(addDays('2026-12-31', 1), '2027-01-01');
    assert.equal(addDays('2027-03-01', -1), '2027-02-28');
    assert.equal(addDays('2026-10-23', 0), '2026-10-23');
  });

  it('throws when adding days to an invalid date', () => {
    assert.throws(() => addDays('nope', 1), RangeError);
  });

  it('counts whole days in either direction', () => {
    assert.equal(diffDays('2026-10-23', '2026-10-30'), 7);
    assert.equal(diffDays('2026-10-30', '2026-10-23'), -7);
    assert.equal(diffDays('2027-02-28', '2027-03-01'), 1);
  });

  it('throws when comparing an invalid date', () => {
    assert.throws(() => diffDays('2026-10-23', 'bad'), RangeError);
  });

  it('derives today in UTC', () => {
    assert.equal(todayIso(new Date('2026-10-23T23:59:59Z')), '2026-10-23');
    assert.match(todayIso(), /^\d{4}-\d{2}-\d{2}$/);
  });
});
