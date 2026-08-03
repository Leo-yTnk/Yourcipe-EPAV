-- Yourcipe — seed the app's built-in default catalog into Supabase as
-- scope='site' rows (categories, products, recipes, recipe_ingredients,
-- recipe_categories), replacing the front-end's dependence on data.js'
-- DEFAULT_PRODUCTS/DEFAULT_RECIPES + localStorage for a brand-new/empty
-- catalog.
--
-- Root cause this file fixes: before this migration, the ONLY place the
-- default catalog content (63 products, 28 recipes, their categories,
-- ingredients and section tags) existed was data.js's DEFAULT_PRODUCTS/
-- DEFAULT_RECIPES arrays, read into `this.state.products`/`this.state.recipes`
-- in app.js's constructor (optionally overridden by whatever a given
-- browser's localStorage happened to already contain — see
-- LS_KEYS.products/LS_KEYS.recipes in data.js and the localStorage reads at
-- the top of App's `state` initializer in app.js). `loadPublicCatalog()`
-- (app.js) only ever falls back to this local seed on an actual Supabase
-- fetch error (`publicCatalogSource: 'demo-fallback'`) — on a real, working,
-- but genuinely EMPTY `scope='site'` catalog (e.g. a freshly-provisioned
-- Supabase project with 004-007 applied and nothing ever published through
-- the admin UI or the change-request workflow), `fetchPublicCategories`/
-- `fetchPublicProducts`/`fetchPublicRecipes` all succeed and simply return
-- zero rows — so Home/Search render genuinely empty, not with the "63
-- products / 28 recipes" experience the app was designed to ship with. This
-- migration is what actually populates that catalog server-side, once, so
-- every browser (regardless of its localStorage state) sees the same
-- default content from Supabase — see supabase/STAGING.md for why clearing
-- localStorage/cache is now safe.
--
-- Review every statement before running it. Idempotent — safe to re-run
-- any number of times: every insert is guarded by a `WHERE NOT EXISTS`
-- against a stable `seed_key` (categories/products) or `legacy_id`
-- (recipes), backed by a partial UNIQUE index scoped to `scope='site'`, so
-- re-running this file after it has already seeded (fully or partially)
-- inserts nothing new for any row that was already seeded, and never
-- touches a pre-existing `scope='site'` row that merely happens to share a
-- seed row's *name* (name is not used as the dedup key anywhere in this
-- file). Never touches `scope='personal'` rows at all — every statement in
-- this file is scoped to `scope = 'site'`.
--
-- Wrapped in a single transaction: any error rolls back every insert this
-- migration made in this run, leaving the catalog exactly as it was before
-- (data.js remains the effective fallback for that browser session via
-- loadPublicCatalog's error path — nothing here can leave the catalog
-- half-seeded across a hard failure).
--
-- Insert order (also the dependency order): proteina categories -> receita
-- categories -> secao categories -> products -> recipes ->
-- recipe_ingredients -> recipe_categories. category_code/product_code/
-- recipe_code (YCT-/YPR-/YCR-) are never supplied by this file — they are
-- generated exclusively by the BEFORE INSERT triggers from
-- supabase/004_catalog_schema.sql (assign_category_code/assign_product_code/
-- assign_recipe_code), exactly as for any other row. published_at is never
-- supplied either — supabase/006_admin_catalog_publishing.sql's
-- set_recipe_published_at trigger stamps it automatically the moment a
-- recipe is inserted with status='published', which every seeded recipe is.
--
-- Depends on supabase/schema.sql, supabase/002_profiles_display_name_phase1.sql,
-- supabase/004_catalog_schema.sql, supabase/005_creation_mode_sharing.sql,
-- supabase/006_admin_catalog_publishing.sql and
-- supabase/007_change_requests.sql already being applied (needs
-- categories/products/recipes/recipe_ingredients/recipe_categories to exist,
-- and needs recipes_site_not_private_ck / set_recipe_published_at from 006).

begin;

-- =========================================================================
-- 0. Identity columns for safe idempotent re-seeding.
--
-- Name alone is not a safe dedup key: names can legitimately repeat across
-- type/scope/owner (e.g. an admin or a change-request approval could create
-- a scope='site' category/product/recipe with the same name as a seed row,
-- and that row must never be treated as "the same row" by this migration).
-- categories/products have no existing identity column suitable for this
-- (checked: 004/005/006/007 add none). recipes already has a nullable
-- `legacy_id text` column (004) that is NOT used by any other migration or
-- RPC in 005/006/007 (verified: no `legacy_id` reference anywhere in those
-- files) — reused here as recipes' seed identity key instead of adding yet
-- another column to that table.
--
-- Both are `ADD COLUMN IF NOT EXISTS` / `CREATE UNIQUE INDEX IF NOT EXISTS`,
-- so this section is itself safe to apply on top of an already-partially-
-- seeded database (e.g. this migration re-run after a partial failure, or
-- after a manual hotfix already added the column by hand).
-- =========================================================================
alter table public.categories add column if not exists seed_key text;
alter table public.products add column if not exists seed_key text;

create unique index if not exists categories_site_seed_key_uk
  on public.categories (seed_key) where scope = 'site' and seed_key is not null;
create unique index if not exists products_site_seed_key_uk
  on public.products (seed_key) where scope = 'site' and seed_key is not null;
create unique index if not exists recipes_site_legacy_id_uk
  on public.recipes (legacy_id) where scope = 'site' and legacy_id is not null;

-- =========================================================================
-- 1. Staging tables (transaction-local, dropped automatically at commit) —
--    the seed content itself, exactly as carried over from data.js's
--    CATEGORIAS_PRODUTO / CATEGORIAS_RECEITA / SECTION_DEFS /
--    DEFAULT_PRODUCTS / DEFAULT_RECIPES. Nothing here is invented: every
--    name/price/unit/prep_time/servings/difficulty/image/featured/extras/
--    instructions/tips/ingredient/section value below is copied verbatim
--    from data.js.
-- =========================================================================
create temporary table seed_categories (
  seed_key text primary key,
  type text not null,
  name text not null,
  sort_order integer not null
) on commit drop;

create temporary table seed_products (
  seed_key text primary key,
  name text not null,
  category_seed_key text not null,
  unit text not null,
  price numeric not null
) on commit drop;

create temporary table seed_recipes (
  seed_key text primary key,
  name text not null,
  category_seed_key text not null,
  prep_time integer not null,
  servings integer not null,
  difficulty text not null,
  image_url text,
  featured boolean not null,
  extras text[] not null,
  instructions text[] not null,
  tips text[] not null
) on commit drop;

create temporary table seed_recipe_ingredients (
  recipe_seed_key text not null,
  product_seed_key text not null,
  quantity numeric not null,
  sort_order integer not null
) on commit drop;

create temporary table seed_recipe_categories (
  recipe_seed_key text not null,
  category_seed_key text not null,
  sort_order integer not null
) on commit drop;

-- ---- categories: proteina (data.js CATEGORIAS_PRODUTO), in order ----
insert into seed_categories (seed_key, type, name, sort_order) values
  ('cat:proteina:bovinos', 'proteina', 'Bovinos', 0),
  ('cat:proteina:suinos', 'proteina', 'Suínos', 1),
  ('cat:proteina:aves', 'proteina', 'Aves', 2),
  ('cat:proteina:peixes_e_frutos_do_mar', 'proteina', 'Peixes e Frutos do Mar', 3),
  ('cat:proteina:linguicas_e_embutidos', 'proteina', 'Linguiças e Embutidos', 4),
  ('cat:proteina:cortes_especiais', 'proteina', 'Cortes Especiais', 5),
  ('cat:proteina:prontos_para_comer', 'proteina', 'Prontos para Comer', 6),
  ('cat:proteina:padaria', 'proteina', 'Padaria', 7),
  ('cat:proteina:mercearia', 'proteina', 'Mercearia', 8),
  ('cat:proteina:hortifruti', 'proteina', 'Hortifruti', 9);

-- ---- categories: receita (data.js CATEGORIAS_RECEITA), in order ----
insert into seed_categories (seed_key, type, name, sort_order) values
  ('cat:receita:bovina', 'receita', 'Bovina', 0),
  ('cat:receita:suina', 'receita', 'Suína', 1),
  ('cat:receita:ave', 'receita', 'Ave', 2),
  ('cat:receita:peixe', 'receita', 'Peixe', 3),
  ('cat:receita:lanches', 'receita', 'Lanches', 4),
  ('cat:receita:mista', 'receita', 'Mista', 5);

-- ---- categories: secao (data.js SECTION_DEFS), in order ----
insert into seed_categories (seed_key, type, name, sort_order) values
  ('cat:secao:recomendado', 'secao', 'Recomendados', 0),
  ('cat:secao:pratico', 'secao', 'Práticos para o Dia a Dia', 1),
  ('cat:secao:ocasiao', 'secao', 'Ocasiões Especiais', 2),
  ('cat:secao:rapido', 'secao', 'Pronto em 30 Minutos', 3),
  ('cat:secao:churrasco', 'secao', 'Direto da Churrasqueira', 4),
  ('cat:secao:petisco', 'secao', 'Petiscos para Compartilhar', 5);

-- ---- products (data.js DEFAULT_PRODUCTS) ----
insert into seed_products (seed_key, name, category_seed_key, unit, price) values
  ('product:p1', 'Contra Filé Swift em Bifes 500g', 'cat:proteina:bovinos', 'pacote', 34.9),
  ('product:p2', 'Cubos de Acém Swift 500g', 'cat:proteina:bovinos', 'pacote', 22.9),
  ('product:p3', 'Tiras de Alcatra Swift 500g', 'cat:proteina:bovinos', 'pacote', 31.9),
  ('product:p4', 'Carne Moída de Patinho Swift 500g', 'cat:proteina:bovinos', 'pacote', 29.9),
  ('product:p5', 'Carne Moída Bolonhesa Swift 500g', 'cat:proteina:bovinos', 'pacote', 25.9),
  ('product:p6', 'Almôndegas Bovinas Swift 500g', 'cat:proteina:bovinos', 'pacote', 18.9),
  ('product:p7', 'Hambúrguer de Picanha Swift 180g', 'cat:proteina:bovinos', 'un', 7.5),
  ('product:p8', 'Picanha Swift Legado 1855', 'cat:proteina:cortes_especiais', 'kg', 89.9),
  ('product:p9', 'Bife de Copa Lombo Suíno Swift 1kg', 'cat:proteina:suinos', 'pacote', 29.9),
  ('product:p10', 'Lombo Suíno Swift', 'cat:proteina:suinos', 'kg', 24.9),
  ('product:p11', 'Costela Suína Swift', 'cat:proteina:suinos', 'kg', 26.9),
  ('product:p12', 'Pernil Suíno Swift', 'cat:proteina:suinos', 'kg', 22.9),
  ('product:p13', 'Bacon Fatiado Swift 250g', 'cat:proteina:linguicas_e_embutidos', 'pacote', 16.9),
  ('product:p14', 'Linguiça Toscana Swift 700g', 'cat:proteina:linguicas_e_embutidos', 'pacote', 18.9),
  ('product:p15', 'Salsicha Hot Dog Swift 500g', 'cat:proteina:linguicas_e_embutidos', 'pacote', 9.9),
  ('product:p16', 'Filé de Peito de Frango Swift 1kg', 'cat:proteina:aves', 'pacote', 19.9),
  ('product:p17', 'Cubos de Filé de Peito de Frango Swift 1kg', 'cat:proteina:aves', 'pacote', 23.9),
  ('product:p18', 'Tiras de Filé de Peito de Frango Swift 1kg', 'cat:proteina:aves', 'pacote', 23.9),
  ('product:p19', 'Filé de Coxa e Sobrecoxa Temperado Swift 1kg', 'cat:proteina:aves', 'pacote', 22.9),
  ('product:p20', 'Filezinho Sassami Empanado Swift 700g', 'cat:proteina:aves', 'pacote', 22.9),
  ('product:p21', 'Filé de Tilápia Swift 400g', 'cat:proteina:peixes_e_frutos_do_mar', 'pacote', 22.9),
  ('product:p22', 'Pedaços de Filé de Salmão Swift 500g', 'cat:proteina:peixes_e_frutos_do_mar', 'pacote', 48.9),
  ('product:p23', 'Camarão Pré-cozido Swift 400g', 'cat:proteina:peixes_e_frutos_do_mar', 'pacote', 49.9),
  ('product:p24', 'Filé de Merluza Swift 800g', 'cat:proteina:peixes_e_frutos_do_mar', 'pacote', 34.9),
  ('product:p25', 'Batata Palito Swift 1,5kg', 'cat:proteina:prontos_para_comer', 'pacote', 19.9),
  ('product:p26', 'Pão de Alho Baguete Tradicional Swift 400g', 'cat:proteina:padaria', 'pacote', 13.9),
  ('product:p27', 'Queijo Mussarela Fatiado Swift 300g', 'cat:proteina:mercearia', 'pacote', 17.9),
  ('product:p28', 'Queijo Sabor Cheddar Fatiado Swift 200g', 'cat:proteina:mercearia', 'pacote', 12.9),
  ('product:p29', 'Alho Picado Swift 200g', 'cat:proteina:hortifruti', 'pote', 13.9),
  ('product:p30', 'Cebola Picada Swift 300g', 'cat:proteina:hortifruti', 'pacote', 6.9),
  ('product:p31', 'Tomate Picado Swift 300g', 'cat:proteina:hortifruti', 'pacote', 7.9),
  ('product:p32', 'Molho Sugo Swift 300g', 'cat:proteina:mercearia', 'pote', 6.9),
  ('product:p33', 'Mix de Legumes Swift 300g', 'cat:proteina:hortifruti', 'pacote', 7.9),
  ('product:p34', 'Arroz 1kg', 'cat:proteina:mercearia', 'pacote', 7.9),
  ('product:p35', 'Feijão Preto 1kg', 'cat:proteina:mercearia', 'pacote', 9.9),
  ('product:p36', 'Macarrão Espaguete 500g', 'cat:proteina:mercearia', 'pacote', 5.9),
  ('product:p37', 'Batata', 'cat:proteina:hortifruti', 'kg', 6.99),
  ('product:p38', 'Cenoura', 'cat:proteina:hortifruti', 'kg', 5.99),
  ('product:p39', 'Pimentão', 'cat:proteina:hortifruti', 'kg', 11.99),
  ('product:p40', 'Limão', 'cat:proteina:hortifruti', 'kg', 5.99),
  ('product:p41', 'Alface', 'cat:proteina:hortifruti', 'un', 4.99),
  ('product:p42', 'Mandioca', 'cat:proteina:hortifruti', 'kg', 8.99),
  ('product:p43', 'Creme de Leite 200g', 'cat:proteina:mercearia', 'caixa', 4.49),
  ('product:p44', 'Requeijão 200g', 'cat:proteina:mercearia', 'pote', 8.99),
  ('product:p45', 'Milho Verde 170g', 'cat:proteina:mercearia', 'un', 4.29),
  ('product:p46', 'Molho Barbecue 350g', 'cat:proteina:mercearia', 'pote', 12.9),
  ('product:p47', 'Leite de Coco 200ml', 'cat:proteina:mercearia', 'un', 5.49),
  ('product:p48', 'Farinha de Rosca 500g', 'cat:proteina:mercearia', 'pacote', 7.49),
  ('product:p49', 'Pão de Hambúrguer', 'cat:proteina:padaria', 'pacote', 9.9),
  ('product:p50', 'Pão de Hot Dog', 'cat:proteina:padaria', 'pacote', 8.9),
  ('product:p51', 'Pão Francês', 'cat:proteina:padaria', 'pacote', 7.9),
  ('product:p52', 'Batata Palha 120g', 'cat:proteina:mercearia', 'pacote', 6.9),
  ('product:p53', 'Farofa Pronta 400g', 'cat:proteina:mercearia', 'pacote', 8.9),
  ('product:p54', 'Queijo Parmesão Ralado 50g', 'cat:proteina:mercearia', 'pacote', 6.9),
  ('product:p55', 'Leite UHT 1L', 'cat:proteina:mercearia', 'caixa', 5.49),
  ('product:p56', 'Manteiga 200g', 'cat:proteina:mercearia', 'pote', 11.9),
  ('product:p57', 'Ovos com 12 unidades', 'cat:proteina:mercearia', 'caixa', 12.9),
  ('product:p58', 'Molho Shoyu 150ml', 'cat:proteina:mercearia', 'un', 7.9),
  ('product:p59', 'Amido de Milho 200g', 'cat:proteina:mercearia', 'caixa', 6.9),
  ('product:p60', 'Ketchup 400g', 'cat:proteina:mercearia', 'pote', 8.9),
  ('product:p61', 'Mostarda 200g', 'cat:proteina:mercearia', 'pote', 5.9),
  ('product:p62', 'Maionese 500g', 'cat:proteina:mercearia', 'pote', 9.9),
  ('product:p63', 'Sal Grosso 1kg', 'cat:proteina:mercearia', 'pacote', 7.9);

-- ---- recipes (data.js DEFAULT_RECIPES) ----
insert into seed_recipes (seed_key, name, category_seed_key, prep_time, servings, difficulty, image_url, featured, extras, instructions, tips) values
  ('recipe:r1', 'Bife Acebolado com Arroz e Fritas', 'cat:receita:bovina', 40, 4, 'Fácil', 'https://images.pexels.com/photos/28503592/pexels-photo-28503592.jpeg?auto=compress&cs=tinysrgb&w=1200&h=800&fit=crop', true, ARRAY['Sal a gosto', 'Pimenta-do-reino a gosto', 'Óleo para grelhar'], ARRAY['Prepare o arroz conforme as instruções da embalagem.', 'Asse ou frite a batata palito até dourar.', 'Tempere os bifes com sal e pimenta.', 'Grelhe os bifes em frigideira bem quente e reserve.', 'Refogue a cebola na mesma frigideira e sirva sobre os bifes.'], ARRAY['Não coloque muitos bifes de uma vez para evitar que cozinhem no próprio líquido.']),
  ('recipe:r2', 'Carne de Panela com Batata', 'cat:receita:bovina', 80, 6, 'Médio', 'https://images.pexels.com/photos/30635686/pexels-photo-30635686.jpeg?auto=compress&cs=tinysrgb&w=1200&h=800&fit=crop', false, ARRAY['Sal a gosto', 'Pimenta-do-reino a gosto', 'Água quente', 'Cheiro-verde'], ARRAY['Sele os cubos de acém em uma panela de pressão.', 'Junte a cebola e o alho e refogue.', 'Acrescente o molho sugo, água quente e os temperos.', 'Cozinhe sob pressão por cerca de 35 minutos.', 'Adicione a batata e a cenoura e cozinhe sem pressão até ficarem macias.'], ARRAY['Corte a batata em pedaços grandes para que não desmanche.']),
  ('recipe:r3', 'Estrogonofe de Carne', 'cat:receita:bovina', 35, 5, 'Fácil', 'https://images.pexels.com/photos/1998918/pexels-photo-1998918.jpeg?auto=compress&cs=tinysrgb&w=1200&h=800&fit=crop', true, ARRAY['Sal a gosto', 'Pimenta-do-reino a gosto', 'Mostarda a gosto', 'Ketchup a gosto'], ARRAY['Prepare o arroz.', 'Doure as tiras de alcatra em frigideira bem quente.', 'Adicione a cebola e refogue.', 'Misture o molho sugo, a mostarda e o ketchup.', 'Desligue o fogo, incorpore o creme de leite e sirva com arroz e batata palha.'], ARRAY['Adicione o creme de leite com o fogo baixo para evitar que o molho talhe.']),
  ('recipe:r4', 'Escondidinho de Carne Moída', 'cat:receita:bovina', 60, 6, 'Médio', 'https://images.pexels.com/photos/29145751/pexels-photo-29145751.jpeg?auto=compress&cs=tinysrgb&w=1200&h=800&fit=crop', false, ARRAY['Sal a gosto', 'Pimenta-do-reino a gosto', 'Cheiro-verde'], ARRAY['Cozinhe a mandioca até ficar macia e amasse.', 'Misture o requeijão ao purê de mandioca e ajuste o sal.', 'Refogue a carne moída com cebola e alho.', 'Adicione o molho sugo e cozinhe até reduzir.', 'Monte em um refratário com carne, purê e mussarela.', 'Gratine em forno alto até dourar.'], ARRAY['Retire os fios centrais da mandioca antes de amassar.']),
  ('recipe:r5', 'Macarrão à Bolonhesa', 'cat:receita:bovina', 35, 5, 'Fácil', 'https://images.pexels.com/photos/21906876/pexels-photo-21906876.jpeg?auto=compress&cs=tinysrgb&w=1200&h=800&fit=crop', false, ARRAY['Sal a gosto', 'Azeite', 'Manjericão ou cheiro-verde'], ARRAY['Cozinhe o macarrão em água salgada até ficar al dente.', 'Doure a carne moída e acrescente a cebola.', 'Junte o molho sugo e cozinhe por 10 minutos.', 'Misture o molho ao macarrão ou sirva por cima.', 'Finalize com queijo parmesão.'], ARRAY['Reserve um pouco da água do cozimento para ajustar a textura do molho.']),
  ('recipe:r6', 'Almôndegas ao Molho com Purê', 'cat:receita:bovina', 50, 5, 'Fácil', 'https://images.pexels.com/photos/19119681/pexels-photo-19119681.jpeg?auto=compress&cs=tinysrgb&w=1200&h=800&fit=crop', false, ARRAY['Sal a gosto', 'Pimenta-do-reino a gosto', 'Noz-moscada'], ARRAY['Cozinhe as batatas e amasse.', 'Misture leite e manteiga ao purê e ajuste os temperos.', 'Doure as almôndegas em uma panela.', 'Acrescente a cebola e o molho sugo.', 'Cozinhe em fogo baixo até as almôndegas ficarem aquecidas e o molho encorpar.', 'Sirva com o purê.'], ARRAY['Aqueça o leite antes de misturar ao purê.']),
  ('recipe:r7', 'Picanha na Brasa com Farofa', 'cat:receita:bovina', 55, 6, 'Médio', 'https://images.pexels.com/photos/29724647/pexels-photo-29724647.jpeg?auto=compress&cs=tinysrgb&w=1200&h=800&fit=crop', true, ARRAY['Carvão para churrasqueira', 'Vinagrete para acompanhar'], ARRAY['Acenda a churrasqueira e espere formar uma brasa forte sem chamas.', 'Corte a picanha em bifes grossos ou asse a peça inteira.', 'Tempere com sal grosso pouco antes de levar à grelha.', 'Grelhe até o ponto desejado, virando apenas quando estiver bem selada.', 'Deixe a carne descansar e asse o pão de alho.', 'Sirva com farofa.'], ARRAY['Fatie a carne contra as fibras para preservar a maciez.']),
  ('recipe:r8', 'Bife de Copa Lombo Acebolado', 'cat:receita:suina', 35, 5, 'Fácil', 'https://images.pexels.com/photos/10267321/pexels-photo-10267321.jpeg?auto=compress&cs=tinysrgb&w=1200&h=800&fit=crop', false, ARRAY['Sal a gosto', 'Pimenta-do-reino a gosto', 'Óleo para grelhar'], ARRAY['Prepare o arroz.', 'Tempere os bifes com limão, sal e pimenta.', 'Grelhe os bifes em frigideira quente até dourarem dos dois lados.', 'Refogue a cebola na mesma frigideira.', 'Sirva os bifes com a cebola e o arroz.'], ARRAY['Evite cozinhar demais o lombo para não ressecar.']),
  ('recipe:r9', 'Lombo Suíno Assado com Batatas', 'cat:receita:suina', 90, 6, 'Médio', 'https://images.pexels.com/photos/14146069/pexels-photo-14146069.jpeg?auto=compress&cs=tinysrgb&w=1200&h=800&fit=crop', false, ARRAY['Sal a gosto', 'Pimenta-do-reino a gosto', 'Alecrim', 'Azeite'], ARRAY['Tempere o lombo com alho, limão, sal, pimenta e alecrim.', 'Disponha em uma assadeira com a cebola e cubra com papel-alumínio.', 'Asse por 45 minutos em forno médio.', 'Junte as batatas temperadas e retire o papel-alumínio.', 'Asse até o lombo dourar e as batatas ficarem macias.', 'Descanse a carne antes de fatiar.'], ARRAY['Regue o lombo com o caldo da assadeira durante o preparo.']),
  ('recipe:r10', 'Costelinha Suína ao Barbecue', 'cat:receita:suina', 110, 5, 'Médio', 'https://images.pexels.com/photos/37135701/pexels-photo-37135701.jpeg?auto=compress&cs=tinysrgb&w=1200&h=800&fit=crop', true, ARRAY['Sal a gosto', 'Pimenta-do-reino a gosto', 'Páprica', 'Azeite'], ARRAY['Tempere a costela com alho, sal, pimenta e páprica.', 'Embrulhe em papel-alumínio e asse em forno médio por 70 minutos.', 'Abra o papel, pincele metade do molho barbecue e adicione as batatas.', 'Asse por mais 25 minutos.', 'Pincele o restante do molho e deixe caramelizar.'], ARRAY['Asse primeiro coberta para amaciar e finalize descoberta para dourar.']),
  ('recipe:r11', 'Linguiça Toscana Acebolada', 'cat:receita:suina', 25, 4, 'Fácil', 'https://images.pexels.com/photos/38085038/pexels-photo-38085038.jpeg?auto=compress&cs=tinysrgb&w=1200&h=800&fit=crop', false, ARRAY['Óleo ou azeite', 'Pimenta-calabresa opcional'], ARRAY['Corte a linguiça em rodelas.', 'Doure em frigideira até cozinhar por completo.', 'Acrescente a cebola e refogue até ficar macia.', 'Sirva com pão francês.'], ARRAY['Adicione um pequeno volume de água no começo para cozinhar sem queimar e deixe secar para dourar.']),
  ('recipe:r12', 'Feijoada Simples', 'cat:receita:suina', 120, 8, 'Médio', 'https://images.pexels.com/photos/6941026/pexels-photo-6941026.jpeg?auto=compress&cs=tinysrgb&w=1200&h=800&fit=crop', true, ARRAY['Sal a gosto', 'Folhas de louro', 'Cheiro-verde', 'Laranja para acompanhar'], ARRAY['Deixe o feijão de molho e escorra.', 'Doure o bacon, a linguiça e a costela em uma panela grande.', 'Refogue cebola e alho na gordura liberada.', 'Adicione o feijão, o louro e água suficiente.', 'Cozinhe sob pressão até o feijão e as carnes ficarem macios.', 'Acerte o sal e deixe o caldo engrossar.', 'Sirva com arroz e farofa.'], ARRAY['Controle o sal somente no final, pois os embutidos já são salgados.']),
  ('recipe:r13', 'Sanduíche de Pernil', 'cat:receita:lanches', 90, 6, 'Médio', 'https://images.pexels.com/photos/34495401/pexels-photo-34495401.jpeg?auto=compress&cs=tinysrgb&w=1200&h=800&fit=crop', false, ARRAY['Sal a gosto', 'Pimenta-do-reino a gosto', 'Cheiro-verde', 'Água quente'], ARRAY['Sele o pernil em cubos em uma panela de pressão.', 'Acrescente cebola, pimentão, molho sugo e temperos.', 'Adicione água e cozinhe sob pressão até ficar muito macio.', 'Desfie a carne e reduza o molho.', 'Recheie os pães com o pernil bem quente.'], ARRAY['Deixe o recheio úmido, mas sem excesso de líquido para não encharcar o pão.']),
  ('recipe:r14', 'Frango Grelhado com Legumes', 'cat:receita:ave', 30, 4, 'Fácil', 'https://images.pexels.com/photos/36351896/pexels-photo-36351896.jpeg?auto=compress&cs=tinysrgb&w=1200&h=800&fit=crop', false, ARRAY['Sal a gosto', 'Pimenta-do-reino a gosto', 'Azeite', 'Ervas secas'], ARRAY['Tempere os filés com limão, sal, pimenta e ervas.', 'Grelhe em frigideira quente até dourar e cozinhar por dentro.', 'Salteie o mix de legumes com um fio de azeite.', 'Sirva o frango com os legumes.'], ARRAY['Deixe o frango descansar por alguns minutos antes de cortar.']),
  ('recipe:r15', 'Estrogonofe de Frango', 'cat:receita:ave', 35, 5, 'Fácil', 'https://images.pexels.com/photos/18265289/pexels-photo-18265289.jpeg?auto=compress&cs=tinysrgb&w=1200&h=800&fit=crop', true, ARRAY['Sal a gosto', 'Pimenta-do-reino a gosto', 'Mostarda a gosto', 'Ketchup a gosto'], ARRAY['Prepare o arroz.', 'Doure os cubos de frango.', 'Adicione a cebola e refogue.', 'Misture molho sugo, mostarda e ketchup.', 'Desligue o fogo e incorpore o creme de leite.', 'Sirva com arroz e batata palha.'], ARRAY['Não cozinhe o creme de leite por muito tempo.']),
  ('recipe:r16', 'Fricassê de Frango', 'cat:receita:ave', 45, 6, 'Fácil', 'https://images.pexels.com/photos/10296266/pexels-photo-10296266.jpeg?auto=compress&cs=tinysrgb&w=1200&h=800&fit=crop', false, ARRAY['Sal a gosto', 'Pimenta-do-reino a gosto', 'Cheiro-verde'], ARRAY['Doure o frango com a cebola e tempere.', 'Bata o milho, o creme de leite e o requeijão até formar um creme.', 'Misture o creme ao frango.', 'Transfira para um refratário e cubra com mussarela.', 'Gratine em forno alto.', 'Finalize com batata palha antes de servir.'], ARRAY['Coloque a batata palha somente no final para mantê-la crocante.']),
  ('recipe:r17', 'Coxa e Sobrecoxa Assada com Batatas', 'cat:receita:ave', 75, 5, 'Fácil', 'https://images.pexels.com/photos/4589138/pexels-photo-4589138.jpeg?auto=compress&cs=tinysrgb&w=1200&h=800&fit=crop', false, ARRAY['Pimenta-do-reino a gosto', 'Páprica', 'Azeite'], ARRAY['Disponha o frango em uma assadeira.', 'Tempere as batatas com alho, limão, pimenta, páprica e azeite.', 'Distribua as batatas e a cebola ao redor do frango.', 'Asse em forno médio-alto até dourar e cozinhar completamente.'], ARRAY['Vire as batatas na metade do tempo para dourarem por igual.']),
  ('recipe:r18', 'Galinhada', 'cat:receita:ave', 60, 6, 'Médio', 'https://images.pexels.com/photos/34442368/pexels-photo-34442368.jpeg?auto=compress&cs=tinysrgb&w=1200&h=800&fit=crop', false, ARRAY['Água quente', 'Colorau ou açafrão-da-terra', 'Cheiro-verde'], ARRAY['Doure os pedaços de frango em uma panela grande.', 'Adicione cebola, alho, tomate e colorau.', 'Junte o arroz e refogue por alguns minutos.', 'Acrescente água quente e cozinhe em fogo baixo.', 'Quando o arroz estiver quase pronto, misture o milho.', 'Finalize com cheiro-verde.'], ARRAY['Mantenha o fogo baixo após adicionar a água para o arroz cozinhar por igual.']),
  ('recipe:r19', 'Frango Xadrez', 'cat:receita:ave', 35, 5, 'Fácil', 'https://images.pexels.com/photos/29917214/pexels-photo-29917214.jpeg?auto=compress&cs=tinysrgb&w=1200&h=800&fit=crop', false, ARRAY['Óleo', 'Gengibre opcional', 'Água'], ARRAY['Prepare o arroz.', 'Doure as tiras de frango em fogo alto.', 'Acrescente o pimentão e a cebola e salteie.', 'Misture o shoyu com água e amido.', 'Despeje na panela e cozinhe até o molho engrossar.', 'Sirva com o arroz.'], ARRAY['Mantenha os legumes levemente crocantes.']),
  ('recipe:r20', 'Filé de Frango à Parmegiana', 'cat:receita:ave', 50, 5, 'Médio', 'https://images.pexels.com/photos/34902480/pexels-photo-34902480.jpeg?auto=compress&cs=tinysrgb&w=1200&h=800&fit=crop', true, ARRAY['Sal a gosto', 'Pimenta-do-reino a gosto', 'Óleo para fritar ou assar'], ARRAY['Tempere os filés.', 'Passe cada filé nos ovos batidos e na farinha de rosca.', 'Frite ou asse até dourar.', 'Cubra com molho sugo e mussarela.', 'Leve ao forno até o queijo derreter.', 'Sirva com arroz.'], ARRAY['Para uma versão mais leve, asse os filés sobre uma grade untada.']),
  ('recipe:r21', 'Iscas de Frango Empanadas com Fritas', 'cat:receita:ave', 25, 4, 'Fácil', 'https://images.pexels.com/photos/14950910/pexels-photo-14950910.jpeg?auto=compress&cs=tinysrgb&w=1200&h=800&fit=crop', false, ARRAY['Limão para servir'], ARRAY['Asse ou prepare as iscas de frango na air fryer até ficarem crocantes.', 'Prepare as batatas até dourarem.', 'Misture ketchup e maionese para um molho rápido.', 'Sirva com limão.'], ARRAY['Não sobreponha as iscas na air fryer.']),
  ('recipe:r22', 'Tilápia Grelhada com Arroz e Legumes', 'cat:receita:peixe', 30, 4, 'Fácil', 'https://images.pexels.com/photos/11388099/pexels-photo-11388099.jpeg?auto=compress&cs=tinysrgb&w=1200&h=800&fit=crop', false, ARRAY['Sal a gosto', 'Pimenta-do-reino a gosto', 'Azeite'], ARRAY['Prepare o arroz.', 'Tempere a tilápia com limão, sal e pimenta.', 'Grelhe os filés em frigideira antiaderente.', 'Salteie os legumes com azeite.', 'Sirva imediatamente.'], ARRAY['Seque os filés antes de grelhar para obter uma superfície mais dourada.']),
  ('recipe:r23', 'Tilápia Assada com Batatas', 'cat:receita:peixe', 50, 5, 'Fácil', 'https://images.pexels.com/photos/19239119/pexels-photo-19239119.jpeg?auto=compress&cs=tinysrgb&w=1200&h=800&fit=crop', false, ARRAY['Sal a gosto', 'Pimenta-do-reino a gosto', 'Azeite', 'Ervas frescas'], ARRAY['Cozinhe as batatas por poucos minutos para pré-amaciar.', 'Monte uma assadeira com batata, cebola e tomate.', 'Tempere a tilápia com limão, sal e pimenta.', 'Coloque os filés sobre os legumes e regue com azeite.', 'Asse até o peixe ficar opaco e macio.'], ARRAY['Evite assar demais para a tilápia não ressecar.']),
  ('recipe:r24', 'Salmão ao Forno com Batatas', 'cat:receita:peixe', 40, 4, 'Fácil', 'https://images.pexels.com/photos/5741440/pexels-photo-5741440.jpeg?auto=compress&cs=tinysrgb&w=1200&h=800&fit=crop', true, ARRAY['Sal a gosto', 'Pimenta-do-reino a gosto', 'Alecrim ou dill'], ARRAY['Corte as batatas e cozinhe por alguns minutos.', 'Disponha o salmão e as batatas em uma assadeira.', 'Tempere com limão, sal, pimenta e ervas.', 'Distribua pequenos pedaços de manteiga.', 'Asse até o salmão ficar macio e as batatas douradas.'], ARRAY['O centro do salmão deve permanecer úmido.']),
  ('recipe:r25', 'Moqueca de Peixe com Camarão', 'cat:receita:peixe', 55, 6, 'Médio', 'https://images.pexels.com/photos/32252190/pexels-photo-32252190.jpeg?auto=compress&cs=tinysrgb&w=1200&h=800&fit=crop', true, ARRAY['Sal a gosto', 'Coentro', 'Azeite de dendê opcional'], ARRAY['Tempere o peixe com limão e sal.', 'Faça camadas de cebola, tomate, pimentão e peixe em uma panela.', 'Adicione o leite de coco e cozinhe com a panela tampada.', 'Junte o camarão nos minutos finais para não passar do ponto.', 'Finalize com coentro e dendê, se desejar.', 'Sirva com arroz.'], ARRAY['Como o camarão é pré-cozido, adicione-o apenas no final.']),
  ('recipe:r26', 'Hot Dog Completo', 'cat:receita:lanches', 25, 5, 'Fácil', 'https://images.pexels.com/photos/36863584/pexels-photo-36863584.jpeg?auto=compress&cs=tinysrgb&w=1200&h=800&fit=crop', false, ARRAY['Sal a gosto', 'Milho ou ervilha opcional'], ARRAY['Aqueça as salsichas em água quente.', 'Refogue a cebola e acrescente o molho sugo.', 'Junte as salsichas ao molho e cozinhe por alguns minutos.', 'Monte os pães com salsicha, molho, ketchup e mostarda.', 'Finalize com batata palha.'], ARRAY['Não ferva as salsichas por muito tempo para evitar que estourem.']),
  ('recipe:r27', 'Hambúrguer com Cheddar e Fritas', 'cat:receita:lanches', 30, 4, 'Fácil', 'https://images.pexels.com/photos/12325079/pexels-photo-12325079.jpeg?auto=compress&cs=tinysrgb&w=1200&h=800&fit=crop', true, ARRAY['Sal a gosto', 'Pimenta-do-reino a gosto'], ARRAY['Prepare as batatas.', 'Grelhe os hambúrgueres em frigideira bem quente.', 'Coloque o cheddar sobre a carne e tampe para derreter.', 'Toste rapidamente os pães.', 'Monte com maionese, alface, tomate, hambúrguer, cheddar, cebola e ketchup.', 'Sirva com as fritas.'], ARRAY['Não pressione o hambúrguer durante o preparo para preservar os sucos.']),
  ('recipe:r28', 'Churrasco Misto Swift', 'cat:receita:mista', 65, 8, 'Médio', 'https://images.pexels.com/photos/37164010/pexels-photo-37164010.jpeg?auto=compress&cs=tinysrgb&w=1200&h=800&fit=crop', true, ARRAY['Carvão para churrasqueira', 'Vinagrete', 'Limão para o frango'], ARRAY['Acenda a churrasqueira e aguarde a formação da brasa.', 'Comece pela linguiça e pelo frango, que precisam cozinhar completamente.', 'Tempere a picanha com sal grosso e leve à grelha.', 'Asse os pães de alho nos minutos finais.', 'Fatie as carnes e sirva com farofa e vinagrete.'], ARRAY['Use áreas de calor diferente na churrasqueira para controlar o ponto de cada proteína.']);

-- ---- recipe_ingredients (data.js DEFAULT_RECIPES[*].ingredientes) ----
insert into seed_recipe_ingredients (recipe_seed_key, product_seed_key, quantity, sort_order) values
  ('recipe:r1', 'product:p1', 2, 0),
  ('recipe:r1', 'product:p30', 1, 1),
  ('recipe:r1', 'product:p34', 0.5, 2),
  ('recipe:r1', 'product:p25', 0.5, 3),
  ('recipe:r2', 'product:p2', 2, 0),
  ('recipe:r2', 'product:p37', 0.8, 1),
  ('recipe:r2', 'product:p38', 0.3, 2),
  ('recipe:r2', 'product:p30', 1, 3),
  ('recipe:r2', 'product:p29', 0.1, 4),
  ('recipe:r2', 'product:p32', 1, 5),
  ('recipe:r3', 'product:p3', 2, 0),
  ('recipe:r3', 'product:p43', 2, 1),
  ('recipe:r3', 'product:p30', 1, 2),
  ('recipe:r3', 'product:p32', 0.5, 3),
  ('recipe:r3', 'product:p34', 0.5, 4),
  ('recipe:r3', 'product:p52', 1, 5),
  ('recipe:r4', 'product:p4', 2, 0),
  ('recipe:r4', 'product:p42', 1.2, 1),
  ('recipe:r4', 'product:p44', 1, 2),
  ('recipe:r4', 'product:p27', 1, 3),
  ('recipe:r4', 'product:p30', 1, 4),
  ('recipe:r4', 'product:p29', 0.1, 5),
  ('recipe:r4', 'product:p32', 0.5, 6),
  ('recipe:r5', 'product:p5', 1, 0),
  ('recipe:r5', 'product:p36', 1, 1),
  ('recipe:r5', 'product:p32', 2, 2),
  ('recipe:r5', 'product:p30', 0.5, 3),
  ('recipe:r5', 'product:p54', 1, 4),
  ('recipe:r6', 'product:p6', 1, 0),
  ('recipe:r6', 'product:p32', 2, 1),
  ('recipe:r6', 'product:p37', 1, 2),
  ('recipe:r6', 'product:p55', 0.3, 3),
  ('recipe:r6', 'product:p56', 0.5, 4),
  ('recipe:r6', 'product:p30', 0.5, 5),
  ('recipe:r7', 'product:p8', 1.3, 0),
  ('recipe:r7', 'product:p63', 0.2, 1),
  ('recipe:r7', 'product:p26', 1, 2),
  ('recipe:r7', 'product:p53', 1, 3),
  ('recipe:r8', 'product:p9', 1, 0),
  ('recipe:r8', 'product:p30', 1, 1),
  ('recipe:r8', 'product:p34', 0.5, 2),
  ('recipe:r8', 'product:p40', 0.2, 3),
  ('recipe:r9', 'product:p10', 1.2, 0),
  ('recipe:r9', 'product:p37', 1, 1),
  ('recipe:r9', 'product:p30', 1, 2),
  ('recipe:r9', 'product:p29', 0.1, 3),
  ('recipe:r9', 'product:p40', 0.2, 4),
  ('recipe:r10', 'product:p11', 1.5, 0),
  ('recipe:r10', 'product:p46', 1, 1),
  ('recipe:r10', 'product:p37', 1, 2),
  ('recipe:r10', 'product:p29', 0.1, 3),
  ('recipe:r11', 'product:p14', 1, 0),
  ('recipe:r11', 'product:p30', 1, 1),
  ('recipe:r11', 'product:p51', 1, 2),
  ('recipe:r12', 'product:p35', 1, 0),
  ('recipe:r12', 'product:p14', 1, 1),
  ('recipe:r12', 'product:p13', 1, 2),
  ('recipe:r12', 'product:p11', 0.8, 3),
  ('recipe:r12', 'product:p30', 1, 4),
  ('recipe:r12', 'product:p29', 0.15, 5),
  ('recipe:r12', 'product:p53', 1, 6),
  ('recipe:r12', 'product:p34', 0.8, 7),
  ('recipe:r13', 'product:p12', 1.2, 0),
  ('recipe:r13', 'product:p51', 1, 1),
  ('recipe:r13', 'product:p30', 1, 2),
  ('recipe:r13', 'product:p39', 0.3, 3),
  ('recipe:r13', 'product:p32', 1, 4),
  ('recipe:r14', 'product:p16', 1, 0),
  ('recipe:r14', 'product:p33', 2, 1),
  ('recipe:r14', 'product:p40', 0.2, 2),
  ('recipe:r15', 'product:p17', 1, 0),
  ('recipe:r15', 'product:p43', 2, 1),
  ('recipe:r15', 'product:p30', 1, 2),
  ('recipe:r15', 'product:p32', 0.5, 3),
  ('recipe:r15', 'product:p34', 0.5, 4),
  ('recipe:r15', 'product:p52', 1, 5),
  ('recipe:r16', 'product:p17', 1, 0),
  ('recipe:r16', 'product:p44', 1, 1),
  ('recipe:r16', 'product:p43', 1, 2),
  ('recipe:r16', 'product:p45', 1, 3),
  ('recipe:r16', 'product:p27', 1, 4),
  ('recipe:r16', 'product:p52', 1, 5),
  ('recipe:r16', 'product:p30', 0.5, 6),
  ('recipe:r17', 'product:p19', 1, 0),
  ('recipe:r17', 'product:p37', 1, 1),
  ('recipe:r17', 'product:p30', 1, 2),
  ('recipe:r17', 'product:p29', 0.1, 3),
  ('recipe:r17', 'product:p40', 0.2, 4),
  ('recipe:r18', 'product:p19', 1, 0),
  ('recipe:r18', 'product:p34', 0.6, 1),
  ('recipe:r18', 'product:p30', 1, 2),
  ('recipe:r18', 'product:p29', 0.1, 3),
  ('recipe:r18', 'product:p31', 1, 4),
  ('recipe:r18', 'product:p45', 1, 5),
  ('recipe:r19', 'product:p18', 1, 0),
  ('recipe:r19', 'product:p39', 0.5, 1),
  ('recipe:r19', 'product:p30', 1, 2),
  ('recipe:r19', 'product:p58', 1, 3),
  ('recipe:r19', 'product:p59', 0.2, 4),
  ('recipe:r19', 'product:p34', 0.5, 5),
  ('recipe:r20', 'product:p16', 1, 0),
  ('recipe:r20', 'product:p48', 0.5, 1),
  ('recipe:r20', 'product:p57', 0.25, 2),
  ('recipe:r20', 'product:p32', 2, 3),
  ('recipe:r20', 'product:p27', 1, 4),
  ('recipe:r20', 'product:p34', 0.5, 5),
  ('recipe:r21', 'product:p20', 1, 0),
  ('recipe:r21', 'product:p25', 0.5, 1),
  ('recipe:r21', 'product:p60', 0.2, 2),
  ('recipe:r21', 'product:p62', 0.2, 3),
  ('recipe:r22', 'product:p21', 2, 0),
  ('recipe:r22', 'product:p34', 0.5, 1),
  ('recipe:r22', 'product:p33', 1, 2),
  ('recipe:r22', 'product:p40', 0.2, 3),
  ('recipe:r23', 'product:p21', 2, 0),
  ('recipe:r23', 'product:p37', 0.8, 1),
  ('recipe:r23', 'product:p30', 1, 2),
  ('recipe:r23', 'product:p31', 1, 3),
  ('recipe:r23', 'product:p40', 0.2, 4),
  ('recipe:r24', 'product:p22', 1, 0),
  ('recipe:r24', 'product:p37', 0.8, 1),
  ('recipe:r24', 'product:p40', 0.2, 2),
  ('recipe:r24', 'product:p56', 0.3, 3),
  ('recipe:r25', 'product:p24', 1, 0),
  ('recipe:r25', 'product:p23', 1, 1),
  ('recipe:r25', 'product:p31', 2, 2),
  ('recipe:r25', 'product:p30', 1, 3),
  ('recipe:r25', 'product:p39', 0.5, 4),
  ('recipe:r25', 'product:p47', 1, 5),
  ('recipe:r25', 'product:p34', 0.5, 6),
  ('recipe:r25', 'product:p40', 0.2, 7),
  ('recipe:r26', 'product:p15', 1, 0),
  ('recipe:r26', 'product:p50', 1, 1),
  ('recipe:r26', 'product:p32', 1, 2),
  ('recipe:r26', 'product:p30', 0.5, 3),
  ('recipe:r26', 'product:p52', 1, 4),
  ('recipe:r26', 'product:p60', 0.2, 5),
  ('recipe:r26', 'product:p61', 0.2, 6),
  ('recipe:r27', 'product:p7', 4, 0),
  ('recipe:r27', 'product:p49', 1, 1),
  ('recipe:r27', 'product:p28', 1, 2),
  ('recipe:r27', 'product:p25', 0.5, 3),
  ('recipe:r27', 'product:p30', 0.5, 4),
  ('recipe:r27', 'product:p41', 1, 5),
  ('recipe:r27', 'product:p31', 1, 6),
  ('recipe:r27', 'product:p60', 0.2, 7),
  ('recipe:r27', 'product:p62', 0.2, 8),
  ('recipe:r28', 'product:p8', 1.2, 0),
  ('recipe:r28', 'product:p14', 1, 1),
  ('recipe:r28', 'product:p19', 1, 2),
  ('recipe:r28', 'product:p26', 2, 3),
  ('recipe:r28', 'product:p53', 1, 4),
  ('recipe:r28', 'product:p63', 0.2, 5);

-- ---- recipe_categories / section tags (data.js DEFAULT_RECIPES[*].tags,
--      excluding 'destaque' — that tag maps to recipes.featured, not a
--      recipe_categories row) ----
insert into seed_recipe_categories (recipe_seed_key, category_seed_key, sort_order) values
  ('recipe:r1', 'cat:secao:recomendado', 0),
  ('recipe:r1', 'cat:secao:pratico', 1),
  ('recipe:r2', 'cat:secao:recomendado', 0),
  ('recipe:r2', 'cat:secao:ocasiao', 1),
  ('recipe:r3', 'cat:secao:recomendado', 0),
  ('recipe:r3', 'cat:secao:pratico', 1),
  ('recipe:r3', 'cat:secao:rapido', 2),
  ('recipe:r4', 'cat:secao:recomendado', 0),
  ('recipe:r4', 'cat:secao:ocasiao', 1),
  ('recipe:r5', 'cat:secao:pratico', 0),
  ('recipe:r5', 'cat:secao:rapido', 1),
  ('recipe:r5', 'cat:secao:recomendado', 2),
  ('recipe:r6', 'cat:secao:recomendado', 0),
  ('recipe:r6', 'cat:secao:pratico', 1),
  ('recipe:r7', 'cat:secao:ocasiao', 0),
  ('recipe:r7', 'cat:secao:churrasco', 1),
  ('recipe:r8', 'cat:secao:pratico', 0),
  ('recipe:r8', 'cat:secao:rapido', 1),
  ('recipe:r9', 'cat:secao:ocasiao', 0),
  ('recipe:r9', 'cat:secao:recomendado', 1),
  ('recipe:r10', 'cat:secao:ocasiao', 0),
  ('recipe:r11', 'cat:secao:pratico', 0),
  ('recipe:r11', 'cat:secao:rapido', 1),
  ('recipe:r11', 'cat:secao:petisco', 2),
  ('recipe:r12', 'cat:secao:ocasiao', 0),
  ('recipe:r13', 'cat:secao:recomendado', 0),
  ('recipe:r13', 'cat:secao:ocasiao', 1),
  ('recipe:r14', 'cat:secao:pratico', 0),
  ('recipe:r14', 'cat:secao:rapido', 1),
  ('recipe:r14', 'cat:secao:recomendado', 2),
  ('recipe:r15', 'cat:secao:recomendado', 0),
  ('recipe:r15', 'cat:secao:pratico', 1),
  ('recipe:r15', 'cat:secao:rapido', 2),
  ('recipe:r16', 'cat:secao:recomendado', 0),
  ('recipe:r16', 'cat:secao:ocasiao', 1),
  ('recipe:r17', 'cat:secao:recomendado', 0),
  ('recipe:r17', 'cat:secao:ocasiao', 1),
  ('recipe:r18', 'cat:secao:recomendado', 0),
  ('recipe:r18', 'cat:secao:ocasiao', 1),
  ('recipe:r19', 'cat:secao:pratico', 0),
  ('recipe:r19', 'cat:secao:rapido', 1),
  ('recipe:r20', 'cat:secao:recomendado', 0),
  ('recipe:r21', 'cat:secao:rapido', 0),
  ('recipe:r21', 'cat:secao:pratico', 1),
  ('recipe:r21', 'cat:secao:petisco', 2),
  ('recipe:r22', 'cat:secao:pratico', 0),
  ('recipe:r22', 'cat:secao:rapido', 1),
  ('recipe:r22', 'cat:secao:recomendado', 2),
  ('recipe:r23', 'cat:secao:recomendado', 0),
  ('recipe:r23', 'cat:secao:ocasiao', 1),
  ('recipe:r24', 'cat:secao:ocasiao', 0),
  ('recipe:r25', 'cat:secao:ocasiao', 0),
  ('recipe:r26', 'cat:secao:rapido', 0),
  ('recipe:r26', 'cat:secao:pratico', 1),
  ('recipe:r26', 'cat:secao:recomendado', 2),
  ('recipe:r27', 'cat:secao:rapido', 0),
  ('recipe:r27', 'cat:secao:pratico', 1),
  ('recipe:r28', 'cat:secao:ocasiao', 0),
  ('recipe:r28', 'cat:secao:churrasco', 1);

-- =========================================================================
-- 2. Insert categories (proteina -> receita -> secao, per seed_categories'
--    own insertion order above) — insert-if-missing-by-seed_key only. Never
--    touches any existing scope='site' category, including one that shares
--    a seed row's name (dedup key is seed_key, never name).
-- =========================================================================
insert into public.categories (scope, owner_id, type, name, sort_order, active, seed_key)
select 'site', null, sc.type, sc.name, sc.sort_order, true, sc.seed_key
from seed_categories sc
where not exists (
  select 1 from public.categories c where c.scope = 'site' and c.seed_key = sc.seed_key
)
order by sc.type, sc.sort_order;

-- =========================================================================
-- 3. Insert products — category_id resolved from the just-seeded (or
--    already-existing) proteina category via seed_key, never a hardcoded
--    uuid.
-- =========================================================================
insert into public.products (scope, owner_id, name, category_id, unit, price, active, seed_key)
select 'site', null, sp.name, cat.id, sp.unit, sp.price, true, sp.seed_key
from seed_products sp
join public.categories cat on cat.scope = 'site' and cat.seed_key = sp.category_seed_key
where not exists (
  select 1 from public.products p where p.scope = 'site' and p.seed_key = sp.seed_key
);

-- =========================================================================
-- 4. Insert recipes — category_id resolved from the just-seeded receita
--    category via seed_key. status='published' for every seeded recipe;
--    published_at is set automatically by 006's set_recipe_published_at
--    trigger (never supplied here). legacy_id is this table's seed
--    identity key (see section 0's comment for why legacy_id specifically).
-- =========================================================================
insert into public.recipes (
  scope, owner_id, status, name, category_id, prep_time, servings, difficulty,
  image_url, featured, extras, instructions, tips, legacy_id
)
select
  'site', null, 'published', sr.name, cat.id, sr.prep_time, sr.servings, sr.difficulty,
  sr.image_url, sr.featured, sr.extras, sr.instructions, sr.tips, sr.seed_key
from seed_recipes sr
join public.categories cat on cat.scope = 'site' and cat.seed_key = sr.category_seed_key
where not exists (
  select 1 from public.recipes r where r.scope = 'site' and r.legacy_id = sr.seed_key
);

-- =========================================================================
-- 5. Insert recipe_ingredients — recipe_id/product_id resolved from the
--    just-seeded rows via recipes.legacy_id / products.seed_key. Guarded
--    against re-running this migration by checking for an existing
--    (recipe_id, product_id) pair rather than a synthetic key, since
--    recipe_ingredients has no id-free natural key of its own beyond that
--    pair for a given recipe (quantity could theoretically change if this
--    file were ever hand-edited, but re-running the *unmodified* file is
--    exactly the idempotency case this guards).
-- =========================================================================
insert into public.recipe_ingredients (recipe_id, product_id, quantity, sort_order)
select rec.id, prod.id, sri.quantity, sri.sort_order
from seed_recipe_ingredients sri
join public.recipes rec on rec.scope = 'site' and rec.legacy_id = sri.recipe_seed_key
join public.products prod on prod.scope = 'site' and prod.seed_key = sri.product_seed_key
where not exists (
  select 1 from public.recipe_ingredients ri
  where ri.recipe_id = rec.id and ri.product_id = prod.id
);

-- =========================================================================
-- 6. Insert recipe_categories (section tags) — recipe_id/category_id
--    resolved the same way. Guarded the same way (existing (recipe_id,
--    category_id) pair, which is also this table's actual primary key —
--    see supabase/004_catalog_schema.sql).
-- =========================================================================
insert into public.recipe_categories (recipe_id, category_id, sort_order)
select rec.id, cat.id, src.sort_order
from seed_recipe_categories src
join public.recipes rec on rec.scope = 'site' and rec.legacy_id = src.recipe_seed_key
join public.categories cat on cat.scope = 'site' and cat.seed_key = src.category_seed_key
where not exists (
  select 1 from public.recipe_categories rc
  where rc.recipe_id = rec.id and rc.category_id = cat.id
);

commit;
