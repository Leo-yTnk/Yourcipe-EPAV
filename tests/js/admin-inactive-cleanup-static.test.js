import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const app = read('../../app.js');
const template = read('../../template.js');
const migration = read('../../supabase/035_admin_inactive_catalog_cleanup.sql');
const repair = read('../../supabase/036_repair_admin_catalog_cleanup.sql');
const priceHistoryRepair = read('../../supabase/037_allow_cascaded_price_history_cleanup.sql');

describe('inactive catalog cleanup', () => {
  it('is admin/password protected and deletes dependencies in a safe order', () => {
    expect(migration).toContain('not public.is_admin()');
    expect(migration).toContain("p_password is distinct from 'EPAV_admin_Tk'");
    expect(migration.indexOf("delete from public.recipes where status = 'archived'")).toBeLessThan(migration.indexOf('delete from public.products where active = false'));
    expect(migration.indexOf('delete from public.products where active = false')).toBeLessThan(migration.indexOf('delete from public.categories where active = false'));
  });
  it('offers a distinct confirmed action in the danger zone', () => {
    expect(template).toContain('Eliminar itens inativos');
    expect(template).toContain('onOpenInactiveCatalogCleanup');
    expect(app).toContain('adminDeleteInactiveCatalogItems');
  });
  it('places the danger zone in its own admin-only tab', () => {
    expect(app).toContain("'dangerZone'");
    expect(template).toContain('v.isAdminRole && v.isAdminDangerZoneTab');
    expect(template).toContain('onSetAdminTabDangerZone');
  });
  it('retains referenced inactive categories instead of rolling back cleanup', () => {
    expect(repair).toContain('not exists (select 1 from public.recipes r where r.category_id = c.id)');
    expect(repair).toContain('not exists (select 1 from public.products p where p.category_id = c.id)');
    expect(repair).toContain('get diagnostics v_category_count = row_count');
  });
  it('allows product cascades to remove immutable Swift price history', () => {
    expect(priceHistoryRepair).toContain("tg_op = 'DELETE' and pg_trigger_depth() > 1");
    expect(priceHistoryRepair).toContain('return old');
    expect(priceHistoryRepair).toContain("raise exception 'price_history_is_immutable'");
  });
});
