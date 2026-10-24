// Turns a plan and the visitor's progress into one plain description of what
// should be printed or downloaded. The print sheet and the text download are
// both drawn from it, so they always contain the same information.

import { daysBetween, describeDue, formatDate, formatMoney, percentage, pluralize } from './format.js';
import { lineSpend, spendTotals, taskStats, vendorStats } from './progress.js';
import { SOURCE_LABELS } from './views/ideas.js';
import { groupByPhase } from './views/timeline.js';

function countdownText(eventDate, today) {
  const days = daysBetween(today, eventDate);
  if (days < 0) return 'the date has passed';
  return days === 0 ? 'today' : `${pluralize(days, 'day')} to go`;
}

function buildDetails(plan, money, locale, today) {
  const { input, budget, summary } = plan;
  const priorities = budget.lines.filter((line) => line.priority).map((line) => line.label);
  return [
    ['Event type', plan.eventTypeLabel],
    ['Event date', `${formatDate(input.eventDate, locale)} (${countdownText(input.eventDate, today)})`],
    ['Guests', String(input.guestCount)],
    ['Total budget', money(budget.total)],
    ['Budget per guest', `${money(summary.budgetPerGuest)} (${summary.budgetTier} level)`],
    input.location ? ['City or area', input.location] : null,
    input.theme ? ['Theme or style', input.theme] : null,
    input.interests ? ['Interests and preferences', input.interests] : null,
    ['Budget priorities', priorities.length > 0 ? priorities.join(', ') : 'None chosen'],
  ]
    .filter(Boolean)
    .map(([label, value]) => ({ label, value }));
}

function buildProgress(plan, progress, money) {
  const tasks = taskStats(plan, progress);
  const steps = plan.vendors.reduce(
    (total, vendor) => {
      const { done, total: count } = vendorStats(vendor, progress);
      return { done: total.done + done, total: total.total + count };
    },
    { done: 0, total: 0 },
  );
  const spend = spendTotals(plan, progress);
  return [
    { label: 'Timeline tasks done', value: `${tasks.done} of ${tasks.total} (${tasks.percent}%)` },
    { label: 'Vendor steps done', value: `${steps.done} of ${steps.total} (${percentage(steps.done, steps.total)}%)` },
    { label: 'Spent so far', value: `${money(spend.spent)} of ${money(spend.planned)}${spend.over ? ' (over budget)' : ''}` },
  ];
}

function buildBudget(plan, progress, money) {
  const rows = plan.budget.lines.map((line) => {
    const { spent, remaining, over } = lineSpend(line, progress);
    return {
      label: line.label,
      hint: line.hint,
      priority: line.priority,
      share: `${line.share}%`,
      planned: money(line.amount),
      spent: money(spent),
      left: over ? `Over by ${money(-remaining)}` : money(remaining),
      over,
      paid: spent > 0 && remaining <= 0,
    };
  });
  const totals = spendTotals(plan, progress);
  const reserve = plan.budget.lines.find((line) => line.key === 'contingency');
  return {
    rows,
    totals: {
      planned: money(totals.planned),
      spent: money(totals.spent),
      left: totals.over ? `Over by ${money(-totals.remaining)}` : money(totals.remaining),
    },
    reserveNote: reserve ? `${money(reserve.amount)} (${reserve.share}%) is held in reserve for surprises.` : '',
  };
}

export function buildReport(plan, progress, { locale = 'en', today }) {
  const money = (amount) => formatMoney(amount, plan.budget.currency, locale);
  const { input } = plan;

  return {
    title: input.eventName,
    subtitle: `${plan.eventTypeLabel} on ${formatDate(input.eventDate, locale)} with ${pluralize(input.guestCount, 'guest')}`,
    preparedOn: formatDate(today, locale),
    details: buildDetails(plan, money, locale, today),
    progress: buildProgress(plan, progress, money),
    budget: buildBudget(plan, progress, money),
    phases: groupByPhase(plan.timeline.tasks).map((group) => ({
      phase: group.phase,
      tasks: group.tasks.map((task) => {
        const done = progress.tasks[task.id] === true;
        const due = describeDue(task.dueDate, today, done);
        return {
          title: task.title,
          detail: task.detail,
          category: task.category,
          due: formatDate(task.dueDate, locale),
          status: due.text,
          state: due.state,
          done,
        };
      }),
    })),
    vendors: plan.vendors.map((vendor) => {
      const { done, total } = vendorStats(vendor, progress);
      return {
        label: vendor.label,
        tags: [vendor.essential ? 'Essential' : null, vendor.priority ? 'Priority' : null].filter(Boolean),
        budget: money(vendor.budget),
        bookBy: formatDate(vendor.bookBy, locale),
        progress: `${done} of ${total} steps done`,
        steps: vendor.checklist.map((step) => ({ text: step.text, done: progress.steps[step.id] === true })),
        questions: vendor.questions,
      };
    }),
    ideas: {
      source: SOURCE_LABELS[plan.ideas.source] ?? SOURCE_LABELS.builtin,
      items: plan.ideas.items.map(({ title, detail, category, matchedOn }) => ({
        title,
        detail,
        category,
        matchedOn: Array.isArray(matchedOn) ? matchedOn : [],
      })),
    },
    disclaimer: 'Budget shares and dates are planning guidance, not vendor quotes. Ask each vendor for a written quote.',
  };
}
