import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseTags, read } from '../helpers/project.js';

const FILES = ['logo.svg', 'logo-mark.svg', 'favicon.svg'];
const PAGES = ['index.html', 'plan.html'];

describe('logo files', () => {
  for (const file of FILES) {
    describe(file, () => {
      const svg = read('public', file);

      it('is a self-contained, sized and labelled SVG', () => {
        assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 \d+ 64"/);
        assert.match(svg, /role="img" aria-label="(?:Celebration|Event) Planner/);
      });

      it('has no scripts, styles, external references or event handlers', () => {
        assert.doesNotMatch(svg, /<script|<style|<foreignObject|<image|\son[a-z]+=|href\s*=\s*["']https?:/i);
      });

      it('uses presentation attributes so it renders under a strict content security policy', () => {
        assert.match(svg, /fill="/);
        assert.doesNotMatch(svg, /\sstyle=/);
      });

      it('is plain ASCII', () => {
        assert.ok([...svg].every((character) => character.charCodeAt(0) < 127));
      });
    });
  }

  it('uses the same mark in the favicon and the logo mark', () => {
    assert.equal(read('public', 'favicon.svg'), read('public', 'logo-mark.svg'));
  });

  it('includes the product name in the full logo', () => {
    const svg = read('public', 'logo.svg');
    assert.match(svg, />(?:Celebration|Event)</);
    assert.match(svg, />Planner</);
  });
});

describe('logo in the pages', () => {
  for (const page of PAGES) {
    it(`${page} shows the mark in the header and footer next to the product name`, () => {
      const html = read('public', page);
      const brandImages = parseTags(html).filter((tag) => tag.name === 'img' && tag.attrs.src === '/logo-mark.svg');
      assert.equal(brandImages.length, 2);
      for (const image of brandImages) {
        assert.equal(image.attrs.alt, '', 'decorative: the name is next to it as text');
        assert.ok(image.attrs.width && image.attrs.height, 'size is reserved to avoid layout shift');
      }
      assert.equal((html.match(/<span class="brand-name">(?:Celebration|Event) <span class="brand-accent">Planner<\/span><\/span>/g) ?? []).length, 2);
      assert.match(html, /<link rel="icon" href="\/favicon\.svg" type="image\/svg\+xml"/);
    });
  }

  it('gives every image in every page an alt attribute', () => {
    for (const page of PAGES) {
      for (const image of parseTags(read('public', page)).filter((tag) => tag.name === 'img')) {
        assert.ok('alt' in image.attrs, page);
      }
    }
  });
});
