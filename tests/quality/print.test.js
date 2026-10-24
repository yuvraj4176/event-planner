import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { contrastRatio, parseTags, read } from '../helpers/project.js';

const css = read('public', 'css', 'print.css');
const plan = read('public', 'plan.html');
const shared = read('public', 'css', 'styles.css');

const variable = (name) => new RegExp(`--p-${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css)[1];

describe('print stylesheet', () => {
  it('is only loaded for printing, on the plan page', () => {
    const link = parseTags(plan).find((tag) => tag.name === 'link' && tag.attrs.href === '/css/print.css');
    assert.equal(link.attrs.media, 'print');
    assert.equal(parseTags(read('public', 'index.html')).some((tag) => tag.attrs.href === '/css/print.css'), false);
  });

  it('has a hidden print root that is empty until printing', () => {
    const root = parseTags(plan).find((tag) => tag.attrs.id === 'print-root');
    assert.ok(root);
    assert.match(plan, /<div id="print-root"[^>]*><\/div>/);
    assert.match(shared, /#print-root \{\s*display: none;/);
  });

  it('sets up A4 pages and keeps colours when printed', () => {
    assert.match(css, /@page \{[^}]*size: A4/);
    assert.match(css, /print-color-adjust: exact/);
  });

  it('shows only the print sheet, and only when there is a plan to print', () => {
    assert.match(css, /body:has\(#print-root > \*\) > :not\(#print-root\) \{\s*display: none !important/);
    assert.match(css, /#print-root \{\s*display: block/);
  });

  it('keeps blocks together across pages', () => {
    for (const selector of ['.print-vendor', '.print-check', '.print-table tr']) {
      const rule = new RegExp(`${selector.replace(/[.]/g, '\\.')} \\{[^}]*break-inside: avoid`);
      assert.match(css, rule, selector);
    }
    assert.match(css, /\.print-heading \{[^}]*break-after: avoid/);
  });

  it('always prints dark text on white, using colours that meet WCAG AA', () => {
    const [text, muted, primary, accent, tint] = ['text', 'muted', 'primary', 'accent', 'tint'].map(variable);
    for (const [name, colour] of Object.entries({ text, muted, primary, accent })) {
      assert.ok(contrastRatio(colour, '#ffffff') >= 4.5, `${name} on white`);
      assert.ok(contrastRatio(colour, tint) >= 4.5, `${name} on tint`);
    }
  });

  it('prints white banner text on a gradient that is dark enough everywhere', () => {
    const banner = /\.print-banner \{[^}]*linear-gradient\(([^)]*)\)/.exec(css)[1];
    const stops = [...banner.matchAll(/#[0-9a-fA-F]{6}/g)].map((match) => match[0]);
    assert.equal(stops.length, 3);
    for (const stop of stops) assert.ok(contrastRatio('#ffffff', stop) >= 4.5, stop);
  });

  it('draws checkboxes with shapes, not symbols, so nothing depends on fonts', () => {
    assert.match(css, /\.print-box \{[^}]*border: 0\.4mm solid/);
    assert.match(css, /\.print-box\.is-checked::after/);
    assert.ok([...css].every((character) => character.charCodeAt(0) < 127));
  });

  it('crosses out finished items and does not rely on colour alone to show them', () => {
    assert.match(css, /\.print-check\.is-done \.print-check-title \{[^}]*line-through/);
  });
});
