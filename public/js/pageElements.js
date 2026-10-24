// Element names used by the page, mapped to their ids in plan.html.
export const ELEMENT_IDS = Object.freeze({
  form: 'event-form',
  formHeading: 'form-heading',
  status: 'status',
  errorSummary: 'error-summary',
  submit: 'submit-button',
  clear: 'clear-button',
  priorityOptions: 'priority-options',
  info: 'info-panel',
  results: 'results',
  resultsHeading: 'results-heading',
  resultsBody: 'results-body',
  dialog: 'confirm-dialog',
  confirmYes: 'confirm-yes',
  steps: 'stepper',
  printRoot: 'print-root',
});

export function collectElements(doc) {
  return Object.fromEntries(Object.entries(ELEMENT_IDS).map(([name, id]) => [name, doc.getElementById(id)]));
}
