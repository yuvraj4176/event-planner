import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ApiError, createApi, toFieldErrors } from '../../public/js/api.js';
import {
  daysBetween,
  describeDue,
  formatDate,
  formatMoney,
  localTodayIso,
  percentage,
  pluralize,
} from '../../public/js/format.js';
import {
  emptyProgress,
  lineSpend,
  reconcileProgress,
  setSpent,
  setStepDone,
  setTaskDone,
  spendTotals,
  taskStats,
  vendorStats,
} from '../../public/js/progress.js';
import { STORAGE_KEY, browserStorage, createStore, isPlanShape } from '../../public/js/store.js';
import { buildTestPlan } from '../helpers/fixtures.js';

const plan = buildTestPlan();

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
    data,
  };
}

describe('format helpers', () => {
  it('formats money without decimals', () => {
    assert.equal(formatMoney(1234, 'USD', 'en'), '$1,234');
    assert.match(formatMoney(2_500_000, 'INR', 'en'), /2,500,000/);
  });

  it('formats calendar dates without time zone drift', () => {
    assert.equal(formatDate('2027-03-14', 'en'), 'Sun, Mar 14, 2027');
    assert.equal(formatDate('2027-01-01', 'en'), 'Fri, Jan 1, 2027');
  });

  it('derives the local calendar date', () => {
    assert.equal(localTodayIso(new Date(2026, 9, 3, 23, 59)), '2026-10-03');
    assert.equal(localTodayIso(new Date(2026, 0, 1, 0, 0)), '2026-01-01');
  });

  it('counts days between dates', () => {
    assert.equal(daysBetween('2026-10-23', '2026-11-02'), 10);
    assert.equal(daysBetween('2026-11-02', '2026-10-23'), -10);
  });

  it('pluralises and computes percentages', () => {
    assert.equal(pluralize(1, 'day'), '1 day');
    assert.equal(pluralize(2, 'day'), '2 days');
    assert.equal(pluralize(2, 'person', 'people'), '2 people');
    assert.equal(percentage(1, 3), 33);
    assert.equal(percentage(0, 0), 0);
  });

  it('describes due dates in words', () => {
    const today = '2026-10-23';
    assert.deepEqual(describeDue('2026-10-20', today, false), { state: 'overdue', text: 'Overdue by 3 days' });
    assert.deepEqual(describeDue('2026-10-22', today, false), { state: 'overdue', text: 'Overdue by 1 day' });
    assert.deepEqual(describeDue('2026-10-23', today, false), { state: 'today', text: 'Due today' });
    assert.deepEqual(describeDue('2026-10-24', today, false), { state: 'upcoming', text: 'Due tomorrow' });
    assert.deepEqual(describeDue('2026-11-02', today, false), { state: 'upcoming', text: 'Due in 10 days' });
    assert.deepEqual(describeDue('2026-10-01', today, true), { state: 'done', text: 'Done' });
  });
});

describe('progress', () => {
  it('starts empty', () => {
    assert.deepEqual(emptyProgress(), { tasks: {}, steps: {}, spent: {} });
  });

  it('records and clears tasks and steps without mutating the original', () => {
    const start = emptyProgress();
    const done = setTaskDone(start, 'w-venue', true);
    assert.deepEqual(start.tasks, {});
    assert.equal(done.tasks['w-venue'], true);
    assert.deepEqual(setTaskDone(done, 'w-venue', false).tasks, {});
    assert.equal(setStepDone(start, 'venue-contract', true).steps['venue-contract'], true);
    assert.deepEqual(setStepDone(setStepDone(start, 'a', true), 'a', false).steps, {});
  });

  it('records spending and removes empty or invalid amounts', () => {
    const spent = setSpent(emptyProgress(), 'venue', 5000);
    assert.equal(spent.spent.venue, 5000);
    for (const amount of [0, -5, NaN, Infinity, undefined]) {
      assert.deepEqual(setSpent(spent, 'venue', amount).spent, {}, String(amount));
    }
  });

  it('computes task and vendor statistics', () => {
    let progress = setTaskDone(emptyProgress(), plan.timeline.tasks[0].id, true);
    progress = setTaskDone(progress, plan.timeline.tasks[1].id, true);
    assert.deepEqual(taskStats(plan, progress), { done: 2, total: 22, percent: 9 });

    const vendor = plan.vendors[0];
    progress = setStepDone(progress, vendor.checklist[0].id, true);
    assert.deepEqual(vendorStats(vendor, progress), { done: 1, total: 4 });
  });

  it('computes spending against the budget', () => {
    const venue = plan.budget.lines.find((line) => line.key === 'venue');
    const progress = setSpent(setSpent(emptyProgress(), 'venue', venue.amount + 100), 'decor', 50);
    const line = lineSpend(venue, progress);
    assert.equal(line.over, true);
    assert.equal(line.remaining, -100);
    assert.equal(lineSpend(plan.budget.lines[2], emptyProgress()).spent, 0);

    const totals = spendTotals(plan, progress);
    assert.equal(totals.spent, venue.amount + 150);
    assert.equal(totals.remaining, plan.budget.total - venue.amount - 150);
    assert.equal(totals.over, false);
    assert.equal(spendTotals(plan, setSpent(emptyProgress(), 'venue', plan.budget.total + 1)).over, true);
  });

  it('drops progress that no longer matches the plan or has bad values', () => {
    const raw = {
      tasks: { 'w-venue': true, 'w-photo': 'yes', 'not-a-task': true, __proto__: { x: true } },
      steps: { 'venue-contract': true, 'ghost-step': true },
      spent: { venue: 1200, decor: -4, catering: 'lots', ghost: 5 },
    };
    assert.deepEqual(reconcileProgress(raw, plan), {
      tasks: { 'w-venue': true },
      steps: { 'venue-contract': true },
      spent: { venue: 1200 },
    });
  });

  it('copes with missing or malformed progress', () => {
    for (const raw of [undefined, null, 'x', 5, {}, { tasks: null }]) {
      assert.deepEqual(reconcileProgress(raw, plan), emptyProgress(), String(raw));
    }
  });
});

describe('store', () => {
  it('round-trips a plan and its progress', () => {
    const storage = memoryStorage();
    const store = createStore(storage);
    const progress = setTaskDone(emptyProgress(), 'w-venue', true);
    assert.equal(store.save({ plan, progress }), true);
    assert.deepEqual(store.load(), { plan, progress });
  });

  it('returns null when nothing is saved', () => {
    assert.equal(createStore(memoryStorage()).load(), null);
  });

  it('ignores corrupted, outdated or tampered data', () => {
    const attempts = [
      'not json',
      '{}',
      'null',
      JSON.stringify({ version: 99, plan }),
      JSON.stringify({ version: 1, plan: { input: {} } }),
      JSON.stringify({ version: 1, plan: { ...plan, budget: { ...plan.budget, lines: [{ key: 1 }] } } }),
      JSON.stringify({ version: 1, plan: { ...plan, vendors: 'x' } }),
    ];
    for (const value of attempts) {
      assert.equal(createStore(memoryStorage({ [STORAGE_KEY]: value })).load(), null, value.slice(0, 40));
    }
  });

  it('clears progress that does not belong to the saved plan', () => {
    const saved = JSON.stringify({ version: 1, plan, progress: { tasks: { ghost: true }, steps: {}, spent: {} } });
    const loaded = createStore(memoryStorage({ [STORAGE_KEY]: saved })).load();
    assert.deepEqual(loaded.progress, emptyProgress());
  });

  it('clears saved data', () => {
    const storage = memoryStorage();
    const store = createStore(storage);
    store.save({ plan, progress: emptyProgress() });
    store.clear();
    assert.equal(store.load(), null);
  });

  it('works silently without storage', () => {
    const store = createStore(null);
    assert.equal(store.load(), null);
    assert.equal(store.save({ plan, progress: emptyProgress() }), false);
    assert.doesNotThrow(() => store.clear());
  });

  it('survives storage that throws', () => {
    const broken = {
      getItem() { throw new Error('blocked'); },
      setItem() { throw new Error('full'); },
      removeItem() { throw new Error('blocked'); },
    };
    const store = createStore(broken);
    assert.equal(store.load(), null);
    assert.equal(store.save({ plan, progress: emptyProgress() }), false);
    assert.doesNotThrow(() => store.clear());
  });

  it('validates the plan shape strictly', () => {
    assert.equal(isPlanShape(plan), true);
    assert.equal(isPlanShape(null), false);
    assert.equal(isPlanShape({ ...plan, ideas: { items: [{ title: 1 }] } }), false);
    assert.equal(isPlanShape({ ...plan, summary: { daysUntilEvent: 'soon' } }), false);
    assert.equal(isPlanShape({ ...plan, timeline: { tasks: [{ id: 1 }] } }), false);
    assert.equal(isPlanShape({ ...plan, vendors: [{ ...plan.vendors[0], questions: [1] }] }), false);
  });

  it('finds browser storage when present and tolerates its absence', () => {
    assert.equal(browserStorage(), null);
    globalThis.localStorage = memoryStorage();
    assert.ok(browserStorage());
    delete globalThis.localStorage;
  });

  it('tolerates browsers that block access to storage', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError');
      },
    });
    assert.equal(browserStorage(), null);
    delete globalThis.localStorage;
  });
});

describe('api client', () => {
  const okResponse = (body) => ({ ok: true, status: 200, json: async () => body });

  it('sends JSON requests to the right endpoints', async () => {
    const calls = [];
    const api = createApi(async (path, options) => {
      calls.push({ path, options });
      return okResponse({ ok: true });
    });

    await api.getMeta();
    await api.createPlan({ eventName: 'x' }, '2026-10-23');
    await api.requestIdeas({ eventName: 'x' }, '2026-10-23');
    await api.ask({ eventName: 'x' }, '2026-10-23', 'Why?');

    assert.deepEqual(calls.map((call) => [call.path, call.options.method]), [
      ['/api/meta', 'GET'],
      ['/api/plan', 'POST'],
      ['/api/ideas', 'POST'],
      ['/api/ask', 'POST'],
    ]);
    assert.equal(calls[0].options.body, undefined);
    assert.deepEqual(JSON.parse(calls[1].options.body), { event: { eventName: 'x' }, today: '2026-10-23' });
    assert.equal(calls[1].options.headers['Content-Type'], 'application/json');
    assert.equal(JSON.parse(calls[3].options.body).question, 'Why?');
  });

  it('turns API errors into ApiError with field details', async () => {
    const api = createApi(async () => ({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'Bad', errors: [{ field: 'guestCount', message: 'Too few' }] } }),
    }));
    await assert.rejects(api.createPlan({}, 'x'), (error) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, 400);
      assert.equal(error.message, 'Bad');
      assert.deepEqual(error.errors, [{ field: 'guestCount', message: 'Too few' }]);
      return true;
    });
  });

  it('handles error responses that are not JSON', async () => {
    const api = createApi(async () => ({ ok: false, status: 502, json: async () => { throw new Error('html'); } }));
    await assert.rejects(api.getMeta(), (error) => error.status === 502 && /could not be completed/.test(error.message) && error.errors.length === 0);
  });

  it('turns any failure into a list the form can display', () => {
    const fieldErrors = [{ field: 'guestCount', message: 'Too few' }];
    assert.deepEqual(toFieldErrors(new ApiError('Bad', { status: 400, errors: fieldErrors })), fieldErrors);
    assert.deepEqual(toFieldErrors(new ApiError('Server said no', { status: 500 })), [{ field: 'form', message: 'Server said no' }]);
    assert.deepEqual(toFieldErrors(new Error('')), [{ field: 'form', message: 'Something went wrong. Please try again.' }]);
    assert.deepEqual(toFieldErrors(undefined), [{ field: 'form', message: 'Something went wrong. Please try again.' }]);
  });

  it('reports unreachable servers in plain language', async () => {
    const api = createApi(async () => { throw new TypeError('fetch failed'); });
    await assert.rejects(api.getMeta(), /could not be reached/);
  });
});
