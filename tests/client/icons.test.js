import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { h } from '../../public/js/dom.js';
import { ICON_NAMES, hasIcon, hydrateIcons, icon } from '../../public/js/icons.js';
import { createTabs } from '../../public/js/views/tabs.js';
import { byRole, byTag, findAll, installFakeDocument } from '../helpers/fakeDom.js';

before(installFakeDocument);

describe('icons', () => {
  it('offers a useful set of named icons', () => {
    for (const name of ['budget', 'calendar', 'checklist', 'lightbulb', 'message', 'shield', 'chart', 'arrow-right']) {
      assert.ok(ICON_NAMES.includes(name), name);
      assert.equal(hasIcon(name), true);
    }
    assert.equal(hasIcon('nope'), false);
    assert.equal(hasIcon('toString'), false);
  });

  it('draws every icon as a decorative svg with shapes', () => {
    for (const name of ICON_NAMES) {
      const svg = icon(name);
      assert.equal(svg.namespace, 'http://www.w3.org/2000/svg');
      assert.equal(svg.getAttribute('viewBox'), '0 0 24 24');
      assert.equal(svg.getAttribute('aria-hidden'), 'true');
      assert.equal(svg.getAttribute('focusable'), 'false');
      assert.ok(svg.classes.has('icon'));
      assert.ok(svg.children.length > 0, name);
      assert.ok(svg.children.every((shape) => ['PATH', 'CIRCLE', 'RECT'].includes(shape.tagName)), name);
    }
  });

  it('rejects unknown icon names', () => {
    assert.throws(() => icon('missing'), RangeError);
  });

  it('fills marked elements and ignores unknown names and filled slots', () => {
    const filled = h('span', { 'data-icon': 'chart' });
    const unknown = h('span', { 'data-icon': 'does-not-exist' });
    const already = h('span', { 'data-icon': 'chart' }, 'text');
    const root = h('div', {}, filled, unknown, already);
    hydrateIcons(root);
    hydrateIcons(root);
    assert.equal(byTag(filled, 'svg').length, 1);
    assert.equal(unknown.children.length, 0);
    assert.equal(byTag(already, 'svg').length, 0);
  });

  it('adds icons to tabs while keeping the label as the accessible text', () => {
    const tabs = createTabs({
      label: 'Sections',
      tabs: [
        { id: 'a', label: 'Alpha', icon: 'budget', content: h('p') },
        { id: 'b', label: 'Beta', content: h('p') },
      ],
    });
    const [first, second] = byRole(tabs.element, 'tab');
    assert.equal(findAll(first, (node) => node.tagName === 'SVG').length, 1);
    assert.equal(findAll(second, (node) => node.tagName === 'SVG').length, 0);
    assert.equal(first.textContent, 'Alpha');
    assert.equal(second.textContent, 'Beta');
  });
});
