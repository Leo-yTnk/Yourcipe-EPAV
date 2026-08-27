import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../../app.js', import.meta.url), 'utf8');
const template = readFileSync(new URL('../../template.js', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../../supabase/030_admin_catalog_purge.sql', import.meta.url), 'utf8');

describe('admin-only destructive catalog cleanup', () => {
  it('enforces both admin role and the confirmation password in the database', () => {
    expect(migration).toContain('not public.is_admin()');
    expect(migration).toContain("p_password is distinct from 'EPAV_admin_Tk'");
    expect(migration).toContain('revoke execute on function public.admin_delete_all_products_and_recipes(text) from public, anon');
  });

  it('deletes recipes before products and does not delete categories', () => {
    expect(migration.indexOf('delete from public.recipes;')).toBeLessThan(migration.indexOf('delete from public.products;'));
    expect(migration).not.toMatch(/delete from public\.categories/i);
  });

  it('gates the danger UI and client action on the resolved admin role', () => {
    expect(template).toContain('v.isAdminRole && v.destructiveCatalogOpen');
    expect(app).toContain("if (this.state.authRole !== 'admin' || !this.state.session) return;");
  });
});

describe('discoverable bulk selection', () => {
  it('offers an explicit selection entry point on every editable catalog tab', () => {
    for (const handler of ['onBeginSiteRecipeSelection', 'onBeginSiteProductSelection', 'onBeginSiteCategorySelection', 'onBeginMyRecipeSelection', 'onBeginMyProductSelection', 'onBeginMyCategorySelection']) {
      expect(template).toContain(handler);
    }
  });
});
