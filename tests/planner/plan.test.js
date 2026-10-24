import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HELP_TEXT, answerLocally, formatMoney } from '../../src/planner/assistant.js';
import { addDays } from '../../src/planner/dates.js';
import { EVENT_TYPE_KEYS } from '../../src/planner/eventTypes.js';
import { buildPlan, planFromRequest } from '../../src/planner/plan.js';
import { TODAY, buildTestPlan, validInput } from '../helpers/fixtures.js';

describe('planFromRequest', () => {
  it('returns validation errors without building a plan', () => {
    const result = planFromRequest(validInput({ guestCount: 0 }), TODAY);
    assert.equal(result.ok, false);
    assert.equal(result.errors[0].field, 'guestCount');
    assert.equal(result.plan, undefined);
  });

  it('builds a plan for a valid request', () => {
    const result = planFromRequest(validInput(), TODAY);
    assert.equal(result.ok, true);
    assert.equal(result.plan.generatedOn, TODAY);
  });
});

describe('buildPlan', () => {
  for (const eventType of EVENT_TYPE_KEYS) {
    it(`produces a complete ${eventType} plan`, () => {
      const plan = buildTestPlan({ eventType, priorities: [] });
      assert.equal(plan.input.eventType, eventType);
      assert.ok(plan.budget.lines.length >= 8);
      assert.equal(plan.budget.lines.reduce((total, line) => total + line.amount, 0), plan.budget.total);
      assert.ok(plan.timeline.tasks.length >= 14);
      assert.ok(plan.vendors.length >= 8);
      assert.ok(plan.vendors.every((vendor) => vendor.checklist.length === 4));
      assert.ok(plan.ideas.items.length >= 6);
      assert.equal(plan.ideas.source, 'builtin');
    });
  }

  it('summarises the event', () => {
    const plan = buildTestPlan({ totalBudget: 1_200_000, guestCount: 100, eventDate: addDays(TODAY, 70) });
    assert.equal(plan.summary.daysUntilEvent, 70);
    assert.equal(plan.summary.weeksUntilEvent, 10);
    assert.equal(plan.summary.budgetPerGuest, 12_000);
    assert.equal(plan.summary.taskCount, plan.timeline.tasks.length);
    assert.equal(plan.summary.vendorCount, plan.vendors.length);
    assert.equal(plan.summary.compressed, true);
    assert.equal(plan.summary.recommendedWeeks, 53);
  });

  it('does not compress a timeline with enough lead time', () => {
    assert.equal(buildTestPlan({ eventDate: addDays(TODAY, 400) }).summary.compressed, false);
  });

  it('orders vendors by how early they must be booked', () => {
    const plan = buildTestPlan({ eventDate: addDays(TODAY, 400) });
    const dates = plan.vendors.map((vendor) => vendor.bookBy);
    assert.deepEqual(dates, [...dates].sort());
  });

  it('marks prioritised vendors', () => {
    const plan = buildTestPlan({ priorities: ['photography'] });
    assert.equal(plan.vendors.find((vendor) => vendor.key === 'photography').priority, true);
    assert.equal(plan.vendors.find((vendor) => vendor.key === 'venue').priority, false);
  });

  it('can be serialised and restored without loss', () => {
    const plan = buildTestPlan();
    assert.deepEqual(JSON.parse(JSON.stringify(plan)), plan);
  });

  it('does not change the validated input it was given', () => {
    const input = planFromRequest(validInput(), TODAY);
    const copy = structuredClone(input.plan.input);
    buildPlan(input.plan.input, TODAY);
    assert.deepEqual(input.plan.input, copy);
  });
});

describe('answerLocally', () => {
  const plan = buildTestPlan({ eventDate: addDays(TODAY, 90) });

  it('answers budget questions with real figures', () => {
    const answer = answerLocally('How should I split my budget?', plan, TODAY);
    assert.match(answer, /2,500,000/);
    assert.match(answer, /per guest/);
    assert.match(answer, /reserve/);
  });

  it('answers timeline questions with the next tasks and a compression note', () => {
    const answer = answerLocally('What should I do next? Any deadlines?', plan, TODAY);
    assert.match(answer, /Your next tasks are/);
    assert.match(answer, /compressed/);
  });

  it('says so when every task is past due', () => {
    const answer = answerLocally('what is my timeline', plan, '2030-01-01');
    assert.match(answer, /past their due date|past its due date/);
  });

  it('does not mention compression when the timeline is not compressed', () => {
    const relaxed = buildTestPlan({ eventDate: addDays(TODAY, 400) });
    assert.doesNotMatch(answerLocally('timeline', relaxed, TODAY), /compressed/);
  });

  it('answers vendor, guest and idea questions', () => {
    assert.match(answerLocally('Which vendor should I book first?', plan, TODAY), /longest lead times/);
    assert.match(answerLocally('How many guests can we host?', plan, TODAY), /120 guests/);
    assert.match(answerLocally('Any theme ideas?', plan, TODAY), /Ideas that fit your plan/);
  });

  it('answers guest questions when the event has no catering line', () => {
    const noCatering = { ...plan, budget: { ...plan.budget, lines: plan.budget.lines.filter((line) => line.key !== 'catering') } };
    assert.match(answerLocally('headcount', noCatering, TODAY), /120 guests/);
  });

  it('offers help for unrelated questions', () => {
    assert.equal(answerLocally('what is the weather on mars', plan, TODAY), HELP_TEXT);
    assert.equal(answerLocally('', plan, TODAY), HELP_TEXT);
  });
});

describe('formatMoney', () => {
  it('formats whole currency amounts', () => {
    assert.match(formatMoney(1234567, 'USD'), /1,234,567/);
  });
});
