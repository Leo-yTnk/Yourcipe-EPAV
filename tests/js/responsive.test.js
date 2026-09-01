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
const indexHtml = read('index.html');

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

describe('mobile-first layout primitives cover pages, navigation and overlays', () => {
  it('keeps grid recipe images edge-to-edge while padding only their text content', () => {
    expect(templateJs).toMatch(/item\.grid \? '[^']*yc-recipe-card is-grid[^']*' : '[^']*yc-recipe-card[^']*'/);
    expect(templateJs).toContain('grid: true, carouselStyle: item.gridCardStyle');
    expect(stylesCss).toMatch(/\.yc-recipe-card\.is-grid \.yc-recipe-card__image\s*\{[^}]*border-radius:\s*0[^}]*box-shadow:\s*none/);
    expect(stylesCss).toMatch(/\.yc-recipe-card\.is-grid \.yc-recipe-card__content\s*\{[^}]*padding:\s*10px 12px 12px/);
  });

  it('keeps landscape layouts isolated from the portrait-tablet adaptations', () => {
    expect(stylesCss).toMatch(/@media \(orientation: portrait\) and \(max-width: 900px\)/);
    expect(stylesCss).toMatch(/--yc-page-gutter:\s*clamp\(/);
  });

  it('uses shared stage, card strip, bottom navigation and modal hooks', () => {
    expect(templateJs).toContain('className="yc-stage"');
    expect(templateJs).toContain('yc-card-strip');
    expect(templateJs).toContain('className="yc-bottom-nav"');
    expect(templateJs.match(/className="yc-modal-overlay"/g)?.length).toBeGreaterThanOrEqual(20);
  });

  it('provides phone and extra-narrow compositions instead of only shrinking desktop', () => {
    expect(stylesCss).toMatch(/@media \(max-width: 600px\)/);
    expect(stylesCss).toMatch(/\.yc-modal-overlay[^}]*align-items:\s*flex-end/s);
    expect(stylesCss).toMatch(/@media \(max-width: 350px\)/);
    expect(stylesCss).toMatch(/\.yc-product-grid\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\)/);
  });
});

describe('phone layouts change composition instead of compressing desktop rows', () => {
  it('assigns catalog recipe/product content and actions to explicit mobile grid areas', () => {
    expect(templateJs).toContain('yc-admin-recipe-card');
    expect(templateJs).toContain('yc-admin-product-card');
    expect(stylesCss).toMatch(/\.yc-admin-recipe-card[^}]*grid-template-areas/);
    expect(stylesCss).toMatch(/\.yc-admin-product-card[^}]*grid-template-areas/);
    expect(stylesCss).toMatch(/\.yc-admin-primary-action\s*\{[^}]*grid-area:primary/);
  });

  it('uses dedicated mobile structures for creation navigation, charts, profiles, and carousels', () => {
    expect(templateJs).toContain('className="yc-creation-nav"');
    expect(templateJs).toContain('className="yc-chart-header"');
    expect(templateJs).toContain('className="yc-profile-card"');
    expect(stylesCss).toMatch(/\.yc-creation-primary[^}]*overflow-x:auto/);
    expect(stylesCss).toMatch(/\.yc-chart-header\s*\{[^}]*flex-direction:column/);
    expect(stylesCss).toMatch(/\.yc-profile-card\s*\{[^}]*grid-template-areas/);
  });
});

describe('typography and authored checkbox controls', () => {
  it('loads Inter and authoritatively applies it to every element and pseudo-element', () => {
    expect(indexHtml).toMatch(/fonts\.googleapis\.com\/css2\?family=Inter/);
    expect(stylesCss).toMatch(/\*, \*::before, \*::after[^}]*font-family:\s*"Inter", sans-serif !important/);
  });

  it('routes every semantic checkbox through the shared recipe-details visual control', () => {
    expect(templateJs).toContain('function checkbox({ checked, onChange, label');
    expect(templateJs.match(/type="checkbox"/g)).toHaveLength(1);
    expect(stylesCss).toMatch(/\.yc-checkbox-control[^}]*width:22px[^}]*height:22px[^}]*border-radius:7px/);
  });
});

describe('catalog visual editor fidelity', () => {
  it('waits for both catalog sources before showing the preview', () => {
    const appJs = read('app.js');
    expect(appJs).toContain("catalogEditorLoading: s.siteCatalogLoading || s.publicCatalogSource === 'loading'");
    expect(templateJs).toContain('aria-busy=${v.catalogEditorLoading}');
    expect(templateJs).toContain('Carregando a prévia do catálogo...');
    expect(templateJs).toContain('!v.catalogEditorLoading && v.catalogEditorSections.map');
  });

  it('matches the public page and card typography in the preview', () => {
    expect(templateJs).toContain("'O que vamos cozinhar hoje?'");
    expect(stylesCss).toMatch(/\.yc-editor-page-title\s*\{[^}]*font-size:32px[^}]*font-weight:700/);
    expect(stylesCss).toMatch(/\.yc-editor-section-head h3\s*\{[^}]*font-size:20px[^}]*font-weight:700/);
    expect(stylesCss).toMatch(/\.yc-editor-cards article b\s*\{[^}]*font-size:15px[^}]*font-weight:600/);
    expect(templateJs).toContain('<small>${item.detail}</small>');
  });
});
