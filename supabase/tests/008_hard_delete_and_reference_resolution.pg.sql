-- pgTAP tests for supabase/010_hard_delete_and_reference_resolution.sql.
-- Run against a local Postgres with supabase/tests/000_local_harness.sql,
-- supabase/schema.sql, supabase/002_..._phase1.sql, supabase/004_..._schema.sql,
-- supabase/005_creation_mode_sharing.sql, supabase/006_admin_catalog_publishing.sql,
-- supabase/007_change_requests.sql and supabase/009_recipe_deletion.sql
-- already applied.
-- Never run against a real Supabase project.
begin;
select plan(43);

select test.act_as(null, null);
insert into auth.users (id, raw_user_meta_data) values
  ('80000000-0000-0000-0000-000000000001', jsonb_build_object('display_name', 'HD Admin')),
  ('80000000-0000-0000-0000-000000000002', jsonb_build_object('display_name', 'HD Owner')),
  ('80000000-0000-0000-0000-000000000003', jsonb_build_object('display_name', 'HD Other'));
update public.profiles set role = 'admin' where id = '80000000-0000-0000-0000-000000000001';

\set admin1 '''80000000-0000-0000-0000-000000000001'''
\set owner1 '''80000000-0000-0000-0000-000000000002'''
\set other1 '''80000000-0000-0000-0000-000000000003'''

-- =========================================================================
-- Products
-- =========================================================================
select test.act_as(:owner1, 'authenticated');
insert into public.categories (scope, owner_id, type, name) values ('personal', :owner1, 'proteina', 'Prot HD Owner1')
  returning id as owner_prod_cat \gset
insert into public.categories (scope, owner_id, type, name) values ('personal', :owner1, 'receita', 'Receita Cat HD Owner1')
  returning id as owner_recipe_cat \gset

insert into public.products (scope, owner_id, name, category_id, unit, price) values ('personal', :owner1, 'Produto A', :'owner_prod_cat', 'kg', 10)
  returning id as prod_a \gset
insert into public.products (scope, owner_id, name, category_id, unit, price) values ('personal', :owner1, 'Produto B (substituto)', :'owner_prod_cat', 'kg', 12)
  returning id as prod_b \gset

-- prod_a with zero references: straight hard delete.
select is((select (public.get_product_delete_impact(:'prod_a'))->>'total_ingredient_rows')::int, 0, 'impact: prod_a has zero ingredient rows');
select is((public.delete_product_resolved(:'prod_a'))->>'action', 'deleted', 'delete_product_resolved hard-deletes a reference-free product');
select is((select count(*) from public.products where id = :'prod_a')::int, 0, 'prod_a row is gone');

-- prod_b: referenced by a recipe, must resolve before delete.
insert into public.recipes (owner_id, scope, status, name, category_id, prep_time, servings, difficulty)
  values (:owner1, 'personal', 'private', 'Receita Usa Produto B', :'owner_recipe_cat', 20, 2, 'Fácil')
  returning id as r1 \gset
insert into public.recipe_ingredients (recipe_id, product_id, quantity) values (:'r1', :'prod_b', 3)
  returning id as ri1 \gset

select is((select (public.get_product_delete_impact(:'prod_b'))->>'own_recipe_count')::int, 1, 'impact: prod_b used by 1 of owner''s own recipes');
select is((select (public.get_product_delete_impact(:'prod_b'))->>'total_ingredient_rows')::int, 1, 'impact: prod_b has 1 ingredient row');

select throws_like(
  format($$select public.delete_product_resolved(%L)$$, :'prod_b'),
  'unresolved_ingredient_references',
  'delete_product_resolved refuses to delete prod_b with an unresolved ingredient row'
);
select is((select count(*) from public.products where id = :'prod_b')::int, 1, 'prod_b was not deleted by the failed attempt');

-- Insert a second product to be substituted in.
insert into public.products (scope, owner_id, name, category_id, unit, price) values ('personal', :owner1, 'Produto C', :'owner_prod_cat', 'kg', 9)
  returning id as prod_c \gset

-- "replace" resolution: quantity/sort_order/recipe_id preserved, product_id swapped.
select public.delete_product_resolved(:'prod_b', jsonb_build_object(
  'ingredients', jsonb_build_array(jsonb_build_object('id', :'ri1', 'action', 'replace', 'replacement_product_id', :'prod_c'))
));
select is((select count(*) from public.products where id = :'prod_b')::int, 0, 'prod_b is gone after resolved delete');
select is((select product_id from public.recipe_ingredients where id = :'ri1')::text, :'prod_c', 'the ingredient row now points at prod_c');
select is((select quantity from public.recipe_ingredients where id = :'ri1')::numeric, 3::numeric, 'quantity was preserved across the substitution');

-- "remove" resolution: ingredient row deleted, product/recipe untouched.
insert into public.products (scope, owner_id, name, category_id, unit, price) values ('personal', :owner1, 'Produto D', :'owner_prod_cat', 'kg', 5)
  returning id as prod_d \gset
insert into public.recipe_ingredients (recipe_id, product_id, quantity) values (:'r1', :'prod_d', 1)
  returning id as ri2 \gset
select public.delete_product_resolved(:'prod_d', jsonb_build_object(
  'ingredients', jsonb_build_array(jsonb_build_object('id', :'ri2', 'action', 'remove'))
));
select is((select count(*) from public.recipe_ingredients where id = :'ri2')::int, 0, 'the ingredient row was removed');
select is((select count(*) from public.recipes where id = :'r1')::int, 1, 'the recipe itself is untouched by an ingredient removal');

-- A non-owner cannot inspect or delete another user's personal product.
select test.act_as(:other1, 'authenticated');
select throws_like(
  format($$select public.get_product_delete_impact(%L)$$, :'prod_c'),
  'not_authorized',
  'a non-owner cannot call get_product_delete_impact on someone else''s personal product'
);
select throws_like(
  format($$select public.delete_product_resolved(%L)$$, :'prod_c'),
  'not_owner',
  'a non-owner cannot call delete_product_resolved on someone else''s personal product'
);

-- Admin site-product path.
select test.act_as(:admin1, 'authenticated');
insert into public.categories (scope, type, name) values ('site', 'proteina', 'Prot Site HD') returning id as site_prod_cat \gset
insert into public.products (scope, name, category_id, unit, price) values ('site', 'Produto Site HD', :'site_prod_cat', 'kg', 20)
  returning id as site_prod \gset
select is((public.delete_product_resolved(:'site_prod'))->>'action', 'deleted', 'admin hard-deletes a reference-free site product');

select test.act_as(:admin1, 'authenticated');
insert into public.products (scope, name, category_id, unit, price) values ('site', 'Produto Site Protegido', :'site_prod_cat', 'kg', 20)
  returning id as site_prod2 \gset
select test.act_as(:owner1, 'authenticated');
select throws_like(
  format($$select public.delete_product_resolved(%L)$$, :'site_prod2'),
  'not_admin',
  'a plain user cannot delete a scope=site product'
);

-- A site product used by ANOTHER user's personal recipe: admin sees only a
-- count (never the recipe itself, RLS-hidden), and delete_product_resolved
-- stays blocked even with an otherwise-empty resolution, since there is no
-- row the admin could have resolved.
select test.act_as(:other1, 'authenticated');
insert into public.categories (scope, owner_id, type, name) values ('personal', :other1, 'receita', 'Receita Cat HD Other1')
  returning id as other1_recipe_cat \gset
insert into public.recipes (owner_id, scope, status, name, category_id, prep_time, servings, difficulty)
  values (:other1, 'personal', 'private', 'Receita Other1 Usa Produto Site', :'other1_recipe_cat', 15, 2, 'Fácil')
  returning id as other1_recipe \gset
insert into public.recipe_ingredients (recipe_id, product_id, quantity) values (:'other1_recipe', :'site_prod2', 2);

select test.act_as(:admin1, 'authenticated');
select is((select (public.get_product_delete_impact(:'site_prod2'))->>'foreign_personal_recipe_count')::int, 1, 'impact: site_prod2 is used by 1 OTHER user''s personal recipe');
select is((select (public.get_product_delete_impact(:'site_prod2'))->>'own_recipe_count')::int, 0, 'impact: site_prod2 is not used by the admin''s own recipes');
select throws_like(
  format($$select public.delete_product_resolved(%L)$$, :'site_prod2'),
  'unresolved_ingredient_references',
  'delete_product_resolved stays blocked by another user''s personal recipe even with an empty resolution'
);

-- =========================================================================
-- Categories
-- =========================================================================
select test.act_as(:owner1, 'authenticated');
insert into public.categories (scope, owner_id, type, name) values ('personal', :owner1, 'proteina', 'Prot HD Cat Test')
  returning id as cat_to_delete \gset
insert into public.categories (scope, owner_id, type, name) values ('personal', :owner1, 'proteina', 'Prot HD Cat Replacement')
  returning id as cat_replacement \gset
insert into public.categories (scope, owner_id, type, name) values ('personal', :owner1, 'receita', 'Receita Cat HD Cat Test')
  returning id as recipe_cat_fixture \gset

-- No references: straight hard delete.
select is((select (public.get_category_delete_impact(:'cat_to_delete'))->>'required_ref_count')::int, 0, 'impact: cat_to_delete has zero required refs');
select is((public.delete_category_resolved(:'cat_to_delete'))->>'action', 'deleted', 'delete_category_resolved hard-deletes a reference-free category');

-- Referenced category: a product and a recipe use it, plus one optional section tag.
insert into public.categories (scope, owner_id, type, name) values ('personal', :owner1, 'proteina', 'Prot HD Cat Used')
  returning id as cat_used \gset
insert into public.products (scope, owner_id, name, category_id, unit, price) values ('personal', :owner1, 'Produto Usa Cat', :'cat_used', 'kg', 8)
  returning id as prod_uses_cat \gset

insert into public.categories (scope, owner_id, type, name) values ('personal', :owner1, 'secao', 'Secao HD Cat Used')
  returning id as section_cat_used \gset
insert into public.categories (scope, owner_id, type, name) values ('personal', :owner1, 'secao', 'Secao HD Cat Replacement')
  returning id as section_cat_replacement \gset
insert into public.recipes (owner_id, scope, status, name, category_id, prep_time, servings, difficulty)
  values (:owner1, 'personal', 'private', 'Receita Usa Secao', :'recipe_cat_fixture', 20, 2, 'Fácil')
  returning id as r_section \gset
insert into public.recipe_categories (recipe_id, category_id) values (:'r_section', :'section_cat_used');

select is((select (public.get_category_delete_impact(:'cat_used'))->>'own_product_count')::int, 1, 'impact: cat_used referenced by 1 product');
select is((select (public.get_category_delete_impact(:'section_cat_used'))->>'own_section_count')::int, 1, 'impact: section_cat_used referenced by 1 recipe_categories row');

select throws_like(
  format($$select public.delete_category_resolved(%L)$$, :'cat_used'),
  'unresolved_product_references',
  'delete_category_resolved refuses to delete cat_used with an unresolved product reference'
);

-- Reject an incompatible-type replacement (receita in place of proteina).
select throws_like(
  format($$select public.delete_category_resolved(%L, jsonb_build_object('products', jsonb_build_array(jsonb_build_object('id', %L, 'replacement_category_id', %L))))$$,
    :'cat_used', :'prod_uses_cat', :'recipe_cat_fixture'),
  'replacement_category_wrong_type',
  'delete_category_resolved rejects a type-incompatible replacement category (receita for proteina)'
);
select is((select count(*) from public.categories where id = :'cat_used')::int, 1, 'cat_used was not deleted by the failed attempts');

-- Resolve with a compatible replacement.
select public.delete_category_resolved(:'cat_used', jsonb_build_object(
  'products', jsonb_build_array(jsonb_build_object('id', :'prod_uses_cat', 'replacement_category_id', :'cat_replacement'))
));
select is((select count(*) from public.categories where id = :'cat_used')::int, 0, 'cat_used is gone once its only reference was resolved');
select is((select category_id from public.products where id = :'prod_uses_cat')::text, :'cat_replacement', 'the product now points at the replacement category');

-- Optional recipe_categories reference: can be removed instead of replaced.
select public.delete_category_resolved(:'section_cat_used', jsonb_build_object(
  'sections', jsonb_build_array(jsonb_build_object('recipe_id', :'r_section', 'action', 'remove'))
));
select is((select count(*) from public.categories where id = :'section_cat_used')::int, 0, 'section_cat_used is gone once its optional reference was removed');
select is((select count(*) from public.recipe_categories where recipe_id = :'r_section')::int, 0, 'the recipe_categories row was removed, not left dangling');
select is((select count(*) from public.recipes where id = :'r_section')::int, 1, 'the recipe itself is untouched by a section removal');

-- Non-owner cannot inspect/delete another user's personal category.
select test.act_as(:other1, 'authenticated');
select throws_like(
  format($$select public.get_category_delete_impact(%L)$$, :'cat_replacement'),
  'not_authorized',
  'a non-owner cannot call get_category_delete_impact on someone else''s personal category'
);
select throws_like(
  format($$select public.delete_category_resolved(%L)$$, :'cat_replacement'),
  'not_owner',
  'a non-owner cannot call delete_category_resolved on someone else''s personal category'
);

-- Admin site-category path.
select test.act_as(:admin1, 'authenticated');
insert into public.categories (scope, type, name) values ('site', 'proteina', 'Prot Site HD Cat') returning id as site_cat \gset
select is((public.delete_category_resolved(:'site_cat'))->>'action', 'deleted', 'admin hard-deletes a reference-free site category');

select test.act_as(:admin1, 'authenticated');
insert into public.categories (scope, type, name) values ('site', 'proteina', 'Prot Site HD Cat Protegida') returning id as site_cat2 \gset
select test.act_as(:owner1, 'authenticated');
select throws_like(
  format($$select public.delete_category_resolved(%L)$$, :'site_cat2'),
  'not_admin',
  'a plain user cannot delete a scope=site category'
);

-- Nonexistent ids raise cleanly.
select test.act_as(:owner1, 'authenticated');
select throws_like(
  $$select public.get_product_delete_impact('00000000-0000-0000-0000-000000000099')$$,
  'product_not_found',
  'get_product_delete_impact raises product_not_found for a nonexistent id'
);
select throws_like(
  $$select public.get_category_delete_impact('00000000-0000-0000-0000-000000000099')$$,
  'category_not_found',
  'get_category_delete_impact raises category_not_found for a nonexistent id'
);

-- =========================================================================
-- delete_recipe_action — explicit archive-vs-delete choice for admin, even
-- when the site recipe has history (published_at set).
-- =========================================================================
select test.act_as(:admin1, 'authenticated');
insert into public.categories (scope, type, name) values ('site', 'receita', 'Cat Site Action') returning id as action_cat \gset

insert into public.recipes (scope, status, name, category_id, prep_time, servings, difficulty, published_at)
  values ('site', 'published', 'Receita Publica Acao Archive', :'action_cat', 20, 2, 'Fácil', now())
  returning id as action_r1 \gset
select is((public.delete_recipe_action(:'action_r1', 'archive'))->>'action', 'archived', 'delete_recipe_action archives a published site recipe when explicitly asked to');
select is((select status from public.recipes where id = :'action_r1'), 'archived', 'the recipe row still exists, status=archived');

insert into public.recipes (scope, status, name, category_id, prep_time, servings, difficulty, published_at)
  values ('site', 'published', 'Receita Publica Acao Delete', :'action_cat', 20, 2, 'Fácil', now())
  returning id as action_r2 \gset
select is((public.delete_recipe_action(:'action_r2', 'delete'))->>'action', 'deleted', 'delete_recipe_action hard-deletes a published site recipe when explicitly asked to, bypassing the auto-archive default');
select is((select count(*) from public.recipes where id = :'action_r2')::int, 0, 'the recipe row is actually gone, not archived');

-- A personal recipe can never be archived (no 'archived' status is valid
-- for scope='personal' — recipes_personal_requires_private_ck, 004).
select test.act_as(:owner1, 'authenticated');
insert into public.categories (scope, owner_id, type, name) values ('personal', :owner1, 'receita', 'Cat Personal Action')
  returning id as personal_action_cat \gset
insert into public.recipes (owner_id, scope, status, name, category_id, prep_time, servings, difficulty)
  values (:owner1, 'personal', 'private', 'Receita Pessoal Acao', :'personal_action_cat', 20, 2, 'Fácil')
  returning id as action_r3 \gset
select throws_like(
  format($$select public.delete_recipe_action(%L, 'archive')$$, :'action_r3'),
  'personal_recipes_cannot_be_archived',
  'delete_recipe_action refuses to archive a personal recipe'
);
select is((public.delete_recipe_action(:'action_r3', 'delete'))->>'action', 'deleted', 'delete_recipe_action still hard-deletes a personal recipe with p_action=delete');

select * from finish();
rollback;
