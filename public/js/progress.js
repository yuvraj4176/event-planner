// Tracks what the user has done: completed tasks, vendor steps and money spent.
// Every function is pure and returns new objects, which keeps the views simple
// and the logic easy to test.

import { percentage } from './format.js';

export function emptyProgress() {
  return { tasks: {}, steps: {}, spent: {} };
}

function withFlag(map, id, done) {
  const next = { ...map };
  if (done) next[id] = true;
  else delete next[id];
  return next;
}

export function setTaskDone(progress, id, done) {
  return { ...progress, tasks: withFlag(progress.tasks, id, done) };
}

export function setStepDone(progress, id, done) {
  return { ...progress, steps: withFlag(progress.steps, id, done) };
}

export function setSpent(progress, key, amount) {
  const spent = { ...progress.spent };
  if (Number.isFinite(amount) && amount > 0) spent[key] = amount;
  else delete spent[key];
  return { ...progress, spent };
}

function pickKnown(map, knownIds) {
  const result = {};
  for (const id of knownIds) {
    if (Object.hasOwn(map, id)) result[id] = map[id];
  }
  return result;
}

// Keeps only progress that still refers to something in the plan and that has a
// valid value. Used after a plan is rebuilt and when loading saved data.
export function reconcileProgress(raw, plan) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const tasks = pickKnown(source.tasks ?? {}, plan.timeline.tasks.map((task) => task.id));
  const stepIds = plan.vendors.flatMap((vendor) => vendor.checklist.map((step) => step.id));
  const steps = pickKnown(source.steps ?? {}, stepIds);
  const spent = pickKnown(source.spent ?? {}, plan.budget.lines.map((line) => line.key));

  return {
    tasks: Object.fromEntries(Object.keys(tasks).filter((id) => tasks[id] === true).map((id) => [id, true])),
    steps: Object.fromEntries(Object.keys(steps).filter((id) => steps[id] === true).map((id) => [id, true])),
    spent: Object.fromEntries(
      Object.keys(spent)
        .filter((key) => Number.isFinite(spent[key]) && spent[key] > 0)
        .map((key) => [key, spent[key]]),
    ),
  };
}

export function taskStats(plan, progress) {
  const total = plan.timeline.tasks.length;
  const done = plan.timeline.tasks.filter((task) => progress.tasks[task.id] === true).length;
  return { done, total, percent: percentage(done, total) };
}

export function vendorStats(vendor, progress) {
  const total = vendor.checklist.length;
  const done = vendor.checklist.filter((step) => progress.steps[step.id] === true).length;
  return { done, total };
}

export function lineSpend(line, progress) {
  const spent = progress.spent[line.key] ?? 0;
  return { spent, remaining: line.amount - spent, over: spent > line.amount };
}

export function spendTotals(plan, progress) {
  const planned = plan.budget.total;
  const spent = plan.budget.lines.reduce((sum, line) => sum + (progress.spent[line.key] ?? 0), 0);
  return { planned, spent, remaining: planned - spent, over: spent > planned };
}
