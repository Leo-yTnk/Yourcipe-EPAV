-- Yourcipe — Supabase schema for the credential auth system.
-- Review every statement before running it. Nothing here is executed
-- automatically; run this manually in the Supabase SQL Editor.
--
-- Also required, outside of SQL, in the Supabase dashboard:
--   Authentication > Providers > Email > "Confirm email" must be OFF.
--   (Credentials use a non-contactable @credential.yourcipe.local address,
--   so it can never receive a confirmation link.)
--   Authentication > Settings > Bot and Abuse Protection: enable Turnstile
--   and set the Secret Key there — never in this repository.

-- =========================================================================
-- 1. profiles — one row per auth user, holding only the authorization role.
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

-- A user may issue an UPDATE on their own row, but the trigger below
-- silently discards any attempt to change `role` unless it runs with the
-- service_role (i.e. never from the browser/PostgREST as a logged-in user).
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- No insert/delete policy for authenticated/anon: rows are only ever
-- created by the trigger below (runs as the table owner, bypassing RLS),
-- so a user can never fabricate a profile row (e.g. with role='admin').

grant select, update on public.profiles to authenticated;

-- Auto-create the profile row right after Supabase Auth creates the user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role) values (new.id, 'user');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Block self-service role escalation. auth.role() reflects the calling
-- JWT's role claim ('authenticated' for a logged-in browser user, NULL when
-- run from the SQL Editor as the postgres superuser). Only the latter is
-- allowed to change `role` — that's how the manual admin promotion below works.
create or replace function public.prevent_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and auth.role() = 'authenticated' then
    new.role := old.role;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_role_escalation on public.profiles;
create trigger trg_prevent_role_escalation
  before update on public.profiles
  for each row execute function public.prevent_role_escalation();

-- Helper used by the admin policies below.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- =========================================================================
-- 2. products / recipes — OPTIONAL, forward-looking policies only.
--
-- The app currently stores products and recipes in the browser's
-- localStorage, not in Supabase — this task did not migrate that data
-- layer. These tables/policies are prepared in advance, per your request,
-- for if/when that migration happens; the front-end does not read or
-- write them yet. Skip this section if you don't want the tables created now.
-- =========================================================================
create table if not exists public.products (
  id text primary key,
  nome text not null,
  categoria text not null,
  unidade text not null,
  preco numeric(10, 2) not null default 0,
  created_at timestamptz not null default now()
);
alter table public.products enable row level security;

create policy "products_select_all"
  on public.products for select
  using (true);
create policy "products_admin_write"
  on public.products for insert
  to authenticated
  with check (public.is_admin());
create policy "products_admin_update"
  on public.products for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
create policy "products_admin_delete"
  on public.products for delete
  to authenticated
  using (public.is_admin());

grant select on public.products to anon, authenticated;
grant insert, update, delete on public.products to authenticated;

create table if not exists public.recipes (
  id text primary key,
  nome text not null,
  categoria text not null,
  tempo integer not null default 0,
  porcoes integer not null default 0,
  dificuldade text not null,
  imagem text,
  tags jsonb not null default '[]'::jsonb,
  ingredientes jsonb not null default '[]'::jsonb,
  extras jsonb not null default '[]'::jsonb,
  modo_preparo jsonb not null default '[]'::jsonb,
  dicas jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.recipes enable row level security;

create policy "recipes_select_all"
  on public.recipes for select
  using (true);
create policy "recipes_admin_write"
  on public.recipes for insert
  to authenticated
  with check (public.is_admin());
create policy "recipes_admin_update"
  on public.recipes for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
create policy "recipes_admin_delete"
  on public.recipes for delete
  to authenticated
  using (public.is_admin());

grant select on public.recipes to anon, authenticated;
grant insert, update, delete on public.recipes to authenticated;
