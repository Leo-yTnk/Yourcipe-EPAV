-- Yourcipe — recipe deletion with reference-checking.
-- Review every statement before running it. Idempotent (every object uses
-- create or replace / drop-if-exists), safe to re-run.
--
-- Requires supabase/schema.sql, 002, 004_catalog_schema.sql,
-- 005_creation_mode_sharing.sql, 006_admin_catalog_publishing.sql and
-- 007_change_requests.sql already applied. 008 (seed data) is not required
-- but is harmless either way.
--
-- Context / why this exists: before this migration there was no
-- server-side way to delete a personal recipe while also resolving its
-- live references (active recipe_shares, recipe_access_grants, pending
-- change_requests) in one atomic step — the front end's old
-- `catalog.deleteRecipe()` was a bare `delete from recipes`, relying only
-- on RLS + FK CASCADEs, and left dangling recipe_shares/grants (which do
-- cascade-delete, so no orphan rows, but also no chance to warn the user
-- "N people currently have access") and, crucially, left any pending
-- change_requests referencing the recipe (source_id/target_id, which are
-- plain uuid columns — see 007_change_requests.sql — never FKs, so nothing
-- stops a delete from leaving them pointing at nothing) completely
-- untouched. This migration adds:
--   1. get_recipe_delete_impact(uuid) — read-only "what references this
--      recipe" check, for the front end's confirmation/reference-resolution
--      UI to call before ever attempting a delete.
--   2. delete_recipe(uuid, boolean, boolean) — the actual delete, gated on
--      the caller explicitly acknowledging (via the two boolean flags) any
--      live share/grants and pending requests found by (1). Runs as one
--      Postgres function invocation, so it is transactional: if any check
--      fails partway through, the whole thing rolls back — no partial
--      "shares revoked but recipe still there" state is possible.
--
-- Deliberately does NOT add a DELETE RLS policy for scope='site' recipes.
-- supabase/006_admin_catalog_publishing.sql already documents (see its
-- comment near the site RLS policies) that admin is intended to manage the
-- public catalog's lifecycle via status/active rather than hard-deleting
-- it — hard-deleting a recipe that real visitors/other admins already
-- depend on (it was published, or was ever shared/granted) would silently
-- break those references, which is exactly the "don't delete silently"
-- rule this whole feature exists to enforce. So delete_recipe() below
-- keeps that spirit for scope='site' rows: if the row was ever published,
-- ever shared, or still has any access grant, it archives (status
-- ='archived') instead of hard-deleting, and only hard-deletes a
-- scope='site' row that has no such history. This satisfies "somente
-- admin pode excluir receita pública" (only delete_recipe(), admin-gated,
-- can ever remove a public recipe from the live catalog) while also
-- satisfying "prefira arquivamento quando houver histórico relevante".
-- A personal recipe (scope='personal') has no 'archived' status available
-- to it at all (recipes_personal_requires_private_ck forces status
-- ='private' for every personal row), so personal deletes always hard-
-- delete once its references are resolved.

-- =========================================================================
-- 1. get_recipe_delete_impact — read-only. Returns a jsonb summary of
--    every live reference to a recipe, for the "Referências a resolver"
--    popup. Raises if the caller isn't the personal owner or (for a
--    scope='site' row) an admin — same authorization shape as delete_recipe
--    below, so a caller can never probe a recipe they couldn't also delete.
-- =========================================================================
create or replace function public.get_recipe_delete_impact(p_recipe_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_recipe record;
  v_is_owner boolean;
  v_is_admin boolean;
  v_active_share boolean;
  v_share_code text;
  v_active_grant_count integer;
  v_pending_request_count integer;
  v_pending_codes text[];
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_recipe from public.recipes where id = p_recipe_id;
  if not found then
    raise exception 'recipe_not_found';
  end if;

  v_is_admin := public.is_admin();
  v_is_owner := v_recipe.scope = 'personal' and v_recipe.owner_id = v_uid;

  if not (v_is_owner or (v_recipe.scope = 'site' and v_is_admin)) then
    raise exception 'not_authorized';
  end if;

  select rs.active, rs.share_code into v_active_share, v_share_code
    from public.recipe_shares rs where rs.recipe_id = p_recipe_id;

  select count(*) into v_active_grant_count
    from public.recipe_access_grants where recipe_id = p_recipe_id and revoked_at is null;

  select count(*), coalesce(array_agg(request_code order by request_code), '{}')
    into v_pending_request_count, v_pending_codes
    from public.change_requests
    where (source_id = p_recipe_id or target_id = p_recipe_id)
      and status in ('submitted', 'resubmitted', 'changes_requested');

  return jsonb_build_object(
    'recipe_id', v_recipe.id,
    'recipe_code', v_recipe.recipe_code,
    'name', v_recipe.name,
    'scope', v_recipe.scope,
    'status', v_recipe.status,
    'is_owner', v_is_owner,
    'is_admin', v_is_admin,
    'active_share', coalesce(v_active_share, false),
    'share_code', case when v_is_owner then v_share_code else null end,
    'active_grant_count', coalesce(v_active_grant_count, 0),
    'pending_request_count', coalesce(v_pending_request_count, 0),
    'pending_request_codes', to_jsonb(coalesce(v_pending_codes, '{}'::text[])),
    'recommend_archive', v_recipe.scope = 'site' and (
      coalesce(v_active_grant_count, 0) > 0
      or coalesce(v_active_share, false)
      or v_recipe.published_at is not null
    )
  );
end;
$$;

revoke execute on function public.get_recipe_delete_impact(uuid) from public;
grant execute on function public.get_recipe_delete_impact(uuid) to authenticated;

-- =========================================================================
-- 2. delete_recipe — the actual delete/archive. p_revoke_shares and
--    p_cancel_pending_requests are explicit, caller-supplied
--    acknowledgements (never inferred) that the front end sets only after
--    the user has seen the impact summary above and chosen to resolve
--    those references; if a live share or a pending request exists and the
--    matching flag is false, the whole call raises and nothing is changed
--    (transactional — this is one function invocation, one implicit
--    transaction).
-- =========================================================================
create or replace function public.delete_recipe(
  p_recipe_id uuid,
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
  v_ever_history boolean;
  v_action text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  -- Lock the row first so a concurrent delete/archive of the same recipe
  -- can't race this one.
  select * into v_recipe from public.recipes where id = p_recipe_id for update;
  if not found then
    raise exception 'recipe_not_found';
  end if;

  if v_recipe.scope = 'personal' then
    if v_recipe.owner_id is distinct from v_uid then
      raise exception 'not_owner';
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

  select
    exists(select 1 from public.recipe_shares where recipe_id = p_recipe_id)
    or exists(select 1 from public.recipe_access_grants where recipe_id = p_recipe_id)
    or v_recipe.published_at is not null
    into v_ever_history;

  if v_recipe.scope = 'site' and v_ever_history then
    update public.recipes set status = 'archived', updated_at = now(), updated_by = v_uid where id = p_recipe_id;
    v_action := 'archived';
  else
    -- recipe_ingredients, recipe_categories, recipe_shares and
    -- recipe_access_grants all cascade-delete on recipes.id (see
    -- 004_catalog_schema.sql / 005_creation_mode_sharing.sql) — products
    -- and categories referenced by this recipe are never touched
    -- (ON DELETE RESTRICT on recipe_ingredients.product_id and no cascade
    -- from recipes.category_id, by design).
    delete from public.recipes where id = p_recipe_id;
    v_action := 'deleted';
  end if;

  return jsonb_build_object('action', v_action, 'recipe_id', p_recipe_id);
end;
$$;

revoke execute on function public.delete_recipe(uuid, boolean, boolean) from public;
grant execute on function public.delete_recipe(uuid, boolean, boolean) to authenticated;
