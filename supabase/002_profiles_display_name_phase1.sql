-- Yourcipe — profiles.display_name, PHASE 1 of 2.
-- Review every statement before running it. Safe to run in staging now.
-- DO NOT run supabase/003_profiles_display_name_phase2_not_null.sql until
-- the human operator has confirmed (see the SELECT at the bottom of this
-- file) that every existing row has a non-null display_name.
--
-- Why two phases: public.profiles already has rows in it (existing
-- credential accounts). Adding `display_name text not null` in one step
-- would either fail outright (existing rows violate NOT NULL) or force us
-- to invent a placeholder name for real people without their consent — both
-- unacceptable. So:
--   Phase 1 (this file): add the column NULLABLE, wire up validation for
--     everything written from now on, but do NOT fabricate values for
--     existing rows.
--   Human decision (outside SQL): existing accounts get their name filled in
--     either by completing it themselves at next login (the app now gates
--     on this — see app.js/template.js changes in this PR) or by a manual,
--     explicit decision recorded by a human (never invented by this script).
--   Phase 2 (supabase/003_..._not_null.sql): once zero NULLs remain, apply
--     the NOT NULL constraint. That file refuses to run (raises an
--     exception) if any NULL is still present, so it cannot be run too
--     early by mistake.
--
-- Depends on supabase/schema.sql (public.profiles, public.handle_new_user,
-- public.prevent_role_escalation) already being applied.

-- =========================================================================
-- 1. Column, nullable for now.
-- =========================================================================
alter table public.profiles
  add column if not exists display_name text;

alter table public.profiles
  add column if not exists updated_at timestamptz not null default now();

-- =========================================================================
-- 2. Shared validation/normalization, used by the signup trigger below and
--    by the future self-service "change my name" RPC (point 6 of the plan).
--    Pure function, no table access — SECURITY DEFINER is not needed and is
--    deliberately not used here per "SECURITY DEFINER only where it truly
--    needs to bypass RLS".
-- =========================================================================
create or replace function public.normalize_and_validate_display_name(p_name text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_clean text;
begin
  v_clean := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  if char_length(v_clean) < 2 or char_length(v_clean) > 80 then
    raise exception 'invalid_display_name: must be between 2 and 80 characters after trimming/collapsing whitespace'
      using errcode = '22023';
  end if;
  return v_clean;
end;
$$;

revoke execute on function public.normalize_and_validate_display_name(text) from public;
grant execute on function public.normalize_and_validate_display_name(text) to authenticated;

-- =========================================================================
-- 3. handle_new_user() — extended, not replaced in spirit. `role` remains
--    hard-coded to 'user' here and is still NEVER read from
--    new.raw_user_meta_data (see supabase/schema.sql comments — that
--    invariant does not change in this file).
--
--    display_name behavior during the nullable window (Phase 1):
--    - if raw_user_meta_data ? 'display_name' (the key is present — this is
--      the case for every signup going through the updated front-end from
--      now on, including every retry attempt of the collision-retry loop in
--      signup-retry.js, since app.js sends the same validated name on every
--      attempt): validate strictly and REJECT the whole signup (the trigger
--      raises, which aborts the INSERT into auth.users transactionally —
--      no orphaned auth user, no profile row) if it fails validation. This
--      is what keeps "cadastros novos continuam exigindo nome válido" true
--      even while the column is nullable.
--    - if the key is entirely absent (only possible for calls that bypass
--      this app's front-end, e.g. direct API usage, or legacy tooling): do
--      NOT block the signup. Insert display_name = NULL. This account will
--      be required to complete its profile at next login by the app itself
--      (see app.js `showCompleteProfileModal`), and is exactly the kind of
--      row this phased migration exists to accommodate without inventing a
--      name on someone's behalf.
--    Retry-loop compatibility: signup-retry.js retries the *same*
--    credential-generation loop, but app.js binds the same validated
--    signupDisplayName into every attemptSignUp() call — see the frontend
--    diff in this PR. So either all attempts carry the same valid name, or
--    all attempts carry none; a retry can never silently "lose" the name
--    partway through.
-- =========================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_display_name text;
begin
  if new.raw_user_meta_data ? 'display_name' then
    v_display_name := public.normalize_and_validate_display_name(new.raw_user_meta_data ->> 'display_name');
  else
    v_display_name := null;
  end if;

  insert into public.profiles (id, role, display_name)
  values (new.id, 'user', v_display_name)
  on conflict (id) do nothing;
  return new;
end;
$$;

-- =========================================================================
-- 4. Self-service display_name updates (point 6 of the plan): the existing
--    "profiles_update_own" policy from schema.sql already lets a user issue
--    an UPDATE on their own row; prevent_role_escalation already strips any
--    attempt to change `role` in that UPDATE. This trigger adds the missing
--    piece: re-validate/re-normalize display_name on every UPDATE too, not
--    only at signup, so a self-service "change my name" call can never
--    write an empty/oversized/malformed name, and always gets the
--    normalized (trimmed, collapsed) form persisted regardless of what the
--    client sent.
-- =========================================================================
create or replace function public.validate_display_name_on_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.display_name is distinct from old.display_name and new.display_name is not null then
    new.display_name := public.normalize_and_validate_display_name(new.display_name);
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_validate_display_name_on_update on public.profiles;
create trigger trg_validate_display_name_on_update
  before update on public.profiles
  for each row execute function public.validate_display_name_on_update();

-- =========================================================================
-- 5. Human checkpoint — NOT an automated backfill. Run this SELECT by hand
--    in staging (and, later, in production) before ever running
--    003_profiles_display_name_phase2_not_null.sql. It intentionally does
--    not fabricate any value.
-- =========================================================================
-- select id, created_at from public.profiles where display_name is null order by created_at;
