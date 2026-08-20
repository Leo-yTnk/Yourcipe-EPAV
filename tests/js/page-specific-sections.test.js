import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const app = readFileSync('app.js', 'utf8');
const template = readFileSync('template.js', 'utf8');
const migration = readFileSync('supabase/023_page_specific_sections.sql', 'utf8');

describe('page-specific catalog sections', () => {
  it('offers a distinct section type for every Editor page', () => {
    expect(app).toContain("{ value: 'secao_home', label: 'Seção da Home' }");
    expect(app).toContain("{ value: 'secao_receita', label: 'Seção de Receitas' }");
    expect(app).toContain("{ value: 'secao_produto', label: 'Seção de Produtos' }");
    expect(app).toContain("s.catalogEditorPage === 'recipes' ? ['secao_receita'] : ['secao_home', 'secao']");
  });

  it('groups the category catalog by semantic type instead of mixing rows', () => {
    expect(app).toContain('const siteCategoryGroups = categoryGroupOrder.map');
    expect(template).toContain('v.siteCategoryGroups.map(group');
  });

  it('migrates legacy Home sections and permits both recipe-backed section types', () => {
    expect(migration).toContain("update public.categories set type = 'secao_home' where type = 'secao'");
    expect(migration).toContain("v_cat.type not in ('secao_home', 'secao_receita')");
    expect(migration).toContain('admin_reorder_recipe_sections');
  });

  // Regression guard: mySectionCategories() (the personal "Minhas Receitas"
  // create/edit form's default-section checklist) filtered creationCategories
  // by the legacy 'secao' type. 023's migration above renames every existing
  // 'secao' row to 'secao_home', so no row has had type 'secao' since that
  // migration ran — the checklist silently rendered empty for every personal
  // recipe even though site default sections existed under 'secao_receita'.
  // siteSectionCategories (the admin/site recipe form's equivalent) already
  // used 'secao_receita' correctly; this keeps both in sync.
  it('mySectionCategories uses the recipe-specific section type, not the retired generic one', () => {
    const start = app.indexOf('mySectionCategories = ()');
    const line = app.slice(start, app.indexOf('\n', start));
    expect(line).toContain("pickerCategoriesByType('secao_receita')");
    expect(line).not.toContain("pickerCategoriesByType('secao')");
  });
});
