import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Regression guard for the "default public categories don't show on Home"
// bug: fetchPublicCategories() (catalog.js) was always correct — scope=
// 'site', active=true, matching what supabase/008_seed_default_catalog.sql
// inserts — but app.js's _loadPublicCatalog() discarded its result, and
// Home's category chips/sections read from data.js's static
// CATEGORIAS_RECEITA/SECTION_DEFS constants (optionally overridden by a
// stale localStorage snapshot) instead. Static-analysis text checks, same
// approach as cache-busting.test.js — there is no DOM/render harness in
// this project to actually mount <App> and inspect Home's rendered output.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const appJs = readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const templateJs = readFileSync(path.join(ROOT, 'template.js'), 'utf8');

describe('Home loads its category vocabulary from Supabase, not from static constants', () => {
  it('_loadPublicCatalog stores the fetched categories into state.publicCategories', () => {
    expect(appJs).toMatch(/products,\s*recipes,\s*publicCategories:\s*catsRes\.data\s*\|\|\s*\[\]/);
  });

  it('a failed/fallback catalog load explicitly resets publicCategories (never leaves stale data behind silently)', () => {
    // Every branch that sets publicCatalogSource to 'demo-fallback' must
    // also reset publicCategories, so a stale successful fetch's
    // categories can never keep rendering after a later load fails.
    const fallbackBlocks = [...appJs.matchAll(/publicCatalogSource:\s*'demo-fallback',[\s\S]{0,260}?\}\);/g)];
    expect(fallbackBlocks.length).toBeGreaterThan(0);
    fallbackBlocks.forEach(([block]) => {
      expect(block, `demo-fallback branch does not reset publicCategories: ${block}`).toMatch(/publicCategories:\s*\[\]/);
    });
  });

  it('defines three separate type-scoped getters (receita/proteina/secao) that never merge types', () => {
    expect(appJs).toMatch(/publicRecipeCategories\s*=\s*\(\)\s*=>\s*\(this\.state\.publicCategories \|\| \[\]\)\.filter\(c => c\.type === 'receita'\)/);
    expect(appJs).toMatch(/publicProteinCategories\s*=\s*\(\)\s*=>\s*\(this\.state\.publicCategories \|\| \[\]\)\.filter\(c => c\.type === 'proteina'\)/);
    expect(appJs).toMatch(/publicSectionCategories\s*=\s*\(\)\s*=>\s*\(this\.state\.publicCategories \|\| \[\]\)\.filter\(c => c\.type === 'secao'\)/);
  });

  it('the Home category chips are built from the live receita-type getter, not the static CATEGORIAS_RECEITA import', () => {
    expect(appJs).toMatch(/const homeCategoryChips = this\.publicRecipeCategories\(\)\.map/);
  });

  it('an empty (but successfully fetched) category list surfaces a real empty-state flag instead of hiding the gap', () => {
    expect(appJs).toMatch(/const homeCategoriesEmpty = s\.publicCatalogSource === 'supabase' && homeCategoryChips\.length === 0/);
  });
});

describe('Home sections stay on the Home screen', () => {
  it('renders public section blocks only from inside renderHome', () => {
    const home = templateJs.slice(templateJs.indexOf('function renderHome('), templateJs.indexOf('function renderHomeSections'));
    expect(home).toContain('${renderHomeSections(v)}');
  });

  it('does not render Home sections independently in the root screen dispatcher', () => {
    const dispatcher = templateJs.slice(templateJs.indexOf('${v.notLoaded'), templateJs.indexOf('</div>\n        </div>'));
    expect(dispatcher).not.toContain('renderHomeSections');
  });
});

describe('Supabase-synchronized Home section ordering', () => {
  it('builds every Home section block in publicSectionCategories order', () => {
    expect(appJs).toMatch(/const homeSectionBlocks = this\.publicSectionCategories\(\)[\s\S]{0,260}\.map\(c => \(\{ key: c\.slug, label: c\.name/);
  });
  it('renders one unified ordered block list instead of hard-coded section carousels', () => {
    expect(templateJs).toContain('${renderHomeSections(v)}');
    expect(templateJs).toMatch(/v\.homeSectionBlocks\.map/);
  });
  it('exposes admin-only hold/drop pointer handlers in the public category tab', () => {
    expect(templateJs).toContain('data-site-section-id');
    expect(templateJs).toContain('onPointerDown=${row.onPointerDown}');
    expect(templateJs).toContain('onPointerUp=${row.onPointerUp}');
  });
});
