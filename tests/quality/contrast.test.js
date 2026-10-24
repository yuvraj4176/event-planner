import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { contrastRatio, read } from '../helpers/project.js';

const css = read('public', 'css', 'styles.css');

function tokens(block) {
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((match) => [match[1], match[2]]));
}

const lightBlock = /:root\s*\{([\s\S]*?)\n\}/.exec(css)[1];
const darkBlock = /prefers-color-scheme:\s*dark\)\s*\{\s*:root\s*\{([\s\S]*?)\n  \}/.exec(css)[1];
const themes = {
  light: tokens(lightBlock),
  dark: { ...tokens(lightBlock), ...tokens(darkBlock) },
};

// [foreground, background, minimum ratio, where it is used]
const TEXT = 4.5;
const NON_TEXT = 3;
const PAIRS = [
  ['text', 'bg', TEXT, 'body text'],
  ['text', 'surface', TEXT, 'text on cards'],
  ['text', 'surface-alt', TEXT, 'text on tinted panels'],
  ['text-muted', 'bg', TEXT, 'secondary text on page'],
  ['text-muted', 'surface', TEXT, 'hints on cards'],
  ['text-muted', 'surface-alt', TEXT, 'statistic labels'],
  ['primary', 'bg', TEXT, 'links'],
  ['primary', 'surface', TEXT, 'links and secondary buttons'],
  ['primary', 'surface-alt', TEXT, 'selected tab, button hover'],
  ['on-primary', 'primary', TEXT, 'primary button'],
  ['on-primary', 'primary-2', TEXT, 'end of the button and tab gradient'],
  ['hero-1', 'on-hero', TEXT, 'light button and current step text'],
  ['on-hero', 'hero-1', TEXT, 'hero text, gradient start'],
  ['on-hero', 'hero-2', TEXT, 'hero text, gradient middle'],
  ['on-hero', 'hero-3', TEXT, 'hero text, gradient end'],
  ['accent', 'surface-alt', TEXT, 'accent text on tinted panels'],
  ['accent', 'bg', TEXT, 'accent text'],
  ['accent', 'surface', TEXT, 'due today status, accent badge'],
  ['danger', 'bg', TEXT, 'error text'],
  ['danger', 'surface', TEXT, 'error text on cards'],
  ['danger', 'surface-alt', TEXT, 'over budget totals'],
  ['success', 'surface', TEXT, 'done status'],
  ['success', 'surface-alt', TEXT, 'done status on completed tasks'],
  ['warning-text', 'warning-bg', TEXT, 'notices'],
  ['border-strong', 'surface', NON_TEXT, 'form control borders'],
  ['border-strong', 'bg', NON_TEXT, 'button borders'],
  ['focus', 'bg', NON_TEXT, 'focus ring on page'],
  ['focus', 'surface', NON_TEXT, 'focus ring on cards'],
  ['focus', 'surface-alt', NON_TEXT, 'focus ring on tinted panels'],
  ['primary', 'surface', NON_TEXT, 'selected card border'],
  ['danger', 'surface', NON_TEXT, 'invalid field border'],
];

describe('colour contrast meets WCAG AA', () => {
  for (const [name, colours] of Object.entries(themes)) {
    describe(`${name} theme`, () => {
      for (const [foreground, background, minimum, use] of PAIRS) {
        it(`${foreground} on ${background} (${use}) is at least ${minimum}:1`, () => {
          assert.ok(colours[foreground], `missing token ${foreground}`);
          assert.ok(colours[background], `missing token ${background}`);
          const ratio = contrastRatio(colours[foreground], colours[background]);
          assert.ok(ratio >= minimum, `${ratio.toFixed(2)}:1`);
        });
      }
    });
  }

  it('measures contrast correctly', () => {
    assert.equal(contrastRatio('#000000', '#ffffff').toFixed(1), '21.0');
    assert.equal(contrastRatio('#ffffff', '#ffffff').toFixed(1), '1.0');
  });
});
