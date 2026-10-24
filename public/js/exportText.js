// Builds the plain-text copy of a plan that visitors can download. Everything is
// laid out as points and checklists: [x] marks something done, [ ] something
// still to do. Lines are wrapped so the file reads well in any text editor.

import { localTodayIso } from './format.js';
import { buildReport } from './planReport.js';

const WIDTH = 78;
const RULE = '='.repeat(WIDTH);
const NOTES_LINE = '_'.repeat(WIDTH - 6);

// Turns an event name into a safe download file name.
export function fileSlug(name) {
  const slug = String(name)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug || 'event';
}

// Wraps text to the page width. `first` prefixes the first line and `rest` the others.
export function wrap(text, first, rest = ' '.repeat(first.length)) {
  const lines = [];
  let line = first;
  let hasWord = false;
  for (const word of String(text).split(/\s+/).filter(Boolean)) {
    const candidate = hasWord ? `${line} ${word}` : `${line}${word}`;
    if (hasWord && candidate.length > WIDTH) {
      lines.push(line);
      line = `${rest}${word}`;
    } else {
      line = candidate;
    }
    hasWord = true;
  }
  lines.push(line);
  return lines;
}

const box = (done) => (done ? '[x]' : '[ ]');

function section(title, lines) {
  return [title.toUpperCase(), '-'.repeat(title.length), ...lines, ''];
}

function budgetLines({ rows, totals, reserveNote }) {
  const width = Math.max(8, ...rows.map((row) => row.label.length));
  const cell = (value, size, right) => (right ? String(value).padStart(size) : String(value).padEnd(size));
  const line = (mark, label, share, planned, spent, left) =>
    `${cell(mark, 4)} ${cell(label, width)}  ${cell(share, 6, true)}  ${cell(planned, 14, true)}  ${cell(spent, 14, true)}  ${cell(left, 16, true)}`;

  return [
    line('Done', 'Category', 'Share', 'Planned', 'Spent', 'Left'),
    ...rows.map((row) => line(box(row.paid), row.label, row.share, row.planned, row.spent, row.left)),
    line('', 'Total', '100%', totals.planned, totals.spent, totals.left),
    '',
    ...(reserveNote ? wrap(reserveNote, '* ') : []),
    ...wrap('[x] means the category is fully spent. Enter spending on the Budget tab to update it.', '* '),
  ];
}

function timelineLines(phases) {
  return phases.flatMap((group) => [
    group.phase,
    ...group.tasks.flatMap((task) => [
      ...wrap(`${task.title} - ${task.due} (${task.status})`, `  ${box(task.done)} `),
      ...wrap(`${task.category}. ${task.detail}`, '      '),
    ]),
    '',
  ]);
}

function vendorLines(vendors) {
  return vendors.flatMap((vendor) => [
    `${vendor.label}${vendor.tags.length > 0 ? ` [${vendor.tags.join(', ')}]` : ''}`,
    `  * Budget: ${vendor.budget}`,
    `  * Book by: ${vendor.bookBy}`,
    `  * Progress: ${vendor.progress}`,
    '  Steps:',
    ...vendor.steps.flatMap((step) => wrap(step.text, `    ${box(step.done)} `)),
    '  Questions to ask:',
    ...vendor.questions.flatMap((question) => wrap(question, '    [ ] ')),
    '  Notes: ____________________________________________',
    '',
  ]);
}

export function planToText(plan, progress, locale = 'en', today = localTodayIso()) {
  const report = buildReport(plan, progress, { locale, today });
  const points = (items) => items.flatMap(({ label, value }) => wrap(`${label}: ${value}`, '* '));

  return [
    RULE,
    'CELEBRATION PLANNER - EVENT PLAN',
    RULE,
    report.title,
    report.subtitle,
    `Prepared on ${report.preparedOn}`,
    '',
    ...section('Event details', points(report.details)),
    ...section('Progress', points(report.progress)),
    ...section('Budget', budgetLines(report.budget)),
    ...section('Timeline checklist', timelineLines(report.phases)),
    ...section('Vendor checklist', vendorLines(report.vendors)),
    ...section('Ideas to consider', [
      ...wrap(report.ideas.source, '* '),
      '',
      ...report.ideas.items.flatMap((idea) => [
        ...wrap(`${idea.title} (${idea.category})`, '[ ] '),
        ...wrap(idea.detail, '    '),
        ...(idea.matchedOn.length > 0 ? wrap(`Matches your interests: ${idea.matchedOn.join(', ')}`, '    ') : []),
      ]),
    ]),
    ...section('Notes', ['', NOTES_LINE, '', NOTES_LINE, '']),
    RULE,
    ...wrap(report.disclaimer, ''),
    '',
  ].join('\n');
}
