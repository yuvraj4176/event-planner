import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ELEMENT_IDS } from '../../public/js/pageElements.js';
import { describeCurrencies, describeEventTypes } from '../../src/planner/eventTypes.js';
import { LIMITS } from '../../src/planner/validate.js';
import { installFakeDocument } from '../helpers/fakeDom.js';
import { buildPage, flush } from '../helpers/plannerHarness.js';

describe('entry point', () => {
  it('connects the page, the server and the browser, then starts the page', async () => {
    installFakeDocument();
    const { els } = buildPage();
    const byId = Object.fromEntries(Object.entries(ELEMENT_IDS).map(([name, id]) => [id, els[name]]));
    const requested = [];

    globalThis.document.getElementById = (id) => byId[id];
    const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', { value: { language: 'en-IN' }, configurable: true });
    globalThis.window = { addEventListener: () => {} };
    globalThis.fetch = async (path) => {
      requested.push(path);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          eventTypes: describeEventTypes(),
          currencies: describeCurrencies(),
          maxPriorities: 3,
          limits: { ...LIMITS, questionMax: 500, historyMax: 10 },
          aiEnabled: false,
        }),
      };
    };

    try {
      await import('../../public/js/main.js');
      await flush();
      assert.deepEqual(requested, ['/api/meta']);
      assert.equal(els.submit.disabled, false, 'the page has started');
      assert.ok(els.priorityOptions.children.length > 0);
    } finally {
      if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
      else delete globalThis.navigator;
      delete globalThis.window;
      delete globalThis.fetch;
    }
  });
});
