import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { EVENT_TYPE_KEYS } from '../../src/planner/eventTypes.js';
import { CURRENCIES } from '../../src/planner/currencies.js';
import { ICON_NAMES } from '../../public/js/icons.js';
import { ROOT, parseTags, read } from '../helpers/project.js';

const css = read('public', 'css', 'styles.css');

function load(file) {
  const html = read('public', file);
  const tags = parseTags(html);
  return {
    file,
    html,
    tags,
    byName: (name) => tags.filter((tag) => tag.name === name),
    ids: tags.map((tag) => tag.attrs.id).filter(Boolean),
  };
}

const pages = ['index.html', 'plan.html'].map(load);
const [home, plan] = pages;
const { html, tags, byName, ids } = plan;

const FORM_CONTROLS = tags.filter(
  (tag) => ['input', 'select', 'textarea'].includes(tag.name) && !['hidden', 'submit', 'button'].includes(tag.attrs.type),
);

for (const page of pages) {
  describe(`page structure: ${page.file}`, () => {
    it('declares a language, a title and a responsive viewport', () => {
      assert.match(page.html, /<html lang="en">/);
      assert.match(page.html, /<title>[^<]{10,}<\/title>/);
      const viewport = page.byName('meta').find((tag) => tag.attrs.name === 'viewport');
      assert.match(viewport.attrs.content, /width=device-width/);
      assert.doesNotMatch(viewport.attrs.content, /user-scalable\s*=\s*no|maximum-scale/);
    });

    it('has landmarks, one h1 and a skip link that targets the main region', () => {
      assert.equal(page.byName('h1').length, 1);
      for (const landmark of ['header', 'main', 'footer']) assert.equal(page.byName(landmark).length, 1, landmark);
      const skip = page.byName('a').find((tag) => tag.attrs.class === 'skip-link');
      assert.equal(skip.attrs.href, '#main');
      assert.equal(page.byName('main')[0].attrs.id, 'main');
      assert.ok(page.html.indexOf('skip-link') < page.html.indexOf('<header'));
    });

    it('does not skip heading levels', () => {
      const levels = [...page.html.matchAll(/<h([1-6])[\s>]/g)].map((match) => Number(match[1]));
      for (let index = 1; index < levels.length; index += 1) {
        assert.ok(levels[index] - levels[index - 1] <= 1, `h${levels[index - 1]} to h${levels[index]}`);
      }
    });

    it('has unique ids', () => {
      assert.equal(new Set(page.ids).size, page.ids.length);
    });

    it('only references ids that exist', () => {
      const references = ['aria-describedby', 'aria-labelledby', 'aria-controls', 'for'];
      for (const tag of page.tags) {
        for (const attribute of references) {
          for (const target of (tag.attrs[attribute] ?? '').split(/\s+/).filter(Boolean)) {
            assert.ok(page.ids.includes(target), `${tag.name} ${attribute}="${target}"`);
          }
        }
      }
    });

    it('names landmark regions, navigation and dialogs', () => {
      assert.ok(page.byName('section').every((tag) => tag.attrs['aria-label'] || tag.attrs['aria-labelledby']));
      assert.ok(page.byName('nav').every((tag) => tag.attrs['aria-label']));
      assert.ok(page.byName('dialog').every((tag) => tag.attrs['aria-labelledby']));
    });

    it('keeps in-page links pointing at real sections', () => {
      for (const link of page.byName('a').filter((tag) => /^#\w/.test(tag.attrs.href ?? ''))) {
        assert.ok(page.ids.includes(link.attrs.href.slice(1)), link.attrs.href);
      }
    });
  });
}

describe('site navigation and layout', () => {
  const links = (page, label) => {
    const nav = new RegExp(`<nav aria-label="${label}">([\\s\\S]*?)</nav>`).exec(page.html)[1];
    return [...nav.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
  };
  const PAGE_LINKS = ['/', '/plan.html'];

  it('has exactly two pages, Home then Plan an event, sharing the same links', () => {
    for (const page of pages) {
      assert.deepEqual(links(page, 'Main navigation'), PAGE_LINKS, page.file);
      assert.deepEqual(links(page, 'Footer navigation'), PAGE_LINKS, page.file);
      assert.deepEqual(links(page, 'Home page sections'), ['/#about', '/#how-it-works', '/#features', '/#faq'], page.file);
    }
  });

  it('has no contact page and nothing links to one', () => {
    assert.equal(existsSync(path.join(ROOT, 'public', 'contact.html')), false);
    assert.equal(existsSync(path.join(ROOT, 'public', 'css', 'contact.css')), false);
    for (const page of pages) assert.doesNotMatch(page.html, /contact|mailto:/i, page.file);
  });

  it('shares identical footer markup on every page', () => {
    const footers = pages.map((page) => /<footer class="site-footer">[\s\S]*?<\/footer>/.exec(page.html)[0]);
    assert.equal(new Set(footers).size, 1);
  });

  it('shares the same header markup apart from the current page marker', () => {
    const headers = pages.map((page) =>
      /<header class="site-header">[\s\S]*?<\/header>/.exec(page.html)[0].replace(' aria-current="page"', ''),
    );
    assert.equal(new Set(headers).size, 1);
  });

  it('marks exactly one current page in the main navigation', () => {
    const expected = { 'index.html': 'Home', 'plan.html': 'Plan an event' };
    for (const page of pages) {
      const nav = /<nav aria-label="Main navigation">([\s\S]*?)<\/nav>/.exec(page.html)[1];
      assert.equal((nav.match(/aria-current="page"/g) ?? []).length, 1, page.file);
      assert.match(nav, new RegExp(`aria-current="page">${expected[page.file]}</a>`), page.file);
    }
  });

  it('gives the home page a hero, about, how it works, features and FAQ in that order', () => {
    for (const id of ['about', 'how-it-works', 'features', 'faq']) assert.ok(home.ids.includes(id), id);
    assert.match(home.html, /<section class="hero"/);
    assert.ok(home.byName('a').some((tag) => tag.attrs.href === '/plan.html' && /button/.test(tag.attrs.class ?? '')));
    const sections = home.byName('section').map((tag) => tag.attrs.id ?? 'hero');
    assert.deepEqual(sections, ['hero', 'about', 'how-it-works', 'features', 'faq']);
  });

  it('describes four steps and eight features on the home page', () => {
    assert.equal((home.html.match(/class="step-card/g) ?? []).length, 4);
    assert.equal((home.html.match(/class="feature-card/g) ?? []).length, 8);
  });

  it('has four frequently asked questions with long answers on the home page', () => {
    const items = [...home.html.matchAll(/<details class="faq reveal">\s*<summary><span>([^<]+)<\/span><\/summary>\s*<p>([^<]+)<\/p>\s*<\/details>/g)];
    assert.equal(items.length, 4);
    assert.equal((home.html.match(/<details/g) ?? []).length, 4);
    for (const [, question, answer] of items) {
      assert.match(question, /\?$/, question);
      assert.ok(answer.split(/\s+/).length >= 80, `"${question}" answer is too short`);
    }
    assert.ok(!/<details/.test(plan.html));
  });

  it('keeps the planning form and results only on the plan page', () => {
    assert.ok(plan.ids.includes('event-form'));
    assert.ok(!home.ids.includes('event-form'));
  });

  it('loads scripts only where they are needed', () => {
    const scripts = (page) => [...page.html.matchAll(/<script type="module" src="([^"]+)">/g)].map((match) => match[1]);
    assert.deepEqual(scripts(home), ['/js/site.js']);
    assert.deepEqual(scripts(plan), ['/js/site.js', '/js/main.js']);
  });

  it('only asks for icons that exist and keeps them decorative', () => {
    for (const page of pages) {
      const named = page.tags.filter((tag) => tag.attrs['data-icon']);
      assert.ok(named.length > 0, page.file);
      for (const tag of named) assert.ok(ICON_NAMES.includes(tag.attrs['data-icon']), `${page.file}: ${tag.attrs['data-icon']}`);
    }
    assert.equal(pages.filter((page) => page.byName('svg').length > 0).length, 0, 'icons are drawn by script, not inline');
  });

  it('shows the planning steps on the plan page with the first one current', () => {
    const steps = /<ol id="stepper"[\s\S]*?<\/ol>/.exec(plan.html)[0];
    assert.equal((steps.match(/<li class="step"/g) ?? []).length, 3);
    assert.equal((steps.match(/aria-current="step"/g) ?? []).length, 1);
  });
});

describe('planner page behaviour hooks', () => {
  it('announces status messages politely', () => {
    const status = byName('p').find((tag) => tag.attrs.id === 'status');
    assert.equal(status.attrs.role, 'status');
    assert.equal(status.attrs['aria-live'], 'polite');
  });

  it('provides a message for visitors without scripts', () => {
    assert.match(html, /<noscript>[\s\S]*JavaScript[\s\S]*<\/noscript>/);
  });
});

describe('form accessibility', () => {
  it('gives every control a programmatic label', () => {
    const labelled = new Set(byName('label').map((tag) => tag.attrs.for).filter(Boolean));
    for (const control of FORM_CONTROLS) {
      const hasLabel = labelled.has(control.attrs.id) || control.attrs['aria-label'] || control.attrs['aria-labelledby'];
      assert.ok(hasLabel, `${control.name}#${control.attrs.id} has no label`);
    }
  });

  it('marks required fields in text, not only with styling', () => {
    const required = FORM_CONTROLS.filter((control) => 'required' in control.attrs);
    assert.equal(required.length, 4);
    for (const control of required) {
      const label = new RegExp(`<label[^>]*for="${control.attrs.id}"[^>]*>([\\s\\S]*?)</label>`).exec(html);
      assert.ok(label, control.attrs.id);
      assert.match(label[1], /\(required\)/, control.attrs.id);
    }
  });

  it('groups related controls with fieldset and legend', () => {
    assert.equal(byName('fieldset').length, 2);
    assert.equal(byName('legend').length, 2);
  });

  it('has an error slot for every validated field', () => {
    for (const field of ['eventType', 'eventName', 'eventDate', 'guestCount', 'currency', 'totalBudget', 'location', 'theme', 'interests', 'priorities']) {
      assert.ok(ids.includes(`error-${field}`), field);
    }
  });

  it('uses suitable input types and autocomplete settings', () => {
    const type = (id) => tags.find((tag) => tag.attrs.id === id).attrs.type;
    assert.equal(type('eventDate'), 'date');
    assert.equal(type('guestCount'), 'number');
    assert.equal(type('totalBudget'), 'number');
    assert.equal(tags.find((tag) => tag.attrs.id === 'eventName').attrs.autocomplete, 'off');
  });

  it('provides an error summary that can receive focus', () => {
    const summary = tags.find((tag) => tag.attrs.id === 'error-summary');
    assert.equal(summary.attrs.tabindex, '-1');
    assert.ok('hidden' in summary.attrs);
  });

  it('uses buttons with visible text', () => {
    for (const tag of byName('button')) {
      const end = html.indexOf('</button>', tag.index);
      const text = html.slice(tag.index, end).replace(/<[^>]*>/g, '').trim();
      assert.ok(text.length > 0, tag.attrs.id);
    }
  });
});

describe('consistency with the server', () => {
  it('offers exactly the event types the server supports', () => {
    const radios = FORM_CONTROLS.filter((tag) => tag.attrs.type === 'radio').map((tag) => tag.attrs.value);
    assert.deepEqual([...radios].sort(), [...EVENT_TYPE_KEYS].sort());
  });

  it('offers exactly the currencies the server supports', () => {
    const start = html.indexOf('<select id="currency"');
    const options = [...html.slice(start, html.indexOf('</select>', start)).matchAll(/<option value="([A-Z]{3})"/g)].map((match) => match[1]);
    assert.deepEqual([...options].sort(), Object.keys(CURRENCIES).sort());
  });
});

describe('stylesheet accessibility', () => {
  it('shows a visible keyboard focus indicator', () => {
    assert.match(css, /:focus-visible\s*\{[^}]*outline:\s*3px/);
  });

  it('never removes outlines except for programmatic focus targets', () => {
    const removals = [...css.matchAll(/([^{}]+)\{[^}]*outline:\s*none[^}]*\}/g)].map((match) => match[1].trim());
    assert.deepEqual(removals, ['[tabindex="-1"]:focus']);
  });

  it('respects user preferences', () => {
    assert.match(css, /prefers-reduced-motion:\s*reduce/);
    assert.match(css, /prefers-color-scheme:\s*dark/);
    assert.match(css, /forced-colors:\s*active/);
    assert.match(css, /@media print/);
  });

  it('keeps touch targets at least 44 pixels tall', () => {
    const minimums = [...css.matchAll(/min-height:\s*([\d.]+)rem/g)].map((match) => Number(match[1]));
    assert.ok(minimums.filter((value) => value >= 2.75).length >= 5);
    assert.match(css, /\.button\s*\{[^}]*min-height:\s*2\.75rem/);
  });

  it('sizes text in relative units', () => {
    assert.doesNotMatch(css, /font-size:\s*[\d.]+px/);
  });

  it('provides a visually hidden utility that keeps content available to screen readers', () => {
    const rule = /\.visually-hidden\s*\{([^}]*)\}/.exec(css)[1];
    assert.match(rule, /position:\s*absolute/);
    assert.doesNotMatch(rule, /display:\s*none|visibility:\s*hidden/);
  });
});

describe('visitor preferences', () => {
  it('offers stronger contrast on request', () => {
    assert.match(css, /@media \(prefers-contrast: more\) \{[^}]*:root \{[^}]*--border: var\(--border-strong\)/);
  });

  it('tells the browser which colours to use for its own interface in each scheme', () => {
    for (const page of pages) {
      const colours = page.byName('meta').filter((tag) => tag.attrs.name === 'theme-color');
      assert.equal(colours.length, 2, page.file);
      assert.deepEqual(colours.map((tag) => tag.attrs.media).sort(), ['(prefers-color-scheme: dark)', '(prefers-color-scheme: light)']);
    }
  });
});

describe('fixed elements and keyboard focus', () => {
  it('scrolls focused elements clear of the sticky header and the chat button', () => {
    assert.match(css, /html \{[^}]*scroll-padding-block: 5rem 6rem/);
  });

  it('leaves room at the end of the page so the chat button never hides the last line', () => {
    assert.match(css, /\.footer-bottom \{[^}]*padding-bottom: 3\.5rem/);
  });
});
