import { h } from '../dom.js';

export function createAskView({ maxLength, onAsk }) {
  const answer = h('div', { class: 'answer', role: 'status', 'aria-live': 'polite' });
  const input = h('textarea', {
    id: 'question',
    rows: '3',
    maxlength: String(maxLength),
    'aria-describedby': 'question-hint',
  });
  const button = h('button', { type: 'submit', class: 'button button-primary', text: 'Ask' });

  function setBusy(busy) {
    button.disabled = busy;
    button.setAttribute('aria-busy', String(busy));
  }

  function showAnswer({ answer: text, source }) {
    answer.replaceChildren(
      h('p', { class: 'answer-text', text }),
      h('p', { class: 'source-note', text: source === 'ai' ? 'Answered by the Gemini AI assistant.' : 'Answered by the built-in planner.' }),
    );
  }

  function showError(text) {
    answer.replaceChildren(h('p', { class: 'field-error', text }));
  }

  const form = h(
    'form',
    {
      class: 'ask-form',
      on: {
        submit: (event) => {
          event.preventDefault();
          const question = input.value.trim();
          if (question) onAsk(question);
        },
      },
    },
    h('label', { for: 'question', text: 'Your question' }),
    input,
    h('p', { class: 'hint', id: 'question-hint', text: 'For example: What should I do next? How should I split my budget?' }),
    h('div', { class: 'action-row' }, button),
  );

  const element = h(
    'div',
    { class: 'ask-view' },
    h('h3', { text: 'Ask the planner' }),
    h('p', { class: 'section-intro', text: 'Get a quick answer about your budget, timeline, vendors, guests or ideas.' }),
    form,
    answer,
  );

  return { element, form, input, setBusy, showAnswer, showError };
}
