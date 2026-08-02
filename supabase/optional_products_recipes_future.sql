-- OPTIONAL / FORWARD-LOOKING — do not run this yet.
--
-- The Yourcipe app currently stores products and recipes in the browser's
-- localStorage, not in Supabase. This task did not migrate that data layer,
-- and the front-end does not read or write these tables. This file exists
-- only so the RLS shape is ready in advance, in case that migration happens
-- later. Running supabase/schema.sql does NOT create or touch anything
-- defined here — the two files are independent.
--
-- Depends on public.profiles from supabase/schema.sql (via public.is_admin()).

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
create policy "products_admin_insert"
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
create policy "recipes_admin_insert"
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
