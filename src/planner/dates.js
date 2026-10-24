// Calendar helpers. Dates are plain "YYYY-MM-DD" strings and every calculation
// is done in UTC so results never depend on the server's time zone.

const ISO_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

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

export function addDays(iso, days) {
  const date = parseIsoDate(iso);
  if (!date) throw new RangeError(`Invalid ISO date: ${iso}`);
  return toIsoDate(new Date(date.getTime() + days * MS_PER_DAY));
}

// Whole days from `fromIso` to `toIso`; negative when `toIso` is earlier.
export function diffDays(fromIso, toIso) {
  const from = parseIsoDate(fromIso);
  const to = parseIsoDate(toIso);
  if (!from || !to) throw new RangeError('Invalid ISO date');
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);
}
