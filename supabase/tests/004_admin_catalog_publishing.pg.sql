-- pgTAP tests for supabase/006_admin_catalog_publishing.sql.
-- Run against a local Postgres with supabase/tests/000_local_harness.sql,
-- supabase/schema.sql, supabase/002_..._phase1.sql, supabase/004_..._schema.sql
-- and supabase/005_creation_mode_sharing.sql already applied.
-- Never run against a real Supabase project.
begin;
select plan(20);

select test.act_as(null, null);
insert into auth.users (id, raw_user_meta_data) values
  ('40000000-0000-0000-0000-000000000001', jsonb_build_object('display_name', 'Site Admin')),
  ('40000000-0000-0000-0000-000000000002', jsonb_build_object('display_name', 'Plain User'));
update public.profiles set role = 'admin' where id = '40000000-0000-0000-0000-000000000001';

\set admin1 '''40000000-0000-0000-0000-000000000001'''
\set user1 '''40000000-0000-0000-0000-000000000002'''

-- ---------------------------------------------------------------------
-- A plain authenticated user has no path at all to write scope='site'
-- rows — this is the actual root-cause bug this migration fixes: before
-- it, this INSERT would already fail (no policy existed at all, for
-- ANYONE including admin). After it, it must still fail for a non-admin.
-- ---------------------------------------------------------------------
select test.act_as(:user1, 'authenticated');
select throws_matching(
  format($$insert into public.categories (scope, type, name, active) values ('site', 'receita', 'Categoria Invasora', true)$$),
  'row-level security policy',
  'a plain user cannot insert a scope=site category'
);

-- ---------------------------------------------------------------------
-- Admin CAN write the public catalog directly.
-- ---------------------------------------------------------------------
select test.act_as(:admin1, 'authenticated');
insert into public.categories (scope, type, name, active) values ('site', 'receita', 'Categoria Receita Pública', true)
  returning id as site_recipe_cat \gset
insert into public.categories (scope, type, name, active) values ('site', 'proteina', 'Categoria Produto Pública', true)
  returning id as site_prod_cat \gset
select ok(:'site_recipe_cat' is not null, 'admin can insert a scope=site category');

select lives_ok(
  format($$insert into public.products (scope, name, category_id, unit, price, active) values ('site', 'Produto Público', %L, 'kg', 10, true)$$, :'site_prod_cat'),
  'admin can insert a scope=site product'
);
select id as site_product from public.products where name = 'Produto Público' \gset

-- recipes_site_not_private_ck: a site recipe can never be status='private'.
-- The admin INSERT policy's own WITH CHECK (status in draft/published)
-- already blocks this for a real client — tested as superuser here
-- (bypassing RLS) to isolate and confirm the CHECK constraint itself,
-- independent of the RLS policy, actually holds.
select test.act_as(null, null);
select throws_like(
  format($$insert into public.recipes (scope, status, name, category_id, difficulty) values ('site', 'private', 'Receita Inválida', %L, 'Fácil')$$, :'site_recipe_cat'),
  '%recipes_site_not_private_ck%',
  'a scope=site recipe can never be status=private (CHECK constraint, independent of RLS)'
);
select test.act_as(:admin1, 'authenticated');
select throws_matching(
  format($$insert into public.recipes (scope, status, name, category_id, difficulty) values ('site', 'private', 'Receita Inválida 2', %L, 'Fácil')$$, :'site_recipe_cat'),
  'row-level security policy',
  'and separately, the admin INSERT policy itself never accepts status=private either'
);

-- Admin creates a draft — published_at must stay null.
insert into public.recipes (scope, status, name, category_id, difficulty)
values ('site', 'draft', 'Receita Pública Draft', :'site_recipe_cat', 'Fácil')
returning id as site_recipe_id \gset
select is(
  (select published_at from public.recipes where id = :'site_recipe_id'),
  null,
  'a freshly created draft recipe has no published_at'
);

insert into public.recipe_ingredients (recipe_id, product_id, quantity) values (:'site_recipe_id', :'site_product', 1);
select is((select count(*)::int from public.recipe_ingredients where recipe_id = :'site_recipe_id'), 1, 'admin can add an ingredient to a site recipe');

-- ---------------------------------------------------------------------
-- Visibility: draft is admin-only; published is everyone's.
-- ---------------------------------------------------------------------
select test.act_as('99999999-0000-0000-0000-000000000098', 'anon');
select is((select count(*)::int from public.recipes where id = :'site_recipe_id'), 0, 'anon cannot see a draft site recipe');

select test.act_as(:user1, 'authenticated');
select is((select count(*)::int from public.recipes where id = :'site_recipe_id'), 0, 'a plain authenticated user cannot see a draft site recipe either');

select test.act_as(:admin1, 'authenticated');
select is((select count(*)::int from public.recipes where id = :'site_recipe_id'), 1, 'admin can see their own draft site recipe (admin-select policy)');

-- Publish it — published_at gets set.
update public.recipes set status = 'published' where id = :'site_recipe_id';
select isnt(
  (select published_at from public.recipes where id = :'site_recipe_id'),
  null,
  'published_at is set automatically the moment status transitions to published'
);
select published_at as first_published_at from public.recipes where id = :'site_recipe_id' \gset

select test.act_as('99999999-0000-0000-0000-000000000098', 'anon');
select is((select count(*)::int from public.recipes where id = :'site_recipe_id'), 1, 'anon can see a published site recipe');
select test.act_as(:user1, 'authenticated');
select is((select count(*)::int from public.recipes where id = :'site_recipe_id'), 1, 'a plain authenticated user can see a published site recipe too');
select is((select count(*)::int from public.recipe_ingredients where recipe_id = :'site_recipe_id'), 1, 'a plain user can see the published recipe''s ingredients');

-- Unpublish (archive) — published_at is NOT cleared (history, not "is live now").
select test.act_as(:admin1, 'authenticated');
update public.recipes set status = 'archived' where id = :'site_recipe_id';
select is(
  (select published_at from public.recipes where id = :'site_recipe_id'),
  :'first_published_at'::timestamptz,
  'published_at is preserved (not cleared) when a recipe is archived after having been published'
);
select test.act_as('99999999-0000-0000-0000-000000000098', 'anon');
select is((select count(*)::int from public.recipes where id = :'site_recipe_id'), 0, 'anon no longer sees the recipe once it is archived');

-- Re-publishing later re-stamps published_at to the new moment.
select test.act_as(:admin1, 'authenticated');
select pg_sleep(0.01);
update public.recipes set status = 'published' where id = :'site_recipe_id';
select isnt(
  (select published_at from public.recipes where id = :'site_recipe_id'),
  :'first_published_at'::timestamptz,
  'republishing after an archive stamps a fresh published_at'
);

-- ---------------------------------------------------------------------
-- A plain user cannot write to a site recipe's ingredients/categories,
-- nor update/deactivate a public product, even though they can read it.
-- ---------------------------------------------------------------------
select test.act_as(:user1, 'authenticated');
select throws_matching(
  format($$insert into public.recipe_ingredients (recipe_id, product_id, quantity) values (%L, %L, 2)$$, :'site_recipe_id', :'site_product'),
  'row-level security policy',
  'a plain user cannot insert an ingredient into a site recipe'
);
select lives_ok(
  format($$update public.products set active = false where id = %L$$, :'site_product'),
  'a plain user''s UPDATE against a public product does not raise (RLS just matches zero rows)'
);
select test.act_as(:admin1, 'authenticated');
select is((select active from public.products where id = :'site_product'), true, 'the public product was not actually deactivated by the plain user''s no-op UPDATE');

select test.act_as(null, null);
select * from finish();
rollback;
