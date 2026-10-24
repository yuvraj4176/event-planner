// lint-skip-code-rules: this file contains regular expressions with quote characters.
// A small linter with no dependencies. It checks the things that matter most for
// keeping this code base tidy: dead imports and exports, loose equality, stray
// debugging output, leftover to-do markers and basic formatting.
//
//   node scripts/lint.js        lint the whole project and exit 1 on any finding

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_DIRS = ['src', 'public/js', 'scripts', 'tests', 'api'];
const MAX_LINE_LENGTH = 170;
// Event content is written as one record per line, so it is allowed to be wide.
const WIDE_FILES = 'src/planner/data/';
const SKIP_CODE_RULES = 'lint-skip-code-rules';
const LEFTOVER = new RegExp(['TO' + 'DO', 'FIX' + 'ME', 'XX' + 'X', 'HA' + 'CK'].join('|'));

function listFiles(directory, found = []) {
  for (const name of readdirSync(directory)) {
    const full = path.join(directory, name);
    if (statSync(full).isDirectory()) listFiles(full, found);
    else if (full.endsWith('.js')) found.push(full);
  }
  return found;
}

const rel = (file) => path.relative(ROOT, file).split(path.sep).join('/');

// Removes strings, template text and comments so rules look only at code.
export function stripNonCode(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, '')
    .replace(/'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"/g, "''")
    .replace(/`(?:\\.|[^`\\])*`/g, (match) => {
      // Keep the expressions inside ${...}, because they are code.
      const expressions = [...match.matchAll(/\$\{([^}]*)\}/g)].map((found) => found[1]).join(' ');
      return expressions + match.replace(/[^\n]/g, '');
    });
}

export function importedNames(source) {
  const names = [];
  for (const match of source.matchAll(/^import\s+([^;]+?)\s+from\s+'[^']+';/gm)) {
    const clause = match[1];
    const named = /\{([^}]*)\}/.exec(clause);
    if (named) {
      for (const part of named[1].split(',')) {
        const alias = part.trim().split(/\s+as\s+/).pop();
        if (alias) names.push(alias);
      }
    }
    const rest = clause.replace(/\{[^}]*\}/, '').replace(/,/g, ' ').trim();
    for (const piece of rest.split(/\s+/).filter(Boolean)) names.push(piece.replace(/^\*\s*as\s*/, ''));
  }
  return names;
}

export function exportedNames(source) {
  return [...source.matchAll(/^export\s+(?:async\s+)?(?:function\*?|const|class)\s+([A-Za-z_$][\w$]*)/gm)].map((match) => match[1]);
}

export function lintSource(file, source, project) {
  const findings = [];
  const add = (line, message) => findings.push(`${file}:${line}: ${message}`);
  // A file that contains regular expressions with quote characters cannot be
  // read by the simple stripper, so it can opt out of the rules that need it.
  const skipCode = source.slice(0, 400).includes(SKIP_CODE_RULES);
  const code = skipCode ? '' : stripNonCode(source);
  const lines = source.split('\n');

  lines.forEach((text, index) => {
    const number = index + 1;
    if (/\s+$/.test(text)) add(number, 'trailing whitespace');
    if (text.includes('\t')) add(number, 'tab character');
    if (text.length > MAX_LINE_LENGTH && !file.startsWith(WIDE_FILES)) add(number, `line is longer than ${MAX_LINE_LENGTH} characters`);
    if (LEFTOVER.test(text)) add(number, 'leftover work marker');
  });
  if (!source.endsWith('\n')) add(lines.length, 'missing final newline');

  code.split('\n').forEach((text, index) => {
    const number = index + 1;
    if (/(?<![=!<>])==(?!=)|!=(?!=)/.test(text)) add(number, 'use strict equality');
    if (/\bvar\s/.test(text)) add(number, 'use const or let instead of var');
    if (/\bconsole\./.test(text) && !file.startsWith('tests/') && !file.startsWith('scripts/')) add(number, 'no console output in application code');
    if (/\bdebugger\b/.test(text)) add(number, 'debugger statement');
  });

  // A name counts as used when it is not part of a longer name or a property access.
  const used = (name) => new RegExp(`(?<![\\w$])(?<![\\w$)\\]]\\.)${name.replace(/\$/g, '\\$')}(?![\\w$])`, 'g');
  for (const name of skipCode ? [] : importedNames(source)) {
    const occurrences = (code.match(used(name)) ?? []).length + (source.match(new RegExp(`\\$\\{[^}]*\\b${name}\\b`, 'g')) ?? []).length;
    if (occurrences < 2) add(1, `unused import ${name}`);
  }

  if (project) {
    for (const name of skipCode ? [] : exportedNames(source)) {
      const consumers = project.filter((other) => other.file !== file && !other.file.startsWith('tests/') && importedNames(other.source).includes(name));
      const sameFile = (code.match(used(name)) ?? []).length > 1;
      if (consumers.length === 0 && !sameFile && !file.startsWith('tests/')) add(1, `export ${name} is not used by any application module`);
    }
  }
  return findings;
}

export function lintProject() {
  const files = SOURCE_DIRS.flatMap((dir) => listFiles(path.join(ROOT, dir))).concat(path.join(ROOT, 'server.js'));
  const project = files.map((file) => ({ file: rel(file), source: readFileSync(file, 'utf8') }));
  return project.flatMap(({ file, source }) => lintSource(file, source, project));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const findings = lintProject();
  for (const finding of findings) process.stderr.write(`${finding}\n`);
  process.stdout.write(findings.length === 0 ? 'Lint passed.\n' : `${findings.length} problem(s) found.\n`);
  process.exitCode = findings.length === 0 ? 0 : 1;
}
