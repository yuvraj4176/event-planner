// Assembles the results area (summary, actions and tabs) for a plan.

import { h } from './dom.js';
import { formatDate, pluralize } from './format.js';
import { icon } from './icons.js';
import { setSpent, setStepDone, setTaskDone } from './progress.js';
import { createAskView } from './views/ask.js';
import { createBudgetView } from './views/budget.js';
import { createIdeasView } from './views/ideas.js';
import { createSummary } from './views/summary.js';
import { createTabs } from './views/tabs.js';
import { createTimelineView } from './views/timeline.js';
import { createVendorsView } from './views/vendors.js';

function actionButton(label, iconName, onClick) {
  return h('button', { type: 'button', class: 'button button-secondary', on: { click: onClick } }, icon(iconName), h('span', { text: label }));
}

// `actions` supplies what the views cannot do themselves:
// onProgressChange(progress), onRequestAiIdeas(), onAsk(question),
// onDownload(), onPrint() and onEditDetails().
export function buildResults({ plan, progress, meta, today, locale, actions }) {
  const summary = createSummary({ plan, progress, today, locale });

  function update(next) {
    actions.onProgressChange(next);
    summary.refresh(next);
  }

  // Each view keeps its own copy of progress for display, so updates are
  // computed from the latest value held here.
  let current = progress;
  const record = (change) => {
    current = change(current);
    update(current);
  };

  const budget = createBudgetView({
    plan,
    progress,
    locale,
    onSpentChange: (key, amount) => record((state) => setSpent(state, key, amount)),
  });
  const timeline = createTimelineView({
    plan,
    progress,
    today,
    locale,
    onToggle: (id, done) => record((state) => setTaskDone(state, id, done)),
  });
  const vendors = createVendorsView({
    plan,
    progress,
    locale,
    onToggleStep: (id, done) => record((state) => setStepDone(state, id, done)),
  });
  const ideas = createIdeasView({ ideas: plan.ideas, aiEnabled: meta.aiEnabled, onRequestAi: actions.onRequestAiIdeas });
  const ask = createAskView({ maxLength: meta.limits.questionMax, onAsk: actions.onAsk });

  const tabs = createTabs({
    label: 'Plan sections',
    tabs: [
      { id: 'budget', label: 'Budget', icon: 'budget', content: budget.element },
      { id: 'timeline', label: 'Timeline', icon: 'calendar', content: timeline.element },
      { id: 'vendors', label: 'Vendors', icon: 'checklist', content: vendors.element },
      { id: 'ideas', label: 'Ideas', icon: 'lightbulb', content: ideas.element },
      { id: 'ask', label: 'Ask the planner', icon: 'message', content: ask.element },
    ],
  });

  const nodes = [
    h('p', {
      class: 'event-meta',
      text: `${plan.eventTypeLabel} on ${formatDate(plan.input.eventDate, locale)} with ${pluralize(plan.input.guestCount, 'guest')}`,
    }),
    summary.element,
    h(
      'div',
      { class: 'action-row no-print' },
      actionButton('Download as text', 'download', actions.onDownload),
      actionButton('Print', 'print', actions.onPrint),
      actionButton('Edit details', 'edit', actions.onEditDetails),
    ),
    h('p', { class: 'hint no-print', text: 'To keep a PDF copy, choose Save as PDF as the destination in the print window.' }),
    tabs.element,
  ];

  return { nodes, ideas, ask };
}
