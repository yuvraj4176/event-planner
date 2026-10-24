import { h } from '../dom.js';
import { daysBetween, formatMoney, percentage, pluralize } from '../format.js';
import { spendTotals, taskStats } from '../progress.js';

function countdownText(eventDate, today) {
  const days = daysBetween(today, eventDate);
  if (days < 0) return 'Event date has passed';
  if (days === 0) return 'Today';
  return pluralize(days, 'day');
}

function stat(label, valueNode) {
  return h('div', { class: 'stat' }, h('dt', { text: label }), valueNode);
}

export function createSummary({ plan, progress, today, locale }) {
  const money = (amount) => formatMoney(amount, plan.budget.currency, locale);

  const tasksValue = h('dd');
  const spentValue = h('dd');
  const bar = h('progress', { id: 'task-progress', max: '100', value: '0' });

  function refresh(current) {
    const tasks = taskStats(plan, current);
    const totals = spendTotals(plan, current);
    tasksValue.textContent = `${tasks.done} of ${tasks.total}`;
    spentValue.textContent = `${money(totals.spent)} of ${money(totals.planned)}`;
    bar.value = tasks.percent;
    bar.textContent = `${tasks.percent}%`;
    bar.setAttribute('aria-valuetext', `${percentage(tasks.done, tasks.total)} percent of tasks complete`);
  }

  const notice = plan.timeline.compressed
    ? h('p', { class: 'notice', role: 'note' },
        `Your event is closer than the ${plan.timeline.recommendedWeeks} weeks usually recommended, so the timeline has been compressed. ` +
          'Start with the vendors that have the longest lead times.')
    : null;

  const element = h(
    'div',
    { class: 'summary' },
    h(
      'dl',
      { class: 'stat-grid' },
      stat('Time to go', h('dd', { text: countdownText(plan.input.eventDate, today) })),
      stat('Budget per guest', h('dd', { text: money(plan.summary.budgetPerGuest) })),
      stat('Spent so far', spentValue),
      stat('Tasks complete', tasksValue),
    ),
    h('div', { class: 'progress-row' }, h('label', { for: 'task-progress', text: 'Planning progress' }), bar),
    notice,
  );

  refresh(progress);
  return { element, refresh };
}
