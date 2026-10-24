// Saves the plan and progress in the browser. Storage can be missing, full or
// blocked, and its contents can be edited by the user, so every read is
// validated and every failure is silent.

import { emptyProgress, reconcileProgress } from './progress.js';

export const STORAGE_KEY = 'celebration-planner:v1';
const SCHEMA_VERSION = 1;

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isText = (value) => typeof value === 'string';

function isLineShape(line) {
  return isObject(line) && isText(line.key) && isText(line.label) && Number.isFinite(line.amount) && Number.isFinite(line.share);
}

function isTaskShape(task) {
  return isObject(task) && isText(task.id) && isText(task.title) && isText(task.detail) && isText(task.dueDate) && isText(task.phase);
}

function isVendorShape(vendor) {
  return (
    isObject(vendor) &&
    isText(vendor.key) &&
    isText(vendor.label) &&
    isText(vendor.bookBy) &&
    Number.isFinite(vendor.budget) &&
    Array.isArray(vendor.checklist) &&
    vendor.checklist.every((step) => isObject(step) && isText(step.id) && isText(step.text)) &&
    Array.isArray(vendor.questions) &&
    vendor.questions.every(isText)
  );
}

function isIdeaShape(idea) {
  return isObject(idea) && isText(idea.title) && isText(idea.detail) && isText(idea.category);
}

export function isPlanShape(plan) {
  return (
    isObject(plan) &&
    isObject(plan.input) &&
    isText(plan.input.eventName) &&
    isText(plan.input.eventDate) &&
    isText(plan.input.eventType) &&
    isText(plan.input.currency) &&
    Number.isFinite(plan.input.guestCount) &&
    isText(plan.eventTypeLabel) &&
    isObject(plan.summary) &&
    Number.isFinite(plan.summary.daysUntilEvent) &&
    Number.isFinite(plan.summary.budgetPerGuest) &&
    isObject(plan.budget) &&
    Number.isFinite(plan.budget.total) &&
    Array.isArray(plan.budget.lines) &&
    plan.budget.lines.every(isLineShape) &&
    isObject(plan.timeline) &&
    Array.isArray(plan.timeline.tasks) &&
    plan.timeline.tasks.every(isTaskShape) &&
    Array.isArray(plan.vendors) &&
    plan.vendors.every(isVendorShape) &&
    isObject(plan.ideas) &&
    Array.isArray(plan.ideas.items) &&
    plan.ideas.items.every(isIdeaShape)
  );
}

export function createStore(storage) {
  function load() {
    if (!storage) return null;
    try {
      const saved = JSON.parse(storage.getItem(STORAGE_KEY));
      if (!isObject(saved) || saved.version !== SCHEMA_VERSION || !isPlanShape(saved.plan)) return null;
      return { plan: saved.plan, progress: reconcileProgress(saved.progress, saved.plan) };
    } catch {
      return null;
    }
  }

  function save({ plan, progress }) {
    if (!storage) return false;
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify({ version: SCHEMA_VERSION, plan, progress: progress ?? emptyProgress() }));
      return true;
    } catch {
      return false;
    }
  }

  function clear() {
    if (!storage) return;
    try {
      storage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing useful can be done if storage is unavailable.
    }
  }

  return { load, save, clear };
}

export function browserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
