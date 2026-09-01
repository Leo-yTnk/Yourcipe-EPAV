import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
const app = readFileSync(new URL('../../app.js', import.meta.url), 'utf8');
const template = readFileSync(new URL('../../template.js', import.meta.url), 'utf8');

describe('connected bulk-selection UI', () => {
  it('renders contextual bars only for active scoped selections', () => {
    expect(template).toContain("v.selectionMode && v.recipeSelectionScope === 'site'");
    expect(template).toContain("v.productSelectionMode && v.productSelectionScope === 'site'");
    expect(template).toContain("v.categorySelectionMode && v.categorySelectionScope === 'site'");
    expect(template).toContain('v.saleSelectionMode && selectionBar');
  });
  it('passes recipe and product selection scopes to the template view model', () => {
    expect(app).toContain('selectionMode: s.selectionMode, recipeSelectionScope: s.recipeSelectionScope');
    expect(app).toContain('productSelectionMode: s.productSelectionMode, productSelectionScope: s.productSelectionScope');
  });
  it('keeps private personal recipes visible in their owner-only page', () => {
    expect(app).toContain('myRecipes: recs.data || []');
    expect(app).toContain("source: 'personal', sourceLabel: 'Privada'");
    expect(template).toContain('${v.myRecipeRows.map((row) => html`');
  });
  it('connects cancel and batch mutations', () => {
    expect(app).toContain('onCancelCategorySelection');
    expect(app).toContain('catalog.deleteCategoryResolved(id, {})');
    expect(app).toContain('catalog.updateSiteProduct(id, { active })');
    expect(app).toContain('catalog.updateSiteRecipe(id, { status })');
  });
  it('keeps spreadsheet price editing in the admin product catalog', () => {
    expect(template).toContain("v.adminProductView === 'spreadsheet'");
    expect(template).toContain("[['carousel', 'Carrossel'], ['grid', 'Grid']]");
    expect(template).toContain('Tab, setas e Ctrl+C/Ctrl+V');
    expect(template).toContain('onBlur=${row.onPriceBlur}');
    expect(app).toContain("!['grid', 'spreadsheet'].includes(adminProductView)");
    expect(app).not.toContain("spl === 'spreadsheet'");
  });
});
