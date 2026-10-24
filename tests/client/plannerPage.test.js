import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { ApiError } from '../../public/js/api.js';
import { ELEMENT_IDS, collectElements } from '../../public/js/pageElements.js';
import { buildTestPlan, TODAY } from '../helpers/fixtures.js';
import { byClass, byTag, findAll, installFakeDocument } from '../helpers/fakeDom.js';
import { buildPage, flush } from '../helpers/plannerHarness.js';
import { parseTags, read } from '../helpers/project.js';

before(installFakeDocument);

const stepStates = (els) => els.steps.children.map((item) => item.getAttribute('aria-current') ?? (item.classes.has('is-complete') ? 'done' : 'todo'));
const buttonNamed = (root, label) => byTag(root, 'button').find((button) => button.textContent === label);
const checkboxes = (root) => findAll(root, (node) => node.tagName === 'INPUT' && node.getAttribute('type') === 'checkbox');

async function pageWithPlan(options = {}) {
  const harness = buildPage(options);
  await harness.page.init();
  harness.fillValid();
  await harness.submit();
  return harness;
}

describe('page elements', () => {
  it('finds every element by id', () => {
    const seen = [];
    const doc = { getElementById: (id) => { seen.push(id); return { id }; } };
    const els = collectElements(doc);
    assert.deepEqual(Object.keys(els), Object.keys(ELEMENT_IDS));
    assert.deepEqual(seen, Object.values(ELEMENT_IDS));
  });

  it('only uses ids that exist in the plan page', () => {
    const ids = new Set(parseTags(read('public', 'plan.html')).map((tag) => tag.attrs.id).filter(Boolean));
    for (const [name, id] of Object.entries(ELEMENT_IDS)) assert.ok(ids.has(id), `${name}: #${id}`);
  });
});

describe('starting up', () => {
  it('keeps the form disabled until the settings arrive, then sets it up', async () => {
    const { page, els, fields } = buildPage();
    const starting = page.init();
    assert.equal(els.submit.disabled, true);
    await starting;
    assert.equal(els.submit.disabled, false);
    assert.equal(fields.eventName.maxLength, 80);
    assert.equal(fields.eventDate.min, TODAY);
    assert.equal(byTag(els.priorityOptions, 'input').length, 8, 'priorities for the default event type');
    assert.equal(els.results.hidden, true);
  });

  it('explains when the planner cannot be reached and leaves the form disabled', async () => {
    const { page, els } = buildPage({ metaFails: true });
    await page.init();
    assert.equal(els.submit.disabled, true);
    assert.match(els.info.textContent, /could not be reached/);
    assert.equal(byClass(els.info, 'notice')[0].getAttribute('role'), 'alert');
  });

  it('offers the priorities of whichever event type is chosen', async () => {
    const { page, els, radios } = buildPage();
    await page.init();
    const labels = () => byTag(els.priorityOptions, 'label').map((label) => label.textContent);
    assert.ok(labels().includes('Venue and rentals'));

    radios[0].checked = false;
    radios[2].checked = true;
    radios[2].dispatch('change');
    assert.ok(labels().includes('Permits and insurance'));
    assert.ok(!labels().includes('Venue and rentals'));
  });

  it('restores a saved plan into the form and the results', async () => {
    const plan = buildTestPlan({ eventName: 'Saved Wedding', priorities: ['decor'] });
    const { page, els, fields, store } = buildPage({ saved: { plan, progress: { tasks: {}, steps: {}, spent: {} } } });
    await page.init();
    assert.equal(els.results.hidden, false);
    assert.equal(els.resultsHeading.textContent, 'Saved Wedding');
    assert.equal(fields.eventName.value, 'Saved Wedding');
    assert.equal(els.status.textContent, 'Your saved plan has been restored.');
    assert.equal(byTag(els.priorityOptions, 'input').find((box) => box.value === 'decor').checked, true);
    assert.deepEqual(stepStates(els), ['done', 'step', 'todo']);
    assert.ok(store.load());
  });
});

describe('creating a plan', () => {
  it('sends the form and shows the plan, saves it, celebrates and announces it', async () => {
    const { els, calls, store, fields } = await pageWithPlan();
    assert.equal(calls.plan.length, 1);
    assert.equal(calls.plan[0][0].eventName, 'Asha and Ravi');
    assert.equal(calls.plan[0][1], TODAY);
    assert.equal(els.results.hidden, false);
    assert.equal(els.clear.hidden, false);
    assert.equal(els.resultsHeading.textContent, 'Asha and Ravi');
    assert.equal(els.resultsHeading.focused, true);
    assert.ok(byTag(els.resultsBody, 'table').length >= 1);
    assert.equal(calls.confetti, 1);
    assert.equal(els.status.textContent, 'Plan created for Asha and Ravi.');
    assert.equal(store.load().plan.input.eventName, 'Asha and Ravi');
    assert.deepEqual(stepStates(els), ['done', 'step', 'todo']);
    assert.equal(els.submit.textContent, 'Create my plan');
    assert.equal(els.submit.getAttribute('aria-busy'), 'false');
    assert.equal(fields.eventName.value, 'Asha and Ravi');
  });

  it('shows the busy state while waiting and ignores a second submit', async () => {
    const harness = buildPage();
    await harness.page.init();
    harness.fillValid();
    let release;
    harness.api.createPlan = async () => { await new Promise((resolve) => { release = resolve; }); throw new ApiError('Stopped'); };

    harness.els.form.dispatch('submit');
    assert.equal(harness.els.submit.textContent, 'Creating your plan...');
    assert.equal(harness.els.submit.getAttribute('aria-busy'), 'true');
    const second = harness.els.form.dispatch('submit');
    assert.equal(second.defaultPrevented, true);
    release();
    await flush();
    assert.equal(harness.els.submit.textContent, 'Create my plan');
  });

  it('shows what is wrong with each field and does not show a plan', async () => {
    const harness = buildPage();
    await harness.page.init();
    harness.fillValid({ guestCount: '0', totalBudget: '5' });
    await harness.submit();
    assert.equal(harness.els.results.hidden, true);
    assert.equal(harness.els.errorSummary.hidden, false);
    assert.equal(harness.els.errorSummary.focused, true);
    const links = byTag(harness.els.errorSummary, 'a').map((link) => link.getAttribute('href'));
    assert.deepEqual(links, ['#guestCount', '#totalBudget']);
    assert.equal(harness.calls.confetti, 0);
  });

  it('shows a general message when the server cannot be reached', async () => {
    const harness = buildPage();
    await harness.page.init();
    harness.fillValid();
    harness.setFailure(new ApiError('The planner could not be reached.'));
    await harness.submit();
    assert.match(harness.els.errorSummary.textContent, /could not be reached/);
    assert.equal(harness.els.results.hidden, true);
  });

  it('clears old errors after a successful submit', async () => {
    const harness = buildPage();
    await harness.page.init();
    harness.fillValid({ guestCount: '0' });
    await harness.submit();
    assert.equal(harness.els.errorSummary.hidden, false);
    harness.fillValid();
    await harness.submit();
    assert.equal(harness.els.errorSummary.hidden, true);
  });
});

describe('using the plan', () => {
  it('saves progress and moves to the third step', async () => {
    const { els, store } = await pageWithPlan();
    const [firstTask] = checkboxes(els.resultsBody);
    firstTask.checked = true;
    firstTask.dispatch('change');
    assert.deepEqual(stepStates(els), ['done', 'done', 'step']);
    assert.equal(Object.keys(store.load().progress.tasks).length, 1);
  });

  it('keeps ticks for tasks that still exist when the plan is created again', async () => {
    const harness = await pageWithPlan();
    checkboxes(harness.els.resultsBody)[0].checked = true;
    checkboxes(harness.els.resultsBody)[0].dispatch('change');
    harness.fillValid({ guestCount: '150' });
    await harness.submit();
    assert.equal(Object.keys(harness.store.load().progress.tasks).length, 1);
  });

  it('downloads the plan as a text file with a safe name', async () => {
    const { els, calls } = await pageWithPlan();
    buttonNamed(els.resultsBody, 'Download as text').dispatch('click');
    const [[text, name]] = calls.download;
    assert.equal(name, 'asha-and-ravi-plan.txt');
    assert.match(text, /CELEBRATION PLANNER - EVENT PLAN/);
    assert.equal(els.status.textContent, 'Plan downloaded as a text file.');
  });

  it('prints through the print sheet, which is rebuilt just before printing', async () => {
    const { els, windowEvents } = await pageWithPlan();
    let printed = 0;
    globalThis.window = { print: () => { printed += 1; } };
    buttonNamed(els.resultsBody, 'Print').dispatch('click');
    delete globalThis.window;
    assert.equal(printed, 1);

    assert.equal(els.printRoot.children.length, 0);
    windowEvents.beforeprint();
    assert.equal(els.printRoot.children.length, 1);
    assert.match(els.printRoot.textContent, /Asha and Ravi/);
  });

  it('takes the visitor back to the form to edit details', async () => {
    const { els } = await pageWithPlan();
    buttonNamed(els.resultsBody, 'Edit details').dispatch('click');
    assert.equal(els.formHeading.focused, true);
    assert.deepEqual(els.formHeading.scrolledTo, { block: 'start' });
  });
});

describe('Gemini ideas and questions', () => {
  it('replaces the ideas with AI ideas and says so', async () => {
    const harness = await pageWithPlan({ aiEnabled: true });
    const button = buttonNamed(harness.els.resultsBody, 'Generate ideas with AI');
    button.dispatch('click');
    assert.match(harness.els.resultsBody.textContent, /Generating ideas/);
    await flush();
    assert.match(harness.els.resultsBody.textContent, /Lantern release/);
    assert.match(harness.els.resultsBody.textContent, /New ideas generated\./);
    assert.equal(harness.store.load().plan.ideas.source, 'ai');
    assert.equal(harness.calls.ideas.length, 1);
  });

  it('says when it fell back to built-in ideas', async () => {
    const harness = await pageWithPlan({ aiEnabled: true });
    harness.setIdeas({ source: 'builtin', items: [{ title: 'Seasonal florals', detail: 'x', category: 'Decor', matchedOn: [] }] });
    buttonNamed(harness.els.resultsBody, 'Generate ideas with AI').dispatch('click');
    await flush();
    assert.match(harness.els.resultsBody.textContent, /unavailable right now, so built-in ideas are shown/);
  });

  it('shows an error when ideas cannot be fetched', async () => {
    const harness = await pageWithPlan({ aiEnabled: true });
    harness.setFailure(new ApiError('Too many requests.'));
    buttonNamed(harness.els.resultsBody, 'Generate ideas with AI').dispatch('click');
    await flush();
    assert.match(harness.els.resultsBody.textContent, /Too many requests\./);
  });

  it('does not offer AI ideas when Gemini is off', async () => {
    const { els } = await pageWithPlan({ aiEnabled: false });
    assert.equal(buttonNamed(els.resultsBody, 'Generate ideas with AI'), undefined);
  });

  it('answers questions about the plan', async () => {
    const harness = await pageWithPlan();
    const form = byClass(harness.els.resultsBody, 'ask-form')[0];
    byTag(form, 'textarea')[0].value = 'What next?';
    form.dispatch('submit');
    await flush();
    assert.deepEqual(harness.calls.ask[0].slice(1), [TODAY, 'What next?']);
    assert.match(harness.els.resultsBody.textContent, /Your next tasks are listed on the Timeline tab\./);
  });

  it('shows an error when a question cannot be answered', async () => {
    const harness = await pageWithPlan();
    harness.setFailure(new ApiError('Not reachable.'));
    const form = byClass(harness.els.resultsBody, 'ask-form')[0];
    byTag(form, 'textarea')[0].value = 'What next?';
    form.dispatch('submit');
    await flush();
    assert.match(harness.els.resultsBody.textContent, /Not reachable\./);
  });
});

describe('clearing the saved plan', () => {
  it('asks first, then clears everything and returns to the first step', async () => {
    const harness = await pageWithPlan();
    const { els, store, fields, calls } = harness;
    els.clear.dispatch('click');
    assert.equal(els.dialog.open, true);
    assert.ok(store.load(), 'nothing is cleared until the visitor confirms');

    els.confirmYes.dispatch('click');
    assert.equal(store.load(), null);
    assert.equal(els.results.hidden, true);
    assert.equal(els.clear.hidden, true);
    assert.equal(fields.eventName.value, '');
    assert.deepEqual(stepStates(els), ['step', 'todo', 'todo']);
    assert.equal(els.status.textContent, 'Saved plan cleared.');
    assert.equal(calls.scheduled.length, 1);
    assert.equal(els.formHeading.focused, false);
    calls.scheduled[0]();
    assert.equal(els.formHeading.focused, true);
  });

  it('falls back to the browser confirmation without dialog support', async () => {
    const harness = await pageWithPlan();
    harness.els.dialog = {};
    const asked = [];
    globalThis.window = { confirm: (message) => { asked.push(message); return true; } };
    harness.els.clear.dispatch('click');
    delete globalThis.window;
    assert.match(asked[0], /Clear your saved plan/);
    assert.equal(harness.store.load(), null);
  });
});
