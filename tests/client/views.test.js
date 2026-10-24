import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { h } from '../../public/js/dom.js';
import { emptyProgress, setSpent, setStepDone, setTaskDone } from '../../public/js/progress.js';
import { createAskView } from '../../public/js/views/ask.js';
import { createBudgetView, parseAmount } from '../../public/js/views/budget.js';
import { SOURCE_LABELS, createIdeasView, groupByCategory } from '../../public/js/views/ideas.js';
import { createSummary } from '../../public/js/views/summary.js';
import { createTabs } from '../../public/js/views/tabs.js';
import { createTimelineView, groupByPhase } from '../../public/js/views/timeline.js';
import { createVendorsView } from '../../public/js/views/vendors.js';
import { addDays } from '../../src/planner/dates.js';
import { buildTestPlan, TODAY } from '../helpers/fixtures.js';
import { byClass, byRole, byTag, findAll, installFakeDocument } from '../helpers/fakeDom.js';

const plan = buildTestPlan({ priorities: ['photography'] });
const noop = () => {};

before(installFakeDocument);

describe('dom helper', () => {
  it('builds elements with attributes, classes, properties and children', () => {
    const clicks = [];
    const node = h(
      'button',
      { class: 'a b', type: 'button', disabled: true, 'aria-label': 'Go', on: { click: () => clicks.push(1) }, hidden: false, skipped: null },
      'Hello ',
      ['nested', null, false],
      h('b', { text: 'bold' }),
    );
    assert.equal(node.tagName, 'BUTTON');
    assert.equal(node.className, 'a b');
    assert.equal(node.getAttribute('type'), 'button');
    assert.equal(node.getAttribute('aria-label'), 'Go');
    assert.equal(node.getAttribute('skipped'), null);
    assert.equal(node.disabled, true);
    assert.equal(node.hidden, false);
    assert.equal(node.textContent, 'Hello nestedbold');
    node.dispatch('click');
    assert.equal(clicks.length, 1);
  });

  it('treats markup in text as plain text', () => {
    const node = h('p', { text: '<img src=x onerror=alert(1)>' }, '<script>');
    assert.equal(byTag(node, 'img').length, 0);
    assert.equal(byTag(node, 'script').length, 0);
    assert.ok(node.children.every((child) => child.nodeType === 3));
    assert.equal(node.textContent, '<img src=x onerror=alert(1)><script>');
  });

  it('writes boolean attributes as empty strings', () => {
    assert.equal(h('div', { 'data-flag': true }).getAttribute('data-flag'), '');
  });
});

describe('summary view', () => {
  const view = createSummary({ plan, progress: emptyProgress(), today: TODAY, locale: 'en' });

  it('shows countdown, per-guest budget, spending and task progress', () => {
    const text = view.element.textContent;
    assert.match(text, /365 days/);
    assert.match(text, /Budget per guest/);
    assert.match(text, /0 of 22/);
  });

  it('updates when progress changes', () => {
    const progress = setSpent(setTaskDone(emptyProgress(), plan.timeline.tasks[0].id, true), 'venue', 500);
    view.refresh(progress);
    assert.match(view.element.textContent, /1 of 22/);
    assert.match(view.element.textContent, /500/);
    const [bar] = byTag(view.element, 'progress');
    assert.equal(bar.value, 5);
  });

  it('explains a compressed timeline', () => {
    const near = buildTestPlan({ eventDate: addDays(TODAY, 30) });
    const text = createSummary({ plan: near, progress: emptyProgress(), today: TODAY, locale: 'en' }).element.textContent;
    assert.match(text, /compressed/);
    assert.doesNotMatch(view.element.textContent, /compressed/);
  });

  it('describes events that are today or past', () => {
    const today = buildTestPlan({ eventDate: TODAY });
    assert.match(createSummary({ plan: today, progress: emptyProgress(), today: TODAY, locale: 'en' }).element.textContent, /Today/);
    assert.match(createSummary({ plan, progress: emptyProgress(), today: '2030-01-01', locale: 'en' }).element.textContent, /has passed/);
  });

  it('labels the progress bar', () => {
    const [label] = byTag(view.element, 'label');
    assert.equal(label.getAttribute('for'), 'task-progress');
    assert.equal(byTag(view.element, 'progress')[0].getAttribute('id'), 'task-progress');
  });
});

describe('budget view', () => {
  it('parses amounts leniently but never negatively', () => {
    assert.equal(parseAmount('1500'), 1500);
    assert.equal(parseAmount(' 12.5 '), 12.5);
    for (const text of ['', '  ', '-5', 'abc', '0', 'Infinity']) assert.equal(parseAmount(text), 0, text);
  });

  it('renders a labelled table with one row per category and a total', () => {
    const { element } = createBudgetView({ plan, progress: emptyProgress(), locale: 'en', onSpentChange: noop });
    const [table] = byTag(element, 'table');
    assert.equal(byTag(table, 'caption').length, 1);
    assert.equal(byTag(byTag(table, 'tbody')[0], 'tr').length, plan.budget.lines.length);
    assert.equal(byTag(table, 'tfoot').length, 1);
    assert.ok(byTag(table, 'th').filter((cell) => cell.getAttribute('scope') === 'col').length === 5);
    assert.match(element.textContent, /Priority/);
  });

  it('gives every spending input an accessible name', () => {
    const { element } = createBudgetView({ plan, progress: emptyProgress(), locale: 'en', onSpentChange: noop });
    const inputs = byTag(element, 'input');
    assert.equal(inputs.length, plan.budget.lines.length);
    assert.ok(inputs.every((input) => /^Amount spent on /.test(input.getAttribute('aria-label'))));
  });

  it('updates remaining amounts and notifies when spending changes', () => {
    const changes = [];
    const { element } = createBudgetView({
      plan,
      progress: emptyProgress(),
      locale: 'en',
      onSpentChange: (key, amount) => changes.push([key, amount]),
    });
    const [venueInput] = byTag(element, 'input');
    const venue = plan.budget.lines[0];

    venueInput.value = String(venue.amount + 10);
    venueInput.dispatch('input');
    assert.deepEqual(changes[0], ['venue', venue.amount + 10]);
    const overCells = byClass(element, 'is-over');
    assert.ok(overCells.length >= 1);
    assert.match(overCells[0].textContent, /Over by .*10/);

    venueInput.value = '';
    venueInput.dispatch('input');
    assert.deepEqual(changes[1], ['venue', 0]);
    assert.equal(byClass(element, 'is-over').length, 0);
  });

  it('shows previously saved spending', () => {
    const { element } = createBudgetView({
      plan,
      progress: setSpent(emptyProgress(), 'venue', 1000),
      locale: 'en',
      onSpentChange: noop,
    });
    assert.equal(byTag(element, 'input')[0].value, 1000);
  });
});

describe('timeline view', () => {
  it('groups consecutive tasks by phase', () => {
    const groups = groupByPhase(plan.timeline.tasks);
    assert.equal(groups.reduce((total, group) => total + group.tasks.length, 0), plan.timeline.tasks.length);
    for (let index = 1; index < groups.length; index += 1) assert.notEqual(groups[index].phase, groups[index - 1].phase);
  });

  it('renders every task as a labelled checkbox with a date and status', () => {
    const { element } = createTimelineView({ plan, progress: emptyProgress(), today: TODAY, locale: 'en', onToggle: noop });
    const boxes = findAll(element, (node) => node.tagName === 'INPUT');
    assert.equal(boxes.length, plan.timeline.tasks.length);
    assert.ok(boxes.every((box) => box.getAttribute('type') === 'checkbox' && box.parentNode.tagName === 'LABEL'));
    assert.equal(byTag(element, 'time').length, plan.timeline.tasks.length);
    assert.ok(byTag(element, 'time').every((time) => /^\d{4}-\d{2}-\d{2}$/.test(time.getAttribute('datetime'))));
    assert.ok(byTag(element, 'h4').length >= 3);
  });

  it('updates status and notifies when a task is ticked', () => {
    const toggles = [];
    const { element } = createTimelineView({
      plan,
      progress: emptyProgress(),
      today: TODAY,
      locale: 'en',
      onToggle: (id, done) => toggles.push([id, done]),
    });
    const [box] = byTag(element, 'input');
    const item = box.parentNode.parentNode;
    assert.match(item.textContent, /Due today/);

    box.checked = true;
    box.dispatch('change');
    assert.deepEqual(toggles[0], [plan.timeline.tasks[0].id, true]);
    assert.ok(item.classes.has('is-done'));
    assert.match(item.textContent, /Done/);

    box.checked = false;
    box.dispatch('change');
    assert.ok(!item.classes.has('is-done'));
  });

  it('flags overdue tasks in words and restores completed ones', () => {
    const firstId = plan.timeline.tasks[0].id;
    const { element } = createTimelineView({
      plan,
      progress: setTaskDone(emptyProgress(), firstId, true),
      today: addDays(TODAY, 8),
      locale: 'en',
      onToggle: noop,
    });
    const boxes = byTag(element, 'input');
    assert.equal(boxes[0].checked, true);
    assert.match(element.textContent, /Overdue by 3 days/);
    assert.ok(byClass(element, 'status-overdue').length > 0);
  });
});

describe('vendors view', () => {
  it('renders collapsible vendors with checklists and questions', () => {
    const { element } = createVendorsView({ plan, progress: emptyProgress(), locale: 'en', onToggleStep: noop });
    assert.equal(byTag(element, 'details').length, plan.vendors.length);
    assert.equal(byTag(element, 'summary').length, plan.vendors.length);
    assert.equal(findAll(element, (node) => node.tagName === 'INPUT').length, plan.vendors.length * 4);
    assert.match(element.textContent, /Questions to ask/);
    assert.match(element.textContent, /0 of 4 steps done/);
    assert.match(element.textContent, /Essential/);
    assert.match(element.textContent, /Priority/);
  });

  it('tracks completed steps', () => {
    const toggles = [];
    const { element } = createVendorsView({
      plan,
      progress: emptyProgress(),
      locale: 'en',
      onToggleStep: (id, done) => toggles.push([id, done]),
    });
    const [box] = byTag(element, 'input');
    box.checked = true;
    box.dispatch('change');
    assert.deepEqual(toggles[0], [`${plan.vendors[0].key}-shortlist`, true]);
    assert.match(byTag(element, 'summary')[0].textContent, /1 of 4 steps done/);

    box.checked = false;
    box.dispatch('change');
    assert.match(byTag(element, 'summary')[0].textContent, /0 of 4 steps done/);
  });

  it('restores saved steps', () => {
    const vendor = plan.vendors[0];
    const { element } = createVendorsView({
      plan,
      progress: setStepDone(emptyProgress(), vendor.checklist[1].id, true),
      locale: 'en',
      onToggleStep: noop,
    });
    assert.match(byTag(element, 'summary')[0].textContent, /1 of 4 steps done/);
    assert.equal(byTag(element, 'input')[1].checked, true);
  });
});

describe('ideas view', () => {
  const ideas = {
    source: 'builtin',
    items: [
      { title: 'A', detail: 'a', category: 'Decor', matchedOn: ['garden'] },
      { title: 'B', detail: 'b', category: 'Food', matchedOn: [] },
      { title: 'C', detail: 'c', category: 'Decor', matchedOn: [] },
    ],
  };

  it('groups ideas by category in order of first appearance', () => {
    const groups = groupByCategory(ideas.items);
    assert.deepEqual(groups.map((group) => [group.category, group.entries.length]), [['Decor', 2], ['Food', 1]]);
  });

  it('shows the source and why an idea matched', () => {
    const view = createIdeasView({ ideas, aiEnabled: false, onRequestAi: noop });
    assert.equal(view.sourceNote.textContent, SOURCE_LABELS.builtin);
    assert.match(view.element.textContent, /Matches your interests: garden/);
    assert.match(view.element.textContent, /switched off/);
    assert.equal(byTag(view.element, 'button').length, 0);
  });

  it('offers AI generation only when it is enabled', () => {
    let requests = 0;
    const view = createIdeasView({ ideas, aiEnabled: true, onRequestAi: () => { requests += 1; } });
    const [button] = byTag(view.element, 'button');
    button.dispatch('click');
    assert.equal(requests, 1);

    view.setBusy(true, 'Working');
    assert.equal(button.disabled, true);
    assert.equal(button.getAttribute('aria-busy'), 'true');
    assert.equal(view.message.textContent, 'Working');
    view.setBusy(false);
    assert.equal(button.disabled, false);
    assert.equal(view.message.textContent, '');
  });

  it('replaces ideas and updates the source note', () => {
    const view = createIdeasView({ ideas, aiEnabled: true, onRequestAi: noop });
    view.setIdeas({ source: 'ai', items: [{ title: 'Z', detail: 'z', category: 'New', matchedOn: [] }] });
    assert.equal(view.sourceNote.textContent, SOURCE_LABELS.ai);
    assert.match(view.element.textContent, /Z/);
    assert.doesNotMatch(view.element.textContent, /Matches your interests/);
  });

  it('shows hostile idea text as plain text', () => {
    const view = createIdeasView({
      ideas: { source: 'ai', items: [{ title: '<img src=x onerror=alert(1)>', detail: '<script>x</script>', category: '<b>c</b>' }] },
      aiEnabled: false,
      onRequestAi: noop,
    });
    assert.equal(byTag(view.element, 'img').length, 0);
    assert.equal(byTag(view.element, 'script').length, 0);
    assert.equal(byTag(view.element, 'b').length, 0);
  });
});

describe('ask view', () => {
  it('submits trimmed questions and ignores empty ones', () => {
    const asked = [];
    const view = createAskView({ maxLength: 500, onAsk: (question) => asked.push(question) });
    view.input.value = '   ';
    const empty = view.form.dispatch('submit');
    view.input.value = '  What next?  ';
    const real = view.form.dispatch('submit');
    assert.deepEqual(asked, ['What next?']);
    assert.ok(empty.defaultPrevented && real.defaultPrevented);
  });

  it('has a labelled input with a length limit and a polite live region', () => {
    const view = createAskView({ maxLength: 321, onAsk: noop });
    assert.equal(view.input.getAttribute('maxlength'), '321');
    assert.equal(byTag(view.element, 'label')[0].getAttribute('for'), view.input.getAttribute('id'));
    const [region] = byRole(view.element, 'status');
    assert.equal(region.getAttribute('aria-live'), 'polite');
  });

  it('shows answers with their source and errors', () => {
    const view = createAskView({ maxLength: 500, onAsk: noop });
    view.showAnswer({ answer: 'Book first.', source: 'ai' });
    assert.match(view.element.textContent, /Book first\./);
    assert.match(view.element.textContent, /AI assistant/);
    view.showAnswer({ answer: 'Local.', source: 'builtin' });
    assert.match(view.element.textContent, /built-in planner/);
    view.showError('Network down');
    assert.match(view.element.textContent, /Network down/);
    assert.doesNotMatch(view.element.textContent, /Local\./);
  });

  it('marks the button busy', () => {
    const view = createAskView({ maxLength: 500, onAsk: noop });
    const [button] = byTag(view.element, 'button');
    view.setBusy(true);
    assert.equal(button.disabled, true);
    assert.equal(button.getAttribute('aria-busy'), 'true');
    view.setBusy(false);
    assert.equal(button.disabled, false);
  });
});

describe('tabs', () => {
  const makeTabs = () =>
    createTabs({
      label: 'Sections',
      tabs: ['one', 'two', 'three'].map((id) => ({ id, label: id.toUpperCase(), content: h('p', { text: id }) })),
    });

  const state = (tabs) => {
    const buttons = byRole(tabs.element, 'tab');
    const panels = byRole(tabs.element, 'tabpanel');
    return {
      selected: buttons.map((button) => button.getAttribute('aria-selected')),
      tabindex: buttons.map((button) => button.getAttribute('tabindex')),
      hidden: panels.map((panel) => panel.hidden),
      buttons,
    };
  };

  it('follows the ARIA tabs pattern initially', () => {
    const tabs = makeTabs();
    const current = state(tabs);
    assert.deepEqual(current.selected, ['true', 'false', 'false']);
    assert.deepEqual(current.tabindex, ['0', '-1', '-1']);
    assert.deepEqual(current.hidden, [false, true, true]);
    assert.equal(byRole(tabs.element, 'tablist')[0].getAttribute('aria-label'), 'Sections');
    const [first] = byRole(tabs.element, 'tabpanel');
    assert.equal(first.getAttribute('aria-labelledby'), 'tab-one');
    assert.equal(current.buttons[0].getAttribute('aria-controls'), 'panel-one');
  });

  it('selects on click', () => {
    const tabs = makeTabs();
    state(tabs).buttons[2].dispatch('click');
    const current = state(tabs);
    assert.deepEqual(current.selected, ['false', 'false', 'true']);
    assert.deepEqual(current.hidden, [true, true, false]);
  });

  it('moves with arrow keys, wrapping at the ends, and moves focus', () => {
    const tabs = makeTabs();
    const press = (key) => {
      const event = { key, preventDefault() { this.prevented = true; } };
      tabs.handleKeydown(event);
      return event;
    };

    assert.equal(press('ArrowRight').prevented, true);
    assert.deepEqual(state(tabs).selected, ['false', 'true', 'false']);
    assert.equal(state(tabs).buttons[1].focused, true);

    press('ArrowRight');
    press('ArrowRight');
    assert.deepEqual(state(tabs).selected, ['true', 'false', 'false']);
    press('ArrowLeft');
    assert.deepEqual(state(tabs).selected, ['false', 'false', 'true']);
    press('Home');
    assert.deepEqual(state(tabs).selected, ['true', 'false', 'false']);
    press('End');
    assert.deepEqual(state(tabs).selected, ['false', 'false', 'true']);
  });

  it('ignores other keys', () => {
    const tabs = makeTabs();
    const event = { key: 'a', preventDefault() { this.prevented = true; } };
    tabs.handleKeydown(event);
    assert.equal(event.prevented, undefined);
    assert.deepEqual(state(tabs).selected, ['true', 'false', 'false']);
  });

  it('listens for keys on the tab list', () => {
    const tabs = makeTabs();
    const [list] = byRole(tabs.element, 'tablist');
    list.dispatch('keydown', { key: 'ArrowRight', preventDefault() {} });
    assert.deepEqual(state(tabs).selected, ['false', 'true', 'false']);
  });
});

describe('budget share bars', () => {
  it('draws a decorative bar per category scaled to the largest share', () => {
    const { element } = createBudgetView({ plan, progress: emptyProgress(), locale: 'en', onSpentChange: noop });
    const bars = byClass(element, 'bar');
    const fills = byClass(element, 'bar-fill');
    assert.equal(bars.length, plan.budget.lines.length);
    assert.ok(bars.every((bar) => bar.getAttribute('aria-hidden') === 'true'));
    const values = fills.map((fill) => Number(fill.styles.get('--fill')));
    assert.equal(Math.max(...values), 100);
    assert.ok(values.every((value) => value > 0 && value <= 100));
  });
});
