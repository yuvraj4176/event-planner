// Every vendor goes through the same four steps; the questions are specific to
// the kind of vendor.
const COMMON_STEPS = Object.freeze([
  { suffix: 'shortlist', text: 'Shortlist at least three options and compare written quotes' },
  { suffix: 'contract', text: 'Review the contract: scope, cancellation terms and payment schedule' },
  { suffix: 'deposit', text: 'Pay the deposit and note the date the balance is due' },
  { suffix: 'confirm', text: 'Confirm arrival time and final details one week before the event' },
]);

export function buildVendors(definition, budget, scaler) {
  const lines = new Map(budget.lines.map((line) => [line.key, line]));

  return definition.vendors
    .map((vendor) => {
      const line = lines.get(vendor.key);
      return {
        key: vendor.key,
        label: line.label,
        essential: vendor.essential,
        priority: line.priority,
        budget: line.amount,
        bookBy: scaler.dateFor(vendor.leadDays),
        checklist: COMMON_STEPS.map((step) => ({ id: `${vendor.key}-${step.suffix}`, text: step.text })),
        questions: [...vendor.questions],
        leadDays: vendor.leadDays,
      };
    })
    .sort((a, b) => b.leadDays - a.leadDays)
    .map(({ leadDays, ...vendor }) => vendor);
}
