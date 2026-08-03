-- pgTAP tests for supabase/008_seed_default_catalog.sql.
-- Run against a local Postgres with supabase/tests/000_local_harness.sql,
-- supabase/schema.sql, supabase/002_..._phase1.sql,
-- supabase/004_..._schema.sql, supabase/005_..._sharing.sql,
-- supabase/006_..._publishing.sql and supabase/007_change_requests.sql
-- already applied — but supabase/008_seed_default_catalog.sql itself NOT
-- yet applied (this file applies it, twice, as part of the test).
-- Never run against a real Supabase project.
--
-- Unlike 001-005 (which wrap their entire fixture + assertions in a single
-- `begin;...rollback;`), this file cannot do that: 008 itself is written
-- as its own `begin;...commit;` (a real migration must actually commit when
-- applied for real), and Postgres does not support nested transactions —
-- a `commit` inside an already-open transaction block ends that whole
-- block, not just an inner "sub-transaction". So this file instead:
--   1. commits a small "pre-existing admin-authored, colliding-name" fixture
--      in its own explicit begin/commit (simulating real prior admin
--      activity before 008 is ever run),
--   2. runs 008 twice via \i, each a real, separate commit (this is the
--      actual idempotency proof — run unmodified twice, assert no
--      duplicate rows), then
--   3. wraps only the (read-only) pgTAP assertions themselves in their own
--      begin;...rollback;, which is safe precisely because they mutate
--      nothing.
-- The rows this file commits in steps 1-2 are real commits against
-- yourcipe_test, exactly like running 008 for real would be. That is
-- expected and consistent with 008 being a real migration, not a fixture.

-- ---------------------------------------------------------------------
-- 0. Sanity precondition: catalog tables are actually empty of scope='site'
--    rows before we do anything (this test's premise — "runs on empty
--    catalog tables"). Fails loudly instead of silently passing on a dirty
--    database if run out of order.
-- ---------------------------------------------------------------------
do $$
declare
  v_count integer;
begin
  select count(*) into v_count from public.categories where scope = 'site';
  if v_count <> 0 then
    raise exception 'precondition failed: expected zero scope=site categories before this test, found %; run this file against a fresh yourcipe_test database (see supabase/STAGING.md)', v_count;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. Pre-existing admin-authored rows that collide BY NAME (never by
--    seed_key) with what 008 is about to seed — proves name is never used
--    as the dedup key, and that re-running 008 never touches (nor skips
--    seeding because of) a pre-existing row that merely shares a name.
--
-- The colliding *category* deliberately uses a different `type` ('secao')
-- than the seeded category it shares a name with (`type='proteina'`):
-- supabase/004_catalog_schema.sql's own `categories_site_slug_uk` unique
-- index is on (type, slug) scoped to scope='site' — a real, pre-existing
-- schema constraint that would make it structurally impossible for two
-- scope='site' categories of the SAME type to ever share a name/slug in
-- the first place (008 inserting its own proteina "Bovinos" would violate
-- that unique index outright if an admin proteina "Bovinos" already
-- existed — a real conflict, not a dedup concern this migration could or
-- should paper over). Different `type`, same `name`, is the realistic
-- collision this migration actually has to be safe against, and is
-- exactly what "name alone is not a safe dedup key" means in practice.
-- Products/recipes have no such uniqueness-by-name constraint at all, so
-- their fixtures below collide on name directly, same type included.
-- ---------------------------------------------------------------------
begin;
select test.act_as(null, null);
insert into auth.users (id, raw_user_meta_data) values
  ('60000000-0000-0000-0000-000000000001', jsonb_build_object('display_name', 'Site Admin'));
update public.profiles set role = 'admin' where id = '60000000-0000-0000-0000-000000000001';
\set admin1 '''60000000-0000-0000-0000-000000000001'''

select test.act_as(:admin1, 'authenticated');

-- Collides by name only (type differs from the seeded proteina "Bovinos").
insert into public.categories (scope, type, name, active) values ('site', 'secao', 'Bovinos', true)
  returning id as preexisting_secao_cat_id \gset

-- Non-colliding categories, used only as valid FK targets below.
insert into public.categories (scope, type, name, active) values ('site', 'proteina', 'Categoria Proteína Legada', true)
  returning id as preexisting_proteina_cat_id \gset
insert into public.categories (scope, type, name, active) values ('site', 'receita', 'Categoria Receita Legada', true)
  returning id as preexisting_receita_cat_id \gset

-- Collides by name with a seeded product.
insert into public.products (scope, name, category_id, unit, price, active)
  values ('site', 'Contra Filé Swift em Bifes 500g', :'preexisting_proteina_cat_id', 'pacote', 999.99, true)
  returning id as preexisting_prod_id \gset

-- Collides by name with a seeded recipe.
insert into public.recipes (scope, status, name, category_id, prep_time, servings, difficulty)
  values ('site', 'published', 'Bife Acebolado com Arroz e Fritas', :'preexisting_receita_cat_id', 5, 1, 'Fácil')
  returning id as preexisting_recipe_id \gset

commit;

-- ---------------------------------------------------------------------
-- 2. Apply 008 (first run) — real INSERTs, real commit, exactly as it
--    would run in staging/production.
-- ---------------------------------------------------------------------
\i supabase/008_seed_default_catalog.sql

-- Snapshot counts after the first run, in a separate session-visible table
-- (not a temp table scoped to a transaction that's about to end) so the
-- assertions transaction below can compare against them.
create table if not exists public._test_counts_after_first_run as
select
  (select count(*)::int from public.categories where scope = 'site') as categories_n,
  (select count(*)::int from public.products where scope = 'site') as products_n,
  (select count(*)::int from public.recipes where scope = 'site') as recipes_n,
  (select count(*)::int from public.recipe_ingredients) as ingredients_n,
  (select count(*)::int from public.recipe_categories) as sections_n;

-- ---------------------------------------------------------------------
-- 3. Apply 008 again (second run) — the actual idempotency proof: an
--    unmodified re-run of the same file against an already-seeded
--    database must insert zero additional rows.
-- ---------------------------------------------------------------------
\i supabase/008_seed_default_catalog.sql

-- ---------------------------------------------------------------------
-- 4. Assertions — read-only from here on, safe to wrap in begin/rollback.
-- ---------------------------------------------------------------------
begin;
select plan(34);

-- ---- Idempotency: counts after the second run exactly match the first ----
select is(
  (select count(*)::int from public.categories where scope = 'site'),
  (select categories_n from public._test_counts_after_first_run),
  'running 008 a second time does not add any new scope=site categories'
);
select is(
  (select count(*)::int from public.products where scope = 'site'),
  (select products_n from public._test_counts_after_first_run),
  'running 008 a second time does not add any new scope=site products'
);
select is(
  (select count(*)::int from public.recipes where scope = 'site'),
  (select recipes_n from public._test_counts_after_first_run),
  'running 008 a second time does not add any new scope=site recipes'
);
select is(
  (select count(*)::int from public.recipe_ingredients),
  (select ingredients_n from public._test_counts_after_first_run),
  'running 008 a second time does not add any new recipe_ingredients rows'
);
select is(
  (select count(*)::int from public.recipe_categories),
  (select sections_n from public._test_counts_after_first_run),
  'running 008 a second time does not add any new recipe_categories (section) rows'
);

-- ---- Expected seeded counts, derived from data.js (verified against the
--      actual DEFAULT_PRODUCTS/DEFAULT_RECIPES/CATEGORIAS_*/SECTION_DEFS
--      arrays: 10 proteina + 6 receita + 6 secao = 22 categories, 63
--      products, 28 recipes, 153 ingredient rows, 59 section-tag rows —
--      the 'destaque' tag is excluded, since it maps to recipes.featured,
--      not a recipe_categories row) ----
select is(
  (select count(*)::int from public.categories where scope = 'site' and seed_key is not null),
  22,
  '22 seeded categories total (10 proteina + 6 receita + 6 secao)'
);
select is(
  (select count(*)::int from public.categories where scope = 'site' and type = 'proteina' and seed_key is not null),
  10,
  '10 seeded proteina categories'
);
select is(
  (select count(*)::int from public.categories where scope = 'site' and type = 'receita' and seed_key is not null),
  6,
  '6 seeded receita categories'
);
select is(
  (select count(*)::int from public.categories where scope = 'site' and type = 'secao' and seed_key is not null),
  6,
  '6 seeded secao categories'
);
select is(
  (select count(*)::int from public.products where scope = 'site' and seed_key is not null),
  63,
  '63 seeded products'
);
select is(
  (select count(*)::int from public.recipes where scope = 'site' and legacy_id is not null),
  28,
  '28 seeded recipes'
);
select is(
  (select count(*)::int from public.recipe_ingredients ri join public.recipes r on r.id = ri.recipe_id where r.legacy_id is not null),
  153,
  '153 seeded recipe_ingredients rows'
);
select is(
  (select count(*)::int from public.recipe_categories rc join public.recipes r on r.id = rc.recipe_id where r.legacy_id is not null),
  59,
  '59 seeded recipe_categories (section tag) rows'
);

-- ---- Every seeded row is scope='site', owner_id null, and (for
--      categories/products) active=true ----
select is(
  (select count(*)::int from public.categories where scope = 'site' and seed_key is not null and (owner_id is not null or active is not true)),
  0,
  'every seeded category is scope=site, owner_id=null, active=true'
);
select is(
  (select count(*)::int from public.products where scope = 'site' and seed_key is not null and (owner_id is not null or active is not true)),
  0,
  'every seeded product is scope=site, owner_id=null, active=true'
);
select is(
  (select count(*)::int from public.recipes where scope = 'site' and legacy_id is not null and (owner_id is not null or status <> 'published')),
  0,
  'every seeded recipe is scope=site, owner_id=null, status=published'
);
select is(
  (select count(*)::int from public.recipes where scope = 'site' and legacy_id is not null and published_at is null),
  0,
  'every seeded recipe has published_at set (by 006''s trigger, not this migration)'
);

-- ---- Featured flag preserved: exactly the 11 recipes tagged 'destaque'
--      in data.js are featured=true ----
select is(
  (select count(*)::int from public.recipes where scope = 'site' and legacy_id is not null and featured = true),
  11,
  '11 seeded recipes are featured (data.js''s "destaque" tag)'
);

-- ---- Ingredients/sections preserved for a couple of spot-checked recipes ----
select is(
  (select count(*)::int
   from public.recipe_ingredients ri
   join public.recipes r on r.id = ri.recipe_id
   where r.legacy_id = 'recipe:r1'),
  4,
  'recipe:r1 (Bife Acebolado com Arroz e Fritas) has its 4 seeded ingredients'
);
select is(
  (select ri.quantity
   from public.recipe_ingredients ri
   join public.recipes r on r.id = ri.recipe_id
   join public.products p on p.id = ri.product_id
   where r.legacy_id = 'recipe:r1' and p.seed_key = 'product:p1'),
  2::numeric,
  'recipe:r1''s quantity for product:p1 (Contra Filé) is preserved as 2'
);
select is(
  (select count(*)::int
   from public.recipe_categories rc
   join public.recipes r on r.id = rc.recipe_id
   where r.legacy_id = 'recipe:r1'),
  2,
  'recipe:r1 has its 2 seeded section tags (recomendado, pratico)'
);
select is(
  (select array_agg(c.name order by rc.sort_order)
   from public.recipe_categories rc
   join public.recipes r on r.id = rc.recipe_id
   join public.categories c on c.id = rc.category_id
   where r.legacy_id = 'recipe:r1'),
  ARRAY['Recomendados', 'Práticos para o Dia a Dia'],
  'recipe:r1''s section tags are preserved in the original sort order'
);

-- ---- YCT-/YPR-/YCR- codes generated by the existing 004 triggers, never
--      supplied by 008 itself ----
select is(
  (select count(*)::int from public.categories where scope = 'site' and seed_key is not null and category_code !~ '^YCT-\d{4}$'),
  0,
  'every seeded category has a well-formed YCT-#### code'
);
select is(
  (select count(*)::int from public.products where scope = 'site' and seed_key is not null and product_code !~ '^YPR-\d{4}$'),
  0,
  'every seeded product has a well-formed YPR-#### code'
);
select is(
  (select count(*)::int from public.recipes where scope = 'site' and legacy_id is not null and recipe_code !~ '^YCR-\d{4}$'),
  0,
  'every seeded recipe has a well-formed YCR-#### code'
);

-- ---- Never touches scope='personal' rows (none exist in this test, but
--      confirm the migration's own inserts never created any) ----
select is(
  (select count(*)::int from public.categories where scope = 'personal'),
  0,
  '008 never creates any scope=personal category'
);
select is(
  (select count(*)::int from public.products where scope = 'personal'),
  0,
  '008 never creates any scope=personal product'
);
select is(
  (select count(*)::int from public.recipes where scope = 'personal'),
  0,
  '008 never creates any scope=personal recipe'
);

-- ---- The pre-existing, name-colliding admin rows from section 1 are
--      completely untouched: still exactly one row each, still their own
--      original values (999.99 price, no seed_key), and the migration
--      created its OWN separate seeded rows alongside them rather than
--      overwriting or skipping. ----
select is(
  (select count(*)::int from public.categories where scope = 'site' and name = 'Bovinos'),
  2,
  'both the pre-existing admin "Bovinos" (secao) category and the seeded "Bovinos" (proteina) category exist side by side'
);
select is(
  (select type from public.categories where scope = 'site' and name = 'Bovinos' and seed_key is null),
  'secao',
  'the pre-existing colliding-name admin category is completely untouched (still type=secao, still no seed_key)'
);
select is(
  (select price from public.products where name = 'Contra Filé Swift em Bifes 500g' and seed_key is null),
  999.99::numeric,
  'the pre-existing colliding-name admin product is completely untouched (still price 999.99, still no seed_key)'
);
select is(
  (select count(*)::int from public.products where name = 'Contra Filé Swift em Bifes 500g'),
  2,
  'both the pre-existing admin product and the seeded one (same name) exist side by side'
);
select is(
  (select count(*)::int from public.recipes where name = 'Bife Acebolado com Arroz e Fritas'),
  2,
  'both the pre-existing admin recipe and the seeded one (same name) exist side by side'
);
select is(
  (select prep_time from public.recipes where name = 'Bife Acebolado com Arroz e Fritas' and legacy_id is null),
  5,
  'the pre-existing colliding-name admin recipe is completely untouched (still prep_time 5, still no legacy_id)'
);

select finish();
rollback;

-- Cleanup of this file's own diagnostic scratch table — not part of the
-- schema, not touched by 008 itself.
drop table if exists public._test_counts_after_first_run;
