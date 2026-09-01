\i supabase/tests/000_local_harness.sql
\i supabase/schema.sql
\i supabase/002_profiles_display_name_phase1.sql
\i supabase/004_catalog_schema.sql
\i supabase/031_catalog_pages_and_sections.sql
\i supabase/034_public_catalog_read_without_admin_check.sql

select plan(8);

insert into auth.users (id) values
  ('95000000-0000-0000-0000-000000000001'),
  ('95000000-0000-0000-0000-000000000002');
update public.profiles
set role = 'admin'
where id = '95000000-0000-0000-0000-000000000002';
insert into public.catalog_pages (key, name, sort_order, active)
values ('preview', 'Prévia', 99, false);

select test.act_as(null, 'anon');
select throws_ok(
  $$select public.is_admin()$$,
  '42501',
  'permission denied for function is_admin',
  'anonymous users cannot call the privileged admin helper directly'
);
select lives_ok(
  $$select * from public.catalog_pages$$,
  'anonymous catalogue page reads do not invoke is_admin()'
);
select is(
  (select count(*)::integer from public.catalog_pages),
  3,
  'anonymous users see every active catalogue page'
);
select is(
  (select count(*)::integer from public.catalog_sections where active),
  (select count(*)::integer from public.catalog_sections),
  'anonymous users see active catalogue sections only'
);

select test.act_as('95000000-0000-0000-0000-000000000001', 'authenticated');
select lives_ok(
  $$select * from public.catalog_sections$$,
  'authenticated non-admin catalogue reads succeed'
);
select is(
  (select count(*)::integer from public.catalog_pages),
  3,
  'authenticated non-admin users see the public catalogue pages'
);

select test.act_as('95000000-0000-0000-0000-000000000002', 'authenticated');
select is(
  (select count(*)::integer from public.catalog_pages),
  4,
  'admins retain access to inactive catalogue pages'
);

select test.act_as(null, 'anon');
select is(
  (select count(*)::integer from public.catalog_pages),
  3,
  'anonymous users do not see inactive catalogue pages'
);

select * from finish();
