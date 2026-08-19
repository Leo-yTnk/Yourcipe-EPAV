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
  it('connects cancel and batch mutations', () => {
    expect(app).toContain('onCancelCategorySelection');
    expect(app).toContain('catalog.deleteCategoryResolved(id, {})');
    expect(app).toContain('catalog.updateSiteProduct(id, { active })');
    expect(app).toContain('catalog.updateSiteRecipe(id, { status })');
  });
  it('renders and persists spreadsheet mode with inline price editing', () => {
    expect(template).toContain("v.productLayout === 'spreadsheet'");
    expect(template).toContain('onBlur=${item.onPriceBlur}');
    expect(app).toContain("this.persist(LS_KEYS.productLayout, productLayout)");
    expect(app).toContain("spl === 'spreadsheet'");
  });
});
