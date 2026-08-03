-- pgTAP tests for supabase/004_catalog_schema.sql.
-- Run against a local Postgres with supabase/tests/000_local_harness.sql,
-- supabase/schema.sql and supabase/002_..._phase1.sql already applied.
-- Never run against a real Supabase project.
begin;
select plan(26);

-- Fixture users
select test.act_as(null, null);
insert into auth.users (id, raw_user_meta_data) values
  ('10000000-0000-0000-0000-000000000001', jsonb_build_object('display_name', 'Owner One')),
  ('10000000-0000-0000-0000-000000000002', jsonb_build_object('display_name', 'Owner Two')),
  ('10000000-0000-0000-0000-000000000003', jsonb_build_object('display_name', 'Admin User'));
update public.profiles set role = 'admin' where id = '10000000-0000-0000-0000-000000000003';

\set owner1 '''10000000-0000-0000-0000-000000000001'''
\set owner2 '''10000000-0000-0000-0000-000000000002'''
\set admin1 '''10000000-0000-0000-0000-000000000003'''

-- ---------------------------------------------------------------------
-- is_admin(): only checks the caller's own row, never recurses, never
-- takes a parameter.
-- ---------------------------------------------------------------------
select test.act_as(:admin1, 'authenticated');
select ok(public.is_admin(), 'is_admin() is true for the admin, checking only auth.uid()');

select test.act_as(:owner1, 'authenticated');
select ok(not public.is_admin(), 'is_admin() is false for a plain user');

select is(
  (select count(*)::int from pg_proc where proname = 'is_admin' and pronargs > 0),
  0,
  'is_admin() has no overload that accepts a uuid parameter (cannot check another user''s role)'
);

-- ---------------------------------------------------------------------
-- Code generation: server-assigned, unique, immutable, client value ignored.
-- ---------------------------------------------------------------------
select test.act_as(:owner1, 'authenticated');

insert into public.categories (id, scope, owner_id, type, name, category_code)
values (gen_random_uuid(), 'personal', :owner1, 'proteina', 'Bovinos Pessoal', 'CLIENT-CHOSEN-CODE')
returning category_code as owner1_cat_code \gset

select isnt(:'owner1_cat_code'::text, 'CLIENT-CHOSEN-CODE'::text, 'client-supplied category_code is ignored on INSERT');
select matches(:'owner1_cat_code'::text, '^YCT-\d{4}$', 'category_code follows the YCT-0001 pattern');

insert into public.categories (scope, owner_id, type, name)
values ('personal', :owner1, 'proteina', 'Suínos Pessoal')
returning category_code as owner1_cat_code2 \gset

select isnt(:'owner1_cat_code'::text, :'owner1_cat_code2'::text, 'two categories never receive the same code');

select throws_like(
  format($$update public.categories set category_code = 'HACKED' where category_code = %L$$, :'owner1_cat_code'),
  'category_code is immutable',
  'category_code cannot be changed by an authenticated client after creation'
);

-- ---------------------------------------------------------------------
-- Reference matrix: personal recipe -> personal category of a DIFFERENT
-- owner must be rejected; same owner is fine; public active is fine.
-- ---------------------------------------------------------------------
select test.act_as(:owner2, 'authenticated');
insert into public.categories (scope, owner_id, type, name)
values ('personal', :owner2, 'receita', 'Categoria Receita Owner2')
returning id as owner2_recipe_cat_id \gset

select test.act_as(:owner1, 'authenticated');
select throws_like(
  format($$insert into public.recipes (scope, owner_id, status, name, category_id, difficulty)
           values ('personal', %L, 'private', 'Receita Invasora', %L, 'Fácil')$$, :owner1, :'owner2_recipe_cat_id'),
  'recipes.category_id references a category outside the allowed scope%',
  'personal recipe cannot reference another owner''s personal category'
);

insert into public.categories (scope, owner_id, type, name)
values ('personal', :owner1, 'receita', 'Categoria Receita Owner1')
returning id as owner1_recipe_cat_id \gset

select lives_ok(
  format($$insert into public.recipes (scope, owner_id, status, name, category_id, difficulty)
           values ('personal', %L, 'private', 'Receita Própria', %L, 'Fácil')$$, :owner1, :'owner1_recipe_cat_id'),
  'personal recipe can reference the same owner''s own personal category'
);

-- wrong TYPE of category must also be rejected even when scope/owner is fine
insert into public.categories (scope, owner_id, type, name)
values ('personal', :owner1, 'proteina', 'Categoria Errada Tipo')
returning id as owner1_wrong_type_cat_id \gset

select throws_like(
  format($$insert into public.recipes (scope, owner_id, status, name, category_id, difficulty)
           values ('personal', %L, 'private', 'Receita Tipo Errado', %L, 'Fácil')$$, :owner1, :'owner1_wrong_type_cat_id'),
  'recipes.category_id must reference a category with type=receita',
  'recipes.category_id rejects a category whose type is not receita, even if scope/owner would be allowed'
);

-- public (site) recipe can only reference public categories, never personal
-- ones, even the admin's own. NOTE: PR 1 deliberately ships with NO
-- INSERT policy allowing scope='site' rows for `authenticated` at all
-- (admin write access to the public catalog is PR 3's job, not PR 1's) —
-- so these two inserts run as superuser (test.act_as(null,null)), the
-- direct equivalent of the SQL Editor being the only path that can write
-- scope='site' rows for now. This isolates what's actually under test here
-- (the reference-scope trigger) from a policy that doesn't exist yet.
select test.act_as(null, null);
select throws_like(
  format($$insert into public.recipes (scope, owner_id, status, name, category_id, difficulty)
           values ('site', null, 'draft', 'Receita Pública Errada', %L, 'Fácil')$$, :'owner1_recipe_cat_id'),
  'recipes.category_id references a category outside the allowed scope%',
  'a site-scope recipe cannot reference anyone''s personal category, including via admin'
);

insert into public.categories (scope, type, name)
values ('site', 'receita', 'Categoria Receita Pública')
returning id as site_recipe_cat_id \gset

select lives_ok(
  format($$insert into public.recipes (scope, owner_id, status, name, category_id, difficulty)
           values ('site', null, 'draft', 'Receita Pública', %L, 'Fácil')$$, :'site_recipe_cat_id'),
  'a site-scope recipe can reference an active public category of the right type'
);

-- ---------------------------------------------------------------------
-- recipe_ingredients: product scope/owner matrix, via the parent recipe.
-- ---------------------------------------------------------------------
select test.act_as(:owner1, 'authenticated');
insert into public.categories (scope, owner_id, type, name) values ('personal', :owner1, 'proteina', 'Prot Owner1')
returning id as owner1_prot_cat_id \gset
insert into public.products (scope, owner_id, name, category_id, unit)
values ('personal', :owner1, 'Produto Owner1', :'owner1_prot_cat_id', 'kg')
returning id as owner1_product_id \gset

select test.act_as(:owner2, 'authenticated');
insert into public.categories (scope, owner_id, type, name) values ('personal', :owner2, 'proteina', 'Prot Owner2')
returning id as owner2_prot_cat_id \gset
insert into public.products (scope, owner_id, name, category_id, unit)
values ('personal', :owner2, 'Produto Owner2', :'owner2_prot_cat_id', 'kg')
returning id as owner2_product_id \gset

select test.act_as(:owner1, 'authenticated');
select id as owner1_recipe_id from public.recipes where name = 'Receita Própria' \gset

select throws_like(
  format($$insert into public.recipe_ingredients (recipe_id, product_id, quantity)
           values (%L, %L, 1)$$, :'owner1_recipe_id', :'owner2_product_id'),
  'recipe_ingredients.product_id references a product outside the allowed scope%',
  'a personal recipe cannot use another owner''s personal product as an ingredient'
);

select lives_ok(
  format($$insert into public.recipe_ingredients (recipe_id, product_id, quantity)
           values (%L, %L, 1)$$, :'owner1_recipe_id', :'owner1_product_id'),
  'a personal recipe can use its own owner''s personal product as an ingredient'
);

-- ---------------------------------------------------------------------
-- recipe_categories: only type=secao accepted.
-- ---------------------------------------------------------------------
insert into public.categories (scope, owner_id, type, name) values ('personal', :owner1, 'secao', 'Seção Pessoal')
returning id as owner1_secao_id \gset
insert into public.categories (scope, owner_id, type, name) values ('personal', :owner1, 'proteina', 'Categoria Não Seção')
returning id as owner1_nonsecao_id \gset

select lives_ok(
  format($$insert into public.recipe_categories (recipe_id, category_id) values (%L, %L)$$, :'owner1_recipe_id', :'owner1_secao_id'),
  'recipe_categories accepts a type=secao category'
);

select throws_like(
  format($$insert into public.recipe_categories (recipe_id, category_id) values (%L, %L)$$, :'owner1_recipe_id', :'owner1_nonsecao_id'),
  'recipe_categories.category_id must reference a category with type=secao',
  'recipe_categories rejects a category whose type is not secao'
);

-- ---------------------------------------------------------------------
-- Scope/owner immutability + version/audit bookkeeping.
-- ---------------------------------------------------------------------
select is(
  (select version from public.categories where id = :'owner1_prot_cat_id'),
  1,
  'a freshly inserted row starts at version 1 regardless of client input'
);

update public.categories set name = 'Prot Owner1 renamed' where id = :'owner1_prot_cat_id';
select is(
  (select version from public.categories where id = :'owner1_prot_cat_id'),
  2,
  'version increments by exactly 1 on UPDATE, server-controlled'
);

select throws_like(
  format($$update public.categories set owner_id = %L where id = %L$$, :owner2, :'owner1_prot_cat_id'),
  'owner_id is immutable',
  'owner_id cannot be reassigned by an authenticated client'
);

select throws_like(
  format($$update public.categories set scope = 'site' where id = %L$$, :'owner1_prot_cat_id'),
  'scope is immutable',
  'a personal category can never be silently flipped to scope=site by the client'
);

-- ---------------------------------------------------------------------
-- RLS: ownership isolation between two regular users, and public read.
-- ---------------------------------------------------------------------
select test.act_as(:owner2, 'authenticated');
select is(
  (select count(*)::int from public.recipes where name = 'Receita Própria'),
  0,
  'owner2 cannot see owner1''s personal recipe via SELECT (RLS)'
);

select lives_ok(
  format($$update public.recipes set name = 'hijacked' where id = %L$$, :'owner1_recipe_id'),
  'owner2''s UPDATE against owner1''s personal recipe does not raise — RLS just matches zero rows (verified next)'
);

select test.act_as(:owner1, 'authenticated');
select is(
  (select name from public.recipes where id = :'owner1_recipe_id'),
  'Receita Própria',
  'owner1''s personal recipe name is unaffected by owner2''s attempted UPDATE'
);

select test.act_as('99999999-0000-0000-0000-000000000099', 'anon');
select is(
  (select count(*)::int from public.recipes where scope = 'site' and status = 'draft'),
  0,
  'anon cannot see a site recipe while it is still status=draft (not published)'
);

-- Same reasoning as the earlier site-scope inserts: no UPDATE policy on
-- scope='site' rows exists for `authenticated` yet either (PR 3), so this
-- publish step runs as superuser, standing in for the SQL Editor / the
-- admin RPC that PR 3 and PR 6 will introduce.
select test.act_as(null, null);
update public.recipes set status = 'published' where name = 'Receita Pública';
select is(
  (select count(*)::int from public.recipes where scope = 'site' and status = 'published'),
  1,
  'sanity: exactly one published site recipe exists after the update'
);

select test.act_as('99999999-0000-0000-0000-000000000099', 'anon');
select is(
  (select count(*)::int from public.recipes where name = 'Receita Pública'),
  1,
  'anon can see a site recipe once status=published (public read policy)'
);

select test.act_as(null, null);
select * from finish();
rollback;
