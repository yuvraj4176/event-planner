// A small set of line icons drawn as SVG. They are decorative: every icon is
// hidden from assistive technology and sits next to a text label. Pages mark
// where an icon goes with data-icon="name" and hydrateIcons() fills it in, so
// each shape is defined once.

const SVG_NS = 'http://www.w3.org/2000/svg';

const ICON_SHAPES = Object.freeze({
  budget: [
    ['path', { d: 'M3 7h15a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7z' }],
    ['path', { d: 'M3 7l12-4v4' }],
    ['circle', { cx: '16.5', cy: '14', r: '1.2' }],
  ],
  calendar: [
    ['rect', { x: '3', y: '5', width: '18', height: '16', rx: '3' }],
    ['path', { d: 'M3 10h18M8 3v4M16 3v4' }],
  ],
  checklist: [
    ['path', { d: 'M10 6h10M10 12h10M10 18h10' }],
    ['path', { d: 'M3.5 6l1.2 1.2L6.8 5M3.5 12l1.2 1.2L6.8 11M3.5 18l1.2 1.2L6.8 17' }],
  ],
  lightbulb: [
    ['path', { d: 'M9 18h6M10 21h4' }],
    ['path', { d: 'M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z' }],
  ],
  message: [['path', { d: 'M21 12a8 8 0 0 1-11.5 7.2L3 21l1.8-5.5A8 8 0 1 1 21 12z' }]],
  shield: [
    ['path', { d: 'M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6l8-3z' }],
    ['path', { d: 'M9 12l2.2 2.2L15.5 10' }],
  ],
  heart: [['path', { d: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z' }]],
  cake: [
    ['path', { d: 'M4 20h16M5 20v-6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v6' }],
    ['path', { d: 'M12 12V8M12 5.5c.8-.8.8-1.7 0-2.5-.8.8-.8 1.7 0 2.5z' }],
  ],
  users: [
    ['circle', { cx: '9', cy: '8', r: '3' }],
    ['path', { d: 'M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6' }],
    ['circle', { cx: '17', cy: '9', r: '2.4' }],
    ['path', { d: 'M17 14c2.5 0 4.5 2 4.5 4.5' }],
  ],
  chart: [
    ['path', { d: 'M5 20v-9M12 20V5M19 20v-12' }],
    ['path', { d: 'M3 20h18' }],
  ],
  bot: [
    ['rect', { x: '4', y: '8', width: '16', height: '12', rx: '4' }],
    ['path', { d: 'M12 8V5' }],
    ['circle', { cx: '12', cy: '3.8', r: '1.2' }],
    ['circle', { cx: '9', cy: '13.5', r: '1.1' }],
    ['circle', { cx: '15', cy: '13.5', r: '1.1' }],
    ['path', { d: 'M9.5 17h5M2 13v3M22 13v3' }],
  ],
  send: [['path', { d: 'M21 3L3 10.5l7 3 3 7L21 3zM10 13.5L21 3' }]],
  close: [['path', { d: 'M6 6l12 12M18 6L6 18' }]],
  refresh: [['path', { d: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7' }]],
  'arrow-right': [['path', { d: 'M5 12h14M13 6l6 6-6 6' }]],
  download: [['path', { d: 'M12 4v11M7 11l5 5 5-5M5 20h14' }]],
  print: [
    ['path', { d: 'M7 9V3h10v6' }],
    ['rect', { x: '4', y: '9', width: '16', height: '9', rx: '2' }],
    ['path', { d: 'M7 15h10v6H7z' }],
  ],
  edit: [['path', { d: 'M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4zM13.5 6.5l4 4' }]],
  sparkles: [
    ['path', { d: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z' }],
    ['path', { d: 'M19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2z' }],
  ],
  globe: [
    ['circle', { cx: '12', cy: '12', r: '9' }],
    ['path', { d: 'M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18' }],
  ],
});

export const ICON_NAMES = Object.freeze(Object.keys(ICON_SHAPES));

export function hasIcon(name) {
  return ICON_NAMES.includes(name);
}

function svgElement(tag, attributes) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  return node;
}

export function icon(name) {
  if (!hasIcon(name)) throw new RangeError(`Unknown icon: ${name}`);
  const svg = svgElement('svg', { viewBox: '0 0 24 24', class: 'icon', 'aria-hidden': 'true', focusable: 'false' });
  svg.append(...ICON_SHAPES[name].map(([tag, attributes]) => svgElement(tag, attributes)));
  return svg;
}

// Fills every element marked with data-icon="name". Unknown names are ignored
// so a typo can never break the page.
export function hydrateIcons(root) {
  for (const slot of root.querySelectorAll('[data-icon]')) {
    const name = slot.getAttribute('data-icon');
    if (hasIcon(name) && slot.children.length === 0) slot.append(icon(name));
  }
}
