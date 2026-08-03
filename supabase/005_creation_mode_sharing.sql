-- Yourcipe — Modo de Criação: personal recipe sharing, personal copies, and
-- safe authorship lookup. Builds on supabase/004_catalog_schema.sql, which
-- already lets ANY authenticated user CRUD their own scope='personal' rows
-- in categories/products/recipes/recipe_ingredients/recipe_categories (see
-- the "*_insert_personal"/"*_update_personal" policies there — there is no
-- admin check on those, by design). This file does not touch that; "Modo de
-- Criação" is a front-end relabeling + gating change (any authenticated user
-- may open it, scoped to their own data), not a new schema requirement.
--
-- This file adds:
--   1. public.recipe_shares         — one row per recipe's current share
--                                      config (share_code, active/inactive).
--   2. public.recipe_access_grants  — who has read-only access to a shared
--                                      personal recipe, and since when.
--   3. RPCs (all SECURITY DEFINER, all owner/grantee-scoped, all
--      transactional as a consequence of being single plpgsql function
--      bodies): activate/regenerate/deactivate sharing, revoke access,
--      redeem a share code, read a safe author display name, and create an
--      independent personal copy of a recipe with interactive reference
--      resolution.
--   4. RLS additions on recipes/recipe_ingredients/recipe_categories/
--      products/categories so a grantee can read (never write) a shared
--      recipe and everything it currently references, live — including the
--      owner's current product prices — without duplicating any of that
--      data.
--
-- Review every statement before running it. Idempotent — safe to re-run.
-- Depends on supabase/schema.sql, supabase/002_profiles_display_name_phase1.sql
-- and supabase/004_catalog_schema.sql already being applied.

-- =========================================================================
-- 1. public.recipe_shares
--    Exactly one row per recipe that has ever had sharing turned on.
--    share_code is random (not the sequential recipe_code), unique,
--    server-generated only, and never writable directly by the client —
--    `authenticated` gets SELECT only (RLS-restricted to the owner's own
--    rows below); every write goes through the RPCs in section 5, which run
--    SECURITY DEFINER and therefore need no table grant of their own to
--    mutate it. This is the same "no direct grant, functions only" pattern
--    004 already uses for category_code_seq/product_code_seq/recipe_code_seq.
-- =========================================================================
create table if not exists public.recipe_shares (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null unique references public.recipes (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  share_code text not null unique,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.recipe_shares enable row level security;

-- =========================================================================
-- 2. public.recipe_access_grants
--    One row per (recipe, grantee) redemption. A row with revoked_at is
--    still kept (audit trail of past access) — the partial unique index
--    below only guards against two simultaneously-ACTIVE grants for the
--    same (recipe, grantee) pair; redeeming again after a revoke inserts a
--    brand-new row rather than reviving the old one.
-- =========================================================================
create table if not exists public.recipe_access_grants (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  share_id uuid not null references public.recipe_shares (id) on delete cascade,
  grantee_id uuid not null references auth.users (id) on delete cascade,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz
);

create unique index if not exists recipe_access_grants_active_uk
  on public.recipe_access_grants (recipe_id, grantee_id) where revoked_at is null;
create index if not exists recipe_access_grants_grantee_idx
  on public.recipe_access_grants (grantee_id) where revoked_at is null;
create index if not exists recipe_access_grants_recipe_idx
  on public.recipe_access_grants (recipe_id);

alter table public.recipe_access_grants enable row level security;

-- =========================================================================
-- 3. Integrity triggers (defense in depth — the RPCs in section 5 already
--    validate all of this before writing; these triggers hold even if
--    something someday writes to these tables outside those RPCs, e.g. a
--    human in the SQL Editor making a mistake).
-- =========================================================================
create or replace function public.enforce_recipe_shares_ownership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipe public.recipes%rowtype;
begin
  select * into v_recipe from public.recipes where id = new.recipe_id;
  if not found then
    raise exception 'recipe_shares.recipe_id % does not exist', new.recipe_id;
  end if;
  if v_recipe.scope <> 'personal' then
    raise exception 'recipe_shares.recipe_id must reference a scope=personal recipe';
  end if;
  if v_recipe.owner_id is distinct from new.owner_id then
    raise exception 'recipe_shares.owner_id must match the recipe''s own owner_id';
  end if;
  return new;
end;
$$;
revoke execute on function public.enforce_recipe_shares_ownership() from public;

drop trigger if exists trg_recipe_shares_ownership on public.recipe_shares;
create trigger trg_recipe_shares_ownership
  before insert or update of recipe_id, owner_id on public.recipe_shares
  for each row execute function public.enforce_recipe_shares_ownership();

create or replace function public.enforce_recipe_access_grants_consistency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_share public.recipe_shares%rowtype;
begin
  select * into v_share from public.recipe_shares where id = new.share_id;
  if not found then
    raise exception 'recipe_access_grants.share_id % does not exist', new.share_id;
  end if;
  if v_share.recipe_id is distinct from new.recipe_id then
    raise exception 'recipe_access_grants.recipe_id must match recipe_shares.recipe_id for the given share_id';
  end if;
  if v_share.owner_id = new.grantee_id then
    raise exception 'recipe_access_grants.grantee_id cannot be the recipe''s own owner';
  end if;
  return new;
end;
$$;
revoke execute on function public.enforce_recipe_access_grants_consistency() from public;

drop trigger if exists trg_recipe_access_grants_consistency on public.recipe_access_grants;
create trigger trg_recipe_access_grants_consistency
  before insert or update of recipe_id, share_id, grantee_id on public.recipe_access_grants
  for each row execute function public.enforce_recipe_access_grants_consistency();

-- =========================================================================
-- 4. share_code generation — random, collision-checked, distinct in shape
--    from the sequential YCR-0001 recipe_code (point of the spec: "diferente
--    do recipe_code sequencial"). Built from gen_random_uuid() (already
--    relied on elsewhere in this schema for id defaults), not a sequence —
--    there is deliberately no ordering/guessability relationship between
--    consecutive share codes, unlike recipe_code/product_code/category_code.
-- =========================================================================
create or replace function public.generate_recipe_share_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  loop
    v_code := 'YSH-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
    exit when not exists (select 1 from public.recipe_shares where share_code = v_code);
  end loop;
  return v_code;
end;
$$;
revoke execute on function public.generate_recipe_share_code() from public;

create or replace function public.assign_recipe_share_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.share_code is null or new.share_code = '' then
    new.share_code := public.generate_recipe_share_code();
  end if;
  return new;
end;
$$;
revoke execute on function public.assign_recipe_share_code() from public;

drop trigger if exists trg_assign_recipe_share_code on public.recipe_shares;
create trigger trg_assign_recipe_share_code
  before insert on public.recipe_shares
  for each row execute function public.assign_recipe_share_code();

-- =========================================================================
-- 5. RPCs. All SECURITY DEFINER (needed: grantees have no SELECT on
--    recipe_shares at all, and no table grants exist for INSERT/UPDATE on
--    either table for `authenticated` — see the grants at the bottom of
--    this file), all owner- or grantee-scoped via auth.uid() only (never a
--    client-supplied user id), all a single plpgsql function body and
--    therefore atomic: any raised exception rolls back every write the call
--    made, satisfying "criação de acesso e cópia devem ser transacionais".
-- =========================================================================

-- ---- 5a. Owner-side sharing controls ----
create or replace function public.activate_recipe_sharing(p_recipe_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_code text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if not exists (select 1 from public.recipes where id = p_recipe_id and scope = 'personal' and owner_id = v_uid) then
    raise exception 'recipe_not_found';
  end if;
  update public.recipe_shares
    set active = true, updated_at = now()
    where recipe_id = p_recipe_id and owner_id = v_uid
    returning share_code into v_code;
  if not found then
    insert into public.recipe_shares (recipe_id, owner_id, active)
    values (p_recipe_id, v_uid, true)
    returning share_code into v_code;
  end if;
  return v_code;
end;
$$;
revoke execute on function public.activate_recipe_sharing(uuid) from public;
grant execute on function public.activate_recipe_sharing(uuid) to authenticated;

-- "Gerar novo ID": rotates share_code so any previously-distributed code
-- stops working for NEW redemptions. Existing grants already redeemed under
-- the old code are untouched — rotating the code is not the same action as
-- revoking access (see "Revogar acessos" below).
create or replace function public.regenerate_recipe_share_code(p_recipe_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_code text := public.generate_recipe_share_code();
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if not exists (select 1 from public.recipes where id = p_recipe_id and scope = 'personal' and owner_id = v_uid) then
    raise exception 'recipe_not_found';
  end if;
  update public.recipe_shares
    set share_code = v_code, active = true, updated_at = now()
    where recipe_id = p_recipe_id and owner_id = v_uid;
  if not found then
    insert into public.recipe_shares (recipe_id, owner_id, active, share_code)
    values (p_recipe_id, v_uid, true, v_code);
  end if;
  return v_code;
end;
$$;
revoke execute on function public.regenerate_recipe_share_code(uuid) from public;
grant execute on function public.regenerate_recipe_share_code(uuid) to authenticated;

-- "Desativar novos compartilhamentos": blocks future redeem_recipe_share()
-- calls for this recipe. Grants already made are untouched.
create or replace function public.deactivate_recipe_sharing(p_recipe_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if not exists (select 1 from public.recipes where id = p_recipe_id and scope = 'personal' and owner_id = v_uid) then
    raise exception 'recipe_not_found';
  end if;
  update public.recipe_shares
    set active = false, updated_at = now()
    where recipe_id = p_recipe_id and owner_id = v_uid;
end;
$$;
revoke execute on function public.deactivate_recipe_sharing(uuid) from public;
grant execute on function public.deactivate_recipe_sharing(uuid) to authenticated;

-- "Revogar acessos": with p_grantee_id null, revokes every currently-active
-- grant for the recipe; with p_grantee_id set, revokes just that one
-- grantee. Never deletes the row (audit trail) and never touches any
-- independent copy already made under create_recipe_copy() below — copies
-- have no foreign key back to the grant, so they cannot be affected by this
-- ("revogação... não apaga cópias independentes").
create or replace function public.revoke_recipe_access(p_recipe_id uuid, p_grantee_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_count integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if not exists (select 1 from public.recipes where id = p_recipe_id and scope = 'personal' and owner_id = v_uid) then
    raise exception 'recipe_not_found';
  end if;
  update public.recipe_access_grants
    set revoked_at = now()
    where recipe_id = p_recipe_id
      and revoked_at is null
      and (p_grantee_id is null or grantee_id = p_grantee_id);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke execute on function public.revoke_recipe_access(uuid, uuid) from public;
grant execute on function public.revoke_recipe_access(uuid, uuid) to authenticated;

-- ---- 5b. Grantee-side redemption ----
-- "Cadastrar Receita por ID": any invalid/inactive/unknown code returns the
-- exact same generic error, `invalid_share_code` — the caller must not be
-- able to distinguish "wrong code" from "code for a revoked share" from
-- "code that was never valid" (point of the spec: "share_code inválido
-- retorna mensagem genérica"). Redeeming your own recipe's code is not a
-- security-sensitive branch (it does not depend on guessing anything) and
-- gets its own distinct, friendly error instead.
create or replace function public.redeem_recipe_share(p_share_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_share public.recipe_shares%rowtype;
  v_code text;
begin
  if v_uid is null then
    raise exception 'invalid_share_code';
  end if;
  v_code := upper(btrim(coalesce(p_share_code, '')));
  select * into v_share from public.recipe_shares where share_code = v_code and active = true;
  if not found then
    raise exception 'invalid_share_code';
  end if;
  if not exists (
    select 1 from public.recipes
    where id = v_share.recipe_id and scope = 'personal' and owner_id = v_share.owner_id
  ) then
    raise exception 'invalid_share_code';
  end if;
  if v_share.owner_id = v_uid then
    raise exception 'cannot_add_own_recipe';
  end if;
  if not exists (
    select 1 from public.recipe_access_grants
    where recipe_id = v_share.recipe_id and grantee_id = v_uid and revoked_at is null
  ) then
    insert into public.recipe_access_grants (recipe_id, share_id, grantee_id)
    values (v_share.recipe_id, v_share.id, v_uid);
  end if;
  return v_share.recipe_id;
end;
$$;
revoke execute on function public.redeem_recipe_share(text) from public;
grant execute on function public.redeem_recipe_share(text) to authenticated;

-- ---- 5c. Safe authorship lookup ----
-- Returns ONLY display_name, and only for a recipe the caller may actually
-- see (own personal recipe, published site recipe, or a recipe they hold an
-- active grant for) — never a uuid, role, email, or any other profile
-- column, and never for a recipe the caller cannot otherwise read. Used by
-- "Criado por {display_name}"; a copy's `owner_id` is the copier (set by
-- create_recipe_copy below), so this naturally shows the new owner for a
-- copy and the original owner for a share, without any extra bookkeeping.
create or replace function public.get_recipe_author_name(p_recipe_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_r public.recipes%rowtype;
  v_owner uuid;
  v_name text;
begin
  select * into v_r from public.recipes where id = p_recipe_id;
  if not found then
    return null;
  end if;
  if not (
    (v_r.scope = 'site' and v_r.status = 'published')
    or (v_r.scope = 'personal' and v_r.owner_id = v_uid)
    or (v_uid is not null and exists (
      select 1 from public.recipe_access_grants g
      where g.recipe_id = v_r.id and g.grantee_id = v_uid and g.revoked_at is null
    ))
  ) then
    return null;
  end if;
  v_owner := coalesce(v_r.owner_id, v_r.created_by);
  if v_owner is null then
    return null;
  end if;
  select display_name into v_name from public.profiles where id = v_owner;
  return v_name;
end;
$$;
revoke execute on function public.get_recipe_author_name(uuid) from public;
grant execute on function public.get_recipe_author_name(uuid) to anon, authenticated;

-- ---- 5d. "Criar cópia própria" ----
-- p_resolutions is a jsonb array of
--   {"ref_type": "category"|"product", "ref_id": "<uuid>", "action": "add"|"map"|"remove", "target_id": "<uuid or null>"}
-- one entry per foreign reference (a scope='personal' category/product owned
-- by someone other than the caller) that the source recipe touches — its
-- own category, every recipe_categories tag, and every ingredient's
-- product. The function recomputes that foreign-reference set itself from
-- the current data (never trusts the client's idea of what's foreign) and
-- raises `unresolved_reference` for anything missing a decision, which is
-- what actually enforces "não finalize enquanto houver referências sem
-- decisão" — the client-side popup is a UX convenience, this is the
-- authority. Every reference not sent by the client for a non-foreign
-- (site or already-own) item is simply reused as-is; no decision is needed
-- or accepted for those.
create or replace function public.create_recipe_copy(p_recipe_id uuid, p_resolutions jsonb default '[]'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_src public.recipes%rowtype;
  v_new_id uuid;
  v_new_category_id uuid;
  v_res jsonb;
  v_cat public.categories%rowtype;
  v_action text;
  v_target uuid;
  v_new_prod_cat uuid;
  v_new_prod_id uuid;
  r record;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_src from public.recipes where id = p_recipe_id;
  if not found then
    raise exception 'recipe_not_found';
  end if;

  if not (
    (v_src.scope = 'personal' and v_src.owner_id = v_uid)
    or (v_src.scope = 'site' and v_src.status = 'published')
    or exists (
      select 1 from public.recipe_access_grants g
      where g.recipe_id = v_src.id and g.grantee_id = v_uid and g.revoked_at is null
    )
  ) then
    raise exception 'recipe_not_found';
  end if;

  drop table if exists pg_temp.yc_copy_map;
  create temp table yc_copy_map (
    ref_type text not null,
    ref_id uuid not null,
    action text not null check (action in ('add', 'map', 'remove')),
    target_id uuid,
    primary key (ref_type, ref_id)
  ) on commit drop;

  for v_res in select * from jsonb_array_elements(coalesce(p_resolutions, '[]'::jsonb))
  loop
    insert into yc_copy_map (ref_type, ref_id, action, target_id)
    values (
      v_res ->> 'ref_type',
      (v_res ->> 'ref_id')::uuid,
      v_res ->> 'action',
      nullif(v_res ->> 'target_id', '')::uuid
    )
    on conflict (ref_type, ref_id) do update set action = excluded.action, target_id = excluded.target_id;
  end loop;

  -- 1) The recipe's own category (type=receita).
  select * into v_cat from public.categories where id = v_src.category_id;
  if v_cat.scope = 'site' or v_cat.owner_id = v_uid then
    v_new_category_id := v_cat.id;
  else
    select action, target_id into v_action, v_target from yc_copy_map where ref_type = 'category' and ref_id = v_cat.id;
    if v_action is null then
      raise exception 'unresolved_reference:category:%', v_cat.id;
    elsif v_action = 'remove' then
      raise exception 'cannot_remove_primary_category';
    elsif v_action = 'map' then
      if not exists (
        select 1 from public.categories
        where id = v_target and type = 'receita'
          and ((scope = 'site' and active) or (scope = 'personal' and owner_id = v_uid))
      ) then
        raise exception 'invalid_category_mapping';
      end if;
      v_new_category_id := v_target;
    else
      insert into public.categories (scope, owner_id, type, name, sort_order, active)
      values ('personal', v_uid, v_cat.type, v_cat.name, v_cat.sort_order, true)
      returning id into v_new_category_id;
    end if;
  end if;

  -- 2) The new, fully independent recipe row.
  insert into public.recipes (
    owner_id, scope, status, name, category_id, prep_time, servings, difficulty,
    image_url, featured, extras, instructions, tips
  ) values (
    v_uid, 'personal', 'private', v_src.name, v_new_category_id, v_src.prep_time, v_src.servings, v_src.difficulty,
    v_src.image_url, false, v_src.extras, v_src.instructions, v_src.tips
  ) returning id into v_new_id;

  -- 3) recipe_categories (section tags, type=secao).
  for r in
    select c.id as category_id, c.scope, c.owner_id, c.type, c.name, c.sort_order
    from public.recipe_categories rc
    join public.categories c on c.id = rc.category_id
    where rc.recipe_id = v_src.id
  loop
    if r.scope = 'site' or r.owner_id = v_uid then
      insert into public.recipe_categories (recipe_id, category_id) values (v_new_id, r.category_id);
    else
      select action, target_id into v_action, v_target from yc_copy_map where ref_type = 'category' and ref_id = r.category_id;
      if v_action is null then
        raise exception 'unresolved_reference:category:%', r.category_id;
      elsif v_action = 'remove' then
        continue;
      elsif v_action = 'map' then
        if not exists (
          select 1 from public.categories
          where id = v_target and type = 'secao'
            and ((scope = 'site' and active) or (scope = 'personal' and owner_id = v_uid))
        ) then
          raise exception 'invalid_category_mapping';
        end if;
        insert into public.recipe_categories (recipe_id, category_id) values (v_new_id, v_target);
      else
        insert into public.categories (scope, owner_id, type, name, sort_order, active)
        values ('personal', v_uid, r.type, r.name, r.sort_order, true)
        returning id into v_target;
        insert into public.recipe_categories (recipe_id, category_id) values (v_new_id, v_target);
      end if;
    end if;
  end loop;

  -- 4) Ingredients (products).
  for r in
    select p.id as product_id, p.scope, p.owner_id, p.name, p.category_id, p.unit, p.price,
           ri.quantity, ri.sort_order
    from public.recipe_ingredients ri
    join public.products p on p.id = ri.product_id
    where ri.recipe_id = v_src.id
  loop
    if r.scope = 'site' or r.owner_id = v_uid then
      insert into public.recipe_ingredients (recipe_id, product_id, quantity, sort_order)
      values (v_new_id, r.product_id, r.quantity, r.sort_order);
    else
      select action, target_id into v_action, v_target from yc_copy_map where ref_type = 'product' and ref_id = r.product_id;
      if v_action is null then
        raise exception 'unresolved_reference:product:%', r.product_id;
      elsif v_action = 'remove' then
        continue;
      elsif v_action = 'map' then
        if not exists (
          select 1 from public.products
          where id = v_target and ((scope = 'site' and active) or (scope = 'personal' and owner_id = v_uid))
        ) then
          raise exception 'invalid_product_mapping';
        end if;
        insert into public.recipe_ingredients (recipe_id, product_id, quantity, sort_order)
        values (v_new_id, v_target, r.quantity, r.sort_order);
      else
        select * into v_cat from public.categories where id = r.category_id;
        if v_cat.scope = 'site' or v_cat.owner_id = v_uid then
          v_new_prod_cat := v_cat.id;
        else
          select id into v_new_prod_cat from public.categories
            where scope = 'personal' and owner_id = v_uid and type = v_cat.type and slug = public.slugify(v_cat.name)
            limit 1;
          if v_new_prod_cat is null then
            insert into public.categories (scope, owner_id, type, name, sort_order, active)
            values ('personal', v_uid, v_cat.type, v_cat.name, v_cat.sort_order, true)
            returning id into v_new_prod_cat;
          end if;
        end if;
        insert into public.products (owner_id, scope, name, category_id, unit, price, active)
        values (v_uid, 'personal', r.name, v_new_prod_cat, r.unit, r.price, true)
        returning id into v_new_prod_id;
        insert into public.recipe_ingredients (recipe_id, product_id, quantity, sort_order)
        values (v_new_id, v_new_prod_id, r.quantity, r.sort_order);
      end if;
    end if;
  end loop;

  drop table if exists pg_temp.yc_copy_map;
  return v_new_id;
end;
$$;
revoke execute on function public.create_recipe_copy(uuid, jsonb) from public;
grant execute on function public.create_recipe_copy(uuid, jsonb) to authenticated;

-- =========================================================================
-- 6. RLS helper functions — STABLE, SECURITY DEFINER, checking only
--    auth.uid()'s own relationship to a given recipe, exactly like
--    is_admin() in supabase/004_catalog_schema.sql and for the same reason:
--    recipes' own "shared" policy (section 8) needs to check
--    recipe_access_grants, and recipe_access_grants' own "owner" policy
--    (section 7) needs to check recipes — two PERMISSIVE policies on
--    different tables that each query the other. Evaluating either side
--    through ordinary RLS-protected SELECTs is a genuine infinite
--    recursion (confirmed while testing this file: Postgres raises
--    "infinite recursion detected in policy for relation
--    recipe_access_grants" if these are plain EXISTS subqueries against the
--    RLS-protected tables). SECURITY DEFINER functions run as their owner,
--    which bypasses RLS on the table they query (Postgres does not apply
--    RLS to a table's owner unless FORCE ROW LEVEL SECURITY is set, which
--    is deliberately not set on any table here) — so these functions break
--    the cycle the same way is_admin() already does for profiles.
-- =========================================================================
create or replace function public.owns_personal_recipe(p_recipe_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.recipes
    where id = p_recipe_id and scope = 'personal' and owner_id = auth.uid()
  );
$$;
revoke execute on function public.owns_personal_recipe(uuid) from public;
grant execute on function public.owns_personal_recipe(uuid) to authenticated;

create or replace function public.has_active_recipe_grant(p_recipe_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.recipe_access_grants
    where recipe_id = p_recipe_id and grantee_id = auth.uid() and revoked_at is null
  );
$$;
revoke execute on function public.has_active_recipe_grant(uuid) from public;
grant execute on function public.has_active_recipe_grant(uuid) to authenticated;

-- =========================================================================
-- 7. RLS — recipe_shares / recipe_access_grants.
--    No INSERT/UPDATE/DELETE policy at all for either table: every write
--    goes exclusively through the SECURITY DEFINER RPCs above, which do not
--    need a table grant to do so (see the comment in section 1). Only
--    SELECT is granted directly, and only for rows the caller is entitled
--    to see.
-- =========================================================================
drop policy if exists "recipe_shares_select_owner" on public.recipe_shares;
create policy "recipe_shares_select_owner"
  on public.recipe_shares for select
  to authenticated
  using (owner_id = auth.uid());

grant select on public.recipe_shares to authenticated;

drop policy if exists "recipe_access_grants_select_owner" on public.recipe_access_grants;
create policy "recipe_access_grants_select_owner"
  on public.recipe_access_grants for select
  to authenticated
  using (public.owns_personal_recipe(recipe_id));

drop policy if exists "recipe_access_grants_select_grantee" on public.recipe_access_grants;
create policy "recipe_access_grants_select_grantee"
  on public.recipe_access_grants for select
  to authenticated
  using (grantee_id = auth.uid());

grant select on public.recipe_access_grants to authenticated;

-- =========================================================================
-- 8. RLS additions — read-only access to a shared recipe and everything it
--    currently references, for a grantee. These are additional PERMISSIVE
--    policies (Postgres OR's all permissive policies for the same command
--    together), so they only ever widen read access for a grantee; they
--    never touch INSERT/UPDATE/DELETE (no such policy is added here for any
--    of these tables for non-owners — "acesso compartilhado somente
--    leitura" / "nunca concede edição da receita original"), and they never
--    narrow what an owner or the public already had access to.
-- =========================================================================
drop policy if exists "recipes_select_shared" on public.recipes;
create policy "recipes_select_shared"
  on public.recipes for select
  to authenticated
  using (scope = 'personal' and public.has_active_recipe_grant(id));

drop policy if exists "recipe_ingredients_select_shared" on public.recipe_ingredients;
create policy "recipe_ingredients_select_shared"
  on public.recipe_ingredients for select
  to authenticated
  using (public.has_active_recipe_grant(recipe_ingredients.recipe_id));

drop policy if exists "recipe_categories_select_shared" on public.recipe_categories;
create policy "recipe_categories_select_shared"
  on public.recipe_categories for select
  to authenticated
  using (public.has_active_recipe_grant(recipe_categories.recipe_id));

-- The owner's personal product stays visible, read-only, to a grantee for
-- as long as it is actually used as an ingredient in a recipe shared with
-- them — this is what keeps "o custo deve usar o preço atual dos produtos
-- do proprietário" true without ever copying price data: the grantee reads
-- the same live row the owner edits. Goes through the ordinary
-- RLS-protected read of recipe_ingredients (visible to the grantee via
-- recipe_ingredients_select_shared above), not another raw
-- recipe_access_grants subquery, so this cannot re-enter the same cycle
-- section 6 exists to break.
drop policy if exists "products_select_shared_via_recipe" on public.products;
create policy "products_select_shared_via_recipe"
  on public.products for select
  to authenticated
  using (
    scope = 'personal' and exists (
      select 1 from public.recipe_ingredients ri
      where ri.product_id = products.id and public.has_active_recipe_grant(ri.recipe_id)
    )
  );

-- Same idea for categories: the recipe's own category, its section tags,
-- and its ingredient products' categories all stay readable to a grantee
-- for exactly as long as they're actually referenced by a recipe shared
-- with them.
drop policy if exists "categories_select_shared_recipe" on public.categories;
create policy "categories_select_shared_recipe"
  on public.categories for select
  to authenticated
  using (
    exists (
      select 1 from public.recipes r
      where r.category_id = categories.id and public.has_active_recipe_grant(r.id)
    )
  );

drop policy if exists "categories_select_shared_section" on public.categories;
create policy "categories_select_shared_section"
  on public.categories for select
  to authenticated
  using (
    exists (
      select 1 from public.recipe_categories rc
      where rc.category_id = categories.id and public.has_active_recipe_grant(rc.recipe_id)
    )
  );

drop policy if exists "categories_select_shared_product" on public.categories;
create policy "categories_select_shared_product"
  on public.categories for select
  to authenticated
  using (
    exists (
      select 1
      from public.products p
      join public.recipe_ingredients ri on ri.product_id = p.id
      where p.category_id = categories.id and public.has_active_recipe_grant(ri.recipe_id)
    )
  );
