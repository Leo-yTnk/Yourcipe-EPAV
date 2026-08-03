-- Yourcipe — personal + public catalog schema (categories, products,
-- recipes, recipe_categories, recipe_ingredients). PR 1 scope only:
-- schema, code generation, integrity triggers, and RLS for personal CRUD +
-- public read. Admin write policies on scope='site' rows are added in PR 3,
-- not here. change_requests/change_request_revisions are added in PR 4.
--
-- Review every statement before running it. Idempotent — safe to re-run.
-- Depends on supabase/schema.sql and
-- supabase/002_profiles_display_name_phase1.sql already being applied.
--
-- This file supersedes supabase/optional_products_recipes_future.sql in
-- intent (that file's products/recipes shape — text PK, no owner_id, no
-- scope, no version — does not match this design and is not used). That
-- file is left in the repo only as historical context; nothing in this file
-- reads or depends on it.

-- =========================================================================
-- 0. is_admin() — STABLE, SECURITY DEFINER, no parameters, reads only the
--    caller's own row (id = auth.uid()). Deliberately has no argument, so
--    there is no way to ask "is <some other uuid> an admin" — the caller's
--    identity is baked into the query, not passed in.
--
--    Why SECURITY DEFINER here (unlike is_admin() in the old, unused
--    optional_products_recipes_future.sql, which also used it, but without
--    the search_path/grant discipline below): the safe alternative would be
--    SECURITY INVOKER, relying on the existing "profiles_select_own" RLS
--    policy (auth.uid() = id) to let the caller read their own role. That
--    would work today. But every RLS policy on every other table in this
--    file calls is_admin() as part of evaluating access to *that* table —
--    which means is_admin()'s own SELECT against profiles runs nested
--    inside another table's policy evaluation. Keeping it SECURITY DEFINER
--    with a search_path locked to '' and no parameters removes any
--    dependency on how profiles' own RLS is evaluated in that nested
--    context (now or after a future change to profiles' policies) — it is
--    a hard, independent guarantee instead of an accidental side effect of
--    another policy. This is exactly the "really needs to bypass RLS" case:
--    not to see more rows, but to make the admin check unconditionally
--    reliable regardless of nesting. See supabase/tests/002_catalog_schema.pg.sql
--    for a non-recursion test.
-- =========================================================================
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

revoke execute on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- =========================================================================
-- 1. slugify() — STABLE (honest declaration). It calls lower(), which
--    Postgres itself marks STABLE (not IMMUTABLE) because its result can
--    depend on server locale/collation. Declaring this IMMUTABLE would be
--    incorrect. That is not a problem here: slug is a stored column filled
--    by a BEFORE INSERT/UPDATE trigger (below), never used inside an index
--    expression or generated column — both of which are the only cases
--    that actually require IMMUTABLE. Uniqueness is enforced on the stored
--    column via ordinary partial unique indexes (section 3), not on
--    slugify(name) as an expression.
--
--    slug is cosmetic only: never used in any RLS policy, never used as a
--    foreign key, never used for authorization. All structural references
--    use uuid.
-- =========================================================================
-- Requires the "unaccent" extension. On Supabase this can be enabled via
-- Database > Extensions in the dashboard, or (if the role has privilege,
-- which is normally the case for the SQL Editor's role) by the statement
-- below. Installed explicitly into `public` and referenced fully-qualified
-- (public.unaccent) so this keeps working under `set search_path = ''`
-- regardless of the session's default search_path.
create extension if not exists unaccent with schema public;

create or replace function public.slugify(p_text text)
returns text
language sql
stable
set search_path = ''
as $$
  select trim(both '_' from
    regexp_replace(
      lower(public.unaccent(coalesce(p_text, ''))),
      '[^a-z0-9]+', '_', 'g'
    )
  );
$$;

-- =========================================================================
-- 2. Reference-scope matrix (point 5 of the plan). Pure function, no table
--    access, so it can honestly be IMMUTABLE (unlike slugify above) — its
--    result depends only on its arguments.
--
--    Rules:
--      referencing scope = 'site'      -> referenced item must be
--                                          scope='site' AND active/published
--      referencing scope = 'personal'  -> referenced item must be either
--                                          (scope='site' AND active) OR
--                                          (scope='personal' AND same owner)
--    i.e. a personal recipe may point at public catalog items or at the
--    same user's own personal items, but never at another user's personal
--    items; a public (site) recipe may only point at other public, active
--    items — never at anything scope='personal', regardless of owner.
-- =========================================================================
create or replace function public.validate_reference_scope(
  p_referencing_scope text,
  p_referencing_owner uuid,
  p_referenced_scope text,
  p_referenced_owner uuid,
  p_referenced_active boolean
) returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_referencing_scope = 'site' then
      p_referenced_scope = 'site' and p_referenced_active
    when p_referencing_scope = 'personal' then
      (p_referenced_scope = 'site' and p_referenced_active)
      or (p_referenced_scope = 'personal' and p_referenced_owner is not distinct from p_referencing_owner)
    else false
  end;
$$;

-- =========================================================================
-- 3. public.categories
-- =========================================================================
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  category_code text unique,
  owner_id uuid references auth.users (id) on delete cascade,
  scope text not null check (scope in ('personal', 'site')),
  type text not null check (type in ('proteina', 'secao', 'receita')),
  name text not null,
  slug text not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  constraint categories_scope_owner_ck check (
    (scope = 'personal' and owner_id is not null) or (scope = 'site' and owner_id is null)
  )
);

create unique index if not exists categories_site_slug_uk
  on public.categories (type, slug) where scope = 'site';
create unique index if not exists categories_personal_slug_uk
  on public.categories (owner_id, type, slug) where scope = 'personal';

alter table public.categories enable row level security;

-- =========================================================================
-- 4. public.products
-- =========================================================================
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  product_code text unique,
  owner_id uuid references auth.users (id) on delete cascade,
  scope text not null check (scope in ('personal', 'site')),
  name text not null,
  category_id uuid not null references public.categories (id),
  unit text not null check (unit in ('kg', 'un', 'pacote', 'caixa', 'pote')),
  price numeric(10, 2) not null default 0 check (price >= 0),
  active boolean not null default true,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  constraint products_scope_owner_ck check (
    (scope = 'personal' and owner_id is not null) or (scope = 'site' and owner_id is null)
  )
);

alter table public.products enable row level security;

-- =========================================================================
-- 5. public.recipes
-- =========================================================================
create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  recipe_code text unique,
  owner_id uuid references auth.users (id) on delete cascade,
  scope text not null check (scope in ('personal', 'site')),
  status text not null check (status in ('private', 'draft', 'published', 'archived')),
  name text not null,
  category_id uuid not null references public.categories (id),
  prep_time integer not null default 0 check (prep_time >= 0),
  servings integer not null default 0 check (servings >= 0),
  difficulty text not null check (difficulty in ('Fácil', 'Médio', 'Difícil')),
  image_url text,
  featured boolean not null default false,
  extras text[] not null default '{}',
  instructions text[] not null default '{}',
  tips text[] not null default '{}',
  legacy_id text,
  version integer not null default 1,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  constraint recipes_scope_owner_ck check (
    (scope = 'personal' and owner_id is not null) or (scope = 'site' and owner_id is null)
  ),
  constraint recipes_published_requires_site_ck check (status <> 'published' or scope = 'site'),
  constraint recipes_personal_requires_private_ck check (scope <> 'personal' or status = 'private')
);

alter table public.recipes enable row level security;

-- =========================================================================
-- 6. public.recipe_categories (structured replacement for recipes.tags —
--    only accepts categories.type = 'secao'; see trigger in section 8).
-- =========================================================================
create table if not exists public.recipe_categories (
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  category_id uuid not null references public.categories (id),
  sort_order integer not null default 0,
  primary key (recipe_id, category_id)
);

alter table public.recipe_categories enable row level security;

-- =========================================================================
-- 7. public.recipe_ingredients — ON DELETE RESTRICT on product_id (never
--    CASCADE), per the plan.
-- =========================================================================
create table if not exists public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  quantity numeric not null check (quantity > 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.recipe_ingredients enable row level security;

-- =========================================================================
-- 8. Code generation — sequences for the entities that exist as of PR 1
--    only. request_code_seq is created together with change_requests in
--    PR 4, not here.
--
--    Codes are generated exclusively by BEFORE INSERT triggers running as
--    SECURITY DEFINER, restricted, never by a SECURITY INVOKER function —
--    a SECURITY INVOKER function calling nextval() would require granting
--    USAGE on the sequence to `authenticated` directly, which would let the
--    client consume sequence values outside of an actual row insert. These
--    triggers are the only path that ever touches the sequences; no grant
--    of any kind is given to anon/authenticated on the sequences
--    themselves — only the function owner (via SECURITY DEFINER) can call
--    nextval() on them. Because triggers fire automatically as part of the
--    table's own INSERT and are not called directly by client code, no
--    EXECUTE grant to authenticated is needed on the trigger functions
--    either.
--
--    Any value the client sends for *_code on INSERT is unconditionally
--    overwritten. UPDATE triggers below (section 10) make the column
--    immutable afterwards.
--
--    Documented explicitly: nextval() can produce gaps after a rolled-back
--    transaction or under concurrency. Codes are unique and immutable, but
--    NOT guaranteed to be contiguous. No UI or test should assume otherwise.
-- =========================================================================
create sequence if not exists public.category_code_seq;
create sequence if not exists public.product_code_seq;
create sequence if not exists public.recipe_code_seq;

revoke all on sequence public.category_code_seq from public, anon, authenticated;
revoke all on sequence public.product_code_seq from public, anon, authenticated;
revoke all on sequence public.recipe_code_seq from public, anon, authenticated;

create or replace function public.assign_category_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.category_code := 'YCT-' || lpad(nextval('public.category_code_seq')::text, 4, '0');
  return new;
end;
$$;
revoke execute on function public.assign_category_code() from public;

create or replace function public.assign_product_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.product_code := 'YPR-' || lpad(nextval('public.product_code_seq')::text, 4, '0');
  return new;
end;
$$;
revoke execute on function public.assign_product_code() from public;

create or replace function public.assign_recipe_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.recipe_code := 'YCR-' || lpad(nextval('public.recipe_code_seq')::text, 4, '0');
  return new;
end;
$$;
revoke execute on function public.assign_recipe_code() from public;

drop trigger if exists trg_assign_category_code on public.categories;
create trigger trg_assign_category_code
  before insert on public.categories
  for each row execute function public.assign_category_code();

drop trigger if exists trg_assign_product_code on public.products;
create trigger trg_assign_product_code
  before insert on public.products
  for each row execute function public.assign_product_code();

drop trigger if exists trg_assign_recipe_code on public.recipes;
create trigger trg_assign_recipe_code
  before insert on public.recipes
  for each row execute function public.assign_recipe_code();

-- =========================================================================
-- 9. Slug assignment — always derived from name server-side, never trusted
--    from the client.
-- =========================================================================
create or replace function public.assign_category_slug()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.slug := public.slugify(new.name);
  return new;
end;
$$;
revoke execute on function public.assign_category_slug() from public;

drop trigger if exists trg_assign_category_slug on public.categories;
create trigger trg_assign_category_slug
  before insert or update of name on public.categories
  for each row execute function public.assign_category_slug();

-- =========================================================================
-- 10. Audit columns + version — server-controlled on every table that has
--     them. INSERT: created_by/updated_by default to auth.uid() when
--     authenticated (a client-authenticated call can never spoof these);
--     when auth.uid() is null (SQL Editor / scripted import, e.g. the
--     legacy-data migration in PR 8) an explicit value supplied by that
--     script is honored via COALESCE, since there is no "acting user" to
--     infer in that context. version always starts at 1 and always
--     increments by exactly 1 on UPDATE, regardless of what the client
--     sends — the actual optimistic-concurrency check (`WHERE id = :id AND
--     version = :expectedVersion`, zero rows affected = conflict) is
--     implemented by the application/RPC layer issuing the UPDATE, not by
--     this trigger; this trigger only guarantees version is never
--     client-settable to an arbitrary number and never skips increments.
--     created_by/created_at are immutable after INSERT regardless of role.
-- =========================================================================
create or replace function public.set_catalog_audit_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if TG_OP = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.updated_by := coalesce(auth.uid(), new.updated_by);
    new.created_at := now();
    new.updated_at := now();
    new.version := 1;
  elsif TG_OP = 'UPDATE' then
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_by := coalesce(auth.uid(), new.updated_by);
    new.updated_at := now();
    new.version := old.version + 1;
  end if;
  return new;
end;
$$;
revoke execute on function public.set_catalog_audit_fields() from public;

drop trigger if exists trg_categories_audit_fields on public.categories;
create trigger trg_categories_audit_fields
  before insert or update on public.categories
  for each row execute function public.set_catalog_audit_fields();

drop trigger if exists trg_products_audit_fields on public.products;
create trigger trg_products_audit_fields
  before insert or update on public.products
  for each row execute function public.set_catalog_audit_fields();

drop trigger if exists trg_recipes_audit_fields on public.recipes;
create trigger trg_recipes_audit_fields
  before insert or update on public.recipes
  for each row execute function public.set_catalog_audit_fields();

-- =========================================================================
-- 11. Immutability of code/owner_id/scope for anyone calling through
--     PostgREST as `authenticated` (same NULL-propagating pattern as
--     public.prevent_role_escalation in supabase/schema.sql — auth.role()
--     IS NULL in the SQL Editor, which is the one place these columns may
--     ever be hand-corrected).
-- =========================================================================
create or replace function public.enforce_categories_immutable_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() is not null and auth.role() <> 'service_role' then
    if new.category_code is distinct from old.category_code then
      raise exception 'category_code is immutable';
    end if;
    if new.owner_id is distinct from old.owner_id then
      raise exception 'owner_id is immutable';
    end if;
    if new.scope is distinct from old.scope then
      raise exception 'scope is immutable';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.enforce_categories_immutable_fields() from public;

drop trigger if exists trg_categories_immutable_fields on public.categories;
create trigger trg_categories_immutable_fields
  before update on public.categories
  for each row execute function public.enforce_categories_immutable_fields();

create or replace function public.enforce_products_immutable_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() is not null and auth.role() <> 'service_role' then
    if new.product_code is distinct from old.product_code then
      raise exception 'product_code is immutable';
    end if;
    if new.owner_id is distinct from old.owner_id then
      raise exception 'owner_id is immutable';
    end if;
    if new.scope is distinct from old.scope then
      raise exception 'scope is immutable';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.enforce_products_immutable_fields() from public;

drop trigger if exists trg_products_immutable_fields on public.products;
create trigger trg_products_immutable_fields
  before update on public.products
  for each row execute function public.enforce_products_immutable_fields();

create or replace function public.enforce_recipes_immutable_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() is not null and auth.role() <> 'service_role' then
    if new.recipe_code is distinct from old.recipe_code then
      raise exception 'recipe_code is immutable';
    end if;
    if new.owner_id is distinct from old.owner_id then
      raise exception 'owner_id is immutable';
    end if;
    if new.scope is distinct from old.scope then
      raise exception 'scope is immutable';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.enforce_recipes_immutable_fields() from public;

drop trigger if exists trg_recipes_immutable_fields on public.recipes;
create trigger trg_recipes_immutable_fields
  before update on public.recipes
  for each row execute function public.enforce_recipes_immutable_fields();

-- =========================================================================
-- 12. Reference-scope matrix enforcement (point 5). SECURITY DEFINER is
--     used deliberately here even though these triggers only *read* other
--     tables: relying on SECURITY INVOKER plus RLS would make "reference
--     rejected" and "reference not found" indistinguishable side effects of
--     whatever RLS happens to allow the caller to see, which is a read
--     concern, not a data-integrity one. Making the check SECURITY DEFINER
--     decouples "is this reference structurally allowed" (must always hold,
--     independent of who's asking) from "can this caller see that row"
--     (an RLS/API concern). Every one of these also independently checks
--     `type`, so a category of the wrong type can never be attached even if
--     scope/owner would otherwise be allowed.
-- =========================================================================
create or replace function public.enforce_products_category_reference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cat public.categories%rowtype;
begin
  select * into v_cat from public.categories where id = new.category_id;
  if not found then
    raise exception 'products.category_id % does not exist', new.category_id;
  end if;
  if v_cat.type <> 'proteina' then
    raise exception 'products.category_id must reference a category with type=proteina';
  end if;
  if not public.validate_reference_scope(new.scope, new.owner_id, v_cat.scope, v_cat.owner_id, v_cat.active) then
    raise exception 'products.category_id references a category outside the allowed scope (personal category of another owner, or inactive/non-public category)';
  end if;
  return new;
end;
$$;
revoke execute on function public.enforce_products_category_reference() from public;

drop trigger if exists trg_products_category_reference on public.products;
create trigger trg_products_category_reference
  before insert or update of category_id, scope, owner_id on public.products
  for each row execute function public.enforce_products_category_reference();

create or replace function public.enforce_recipes_category_reference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cat public.categories%rowtype;
begin
  select * into v_cat from public.categories where id = new.category_id;
  if not found then
    raise exception 'recipes.category_id % does not exist', new.category_id;
  end if;
  if v_cat.type <> 'receita' then
    raise exception 'recipes.category_id must reference a category with type=receita';
  end if;
  if not public.validate_reference_scope(new.scope, new.owner_id, v_cat.scope, v_cat.owner_id, v_cat.active) then
    raise exception 'recipes.category_id references a category outside the allowed scope (personal category of another owner, or inactive/non-public category)';
  end if;
  return new;
end;
$$;
revoke execute on function public.enforce_recipes_category_reference() from public;

drop trigger if exists trg_recipes_category_reference on public.recipes;
create trigger trg_recipes_category_reference
  before insert or update of category_id, scope, owner_id on public.recipes
  for each row execute function public.enforce_recipes_category_reference();

create or replace function public.enforce_recipe_categories_reference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipe public.recipes%rowtype;
  v_cat public.categories%rowtype;
begin
  select * into v_recipe from public.recipes where id = new.recipe_id;
  if not found then
    raise exception 'recipe_categories.recipe_id % does not exist', new.recipe_id;
  end if;
  select * into v_cat from public.categories where id = new.category_id;
  if not found then
    raise exception 'recipe_categories.category_id % does not exist', new.category_id;
  end if;
  if v_cat.type <> 'secao' then
    raise exception 'recipe_categories.category_id must reference a category with type=secao';
  end if;
  if not public.validate_reference_scope(v_recipe.scope, v_recipe.owner_id, v_cat.scope, v_cat.owner_id, v_cat.active) then
    raise exception 'recipe_categories.category_id references a category outside the allowed scope (personal category of another owner, or inactive/non-public category)';
  end if;
  return new;
end;
$$;
revoke execute on function public.enforce_recipe_categories_reference() from public;

drop trigger if exists trg_recipe_categories_reference on public.recipe_categories;
create trigger trg_recipe_categories_reference
  before insert or update of recipe_id, category_id on public.recipe_categories
  for each row execute function public.enforce_recipe_categories_reference();

create or replace function public.enforce_recipe_ingredients_product_reference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipe public.recipes%rowtype;
  v_prod public.products%rowtype;
begin
  select * into v_recipe from public.recipes where id = new.recipe_id;
  if not found then
    raise exception 'recipe_ingredients.recipe_id % does not exist', new.recipe_id;
  end if;
  select * into v_prod from public.products where id = new.product_id;
  if not found then
    raise exception 'recipe_ingredients.product_id % does not exist', new.product_id;
  end if;
  if not public.validate_reference_scope(v_recipe.scope, v_recipe.owner_id, v_prod.scope, v_prod.owner_id, v_prod.active) then
    raise exception 'recipe_ingredients.product_id references a product outside the allowed scope (personal product of another owner, or inactive/non-public product)';
  end if;
  return new;
end;
$$;
revoke execute on function public.enforce_recipe_ingredients_product_reference() from public;

drop trigger if exists trg_recipe_ingredients_product_reference on public.recipe_ingredients;
create trigger trg_recipe_ingredients_product_reference
  before insert or update of recipe_id, product_id on public.recipe_ingredients
  for each row execute function public.enforce_recipe_ingredients_product_reference();

-- =========================================================================
-- 13. RLS — personal CRUD (own rows only) + public read (active/published
--     only). No public-write policies yet: admin write access to
--     scope='site' rows is added in PR 3, deliberately not bundled here.
-- =========================================================================

-- ---- categories ----
drop policy if exists "categories_select_personal" on public.categories;
create policy "categories_select_personal"
  on public.categories for select
  to authenticated
  using (scope = 'personal' and owner_id = auth.uid());

drop policy if exists "categories_select_public" on public.categories;
create policy "categories_select_public"
  on public.categories for select
  to anon, authenticated
  using (scope = 'site' and active = true);

drop policy if exists "categories_insert_personal" on public.categories;
create policy "categories_insert_personal"
  on public.categories for insert
  to authenticated
  with check (scope = 'personal' and owner_id = auth.uid());

drop policy if exists "categories_update_personal" on public.categories;
create policy "categories_update_personal"
  on public.categories for update
  to authenticated
  using (scope = 'personal' and owner_id = auth.uid())
  with check (scope = 'personal' and owner_id = auth.uid());

drop policy if exists "categories_delete_personal" on public.categories;
create policy "categories_delete_personal"
  on public.categories for delete
  to authenticated
  using (scope = 'personal' and owner_id = auth.uid());

grant select on public.categories to anon, authenticated;
grant insert, update, delete on public.categories to authenticated;

-- ---- products ----
drop policy if exists "products_select_personal" on public.products;
create policy "products_select_personal"
  on public.products for select
  to authenticated
  using (scope = 'personal' and owner_id = auth.uid());

drop policy if exists "products_select_public" on public.products;
create policy "products_select_public"
  on public.products for select
  to anon, authenticated
  using (scope = 'site' and active = true);

drop policy if exists "products_insert_personal" on public.products;
create policy "products_insert_personal"
  on public.products for insert
  to authenticated
  with check (scope = 'personal' and owner_id = auth.uid());

drop policy if exists "products_update_personal" on public.products;
create policy "products_update_personal"
  on public.products for update
  to authenticated
  using (scope = 'personal' and owner_id = auth.uid())
  with check (scope = 'personal' and owner_id = auth.uid());

drop policy if exists "products_delete_personal" on public.products;
create policy "products_delete_personal"
  on public.products for delete
  to authenticated
  using (scope = 'personal' and owner_id = auth.uid());

grant select on public.products to anon, authenticated;
grant insert, update, delete on public.products to authenticated;

-- ---- recipes ----
drop policy if exists "recipes_select_personal" on public.recipes;
create policy "recipes_select_personal"
  on public.recipes for select
  to authenticated
  using (scope = 'personal' and owner_id = auth.uid());

drop policy if exists "recipes_select_public" on public.recipes;
create policy "recipes_select_public"
  on public.recipes for select
  to anon, authenticated
  using (scope = 'site' and status = 'published');

drop policy if exists "recipes_insert_personal" on public.recipes;
create policy "recipes_insert_personal"
  on public.recipes for insert
  to authenticated
  with check (scope = 'personal' and owner_id = auth.uid());

drop policy if exists "recipes_update_personal" on public.recipes;
create policy "recipes_update_personal"
  on public.recipes for update
  to authenticated
  using (scope = 'personal' and owner_id = auth.uid())
  with check (scope = 'personal' and owner_id = auth.uid());

drop policy if exists "recipes_delete_personal" on public.recipes;
create policy "recipes_delete_personal"
  on public.recipes for delete
  to authenticated
  using (scope = 'personal' and owner_id = auth.uid());

grant select on public.recipes to anon, authenticated;
grant insert, update, delete on public.recipes to authenticated;

-- ---- recipe_categories (visibility/write follows the parent recipe) ----
drop policy if exists "recipe_categories_select" on public.recipe_categories;
create policy "recipe_categories_select"
  on public.recipe_categories for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_id
        and ((r.scope = 'site' and r.status = 'published')
             or (r.scope = 'personal' and r.owner_id = auth.uid()))
    )
  );

drop policy if exists "recipe_categories_insert_personal" on public.recipe_categories;
create policy "recipe_categories_insert_personal"
  on public.recipe_categories for insert
  to authenticated
  with check (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_id and r.scope = 'personal' and r.owner_id = auth.uid()
    )
  );

drop policy if exists "recipe_categories_update_personal" on public.recipe_categories;
create policy "recipe_categories_update_personal"
  on public.recipe_categories for update
  to authenticated
  using (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_id and r.scope = 'personal' and r.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_id and r.scope = 'personal' and r.owner_id = auth.uid()
    )
  );

drop policy if exists "recipe_categories_delete_personal" on public.recipe_categories;
create policy "recipe_categories_delete_personal"
  on public.recipe_categories for delete
  to authenticated
  using (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_id and r.scope = 'personal' and r.owner_id = auth.uid()
    )
  );

grant select on public.recipe_categories to anon, authenticated;
grant insert, update, delete on public.recipe_categories to authenticated;

-- ---- recipe_ingredients (visibility/write follows the parent recipe) ----
drop policy if exists "recipe_ingredients_select" on public.recipe_ingredients;
create policy "recipe_ingredients_select"
  on public.recipe_ingredients for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_id
        and ((r.scope = 'site' and r.status = 'published')
             or (r.scope = 'personal' and r.owner_id = auth.uid()))
    )
  );

drop policy if exists "recipe_ingredients_insert_personal" on public.recipe_ingredients;
create policy "recipe_ingredients_insert_personal"
  on public.recipe_ingredients for insert
  to authenticated
  with check (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_id and r.scope = 'personal' and r.owner_id = auth.uid()
    )
  );

drop policy if exists "recipe_ingredients_update_personal" on public.recipe_ingredients;
create policy "recipe_ingredients_update_personal"
  on public.recipe_ingredients for update
  to authenticated
  using (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_id and r.scope = 'personal' and r.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_id and r.scope = 'personal' and r.owner_id = auth.uid()
    )
  );

drop policy if exists "recipe_ingredients_delete_personal" on public.recipe_ingredients;
create policy "recipe_ingredients_delete_personal"
  on public.recipe_ingredients for delete
  to authenticated
  using (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_id and r.scope = 'personal' and r.owner_id = auth.uid()
    )
  );

grant select on public.recipe_ingredients to anon, authenticated;
grant insert, update, delete on public.recipe_ingredients to authenticated;
