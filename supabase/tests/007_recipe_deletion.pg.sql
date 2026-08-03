-- pgTAP tests for supabase/009_recipe_deletion.sql.
-- Run against a local Postgres with supabase/tests/000_local_harness.sql,
-- supabase/schema.sql, supabase/002_..._phase1.sql, supabase/004_..._schema.sql,
-- supabase/005_creation_mode_sharing.sql, supabase/006_admin_catalog_publishing.sql
-- and supabase/007_change_requests.sql already applied.
-- Never run against a real Supabase project.
begin;
select plan(30);

select test.act_as(null, null);
insert into auth.users (id, raw_user_meta_data) values
  ('70000000-0000-0000-0000-000000000001', jsonb_build_object('display_name', 'Del Admin')),
  ('70000000-0000-0000-0000-000000000002', jsonb_build_object('display_name', 'Del Owner')),
  ('70000000-0000-0000-0000-000000000003', jsonb_build_object('display_name', 'Del Other')),
  ('70000000-0000-0000-0000-000000000004', jsonb_build_object('display_name', 'Del Grantee'));
update public.profiles set role = 'admin' where id = '70000000-0000-0000-0000-000000000001';

\set admin1 '''70000000-0000-0000-0000-000000000001'''
\set owner1 '''70000000-0000-0000-0000-000000000002'''
\set other1 '''70000000-0000-0000-0000-000000000003'''
\set grantee1 '''70000000-0000-0000-0000-000000000004'''

-- ---------------------------------------------------------------------
-- Fixture: owner1's personal category/product/recipe.
-- ---------------------------------------------------------------------
select test.act_as(:owner1, 'authenticated');
insert into public.categories (scope, owner_id, type, name) values ('personal', :owner1, 'receita', 'Cat Del Owner1')
  returning id as owner_cat \gset
insert into public.categories (scope, owner_id, type, name) values ('personal', :owner1, 'proteina', 'Prot Del Owner1')
  returning id as owner_prod_cat \gset
insert into public.products (scope, owner_id, name, category_id, unit, price) values ('personal', :owner1, 'Produto Del Owner1', :'owner_prod_cat', 'kg', 10)
  returning id as owner_product \gset

-- Recipe #1: no references at all — plain hard delete.
insert into public.recipes (owner_id, scope, status, name, category_id, prep_time, servings, difficulty)
  values (:owner1, 'personal', 'private', 'Receita Sem Referencias', :'owner_cat', 20, 2, 'Fácil')
  returning id as r1 \gset
insert into public.recipe_ingredients (recipe_id, product_id, quantity) values (:'r1', :'owner_product', 2);

-- Recipe #2: will get an active share + grant.
insert into public.recipes (owner_id, scope, status, name, category_id, prep_time, servings, difficulty)
  values (:owner1, 'personal', 'private', 'Receita Compartilhada', :'owner_cat', 20, 2, 'Fácil')
  returning id as r2 \gset

-- Recipe #3: will get a pending change_request. Uses a site category (not
-- owner_cat) so submit_recipe_request's personal-dependency check doesn't
-- block the fixture — this test only cares about delete_recipe's own
-- pending-request handling, not the submit-eligibility rules (already
-- covered by supabase/tests/005_change_requests.pg.sql).
select test.act_as(:admin1, 'authenticated');
insert into public.categories (scope, type, name) values ('site', 'receita', 'Cat Site Del Fixture') returning id as site_cat_fixture \gset
select test.act_as(:owner1, 'authenticated');
insert into public.recipes (owner_id, scope, status, name, category_id, prep_time, servings, difficulty)
  values (:owner1, 'personal', 'private', 'Receita Com Pedido Pendente', :'site_cat_fixture', 20, 2, 'Fácil')
  returning id as r3 \gset

-- ---------------------------------------------------------------------
-- 1. get_recipe_delete_impact on a reference-free recipe: all zero/false.
-- ---------------------------------------------------------------------
select is((select (public.get_recipe_delete_impact(:'r1'))->>'active_share')::boolean, false, 'impact: no active share on r1');
select is((select (public.get_recipe_delete_impact(:'r1'))->>'active_grant_count')::int, 0, 'impact: zero grants on r1');
select is((select (public.get_recipe_delete_impact(:'r1'))->>'pending_request_count')::int, 0, 'impact: zero pending requests on r1');
select is((select (public.get_recipe_delete_impact(:'r1'))->>'name'), 'Receita Sem Referencias', 'impact: returns recipe name');

-- ---------------------------------------------------------------------
-- 2. A non-owner cannot inspect or delete another user's personal recipe.
-- ---------------------------------------------------------------------
select test.act_as(:other1, 'authenticated');
select throws_like(
  format($$select public.get_recipe_delete_impact(%L)$$, :'r1'),
  'not_authorized',
  'a non-owner cannot call get_recipe_delete_impact on someone else''s personal recipe'
);
select throws_like(
  format($$select public.delete_recipe(%L)$$, :'r1'),
  'not_owner',
  'a non-owner cannot call delete_recipe on someone else''s personal recipe'
);

-- ---------------------------------------------------------------------
-- 3. Owner deletes recipe #1 (no references): hard-deleted, ingredient
--    row gone, product untouched.
-- ---------------------------------------------------------------------
select test.act_as(:owner1, 'authenticated');
select is((public.delete_recipe(:'r1'))->>'action', 'deleted', 'delete_recipe hard-deletes a reference-free personal recipe');
select is((select count(*) from public.recipes where id = :'r1')::int, 0, 'the recipe row is gone');
select is((select count(*) from public.recipe_ingredients where recipe_id = :'r1')::int, 0, 'its recipe_ingredients row cascaded away');
select is((select count(*) from public.products where id = :'owner_product')::int, 1, 'the referenced product itself was NOT deleted');

-- ---------------------------------------------------------------------
-- 4. Recipe #2: activate sharing + redeem a grant, then verify delete is
--    blocked until the caller explicitly asks to revoke shares.
-- ---------------------------------------------------------------------
select public.activate_recipe_sharing(:'r2') as r2_share_code \gset
select test.act_as(:grantee1, 'authenticated');
select public.redeem_recipe_share(:'r2_share_code');
select test.act_as(:owner1, 'authenticated');

select is((select (public.get_recipe_delete_impact(:'r2'))->>'active_share')::boolean, true, 'impact: r2 has an active share');
select is((select (public.get_recipe_delete_impact(:'r2'))->>'active_grant_count')::int, 1, 'impact: r2 has one active grant');

select throws_like(
  format($$select public.delete_recipe(%L)$$, :'r2'),
  'active_share_exists',
  'delete_recipe refuses to delete r2 while it has an active share, without p_revoke_shares'
);
select is((select count(*) from public.recipes where id = :'r2')::int, 1, 'r2 was not deleted by the failed attempt (transactional — no partial effect)');

select is((public.delete_recipe(:'r2', true, false))->>'action', 'deleted', 'delete_recipe deletes r2 once p_revoke_shares=true is passed');
select is((select count(*) from public.recipes where id = :'r2')::int, 0, 'r2 is gone');
-- recipe_shares/recipe_access_grants cascade-delete with the recipe row
-- itself, so there is nothing left to inspect post-delete; the revoke
-- actually happening (not just "not blocking") is proven by the fact this
-- call succeeded at all where the unrevoked attempt above raised.
select is((select count(*) from public.recipe_shares where recipe_id = :'r2')::int, 0, 'r2''s share row is gone (cascaded with the recipe)');

-- ---------------------------------------------------------------------
-- 5. Recipe #3: a pending change_request blocks delete until acknowledged.
-- ---------------------------------------------------------------------
select public.submit_recipe_request(:'r3', 'quero publicar') as r3_req_id \gset
select is((select (public.get_recipe_delete_impact(:'r3'))->>'pending_request_count')::int, 1, 'impact: r3 has one pending request');

select throws_like(
  format($$select public.delete_recipe(%L)$$, :'r3'),
  'pending_requests_exist%',
  'delete_recipe refuses to delete r3 while a change_request is pending, without p_cancel_pending_requests'
);
select is((public.delete_recipe(:'r3', false, true))->>'action', 'deleted', 'delete_recipe deletes r3 once p_cancel_pending_requests=true is passed');
select is((select status from public.change_requests where id = :'r3_req_id'), 'cancelled', 'the pending change_request was cancelled, not left dangling, as part of the same call');

-- ---------------------------------------------------------------------
-- 6. Admin site-recipe path: no history -> hard delete; history -> archive.
-- ---------------------------------------------------------------------
select test.act_as(:admin1, 'authenticated');
insert into public.categories (scope, type, name) values ('site', 'receita', 'Cat Site Del') returning id as site_cat \gset

insert into public.recipes (scope, status, name, category_id, prep_time, servings, difficulty)
  values ('site', 'draft', 'Receita Publica Sem Historico', :'site_cat', 20, 2, 'Fácil')
  returning id as site_r1 \gset
select is((public.delete_recipe(:'site_r1'))->>'action', 'deleted', 'admin hard-deletes a site recipe with zero history');
select is((select count(*) from public.recipes where id = :'site_r1')::int, 0, 'the history-free site recipe is actually gone');

insert into public.recipes (scope, status, name, category_id, prep_time, servings, difficulty, published_at)
  values ('site', 'published', 'Receita Publica Com Historico', :'site_cat', 20, 2, 'Fácil', now())
  returning id as site_r2 \gset
select is((select (public.get_recipe_delete_impact(:'site_r2'))->>'recommend_archive')::boolean, true, 'impact: a published site recipe recommends archiving');
select is((public.delete_recipe(:'site_r2'))->>'action', 'archived', 'admin archives (not hard-deletes) a site recipe that was ever published');
select is((select status from public.recipes where id = :'site_r2'), 'archived', 'the published site recipe row still exists, now status=archived');
select is((select count(*) from public.recipes where id = :'site_r2')::int, 1, 'archiving does not remove the row');

-- ---------------------------------------------------------------------
-- 7. A non-admin cannot delete/archive a site recipe.
-- ---------------------------------------------------------------------
insert into public.recipes (scope, status, name, category_id, prep_time, servings, difficulty)
  values ('site', 'draft', 'Receita Publica Protegida', :'site_cat', 20, 2, 'Fácil')
  returning id as site_r3 \gset
select test.act_as(:owner1, 'authenticated');
select throws_like(
  format($$select public.delete_recipe(%L)$$, :'site_r3'),
  'not_admin',
  'a plain user cannot delete a scope=site recipe'
);
select throws_like(
  format($$select public.get_recipe_delete_impact(%L)$$, :'site_r3'),
  'not_authorized',
  'a plain user cannot inspect delete-impact for a scope=site recipe'
);

-- ---------------------------------------------------------------------
-- 8. delete_recipe on a nonexistent recipe raises cleanly.
-- ---------------------------------------------------------------------
select test.act_as(:owner1, 'authenticated');
select throws_like(
  $$select public.delete_recipe('00000000-0000-0000-0000-000000000099')$$,
  'recipe_not_found',
  'delete_recipe raises recipe_not_found for a nonexistent id'
);

select * from finish();
rollback;
