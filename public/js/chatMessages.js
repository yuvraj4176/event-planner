// Builds the pieces of the chat conversation: messages, suggestions and the
// typing indicator. All text is attached as text, never parsed as markup.

import { h } from './dom.js';
import { icon } from './icons.js';

export const SUGGESTIONS = Object.freeze([
  'How do I start planning?',
  'How is my budget split?',
  'What if my event is soon?',
]);

export const GREETING = 'Hello! I am your planning assistant. Ask me about budgets, timelines, vendors or ideas.';

export function sourceLabel({ source, model }) {
  if (source === 'ai') return model ? `Gemini - ${model}` : 'Gemini';
  return 'Built-in assistant';
}

export function messageNode(message) {
  const fromBot = message.role === 'model';
  const classes = ['chat-message', fromBot ? 'chat-message-bot' : 'chat-message-user'];
  if (message.error) classes.push('chat-message-error');
  return h(
    'div',
    { class: classes.join(' ') },
    fromBot ? h('span', { class: 'chat-avatar' }, icon('bot')) : null,
    h(
      'div',
      { class: 'chat-bubble' },
      h('p', { text: message.text }),
      fromBot && message.source ? h('p', { class: 'chat-source', text: sourceLabel(message) }) : null,
    ),
  );
}

export function suggestionsNode(onPick) {
  return h(
    'div',
    { class: 'chat-suggestions' },
    SUGGESTIONS.map((text) => h('button', { type: 'button', class: 'chat-chip', text, on: { click: () => onPick(text) } })),
  );
}

export function typingNode() {
  return h(
    'div',
    { class: 'chat-message chat-message-bot chat-typing' },
    h('span', { class: 'chat-avatar' }, icon('bot')),
    h(
      'div',
      { class: 'chat-bubble' },
      h('span', { class: 'visually-hidden', text: 'The assistant is typing' }),
      h('span', { class: 'chat-dots', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
    ),
  );
}
