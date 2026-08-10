import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('admin spreadsheet import wiring', () => {
  const app = fs.readFileSync('app.js', 'utf8');
  const template = fs.readFileSync('template.js', 'utf8');
  const sql = fs.readFileSync('supabase/012_admin_import_and_home_order.sql', 'utf8');
  const catalogSql = fs.readFileSync('supabase/016_full_catalog_import.sql', 'utf8');

  it('shows Importar Planilha only through admin site catalog UI and guards the opener', () => {
    expect(template).toContain('v.isAdminRole && v.isAdminRecipesTab && renderSiteRecipesTab');
    expect(template).toContain('Importar Planilha');
    expect(app).toContain("if (this.state.authRole !== 'admin') return");
  });

  it('imports categories, products and recipes with independent modes', () => {
    expect(app).toContain('catalog.adminImportPublicCatalog');
    expect(app).toContain("importModes: { recipes: 'add', products: 'add', categories: 'add' }");
    expect(template).toContain("['categories', 'Categorias'");
    expect(template).toContain("['products', 'Produtos'");
    expect(template).toContain("['recipes', 'Receitas'");
    expect(template).toContain('Substituir equivalentes');
    expect(template).toContain('Substituir tudo');
    expect(app).toContain('Receitas pessoais não serão alteradas');
  });

  it('installs server-side authorization and scope protections', () => {
    expect(sql).toContain('not public.is_admin()');
    expect(sql).toContain("scope = 'site'");
    expect(sql).toContain("owner_id is null");
    expect(sql.toLowerCase()).toContain('security definer');
    expect(sql).toContain("set search_path = ''");
    expect(catalogSql).toContain('admin_import_public_catalog');
    expect(catalogSql).toContain("v_category_mode not in ('add', 'upsert', 'replace_all')");
    expect(catalogSql).toContain("v_product_mode not in ('add', 'upsert', 'replace_all')");
    expect(catalogSql).toContain("v_recipe_mode not in ('add', 'upsert', 'replace_all')");
  });
});
