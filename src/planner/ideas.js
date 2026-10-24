/** @module planner/ideas */
import { CURRENCIES } from './currencies.js';

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'our', 'you', 'that', 'this', 'are', 'from', 'have', 'has', 'not', 'but',
  'all', 'can', 'will', 'want', 'like', 'love', 'lots', 'some', 'very', 'also', 'would', 'into', 'about',
]);

const DEFAULT_IDEA_COUNT = 8;

/**
 * Categorises an event into a budget tier (essential, balanced, premium).
 * @param {object} definition - Event archetype definition
 * @param {{ totalBudget: number, guestCount: number, currency: string }} input
 * @returns {'essential' | 'balanced' | 'premium'}
 */
export function budgetTier(definition, input) {
  const perGuestUsd = (input.totalBudget / input.guestCount) * CURRENCIES[input.currency].usdRate;
  const [essentialBelow, balancedBelow] = definition.tierThresholdsUsd;
  if (perGuestUsd < essentialBelow) return 'essential';
  return perGuestUsd < balancedBelow ? 'balanced' : 'premium';
}

// Light normalisation so "flowers" matches the tag "flower".
function normalise(word) {
  return word.length > 3 && word.endsWith('s') ? word.slice(0, -1) : word;
}

export function extractKeywords(text) {
  const words = String(text ?? '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word));
  return new Set(words.map(normalise));
}

function isEligible(idea, input, tier) {
  if (idea.minGuests !== undefined && input.guestCount < idea.minGuests) return false;
  if (idea.maxGuests !== undefined && input.guestCount > idea.maxGuests) return false;
  return !idea.tiers || idea.tiers.includes(tier);
}

function matchedKeywords(idea, keywords) {
  return idea.tags.filter((tag) => keywords.has(normalise(tag)));
}

/**
 * Selects tailored ideas matching budget tier and user keywords across categories.
 * @param {object} definition - Archetype data definition
 * @param {object} input - User event input
 * @param {number} [count=DEFAULT_IDEA_COUNT]
 * @returns {Array<{ title: string, detail: string, category: string, matchedOn: string[] }>}
 */
export function selectIdeas(definition, input, count = DEFAULT_IDEA_COUNT) {
  const tier = budgetTier(definition, input);
  const keywords = extractKeywords(`${input.theme} ${input.interests}`);

  const ranked = definition.ideas
    .filter((idea) => isEligible(idea, input, tier))
    .map((idea, index) => ({ idea, index, matches: matchedKeywords(idea, keywords) }))
    .sort((a, b) => b.matches.length - a.matches.length || a.index - b.index);

  const picked = ranked.filter((entry) => entry.matches.length > 0).slice(0, Math.ceil(count / 2));
  const chosen = new Set(picked);

  const queues = new Map();
  for (const entry of ranked) {
    if (chosen.has(entry)) continue;
    if (!queues.has(entry.idea.category)) queues.set(entry.idea.category, []);
    queues.get(entry.idea.category).push(entry);
  }

  while (picked.length < count && [...queues.values()].some((queue) => queue.length > 0)) {
    for (const queue of queues.values()) {
      if (picked.length >= count) break;
      if (queue.length > 0) picked.push(queue.shift());
    }
  }

  return picked.map(({ idea, matches }) => ({
    title: idea.title,
    detail: idea.detail,
    category: idea.category,
    matchedOn: matches,
  }));
}
