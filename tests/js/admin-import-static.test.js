import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('admin spreadsheet import wiring', () => {
  const app = fs.readFileSync('app.js', 'utf8');
  const template = fs.readFileSync('template.js', 'utf8');
  const sql = fs.readFileSync('supabase/012_admin_import_and_home_order.sql', 'utf8');
  const catalogSql = fs.readFileSync('supabase/016_full_catalog_import.sql', 'utf8');
  const nativeSectionsSql = fs.readFileSync('supabase/017_native_import_sections.sql', 'utf8');
  const collisionSafeSql = fs.readFileSync('supabase/018_collision_safe_import.sql', 'utf8');

  it('shows Importar Planilha only through admin site catalog UI and guards the opener', () => {
    expect(template).toContain('v.isAdminRole && v.isAdminRecipesTab && renderSiteRecipesTab');
    expect(template).toContain('Importar Planilha');
    expect(app).toContain("if (this.state.authRole !== 'admin') return");
  });

  it('imports categories, products and recipes with independent modes', () => {
    expect(app).toContain('catalog.adminImportPublicCatalog');
    expect(app).toContain('onConfirmImport: this.onConfirmImport');
    expect(template).toContain('onClick=${v.onConfirmImport}');
    expect(app).toContain("importModes: { recipes: 'add', products: 'add', categories: 'add' }");
    expect(template).toContain("['categories', 'Categorias'");
    expect(template).toContain("['products', 'Produtos'");
    expect(template).toContain("['recipes', 'Receitas'");
    expect(template).toContain('Substituir equivalentes');
    expect(template).toContain('Substituir tudo');
    expect(app).toContain('Receitas pessoais não serão alteradas');
    expect(template).toContain('role="alert"');
  });

  it('starts a clean new import and uses CustomSelect for each conflict mode', () => {
    expect(app).toContain("onNewImport = () => this.setState({ showImportModal: true, ...this.freshImportState() })");
    expect(app).toContain('onNewImport: this.onNewImport');
    expect(template).toContain("v.importResult ? 'Nova Importação' : 'Voltar'");
    expect(template).toContain('ariaLabel=${`Modo de importação de ${label}`}');
    expect(template).toContain('onChange=${mode => v.onSetImportMode(key, mode)}');
    expect(template).not.toContain('<select aria-label=${`Modo de importação de ${label}`}');
  });

  it('accepts every native recipe tag without requiring spreadsheet categories', () => {
    expect(app).toContain("const NATIVE_RECIPE_TAGS = new Set(['destaque', ...SECTION_DEFS.map(section => section.key)])");
    for (const tag of ['recomendado', 'pratico', 'ocasiao', 'rapido', 'churrasco', 'petisco']) {
      expect(fs.readFileSync('data.js', 'utf8')).toContain(`key: '${tag}'`);
    }
    expect(template).toContain('Avisos — seções não cadastradas usadas em receitas');
    expect(template).not.toContain('Avisos — produtos não cadastrados usados em receitas');
    expect(nativeSectionsSql).toContain('ensure_native_recipe_sections');
    expect(nativeSectionsSql).toContain('perform public.ensure_native_recipe_sections()');
  });

  it('requires images for new products while supporting price-only updates', () => {
    expect(app).toContain("get(row, ['imagem', 'image_url', 'url da imagem'])");
    expect(app).toContain('URL de imagem ausente ou inválida');
    expect(app).toContain('image_url: imageUrl');
    expect(template).toContain('<strong>imagem</strong> — obrigatória para produtos novos');
    expect(template).toContain('informe apenas <strong>nome</strong> e <strong>preco</strong>');
    expect(app).toContain("products: 'upsert'");
    expect(catalogSql).toContain("image_url = btrim(v_item->>'image_url')");
    expect(catalogSql).toContain('unit, price, image_url, active');
  });

  it('matches category identity by the unique slug before inserting', () => {
    expect(app).toContain('normalizeImportSlug');
    expect(collisionSafeSql).toContain("slug = public.slugify(v_item->>'name')");
    expect(collisionSafeSql).toContain("order by (slug = public.slugify(v_item->>'name')) desc");
  });

  it('identifies equivalent spreadsheet categories with actionable details', () => {
    expect(app).toContain('const seenCategories = new Map()');
    expect(app).toContain('Categorias, linhas ${first.line}');
    expect(app).toContain('nome simplificado: "${this.normalizeImportSlug(name)}"');
    expect(app).toContain('source_line: i + 2');
    expect(app).toContain('formatImportFailure = (error) =>');
    expect(app).toContain('Conflito na aba Categorias:');
    expect(app).toContain('Nenhuma alteração foi aplicada.');
    expect(app).not.toContain('Há duas categorias equivalentes (mesmo tipo e nome simplificado).');
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
