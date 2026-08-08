-- Yourcipe — Supabase-backed "Seções de Produtos" (Produtos page), mirroring
-- recipe_categories/type='secao' (Receitas/Início page sections) exactly.
--
-- Root cause this file fixes: unlike recipe sections (categories.type=
-- 'secao', joined to recipes via public.recipe_categories — see
-- 004_catalog_schema.sql section 6, RLS in 004+006, home ordering in
-- 012_admin_import_and_home_order.sql), the Produtos page's "Seções de
-- Produtos" admin editor (app.js `productSections` state) was ENTIRELY
-- client-local: created/reordered/deleted sections and product-to-section
-- assignments only ever touched localStorage
-- (LS_KEYS.productSections/LS_KEYS.products), never Supabase. So an admin's
-- product-section edits never reached the public catalog for any other
-- visitor/session — see app.js's own comment on `products` mapping inside
-- `_loadPublicCatalog` ("Local-only 'Seções de Produtos' tags ... have no
-- Supabase-synced counterpart"). This migration adds that counterpart.
--
-- Review every statement before running it. Idempotent — safe to re-run.
-- Depends on supabase/004_catalog_schema.sql, 006_admin_catalog_publishing.sql,
-- 010_hard_delete_and_reference_resolution.sql, 011_cross_user_visibility.sql,
-- 012_admin_import_and_home_order.sql already applied. Does not modify any
-- of those files — purely additive, new table + new/replaced functions.

-- =========================================================================
-- 1. categories.type gains a fourth value, 'secao_produto' — a product
--    section is a distinct vocabulary from a recipe section ('secao'):
--    same mechanics (name/slug/sort_order/active, personal-vs-site scope),
--    different join table (public.product_categories below, instead of
--    public.recipe_categories), so they never mix in the same list. Every
--    existing 'secao'/'receita'/'proteina' row is completely unaffected.
-- =========================================================================
alter table public.categories drop constraint if exists categories_type_check;
alter table public.categories add constraint categories_type_check
  check (type in ('proteina', 'secao', 'receita', 'secao_produto'));

-- =========================================================================
-- 2. public.product_categories — structured many-to-many between products
--    and categories.type='secao_produto', exact structural mirror of
--    public.recipe_categories (004, section 6): product_id cascades on
--    delete (so deleting a product silently drops its section tags, same
--    as recipe_id does for recipe_categories — no impact-check/resolution
--    needed in that direction), category_id has no cascade (so deleting a
--    'secao_produto' category must go through
--    delete_category_resolved()'s explicit resolution, extended below,
--    exactly like a 'secao' category already does for recipe_categories).
-- =========================================================================
create table if not exists public.product_categories (
  product_id uuid not null references public.products (id) on delete cascade,
  category_id uuid not null references public.categories (id),
  sort_order integer not null default 0,
  primary key (product_id, category_id)
);
alter table public.product_categories enable row level security;

create or replace function public.enforce_product_categories_reference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products%rowtype;
  v_cat public.categories%rowtype;
begin
  select * into v_product from public.products where id = new.product_id;
  if not found then
    raise exception 'product_categories.product_id % does not exist', new.product_id;
  end if;
  select * into v_cat from public.categories where id = new.category_id;
  if not found then
    raise exception 'product_categories.category_id % does not exist', new.category_id;
  end if;
  if v_cat.type <> 'secao_produto' then
    raise exception 'product_categories.category_id must reference a category with type=secao_produto';
  end if;
  if not public.validate_reference_scope(v_product.scope, v_product.owner_id, v_cat.scope, v_cat.owner_id, v_cat.active) then
    raise exception 'product_categories.category_id references a category outside the allowed scope (personal category of another owner, or inactive/non-public category)';
  end if;
  return new;
end;
$$;
revoke execute on function public.enforce_product_categories_reference() from public;

drop trigger if exists trg_product_categories_reference on public.product_categories;
create trigger trg_product_categories_reference
  before insert or update of product_id, category_id on public.product_categories
  for each row execute function public.enforce_product_categories_reference();

-- ---- product_categories RLS (visibility/write follows the parent product) ----
drop policy if exists "product_categories_select" on public.product_categories;
create policy "product_categories_select"
  on public.product_categories for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.products p
      where p.id = product_id
        and ((p.scope = 'site' and p.active is true)
             or (p.scope = 'personal' and p.owner_id = auth.uid()))
    )
  );

drop policy if exists "product_categories_insert_personal" on public.product_categories;
create policy "product_categories_insert_personal"
  on public.product_categories for insert
  to authenticated
  with check (
    exists (
      select 1 from public.products p
      where p.id = product_id and p.scope = 'personal' and p.owner_id = auth.uid()
    )
  );

drop policy if exists "product_categories_update_personal" on public.product_categories;
create policy "product_categories_update_personal"
  on public.product_categories for update
  to authenticated
  using (
    exists (
      select 1 from public.products p
      where p.id = product_id and p.scope = 'personal' and p.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.products p
      where p.id = product_id and p.scope = 'personal' and p.owner_id = auth.uid()
    )
  );

drop policy if exists "product_categories_delete_personal" on public.product_categories;
create policy "product_categories_delete_personal"
  on public.product_categories for delete
  to authenticated
  using (
    exists (
      select 1 from public.products p
      where p.id = product_id and p.scope = 'personal' and p.owner_id = auth.uid()
    )
  );

drop policy if exists "product_categories_select_admin_site" on public.product_categories;
create policy "product_categories_select_admin_site"
  on public.product_categories for select
  to authenticated
  using (
    exists (
      select 1 from public.products p
      where p.id = product_id and p.scope = 'site' and public.is_admin()
    )
  );

drop policy if exists "product_categories_insert_admin_site" on public.product_categories;
create policy "product_categories_insert_admin_site"
  on public.product_categories for insert
  to authenticated
  with check (
    exists (
      select 1 from public.products p
      where p.id = product_id and p.scope = 'site' and public.is_admin()
    )
  );

drop policy if exists "product_categories_update_admin_site" on public.product_categories;
create policy "product_categories_update_admin_site"
  on public.product_categories for update
  to authenticated
  using (
    exists (
      select 1 from public.products p
      where p.id = product_id and p.scope = 'site' and public.is_admin()
    )
  )
  with check (
    exists (
      select 1 from public.products p
      where p.id = product_id and p.scope = 'site' and public.is_admin()
    )
  );

drop policy if exists "product_categories_delete_admin_site" on public.product_categories;
create policy "product_categories_delete_admin_site"
  on public.product_categories for delete
  to authenticated
  using (
    exists (
      select 1 from public.products p
      where p.id = product_id and p.scope = 'site' and public.is_admin()
    )
  );

grant select on public.product_categories to anon, authenticated;
grant insert, update, delete on public.product_categories to authenticated;

-- =========================================================================
-- 3. list_public_product_sections — public (anon-safe) read of
--    (product_id, slug) pairs for the live Produtos/Início pages, exact
--    mirror of list_public_recipe_sections (011_cross_user_visibility.sql).
-- =========================================================================
create or replace function public.list_public_product_sections(p_product_ids uuid[])
returns table(product_id uuid, slug text)
language sql
stable
security definer
set search_path = public
as $$
  select pc.product_id, c.slug
  from public.product_categories pc
  join public.products p on p.id = pc.product_id
  join public.categories c on c.id = pc.category_id
  where pc.product_id = any(coalesce(p_product_ids, '{}'::uuid[]))
    and p.scope = 'site' and p.active is true
    and c.scope = 'site' and c.type = 'secao_produto' and c.active is true
  order by pc.product_id, pc.sort_order, c.id
$$;
revoke execute on function public.list_public_product_sections(uuid[]) from public;
grant execute on function public.list_public_product_sections(uuid[]) to anon, authenticated;

-- =========================================================================
-- 4. admin_reorder_product_sections — exact mirror of
--    admin_reorder_home_sections (012_admin_import_and_home_order.sql),
--    scoped to type='secao_produto' instead of type='secao'.
-- =========================================================================
create or replace function public.admin_reorder_product_sections(p_sections jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_id uuid;
  v_order integer;
  v_count integer := 0;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if jsonb_typeof(p_sections) <> 'array' then
    raise exception 'invalid_sections_payload';
  end if;

  for v_item in select * from jsonb_array_elements(p_sections) loop
    v_id := nullif(v_item->>'id', '')::uuid;
    v_order := coalesce((v_item->>'sort_order')::integer, v_count);
    update public.categories
      set sort_order = v_order
      where id = v_id and scope = 'site' and owner_id is null and type = 'secao_produto';
    if found then v_count := v_count + 1; end if;
  end loop;

  return jsonb_build_object('updated', v_count);
end;
$$;
revoke execute on function public.admin_reorder_product_sections(jsonb) from public, anon;
grant execute on function public.admin_reorder_product_sections(jsonb) to authenticated;

-- =========================================================================
-- 5. get_category_delete_impact / delete_category_resolved
--    (010_hard_delete_and_reference_resolution.sql) — replaced here to add
--    product-section awareness. A given category is only ever type='secao'
--    (referenced exclusively by recipe_categories, enforced by
--    enforce_recipe_categories_reference) or type='secao_produto'
--    (referenced exclusively by product_categories, enforced by
--    enforce_product_categories_reference above) — never both — so the new
--    own_product_section_count/public_product_section_count fields are
--    simply 0 for every pre-existing category, and the pre-existing
--    own_section_count/public_section_count fields stay exactly as they
--    were (0) for every 'secao_produto' category. Every other field/branch
--    from 010's version is reproduced unchanged.
-- =========================================================================
create or replace function public.get_category_delete_impact(p_category_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_category record;
  v_is_owner boolean;
  v_is_admin boolean;
  v_own_product_count integer;
  v_public_product_count integer;
  v_own_recipe_count integer;
  v_public_recipe_count integer;
  v_own_section_count integer;
  v_public_section_count integer;
  v_own_product_section_count integer;
  v_public_product_section_count integer;
  v_foreign_personal_ref_count integer;
  v_pending_request_count integer;
  v_pending_codes text[];
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_category from public.categories where id = p_category_id;
  if not found then
    raise exception 'category_not_found';
  end if;

  v_is_admin := public.is_admin();
  v_is_owner := v_category.scope = 'personal' and v_category.owner_id = v_uid;

  if not (v_is_owner or (v_category.scope = 'site' and v_is_admin)) then
    raise exception 'not_authorized';
  end if;

  select count(*) into v_own_product_count
    from public.products where category_id = p_category_id and scope = 'personal' and owner_id = v_uid;
  select count(*) into v_own_recipe_count
    from public.recipes where category_id = p_category_id and scope = 'personal' and owner_id = v_uid;
  select count(*) into v_own_section_count
    from public.recipe_categories rc join public.recipes r on r.id = rc.recipe_id
    where rc.category_id = p_category_id and r.scope = 'personal' and r.owner_id = v_uid;
  select count(*) into v_own_product_section_count
    from public.product_categories pc join public.products p on p.id = pc.product_id
    where pc.category_id = p_category_id and p.scope = 'personal' and p.owner_id = v_uid;

  if v_is_admin then
    select count(*) into v_public_product_count
      from public.products where category_id = p_category_id and scope = 'site';
    select count(*) into v_public_recipe_count
      from public.recipes where category_id = p_category_id and scope = 'site';
    select count(*) into v_public_section_count
      from public.recipe_categories rc join public.recipes r on r.id = rc.recipe_id
      where rc.category_id = p_category_id and r.scope = 'site';
    select count(*) into v_public_product_section_count
      from public.product_categories pc join public.products p on p.id = pc.product_id
      where pc.category_id = p_category_id and p.scope = 'site';
  else
    v_public_product_count := 0;
    v_public_recipe_count := 0;
    v_public_section_count := 0;
    v_public_product_section_count := 0;
  end if;

  select
    (select count(*) from public.products where category_id = p_category_id and scope = 'personal' and owner_id is distinct from v_uid)
    + (select count(*) from public.recipes where category_id = p_category_id and scope = 'personal' and owner_id is distinct from v_uid)
    + (select count(*) from public.recipe_categories rc join public.recipes r on r.id = rc.recipe_id
         where rc.category_id = p_category_id and r.scope = 'personal' and r.owner_id is distinct from v_uid)
    + (select count(*) from public.product_categories pc join public.products p on p.id = pc.product_id
         where pc.category_id = p_category_id and p.scope = 'personal' and p.owner_id is distinct from v_uid)
    into v_foreign_personal_ref_count;

  select count(*), coalesce(array_agg(request_code order by request_code), '{}')
    into v_pending_request_count, v_pending_codes
    from public.change_requests
    where entity_type = 'category'
      and (source_id = p_category_id or target_id = p_category_id)
      and status in ('submitted', 'resubmitted', 'changes_requested');

  return jsonb_build_object(
    'category_id', v_category.id,
    'category_code', v_category.category_code,
    'name', v_category.name,
    'type', v_category.type,
    'scope', v_category.scope,
    'active', v_category.active,
    'is_owner', v_is_owner,
    'is_admin', v_is_admin,
    'own_product_count', coalesce(v_own_product_count, 0),
    'public_product_count', coalesce(v_public_product_count, 0),
    'own_recipe_count', coalesce(v_own_recipe_count, 0),
    'public_recipe_count', coalesce(v_public_recipe_count, 0),
    'own_section_count', coalesce(v_own_section_count, 0),
    'public_section_count', coalesce(v_public_section_count, 0),
    'own_product_section_count', coalesce(v_own_product_section_count, 0),
    'public_product_section_count', coalesce(v_public_product_section_count, 0),
    'foreign_personal_ref_count', coalesce(v_foreign_personal_ref_count, 0),
    'pending_request_count', coalesce(v_pending_request_count, 0),
    'pending_request_codes', to_jsonb(coalesce(v_pending_codes, '{}'::text[])),
    'required_ref_count', coalesce(v_own_product_count, 0) + coalesce(v_public_product_count, 0)
      + coalesce(v_own_recipe_count, 0) + coalesce(v_public_recipe_count, 0),
    'optional_ref_count', coalesce(v_own_section_count, 0) + coalesce(v_public_section_count, 0)
      + coalesce(v_own_product_section_count, 0) + coalesce(v_public_product_section_count, 0)
  );
end;
$$;

revoke execute on function public.get_category_delete_impact(uuid) from public;
grant execute on function public.get_category_delete_impact(uuid) to authenticated;

-- delete_category_resolved — p_resolution gains an optional
-- "product_sections" array, exact structural mirror of "sections":
--    "product_sections": [
--      { "product_id": "<uuid>", "action": "replace", "replacement_category_id": "<uuid>" },
--      { "product_id": "<uuid>", "action": "remove" }
--    ]
-- Every other branch reproduced unchanged from 010's version.
create or replace function public.delete_category_resolved(
  p_category_id uuid,
  p_resolution jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_category record;
  v_row jsonb;
  v_target record;
  v_replacement record;
  v_seen_products uuid[] := '{}';
  v_seen_recipes uuid[] := '{}';
  v_seen_sections uuid[] := '{}';
  v_seen_product_sections uuid[] := '{}';
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_category from public.categories where id = p_category_id for update;
  if not found then
    raise exception 'category_not_found';
  end if;

  if v_category.scope = 'personal' then
    if v_category.owner_id is distinct from v_uid then
      raise exception 'not_owner';
    end if;
  elsif v_category.scope = 'site' then
    if not public.is_admin() then
      raise exception 'not_admin';
    end if;
  else
    raise exception 'unknown_scope';
  end if;

  -- ---- products.category_id (required) ----
  for v_row in select * from jsonb_array_elements(coalesce(p_resolution->'products', '[]'::jsonb))
  loop
    select * into v_target from public.products where id = (v_row->>'id')::uuid and category_id = p_category_id for update;
    if not found then continue; end if;
    select * into v_replacement from public.categories where id = (v_row->>'replacement_category_id')::uuid;
    if not found then raise exception 'replacement_category_not_found'; end if;
    if v_replacement.id = p_category_id then raise exception 'replacement_category_same_as_deleted'; end if;
    if v_replacement.type <> 'proteina' then raise exception 'replacement_category_wrong_type'; end if;
    update public.products set category_id = v_replacement.id where id = v_target.id;
    v_seen_products := array_append(v_seen_products, v_target.id);
  end loop;

  if exists (select 1 from public.products where category_id = p_category_id) then
    raise exception 'unresolved_product_references';
  end if;

  -- ---- recipes.category_id (required) ----
  for v_row in select * from jsonb_array_elements(coalesce(p_resolution->'recipes', '[]'::jsonb))
  loop
    select * into v_target from public.recipes where id = (v_row->>'id')::uuid and category_id = p_category_id for update;
    if not found then continue; end if;
    select * into v_replacement from public.categories where id = (v_row->>'replacement_category_id')::uuid;
    if not found then raise exception 'replacement_category_not_found'; end if;
    if v_replacement.id = p_category_id then raise exception 'replacement_category_same_as_deleted'; end if;
    if v_replacement.type <> 'receita' then raise exception 'replacement_category_wrong_type'; end if;
    update public.recipes set category_id = v_replacement.id where id = v_target.id;
    v_seen_recipes := array_append(v_seen_recipes, v_target.id);
  end loop;

  if exists (select 1 from public.recipes where category_id = p_category_id) then
    raise exception 'unresolved_recipe_references';
  end if;

  -- ---- recipe_categories.category_id (optional: replace or remove) ----
  for v_row in select * from jsonb_array_elements(coalesce(p_resolution->'sections', '[]'::jsonb))
  loop
    if not exists (
      select 1 from public.recipe_categories
      where recipe_id = (v_row->>'recipe_id')::uuid and category_id = p_category_id
    ) then
      continue;
    end if;
    if v_row->>'action' = 'replace' then
      select * into v_replacement from public.categories where id = (v_row->>'replacement_category_id')::uuid;
      if not found then raise exception 'replacement_category_not_found'; end if;
      if v_replacement.id = p_category_id then raise exception 'replacement_category_same_as_deleted'; end if;
      if v_replacement.type <> 'secao' then raise exception 'replacement_category_wrong_type'; end if;
      insert into public.recipe_categories (recipe_id, category_id, sort_order)
        select recipe_id, v_replacement.id, sort_order from public.recipe_categories
        where recipe_id = (v_row->>'recipe_id')::uuid and category_id = p_category_id
        on conflict (recipe_id, category_id) do nothing;
      delete from public.recipe_categories
        where recipe_id = (v_row->>'recipe_id')::uuid and category_id = p_category_id;
    elsif v_row->>'action' = 'remove' then
      delete from public.recipe_categories
        where recipe_id = (v_row->>'recipe_id')::uuid and category_id = p_category_id;
    else
      raise exception 'invalid_section_action:%', coalesce(v_row->>'action', 'null');
    end if;
    v_seen_sections := array_append(v_seen_sections, (v_row->>'recipe_id')::uuid);
  end loop;

  if exists (select 1 from public.recipe_categories where category_id = p_category_id) then
    raise exception 'unresolved_section_references';
  end if;

  -- ---- product_categories.category_id (optional: replace or remove) ----
  for v_row in select * from jsonb_array_elements(coalesce(p_resolution->'product_sections', '[]'::jsonb))
  loop
    if not exists (
      select 1 from public.product_categories
      where product_id = (v_row->>'product_id')::uuid and category_id = p_category_id
    ) then
      continue;
    end if;
    if v_row->>'action' = 'replace' then
      select * into v_replacement from public.categories where id = (v_row->>'replacement_category_id')::uuid;
      if not found then raise exception 'replacement_category_not_found'; end if;
      if v_replacement.id = p_category_id then raise exception 'replacement_category_same_as_deleted'; end if;
      if v_replacement.type <> 'secao_produto' then raise exception 'replacement_category_wrong_type'; end if;
      insert into public.product_categories (product_id, category_id, sort_order)
        select product_id, v_replacement.id, sort_order from public.product_categories
        where product_id = (v_row->>'product_id')::uuid and category_id = p_category_id
        on conflict (product_id, category_id) do nothing;
      delete from public.product_categories
        where product_id = (v_row->>'product_id')::uuid and category_id = p_category_id;
    elsif v_row->>'action' = 'remove' then
      delete from public.product_categories
        where product_id = (v_row->>'product_id')::uuid and category_id = p_category_id;
    else
      raise exception 'invalid_product_section_action:%', coalesce(v_row->>'action', 'null');
    end if;
    v_seen_product_sections := array_append(v_seen_product_sections, (v_row->>'product_id')::uuid);
  end loop;

  if exists (select 1 from public.product_categories where category_id = p_category_id) then
    raise exception 'unresolved_product_section_references';
  end if;

  delete from public.categories where id = p_category_id;

  return jsonb_build_object('action', 'deleted', 'category_id', p_category_id);
end;
$$;

revoke execute on function public.delete_category_resolved(uuid, jsonb) from public;
grant execute on function public.delete_category_resolved(uuid, jsonb) to authenticated;

-- =========================================================================
-- 6. get_product_delete_impact — replaced only to add an informational
--    section_count field (product_categories rows referencing the product).
--    Purely informational: product_categories.product_id is ON DELETE
--    CASCADE (see table definition above), so — exactly like a recipe's
--    recipe_categories rows — a product's section tags never block its
--    deletion and never require resolution; this field only lets the UI
--    tell the admin "this also removes it from N section(s)" the same way
--    it already can for a recipe. Every other field/branch reproduced
--    unchanged from 010's version.
-- =========================================================================
create or replace function public.get_product_delete_impact(p_product_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_product record;
  v_is_owner boolean;
  v_is_admin boolean;
  v_own_recipe_count integer;
  v_public_recipe_count integer;
  v_foreign_personal_recipe_count integer;
  v_pending_request_count integer;
  v_pending_codes text[];
  v_total_ingredient_rows integer;
  v_section_count integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_product from public.products where id = p_product_id;
  if not found then
    raise exception 'product_not_found';
  end if;

  v_is_admin := public.is_admin();
  v_is_owner := v_product.scope = 'personal' and v_product.owner_id = v_uid;

  if not (v_is_owner or (v_product.scope = 'site' and v_is_admin)) then
    raise exception 'not_authorized';
  end if;

  select count(distinct ri.recipe_id) into v_own_recipe_count
    from public.recipe_ingredients ri
    join public.recipes r on r.id = ri.recipe_id
    where ri.product_id = p_product_id and r.scope = 'personal' and r.owner_id = v_uid;

  if v_is_admin then
    select count(distinct ri.recipe_id) into v_public_recipe_count
      from public.recipe_ingredients ri
      join public.recipes r on r.id = ri.recipe_id
      where ri.product_id = p_product_id and r.scope = 'site';
  else
    v_public_recipe_count := 0;
  end if;

  select count(distinct ri.recipe_id) into v_foreign_personal_recipe_count
    from public.recipe_ingredients ri
    join public.recipes r on r.id = ri.recipe_id
    where ri.product_id = p_product_id and r.scope = 'personal' and r.owner_id is distinct from v_uid;

  select count(*), coalesce(array_agg(request_code order by request_code), '{}')
    into v_pending_request_count, v_pending_codes
    from public.change_requests
    where entity_type = 'product'
      and (source_id = p_product_id or target_id = p_product_id)
      and status in ('submitted', 'resubmitted', 'changes_requested');

  select count(*) into v_total_ingredient_rows
    from public.recipe_ingredients where product_id = p_product_id;

  select count(*) into v_section_count
    from public.product_categories where product_id = p_product_id;

  return jsonb_build_object(
    'product_id', v_product.id,
    'product_code', v_product.product_code,
    'name', v_product.name,
    'scope', v_product.scope,
    'active', v_product.active,
    'is_owner', v_is_owner,
    'is_admin', v_is_admin,
    'own_recipe_count', coalesce(v_own_recipe_count, 0),
    'public_recipe_count', coalesce(v_public_recipe_count, 0),
    'foreign_personal_recipe_count', coalesce(v_foreign_personal_recipe_count, 0),
    'pending_request_count', coalesce(v_pending_request_count, 0),
    'pending_request_codes', to_jsonb(coalesce(v_pending_codes, '{}'::text[])),
    'total_ingredient_rows', coalesce(v_total_ingredient_rows, 0),
    'section_count', coalesce(v_section_count, 0)
  );
end;
$$;

revoke execute on function public.get_product_delete_impact(uuid) from public;
grant execute on function public.get_product_delete_impact(uuid) to authenticated;
