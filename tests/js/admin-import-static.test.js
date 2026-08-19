import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('admin spreadsheet import wiring', () => {
  const app = fs.readFileSync('app.js', 'utf8');
  const template = fs.readFileSync('template.js', 'utf8');
  const sql = fs.readFileSync('supabase/012_admin_import_and_home_order.sql', 'utf8');
  const catalogSql = fs.readFileSync('supabase/016_full_catalog_import.sql', 'utf8');
  const nativeSectionsSql = fs.readFileSync('supabase/017_native_import_sections.sql', 'utf8');
  const collisionSafeSql = fs.readFileSync('supabase/018_collision_safe_import.sql', 'utf8');
  const nativeNameEquivalenceSql = fs.readFileSync('supabase/019_native_section_name_equivalence.sql', 'utf8');
  const nativeSectionResolutionSql = fs.readFileSync('supabase/020_native_recipe_section_resolution.sql', 'utf8');
  const pageSpecificImportSql = fs.readFileSync('supabase/026_page_specific_import_sections.sql', 'utf8');

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

  it('requires product metadata while keeping legacy price updates compatible', () => {
    expect(app).toContain("get(row, ['imagem', 'image_url', 'url da imagem'])");
    expect(app).toContain('URL de imagem ausente ou inválida');
    expect(app).toContain('image_url: imageUrl');
    expect(template).toContain('<strong>imagem</strong> — obrigatória para produtos novos');
    expect(template).toContain('não é necessário informar o preço');
    expect(app).toContain("products: 'upsert'");
    expect(catalogSql).toContain("image_url = btrim(v_item->>'image_url')");
    expect(catalogSql).toContain('unit, price, image_url, active');
  });

  it('matches category identity by the unique slug before inserting', () => {
    expect(app).toContain('normalizeImportSlug');
    expect(collisionSafeSql).toContain("slug = public.slugify(v_item->>'name')");
    expect(collisionSafeSql).toContain("order by (slug = public.slugify(v_item->>'name')) desc");
  });

  it('does not let equivalent spreadsheet categories block replacement', () => {
    expect(app).toContain('const seenCategories = new Map()');
    expect(app).toContain('Categorias, linhas ${first.line}');
    expect(app).toContain('a duplicada não impedirá a importação');
    expect(app).not.toContain('errors.push(`Categorias, linhas ${first.line}');
    expect(app).toContain('warnings.push(`Categorias, linhas ${first.line}');
    expect(app).toContain('source_line: i + 2');
    expect(app).toContain('formatImportFailure = (error) =>');
    expect(app).toContain('Conflito na aba Categorias:');
    expect(app).toContain('Nenhuma alteração foi aplicada.');
    expect(app).not.toContain('Há duas categorias equivalentes (mesmo tipo e nome simplificado).');
    expect(nativeNameEquivalenceSql).toContain('public.normalize_catalog_name(name) = public.normalize_catalog_name(v_section.name)');
  });

  it('resolves stable native tag keys to persisted section display names', () => {
    for (const [key, name] of [
      ['recomendado', 'Recomendados'],
      ['pratico', 'Práticos para o Dia a Dia'],
      ['ocasiao', 'Ocasiões Especiais'],
      ['rapido', 'Pronto em 30 Minutos'],
      ['churrasco', 'Direto da Churrasqueira'],
      ['petisco', 'Petiscos para Compartilhar'],
    ]) {
      expect(nativeSectionResolutionSql).toContain(`when '${key}' then '${name}'`);
    }
    expect(nativeSectionResolutionSql.match(/case v_sec#>>'\{\}'/g)).toHaveLength(2);
    expect(nativeSectionResolutionSql).toContain('section_not_found');
  });

  it('imports page-specific category types and never resolves recipe tags through legacy secao', () => {
    for (const type of ['proteina', 'receita', 'secao_home', 'secao_receita', 'secao_produto']) {
      expect(app).toContain(`'${type}'`);
      expect(pageSpecificImportSql).toContain(`'${type}'`);
    }
    expect(app).not.toContain("typeRaw === 'secao_produto' ? 'secao' : typeRaw");
    expect(pageSpecificImportSql.match(/type in \('secao_receita', 'secao_home'\)/g)).toHaveLength(2);
    expect(pageSpecificImportSql).not.toContain("active and type = 'secao'");
    expect(pageSpecificImportSql).toContain("values ('site', null, 'secao_home'");
    expect(template).not.toContain('"secao" (seção da home)');
  });

  it('surfaces actionable server diagnostics instead of a generic import failure', () => {
    expect(app).toContain('Produto usado como ingrediente não encontrado:');
    expect(app).toContain('Seção de receita não encontrada:');
    expect(app).toContain('A validação do servidor rejeitou os dados');
    expect(app).toContain('Detalhe técnico: ${diagnostic}');
  });

  it('unifies Swift source data and blocks duplicate identities', () => {
    const unifiedSql = fs.readFileSync('supabase/025_unified_secure_catalog_import.sql', 'utf8');
    expect(app).toContain("['swift_url', 'url swift'");
    expect(app).toContain('seenSwiftUrls');
    expect(app).toContain('seenSwiftSkus');
    expect(app).toContain('10 * 1024 * 1024');
    expect(template).toContain('<strong>swift_url</strong>');
    expect(template).toContain('operação é única e transacional');
    expect(unifiedSql).toContain('duplicate_swift_url_in_payload');
    expect(unifiedSql).toContain('products_site_swift_url_uk');
    expect(unifiedSql).toContain("price_status = case");
    expect(unifiedSql).toContain("coalesce(nullif(v_item->>'price', '')::numeric, 0)");
    expect(unifiedSql).toContain("price_source = 'SWIFT' and price_last_success_at is not null");
    expect(app).toContain("price: Number.isFinite(price) ? price : null");
    expect(app).toContain('swift_url é obrigatória para integrar o preço');
    expect(app).toContain('Origem Swift inválida ou duplicada');
    expect(app).not.toContain("unidade: 'kg', preco: 89.90");
  });

  it('shows the release version at the end of the profile page', () => {
    expect(template).toContain('>V0.41</div>');
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
