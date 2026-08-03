-- pgTAP tests for supabase/005_creation_mode_sharing.sql.
-- Run against a local Postgres with supabase/tests/000_local_harness.sql,
-- supabase/schema.sql, supabase/002_..._phase1.sql and
-- supabase/004_catalog_schema.sql already applied.
-- Never run against a real Supabase project.
begin;
select plan(44);

-- Fixture users
select test.act_as(null, null);
insert into auth.users (id, raw_user_meta_data) values
  ('20000000-0000-0000-0000-000000000001', jsonb_build_object('display_name', 'Owner One')),
  ('20000000-0000-0000-0000-000000000002', jsonb_build_object('display_name', 'Owner Two')),
  ('20000000-0000-0000-0000-000000000003', jsonb_build_object('display_name', 'Owner Three'));

\set owner1 '''20000000-0000-0000-0000-000000000001'''
\set owner2 '''20000000-0000-0000-0000-000000000002'''
\set owner3 '''20000000-0000-0000-0000-000000000003'''

-- ---------------------------------------------------------------------
-- Fixture data: owner1's personal recipe, with one personal ingredient
-- and one personal section tag.
-- ---------------------------------------------------------------------
select test.act_as(:owner1, 'authenticated');
insert into public.categories (scope, owner_id, type, name) values ('personal', :owner1, 'receita', 'Categoria Receita O1')
  returning id as o1_recipe_cat \gset
insert into public.categories (scope, owner_id, type, name) values ('personal', :owner1, 'proteina', 'Categoria Produto O1')
  returning id as o1_prod_cat \gset
insert into public.categories (scope, owner_id, type, name) values ('personal', :owner1, 'secao', 'Seção O1')
  returning id as o1_section_cat \gset
insert into public.products (scope, owner_id, name, category_id, unit, price)
  values ('personal', :owner1, 'Produto O1', :'o1_prod_cat', 'kg', 10.00)
  returning id as o1_product \gset
insert into public.recipes (scope, owner_id, status, name, category_id, difficulty)
  values ('personal', :owner1, 'private', 'Receita O1', :'o1_recipe_cat', 'Fácil')
  returning id as o1_recipe \gset
insert into public.recipe_ingredients (recipe_id, product_id, quantity) values (:'o1_recipe', :'o1_product', 2);
insert into public.recipe_categories (recipe_id, category_id) values (:'o1_recipe', :'o1_section_cat');

-- ---------------------------------------------------------------------
-- Sharing lifecycle: activate, share_code shape, generic error on invalid
-- code, cannot redeem your own code.
-- ---------------------------------------------------------------------
select ok(public.activate_recipe_sharing(:'o1_recipe') is not null, 'activate_recipe_sharing returns a share_code');
select public.activate_recipe_sharing(:'o1_recipe') as share_code \gset

select matches(:'share_code'::text, '^YSH-[A-Z0-9]{10}$', 'share_code follows the YSH-XXXXXXXXXX pattern');
select isnt(:'share_code'::text, (select recipe_code from public.recipes where id = :'o1_recipe'), 'share_code is never the same value as recipe_code');

select throws_like(
  $$select public.redeem_recipe_share('YSH-NOTAREALCODE')$$,
  'invalid_share_code',
  'a code that never existed returns the generic invalid_share_code error'
);

select throws_like(
  format($$select public.redeem_recipe_share(%L)$$, :'share_code'),
  'cannot_add_own_recipe',
  'the owner cannot redeem their own share code'
);

-- ---------------------------------------------------------------------
-- Isolation before redemption: owner2/owner3 cannot see the recipe, its
-- ingredients, its product, or its categories yet.
-- ---------------------------------------------------------------------
select test.act_as(:owner2, 'authenticated');
select is((select count(*)::int from public.recipes where id = :'o1_recipe'), 0, 'owner2 cannot see owner1''s recipe before redeeming');
select is((select count(*)::int from public.products where id = :'o1_product'), 0, 'owner2 cannot see owner1''s product before redeeming');

-- ---------------------------------------------------------------------
-- Redemption: owner2 redeems, gains read access to the recipe and
-- everything it currently references (live product price included).
-- ---------------------------------------------------------------------
select is(public.redeem_recipe_share(:'share_code'), :'o1_recipe'::uuid, 'redeem_recipe_share returns the recipe_id for a valid code');
select is((select count(*)::int from public.recipes where id = :'o1_recipe'), 1, 'owner2 can now see the shared recipe');
select is((select count(*)::int from public.recipe_ingredients where recipe_id = :'o1_recipe'), 1, 'owner2 can see the shared recipe''s ingredients');
select is((select price from public.products where id = :'o1_product'), 10.00, 'owner2 sees the owner''s current product price');
select is((select count(*)::int from public.recipe_categories where recipe_id = :'o1_recipe'), 1, 'owner2 can see the shared recipe''s section tags');
select is((select name from public.categories where id = :'o1_recipe_cat'), 'Categoria Receita O1', 'owner2 can see the shared recipe''s own category');

-- Redeeming again is idempotent (no duplicate active grant, no error).
select lives_ok(
  format($$select public.redeem_recipe_share(%L)$$, :'share_code'),
  'redeeming the same valid code twice does not error'
);
select is(
  (select count(*)::int from public.recipe_access_grants where recipe_id = :'o1_recipe' and grantee_id = :owner2 and revoked_at is null),
  1,
  'redeeming twice never creates a second active grant'
);

-- owner3 never redeemed and still cannot see anything.
select test.act_as(:owner3, 'authenticated');
select is((select count(*)::int from public.recipes where id = :'o1_recipe'), 0, 'owner3 (no grant) cannot see owner1''s recipe — isolation holds');

-- ---------------------------------------------------------------------
-- Read-only: owner2's UPDATE against the shared recipe matches zero rows
-- (no exception — RLS just filters it out), never mutating it.
-- ---------------------------------------------------------------------
select test.act_as(:owner2, 'authenticated');
select lives_ok(
  format($$update public.recipes set name = 'hijacked by owner2' where id = %L$$, :'o1_recipe'),
  'owner2''s UPDATE against the shared recipe does not raise'
);
select test.act_as(:owner1, 'authenticated');
select is((select name from public.recipes where id = :'o1_recipe'), 'Receita O1', 'shared read access never allows editing the original recipe');

-- ---------------------------------------------------------------------
-- Sync: owner1 changes the product price; owner2 immediately sees the new
-- price with no extra action ("o custo deve usar o preço atual").
-- ---------------------------------------------------------------------
update public.products set price = 15.50 where id = :'o1_product';
select test.act_as(:owner2, 'authenticated');
select is((select price from public.products where id = :'o1_product'), 15.50, 'owner2 sees the owner''s updated price immediately (live, not copied)');

-- ---------------------------------------------------------------------
-- Authorship: safe RPC returns only display_name, gated by the same
-- visibility rule, never a uuid/role/email.
-- ---------------------------------------------------------------------
select is(public.get_recipe_author_name(:'o1_recipe'), 'Owner One', 'owner2 (granted) sees the original author''s display_name');
select test.act_as(:owner1, 'authenticated');
select is(public.get_recipe_author_name(:'o1_recipe'), 'Owner One', 'owner1 sees their own display_name as author');
select test.act_as(:owner3, 'authenticated');
select is(public.get_recipe_author_name(:'o1_recipe'), null, 'owner3 (no access) gets null from get_recipe_author_name — no leak');

-- ---------------------------------------------------------------------
-- Copy: must resolve every foreign personal reference; server re-validates
-- independently of the client's resolutions payload.
-- ---------------------------------------------------------------------
select test.act_as(:owner2, 'authenticated');
select throws_like(
  format($$select public.create_recipe_copy(%L, '[]'::jsonb)$$, :'o1_recipe'),
  'unresolved_reference:category:%',
  'create_recipe_copy refuses to finalize with an unresolved foreign category (the recipe''s own category)'
);

-- Resolve the primary category and the section tag with "add", the
-- ingredient product with "add" too.
select public.create_recipe_copy(:'o1_recipe', jsonb_build_array(
  jsonb_build_object('ref_type', 'category', 'ref_id', :'o1_recipe_cat', 'action', 'add'),
  jsonb_build_object('ref_type', 'category', 'ref_id', :'o1_section_cat', 'action', 'add'),
  jsonb_build_object('ref_type', 'product', 'ref_id', :'o1_product', 'action', 'add')
)) as owner2_copy_id \gset

select isnt(:'owner2_copy_id'::text, null, 'create_recipe_copy returns a new recipe id');
select is((select owner_id from public.recipes where id = :'owner2_copy_id'), :owner2::uuid, 'the copy''s owner_id is the copier, not the original owner');
select is((select scope from public.recipes where id = :'owner2_copy_id'), 'personal', 'the copy is scope=personal');
select is((select status from public.recipes where id = :'owner2_copy_id'), 'private', 'the copy is status=private');
select isnt(
  (select recipe_code from public.recipes where id = :'owner2_copy_id'),
  (select recipe_code from public.recipes where id = :'o1_recipe'),
  'the copy gets its own recipe_code, distinct from the original'
);
select is(
  (select c.owner_id from public.categories c join public.recipes r on r.category_id = c.id where r.id = :'owner2_copy_id'),
  :owner2::uuid,
  'the copy''s own category was cloned into the copier''s personal categories, not left pointing at owner1''s'
);
select is(
  (select p.owner_id from public.products p join public.recipe_ingredients ri on ri.product_id = p.id where ri.recipe_id = :'owner2_copy_id'),
  :owner2::uuid,
  'the copy''s ingredient product was cloned into the copier''s personal products, not left pointing at owner1''s'
);
select is(
  (select p.price from public.products p join public.recipe_ingredients ri on ri.product_id = p.id where ri.recipe_id = :'owner2_copy_id'),
  15.50,
  'the cloned product carries over the current price at copy time'
);
select is(public.get_recipe_author_name(:'owner2_copy_id'), 'Owner Two', 'a copy shows the new owner as author, not the original');

-- ---------------------------------------------------------------------
-- "map" resolution: reuse an existing personal item instead of cloning.
-- ---------------------------------------------------------------------
insert into public.categories (scope, owner_id, type, name) values ('personal', :owner2, 'receita', 'Categoria Receita O2')
  returning id as o2_recipe_cat \gset
insert into public.categories (scope, owner_id, type, name) values ('personal', :owner2, 'proteina', 'Categoria Produto O2')
  returning id as o2_prod_cat \gset
insert into public.products (scope, owner_id, name, category_id, unit, price)
  values ('personal', :owner2, 'Produto Próprio O2', :'o2_prod_cat', 'kg', 3.00)
  returning id as o2_product \gset

select public.create_recipe_copy(:'o1_recipe', jsonb_build_array(
  jsonb_build_object('ref_type', 'category', 'ref_id', :'o1_recipe_cat', 'action', 'map', 'target_id', :'o2_recipe_cat'),
  jsonb_build_object('ref_type', 'category', 'ref_id', :'o1_section_cat', 'action', 'remove'),
  jsonb_build_object('ref_type', 'product', 'ref_id', :'o1_product', 'action', 'map', 'target_id', :'o2_product')
)) as owner2_copy2_id \gset

select is(
  (select category_id from public.recipes where id = :'owner2_copy2_id'),
  :'o2_recipe_cat'::uuid,
  '"map" reuses the target category instead of cloning a new one'
);
select is(
  (select count(*)::int from public.recipe_categories where recipe_id = :'owner2_copy2_id'),
  0,
  '"remove" drops the section tag from the copy entirely'
);
select is(
  (select product_id from public.recipe_ingredients where recipe_id = :'owner2_copy2_id'),
  :'o2_product'::uuid,
  '"map" reuses the target product instead of cloning a new one'
);

-- The recipe's own primary category can never be "removed" outright — it
-- must be added or mapped to something.
select throws_like(
  format($$select public.create_recipe_copy(%L, jsonb_build_array(jsonb_build_object('ref_type','category','ref_id',%L,'action','remove')))$$, :'o1_recipe', :'o1_recipe_cat'),
  'cannot_remove_primary_category',
  'the primary recipe category can never be resolved with "remove"'
);

-- ---------------------------------------------------------------------
-- Revocation removes shared access but never touches an independent copy.
-- ---------------------------------------------------------------------
select test.act_as(:owner1, 'authenticated');
select is(public.revoke_recipe_access(:'o1_recipe', :owner2), 1, 'revoke_recipe_access reports exactly one grant revoked');

select test.act_as(:owner2, 'authenticated');
select is((select count(*)::int from public.recipes where id = :'o1_recipe'), 0, 'after revocation, owner2 can no longer see the original shared recipe');
select is((select count(*)::int from public.recipes where id = :'owner2_copy_id'), 1, 'revocation does not remove owner2''s independent copy');
select is((select count(*)::int from public.recipe_ingredients where recipe_id = :'owner2_copy_id'), 1, 'the independent copy''s own ingredients remain intact after revocation');

-- ---------------------------------------------------------------------
-- Deactivate vs. revoke: deactivating blocks NEW redemptions but does not
-- revoke access already granted to someone else.
-- ---------------------------------------------------------------------
select test.act_as(null, null);
insert into auth.users (id, raw_user_meta_data) values ('20000000-0000-0000-0000-000000000004', jsonb_build_object('display_name', 'Owner Four'));
\set owner4 '''20000000-0000-0000-0000-000000000004'''
select test.act_as(:owner1, 'authenticated');
select public.regenerate_recipe_share_code(:'o1_recipe') as share_code2 \gset
select test.act_as(:owner4, 'authenticated');
select public.redeem_recipe_share(:'share_code2') as redeemed \gset
select is(:'redeemed'::uuid, :'o1_recipe'::uuid, 'owner4 redeems the regenerated code successfully');

select test.act_as(:owner1, 'authenticated');
select public.deactivate_recipe_sharing(:'o1_recipe');
select test.act_as(:owner4, 'authenticated');
select is((select count(*)::int from public.recipes where id = :'o1_recipe'), 1, 'deactivating sharing does not revoke access already granted');

-- A brand new user cannot redeem the now-inactive code.
select test.act_as(null, null);
insert into auth.users (id, raw_user_meta_data) values ('20000000-0000-0000-0000-000000000005', jsonb_build_object('display_name', 'Owner Five'));
\set owner5 '''20000000-0000-0000-0000-000000000005'''
select test.act_as(:owner5, 'authenticated');
select throws_like(
  format($$select public.redeem_recipe_share(%L)$$, :'share_code2'),
  'invalid_share_code',
  'a code from a deactivated share can no longer be redeemed by a new grantee'
);

-- The old (rotated-away) share_code from before regenerate_recipe_share_code
-- must also no longer work, even while sharing was active.
select throws_like(
  format($$select public.redeem_recipe_share(%L)$$, :'share_code'),
  'invalid_share_code',
  'a rotated-away share_code can never be redeemed again, even by a new user'
);

select test.act_as(null, null);
select * from finish();
rollback;
