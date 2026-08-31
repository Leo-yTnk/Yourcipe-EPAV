import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const app = readFileSync('app.js', 'utf8');
const template = readFileSync('template.js', 'utf8');
const legacyMigration = readFileSync('supabase/023_page_specific_sections.sql', 'utf8');
const migration = readFileSync('supabase/031_catalog_pages_and_sections.sql', 'utf8');

describe('page-specific catalog sections', () => {
  it('loads first-class pages and sections instead of category pseudo-types', () => {
    expect(migration).toContain('create table public.catalog_pages');
    expect(migration).toContain('create table public.catalog_sections');
    expect(app).toContain('catalog.fetchAdminCatalogStructure()');
    expect(app).toContain('structure.pages.find(page => page.key === s.catalogEditorPage)');
  });

  it('groups the category catalog by semantic type instead of mixing rows', () => {
    expect(app).toContain('const siteCategoryGroups = categoryGroupOrder.map');
    expect(template).toContain('v.siteCategoryGroups.map(group');
  });

  it('migrates legacy Home sections and permits both recipe-backed section types', () => {
    expect(legacyMigration).toContain("update public.categories set type = 'secao_home' where type = 'secao'");
    expect(migration).toContain('insert into public.catalog_section_recipes');
    expect(migration).toContain('insert into public.catalog_section_products');
  });
});
