// Builds a fake version of the Plan an event page: the same element names the
// page script expects, a fake server that uses the real planner, and spies for
// everything that would touch the browser.

import { ApiError } from '../../public/js/api.js';
import { h } from '../../public/js/dom.js';
import { createPlannerPage } from '../../public/js/plannerPage.js';
import { createStore } from '../../public/js/store.js';
import { addDays } from '../../src/planner/dates.js';
import { describeCurrencies, describeEventTypes } from '../../src/planner/eventTypes.js';
import { planFromRequest } from '../../src/planner/plan.js';
import { LIMITS } from '../../src/planner/validate.js';
import { TODAY } from './fixtures.js';

export const FIELD_NAMES = ['eventName', 'eventDate', 'guestCount', 'totalBudget', 'currency', 'location', 'theme', 'interests'];

export function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
    data,
  };
}

export const flush = () => new Promise((resolve) => setImmediate(resolve));

function buildForm() {
  const fields = Object.fromEntries(FIELD_NAMES.map((name) => [name, h('input', { id: name, name })]));
  const radios = ['wedding', 'birthday', 'community'].map((value) => h('input', { type: 'radio', name: 'eventType', id: `type-${value}`, value }));
  const group = {
    get value() {
      return radios.find((radio) => radio.checked)?.value ?? '';
    },
    forEach: (callback) => radios.forEach(callback),
  };
  const priorityOptions = h('div', { id: 'priority-options' });
  const slots = [...FIELD_NAMES, 'eventType', 'priorities'].map((name) => h('p', { class: 'field-error', id: `error-${name}`, hidden: true }));

  const form = h('form', {}, ...Object.values(fields), ...radios, ...slots, priorityOptions);
  form.elements = { ...fields, eventType: group };
  form.reset = () => {
    for (const name of FIELD_NAMES) fields[name].value = '';
    fields.currency.value = 'INR';
    radios.forEach((radio, index) => { radio.checked = index === 0; });
  };
  form.reset();
  return { form, fields, radios, priorityOptions };
}

export function buildPage({ aiEnabled = false, saved = null, metaFails = false, today = TODAY } = {}) {
  const { form, fields, radios, priorityOptions } = buildForm();
  const els = {
    form,
    formHeading: h('h2'),
    status: h('p'),
    errorSummary: h('div', { tabindex: '-1', hidden: true }, h('ul')),
    submit: h('button', { id: 'submit-button' }),
    clear: h('button', { hidden: true }),
    priorityOptions,
    info: h('aside'),
    results: h('div', { hidden: true }),
    resultsHeading: h('h2'),
    resultsBody: h('div'),
    dialog: { returnValue: '', open: false, showModal() { this.open = true; } },
    confirmYes: h('button'),
    steps: h('ol', {}, h('li', { 'aria-current': 'step' }), h('li'), h('li')),
    printRoot: h('div'),
  };

  const meta = {
    eventTypes: describeEventTypes(),
    currencies: describeCurrencies(),
    maxPriorities: 3,
    limits: { ...LIMITS, questionMax: 500, historyMax: 10 },
    aiEnabled,
  };

  const calls = { plan: [], ideas: [], ask: [], download: [], confetti: 0, scheduled: [] };
  let nextIdeas = { source: 'ai', items: [{ title: 'Lantern release', detail: 'At dusk.', category: 'Decor', matchedOn: [] }] };
  let failure = null;
  const api = {
    getMeta: async () => {
      if (metaFails) throw new ApiError('The planner could not be reached.');
      return meta;
    },
    createPlan: async (event, day) => {
      calls.plan.push([event, day]);
      if (failure) throw failure;
      const result = planFromRequest(event, day);
      if (!result.ok) throw new ApiError('Some event details need attention.', { status: 400, errors: result.errors });
      return { plan: result.plan };
    },
    requestIdeas: async (event, day) => {
      calls.ideas.push([event, day]);
      if (failure) throw failure;
      return { ideas: nextIdeas };
    },
    ask: async (event, day, question) => {
      calls.ask.push([event, day, question]);
      if (failure) throw failure;
      return { source: 'builtin', answer: 'Your next tasks are listed on the Timeline tab.' };
    },
  };

  const storage = memoryStorage();
  const store = createStore(storage);
  if (saved) store.save(saved);

  const windowEvents = {};
  const win = { addEventListener: (type, listener) => { windowEvents[type] = listener; } };
  const page = createPlannerPage({
    els,
    api,
    store,
    locale: 'en',
    win,
    today: () => today,
    confetti: () => { calls.confetti += 1; },
    download: (text, name) => calls.download.push([text, name]),
    schedule: (callback) => calls.scheduled.push(callback),
  });

  return {
    page,
    els,
    fields,
    radios,
    calls,
    store,
    storage,
    windowEvents,
    api,
    setFailure: (error) => { failure = error; },
    setIdeas: (ideas) => { nextIdeas = ideas; },
    fillValid(overrides = {}) {
      const values = {
        eventName: 'Asha and Ravi',
        eventDate: addDays(today, 120),
        guestCount: '120',
        totalBudget: '2500000',
        currency: 'INR',
        ...overrides,
      };
      for (const [name, value] of Object.entries(values)) fields[name].value = value;
    },
    async submit() {
      const event = form.dispatch('submit');
      await flush();
      return event;
    },
  };
}
