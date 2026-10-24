/** @module planner/budget */

// Budget allocation. All amounts are whole currency units and always add up to
// the total exactly.

export const PRIORITY_BOOST = 1.4;

/**
 * Divides an integer total into parts proportional to the given weights,
 * using the largest remainder method to ensure the parts sum exactly.
 * @param {number} total - Non-negative integer to divide
 * @param {number[]} weights - Positive weights for each part
 * @returns {number[]} Integer amounts that sum to `total`
 */
export function allocate(total, weights) {
  if (!Number.isInteger(total) || total < 0) {
    throw new RangeError('total must be a non-negative integer');
  }
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  if (!(weightSum > 0)) throw new RangeError('weights must have a positive sum');

  const exact = weights.map((weight) => (total * weight) / weightSum);
  const amounts = exact.map(Math.floor);
  const leftover = total - amounts.reduce((sum, amount) => sum + amount, 0);
  const byFraction = exact
    .map((value, index) => ({ index, fraction: value - amounts[index] }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  for (let step = 0; step < leftover; step += 1) {
    amounts[byFraction[step % byFraction.length].index] += 1;
  }
  return amounts;
}

/**
 * Builds a complete budget breakdown for an event based on category weights,
 * priority multipliers, and a dedicated contingency reserve.
 * @param {object} definition - Event template containing budget line definitions
 * @param {object} input - User inputs including totalBudget, currency, and priorities
 * @returns {{ total: number, currency: string, lines: Array<object> }} Allocated budget
 */
export function buildBudget(definition, input) {
  const { budget, contingencyKey } = definition;
  const reserve = budget.find((line) => line.key === contingencyKey);
  const spendable = budget.filter((line) => line.key !== contingencyKey);
  const priorities = new Set(input.priorities);

  const reserveAmount = Math.round((input.totalBudget * reserve.percent) / 100);
  const weights = spendable.map((line) => line.percent * (priorities.has(line.key) ? PRIORITY_BOOST : 1));
  const spendableAmounts = allocate(input.totalBudget - reserveAmount, weights);

  const amounts = new Map(spendable.map((line, index) => [line.key, spendableAmounts[index]]));
  amounts.set(contingencyKey, reserveAmount);

  const lines = budget.map((line) => ({
    key: line.key,
    label: line.label,
    hint: line.hint,
    amount: amounts.get(line.key),
    share: Math.round((amounts.get(line.key) / input.totalBudget) * 1000) / 10,
    priority: priorities.has(line.key),
  }));

  return { total: input.totalBudget, currency: input.currency, lines };
}
