import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { h } from '../../public/js/dom.js';
import { PIECES, launchConfetti } from '../../public/js/confetti.js';
import { openConfirm } from '../../public/js/confirmDialog.js';
import { markStep } from '../../public/js/stepper.js';
import { downloadTextFile } from '../../public/js/download.js';
import { pickLocale } from '../../public/js/format.js';
import { applyLimits, clearErrors, readEvent, renderPriorities, showErrors, writeEvent } from '../../public/js/formView.js';
import { emptyProgress } from '../../public/js/progress.js';
import { buildResults } from '../../public/js/resultsView.js';
import { buildTestPlan } from '../helpers/fixtures.js';
import { byTag, installFakeDocument } from '../helpers/fakeDom.js';

before(installFakeDocument);

const TEXT_FIELDS = ['eventName', 'eventDate', 'guestCount', 'totalBudget', 'currency', 'location', 'theme', 'interests'];

// A form made from the same pieces the real page uses.
function buildForm() {
  const form = h('form');
  const fields = Object.fromEntries(TEXT_FIELDS.map((name) => [name, h('input', { id: name, name })]));
  const radios = ['wedding', 'birthday'].map((value) => h('input', { type: 'radio', name: 'eventType', id: `type-${value}`, value }));
  const group = { value: 'wedding' };
  form.elements = { ...fields, eventType: group };
  const slots = [...TEXT_FIELDS, 'eventType', 'priorities'].map((field) => h('p', { class: 'field-error', id: `error-${field}`, hidden: true }));
  form.append(...Object.values(fields), ...radios, ...slots, h('div', { id: 'priority-options' }));
  return { form, fields, radios, group };
}

function buildSummary() {
  return h('div', { id: 'error-summary', tabindex: '-1', hidden: true }, h('ul'));
}

describe('form view', () => {
  it('reads values and chosen priorities', () => {
    const { form, fields } = buildForm();
    fields.eventName.value = 'Party';
    fields.guestCount.value = '40';
    const checked = h('input', { type: 'checkbox', name: 'priorities', value: 'venue', checked: true });
    const unchecked = h('input', { type: 'checkbox', name: 'priorities', value: 'decor' });
    form.append(checked, unchecked);

    const event = readEvent(form);
    assert.equal(event.eventType, 'wedding');
    assert.equal(event.eventName, 'Party');
    assert.equal(event.guestCount, '40');
    assert.deepEqual(event.priorities, ['venue']);
  });

  it('writes saved values back into the form', () => {
    const { form, fields, radios } = buildForm();
    writeEvent(form, { eventType: 'birthday', eventName: 'Mia', guestCount: 20, theme: undefined });
    assert.equal(radios[1].checked, true);
    assert.equal(fields.eventName.value, 'Mia');
    assert.equal(fields.guestCount.value, 20);
    assert.equal(fields.theme.value, '');
    assert.doesNotThrow(() => writeEvent(form, { eventType: 'unknown' }));
  });

  it('applies server limits to the controls', () => {
    const { form, fields } = buildForm();
    applyLimits(form, { nameMax: 80, locationMax: 70, themeMax: 60, interestsMax: 300, guestsMax: 5000, budgetMin: 100 }, '2026-10-23');
    assert.equal(fields.eventName.maxLength, 80);
    assert.equal(fields.interests.maxLength, 300);
    assert.equal(fields.guestCount.max, 5000);
    assert.equal(fields.totalBudget.min, 100);
    assert.equal(fields.eventDate.min, '2026-10-23');
  });

  it('builds priority checkboxes and enforces the limit by disabling the rest', () => {
    const container = h('div');
    const options = ['a', 'b', 'c', 'd'].map((key) => ({ key, label: key.toUpperCase() }));
    renderPriorities(container, options, ['a'], 2);
    const boxes = byTag(container, 'input');
    assert.equal(boxes.length, 4);
    assert.equal(boxes[0].checked, true);
    assert.ok(boxes.every((box) => !box.disabled));
    assert.ok(byTag(container, 'label').every((label) => label.children.length === 2));

    boxes[1].checked = true;
    boxes[1].dispatch('change');
    assert.deepEqual(boxes.map((box) => box.disabled), [false, false, true, true]);

    boxes[1].checked = false;
    boxes[1].dispatch('change');
    assert.ok(boxes.every((box) => !box.disabled));
  });

  it('shows validation errors in a linked summary and next to each field', () => {
    const { form, fields } = buildForm();
    const summary = buildSummary();
    showErrors(form, summary, [
      { field: 'guestCount', message: 'Enter a guest count.' },
      { field: 'eventType', message: 'Choose an event type.' },
      { field: 'form', message: 'Server unavailable.' },
    ]);

    assert.equal(summary.hidden, false);
    assert.equal(summary.focused, true);
    const links = byTag(summary, 'a');
    assert.deepEqual(links.map((link) => link.getAttribute('href')), ['#guestCount', '#type-wedding', '#submit-button']);
    assert.equal(form.querySelector('#error-guestCount').textContent, 'Enter a guest count.');
    assert.equal(form.querySelector('#error-guestCount').hidden, false);
    assert.equal(fields.guestCount.getAttribute('aria-invalid'), 'true');
    assert.equal(form.querySelector('#error-eventName').hidden, true);
  });

  it('only marks real form controls as invalid', () => {
    const { form } = buildForm();
    showErrors(form, buildSummary(), [{ field: 'priorities', message: 'Too many.' }]);
    assert.equal(form.querySelector('#priority-options').getAttribute('aria-invalid'), null);
  });

  it('clears every error', () => {
    const { form, fields } = buildForm();
    const summary = buildSummary();
    showErrors(form, summary, [{ field: 'eventName', message: 'Required.' }]);
    clearErrors(form, summary);
    assert.equal(summary.hidden, true);
    assert.equal(byTag(summary, 'ul')[0].children.length, 0);
    assert.equal(fields.eventName.getAttribute('aria-invalid'), null);
    assert.equal(form.querySelector('#error-eventName').textContent, '');
    assert.equal(form.querySelector('#error-eventName').hidden, true);
  });
});

describe('locale and downloads', () => {
  it('uses supported browser languages and falls back to English', () => {
    assert.equal(pickLocale('fr-FR'), 'fr-FR');
    assert.equal(pickLocale('en-IN'), 'en-IN');
    assert.equal(pickLocale('not a locale!'), 'en');
    assert.equal(pickLocale(undefined), 'en');
  });

  it('downloads text through a temporary link', () => {
    const calls = [];
    globalThis.document.body = { append: (link) => calls.push(['append', link.getAttribute('download')]) };
    globalThis.URL.createObjectURL = (blob) => { calls.push(['url', blob.type]); return 'blob:test'; };
    globalThis.URL.revokeObjectURL = (url) => calls.push(['revoke', url]);
    const originalCreate = globalThis.document.createElement;
    globalThis.document.createElement = (tag) => {
      const node = originalCreate(tag);
      node.click = () => calls.push(['click']);
      node.remove = () => calls.push(['remove']);
      return node;
    };

    downloadTextFile('hello', 'plan.txt');
    assert.deepEqual(calls.map((call) => call[0]), ['url', 'append', 'click', 'remove', 'revoke']);
    assert.deepEqual(calls[1], ['append', 'plan.txt']);
    assert.equal(calls[0][1], 'text/plain;charset=utf-8');
    globalThis.document.createElement = originalCreate;
  });
});

describe('results view', () => {
  const plan = buildTestPlan();
  const meta = { aiEnabled: true, limits: { questionMax: 500 } };

  function build(overrides = {}) {
    const calls = { progress: [], ai: 0, asks: [], download: 0, print: 0, edit: 0 };
    const results = buildResults({
      plan,
      progress: emptyProgress(),
      meta,
      today: '2026-10-23',
      locale: 'en',
      actions: {
        onProgressChange: (progress) => calls.progress.push(progress),
        onRequestAiIdeas: () => { calls.ai += 1; },
        onAsk: (question) => calls.asks.push(question),
        onDownload: () => { calls.download += 1; },
        onPrint: () => { calls.print += 1; },
        onEditDetails: () => { calls.edit += 1; },
      },
      ...overrides,
    });
    return { results, calls };
  }

  it('assembles the heading line, summary, actions and five tabs', () => {
    const { results } = build();
    const root = h('div', {}, ...results.nodes);
    assert.match(root.textContent, /Wedding on .* with 120 guests/);
    assert.equal(byTag(root, 'button').filter((button) => button.getAttribute('role') === 'tab').length, 5);
    assert.deepEqual(
      byTag(root, 'button').filter((button) => button.classes.has('button-secondary') && !button.getAttribute('role')).map((button) => button.textContent).slice(0, 3),
      ['Download as text', 'Print', 'Edit details'],
    );
  });

  it('wires the action buttons', () => {
    const { results, calls } = build();
    const root = h('div', {}, ...results.nodes);
    const press = (label) => byTag(root, 'button').find((button) => button.textContent === label).dispatch('click');
    press('Download as text');
    press('Print');
    press('Edit details');
    press('Generate ideas with AI');
    assert.deepEqual([calls.download, calls.print, calls.edit, calls.ai], [1, 1, 1, 1]);
  });

  it('reports progress changes cumulatively and keeps the summary current', () => {
    const { results, calls } = build();
    const root = h('div', {}, ...results.nodes);
    const timelineBoxes = byTag(root, 'input').filter((input) => input.getAttribute('type') === 'checkbox');

    timelineBoxes[0].checked = true;
    timelineBoxes[0].dispatch('change');
    timelineBoxes[1].checked = true;
    timelineBoxes[1].dispatch('change');

    assert.equal(Object.keys(calls.progress.at(-1).tasks).length, 2);
    assert.match(root.textContent, /2 of 22/);
  });

  it('forwards spending and vendor step changes', () => {
    const { results, calls } = build();
    const root = h('div', {}, ...results.nodes);
    const spent = byTag(root, 'input').find((input) => input.getAttribute('aria-label') === 'Amount spent on Venue and rentals');
    spent.value = '2500';
    spent.dispatch('input');
    assert.equal(calls.progress.at(-1).spent.venue, 2500);

    const step = byTag(root, 'input').find((input) => input.parentNode.textContent.startsWith('Shortlist'));
    step.checked = true;
    step.dispatch('change');
    assert.equal(Object.keys(calls.progress.at(-1).steps).length, 1);
    assert.equal(calls.progress.at(-1).spent.venue, 2500);
  });

  it('passes questions to the ask handler and exposes the child views', () => {
    const { results, calls } = build();
    results.ask.input.value = 'What next?';
    results.ask.form.dispatch('submit');
    assert.deepEqual(calls.asks, ['What next?']);
    assert.equal(typeof results.ideas.setIdeas, 'function');
  });

  it('hides the AI button when AI is not configured', () => {
    const { results } = build({ meta: { aiEnabled: false, limits: { questionMax: 500 } } });
    const root = h('div', {}, ...results.nodes);
    assert.equal(byTag(root, 'button').some((button) => button.textContent === 'Generate ideas with AI'), false);
  });
});

describe('confetti', () => {
  it('adds a decorative layer of pieces and removes it later', () => {
    const appended = [];
    globalThis.document.body = { append: (node) => appended.push(node) };
    const scheduled = [];
    const layer = launchConfetti({ reducedMotion: false, random: () => 0.5, schedule: (fn, ms) => scheduled.push([fn, ms]) });

    assert.equal(appended[0], layer);
    assert.equal(layer.getAttribute('aria-hidden'), 'true');
    assert.equal(layer.children.length, PIECES);
    assert.ok(layer.children.every((piece) => piece.styles.has('--x') && piece.styles.has('--duration')));
    assert.deepEqual(new Set(layer.children.map((piece) => piece.className.split(' ')[1])).size, 5);

    let removed = false;
    layer.remove = () => { removed = true; };
    scheduled[0][0]();
    assert.equal(removed, true);
    assert.ok(scheduled[0][1] > 3000);
  });

  it('does nothing for visitors who prefer reduced motion', () => {
    let touched = false;
    globalThis.document.body = { append: () => { touched = true; } };
    assert.equal(launchConfetti({ reducedMotion: true }), null);
    assert.equal(touched, false);
  });

  it('detects the reduced motion preference from the browser', () => {
    globalThis.matchMedia = () => ({ matches: true });
    assert.equal(launchConfetti(), null);
    delete globalThis.matchMedia;
    globalThis.document.body = { append() {} };
    assert.ok(launchConfetti({ schedule: () => {} }));
  });
});

describe('stepper and confirmation dialog', () => {
  it('marks the current step and completed steps', () => {
    const list = h('ol', {}, h('li'), h('li'), h('li'));
    markStep(list, 2);
    const [first, second, third] = list.children;
    assert.equal(first.classes.has('is-complete'), true);
    assert.equal(first.getAttribute('aria-current'), null);
    assert.equal(second.getAttribute('aria-current'), 'step');
    assert.equal(third.classes.has('is-complete'), false);

    markStep(list, 1);
    assert.equal(first.getAttribute('aria-current'), 'step');
    assert.equal(second.getAttribute('aria-current'), null);
    assert.equal(first.classes.has('is-complete'), false);
  });

  it('opens the native dialog when it is supported', () => {
    const dialog = { returnValue: 'confirm', open: false, showModal() { this.open = true; } };
    let confirmed = false;
    openConfirm(dialog, 'Sure?', () => { confirmed = true; });
    assert.equal(dialog.open, true);
    assert.equal(dialog.returnValue, '');
    assert.equal(confirmed, false);
  });

  it('falls back to window.confirm without dialog support', () => {
    const calls = [];
    globalThis.window = { confirm: (message) => { calls.push(message); return calls.length === 1; } };
    let confirmed = 0;
    openConfirm({}, 'Sure?', () => { confirmed += 1; });
    openConfirm({}, 'Sure?', () => { confirmed += 1; });
    assert.deepEqual(calls, ['Sure?', 'Sure?']);
    assert.equal(confirmed, 1);
    delete globalThis.window;
  });
});
