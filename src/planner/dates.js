/** @module planner/dates */

// Calendar helpers. Dates are plain "YYYY-MM-DD" strings and every calculation
// is done in UTC so results never depend on the server's time zone.

const ISO_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

/**
 * Parses a YYYY-MM-DD string into a UTC Date object, validating calendar authenticity.
 * @param {unknown} value
 * @returns {Date | null}
 */
export function parseIsoDate(value) {
  if (typeof value !== 'string') return null;
  const match = ISO_PATTERN.exec(value);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const isRealDate =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return isRealDate ? date : null;
}

export function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

export function todayIso(now = new Date()) {
  return toIsoDate(now);
}

/**
 * Adds an integer count of days to an ISO date string.
 * @param {string} iso - YYYY-MM-DD
 * @param {number} days - Days to add (can be negative)
 * @returns {string} Resulting YYYY-MM-DD date
 */
export function addDays(iso, days) {
  const date = parseIsoDate(iso);
  if (!date) throw new RangeError(`Invalid ISO date: ${iso}`);
  return toIsoDate(new Date(date.getTime() + days * MS_PER_DAY));
}

/**
 * Calculates whole days between two ISO date strings (to - from).
 * @param {string} fromIso
 * @param {string} toIso
 * @returns {number}
 */
export function diffDays(fromIso, toIso) {
  const from = parseIsoDate(fromIso);
  const to = parseIsoDate(toIso);
  if (!from || !to) throw new RangeError('Invalid ISO date');
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);
}
