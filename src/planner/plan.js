/** @module planner/plan */
import { diffDays } from './dates.js';
import { getEventType } from './eventTypes.js';
import { buildBudget } from './budget.js';
import { buildTimeline, createDateScaler, timelineSpan } from './timeline.js';
import { buildVendors } from './vendors.js';
import { budgetTier, selectIdeas } from './ideas.js';
import { validateEventInput } from './validate.js';

/**
 * Builds a complete event plan from validated event specifications.
 * @param {object} input - Validated event input parameters
 * @param {string} today - Current ISO reference date (YYYY-MM-DD)
 * @returns {object} Complete calculated plan including budget, timeline, vendors, and ideas
 */
export function buildPlan(input, today) {
  const definition = getEventType(input.eventType);
  const scaler = createDateScaler({
    eventDate: input.eventDate,
    today,
    spanDays: timelineSpan(definition),
  });

  const budget = buildBudget(definition, input);
  const timeline = buildTimeline(definition, scaler);
  const vendors = buildVendors(definition, budget, scaler);
  const ideas = selectIdeas(definition, input);
  const daysUntilEvent = diffDays(today, input.eventDate);

  return {
    input,
    eventTypeLabel: definition.label,
    generatedOn: today,
    summary: {
      daysUntilEvent,
      weeksUntilEvent: Math.floor(daysUntilEvent / 7),
      budgetPerGuest: Math.round(input.totalBudget / input.guestCount),
      budgetTier: budgetTier(definition, input),
      taskCount: timeline.tasks.length,
      vendorCount: vendors.length,
      compressed: timeline.compressed,
      recommendedWeeks: timeline.recommendedWeeks,
    },
    budget,
    timeline,
    vendors,
    ideas: { source: 'builtin', items: ideas },
  };
}

/**
 * Validates a raw client request and constructs an event plan if valid.
 * @param {unknown} raw - Untrusted incoming request payload
 * @param {string} today - Current ISO reference date (YYYY-MM-DD)
 * @returns {{ ok: true, plan: object } | { ok: false, errors: Array<{ field: string, message: string }> }}
 */
export function planFromRequest(raw, today) {
  const result = validateEventInput(raw, { today });
  if (!result.ok) return result;
  return { ok: true, plan: buildPlan(result.value, today) };
}
