import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { fileSlug, planToText, wrap } from '../../public/js/exportText.js';
import { h } from '../../public/js/dom.js';
import { emptyProgress, setSpent, setStepDone, setTaskDone } from '../../public/js/progress.js';
import { buildReport } from '../../public/js/planReport.js';
import { createPrinter } from '../../public/js/printing.js';
import { buildPrintSheet } from '../../public/js/printSheet.js';
import { addDays } from '../../src/planner/dates.js';
import { TODAY, buildTestPlan } from '../helpers/fixtures.js';
import { byClass, byTag, installFakeDocument } from '../helpers/fakeDom.js';

before(installFakeDocument);

const plan = buildTestPlan({ eventDate: addDays(TODAY, 141), priorities: ['photography', 'decor'] });
const venue = plan.budget.lines[0];

// Some progress: one task, two vendor steps, one category fully spent, one over budget.
let progress = setTaskDone(emptyProgress(), plan.timeline.tasks[0].id, true);
progress = setStepDone(setStepDone(progress, 'venue-contract', true), 'catering-deposit', true);
progress = setSpent(setSpent(progress, 'venue', venue.amount), 'decor', plan.budget.lines[3].amount + 10);

const report = buildReport(plan, progress, { locale: 'en', today: TODAY });
const countOf = (root, className) => byClass(root, className).length;

describe('plan report', () => {
  const detail = (label) => report.details.find((item) => item.label === label)?.value;

  it('lists every detail the visitor provided as points', () => {
    assert.equal(report.title, 'Asha and Ravi');
    assert.match(report.subtitle, /^Wedding on .* with 120 guests$/);
    assert.equal(detail('Event type'), 'Wedding');
    assert.match(detail('Event date'), /141 days to go/);
    assert.equal(detail('Guests'), '120');
    assert.match(detail('Total budget'), /2,500,000/);
    assert.match(detail('Budget per guest'), /20,833.*premium level/);
    assert.equal(detail('City or area'), 'Pune');
    assert.equal(detail('Theme or style'), 'garden');
    assert.equal(detail('Interests and preferences'), 'live music, flowers');
    assert.equal(detail('Budget priorities'), 'Photography and video, Decor and flowers');
  });

  it('leaves out optional details that were not given and says when no priorities were chosen', () => {
    const bare = buildReport(buildTestPlan({ location: '', theme: '', interests: '', priorities: [] }), emptyProgress(), { today: TODAY });
    const labels = bare.details.map((item) => item.label);
    for (const missing of ['City or area', 'Theme or style', 'Interests and preferences']) assert.ok(!labels.includes(missing), missing);
    assert.equal(bare.details.at(-1).value, 'None chosen');
  });

  it('describes the countdown for today and for dates that have passed', () => {
    const value = (eventDate, today) =>
      buildReport(buildTestPlan({ eventDate }, '2026-10-23'), emptyProgress(), { today }).details.find((item) => item.label === 'Event date').value;
    assert.match(value('2026-10-23', '2026-10-23'), /today/);
    assert.match(value('2026-10-23', '2026-10-30'), /the date has passed/);
  });

  it('summarises progress', () => {
    assert.deepEqual(report.progress.map((item) => item.label), ['Timeline tasks done', 'Vendor steps done', 'Spent so far']);
    assert.equal(report.progress[0].value, '1 of 22 (5%)');
    assert.equal(report.progress[1].value, '2 of 32 (6%)');
    assert.match(report.progress[2].value, /of .*2,500,000/);
  });

  it('flags the budget lines that are fully spent or over budget, and reports the totals and reserve', () => {
    const [first, , , third] = report.budget.rows;
    assert.equal(first.paid, true);
    assert.equal(first.left.replace(/\D/g, ''), '0');
    assert.equal(third.over, true);
    assert.match(third.left, /^Over by/);
    assert.equal(report.budget.rows.filter((row) => row.paid).length, 2);
    assert.match(report.budget.totals.spent, /\d/);
    assert.match(report.budget.reserveNote, /250,000 \(10%\) is held in reserve/);
  });

  it('groups the timeline by phase with each task checked and described', () => {
    assert.equal(report.phases.reduce((total, group) => total + group.tasks.length, 0), 22);
    const [firstTask, secondTask] = report.phases[0].tasks;
    assert.equal(firstTask.done, true);
    assert.equal(firstTask.status, 'Done');
    assert.equal(secondTask.done, false);
    assert.match(secondTask.status, /^Due /);
    assert.ok(report.phases.every((group) => group.tasks.every((task) => task.title && task.detail && task.category && task.due)));
  });

  it('describes each vendor with steps, questions, tags and progress', () => {
    assert.equal(report.vendors.length, 8);
    const venueVendor = report.vendors.find((vendor) => vendor.label === 'Venue and rentals');
    assert.deepEqual(venueVendor.tags, ['Essential']);
    assert.equal(venueVendor.steps.length, 4);
    assert.equal(venueVendor.steps.filter((step) => step.done).length, 1);
    assert.equal(venueVendor.progress, '1 of 4 steps done');
    assert.ok(venueVendor.questions.length >= 3);
    assert.deepEqual(report.vendors.find((vendor) => vendor.label === 'Photography and video').tags, ['Essential', 'Priority']);
  });

  it('carries the ideas with where they came from', () => {
    assert.equal(report.ideas.items.length, plan.ideas.items.length);
    assert.match(report.ideas.source, /built-in planner/);
    const aiPlan = { ...plan, ideas: { source: 'ai', items: [{ title: 'A', detail: 'b', category: 'c' }] } };
    const aiReport = buildReport(aiPlan, emptyProgress(), { today: TODAY });
    assert.match(aiReport.ideas.source, /Gemini/);
    assert.deepEqual(aiReport.ideas.items[0].matchedOn, []);
    assert.match(report.disclaimer, /not vendor quotes/);
  });
});

describe('print sheet', () => {
  const sheet = buildPrintSheet({ plan, progress, locale: 'en', today: TODAY });

  it('has a banner and every section in a sensible order', () => {
    assert.equal(byTag(sheet, 'h1')[0].textContent, 'Asha and Ravi');
    assert.deepEqual(
      byClass(sheet, 'print-heading').map((heading) => heading.textContent),
      ['Event details', 'Progress', 'Budget', 'Timeline checklist', 'Vendor checklist', 'Ideas to consider', 'Notes'],
    );
    assert.match(sheet.textContent, /Prepared on/);
    assert.match(sheet.textContent, /Printed from Celebration Planner/);
  });

  it('shows the event details and progress as bullet points', () => {
    const points = byClass(sheet, 'print-points');
    assert.ok(points.length >= 2);
    assert.match(points[0].textContent, /City or area: Pune/);
    assert.match(points[0].textContent, /Interests and preferences: live music, flowers/);
    assert.equal(byTag(points[0], 'li').length, report.details.length);
    assert.match(points[1].textContent, /Timeline tasks done: 1 of 22/);
  });

  it('draws a checkbox for every task, vendor step, vendor question, idea and budget line', () => {
    const tasks = plan.timeline.tasks.length;
    const steps = plan.vendors.length * 4;
    const questions = plan.vendors.reduce((total, vendor) => total + vendor.questions.length, 0);
    const ideas = plan.ideas.items.length;
    const budget = plan.budget.lines.length;
    assert.equal(countOf(sheet, 'print-box'), tasks + steps + questions + ideas + budget);
    assert.ok(byClass(sheet, 'print-box').every((node) => node.getAttribute('aria-hidden') === 'true'));
  });

  it('ticks what is done and nothing else', () => {
    const doneTasks = 1;
    const doneSteps = 2;
    const paidLines = 2;
    assert.equal(countOf(sheet, 'is-checked'), doneTasks + doneSteps + paidLines);
    assert.equal(countOf(sheet, 'is-done'), doneTasks + doneSteps);
  });

  it('has a budget table with totals and over-budget rows marked', () => {
    const [table] = byTag(sheet, 'table');
    assert.equal(byTag(table, 'caption').length, 1);
    assert.deepEqual(byTag(byTag(table, 'thead')[0], 'th').map((cell) => cell.textContent), ['Done', 'Category', 'Share', 'Planned', 'Spent', 'Left']);
    assert.equal(byTag(byTag(table, 'tbody')[0], 'tr').length, plan.budget.lines.length);
    assert.equal(countOf(table, 'is-over'), 1);
    assert.match(byTag(table, 'tfoot')[0].textContent, /Total100%/);
    assert.match(byTag(table, 'tbody')[0].textContent, /\(priority\)/);
  });

  it('prints each vendor as a card with its details, steps, questions and a notes line', () => {
    const cards = byClass(sheet, 'print-vendor');
    assert.equal(cards.length, plan.vendors.length);
    assert.match(cards[0].textContent, /Budget: .*Book by: .*Progress: \d of 4 steps done/);
    assert.equal(byClass(cards[0], 'print-line').length, 1);
    assert.ok(cards.every((card) => byTag(card, 'h4').length === 2));
    assert.equal(byClass(sheet, 'print-tag').length, report.vendors.reduce((total, vendor) => total + vendor.tags.length, 0));
  });

  it('prints the timeline by phase with due dates, statuses and details', () => {
    const phases = byClass(sheet, 'print-phase');
    assert.equal(phases.length, report.phases.length);
    assert.match(phases[0].textContent, /Early planning/);
    assert.match(phases[0].textContent, /Done/);
    assert.match(phases[0].textContent, /Due tomorrow|Due in/);
  });

  it('shows hostile text as plain text', () => {
    const hostile = { ...plan, input: { ...plan.input, eventName: '<img src=x onerror=alert(1)>' } };
    const html = buildPrintSheet({ plan: hostile, progress: emptyProgress(), locale: 'en', today: TODAY });
    assert.equal(byTag(html, 'img').filter((image) => image.getAttribute('src') !== '/logo-mark.svg').length, 0);
    assert.match(byTag(html, 'h1')[0].textContent, /<img src=x/);
  });

  it('keeps the logo decorative', () => {
    const [logo] = byTag(sheet, 'img');
    assert.equal(logo.getAttribute('alt'), '');
    assert.equal(logo.getAttribute('src'), '/logo-mark.svg');
  });
});

describe('printer', () => {
  it('rebuilds the sheet from the latest state before printing and clears it without a plan', () => {
    const root = h('div');
    const state = { plan: null, progress: emptyProgress() };
    const printer = createPrinter({ root, getState: () => state, locale: 'en' });

    printer.refresh();
    assert.equal(root.children.length, 0);

    state.plan = plan;
    printer.refresh();
    assert.equal(root.children.length, 1);
    assert.equal(countOf(root, 'is-checked'), 0);

    state.progress = setTaskDone(emptyProgress(), plan.timeline.tasks[0].id, true);
    printer.refresh();
    assert.equal(root.children.length, 1);
    assert.equal(countOf(root, 'is-checked'), 1);

    state.plan = null;
    printer.refresh();
    assert.equal(root.children.length, 0);
  });

  it('opens the print dialog', () => {
    let printed = 0;
    globalThis.window = { print: () => { printed += 1; } };
    createPrinter({ root: h('div'), getState: () => ({ plan: null }), locale: 'en' }).print();
    delete globalThis.window;
    assert.equal(printed, 1);
  });
});

describe('text download', () => {
  const text = planToText(plan, progress, 'en', TODAY);
  const lines = text.split('\n');

  it('starts with a title block and has every section in order', () => {
    assert.match(lines[0], /^={78}$/);
    assert.equal(lines[1], 'CELEBRATION PLANNER - EVENT PLAN');
    assert.equal(lines[3], 'Asha and Ravi');
    const headings = ['EVENT DETAILS', 'PROGRESS', 'BUDGET', 'TIMELINE CHECKLIST', 'VENDOR CHECKLIST', 'IDEAS TO CONSIDER', 'NOTES'];
    const positions = headings.map((heading) => lines.indexOf(heading));
    assert.ok(positions.every((position) => position > 0), 'every heading is present');
    assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
  });

  it('lists the event details as points', () => {
    const expected = [
      '* Event type: Wedding',
      '* Guests: 120',
      '* City or area: Pune',
      '* Theme or style: garden',
      '* Budget priorities: Photography and video, Decor and flowers',
    ];
    for (const point of expected) {
      assert.ok(lines.includes(point), point);
    }
    assert.ok(lines.some((line) => line.startsWith('* Interests and preferences: live music, flowers')));
  });

  it('uses checklists with the right marks', () => {
    const marks = (pattern) => lines.filter((line) => pattern.test(line)).length;
    assert.equal(marks(/^\s*\[x\] /), 1 + 2 + 2, 'one task, two vendor steps and two fully spent categories');
    const tasks = plan.timeline.tasks.length;
    const steps = plan.vendors.length * 4;
    const questions = plan.vendors.reduce((total, vendor) => total + vendor.questions.length, 0);
    const budget = plan.budget.lines.length;
    const ideas = plan.ideas.items.length;
    assert.equal(marks(/^\s*\[[ x]\] /), tasks + steps + questions + budget + ideas);
  });

  it('shows the budget as a table with totals', () => {
    const header = lines.find((line) => line.startsWith('Done '));
    assert.match(header, /Category\s+Share\s+Planned\s+Spent\s+Left/);
    assert.ok(lines.some((line) => /^\s+Total\s+100%/.test(line)));
    assert.ok(lines.some((line) => /Over by/.test(line)));
  });

  it('shows timeline phases, vendor details and notes lines', () => {
    for (const phase of ['Early planning', 'Booking and design', 'Final preparations', 'Event week', 'After the event']) {
      assert.ok(lines.includes(phase), phase);
    }
    assert.ok(lines.some((line) => /^Venue and rentals \[Essential\]$/.test(line)));
    assert.ok(lines.some((line) => line.startsWith('  * Book by: ')));
    assert.equal(lines.filter((line) => line.startsWith('  Notes: ')).length, plan.vendors.length);
    assert.ok(text.replace(/\s+/g, ' ').trim().endsWith('Ask each vendor for a written quote.'));
  });

  it('wraps long text so it reads well in any editor', () => {
    const wide = lines.filter((line) => line.length > 78);
    assert.ok(wide.every((line) => /^(\[[ x]\]|Done)\s.*(Left|\d)/.test(line) || /^\s{5}Total|^\[/.test(line) || line.includes('Over by')), wide.join('\n'));
    assert.ok(lines.every((line) => line.length <= 100));
  });

  it('is plain text without markup', () => {
    assert.doesNotMatch(text, /<[a-z]/i);
    assert.doesNotMatch(text, /\p{Extended_Pictographic}/u);
  });

  it('works for a plan with nothing done', () => {
    const fresh = planToText(plan, emptyProgress(), 'en', TODAY);
    assert.ok(!/^\s*\[x\] /m.test(fresh));
  });

  it('builds safe file names', () => {
    assert.equal(fileSlug('Asha & Ravi: The Wedding!'), 'asha-ravi-the-wedding');
    assert.equal(fileSlug('../../etc/passwd'), 'etc-passwd');
    assert.equal(fileSlug('???'), 'event');
    assert.ok(fileSlug('x'.repeat(100)).length <= 40);
  });

  it('wraps words at the page width and indents continuation lines', () => {
    const wrapped = wrap(`${'word '.repeat(40)}end`, '[ ] ');
    assert.ok(wrapped.length > 1);
    assert.ok(wrapped[0].startsWith('[ ] word'));
    assert.ok(wrapped.slice(1).every((line) => line.startsWith('    word') || line.startsWith('    end')));
    assert.ok(wrapped.every((line) => line.length <= 78));
    assert.deepEqual(wrap('', '* '), ['* ']);
    assert.deepEqual(wrap('short', '- ', ''), ['- short']);
  });
});
