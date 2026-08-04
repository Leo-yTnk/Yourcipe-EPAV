import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('admin spreadsheet import wiring', () => {
  const app = fs.readFileSync('app.js', 'utf8');
  const template = fs.readFileSync('template.js', 'utf8');
  const sql = fs.readFileSync('supabase/012_admin_import_and_home_order.sql', 'utf8');

  it('shows Importar Planilha only through admin site catalog UI and guards the opener', () => {
    expect(template).toContain('v.isAdminRole && v.isAdminRecipesTab && renderSiteRecipesTab');
    expect(template).toContain('Importar Planilha');
    expect(app).toContain("if (this.state.authRole !== 'admin') return");
  });

  it('uses the admin RPC instead of mutating local recipes/products', () => {
    expect(app).toContain('catalog.adminImportPublicRecipes');
    expect(app).toContain("s.importMode === 'replace_all'");
    expect(app).toContain('Receitas pessoais não serão alteradas');
  });

  it('installs server-side authorization and scope protections', () => {
    expect(sql).toContain('not public.is_admin()');
    expect(sql).toContain("scope = 'site'");
    expect(sql).toContain("owner_id is null");
    expect(sql.toLowerCase()).toContain('security definer');
    expect(sql).toContain("set search_path = ''");
  });
});
