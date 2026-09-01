import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const app = read('../../app.js');
const template = read('../../template.js');
const migration = read('../../supabase/035_admin_inactive_catalog_cleanup.sql');

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
});
