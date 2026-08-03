import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// This project has no build step and no CSS-in-JS test tooling — templates
// are plain template-literal strings in template.js, styles shared via
// styles.css. Rather than re-implementing a layout engine, this reads the
// real files as text (same approach as cache-busting.test.js) and asserts
// the specific responsive properties this round's overflow-x fixes rely on
// are actually present, so a future edit that silently drops one of them
// fails a test instead of only showing up as a bug report on a phone.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (relPath) => readFileSync(path.join(ROOT, relPath), 'utf8');

const templateJs = read('template.js');
const stylesCss = read('styles.css');

describe('recipe form / recipe detail / references modal panels never overflow horizontally', () => {
  it('every "width:NNNpx;max-width:100%;...overflow-y:auto" modal panel also sets overflow-x:hidden', () => {
    // Matches the shared modal-panel style fragment (Minhas Receitas form,
    // Catálogo Público form, recipe detail) used across template.js.
    const panelRe = /width:\d+px;max-width:100%;max-height:90%;overflow-y:auto([^"]*)"/g;
    const matches = [...templateJs.matchAll(panelRe)];
    expect(matches.length, 'expected at least one scrollable modal panel in template.js').toBeGreaterThan(0);
    matches.forEach(([full]) => {
      expect(full, `modal panel style is missing overflow-x:hidden: ${full}`).toContain('overflow-x:hidden');
    });
  });

  it('the references-to-resolve modal (delete reference checking) sets overflow-x:hidden too', () => {
    expect(templateJs).toMatch(/function renderReferencesModal[\s\S]*?overflow-x:hidden/);
  });
});

describe('ingredient rows collapse instead of overflowing on narrow screens', () => {
  it('every ingredient row container wraps (flex-wrap:wrap) instead of forcing a fixed-width row', () => {
    const rowRe = /display:flex;gap:10px;margin-bottom:[^;]+;align-items:center;flex-wrap:wrap/g;
    const matches = [...templateJs.matchAll(rowRe)];
    // One for the legacy local recipe form + one each for myRecipeForm/siteRecipeForm.
    expect(matches.length).toBeGreaterThanOrEqual(3);
  });

  it('the product-select wrapper inside an ingredient row has a min-width so it wraps instead of shrinking to nothing', () => {
    expect(templateJs).toMatch(/style="flex:1;min-width:160px"/);
  });
});

describe('the recipe form top-field grid collapses to one column on narrow screens', () => {
  it('template.js uses the shared .yc-form-grid class instead of a bare 2-column inline grid', () => {
    expect(templateJs).toMatch(/className="yc-form-grid"/);
    expect(templateJs).not.toMatch(/style="display:grid;grid-template-columns:1fr 1fr;gap:14px"/);
  });

  it('styles.css defines .yc-form-grid with a max-width media query collapsing it to a single column', () => {
    expect(stylesCss).toMatch(/\.yc-form-grid\s*\{[^}]*grid-template-columns:\s*1fr 1fr/);
    expect(stylesCss).toMatch(/@media \(max-width:\s*520px\)\s*\{\s*\.yc-form-grid\s*\{\s*grid-template-columns:\s*1fr/);
  });
});

describe('the YSH share code never overflows its container', () => {
  it('the share-code box uses the shared .yc-code-box class (word-break, max-width:100%, box-sizing:border-box)', () => {
    expect(templateJs).toMatch(/className="yc-code-box"[^>]*>\$\{v\.shareCode\}/);
  });

  it('.yc-code-box wraps long codes instead of overflowing, and is capped to its container width', () => {
    expect(stylesCss).toMatch(/\.yc-code-box\s*\{[^}]*word-break:\s*break-all/);
    expect(stylesCss).toMatch(/\.yc-code-box\s*\{[^}]*max-width:\s*100%/);
    expect(stylesCss).toMatch(/\.yc-code-box\s*\{[^}]*box-sizing:\s*border-box/);
  });

  it('the YCP credential box (registration) reuses the same .yc-code-box class as YSH, per the "same visual pattern" requirement', () => {
    expect(templateJs).toMatch(/className="yc-code-box"[^>]*>\$\{v\.signupResult\.credential\}/);
  });

  it('the share code is never rendered as an editable input', () => {
    // renderMyRecipeDetailModal's share section must show the code as a
    // plain div, never an <input>/<textarea> the user could edit.
    const section = templateJs.slice(templateJs.indexOf('function renderMyRecipeDetailModal'), templateJs.indexOf('function renderMyRecipeDetailModal') + 4000);
    const shareBlock = section.slice(section.indexOf('yc-code-box'));
    expect(shareBlock.slice(0, 200)).not.toMatch(/<input|<textarea/);
  });
});
