\i supabase/tests/000_local_harness.sql
\i supabase/schema.sql
\i supabase/004_catalog_schema.sql
\i supabase/006_admin_catalog_publishing.sql
\i supabase/012_admin_import_and_home_order.sql
\i supabase/014_product_images.sql
\i supabase/018_collision_safe_import.sql

select plan(3);

insert into auth.users (id) values ('92000000-0000-0000-0000-000000000001');
update public.profiles set role = 'admin' where id = '92000000-0000-0000-0000-000000000001';
insert into public.categories (scope, owner_id, type, name, slug, active)
values ('site', null, 'proteina', 'A & B', 'ignored-by-trigger', true);
select test.act_as('92000000-0000-0000-0000-000000000001', 'authenticated');

select lives_ok(
  $$ select public.admin_import_public_catalog(
    '{"categories":"add","products":"add","recipes":"add"}'::jsonb,
    '[{"type":"proteina","name":"A B"}]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb
  ) $$,
  'a punctuation variant with the same category slug is treated as equivalent'
);
select is(
  (select count(*)::int from public.categories where scope = 'site' and type = 'proteina' and slug = 'a-b'),
  1,
  'the unique category slug still has exactly one row'
);
select is(
  (select public.admin_import_public_catalog(
    '{"categories":"add","products":"add","recipes":"add"}'::jsonb,
    '[{"type":"proteina","name":"A-B"}]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb
  )->'categories'->>'ignored'),
  '1',
  'the import summary reports the slug-equivalent category as ignored'
);

select * from finish();
