-- LOCAL TEST HARNESS ONLY — never run this against a real Supabase project
-- (staging or production). Real Supabase projects already provide the real
-- `auth` schema, the real `anon`/`authenticated`/`service_role` roles, and
-- real JWT-derived auth.uid()/auth.role(). This file exists only so the
-- migration SQL in supabase/002_*.sql, supabase/004_*.sql (and
-- supabase/schema.sql) can be exercised with pgTAP against a plain, local
-- PostgreSQL instance in CI/dev, without needing network access to a
-- Supabase project.
--
-- It stubs the minimum surface the migrations touch: auth.users,
-- auth.uid(), auth.role(), and the three PostgREST roles. auth.uid()/
-- auth.role() read from session GUCs so tests can impersonate different
-- callers with `select set_config('request.jwt.claim.sub', '<uuid>', true);`
-- and `set local role authenticated;` / `set local role anon;` /
-- `reset role;` (superuser, auth.role() IS NULL — mirrors the SQL Editor).

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function auth.uid() returns uuid
language sql stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create or replace function auth.role() returns text
language sql stable
as $$
  select nullif(current_setting('request.jwt.claim.role', true), '');
$$;

do $$
begin
  if not exists (select from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end $$;

grant usage on schema public to anon, authenticated;
grant usage on schema auth to anon, authenticated;
grant select on auth.users to anon, authenticated;

-- Helper used by tests to switch identity in one call:
--   select test.act_as('<uuid>', 'authenticated');
--   select test.act_as(null, null);  -- back to superuser / SQL Editor equivalent
create schema if not exists test;
grant usage on schema test to anon, authenticated;

create or replace function test.act_as(p_uid uuid, p_role text)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
  perform set_config('request.jwt.claim.role', coalesce(p_role, ''), true);
  if p_role is not null then
    execute format('set local role %I', p_role);
  else
    reset role;
  end if;
end;
$$;

grant execute on function test.act_as(uuid, text) to anon, authenticated;
