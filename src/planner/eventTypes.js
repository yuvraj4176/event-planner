/** @module planner/eventTypes */
import { wedding } from './data/wedding.js';
import { birthday } from './data/birthday.js';
import { community } from './data/community.js';
import { CURRENCIES } from './currencies.js';

export const EVENT_TYPES = Object.freeze({ wedding, birthday, community });
export const EVENT_TYPE_KEYS = Object.freeze(Object.keys(EVENT_TYPES));

export const MAX_PRIORITIES = 3;

/**
 * Lists categories available for user budget prioritisation.
 * @param {object} definition
 * @returns {Array<{ key: string, label: string }>}
 */
export function priorityOptions(definition) {
  return definition.budget
    .filter((line) => line.key !== definition.contingencyKey)
    .map(({ key, label }) => ({ key, label }));
}

/**
 * Retrieves the event definition by archetype key.
 * @param {string} key
 * @returns {object | null}
 */
export function getEventType(key) {
  return typeof key === 'string' && Object.hasOwn(EVENT_TYPES, key) ? EVENT_TYPES[key] : null;
}

// Public metadata used by the web client to build the form.
export function describeEventTypes() {
  return EVENT_TYPE_KEYS.map((key) => {
    const definition = EVENT_TYPES[key];
    return {
      key,
      label: definition.label,
      summary: definition.summary,
      priorities: priorityOptions(definition),
    };
  });
}

export function describeCurrencies() {
  return Object.entries(CURRENCIES).map(([code, { label }]) => ({ code, label }));
}
