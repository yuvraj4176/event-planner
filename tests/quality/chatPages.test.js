import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { read } from '../helpers/project.js';

const PAGES = ['index.html', 'plan.html'];

describe('chat assistant on every page', () => {
  for (const page of PAGES) {
    it(`${page} loads the chat styles and the shared script that mounts it`, () => {
      const html = read('public', page);
      assert.match(html, /<link rel="stylesheet" href="\/css\/chatbot\.css" \/>/);
      assert.match(html, /<script type="module" src="\/js\/site\.js">/);
    });
  }

  it('is mounted by the shared script, which is the only place that creates it', () => {
    assert.match(read('public', 'js', 'site.js'), /createChatbot\(/);
    assert.doesNotMatch(read('public', 'js', 'main.js'), /createChatbot/);
  });

  it('keeps the launcher fixed to the bottom right corner, above page content', () => {
    const css = read('public', 'css', 'chatbot.css');
    const launcher = /\.chat-fab \{([^}]*)\}/.exec(css)[1];
    assert.match(launcher, /position: fixed/);
    assert.match(launcher, /right: 1\.25rem/);
    assert.match(launcher, /bottom: 1\.25rem/);
    assert.match(launcher, /min-height: 3\.5rem/);
  });

  it('respects reduced motion and hides itself when printing', () => {
    const css = read('public', 'css', 'chatbot.css');
    assert.match(css, /prefers-reduced-motion: reduce/);
    assert.match(css, /@media print[\s\S]*\.chat-widget[\s\S]*display: none/);
  });

  it('only uses the shared colour tokens, so contrast is covered by the contrast tests', () => {
    const css = read('public', 'css', 'chatbot.css');
    assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/);
  });
});
