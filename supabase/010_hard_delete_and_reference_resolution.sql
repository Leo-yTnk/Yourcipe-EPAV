-- Yourcipe — hard deletion + reference resolution for products and
-- categories, mirroring the recipe deletion flow already shipped in
-- supabase/009_recipe_deletion.sql.
--
-- Review every statement before running it. Idempotent (create or replace /
-- drop-if-exists everywhere), safe to re-run.
--
-- Requires supabase/schema.sql, 002, 004_catalog_schema.sql,
-- 005_creation_mode_sharing.sql, 006_admin_catalog_publishing.sql,
-- 007_change_requests.sql and 009_recipe_deletion.sql already applied.
-- Does NOT modify 009 or any earlier migration — those stay exactly as
-- already applied in staging.
--
-- Context / why this exists: before this migration, "Meus Produtos" and
-- "Minhas Categorias" (and the admin catalog equivalents) only ever issued
-- a bare `delete from products/categories`
-- (catalog.deleteProduct/deleteCategory). That has two real problems:
--   1. products.category_id/recipes.category_id are NOT NULL with no ON
--      DELETE clause, and recipe_ingredients.product_id is
--      `ON DELETE RESTRICT` — so a referenced product/category simply
--      cannot be deleted at all; the bare delete fails with a raw
--      Postgres foreign-key-violation error the UI has no way to explain
--      or let the user resolve.
--   2. There was no way to see what referenced a product/category before
--      attempting the delete, and no way to *keep* the row (as history)
--      while just walking away from it — the only "soft" option was the
--      pre-existing `active` boolean column, toggled directly via
--      updateProduct/updateSiteProduct with no distinct UI action from
--      "delete".
--
-- This migration adds four RPCs, in the same spirit as 009's
-- get_recipe_delete_impact/delete_recipe:
--   1. get_product_delete_impact(uuid)   — read-only impact summary.
--   2. delete_product_resolved(uuid, jsonb) — resolves every
--      recipe_ingredients row referencing the product (replace with another
--      product or remove the ingredient), then deletes the product.
--   3. get_category_delete_impact(uuid)  — read-only impact summary.
--   4. delete_category_resolved(uuid, jsonb) — resolves every
--      products.category_id/recipes.category_id (required — must be
--      replaced) and recipe_categories.category_id (optional — replaced or
--      just removed) reference, then deletes the category.
--
-- Authorization shape (same as 009's delete_recipe): a personal row can
-- only be resolved/deleted by its own owner; a scope='site' row only by an
-- admin. Neither impact function reveals another user's personal recipe
-- names/codes — only counts. An admin never gets blanket access to another
-- user's personal products/categories/recipes; is_admin() only ever widens
-- what an admin can do to scope='site' rows (see 006's own comments on this
-- same boundary).
--
-- No favorites table exists in this schema (favorites are client-side
-- localStorage only — see app.js's `favoriteIds`/`LS_KEYS.favorites`), so
-- there is nothing server-side to include in these impact summaries for
-- that specific reference type; the recipe impact function in 009 already
-- reflects the same reality (no favorites field there either).

-- =========================================================================
-- 1. get_product_delete_impact — read-only. Never exposes another user's
--    private recipe names — only aggregate counts, exactly like
--    get_recipe_delete_impact's pending_request handling in 009. Personal
--    caller sees only their own personal-recipe usage; admin additionally
--    sees public-recipe usage of a scope='site' product.
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

  -- Recipes owned by the caller (personal) that use this product. Always
  -- computed, whether the product is personal or site — the caller's own
  -- personal recipes are always safe to reveal to the caller.
  select count(distinct ri.recipe_id) into v_own_recipe_count
    from public.recipe_ingredients ri
    join public.recipes r on r.id = ri.recipe_id
    where ri.product_id = p_product_id and r.scope = 'personal' and r.owner_id = v_uid;

  -- Public (scope='site') recipes using this product — only ever computed
  -- for an admin caller, never leaked to a non-admin (who could otherwise
  -- infer something about recipes they can't see, e.g. unpublished drafts).
  if v_is_admin then
    select count(distinct ri.recipe_id) into v_public_recipe_count
      from public.recipe_ingredients ri
      join public.recipes r on r.id = ri.recipe_id
      where ri.product_id = p_product_id and r.scope = 'site';
  else
    v_public_recipe_count := 0;
  end if;

  -- Personal recipes owned by someone OTHER than the caller — can only ever
  -- be non-zero for a scope='site' product (validate_reference_scope, 004,
  -- never lets a personal recipe reference another user's personal
  -- product). Count only, no id/name/owner — the frontend can never
  -- resolve these rows itself (RLS hides them), so this is surfaced purely
  -- as a "why is delete still blocked" signal, never as a list to act on.
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
    'total_ingredient_rows', coalesce(v_total_ingredient_rows, 0)
  );
end;
$$;

revoke execute on function public.get_product_delete_impact(uuid) from public;
grant execute on function public.get_product_delete_impact(uuid) to authenticated;

-- =========================================================================
-- 2. delete_product_resolved — p_resolution shape:
--    {
--      "ingredients": [
--        { "id": "<recipe_ingredients.id>", "action": "replace", "replacement_product_id": "<uuid>" },
--        { "id": "<recipe_ingredients.id>", "action": "remove" }
--      ]
--    }
--    Every recipe_ingredients row currently referencing the product MUST
--    appear exactly once in p_resolution.ingredients (re-verified against a
--    fresh, server-side read — the client's snapshot from
--    get_product_delete_impact is never trusted for the actual list of
--    rows); anything missing blocks the whole call before any write
--    happens. "replace" preserves quantity/sort_order/recipe_id, only
--    swapping product_id (and re-validates the replacement via the exact
--    same recipe/product scope rules recipe_ingredients' own trigger
--    enforces on ordinary INSERT/UPDATE, so a personal recipe can never end
--    up pointing at someone else's personal product this way either).
--    "remove" deletes only that recipe_ingredients row — never the parent
--    recipe, never the replacement product. change_requests referencing
--    the product (entity_type='product') are left untouched: source_id/
--    target_id are plain uuid columns (no FK — see 007's own header
--    comment), and source_code/target_code/payloads already preserve
--    everything needed for history, so no CASCADE and no manual cleanup is
--    needed or wanted here.
-- =========================================================================
create or replace function public.delete_product_resolved(
  p_product_id uuid,
  p_resolution jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_product record;
  v_ingredients jsonb;
  v_row jsonb;
  v_ing record;
  v_replacement record;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_product from public.products where id = p_product_id for update;
  if not found then
    raise exception 'product_not_found';
  end if;

  if v_product.scope = 'personal' then
    if v_product.owner_id is distinct from v_uid then
      raise exception 'not_owner';
    end if;
  elsif v_product.scope = 'site' then
    if not public.is_admin() then
      raise exception 'not_admin';
    end if;
  else
    raise exception 'unknown_scope';
  end if;

  v_ingredients := coalesce(p_resolution->'ingredients', '[]'::jsonb);

  for v_row in select * from jsonb_array_elements(v_ingredients)
  loop
    select * into v_ing from public.recipe_ingredients
      where id = (v_row->>'id')::uuid and product_id = p_product_id
      for update;
    if not found then
      -- Already resolved (or never referenced this product) — ignore
      -- rather than fail, so a stale/duplicate entry in the client's
      -- resolution payload can never block the whole operation.
      continue;
    end if;

    if v_row->>'action' = 'replace' then
      v_replacement := null;
      select * into v_replacement from public.products
        where id = (v_row->>'replacement_product_id')::uuid;
      if not found then
        raise exception 'replacement_product_not_found';
      end if;
      if v_replacement.id = p_product_id then
        raise exception 'replacement_product_same_as_deleted';
      end if;
      -- update triggers (enforce_recipe_ingredients_product_reference,
      -- 004) independently re-validate that the replacement is a scope/
      -- owner-compatible product for this specific recipe — this call
      -- cannot bypass that check.
      update public.recipe_ingredients
        set product_id = v_replacement.id
        where id = v_ing.id;
    elsif v_row->>'action' = 'remove' then
      delete from public.recipe_ingredients where id = v_ing.id;
    else
      raise exception 'invalid_ingredient_action:%', coalesce(v_row->>'action', 'null');
    end if;
  end loop;

  -- Anything still referencing the product that the resolution payload
  -- didn't account for blocks the delete — never silently dropped. This is
  -- a fresh read, not a check against v_live_ids/v_seen (those only drove
  -- which rows were visited above), so it also catches a row that was
  -- somehow re-pointed at this product concurrently.
  if exists (select 1 from public.recipe_ingredients where product_id = p_product_id) then
    raise exception 'unresolved_ingredient_references';
  end if;

  delete from public.products where id = p_product_id;

  return jsonb_build_object('action', 'deleted', 'product_id', p_product_id);
end;
$$;

revoke execute on function public.delete_product_resolved(uuid, jsonb) from public;
grant execute on function public.delete_product_resolved(uuid, jsonb) to authenticated;

-- =========================================================================
-- 3. get_category_delete_impact — same shape/authorization rules as
--    get_product_delete_impact above. required_ref_count is
--    products.category_id + recipes.category_id (NOT NULL columns —
--    deleting without resolving these would otherwise fail with a raw FK
--    error, same as recipe_ingredients.product_id above); optional_ref_count
--    is recipe_categories.category_id (a join-table row, safe to just
--    remove instead of requiring a replacement).
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

  if v_is_admin then
    select count(*) into v_public_product_count
      from public.products where category_id = p_category_id and scope = 'site';
    select count(*) into v_public_recipe_count
      from public.recipes where category_id = p_category_id and scope = 'site';
    select count(*) into v_public_section_count
      from public.recipe_categories rc join public.recipes r on r.id = rc.recipe_id
      where rc.category_id = p_category_id and r.scope = 'site';
  else
    v_public_product_count := 0;
    v_public_recipe_count := 0;
    v_public_section_count := 0;
  end if;

  -- Personal products/recipes/sections owned by someone OTHER than the
  -- caller — can only ever be non-zero for a scope='site' category
  -- (validate_reference_scope, 004, never lets a personal row reference
  -- another user's personal category). Count only, same reasoning as
  -- get_product_delete_impact's v_foreign_personal_recipe_count above:
  -- surfaced only as a "why is delete still blocked" signal, never as a
  -- resolvable list (RLS hides the actual rows from this caller).
  select
    (select count(*) from public.products where category_id = p_category_id and scope = 'personal' and owner_id is distinct from v_uid)
    + (select count(*) from public.recipes where category_id = p_category_id and scope = 'personal' and owner_id is distinct from v_uid)
    + (select count(*) from public.recipe_categories rc join public.recipes r on r.id = rc.recipe_id
         where rc.category_id = p_category_id and r.scope = 'personal' and r.owner_id is distinct from v_uid)
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
    'foreign_personal_ref_count', coalesce(v_foreign_personal_ref_count, 0),
    'pending_request_count', coalesce(v_pending_request_count, 0),
    'pending_request_codes', to_jsonb(coalesce(v_pending_codes, '{}'::text[])),
    'required_ref_count', coalesce(v_own_product_count, 0) + coalesce(v_public_product_count, 0)
      + coalesce(v_own_recipe_count, 0) + coalesce(v_public_recipe_count, 0),
    'optional_ref_count', coalesce(v_own_section_count, 0) + coalesce(v_public_section_count, 0)
  );
end;
$$;

revoke execute on function public.get_category_delete_impact(uuid) from public;
grant execute on function public.get_category_delete_impact(uuid) to authenticated;

-- =========================================================================
-- 4. delete_category_resolved — p_resolution shape:
--    {
--      "products": [ { "id": "<products.id>", "replacement_category_id": "<uuid>" } ],
--      "recipes":  [ { "id": "<recipes.id>",  "replacement_category_id": "<uuid>" } ],
--      "sections": [
--        { "recipe_id": "<uuid>", "action": "replace", "replacement_category_id": "<uuid>" },
--        { "recipe_id": "<uuid>", "action": "remove" }
--      ]
--    }
--    products.category_id and recipes.category_id are NOT NULL, so every
--    live row referencing the category being deleted MUST have a
--    replacement — never just "removed". recipe_categories rows may
--    instead be removed outright (action:"remove"), since that table is a
--    plain many-to-many join and dropping one row never leaves a required
--    column null. Every replacement category is independently re-validated
--    here (type match, scope/owner match via
--    public.validate_reference_scope, active=true) — a client cannot pass
--    an incompatible category (e.g. "receita" in place of "proteina") and
--    have it silently accepted; the same rule is also enforced a second
--    time by the underlying UPDATE triggers from 004, so this check is
--    defense-in-depth, not the only guard.
-- =========================================================================
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
      -- Insert-then-delete (never a bare UPDATE) since the primary key is
      -- (recipe_id, category_id) and the replacement might already exist
      -- for this recipe — ON CONFLICT DO NOTHING keeps this idempotent
      -- either way.
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

  delete from public.categories where id = p_category_id;

  return jsonb_build_object('action', 'deleted', 'category_id', p_category_id);
end;
$$;

revoke execute on function public.delete_category_resolved(uuid, jsonb) from public;
grant execute on function public.delete_category_resolved(uuid, jsonb) to authenticated;

-- =========================================================================
-- 5. delete_recipe_action — gives an admin an EXPLICIT archive-vs-delete
--    choice for a scope='site' recipe, instead of 009's delete_recipe()
--    always auto-archiving once there is any history (published/shared/
--    granted). Per the plan: "Não obrigue o arquivamento quando a exclusão
--    permanente for possível e todas as referências tiverem sido
--    resolvidas" — an admin who has already resolved every live share/
--    grant/pending-request may choose p_action='delete' even on a recipe
--    that was once published, and this hard-deletes it; p_action='archive'
--    is always available for a scope='site' recipe regardless of history,
--    for the same "não force uma decisão irreversível" reasoning.
--    A scope='personal' recipe has no 'archived' status available to it at
--    all (recipes_personal_requires_private_ck, 004) — p_action='archive'
--    on a personal recipe always raises. p_action='delete' on a personal
--    recipe behaves exactly like 009's delete_recipe(): plain owner-gated
--    hard delete once shares/pending requests are resolved. This function
--    does not replace delete_recipe() (009) — that RPC's own
--    automatic-archive behavior is left completely untouched for any
--    existing caller — it is purely an additional, explicit-choice path.
-- =========================================================================
create or replace function public.delete_recipe_action(
  p_recipe_id uuid,
  p_action text,
  p_revoke_shares boolean default false,
  p_cancel_pending_requests boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_recipe record;
  v_pending_count integer;
  v_active_share boolean;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_action not in ('archive', 'delete') then
    raise exception 'invalid_action:%', coalesce(p_action, 'null');
  end if;

  select * into v_recipe from public.recipes where id = p_recipe_id for update;
  if not found then
    raise exception 'recipe_not_found';
  end if;

  if v_recipe.scope = 'personal' then
    if v_recipe.owner_id is distinct from v_uid then
      raise exception 'not_owner';
    end if;
    if p_action = 'archive' then
      raise exception 'personal_recipes_cannot_be_archived';
    end if;
  elsif v_recipe.scope = 'site' then
    if not public.is_admin() then
      raise exception 'not_admin';
    end if;
  else
    raise exception 'unknown_scope';
  end if;

  select count(*) into v_pending_count
    from public.change_requests
    where (source_id = p_recipe_id or target_id = p_recipe_id)
      and status in ('submitted', 'resubmitted', 'changes_requested');

  if v_pending_count > 0 then
    if not p_cancel_pending_requests then
      raise exception 'pending_requests_exist:%', v_pending_count;
    end if;
    update public.change_requests
      set status = 'cancelled', reviewed_at = now(), reviewed_by = v_uid
      where (source_id = p_recipe_id or target_id = p_recipe_id)
        and status in ('submitted', 'resubmitted', 'changes_requested');
  end if;

  select active into v_active_share from public.recipe_shares where recipe_id = p_recipe_id;
  if coalesce(v_active_share, false) then
    if not p_revoke_shares then
      raise exception 'active_share_exists';
    end if;
    update public.recipe_shares set active = false, updated_at = now() where recipe_id = p_recipe_id;
    update public.recipe_access_grants set revoked_at = now() where recipe_id = p_recipe_id and revoked_at is null;
  end if;

  if p_action = 'archive' then
    update public.recipes set status = 'archived', updated_at = now(), updated_by = v_uid where id = p_recipe_id;
    return jsonb_build_object('action', 'archived', 'recipe_id', p_recipe_id);
  end if;

  -- p_action = 'delete': hard-delete regardless of history, now that every
  -- live share/grant/pending-request has been resolved above — the caller
  -- (admin, for a site recipe) explicitly chose this over archiving.
  delete from public.recipes where id = p_recipe_id;
  return jsonb_build_object('action', 'deleted', 'recipe_id', p_recipe_id);
end;
$$;

revoke execute on function public.delete_recipe_action(uuid, text, boolean, boolean) from public;
grant execute on function public.delete_recipe_action(uuid, text, boolean, boolean) to authenticated;
