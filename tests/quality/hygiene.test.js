import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { ROOT, listFiles, read, relative } from '../helpers/project.js';

const files = listFiles().filter((file) => !/\.(png|jpg|ico|woff2?)$/.test(file));
const sourceFiles = files.filter((file) => /^(src|public)\//.test(relative(file)) || relative(file) === 'server.js');
const clientScripts = files.filter((file) => /^public\/js\/.*\.js$/.test(relative(file)));
const text = (file) => readFileSync(file, 'utf8');

describe('project conventions', () => {
  it('contains no emoji anywhere', () => {
    for (const file of files) {
      assert.doesNotMatch(text(file), /\p{Extended_Pictographic}/u, relative(file));
    }
  });

  it('keeps documentation, markup and styles in plain ASCII', () => {
    for (const file of files.filter((candidate) => /\.(md|html|css|svg|yml|json)$/.test(candidate) || candidate.endsWith('.env.example'))) {
      const offending = [...text(file)].find((character) => character.charCodeAt(0) > 126);
      assert.equal(offending, undefined, `${relative(file)} contains ${offending}`);
    }
  });

  it('ships the expected documents', () => {
    const required = [
      'README.md', 'LICENSE', 'CONTRIBUTING.md', 'SECURITY.md', '.env.example', '.gitignore',
      'docs/ARCHITECTURE.md', 'docs/SECURITY.md', 'docs/ACCESSIBILITY.md', 'docs/TESTING.md', 'docs/DEPLOYMENT.md', 'vercel.json', '.vercelignore',
    ];
    for (const document of required) {
      assert.ok(existsSync(path.join(ROOT, document)), document);
    }
  });

  it('defines a working test script and has no runtime dependencies', () => {
    const manifest = JSON.parse(read('package.json'));
    assert.match(manifest.scripts.test, /node --test/);
    assert.equal(manifest.dependencies, undefined);
    assert.equal(manifest.devDependencies, undefined);
    assert.equal(manifest.type, 'module');
  });

  it('documents how to run and test the project', () => {
    const readme = read('README.md');
    for (const phrase of ['npm start', 'npm test', 'GEMINI_API_KEY', 'docs/SECURITY.md']) {
      assert.ok(readme.includes(phrase), phrase);
    }
  });

  it('keeps each source file a reasonable size', () => {
    for (const file of sourceFiles.filter((candidate) => candidate.endsWith('.js') && !relative(candidate).includes('/data/'))) {
      assert.ok(text(file).split('\n').length <= 200, `${relative(file)} is longer than 200 lines`);
    }
  });
});

describe('security hygiene', () => {
  it('never writes untrusted text as HTML', () => {
    for (const file of clientScripts) {
      assert.doesNotMatch(text(file), /innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function/, relative(file));
    }
  });

  it('uses no inline scripts, styles, event handlers or third-party origins in the page', () => {
    for (const page of ['index.html', 'plan.html']) {
      const html = read('public', page);
      assert.doesNotMatch(html, /\son[a-z]+\s*=/i, page);
      assert.doesNotMatch(html, /\sstyle\s*=/i, page);
      assert.doesNotMatch(html, /<script(?![^>]*\ssrc=)[^>]*>/i, page);
      assert.doesNotMatch(html, /(?:src|href)\s*=\s*"(?:https?:)?\/\//i, page);
    }
    for (const sheet of ['styles.css', 'home.css']) {
      assert.doesNotMatch(read('public', 'css', sheet), /@import|url\(\s*["']?https?:/i, sheet);
    }
  });

  it('does not set inline styles from scripts through attributes', () => {
    for (const file of clientScripts) {
      assert.doesNotMatch(text(file), /setAttribute\(\s*['"]style['"]/, relative(file));
    }
  });

  it('contains no embedded credentials', () => {
    for (const file of sourceFiles.concat(files.filter((candidate) => /\.(md|example)$/.test(candidate)))) {
      assert.doesNotMatch(text(file), /AIza[0-9A-Za-z_-]{20,}|api[_-]?key\s*[:=]\s*['"][A-Za-z0-9]{16,}/i, relative(file));
    }
  });

  it('reads the API key only from the environment', () => {
    const usages = sourceFiles.filter((file) => /GEMINI_API_KEY/.test(text(file))).map(relative);
    assert.deepEqual(usages, ['src/config.js']);
  });

  it('uses Gemini as the only AI provider', () => {
    const others = new RegExp(['anthro' + 'pic', 'clau' + 'de', 'open' + 'ai', 'gpt-', 'mistral', 'llama'].join('|'), 'i');
    // This file names the other providers in order to forbid them.
    for (const file of files.filter((candidate) => relative(candidate) !== 'tests/quality/hygiene.test.js')) {
      assert.doesNotMatch(text(file), others, relative(file));
    }
    assert.ok(read('src', 'ai', 'geminiClient.js').includes('generativelanguage.googleapis.com'));
  });

  it('sends the API key in a header and never in a URL', () => {
    const client = read('src', 'ai', 'geminiClient.js');
    assert.match(client, /'x-goog-api-key': apiKey/);
    assert.doesNotMatch(client, /\?key=|&key=|\$\{apiKey\}/);
  });

  it('keeps secrets files out of version control', () => {
    const ignore = read('.gitignore');
    assert.match(ignore, /^\.env$/m);
    assert.match(ignore, /^node_modules\/$/m);
  });

  it('never logs request bodies', () => {
    for (const file of sourceFiles.filter((candidate) => candidate.endsWith('.js'))) {
      assert.doesNotMatch(text(file), /console\.(log|info|warn|error)/, relative(file));
    }
  });
});
