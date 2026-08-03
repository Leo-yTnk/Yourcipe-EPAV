-- pgTAP tests for supabase/schema.sql + supabase/002_profiles_display_name_phase1.sql.
-- Run against a local Postgres with supabase/tests/000_local_harness.sql
-- already applied (see supabase/STAGING.md for the exact command). Never
-- run against a real Supabase project.
begin;
select plan(14);

-- ---------------------------------------------------------------------
-- normalize_and_validate_display_name()
-- ---------------------------------------------------------------------
select is(
  public.normalize_and_validate_display_name('  Marco   Tanaka  '),
  'Marco Tanaka',
  'trims and collapses duplicated internal whitespace'
);

select throws_ok(
  $$select public.normalize_and_validate_display_name('A')$$,
  '22023',
  null,
  'rejects a 1-character name'
);

select throws_ok(
  $$select public.normalize_and_validate_display_name('   ')$$,
  '22023',
  null,
  'rejects a name that is empty after trimming'
);

select throws_ok(
  $$select public.normalize_and_validate_display_name(repeat('a', 81))$$,
  '22023',
  null,
  'rejects a name over 80 characters'
);

select lives_ok(
  $$select public.normalize_and_validate_display_name(repeat('a', 80))$$,
  'accepts exactly 80 characters'
);

-- ---------------------------------------------------------------------
-- handle_new_user() — signup path
-- ---------------------------------------------------------------------
select test.act_as(null, null); -- superuser context, mirrors how auth.users inserts really happen

insert into auth.users (id, raw_user_meta_data)
values ('00000000-0000-0000-0000-000000000001', jsonb_build_object('display_name', '  Ana   Souza  ', 'credential', 'YCP-AAAA-BBBB'));

select is(
  (select display_name from public.profiles where id = '00000000-0000-0000-0000-000000000001'),
  'Ana Souza',
  'signup with a valid display_name in metadata is normalized and stored'
);

select is(
  (select role from public.profiles where id = '00000000-0000-0000-0000-000000000001'),
  'user',
  'role is hard-coded to user regardless of metadata'
);

-- role escalation attempt via metadata must be ignored
insert into auth.users (id, raw_user_meta_data)
values ('00000000-0000-0000-0000-000000000002', jsonb_build_object('display_name', 'Carlos Lima', 'role', 'admin'));

select is(
  (select role from public.profiles where id = '00000000-0000-0000-0000-000000000002'),
  'user',
  'role=admin smuggled in raw_user_meta_data is never honored'
);

-- invalid display_name aborts the whole signup transaction (profile row and
-- auth.users row must NOT exist) — simulated via a savepoint since a real
-- signup would roll back the whole INSERT into auth.users.
select throws_ok(
  $$insert into auth.users (id, raw_user_meta_data) values ('00000000-0000-0000-0000-000000000003', jsonb_build_object('display_name', 'A'))$$,
  '22023',
  null,
  'signup with an invalid display_name is rejected, aborting user creation'
);

select is(
  (select count(*)::int from auth.users where id = '00000000-0000-0000-0000-000000000003'),
  0,
  'no auth.users row survives a rejected display_name (transactional abort)'
);

-- metadata entirely absent -> nullable phase allows it, display_name stays NULL
insert into auth.users (id, raw_user_meta_data)
values ('00000000-0000-0000-0000-000000000004', '{}'::jsonb);

select is(
  (select display_name from public.profiles where id = '00000000-0000-0000-0000-000000000004'),
  null,
  'absent display_name key is tolerated during the nullable phase (legacy/edge callers), not rejected'
);

-- retry-loop compatibility: same displayName sent on every attempt of a
-- simulated collision retry (see signup-retry.js) must produce the same
-- normalized profile every time, never a partially-named profile.
insert into auth.users (id, raw_user_meta_data)
values ('00000000-0000-0000-0000-000000000005', jsonb_build_object('display_name', 'Retry User'));
insert into auth.users (id, raw_user_meta_data)
values ('00000000-0000-0000-0000-000000000006', jsonb_build_object('display_name', 'Retry User'));

select is(
  (select display_name from public.profiles where id = '00000000-0000-0000-0000-000000000005'),
  (select display_name from public.profiles where id = '00000000-0000-0000-0000-000000000006'),
  'two signup attempts carrying the same display_name (simulated retry) normalize identically'
);

-- ---------------------------------------------------------------------
-- self-service update (point 6) + role escalation still blocked on UPDATE
-- ---------------------------------------------------------------------
select test.act_as('00000000-0000-0000-0000-000000000001', 'authenticated');

update public.profiles set display_name = '  Ana    Maria   Souza ' where id = auth.uid();
select is(
  (select display_name from public.profiles where id = '00000000-0000-0000-0000-000000000001'),
  'Ana Maria Souza',
  'self-service display_name update is normalized the same way as signup'
);

update public.profiles set role = 'admin' where id = auth.uid();
select is(
  (select role from public.profiles where id = '00000000-0000-0000-0000-000000000001'),
  'user',
  'self-service role escalation via UPDATE is still blocked (prevent_role_escalation unaffected)'
);

select test.act_as(null, null);

select * from finish();
rollback;
