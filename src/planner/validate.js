import { addDays, parseIsoDate } from './dates.js';
import { CURRENCIES } from './currencies.js';
import { MAX_PRIORITIES, getEventType, priorityOptions } from './eventTypes.js';

export const LIMITS = Object.freeze({
  nameMax: 80,
  locationMax: 80,
  themeMax: 80,
  interestsMax: 300,
  guestsMax: 5000,
  budgetMin: 100,
  budgetMax: 1_000_000_000,
  planningHorizonDays: 1826,
});

const CONTROL_CHARACTERS = /\p{Cc}/gu;
// Bidirectional overrides can make text render differently from how it is stored.
const BIDI_OVERRIDES = /[‪-‮⁦-⁩]/g;

export function cleanText(value) {
  if (typeof value !== 'string') return '';
  return value.replace(CONTROL_CHARACTERS, ' ').replace(BIDI_OVERRIDES, '').replace(/\s+/g, ' ').trim();
}

function toInteger(value) {
  if (typeof value === 'number') return Number.isInteger(value) ? value : null;
  if (typeof value === 'string' && /^\d{1,10}$/.test(value.trim())) return Number(value.trim());
  return null;
}

function toAmount(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value) : null;
  if (typeof value === 'string' && /^\d{1,12}(\.\d{1,4})?$/.test(value.trim())) {
    return Math.round(Number(value.trim()));
  }
  return null;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateOptionalText(raw, field, label, max, fail) {
  if (raw === undefined || raw === null || raw === '') return '';
  if (typeof raw !== 'string') {
    fail(field, `${label} must be text.`);
    return '';
  }
  const text = cleanText(raw);
  if (text.length > max) fail(field, `${label} must be ${max} characters or fewer.`);
  return text;
}

function validatePriorities(raw, definition, fail) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.some((item) => typeof item !== 'string')) {
    fail('priorities', 'Priorities must be a list of budget categories.');
    return [];
  }
  const unique = [...new Set(raw)];
  if (unique.length > MAX_PRIORITIES) {
    fail('priorities', `Choose at most ${MAX_PRIORITIES} priorities.`);
    return [];
  }
  const allowed = new Set(priorityOptions(definition).map((option) => option.key));
  if (unique.some((key) => !allowed.has(key))) {
    fail('priorities', 'One of the chosen priorities is not available for this event type.');
    return [];
  }
  return unique;
}

// Validates and normalises an event description. Only known fields are copied
// across, so unexpected properties in the request never reach the planner.
export function validateEventInput(raw, { today }) {
  if (!isPlainObject(raw)) {
    return { ok: false, errors: [{ field: 'body', message: 'Request body must be a JSON object.' }] };
  }

  const errors = [];
  const fail = (field, message) => errors.push({ field, message });

  const definition = getEventType(raw.eventType);
  if (!definition) fail('eventType', 'Choose a wedding, birthday or community event.');

  const eventName = cleanText(raw.eventName);
  if (eventName.length === 0) fail('eventName', 'Enter a name for your event.');
  else if (eventName.length > LIMITS.nameMax) {
    fail('eventName', `Event name must be ${LIMITS.nameMax} characters or fewer.`);
  }

  const eventDate = typeof raw.eventDate === 'string' ? raw.eventDate : '';
  if (!parseIsoDate(eventDate)) fail('eventDate', 'Enter the event date as a valid date.');
  else if (eventDate < today) fail('eventDate', 'The event date must be today or later.');
  else if (eventDate > addDays(today, LIMITS.planningHorizonDays)) {
    fail('eventDate', 'The event date must be within the next five years.');
  }

  const guestCount = toInteger(raw.guestCount);
  if (guestCount === null || guestCount < 1 || guestCount > LIMITS.guestsMax) {
    fail('guestCount', `Enter a guest count between 1 and ${LIMITS.guestsMax}.`);
  }

  const totalBudget = toAmount(raw.totalBudget);
  if (totalBudget === null || totalBudget < LIMITS.budgetMin || totalBudget > LIMITS.budgetMax) {
    fail('totalBudget', `Enter a total budget between ${LIMITS.budgetMin} and ${LIMITS.budgetMax.toLocaleString('en-US')}.`);
  }

  const currency = typeof raw.currency === 'string' ? raw.currency : '';
  if (!Object.hasOwn(CURRENCIES, currency)) fail('currency', 'Choose a supported currency.');

  const location = validateOptionalText(raw.location, 'location', 'Location', LIMITS.locationMax, fail);
  const theme = validateOptionalText(raw.theme, 'theme', 'Theme', LIMITS.themeMax, fail);
  const interests = validateOptionalText(raw.interests, 'interests', 'Interests', LIMITS.interestsMax, fail);
  const priorities = definition ? validatePriorities(raw.priorities, definition, fail) : [];

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      eventType: definition.key,
      eventName,
      eventDate,
      guestCount,
      totalBudget,
      currency,
      location,
      theme,
      interests,
      priorities,
    },
  };
}
