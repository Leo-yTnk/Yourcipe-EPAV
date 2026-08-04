\i supabase/tests/000_local_harness.sql
\i supabase/schema.sql
\i supabase/004_catalog_schema.sql
\i supabase/006_admin_catalog_publishing.sql
\i supabase/012_admin_import_and_home_order.sql

select plan(10);

select has_function('public', 'admin_import_public_recipes', array['text', 'jsonb'], 'admin import RPC exists');
select has_function('public', 'admin_reorder_home_sections', array['jsonb'], 'home reorder RPC exists');
select function_returns('public', 'admin_import_public_recipes', array['text', 'jsonb'], 'jsonb', 'import returns jsonb summary');
select lives_ok($$ select set_config('request.jwt.claim.sub', gen_random_uuid()::text, true) $$, 'can set a fake authenticated user');
select throws_ok($$ select public.admin_import_public_recipes('add', '[]'::jsonb) $$, '42501', null, 'common user cannot execute import');
select throws_ok($$ select public.admin_reorder_home_sections('[]'::jsonb) $$, '42501', null, 'common user cannot reorder home sections');
select isnt(position('public.is_admin()' in pg_get_functiondef('public.admin_import_public_recipes(text,jsonb)'::regprocedure)), 0, 'import checks canonical admin function');
select isnt(position('scope = ''site''' in pg_get_functiondef('public.admin_import_public_recipes(text,jsonb)'::regprocedure)), 0, 'import limits mutations to site scope');
select isnt(position('owner_id is null' in pg_get_functiondef('public.admin_import_public_recipes(text,jsonb)'::regprocedure)), 0, 'import refuses personal ownership');
select isnt(position('set search_path = ''''' in pg_get_functiondef('public.admin_import_public_recipes(text,jsonb)'::regprocedure)), 0, 'import uses locked search_path');

select * from finish();
