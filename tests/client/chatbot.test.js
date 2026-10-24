import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { createApi } from '../../public/js/api.js';
import { createChatbot } from '../../public/js/chatbot.js';
import { GREETING, SUGGESTIONS, messageNode, sourceLabel, suggestionsNode, typingNode } from '../../public/js/chatMessages.js';
import { CHAT_STORAGE_KEY, MAX_STORED_MESSAGES, createChatStore, isMessage, sessionStorageOrNull } from '../../public/js/chatStore.js';
import { ICON_NAMES } from '../../public/js/icons.js';
import { buildTestPlan } from '../helpers/fixtures.js';
import { byClass, byRole, byTag, installFakeDocument } from '../helpers/fakeDom.js';

before(installFakeDocument);

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
    data,
  };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

// A fake server for the chatbot, recording what it was asked.
function fakeApi({ aiEnabled = true, reply, failMeta = false } = {}) {
  const calls = { chat: [], meta: 0 };
  let release = null;
  return {
    calls,
    pending: () => release,
    getMeta: async () => {
      calls.meta += 1;
      if (failMeta) throw new Error('offline');
      return { aiEnabled };
    },
    chat: async (...args) => {
      calls.chat.push(args);
      if (reply instanceof Error) throw reply;
      if (reply === 'hold') await new Promise((resolve) => { release = resolve; });
      return reply === 'hold' || reply === undefined
        ? { source: 'ai', model: 'gemini-test', answer: 'Here is some help.' }
        : reply;
    },
  };
}

function build(options = {}) {
  const api = options.api ?? fakeApi();
  const storage = options.storage ?? memoryStorage();
  const chat = createChatbot({
    api,
    storage,
    getContext: options.getContext ?? (() => null),
    today: () => '2026-10-24',
  });
  const el = chat.element;
  return {
    chat,
    api,
    storage,
    el,
    fab: byClass(el, 'chat-fab')[0],
    panel: byRole(el, 'dialog')[0],
    log: byRole(el, 'log')[0],
    input: byClass(el, 'chat-input')[0],
    status: byClass(el, 'chat-status')[0],
  };
}

describe('chat store', () => {
  it('validates messages', () => {
    assert.equal(isMessage({ role: 'user', text: 'hi' }), true);
    assert.equal(isMessage({ role: 'model', text: 'hi', source: 'ai', model: 'm' }), true);
    const invalid = [
      null,
      'x',
      {},
      { role: 'admin', text: 'hi' },
      { role: 'user', text: '' },
      { role: 'user', text: 5 },
      { role: 'user', text: 'hi', source: 3 },
      { role: 'user', text: 'hi', model: {} },
    ];
    for (const bad of invalid) {
      assert.equal(isMessage(bad), false, JSON.stringify(bad));
    }
  });

  it('round-trips and limits the saved conversation', () => {
    const storage = memoryStorage();
    const store = createChatStore(storage);
    const many = Array.from({ length: MAX_STORED_MESSAGES + 10 }, (_, n) => ({ role: 'user', text: `m${n}` }));
    store.save(many);
    const loaded = store.load();
    assert.equal(loaded.length, MAX_STORED_MESSAGES);
    assert.equal(loaded.at(-1).text, `m${MAX_STORED_MESSAGES + 9}`);
    store.clear();
    assert.deepEqual(store.load(), []);
  });

  it('ignores corrupt or tampered data', () => {
    for (const value of ['nope', '{}', 'null', JSON.stringify([{ role: 'x', text: 'y' }, { role: 'user', text: 'ok' }])]) {
      const loaded = createChatStore(memoryStorage({ [CHAT_STORAGE_KEY]: value })).load();
      assert.ok(loaded.every(isMessage), value);
      assert.ok(loaded.length <= 1);
    }
  });

  it('works without storage and survives storage that throws', () => {
    const none = createChatStore(null);
    assert.deepEqual(none.load(), []);
    assert.doesNotThrow(() => { none.save([]); none.clear(); });
    const broken = createChatStore({ getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); } });
    assert.deepEqual(broken.load(), []);
    assert.doesNotThrow(() => { broken.save([{ role: 'user', text: 'a' }]); broken.clear(); });
  });

  it('finds session storage only when it is available', () => {
    assert.equal(sessionStorageOrNull(), null);
    globalThis.sessionStorage = memoryStorage();
    assert.ok(sessionStorageOrNull());
    delete globalThis.sessionStorage;
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, get() { throw new Error('blocked'); } });
    assert.equal(sessionStorageOrNull(), null);
    delete globalThis.sessionStorage;
  });
});

describe('chat messages', () => {
  it('labels where an answer came from', () => {
    assert.equal(sourceLabel({ source: 'ai', model: 'gemini-2.5-flash' }), 'Gemini - gemini-2.5-flash');
    assert.equal(sourceLabel({ source: 'ai' }), 'Gemini');
    assert.equal(sourceLabel({ source: 'builtin' }), 'Built-in assistant');
  });

  it('renders text as text, with a source line only for assistant messages', () => {
    const bot = messageNode({ role: 'model', text: '<img src=x onerror=alert(1)>', source: 'ai', model: 'm' });
    assert.equal(byTag(bot, 'img').length, 0);
    assert.match(bot.textContent, /<img src=x/);
    assert.equal(byClass(bot, 'chat-source').length, 1);
    assert.equal(byClass(bot, 'chat-avatar').length, 1);

    const user = messageNode({ role: 'user', text: 'hello' });
    assert.ok(user.classes.has('chat-message-user'));
    assert.equal(byClass(user, 'chat-source').length, 0);
    assert.equal(byClass(user, 'chat-avatar').length, 0);

    assert.ok(messageNode({ role: 'model', text: 'oops', error: true }).classes.has('chat-message-error'));
  });

  it('offers suggestions and a typing indicator that is announced in words', () => {
    const picked = [];
    const chips = byClass(suggestionsNode((text) => picked.push(text)), 'chat-chip');
    assert.deepEqual(chips.map((chip) => chip.textContent), [...SUGGESTIONS]);
    chips[1].dispatch('click');
    assert.deepEqual(picked, [SUGGESTIONS[1]]);

    const typing = typingNode();
    assert.match(typing.textContent, /The assistant is typing/);
    assert.equal(byClass(typing, 'chat-dots')[0].getAttribute('aria-hidden'), 'true');
  });
});

describe('chatbot widget', () => {
  it('starts closed with an accessible launcher', () => {
    const { fab, panel, el } = build();
    assert.equal(panel.hidden, true);
    assert.equal(fab.getAttribute('aria-expanded'), 'false');
    assert.equal(fab.getAttribute('aria-controls'), 'chat-panel');
    assert.equal(byClass(fab, 'chat-fab-label')[0].textContent, 'Ask AI');
    assert.equal(byTag(fab, 'svg').length, 1, 'the launcher has a chatbot icon');
    assert.ok(el.classes.has('no-print'));
    assert.equal(panel.getAttribute('aria-labelledby'), 'chat-title');
    assert.equal(byTag(el, 'h2')[0].getAttribute('id'), 'chat-title');
  });

  it('opens from the launcher, focuses the input and shows the greeting and suggestions', async () => {
    const { fab, panel, input, log, chat } = build();
    fab.dispatch('click');
    await flush();
    assert.equal(chat.isOpen, true);
    assert.equal(panel.hidden, false);
    assert.equal(fab.getAttribute('aria-expanded'), 'true');
    assert.equal(byClass(fab, 'chat-fab-label')[0].textContent, 'Close chat');
    assert.equal(input.focused, true);
    assert.match(log.textContent, new RegExp(GREETING.slice(0, 20)));
    assert.equal(byClass(log, 'chat-chip').length, SUGGESTIONS.length);
  });

  it('shows whether Gemini is on, loading the setting only once', async () => {
    const on = build({ api: fakeApi({ aiEnabled: true }) });
    await on.chat.open();
    assert.equal(on.status.textContent, 'Powered by Gemini');
    await on.chat.close();
    await on.chat.open();
    assert.equal(on.api.calls.meta, 1);

    const off = build({ api: fakeApi({ aiEnabled: false }) });
    await off.chat.open();
    assert.match(off.status.textContent, /Basic mode/);

    const unreachable = build({ api: fakeApi({ failMeta: true }) });
    await unreachable.chat.open();
    assert.match(unreachable.status.textContent, /Basic mode/);
  });

  it('mentions the saved plan when there is one', async () => {
    const withPlan = build({ getContext: () => ({ event: { eventName: 'x' } }) });
    await withPlan.chat.open();
    assert.match(withPlan.status.textContent, /using your saved plan/);
  });

  it('sends a message with earlier turns, the saved plan and today, then shows the reply and its source', async () => {
    const event = buildTestPlan().input;
    const { chat, api, log, input } = build({ getContext: () => ({ event }) });
    await chat.open();
    input.value = 'typed text';
    await chat.send('How do I start?');
    await chat.send('And the budget?');

    assert.deepEqual(api.calls.chat[0], ['How do I start?', [], event, '2026-10-24']);
    const [, history] = api.calls.chat[1];
    assert.deepEqual(history, [
      { role: 'user', text: 'How do I start?' },
      { role: 'model', text: 'Here is some help.' },
    ]);
    assert.match(log.textContent, /How do I start\?/);
    assert.match(log.textContent, /Here is some help\./);
    assert.match(log.textContent, /Gemini - gemini-test/);
    assert.equal(input.value, '', 'the box is cleared after sending');
    assert.equal(byClass(log, 'chat-chip').length, 0, 'suggestions disappear once the conversation starts');
  });

  it('can be driven from the form and ignores empty messages', async () => {
    const { chat, api, input, el } = build();
    const form = byTag(el, 'form')[0];
    input.value = '   ';
    assert.equal(form.dispatch('submit').defaultPrevented, true);
    await flush();
    assert.equal(api.calls.chat.length, 0);

    input.value = 'Hello there';
    form.dispatch('submit');
    await flush();
    assert.equal(api.calls.chat.length, 1);
    assert.equal(chat.messages.length, 2);
  });

  it('shows a typing indicator and blocks double sending while waiting', async () => {
    const api = fakeApi({ reply: 'hold' });
    const { chat, log, input, el } = build({ api });
    const sending = chat.send('First');
    assert.equal(byClass(log, 'chat-typing').length, 1);
    assert.equal(input.disabled, true);
    assert.equal(byClass(el, 'chat-send')[0].getAttribute('aria-busy'), 'true');

    await chat.send('Second');
    assert.equal(api.calls.chat.length, 1, 'a second message is ignored while one is pending');

    api.pending()();
    await sending;
    assert.equal(byClass(log, 'chat-typing').length, 0);
    assert.equal(input.disabled, false);
  });

  it('shows errors in the conversation without remembering or resending them', async () => {
    const api = fakeApi({ reply: new Error('The assistant is busy.') });
    const { chat, log, storage } = build({ api });
    await chat.send('Hi');
    assert.match(log.textContent, /The assistant is busy\./);
    assert.equal(byClass(log, 'chat-message-error').length, 1);
    assert.equal(JSON.parse(storage.getItem(CHAT_STORAGE_KEY)).length, 1, 'only the visitor message is saved');

    api.calls.chat.length = 0;
    const working = build({ api: fakeApi() });
    working.chat.messages;
    await chat.send('Again');
    assert.deepEqual(api.calls.chat[0][1].map((turn) => turn.role), ['user'], 'error messages are not sent back as history');
  });

  it('keeps only the latest ten turns as history', async () => {
    const api = fakeApi();
    const { chat } = build({ api });
    for (let n = 0; n < 8; n += 1) await chat.send(`message ${n}`);
    assert.equal(api.calls.chat.at(-1)[1].length, 10);
  });

  it('remembers the conversation for the tab and restores it', async () => {
    const storage = memoryStorage();
    const first = build({ storage });
    await first.chat.send('Remember me');
    const second = build({ storage });
    assert.match(second.log.textContent, /Remember me/);
    assert.equal(byClass(second.log, 'chat-chip').length, 0);
  });

  it('starts a new chat on request', async () => {
    const { chat, log, storage, el } = build();
    await chat.send('Remove this message');
    assert.match(log.textContent, /Remove this message/);
    byClass(el, 'chat-icon-button')[0].dispatch('click');
    assert.doesNotMatch(log.textContent, /Remove this message/);
    assert.equal(storage.getItem(CHAT_STORAGE_KEY), null);
    assert.equal(byClass(log, 'chat-chip').length, SUGGESTIONS.length);
  });

  it('runs a suggestion when it is chosen', async () => {
    const { chat, api, log } = build();
    await chat.open();
    byClass(log, 'chat-chip')[0].dispatch('click');
    await flush();
    assert.equal(api.calls.chat[0][0], SUGGESTIONS[0]);
  });

  it('closes with the close button or Escape and returns focus to the launcher', async () => {
    const { chat, panel, fab, el } = build();
    await chat.open();
    byClass(el, 'chat-icon-button')[1].dispatch('click');
    assert.equal(panel.hidden, true);
    assert.equal(fab.focused, true);
    assert.equal(fab.getAttribute('aria-expanded'), 'false');

    await chat.open();
    panel.dispatch('keydown', { key: 'a' });
    assert.equal(chat.isOpen, true);
    panel.dispatch('keydown', { key: 'Escape' });
    assert.equal(chat.isOpen, false);

    fab.dispatch('click');
    await flush();
    fab.dispatch('click');
    assert.equal(chat.isOpen, false, 'the launcher toggles');
  });

  it('labels its controls for assistive technology', () => {
    const { el, input } = build();
    assert.equal(input.getAttribute('aria-label'), 'Your message');
    assert.equal(byClass(el, 'chat-send')[0].getAttribute('aria-label'), 'Send message');
    assert.deepEqual(byClass(el, 'chat-icon-button').map((button) => button.getAttribute('aria-label')), ['Start a new chat', 'Close chat']);
    const log = byRole(el, 'log')[0];
    assert.equal(log.getAttribute('aria-live'), 'polite');
    assert.match(el.textContent, /AI can make mistakes/);
  });
});

describe('chat support', () => {
  it('has the icons the chat needs', () => {
    for (const name of ['bot', 'send', 'close', 'refresh']) assert.ok(ICON_NAMES.includes(name), name);
  });

  it('posts to the chat endpoint', async () => {
    const seen = [];
    const api = createApi(async (path, options) => {
      seen.push({ path, body: JSON.parse(options.body) });
      return { ok: true, status: 200, json: async () => ({ answer: 'x' }) };
    });
    await api.chat('Hi', [{ role: 'user', text: 'a' }], { eventName: 'e' }, '2026-10-24');
    assert.deepEqual(seen, [
      { path: '/api/chat', body: { message: 'Hi', history: [{ role: 'user', text: 'a' }], event: { eventName: 'e' }, today: '2026-10-24' } },
    ]);
  });
});
