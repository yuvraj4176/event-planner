import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { addDays, diffDays } from '../../src/planner/dates.js';
import { EVENT_TYPES, EVENT_TYPE_KEYS } from '../../src/planner/eventTypes.js';
import { PHASES, buildTimeline, createDateScaler, phaseFor, timelineSpan } from '../../src/planner/timeline.js';
import { TODAY } from '../helpers/fixtures.js';

const scalerFor = (eventDate, spanDays = 365) => createDateScaler({ eventDate, today: TODAY, spanDays });

describe('phaseFor', () => {
  it('names phases from position in the timeline', () => {
    assert.equal(phaseFor(-5, 365), PHASES.after);
    assert.equal(phaseFor(0, 365), PHASES.eventWeek);
    assert.equal(phaseFor(7, 365), PHASES.eventWeek);
    assert.equal(phaseFor(300, 365), PHASES.early);
    assert.equal(phaseFor(200, 365), PHASES.booking);
    assert.equal(phaseFor(60, 365), PHASES.final);
  });
});

describe('createDateScaler', () => {
  it('uses real offsets when there is enough time', () => {
    const scaler = scalerFor('2027-12-31', 365);
    assert.equal(scaler.compressed, false);
    assert.equal(scaler.dateFor(365), '2026-12-31');
    assert.equal(scaler.dateFor(0), '2027-12-31');
    assert.equal(scaler.dateFor(-14), '2028-01-14');
  });

  it('compresses earlier tasks when time is short', () => {
    const eventDate = addDays(TODAY, 100);
    const scaler = scalerFor(eventDate, 365);
    assert.equal(scaler.compressed, true);
    assert.equal(scaler.availableDays, 100);
    assert.equal(scaler.dateFor(365), TODAY);
  });

  it('never schedules a pre-event task before today or after the event', () => {
    for (const available of [0, 1, 3, 10, 30, 90, 364]) {
      const eventDate = addDays(TODAY, available);
      const scaler = scalerFor(eventDate);
      for (let daysBefore = 0; daysBefore <= 365; daysBefore += 1) {
        const date = scaler.dateFor(daysBefore);
        assert.ok(date >= TODAY && date <= eventDate, `${available} days, ${daysBefore} before: ${date}`);
      }
    }
  });

  it('keeps tasks in the original order after compression', () => {
    for (const available of [2, 9, 25, 100, 250]) {
      const scaler = scalerFor(addDays(TODAY, available));
      let previous = '0000-00-00';
      for (let daysBefore = 365; daysBefore >= -14; daysBefore -= 1) {
        const date = scaler.dateFor(daysBefore);
        assert.ok(date >= previous, `${available} days: order broke at ${daysBefore}`);
        previous = date;
      }
    }
  });

  it('puts everything on the event day when the event is today', () => {
    const scaler = scalerFor(TODAY);
    assert.equal(scaler.availableDays, 0);
    assert.equal(scaler.dateFor(300), TODAY);
  });
});

describe('buildTimeline', () => {
  for (const key of EVENT_TYPE_KEYS) {
    it(`builds a sorted, complete timeline for ${key}`, () => {
      const definition = EVENT_TYPES[key];
      const eventDate = addDays(TODAY, 200);
      const timeline = buildTimeline(definition, scalerFor(eventDate, timelineSpan(definition)));

      assert.equal(timeline.tasks.length, definition.timeline.length);
      const dates = timeline.tasks.map((task) => task.dueDate);
      assert.deepEqual(dates, [...dates].sort());
      assert.ok(timeline.tasks.every((task) => task.title && task.detail && task.category && task.phase));
      assert.equal(timeline.recommendedWeeks, Math.ceil(timelineSpan(definition) / 7));
    });
  }

  it('places post-event tasks after the event', () => {
    const definition = EVENT_TYPES.wedding;
    const eventDate = '2027-10-23';
    const timeline = buildTimeline(definition, scalerFor(eventDate, timelineSpan(definition)));
    const thanks = timeline.tasks.find((task) => task.id === 'w-thanks');
    assert.equal(diffDays(eventDate, thanks.dueDate), 14);
    assert.equal(thanks.phase, PHASES.after);
  });

  it('labels tasks with the budget category name or Planning', () => {
    const timeline = buildTimeline(EVENT_TYPES.wedding, scalerFor('2027-10-23'));
    assert.equal(timeline.tasks.find((task) => task.id === 'w-venue').category, 'Venue and rentals');
    assert.equal(timeline.tasks.find((task) => task.id === 'w-vision').category, 'Planning');
  });

  it('flags a compressed timeline', () => {
    const near = buildTimeline(EVENT_TYPES.wedding, scalerFor(addDays(TODAY, 30)));
    const far = buildTimeline(EVENT_TYPES.wedding, scalerFor(addDays(TODAY, 400)));
    assert.equal(near.compressed, true);
    assert.equal(far.compressed, false);
  });
});
