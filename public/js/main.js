// Entry point of the Plan an event page: connects the page's elements, the
// server and the browser's storage to the page logic.
import { createApi } from './api.js';
import { pickLocale } from './format.js';
import { collectElements } from './pageElements.js';
import { createPlannerPage } from './plannerPage.js';
import { browserStorage, createStore } from './store.js';

createPlannerPage({
  els: collectElements(document),
  api: createApi(),
  store: createStore(browserStorage()),
  locale: pickLocale(navigator.language),
}).init();
