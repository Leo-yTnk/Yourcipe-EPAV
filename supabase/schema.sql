-- Yourcipe — Supabase schema for the credential auth system (profiles/roles only).
-- Review every statement before running it. Nothing here is executed
-- automatically; run this manually in the Supabase SQL Editor.
--
-- Also required, outside of SQL, in the Supabase dashboard:
--   Authentication > Providers > Email > "Confirm email" must be OFF,
--   PERMANENTLY, for this project. Credentials use a non-contactable
--   @credential.yourcipe.local address, which can never receive a
--   confirmation link — leaving "Confirm email" on would permanently
--   lock every signed-up credential out of the app.
--   Authentication > Settings > Bot and Abuse Protection: enable Turnstile
--   and set the Secret Key there — never in this repository.
--
-- products/recipes tables are intentionally NOT part of this file — see
-- supabase/optional_products_recipes_future.sql.

-- =========================================================================
-- profiles — one row per auth user, holding only the authorization role.
--
-- Terminology note: auth.role() (used below) is the PostgREST/JWT role
-- claim — 'anon', 'authenticated', or 'service_role' — describing WHO is
-- calling. It is a completely different thing from the profiles.role
-- column defined here ('user' / 'admin'), which is WHAT that person is
-- authorized to do inside the app. Do not confuse the two.
-- =========================================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- A user may read only their own profile. No public/anon access at all.
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

-- A user may issue an UPDATE on their own row (for future non-role columns),
-- but the trigger below unconditionally discards any attempt by a normal
-- authenticated user to change `role` — see trg_prevent_role_escalation.
-- This RLS policy alone is NOT what protects `role`; the trigger is.
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- No insert/delete policy for authenticated/anon: rows are only ever
-- created by the trigger below (SECURITY DEFINER, bypasses RLS), so a user
-- can never fabricate a profile row (e.g. with role='admin') via the API.

grant select, update on public.profiles to authenticated;

-- Auto-create the profile row right after Supabase Auth creates the user.
-- `role` is hard-coded to 'user' here — it is NEVER read from new.raw_user_meta_data
-- (i.e. never from the client-suppliable `options.data` of signUp), so a
-- crafted signUp payload cannot influence the assigned role. Idempotent via
-- ON CONFLICT, and running as SECURITY DEFINER means it cannot fail the
-- signup due to the calling user lacking table privileges.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role)
  values (new.id, 'user')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Block self-service role escalation, unconditionally, for anyone except a
-- caller authenticated as service_role. auth.role() returns:
--   'authenticated' — a normal logged-in browser user via PostgREST -> BLOCKED
--   'anon'          — not logged in (can't reach this policy anyway)      -> BLOCKED
--   NULL            — running directly in the SQL Editor as the postgres
--                      superuser (no JWT/PostgREST context)               -> ALLOWED
--   'service_role'  — an explicit service-role key (never used by this
--                      front-end; publishable/anon key only)              -> ALLOWED
-- This is a default-deny check (block unless proven to be service_role),
-- not an allow-list of what to block, so it fails safe for any JWT role
-- claim we didn't anticipate. It runs regardless of which columns a future
-- migration adds, so it keeps protecting `role` even if someone later
-- grants column-level UPDATE privileges without thinking about this.
create or replace function public.prevent_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and coalesce(auth.role(), '') <> 'service_role' then
    new.role := old.role;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_role_escalation on public.profiles;
create trigger trg_prevent_role_escalation
  before update on public.profiles
  for each row execute function public.prevent_role_escalation();

-- Manual admin promotion lives in a separate file
-- (supabase/promote_admin_example.sql) and is only ever run by hand, as the
-- postgres superuser in the SQL Editor (auth.role() IS NULL there), which is
-- exactly the one case the trigger above allows through. There is no
-- front-end path that can set role='admin'.
