import { h } from './dom.js';

export const PIECES = 40;
const COLOUR_CLASSES = 5;
const LIFETIME_MS = 4500;

function prefersReducedMotion() {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

// A short burst of decorative confetti. It is hidden from assistive technology,
// ignores the pointer, is skipped for visitors who prefer reduced motion, and
// removes itself when finished.
export function launchConfetti({ reducedMotion = prefersReducedMotion(), random = Math.random, schedule = setTimeout } = {}) {
  if (reducedMotion) return null;

  const layer = h('div', { class: 'confetti-layer', 'aria-hidden': 'true' });
  for (let index = 0; index < PIECES; index += 1) {
    const piece = h('span', { class: `confetti confetti-${(index % COLOUR_CLASSES) + 1}` });
    piece.style.setProperty('--x', `${Math.round(random() * 100)}%`);
    piece.style.setProperty('--drift', `${Math.round((random() - 0.5) * 30)}vw`);
    piece.style.setProperty('--delay', `${(random() * 0.8).toFixed(2)}s`);
    piece.style.setProperty('--duration', `${(2.4 + random() * 1.8).toFixed(2)}s`);
    layer.append(piece);
  }

  document.body.append(layer);
  schedule(() => layer.remove(), LIFETIME_MS);
  return layer;
}
