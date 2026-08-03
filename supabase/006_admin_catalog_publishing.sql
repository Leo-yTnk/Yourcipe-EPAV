-- Yourcipe — direct admin authoring of the public catalog (categories,
-- products, recipes with scope='site').
--
-- Root cause this file fixes (see PR description for the full
-- investigation): supabase/004_catalog_schema.sql shipped with NO
-- INSERT/UPDATE/SELECT policy at all for `authenticated` on scope='site'
-- rows — its own comment says so explicitly ("Admin write policies on
-- scope='site' rows are added in PR 3, not here"). That PR never
-- materialized before the "Modo de Criação" PR shipped a front-end catalog
-- editor that LOOKED like it wrote to the public catalog but actually only
-- ever mutated a localStorage-backed array (`this.state.recipes`/
-- `this.state.products`, from data.js) — never Supabase at all. So even
-- once the front-end is fixed to actually call Supabase (this PR), admin
-- would still get a bare RLS denial with zero policy path to succeed,
-- because that policy genuinely never existed. This file adds it.
--
-- Review every statement before running it. Idempotent — safe to re-run.
-- Depends on supabase/004_catalog_schema.sql already being applied.

-- =========================================================================
-- 1. Site recipes may never be status='private' (that value is reserved
--    for personal recipes — recipes_personal_requires_private_ck already
--    enforces the other direction). Defensive constraint: without it,
--    nothing stops a future bug from creating an orphaned
--    scope='site', status='private' row that matches no SELECT policy at
--    all (invisible to everyone, including admin) and no CHECK constraint
--    catches it at insert time.
-- =========================================================================
alter table public.recipes drop constraint if exists recipes_site_not_private_ck;
alter table public.recipes add constraint recipes_site_not_private_ck
  check (scope <> 'site' or status <> 'private');

-- =========================================================================
-- 2. published_at — server-controlled, set exactly once a recipe first
--    transitions into status='published' (INSERT directly as published, or
--    UPDATE into published from any other status). Re-stamped on every
--    later re-publish (archive -> published again), not only the first
--    time — it records "the moment this became publicly visible", which
--    changes each time that happens. Uses clock_timestamp(), not now()/
--    CURRENT_TIMESTAMP: the latter is frozen for the whole enclosing
--    transaction in Postgres, which would be wrong here specifically
--    (unlike created_at/updated_at in set_catalog_audit_fields, where a
--    single frozen instant per transaction is the desired, ordinary audit
--    semantic). Client-supplied published_at is always overwritten.
-- =========================================================================
create or replace function public.set_recipe_published_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'published' and (TG_OP = 'INSERT' or old.status is distinct from 'published') then
    new.published_at := clock_timestamp();
  elsif TG_OP = 'UPDATE' then
    new.published_at := old.published_at;
  end if;
  return new;
end;
$$;
revoke execute on function public.set_recipe_published_at() from public;

drop trigger if exists trg_recipes_published_at on public.recipes;
create trigger trg_recipes_published_at
  before insert or update of status on public.recipes
  for each row execute function public.set_recipe_published_at();

-- =========================================================================
-- 3. RLS — admin direct authoring of scope='site' rows. Uses is_admin()
--    (supabase/004_catalog_schema.sql), which independently re-checks the
--    caller's own profiles.role on every call (SECURITY DEFINER, no
--    recursion risk — see that file's comment). These are ADDITIONAL
--    permissive policies alongside the existing personal/public ones from
--    004; they never narrow anything a plain user or anon already has.
--
--    No DELETE policy for scope='site' rows on purpose: admin manages the
--    public catalog's lifecycle via `active`/`status` (deactivate/archive),
--    never hard-deletes it from here — recipe_ingredients.product_id is
--    ON DELETE RESTRICT specifically to prevent exactly this kind of
--    silent breakage, and a hard delete path isn't part of this PR's scope.
-- =========================================================================

-- ---- categories ----
drop policy if exists "categories_select_admin_site" on public.categories;
create policy "categories_select_admin_site"
  on public.categories for select
  to authenticated
  using (scope = 'site' and public.is_admin());

drop policy if exists "categories_insert_admin_site" on public.categories;
create policy "categories_insert_admin_site"
  on public.categories for insert
  to authenticated
  with check (scope = 'site' and owner_id is null and public.is_admin());

drop policy if exists "categories_update_admin_site" on public.categories;
create policy "categories_update_admin_site"
  on public.categories for update
  to authenticated
  using (scope = 'site' and public.is_admin())
  with check (scope = 'site' and owner_id is null and public.is_admin());

-- ---- products ----
drop policy if exists "products_select_admin_site" on public.products;
create policy "products_select_admin_site"
  on public.products for select
  to authenticated
  using (scope = 'site' and public.is_admin());

drop policy if exists "products_insert_admin_site" on public.products;
create policy "products_insert_admin_site"
  on public.products for insert
  to authenticated
  with check (scope = 'site' and owner_id is null and public.is_admin());

drop policy if exists "products_update_admin_site" on public.products;
create policy "products_update_admin_site"
  on public.products for update
  to authenticated
  using (scope = 'site' and public.is_admin())
  with check (scope = 'site' and owner_id is null and public.is_admin());

-- ---- recipes ----
drop policy if exists "recipes_select_admin_site" on public.recipes;
create policy "recipes_select_admin_site"
  on public.recipes for select
  to authenticated
  using (scope = 'site' and public.is_admin());

drop policy if exists "recipes_insert_admin_site" on public.recipes;
create policy "recipes_insert_admin_site"
  on public.recipes for insert
  to authenticated
  with check (scope = 'site' and owner_id is null and public.is_admin() and status in ('draft', 'published'));

drop policy if exists "recipes_update_admin_site" on public.recipes;
create policy "recipes_update_admin_site"
  on public.recipes for update
  to authenticated
  using (scope = 'site' and public.is_admin())
  with check (scope = 'site' and owner_id is null and public.is_admin() and status in ('draft', 'published', 'archived'));

-- ---- recipe_categories (site recipe section tags — visibility/write follows the parent recipe) ----
drop policy if exists "recipe_categories_select_admin_site" on public.recipe_categories;
create policy "recipe_categories_select_admin_site"
  on public.recipe_categories for select
  to authenticated
  using (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_id and r.scope = 'site' and public.is_admin()
    )
  );

drop policy if exists "recipe_categories_insert_admin_site" on public.recipe_categories;
create policy "recipe_categories_insert_admin_site"
  on public.recipe_categories for insert
  to authenticated
  with check (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_id and r.scope = 'site' and public.is_admin()
    )
  );

drop policy if exists "recipe_categories_update_admin_site" on public.recipe_categories;
create policy "recipe_categories_update_admin_site"
  on public.recipe_categories for update
  to authenticated
  using (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_id and r.scope = 'site' and public.is_admin()
    )
  )
  with check (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_id and r.scope = 'site' and public.is_admin()
    )
  );

drop policy if exists "recipe_categories_delete_admin_site" on public.recipe_categories;
create policy "recipe_categories_delete_admin_site"
  on public.recipe_categories for delete
  to authenticated
  using (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_id and r.scope = 'site' and public.is_admin()
    )
  );

-- ---- recipe_ingredients (site recipe ingredients — visibility/write follows the parent recipe) ----
drop policy if exists "recipe_ingredients_select_admin_site" on public.recipe_ingredients;
create policy "recipe_ingredients_select_admin_site"
  on public.recipe_ingredients for select
  to authenticated
  using (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_id and r.scope = 'site' and public.is_admin()
    )
  );

drop policy if exists "recipe_ingredients_insert_admin_site" on public.recipe_ingredients;
create policy "recipe_ingredients_insert_admin_site"
  on public.recipe_ingredients for insert
  to authenticated
  with check (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_id and r.scope = 'site' and public.is_admin()
    )
  );

drop policy if exists "recipe_ingredients_update_admin_site" on public.recipe_ingredients;
create policy "recipe_ingredients_update_admin_site"
  on public.recipe_ingredients for update
  to authenticated
  using (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_id and r.scope = 'site' and public.is_admin()
    )
  )
  with check (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_id and r.scope = 'site' and public.is_admin()
    )
  );

drop policy if exists "recipe_ingredients_delete_admin_site" on public.recipe_ingredients;
create policy "recipe_ingredients_delete_admin_site"
  on public.recipe_ingredients for delete
  to authenticated
  using (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_id and r.scope = 'site' and public.is_admin()
    )
  );
