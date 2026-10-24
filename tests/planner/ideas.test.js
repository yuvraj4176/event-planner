import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EVENT_TYPES, EVENT_TYPE_KEYS } from '../../src/planner/eventTypes.js';
import { budgetTier, extractKeywords, selectIdeas } from '../../src/planner/ideas.js';
import { validInput } from '../helpers/fixtures.js';

describe('extractKeywords', () => {
  it('lowercases, drops short and filler words and strips plurals', () => {
    const keywords = extractKeywords('We love Live Music, and flowers!');
    assert.deepEqual([...keywords].sort(), ['flower', 'live', 'music']);
  });

  it('handles missing input', () => {
    assert.equal(extractKeywords(undefined).size, 0);
    assert.equal(extractKeywords('').size, 0);
  });

  it('supports non-English letters', () => {
    assert.ok(extractKeywords('musique café').has('café'));
  });
});

describe('budgetTier', () => {
  const definition = EVENT_TYPES.birthday;
  const input = (totalBudget, currency = 'USD', guestCount = 10) =>
    validInput({ eventType: 'birthday', totalBudget, currency, guestCount });

  it('classifies by approximate per-guest spend in US dollars', () => {
    assert.equal(budgetTier(definition, input(100)), 'essential');
    assert.equal(budgetTier(definition, input(400)), 'balanced');
    assert.equal(budgetTier(definition, input(2000)), 'premium');
  });

  it('accounts for currency strength', () => {
    assert.equal(budgetTier(definition, input(10_000, 'INR')), 'essential');
    assert.equal(budgetTier(definition, input(10_000, 'GBP')), 'premium');
  });
});

describe('selectIdeas', () => {
  const definition = EVENT_TYPES.wedding;

  it('returns the requested number of distinct ideas', () => {
    const ideas = selectIdeas(definition, validInput(), 8);
    assert.equal(ideas.length, 8);
    assert.equal(new Set(ideas.map((idea) => idea.title)).size, 8);
  });

  it('puts ideas matching the stated interests first and explains why', () => {
    const ideas = selectIdeas(definition, validInput({ theme: '', interests: 'live music' }));
    assert.equal(ideas[0].title, 'Live acoustic set at cocktail hour');
    assert.deepEqual(ideas[0].matchedOn.sort(), ['live', 'music']);
  });

  it('is deterministic', () => {
    const input = validInput({ interests: 'garden flowers' });
    assert.deepEqual(selectIdeas(definition, input), selectIdeas(definition, input));
  });

  it('covers several categories when nothing matches', () => {
    const ideas = selectIdeas(definition, validInput({ theme: '', interests: '' }));
    assert.ok(new Set(ideas.map((idea) => idea.category)).size >= 3);
    assert.ok(ideas.every((idea) => idea.matchedOn.length === 0));
  });

  it('respects guest count limits', () => {
    const small = selectIdeas(definition, validInput({ guestCount: 20 }), 20).map((idea) => idea.title);
    const large = selectIdeas(definition, validInput({ guestCount: 300 }), 20).map((idea) => idea.title);
    assert.ok(small.includes('Intimate seated dinner'));
    assert.ok(!small.includes('Interactive food stations'));
    assert.ok(!large.includes('Intimate seated dinner'));
    assert.ok(large.includes('Interactive food stations'));
  });

  it('respects budget tiers', () => {
    const tight = selectIdeas(definition, validInput({ totalBudget: 50_000 }), 20).map((idea) => idea.title);
    const lavish = selectIdeas(definition, validInput({ totalBudget: 9_000_000 }), 20).map((idea) => idea.title);
    assert.ok(tight.includes('Choose an off-peak date'));
    assert.ok(!tight.includes('Live acoustic set at cocktail hour'));
    assert.ok(lavish.includes('Live acoustic set at cocktail hour'));
    assert.ok(!lavish.includes('Choose an off-peak date'));
  });

  it('returns fewer ideas when few are eligible', () => {
    assert.ok(selectIdeas(definition, validInput(), 100).length < 100);
  });

  for (const key of EVENT_TYPE_KEYS) {
    it(`returns well-formed ideas for ${key}`, () => {
      const ideas = selectIdeas(EVENT_TYPES[key], validInput({ eventType: key }));
      assert.ok(ideas.length >= 6);
      assert.ok(ideas.every((idea) => idea.title && idea.detail && idea.category && Array.isArray(idea.matchedOn)));
    });
  }
});
