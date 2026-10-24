import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const IGNORED = new Set(['node_modules', 'coverage', '.git']);

export function listFiles(directory = ROOT, found = []) {
  for (const name of readdirSync(directory)) {
    if (IGNORED.has(name)) continue;
    const full = path.join(directory, name);
    if (statSync(full).isDirectory()) listFiles(full, found);
    else found.push(full);
  }
  return found;
}

export const read = (...segments) => readFileSync(path.join(ROOT, ...segments), 'utf8');

export const relative = (file) => path.relative(ROOT, file).split(path.sep).join('/');

// Reads every tag in an HTML string as { name, attrs, index }.
export function parseTags(html) {
  const tags = [];
  const pattern = /<([a-zA-Z][\w-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*\/?>/g;
  for (const match of html.matchAll(pattern)) {
    const attrs = {};
    for (const attr of match[2].matchAll(/([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
      attrs[attr[1].toLowerCase()] = attr[2] ?? attr[3] ?? attr[4] ?? '';
    }
    tags.push({ name: match[1].toLowerCase(), attrs, index: match.index });
  }
  return tags;
}

export function luminance(hex) {
  const channels = [1, 3, 5].map((start) => {
    const value = parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export function contrastRatio(foreground, background) {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}
