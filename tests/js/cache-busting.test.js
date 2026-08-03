import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// No bundler/build step in this project (see the comment block at the top of
// index.html): ES module files are cached by browsers indefinitely under
// their exact URL, so `index.html`'s `<script type="module" src="./app.js?v=...">`
// and every local relative import specifier in the module graph carry a
// hand-written `?v=...` cache-busting query string, all sharing the exact
// same literal version. That version is duplicated by hand across several
// files (import specifiers must be static string literals — they can't
// reference a shared JS constant), which is exactly the kind of thing that
// silently drifts apart over time unless something checks it. This reads
// the real files as plain text (not a re-implementation of the versioning
// scheme) and fails the moment any of them falls out of sync.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (relPath) => readFileSync(path.join(ROOT, relPath), 'utf8');

const indexHtml = read('index.html');
const appJs = read('app.js');
const catalogJs = read('catalog.js');
const authJs = read('auth.js');
const customSelectJs = read('custom-select.js');
const templateJs = read('template.js');

function firstMatch(text, re, label) {
  const m = text.match(re);
  expect(m, `expected to find ${label}`).toBeTruthy();
  return m[1];
}

describe('cache-busting version stays in sync across every file that carries it', () => {
  it('index.html loads ./app.js with a ?v=... cache-busting query string', () => {
    const version = firstMatch(indexHtml, /<script\s+type="module"\s+src="\.\/app\.js\?v=([^"]+)"/, 'the module script tag for app.js in index.html');
    expect(version.length).toBeGreaterThan(0);
  });

  it("app.js defines a FRONTEND_VERSION constant and console.info-stamps it", () => {
    const version = firstMatch(appJs, /const FRONTEND_VERSION\s*=\s*'([^']+)'/, 'the FRONTEND_VERSION constant in app.js');
    expect(appJs).toMatch(/console\.info\(`Yourcipe frontend: \$\{FRONTEND_VERSION\}`\)/);
    expect(version.length).toBeGreaterThan(0);
  });

  it("index.html's ?v=... query string matches app.js's FRONTEND_VERSION constant exactly", () => {
    const htmlVersion = firstMatch(indexHtml, /<script\s+type="module"\s+src="\.\/app\.js\?v=([^"]+)"/, 'the module script tag for app.js in index.html');
    const jsVersion = firstMatch(appJs, /const FRONTEND_VERSION\s*=\s*'([^']+)'/, 'the FRONTEND_VERSION constant in app.js');
    expect(htmlVersion).toBe(jsVersion);
  });

  // Every local relative import specifier in the module graph rooted at
  // app.js must carry the exact same version — ES modules key their cache by
  // exact URL, so a mismatched version on even one file's import would just
  // create a second, independently-cached copy instead of actually busting
  // anything.
  const FILES_WITH_LOCAL_IMPORTS = {
    'app.js': appJs,
    'catalog.js': catalogJs,
    'auth.js': authJs,
    'custom-select.js': customSelectJs,
    'template.js': templateJs,
  };
  // Matches `from './something.js?v=...'` (local relative imports only —
  // never the external esm.sh import in supabase-client.js, which is
  // intentionally out of scope here).
  const LOCAL_IMPORT_RE = /from\s+'(\.\/[^']+\.js)(\?v=([^']*))?'/g;

  Object.entries(FILES_WITH_LOCAL_IMPORTS).forEach(([fileName, contents]) => {
    it(`every local relative import in ${fileName} carries the same ?v=... version as FRONTEND_VERSION`, () => {
      const expectedVersion = firstMatch(appJs, /const FRONTEND_VERSION\s*=\s*'([^']+)'/, 'the FRONTEND_VERSION constant in app.js');
      const imports = [...contents.matchAll(LOCAL_IMPORT_RE)];
      expect(imports.length, `${fileName} should have at least one local relative import`).toBeGreaterThan(0);
      imports.forEach(([fullMatch, specifierPath, , version]) => {
        expect(version, `${fileName} imports "${specifierPath}" without a "?v=${expectedVersion}" cache-busting query string (matched: "${fullMatch}")`).toBe(expectedVersion);
      });
    });
  });
});
