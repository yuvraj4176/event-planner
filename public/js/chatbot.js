// The floating chat assistant, shown on every page.

import { GREETING, messageNode, suggestionsNode, typingNode } from './chatMessages.js';
import { createChatStore } from './chatStore.js';
import { h } from './dom.js';
import { localTodayIso } from './format.js';
import { icon } from './icons.js';

const MAX_MESSAGE_LENGTH = 500;
const HISTORY_TURNS = 10;

// `api.chat(message, history, event, today)` talks to the server and
// `getContext()` returns { event } when the visitor has a saved plan.
export function createChatbot({ api, storage, getContext = () => null, today = localTodayIso }) {
  const store = createChatStore(storage);
  let messages = store.load();
  let isOpen = false;
  let busy = false;
  let meta = null;

  const log = h('div', { class: 'chat-log', role: 'log', 'aria-live': 'polite', 'aria-label': 'Conversation' });
  const status = h('p', { class: 'chat-status' });
  const input = h('input', {
    type: 'text',
    class: 'chat-input',
    maxlength: String(MAX_MESSAGE_LENGTH),
    autocomplete: 'off',
    placeholder: 'Type your question',
    'aria-label': 'Your message',
    'aria-describedby': 'chat-disclaimer',
  });
  const sendButton = h('button', { type: 'submit', class: 'chat-send', 'aria-label': 'Send message' }, icon('send'));
  const fabIcon = h('span', { class: 'chat-fab-icon' });
  const fabLabel = h('span', { class: 'chat-fab-label' });
  const fab = h(
    'button',
    { type: 'button', class: 'chat-fab', 'aria-expanded': 'false', 'aria-controls': 'chat-panel' },
    fabIcon,
    fabLabel,
  );

  function scrollToEnd() {
    log.scrollTop = log.scrollHeight;
  }

  function renderLog() {
    const nodes = [messageNode({ role: 'model', text: GREETING })];
    if (!messages.some((message) => message.role === 'user')) nodes.push(suggestionsNode(send));
    nodes.push(...messages.map(messageNode));
    if (busy) nodes.push(typingNode());
    log.replaceChildren(...nodes);
    scrollToEnd();
  }

  function renderStatus() {
    const mode = meta === null ? 'Connecting...' : meta.aiEnabled ? 'Powered by Gemini' : 'Basic mode: AI is switched off';
    status.textContent = getContext() ? `${mode} - using your saved plan` : mode;
  }

  function renderFab() {
    fabIcon.replaceChildren(icon(isOpen ? 'close' : 'bot'));
    fabLabel.textContent = isOpen ? 'Close chat' : 'Ask AI';
    fab.setAttribute('aria-expanded', String(isOpen));
  }

  function setBusy(value) {
    busy = value;
    input.disabled = value;
    sendButton.disabled = value;
    sendButton.setAttribute('aria-busy', String(value));
    renderLog();
  }

  function remember(message) {
    messages = [...messages, message];
    store.save(messages);
  }

  async function send(text) {
    const message = String(text).trim();
    if (!message || busy) return;

    const history = messages
      .filter((entry) => !entry.error)
      .slice(-HISTORY_TURNS)
      .map(({ role, text: content }) => ({ role, text: content }));
    remember({ role: 'user', text: message });
    input.value = '';
    setBusy(true);
    try {
      const reply = await api.chat(message, history, getContext()?.event, today());
      remember({ role: 'model', text: reply.answer, source: reply.source, ...(reply.model ? { model: reply.model } : {}) });
    } catch (error) {
      messages = [...messages, { role: 'model', text: error.message, error: true }];
    } finally {
      setBusy(false);
      input.focus();
    }
  }

  async function open() {
    isOpen = true;
    panel.hidden = false;
    renderFab();
    renderStatus();
    renderLog();
    input.focus();
    if (meta === null) {
      try {
        meta = await api.getMeta();
      } catch {
        meta = { aiEnabled: false };
      }
      renderStatus();
    }
  }

  function close() {
    isOpen = false;
    panel.hidden = true;
    renderFab();
    fab.focus();
  }

  function reset() {
    messages = [];
    store.clear();
    renderLog();
    input.focus();
  }

  const form = h(
    'form',
    { class: 'chat-form', on: { submit: (event) => { event.preventDefault(); send(input.value); } } },
    input,
    sendButton,
  );

  const panel = h(
    'section',
    {
      id: 'chat-panel',
      class: 'chat-panel',
      role: 'dialog',
      'aria-labelledby': 'chat-title',
      hidden: true,
      on: { keydown: (event) => { if (event.key === 'Escape') close(); } },
    },
    h(
      'header',
      { class: 'chat-header' },
      h('span', { class: 'chat-avatar chat-avatar-large' }, icon('bot')),
      h('div', { class: 'chat-heading' }, h('h2', { id: 'chat-title', text: 'Planning assistant' }), status),
      h('button', { type: 'button', class: 'chat-icon-button', 'aria-label': 'Start a new chat', on: { click: reset } }, icon('refresh')),
      h('button', { type: 'button', class: 'chat-icon-button', 'aria-label': 'Close chat', on: { click: close } }, icon('close')),
    ),
    log,
    form,
    h('p', { id: 'chat-disclaimer', class: 'chat-disclaimer', text: 'AI can make mistakes. Check important details.' }),
  );

  fab.addEventListener('click', () => (isOpen ? close() : open()));
  renderFab();
  renderStatus();
  renderLog();

  const element = h('div', { class: 'chat-widget no-print' }, panel, fab);
  return { element, open, close, send, reset, get isOpen() { return isOpen; }, get messages() { return messages; } };
}
