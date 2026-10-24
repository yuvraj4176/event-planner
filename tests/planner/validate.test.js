import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LIMITS, cleanText, validateEventInput } from '../../src/planner/validate.js';
import { TODAY, validInput } from '../helpers/fixtures.js';

const validate = (raw) => validateEventInput(raw, { today: TODAY });
const fieldsOf = (result) => result.errors.map((error) => error.field);

describe('validateEventInput', () => {
  it('accepts a complete valid event and returns only known fields', () => {
    const result = validate({ ...validInput(), isAdmin: true, __proto__: { polluted: true } });
    assert.equal(result.ok, true);
    assert.deepEqual(Object.keys(result.value).sort(), [
      'currency', 'eventDate', 'eventName', 'eventType', 'guestCount', 'interests',
      'location', 'priorities', 'theme', 'totalBudget',
    ]);
    assert.equal(Object.hasOwn(result.value, 'isAdmin'), false);
  });

  it('accepts a minimal event with only required fields', () => {
    const { location, theme, interests, priorities, ...required } = validInput();
    const result = validate(required);
    assert.equal(result.ok, true);
    assert.deepEqual(result.value.priorities, []);
    assert.equal(result.value.theme, '');
  });

  it('accepts numeric strings for numbers', () => {
    const result = validate(validInput({ guestCount: '80', totalBudget: '15000.6' }));
    assert.equal(result.ok, true);
    assert.equal(result.value.guestCount, 80);
    assert.equal(result.value.totalBudget, 15001);
  });

  it('accepts an event happening today', () => {
    assert.equal(validate(validInput({ eventDate: TODAY })).ok, true);
  });

  it('rejects bodies that are not objects', () => {
    for (const body of [null, undefined, 'text', 42, [], [validInput()]]) {
      const result = validate(body);
      assert.equal(result.ok, false);
      assert.deepEqual(fieldsOf(result), ['body']);
    }
  });

  it('reports every invalid field at once', () => {
    const result = validate({});
    assert.equal(result.ok, false);
    assert.deepEqual(fieldsOf(result).sort(), ['currency', 'eventDate', 'eventName', 'eventType', 'guestCount', 'totalBudget']);
  });

  it('rejects unknown event types including prototype keys', () => {
    for (const eventType of ['party', '', 'constructor', '__proto__', 7]) {
      assert.deepEqual(fieldsOf(validate(validInput({ eventType }))), ['eventType']);
    }
  });

  it('checks the event name', () => {
    assert.deepEqual(fieldsOf(validate(validInput({ eventName: '   ' }))), ['eventName']);
    assert.deepEqual(fieldsOf(validate(validInput({ eventName: 'x'.repeat(LIMITS.nameMax + 1) }))), ['eventName']);
    assert.deepEqual(fieldsOf(validate(validInput({ eventName: 123 }))), ['eventName']);
  });

  it('checks the event date', () => {
    for (const eventDate of ['2026-10-22', '2027-02-30', 'tomorrow', '', '2040-01-01', 5]) {
      assert.deepEqual(fieldsOf(validate(validInput({ eventDate }))), ['eventDate'], String(eventDate));
    }
  });

  it('checks the guest count', () => {
    for (const guestCount of [0, -3, LIMITS.guestsMax + 1, 2.5, 'many', '', null, '1e3', NaN]) {
      assert.deepEqual(fieldsOf(validate(validInput({ guestCount }))), ['guestCount'], String(guestCount));
    }
    assert.equal(validate(validInput({ guestCount: LIMITS.guestsMax })).ok, true);
  });

  it('checks the budget', () => {
    for (const totalBudget of [0, 99, -500, LIMITS.budgetMax + 1, Infinity, NaN, 'lots', '', null]) {
      assert.deepEqual(fieldsOf(validate(validInput({ totalBudget }))), ['totalBudget'], String(totalBudget));
    }
    assert.equal(validate(validInput({ totalBudget: LIMITS.budgetMin })).ok, true);
  });

  it('checks the currency', () => {
    for (const currency of ['XYZ', 'inr', '', 'toString', 5]) {
      assert.deepEqual(fieldsOf(validate(validInput({ currency }))), ['currency'], String(currency));
    }
  });

  it('checks optional text fields', () => {
    assert.deepEqual(fieldsOf(validate(validInput({ location: 'x'.repeat(LIMITS.locationMax + 1) }))), ['location']);
    assert.deepEqual(fieldsOf(validate(validInput({ theme: 'x'.repeat(LIMITS.themeMax + 1) }))), ['theme']);
    assert.deepEqual(fieldsOf(validate(validInput({ interests: 'x'.repeat(LIMITS.interestsMax + 1) }))), ['interests']);
    assert.deepEqual(fieldsOf(validate(validInput({ theme: { nested: true } }))), ['theme']);
    assert.equal(validate(validInput({ theme: null, location: '' })).ok, true);
  });

  it('checks priorities', () => {
    assert.deepEqual(fieldsOf(validate(validInput({ priorities: 'venue' }))), ['priorities']);
    assert.deepEqual(fieldsOf(validate(validInput({ priorities: [1, 2] }))), ['priorities']);
    assert.deepEqual(fieldsOf(validate(validInput({ priorities: ['venue', 'catering', 'decor', 'attire'] }))), ['priorities']);
    assert.deepEqual(fieldsOf(validate(validInput({ priorities: ['safety'] }))), ['priorities']);
    assert.deepEqual(fieldsOf(validate(validInput({ priorities: ['contingency'] }))), ['priorities']);
  });

  it('removes duplicate priorities', () => {
    const result = validate(validInput({ priorities: ['venue', 'venue', 'decor'] }));
    assert.equal(result.ok, true);
    assert.deepEqual(result.value.priorities, ['venue', 'decor']);
  });

  it('skips priority checks when the event type is invalid', () => {
    const result = validate(validInput({ eventType: 'party', priorities: ['anything'] }));
    assert.deepEqual(fieldsOf(result), ['eventType']);
  });
});

describe('cleanText', () => {
  it('collapses whitespace and removes control characters', () => {
    assert.equal(cleanText('  hello \n\t  world\u0000 '), 'hello world');
  });

  it('removes bidirectional override characters', () => {
    assert.equal(cleanText('abc‮def'), 'abcdef');
  });

  it('keeps joiners needed by many scripts', () => {
    assert.equal(cleanText('क्‍ष'), 'क्‍ष');
  });

  it('returns an empty string for non-text input', () => {
    assert.equal(cleanText(undefined), '');
    assert.equal(cleanText(42), '');
  });
});
