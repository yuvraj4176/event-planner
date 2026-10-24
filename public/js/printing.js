import { buildPrintSheet } from './printSheet.js';
import { localTodayIso } from './format.js';

// Keeps the hidden print sheet up to date. It is rebuilt just before the browser
// prints, so Ctrl+P and the Print button both print the current plan and progress.
export function createPrinter({ root, getState, locale }) {
  function refresh() {
    const { plan, progress } = getState();
    if (!plan) {
      root.replaceChildren();
      return;
    }
    root.replaceChildren(buildPrintSheet({ plan, progress, locale, today: localTodayIso() }));
  }

  return { refresh, print: () => window.print() };
}
