// The document that is printed. It is built from the same report as the text
// download, shown only when printing, and laid out as points and checklists.

import { h } from './dom.js';
import { buildReport } from './planReport.js';

const box = (done) => h('span', { class: `print-box${done ? ' is-checked' : ''}`, 'aria-hidden': 'true' });

function section(title, ...children) {
  return h('section', { class: 'print-section' }, h('h2', { class: 'print-heading', text: title }), ...children);
}

function points(items) {
  return h(
    'ul',
    { class: 'print-points' },
    items.map(({ label, value }) => h('li', {}, h('strong', { text: `${label}: ` }), value)),
  );
}

function checkItem({ done = false, title, note, meta }) {
  return h(
    'li',
    { class: `print-check${done ? ' is-done' : ''}` },
    box(done),
    h(
      'div',
      { class: 'print-check-body' },
      h('p', { class: 'print-check-title', text: title }),
      note ? h('p', { class: 'print-note', text: note }) : null,
      meta ? h('p', { class: 'print-meta', text: meta }) : null,
    ),
  );
}

function budgetTable({ rows, totals, reserveNote }) {
  const head = ['Done', 'Category', 'Share', 'Planned', 'Spent', 'Left'];
  return [
    h(
      'table',
      { class: 'print-table' },
      h('caption', { class: 'print-caption', text: 'A tick means the category is fully spent.' }),
      h('thead', {}, h('tr', {}, head.map((name) => h('th', { scope: 'col', text: name })))),
      h(
        'tbody',
        {},
        rows.map((row) =>
          h(
            'tr',
            { class: row.over ? 'is-over' : null },
            h('td', {}, box(row.paid)),
            h('th', { scope: 'row' }, h('span', { text: row.label }), row.priority ? h('em', { text: ' (priority)' }) : null),
            h('td', { class: 'num', text: row.share }),
            h('td', { class: 'num', text: row.planned }),
            h('td', { class: 'num', text: row.spent }),
            h('td', { class: 'num', text: row.left }),
          ),
        ),
      ),
      h(
        'tfoot',
        {},
        h(
          'tr',
          {},
          h('td'),
          h('th', { scope: 'row', text: 'Total' }),
          h('td', { class: 'num', text: '100%' }),
          h('td', { class: 'num', text: totals.planned }),
          h('td', { class: 'num', text: totals.spent }),
          h('td', { class: 'num', text: totals.left }),
        ),
      ),
    ),
    reserveNote ? h('p', { class: 'print-note', text: reserveNote }) : null,
  ];
}

function vendorCard(vendor) {
  return h(
    'div',
    { class: 'print-vendor' },
    h(
      'h3',
      { class: 'print-vendor-title' },
      h('span', { text: vendor.label }),
      vendor.tags.map((tag) => h('span', { class: 'print-tag', text: tag })),
    ),
    points([
      { label: 'Budget', value: vendor.budget },
      { label: 'Book by', value: vendor.bookBy },
      { label: 'Progress', value: vendor.progress },
    ]),
    h(
      'div',
      { class: 'print-columns' },
      h('div', {}, h('h4', { text: 'Steps' }), h('ul', { class: 'print-checklist' }, vendor.steps.map((step) => checkItem({ done: step.done, title: step.text })))),
      h('div', {}, h('h4', { text: 'Questions to ask' }), h('ul', { class: 'print-checklist' }, vendor.questions.map((question) => checkItem({ title: question })))),
    ),
    h('p', { class: 'print-write' }, h('span', { text: 'Notes' }), h('span', { class: 'print-line' })),
  );
}

export function buildPrintSheet({ plan, progress, locale, today }) {
  const report = buildReport(plan, progress, { locale, today });

  return h(
    'article',
    { class: 'print-document' },
    h(
      'header',
      { class: 'print-banner' },
      h('p', { class: 'print-brand' }, h('img', { src: '/logo-mark.svg', alt: '', width: '28', height: '28' }), h('span', { text: 'Celebration Planner - Event plan' })),
      h('h1', { text: report.title }),
      h('p', { class: 'print-subtitle', text: report.subtitle }),
      h('p', { class: 'print-prepared', text: `Prepared on ${report.preparedOn}` }),
    ),
    section('Event details', points(report.details)),
    section('Progress', points(report.progress)),
    section('Budget', ...budgetTable(report.budget)),
    section(
      'Timeline checklist',
      report.phases.map((group) =>
        h(
          'div',
          { class: 'print-phase' },
          h('h3', { text: group.phase }),
          h(
            'ul',
            { class: 'print-checklist' },
            group.tasks.map((task) =>
              checkItem({ done: task.done, title: `${task.title} - ${task.due}`, note: task.detail, meta: `${task.category} | ${task.status}` }),
            ),
          ),
        ),
      ),
    ),
    section('Vendor checklist', report.vendors.map(vendorCard)),
    section(
      'Ideas to consider',
      h('p', { class: 'print-note', text: report.ideas.source }),
      h(
        'ul',
        { class: 'print-checklist' },
        report.ideas.items.map((idea) =>
          checkItem({
            title: `${idea.title} (${idea.category})`,
            note: idea.detail,
            meta: idea.matchedOn.length > 0 ? `Matches your interests: ${idea.matchedOn.join(', ')}` : null,
          }),
        ),
      ),
    ),
    section('Notes', h('p', { class: 'print-write' }, h('span', { class: 'print-line' })), h('p', { class: 'print-write' }, h('span', { class: 'print-line' }))),
    h('footer', { class: 'print-footer' }, h('p', { text: report.disclaimer }), h('p', { text: 'Printed from Celebration Planner.' })),
  );
}
