-- Yourcipe — change_requests: the moderation workflow between a personal
-- item (recipe/product/category) and the public catalog. Roles used
-- throughout: only 'user' and 'admin' (public.profiles.role), nothing else.
--
-- Scope note (read before extending this file): action_type has four
-- values (publish/create/update/deactivate) for schema completeness, but
-- the submit_*_request()/resubmit_*_request() RPCs in this PR only ever
-- produce action_type='publish' (a personal item that has never been
-- public before). review_change_request() below still fully implements
-- the action_type='update' branch (target_id present, base_version
-- compared against the live target's version, conflict blocks the
-- overwrite) because that logic is independently specified and testable —
-- there is just no submission RPC in this PR that creates an 'update'
-- request yet (that would be "request a change to something already
-- public", a distinct future feature). 'deactivate' is unused entirely for
-- now. This mirrors the same kind of explicit, documented scope boundary
-- already used elsewhere in this schema (e.g. 004's admin-write-policy
-- deferral, or the "no cascade" rule in 005's copy flow).
--
-- Review every statement before running it. Idempotent — safe to re-run.
-- Depends on supabase/004_catalog_schema.sql and
-- supabase/006_admin_catalog_publishing.sql already being applied.

-- =========================================================================
-- 1. public.change_requests
-- =========================================================================
create table if not exists public.change_requests (
  id uuid primary key default gen_random_uuid(),
  request_code text unique,
  requester_id uuid not null references auth.users (id) on delete cascade,
  requester_display_name_snapshot text not null,
  entity_type text not null check (entity_type in ('recipe', 'product', 'category')),
  action_type text not null check (action_type in ('publish', 'create', 'update', 'deactivate')),
  source_id uuid,
  source_code text,
  target_id uuid,
  target_code text,
  base_version integer,
  current_revision integer not null default 1,
  status text not null check (status in ('submitted', 'changes_requested', 'resubmitted', 'approved', 'rejected', 'cancelled')),
  reason text,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id)
);

create index if not exists change_requests_requester_idx on public.change_requests (requester_id);
create index if not exists change_requests_status_idx on public.change_requests (status);
create index if not exists change_requests_source_idx on public.change_requests (source_id);

alter table public.change_requests enable row level security;

-- =========================================================================
-- 2. public.change_request_revisions — immutable history. No UPDATE/DELETE
--    policy at all, and no INSERT policy either: every revision is created
--    exclusively by the SECURITY DEFINER RPCs in section 6, which don't
--    need a table grant to do so (same "no direct grant, functions only"
--    pattern as recipe_shares/recipe_access_grants in 005).
-- =========================================================================
create table if not exists public.change_request_revisions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.change_requests (id) on delete cascade,
  revision_number integer not null,
  payload jsonb not null,
  message text,
  submitted_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  unique (request_id, revision_number)
);

create index if not exists change_request_revisions_request_idx on public.change_request_revisions (request_id);

alter table public.change_request_revisions enable row level security;

-- =========================================================================
-- 3. request_code generation — same pattern as category_code_seq/
--    product_code_seq/recipe_code_seq in 004: a real sequence (never
--    MAX()+1, which races under concurrency), a SECURITY DEFINER
--    BEFORE INSERT trigger as the only path that can call nextval(), and
--    no grant on the sequence itself to anon/authenticated. Client-supplied
--    request_code on INSERT is unconditionally overwritten; immutable
--    after that (section 5).
-- =========================================================================
create sequence if not exists public.request_code_seq;
revoke all on sequence public.request_code_seq from public, anon, authenticated;

create or replace function public.assign_request_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.request_code := 'YRQ-' || lpad(nextval('public.request_code_seq')::text, 4, '0');
  return new;
end;
$$;
revoke execute on function public.assign_request_code() from public;

drop trigger if exists trg_assign_request_code on public.change_requests;
create trigger trg_assign_request_code
  before insert on public.change_requests
  for each row execute function public.assign_request_code();

-- =========================================================================
-- 4. Audit bookkeeping — updated_at bumped on every UPDATE. created_at is
--    already handled by the column default and never touched again.
-- =========================================================================
create or replace function public.set_change_request_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function public.set_change_request_updated_at() from public;

drop trigger if exists trg_change_requests_updated_at on public.change_requests;
create trigger trg_change_requests_updated_at
  before update on public.change_requests
  for each row execute function public.set_change_request_updated_at();

-- =========================================================================
-- 5. Immutability — request_code/requester_id/source_id/entity_type can
--    never change after creation, for anyone calling through PostgREST as
--    `authenticated` (same NULL-propagating auth.role() pattern used
--    throughout this schema — see supabase/schema.sql's
--    prevent_role_escalation for the canonical explanation). This holds
--    even for the RPCs in section 6 below: SECURITY DEFINER changes which
--    role's table privileges apply, but auth.role()/auth.uid() still
--    reflect the original calling session's JWT, so this trigger applies
--    to their UPDATEs exactly the same as to a hypothetical direct client
--    UPDATE — and none of those RPCs ever touch these four columns after
--    insert, by construction.
-- =========================================================================
create or replace function public.enforce_change_requests_immutable_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() is not null and auth.role() <> 'service_role' then
    if new.request_code is distinct from old.request_code then
      raise exception 'request_code is immutable';
    end if;
    if new.requester_id is distinct from old.requester_id then
      raise exception 'requester_id is immutable';
    end if;
    if new.source_id is distinct from old.source_id then
      raise exception 'source_id is immutable';
    end if;
    if new.entity_type is distinct from old.entity_type then
      raise exception 'entity_type is immutable';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.enforce_change_requests_immutable_fields() from public;

drop trigger if exists trg_change_requests_immutable_fields on public.change_requests;
create trigger trg_change_requests_immutable_fields
  before update on public.change_requests
  for each row execute function public.enforce_change_requests_immutable_fields();

-- =========================================================================
-- 6. RLS.
--    USER: reads/creates only their own requests and only reads revisions
--    of their own requests; never approves/rejects/touches reviewed_by;
--    never writes the public catalog directly (no policy here grants
--    that — catalog writes only ever happen inside review_change_request(),
--    SECURITY DEFINER).
--    ADMIN: reads every request/revision (still never a general SELECT on
--    other users' *personal* recipes/products/categories — that boundary
--    is untouched from 004/005/006).
--    No INSERT/UPDATE/DELETE grant to `authenticated` on either table:
--    every write goes through the RPCs in section 8, which need no table
--    grant to do so (SECURITY DEFINER).
-- =========================================================================
drop policy if exists "change_requests_select_own" on public.change_requests;
create policy "change_requests_select_own"
  on public.change_requests for select
  to authenticated
  using (requester_id = auth.uid());

drop policy if exists "change_requests_select_admin" on public.change_requests;
create policy "change_requests_select_admin"
  on public.change_requests for select
  to authenticated
  using (public.is_admin());

grant select on public.change_requests to authenticated;

drop policy if exists "change_request_revisions_select_own" on public.change_request_revisions;
create policy "change_request_revisions_select_own"
  on public.change_request_revisions for select
  to authenticated
  using (
    exists (
      select 1 from public.change_requests cr
      where cr.id = request_id and cr.requester_id = auth.uid()
    )
  );

drop policy if exists "change_request_revisions_select_admin" on public.change_request_revisions;
create policy "change_request_revisions_select_admin"
  on public.change_request_revisions for select
  to authenticated
  using (public.is_admin());

grant select on public.change_request_revisions to authenticated;

-- =========================================================================
-- 7. Internal snapshot builders — not exposed to the client (EXECUTE
--    revoked from public, never granted to authenticated either); only
--    callable from within the SECURITY DEFINER RPCs in section 8, which
--    can always call functions owned by the same privileged role
--    regardless of grants (same reasoning as assign_recipe_code() etc. in
--    004 needing no grant of its own).
-- =========================================================================
create or replace function public._change_request_category_snapshot(p_category_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'name', c.name, 'type', c.type, 'source_version', c.version, 'source_code', c.category_code
  )
  from public.categories c where c.id = p_category_id;
$$;
revoke execute on function public._change_request_category_snapshot(uuid) from public;

create or replace function public._change_request_product_snapshot(p_product_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'name', p.name, 'unit', p.unit, 'price', p.price,
    'category_id', p.category_id, 'category_code', c.category_code, 'category_name', c.name,
    'source_version', p.version, 'source_code', p.product_code
  )
  from public.products p join public.categories c on c.id = p.category_id
  where p.id = p_product_id;
$$;
revoke execute on function public._change_request_product_snapshot(uuid) from public;

-- Full recipe snapshot: basics, instructions, tips, extras, image, category,
-- sections, ingredients (each with the product's current code/name/unit/
-- price and the recipe's quantity), and the recipe's own version — per the
-- spec's "o snapshot deve preservar os dados relevantes no momento do
-- envio".
create or replace function public._change_request_recipe_snapshot(p_recipe_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_recipe public.recipes%rowtype;
  v_category jsonb;
  v_sections jsonb;
  v_ingredients jsonb;
begin
  select * into v_recipe from public.recipes where id = p_recipe_id;

  select jsonb_build_object('id', c.id, 'code', c.category_code, 'name', c.name)
    into v_category
    from public.categories c where c.id = v_recipe.category_id;

  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'code', c.category_code, 'name', c.name) order by rc.sort_order), '[]'::jsonb)
    into v_sections
    from public.recipe_categories rc
    join public.categories c on c.id = rc.category_id
    where rc.recipe_id = p_recipe_id;

  select coalesce(jsonb_agg(jsonb_build_object(
      'product_id', p.id, 'product_code', p.product_code, 'product_name', p.name,
      'unit', p.unit, 'price', p.price, 'quantity', ri.quantity, 'sort_order', ri.sort_order
    ) order by ri.sort_order), '[]'::jsonb)
    into v_ingredients
    from public.recipe_ingredients ri
    join public.products p on p.id = ri.product_id
    where ri.recipe_id = p_recipe_id;

  return jsonb_build_object(
    'name', v_recipe.name, 'prep_time', v_recipe.prep_time, 'servings', v_recipe.servings,
    'difficulty', v_recipe.difficulty, 'image_url', v_recipe.image_url,
    'extras', to_jsonb(v_recipe.extras), 'instructions', to_jsonb(v_recipe.instructions), 'tips', to_jsonb(v_recipe.tips),
    'category', v_category, 'sections', v_sections, 'ingredients', v_ingredients,
    'source_version', v_recipe.version, 'source_code', v_recipe.recipe_code
  );
end;
$$;
revoke execute on function public._change_request_recipe_snapshot(uuid) from public;

-- =========================================================================
-- 8. Dependency check (informational, read-only) — drives the "Esta
--    receita possui N produtos e M categorias que ainda não pertencem ao
--    catálogo público" UI and its shortcuts. SECURITY INVOKER: the caller
--    already has full RLS-granted visibility into their own recipe and
--    everything it references, so there is nothing here that needs
--    bypassing RLS for.
-- =========================================================================
create or replace function public.check_recipe_publish_dependencies(p_recipe_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_recipe public.recipes%rowtype;
  v_products jsonb;
  v_categories jsonb;
begin
  select * into v_recipe from public.recipes where id = p_recipe_id;
  if not found or v_recipe.owner_id is distinct from auth.uid() or v_recipe.scope <> 'personal' then
    raise exception 'not_found_or_not_owned';
  end if;

  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_categories from (
    select jsonb_build_object('id', c.id, 'name', c.name, 'purpose', 'primary') as x
    from public.categories c where c.id = v_recipe.category_id and c.scope = 'personal'
    union all
    select jsonb_build_object('id', c.id, 'name', c.name, 'purpose', 'section')
    from public.recipe_categories rc join public.categories c on c.id = rc.category_id
    where rc.recipe_id = p_recipe_id and c.scope = 'personal'
  ) t;

  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name)), '[]'::jsonb)
    into v_products
    from public.recipe_ingredients ri
    join public.products p on p.id = ri.product_id
    where ri.recipe_id = p_recipe_id and p.scope = 'personal';

  return jsonb_build_object(
    'product_refs', v_products, 'category_refs', v_categories,
    'blocked', (jsonb_array_length(v_products) > 0 or jsonb_array_length(v_categories) > 0)
  );
end;
$$;
revoke execute on function public.check_recipe_publish_dependencies(uuid) from public;
grant execute on function public.check_recipe_publish_dependencies(uuid) to authenticated;

-- =========================================================================
-- 9. Submission RPCs. All SECURITY DEFINER, all validate ownership/scope
--    via auth.uid() only (never a client-supplied id/role/display_name),
--    all a single plpgsql body (atomic — see the same reasoning as 005's
--    RPCs), all re-validate dependencies server-side regardless of what
--    the client's UI already checked.
-- =========================================================================
create or replace function public.submit_category_request(p_source_id uuid, p_reason text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_category public.categories%rowtype;
  v_display_name text;
  v_request_id uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select * into v_category from public.categories where id = p_source_id;
  if not found or v_category.owner_id is distinct from v_uid or v_category.scope <> 'personal' then
    raise exception 'not_found_or_not_owned';
  end if;

  if exists (
    select 1 from public.change_requests
    where source_id = p_source_id and status in ('submitted', 'resubmitted', 'changes_requested')
  ) then
    raise exception 'request_already_pending';
  end if;

  select display_name into v_display_name from public.profiles where id = v_uid;
  if v_display_name is null then raise exception 'display_name_required'; end if;

  insert into public.change_requests (
    requester_id, requester_display_name_snapshot, entity_type, action_type,
    source_id, source_code, status, reason, submitted_at
  ) values (
    v_uid, v_display_name, 'category', 'publish',
    p_source_id, v_category.category_code, 'submitted', p_reason, now()
  ) returning id into v_request_id;

  insert into public.change_request_revisions (request_id, revision_number, payload, message, submitted_by)
  values (v_request_id, 1, public._change_request_category_snapshot(p_source_id), p_reason, v_uid);

  return v_request_id;
end;
$$;
revoke execute on function public.submit_category_request(uuid, text) from public;
grant execute on function public.submit_category_request(uuid, text) to authenticated;

create or replace function public.submit_product_request(p_source_id uuid, p_reason text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_product public.products%rowtype;
  v_display_name text;
  v_request_id uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select * into v_product from public.products where id = p_source_id;
  if not found or v_product.owner_id is distinct from v_uid or v_product.scope <> 'personal' then
    raise exception 'not_found_or_not_owned';
  end if;

  if exists (
    select 1 from public.change_requests
    where source_id = p_source_id and status in ('submitted', 'resubmitted', 'changes_requested')
  ) then
    raise exception 'request_already_pending';
  end if;

  if exists (select 1 from public.categories c where c.id = v_product.category_id and c.scope = 'personal') then
    raise exception 'product_has_personal_dependencies';
  end if;

  select display_name into v_display_name from public.profiles where id = v_uid;
  if v_display_name is null then raise exception 'display_name_required'; end if;

  insert into public.change_requests (
    requester_id, requester_display_name_snapshot, entity_type, action_type,
    source_id, source_code, status, reason, submitted_at
  ) values (
    v_uid, v_display_name, 'product', 'publish',
    p_source_id, v_product.product_code, 'submitted', p_reason, now()
  ) returning id into v_request_id;

  insert into public.change_request_revisions (request_id, revision_number, payload, message, submitted_by)
  values (v_request_id, 1, public._change_request_product_snapshot(p_source_id), p_reason, v_uid);

  return v_request_id;
end;
$$;
revoke execute on function public.submit_product_request(uuid, text) from public;
grant execute on function public.submit_product_request(uuid, text) to authenticated;

create or replace function public.submit_recipe_request(p_source_id uuid, p_reason text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_recipe public.recipes%rowtype;
  v_display_name text;
  v_request_id uuid;
  v_blocked boolean;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select * into v_recipe from public.recipes where id = p_source_id;
  if not found or v_recipe.owner_id is distinct from v_uid or v_recipe.scope <> 'personal' then
    raise exception 'not_found_or_not_owned';
  end if;

  if exists (
    select 1 from public.change_requests
    where source_id = p_source_id and status in ('submitted', 'resubmitted', 'changes_requested')
  ) then
    raise exception 'request_already_pending';
  end if;

  select exists (
    select 1 from public.categories c where c.id = v_recipe.category_id and c.scope = 'personal'
    union all
    select 1 from public.recipe_categories rc join public.categories c on c.id = rc.category_id
      where rc.recipe_id = p_source_id and c.scope = 'personal'
    union all
    select 1 from public.recipe_ingredients ri join public.products p on p.id = ri.product_id
      where ri.recipe_id = p_source_id and p.scope = 'personal'
  ) into v_blocked;
  if v_blocked then raise exception 'recipe_has_personal_dependencies'; end if;

  select display_name into v_display_name from public.profiles where id = v_uid;
  if v_display_name is null then raise exception 'display_name_required'; end if;

  insert into public.change_requests (
    requester_id, requester_display_name_snapshot, entity_type, action_type,
    source_id, source_code, status, reason, submitted_at
  ) values (
    v_uid, v_display_name, 'recipe', 'publish',
    p_source_id, v_recipe.recipe_code, 'submitted', p_reason, now()
  ) returning id into v_request_id;

  insert into public.change_request_revisions (request_id, revision_number, payload, message, submitted_by)
  values (v_request_id, 1, public._change_request_recipe_snapshot(p_source_id), p_reason, v_uid);

  return v_request_id;
end;
$$;
revoke execute on function public.submit_recipe_request(uuid, text) from public;
grant execute on function public.submit_recipe_request(uuid, text) to authenticated;

-- =========================================================================
-- 10. Resubmission RPCs — only valid from status='changes_requested',
--     always reload the personal item fresh from the server (never trust
--     a client-supplied payload), always append a new revision rather than
--     mutating an old one, always bump current_revision, always set
--     status='resubmitted'. Previous revisions are never touched.
-- =========================================================================
create or replace function public.resubmit_category_request(p_request_id uuid, p_message text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_req public.change_requests%rowtype;
  v_category public.categories%rowtype;
  v_new_rev integer;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_req from public.change_requests where id = p_request_id for update;
  if not found or v_req.requester_id is distinct from v_uid then raise exception 'not_found_or_not_owned'; end if;
  if v_req.entity_type <> 'category' then raise exception 'entity_type_mismatch'; end if;
  if v_req.status <> 'changes_requested' then raise exception 'invalid_status_for_resubmit'; end if;

  select * into v_category from public.categories where id = v_req.source_id;
  if not found or v_category.owner_id is distinct from v_uid or v_category.scope <> 'personal' then
    raise exception 'source_no_longer_available';
  end if;

  v_new_rev := v_req.current_revision + 1;
  insert into public.change_request_revisions (request_id, revision_number, payload, message, submitted_by)
  values (p_request_id, v_new_rev, public._change_request_category_snapshot(v_req.source_id), p_message, v_uid);

  update public.change_requests set current_revision = v_new_rev, status = 'resubmitted' where id = p_request_id;
  return v_new_rev;
end;
$$;
revoke execute on function public.resubmit_category_request(uuid, text) from public;
grant execute on function public.resubmit_category_request(uuid, text) to authenticated;

create or replace function public.resubmit_product_request(p_request_id uuid, p_message text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_req public.change_requests%rowtype;
  v_product public.products%rowtype;
  v_new_rev integer;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_req from public.change_requests where id = p_request_id for update;
  if not found or v_req.requester_id is distinct from v_uid then raise exception 'not_found_or_not_owned'; end if;
  if v_req.entity_type <> 'product' then raise exception 'entity_type_mismatch'; end if;
  if v_req.status <> 'changes_requested' then raise exception 'invalid_status_for_resubmit'; end if;

  select * into v_product from public.products where id = v_req.source_id;
  if not found or v_product.owner_id is distinct from v_uid or v_product.scope <> 'personal' then
    raise exception 'source_no_longer_available';
  end if;
  if exists (select 1 from public.categories c where c.id = v_product.category_id and c.scope = 'personal') then
    raise exception 'product_has_personal_dependencies';
  end if;

  v_new_rev := v_req.current_revision + 1;
  insert into public.change_request_revisions (request_id, revision_number, payload, message, submitted_by)
  values (p_request_id, v_new_rev, public._change_request_product_snapshot(v_req.source_id), p_message, v_uid);

  update public.change_requests set current_revision = v_new_rev, status = 'resubmitted' where id = p_request_id;
  return v_new_rev;
end;
$$;
revoke execute on function public.resubmit_product_request(uuid, text) from public;
grant execute on function public.resubmit_product_request(uuid, text) to authenticated;

create or replace function public.resubmit_recipe_request(p_request_id uuid, p_message text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_req public.change_requests%rowtype;
  v_recipe public.recipes%rowtype;
  v_new_rev integer;
  v_blocked boolean;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_req from public.change_requests where id = p_request_id for update;
  if not found or v_req.requester_id is distinct from v_uid then raise exception 'not_found_or_not_owned'; end if;
  if v_req.entity_type <> 'recipe' then raise exception 'entity_type_mismatch'; end if;
  if v_req.status <> 'changes_requested' then raise exception 'invalid_status_for_resubmit'; end if;

  select * into v_recipe from public.recipes where id = v_req.source_id;
  if not found or v_recipe.owner_id is distinct from v_uid or v_recipe.scope <> 'personal' then
    raise exception 'source_no_longer_available';
  end if;

  select exists (
    select 1 from public.categories c where c.id = v_recipe.category_id and c.scope = 'personal'
    union all
    select 1 from public.recipe_categories rc join public.categories c on c.id = rc.category_id
      where rc.recipe_id = v_req.source_id and c.scope = 'personal'
    union all
    select 1 from public.recipe_ingredients ri join public.products p on p.id = ri.product_id
      where ri.recipe_id = v_req.source_id and p.scope = 'personal'
  ) into v_blocked;
  if v_blocked then raise exception 'recipe_has_personal_dependencies'; end if;

  v_new_rev := v_req.current_revision + 1;
  insert into public.change_request_revisions (request_id, revision_number, payload, message, submitted_by)
  values (p_request_id, v_new_rev, public._change_request_recipe_snapshot(v_req.source_id), p_message, v_uid);

  update public.change_requests set current_revision = v_new_rev, status = 'resubmitted' where id = p_request_id;
  return v_new_rev;
end;
$$;
revoke execute on function public.resubmit_recipe_request(uuid, text) from public;
grant execute on function public.resubmit_recipe_request(uuid, text) to authenticated;

-- =========================================================================
-- 11. Cancellation (requester) and return-for-edit (admin).
-- =========================================================================
create or replace function public.cancel_change_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  update public.change_requests
    set status = 'cancelled'
    where id = p_request_id and requester_id = v_uid and status in ('submitted', 'resubmitted', 'changes_requested');
  if not found then raise exception 'not_found_or_not_cancellable'; end if;
end;
$$;
revoke execute on function public.cancel_change_request(uuid) from public;
grant execute on function public.cancel_change_request(uuid) to authenticated;

create or replace function public.return_change_request(p_request_id uuid, p_admin_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not public.is_admin() then raise exception 'not_admin'; end if;
  if p_admin_note is null or btrim(p_admin_note) = '' then raise exception 'admin_note_required'; end if;
  update public.change_requests
    set status = 'changes_requested', admin_note = p_admin_note, reviewed_by = v_uid, reviewed_at = now()
    where id = p_request_id and status in ('submitted', 'resubmitted');
  if not found then raise exception 'not_found_or_invalid_status'; end if;
end;
$$;
revoke execute on function public.return_change_request(uuid, text) from public;
grant execute on function public.return_change_request(uuid, text) to authenticated;

-- =========================================================================
-- 12. review_change_request — the transactional approval path. A single
--     plpgsql body: any exception rolls back every write the call made
--     ("fazer rollback completo em erro"). Locks the request row with
--     SELECT ... FOR UPDATE before acting on it. Never mutates the source
--     personal item — only ever INSERTs (first-time publish) or UPDATEs
--     (action_type='update', an existing target) a *separate* scope='site'
--     row, so the original stays private and independent by construction.
-- =========================================================================
create or replace function public.review_change_request(
  p_request_id uuid,
  p_decision text,
  p_admin_note text default null,
  p_publish_mode text default 'published'
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_req public.change_requests%rowtype;
  v_rev public.change_request_revisions%rowtype;
  v_payload jsonb;
  v_target_id uuid;
  v_target_code text;
  v_cat_id uuid;
  v_cat_active boolean;
  v_prod_id uuid;
  v_active boolean;
  v_target_version integer;
  v_elem jsonb;
begin
  if v_uid is null or not public.is_admin() then
    raise exception 'not_admin';
  end if;
  if p_decision not in ('approve', 'reject') then
    raise exception 'invalid_decision';
  end if;
  if p_decision = 'reject' and (p_admin_note is null or btrim(p_admin_note) = '') then
    raise exception 'admin_note_required';
  end if;
  if p_decision = 'approve' and p_publish_mode not in ('draft', 'published') then
    raise exception 'invalid_publish_mode';
  end if;

  select * into v_req from public.change_requests where id = p_request_id for update;
  if not found then
    raise exception 'request_not_found';
  end if;
  if v_req.status not in ('submitted', 'resubmitted') then
    raise exception 'invalid_status_for_review';
  end if;

  select * into v_rev from public.change_request_revisions
    where request_id = p_request_id and revision_number = v_req.current_revision;
  if not found then
    raise exception 'revision_not_found';
  end if;
  v_payload := v_rev.payload;

  if p_decision = 'reject' then
    update public.change_requests
      set status = 'rejected', admin_note = p_admin_note, reviewed_by = v_uid, reviewed_at = now()
      where id = p_request_id;
    return jsonb_build_object('status', 'rejected');
  end if;

  -- decision = 'approve' from here on.
  v_active := (p_publish_mode = 'published');

  if v_req.entity_type = 'category' then
    if v_req.target_id is null then
      insert into public.categories (scope, type, name, active)
      values ('site', v_payload ->> 'type', v_payload ->> 'name', v_active)
      returning id, category_code into v_target_id, v_target_code;
    else
      select version into v_target_version from public.categories where id = v_req.target_id and scope = 'site';
      if not found then raise exception 'target_no_longer_exists'; end if;
      if v_req.base_version is not null and v_target_version is distinct from v_req.base_version then
        raise exception 'version_conflict';
      end if;
      update public.categories set name = v_payload ->> 'name', active = v_active where id = v_req.target_id;
      v_target_id := v_req.target_id;
      select category_code into v_target_code from public.categories where id = v_target_id;
    end if;

  elsif v_req.entity_type = 'product' then
    select id, active into v_cat_id, v_cat_active
      from public.categories where id = (v_payload ->> 'category_id')::uuid and scope = 'site';
    if not found or not v_cat_active then
      raise exception 'stale_dependency:category';
    end if;

    if v_req.target_id is null then
      insert into public.products (scope, name, category_id, unit, price, active)
      values ('site', v_payload ->> 'name', v_cat_id, v_payload ->> 'unit', (v_payload ->> 'price')::numeric, v_active)
      returning id, product_code into v_target_id, v_target_code;
    else
      select version into v_target_version from public.products where id = v_req.target_id and scope = 'site';
      if not found then raise exception 'target_no_longer_exists'; end if;
      if v_req.base_version is not null and v_target_version is distinct from v_req.base_version then
        raise exception 'version_conflict';
      end if;
      update public.products
        set name = v_payload ->> 'name', category_id = v_cat_id, unit = v_payload ->> 'unit',
            price = (v_payload ->> 'price')::numeric, active = v_active
        where id = v_req.target_id;
      v_target_id := v_req.target_id;
      select product_code into v_target_code from public.products where id = v_target_id;
    end if;

  elsif v_req.entity_type = 'recipe' then
    select id into v_cat_id from public.categories
      where id = (v_payload -> 'category' ->> 'id')::uuid and scope = 'site' and active;
    if not found then raise exception 'stale_dependency:category'; end if;

    if v_req.target_id is null then
      insert into public.recipes (
        scope, status, name, category_id, prep_time, servings, difficulty, image_url,
        extras, instructions, tips, featured
      ) values (
        'site', p_publish_mode, v_payload ->> 'name', v_cat_id,
        (v_payload ->> 'prep_time')::integer, (v_payload ->> 'servings')::integer, v_payload ->> 'difficulty',
        nullif(v_payload ->> 'image_url', ''),
        coalesce((select array_agg(x) from jsonb_array_elements_text(v_payload -> 'extras') x), '{}'),
        coalesce((select array_agg(x) from jsonb_array_elements_text(v_payload -> 'instructions') x), '{}'),
        coalesce((select array_agg(x) from jsonb_array_elements_text(v_payload -> 'tips') x), '{}'),
        false
      ) returning id, recipe_code into v_target_id, v_target_code;
    else
      select version into v_target_version from public.recipes where id = v_req.target_id and scope = 'site';
      if not found then raise exception 'target_no_longer_exists'; end if;
      if v_req.base_version is not null and v_target_version is distinct from v_req.base_version then
        raise exception 'version_conflict';
      end if;
      update public.recipes set
        name = v_payload ->> 'name', category_id = v_cat_id,
        prep_time = (v_payload ->> 'prep_time')::integer, servings = (v_payload ->> 'servings')::integer,
        difficulty = v_payload ->> 'difficulty', image_url = nullif(v_payload ->> 'image_url', ''),
        extras = coalesce((select array_agg(x) from jsonb_array_elements_text(v_payload -> 'extras') x), '{}'),
        instructions = coalesce((select array_agg(x) from jsonb_array_elements_text(v_payload -> 'instructions') x), '{}'),
        tips = coalesce((select array_agg(x) from jsonb_array_elements_text(v_payload -> 'tips') x), '{}'),
        status = p_publish_mode
      where id = v_req.target_id;
      v_target_id := v_req.target_id;
      select recipe_code into v_target_code from public.recipes where id = v_target_id;
      delete from public.recipe_categories where recipe_id = v_target_id;
      delete from public.recipe_ingredients where recipe_id = v_target_id;
    end if;

    for v_elem in select * from jsonb_array_elements(coalesce(v_payload -> 'sections', '[]'::jsonb))
    loop
      select id into v_cat_id from public.categories
        where id = (v_elem ->> 'id')::uuid and scope = 'site' and active and type = 'secao';
      if not found then raise exception 'stale_dependency:section'; end if;
      insert into public.recipe_categories (recipe_id, category_id) values (v_target_id, v_cat_id);
    end loop;

    for v_elem in select * from jsonb_array_elements(coalesce(v_payload -> 'ingredients', '[]'::jsonb))
    loop
      select id into v_prod_id from public.products
        where id = (v_elem ->> 'product_id')::uuid and scope = 'site' and active;
      if not found then raise exception 'stale_dependency:product'; end if;
      insert into public.recipe_ingredients (recipe_id, product_id, quantity, sort_order)
      values (v_target_id, v_prod_id, (v_elem ->> 'quantity')::numeric, coalesce((v_elem ->> 'sort_order')::integer, 0));
    end loop;
  end if;

  update public.change_requests
    set target_id = v_target_id, target_code = v_target_code, status = 'approved',
        admin_note = p_admin_note, reviewed_by = v_uid, reviewed_at = now()
    where id = p_request_id;

  return jsonb_build_object('status', 'approved', 'target_id', v_target_id, 'target_code', v_target_code);
end;
$$;
revoke execute on function public.review_change_request(uuid, text, text, text) from public;
grant execute on function public.review_change_request(uuid, text, text, text) to authenticated;

-- =========================================================================
-- 13. Duplicate hints for the admin review UI — informational only, never
--     blocks review_change_request(). A simple case-insensitive substring
--     match against already-public items; not fuzzy matching, deliberately
--     simple for this first version.
-- =========================================================================
create or replace function public.find_similar_site_items(p_entity_type text, p_name text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'not_admin';
  end if;
  if p_entity_type = 'category' then
    return coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'code', category_code, 'name', name))
      from public.categories where scope = 'site' and name ilike '%' || p_name || '%'
    ), '[]'::jsonb);
  elsif p_entity_type = 'product' then
    return coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'code', product_code, 'name', name))
      from public.products where scope = 'site' and name ilike '%' || p_name || '%'
    ), '[]'::jsonb);
  elsif p_entity_type = 'recipe' then
    return coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'code', recipe_code, 'name', name))
      from public.recipes where scope = 'site' and name ilike '%' || p_name || '%'
    ), '[]'::jsonb);
  end if;
  return '[]'::jsonb;
end;
$$;
revoke execute on function public.find_similar_site_items(text, text) from public;
grant execute on function public.find_similar_site_items(text, text) to authenticated;
