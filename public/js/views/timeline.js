import { h } from '../dom.js';
import { describeDue, formatDate } from '../format.js';

export function groupByPhase(tasks) {
  const groups = [];
  for (const task of tasks) {
    const last = groups[groups.length - 1];
    if (last && last.phase === task.phase) last.tasks.push(task);
    else groups.push({ phase: task.phase, tasks: [task] });
  }
  return groups;
}

export function createTimelineView({ plan, progress, today, locale, onToggle }) {
  function createTask(task) {
    const done = progress.tasks[task.id] === true;
    const status = h('span');
    const item = h('li', { class: 'task' });

    function paint(isDone) {
      const due = describeDue(task.dueDate, today, isDone);
      status.textContent = due.text;
      status.className = `status status-${due.state}`;
      item.classList.toggle('is-done', isDone);
    }

    const checkbox = h('input', { type: 'checkbox', checked: done });
    checkbox.addEventListener('change', () => {
      paint(checkbox.checked);
      onToggle(task.id, checkbox.checked);
    });

    item.append(
      h('label', { class: 'task-label' }, checkbox, h('span', { class: 'task-title', text: task.title })),
      h('p', { class: 'task-detail', text: task.detail }),
      h(
        'p',
        { class: 'task-meta' },
        h('span', { text: task.category }),
        h('time', { datetime: task.dueDate, text: formatDate(task.dueDate, locale) }),
        status,
      ),
    );
    paint(done);
    return item;
  }

  const groups = groupByPhase(plan.timeline.tasks).map((group) =>
    h('section', { class: 'phase' }, h('h4', { text: group.phase }), h('ul', { class: 'task-list' }, group.tasks.map(createTask))),
  );

  const element = h(
    'div',
    { class: 'timeline-view' },
    h('h3', { text: 'Timeline' }),
    h('p', {
      class: 'section-intro',
      text: 'Tick tasks off as you complete them. Dates are counted back from your event date.',
    }),
    groups,
  );

  return { element };
}
