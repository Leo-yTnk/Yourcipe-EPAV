-- V0.42.1 -- transactional Swift observations, source changes and run locking.
-- Apply after 027. All provider-owned price fields are written through the
-- SECURITY DEFINER functions below so product + history can never diverge.

alter table public.swift_price_sync_runs
  add column if not exists request_key text,
  add column if not exists correlation_id uuid not null default gen_random_uuid();

create unique index if not exists swift_price_sync_one_running_batch
  on public.swift_price_sync_runs ((1))
  where finished_at is null and request_key is null;
create unique index if not exists swift_price_sync_request_key_uidx
  on public.swift_price_sync_runs (request_key) where request_key is not null;

create or replace function public.prevent_price_history_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'price_history_is_immutable' using errcode = '55000';
end $$;
drop trigger if exists trg_price_history_immutable on public.product_price_history;
create trigger trg_price_history_immutable before update or delete on public.product_price_history
for each row execute function public.prevent_price_history_mutation();

-- One invariant for every writer (legacy RPC, spreadsheet import or REST): a
-- changed provider identity invalidates all observations; an unchanged identity
-- cannot be made stale merely because an import repeated the same values.
create or replace function public.normalize_swift_source_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_setting('app.swift_atomic_observation', true) = 'on' then return new; end if;
  if old.swift_product_url is distinct from new.swift_product_url or old.swift_sku is distinct from new.swift_sku then
    new.swift_product_id:=null; new.price_cents:=null; new.regular_price_cents:=null;
    new.promo_price_cents:=null; new.promo_min_quantity:=null; new.pricing_type:=null; new.price_unit:=null;
    new.price_source:=null; new.price_last_checked_at:=null; new.price_last_success_at:=null;
    new.price_last_changed_at:=null; new.price_region:=null; new.price_reference_zip_code:=null; new.price_source_hash:=null;
    new.price_error:=null; new.price_status:=case when new.swift_product_url is null then 'MISSING_SOURCE'::public.product_price_status else 'STALE'::public.product_price_status end;
  elsif old.price_last_success_at is not null and new.price_status='STALE' and new.price_error is null then
    new.price_status:=old.price_status;
  end if;
  return new;
end $$;
drop trigger if exists trg_normalize_swift_source_change on public.products;
create trigger trg_normalize_swift_source_change before update of swift_product_url, swift_sku on public.products
for each row execute function public.normalize_swift_source_change();

create or replace function public.begin_swift_price_sync(p_request_key text default null)
returns table(id bigint, correlation_id uuid) language plpgsql security definer set search_path = '' as $$
begin
  return query insert into public.swift_price_sync_runs(request_key)
    values (nullif(p_request_key, '')) returning swift_price_sync_runs.id, swift_price_sync_runs.correlation_id;
exception when unique_violation then
  return;
end $$;

create or replace function public.finish_swift_price_sync(
  p_run_id bigint, p_metrics jsonb, p_errors jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.swift_price_sync_runs set
    products_synced = coalesce((p_metrics->>'products_synced')::int, 0),
    products_updated = coalesce((p_metrics->>'products_updated')::int, 0),
    products_unchanged = coalesce((p_metrics->>'products_unchanged')::int, 0),
    products_failed = coalesce((p_metrics->>'products_failed')::int, 0),
    products_stale = coalesce((p_metrics->>'products_stale')::int, 0),
    duration_ms = (p_metrics->>'duration_ms')::int, error_summary = coalesce(p_errors, '{}'::jsonb), finished_at = now()
  where id = p_run_id and finished_at is null;
  if not found then raise exception 'sync_run_not_active'; end if;
end $$;

create or replace function public.apply_swift_price_observation(
  p_product_id uuid, p_observation jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare p public.products; changed boolean;
begin
  select * into p from public.products where id=p_product_id and scope='site' for update;
  if not found then raise exception 'product_not_found'; end if;
  changed := p.regular_price_cents is distinct from (p_observation->>'regular_price_cents')::int
    or p.promo_price_cents is distinct from (p_observation->>'promo_price_cents')::int
    or p.pricing_type is distinct from (p_observation->>'pricing_type')::public.product_pricing_type;
  insert into public.product_price_history(product_id, regular_price_cents, promo_price_cents,
    promo_min_quantity, pricing_type, price_unit, reference_zip_code, region, source, source_hash, fetched_at)
  values (p_product_id, (p_observation->>'regular_price_cents')::int,
    (p_observation->>'promo_price_cents')::int, (p_observation->>'promo_min_quantity')::int,
    (p_observation->>'pricing_type')::public.product_pricing_type, p_observation->>'price_unit',
    p_observation->>'reference_zip_code', p_observation->>'region', 'SWIFT',
    p_observation->>'source_hash', (p_observation->>'checked_at')::timestamptz);
  perform set_config('app.swift_atomic_observation','on',true);
  update public.products set
    swift_product_url=p_observation->>'swift_product_url', swift_product_id=p_observation->>'swift_product_id',
    swift_sku=p_observation->>'swift_sku', price_cents=(p_observation->>'regular_price_cents')::int,
    regular_price_cents=(p_observation->>'regular_price_cents')::int,
    promo_price_cents=(p_observation->>'promo_price_cents')::int,
    promo_min_quantity=(p_observation->>'promo_min_quantity')::int,
    pricing_type=(p_observation->>'pricing_type')::public.product_pricing_type,
    price_unit=p_observation->>'price_unit', price_source='SWIFT', price_status='CURRENT', price_error=null,
    price_last_checked_at=(p_observation->>'checked_at')::timestamptz,
    price_last_success_at=(p_observation->>'checked_at')::timestamptz,
    price_last_changed_at=case when changed or price_last_changed_at is null then (p_observation->>'checked_at')::timestamptz else price_last_changed_at end,
    price_region=p_observation->>'region', price_reference_zip_code=p_observation->>'reference_zip_code',
    price_source_hash=p_observation->>'source_hash' where id=p_product_id;
  return changed;
end $$;

create or replace function public.mark_swift_price_failure(p_product_id uuid, p_message text, p_checked_at timestamptz, p_missing boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.products set price_status=case when p_missing then 'MISSING_SOURCE'::public.product_price_status
    when price_last_success_at is null then 'ERROR'::public.product_price_status else 'STALE'::public.product_price_status end,
    price_error=left(p_message,500), price_last_checked_at=p_checked_at where id=p_product_id and scope='site';
  if not found then raise exception 'product_not_found'; end if;
end $$;

create or replace function public.save_site_product_atomic(p_product_id uuid, p_fields jsonb, p_section_ids uuid[] default '{}')
returns public.products language plpgsql security definer set search_path = '' as $$
declare result public.products; old_url text; new_url text := nullif(btrim(p_fields->>'swift_product_url'),'');
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  if new_url is not null and new_url !~ '^https://www\.swift\.com\.br/[^?#]+$' then raise exception 'invalid_swift_product_url'; end if;
  if p_product_id is null then
    insert into public.products(scope,owner_id,name,category_id,unit,price,active,image_url,swift_product_url,price_status)
    values ('site',null,btrim(p_fields->>'name'),(p_fields->>'category_id')::uuid,p_fields->>'unit',
      coalesce((p_fields->>'price')::numeric,0),(p_fields->>'active')::boolean,nullif(p_fields->>'image_url',''),new_url,
      case when new_url is null then 'MISSING_SOURCE'::public.product_price_status else 'STALE'::public.product_price_status end)
    returning * into result;
  else
    select swift_product_url into old_url from public.products where id=p_product_id and scope='site' for update;
    if not found then raise exception 'product_not_found'; end if;
    update public.products set name=btrim(p_fields->>'name'),category_id=(p_fields->>'category_id')::uuid,
      unit=p_fields->>'unit', price=case when swift_product_url is null then (p_fields->>'price')::numeric else price end,
      active=(p_fields->>'active')::boolean,image_url=nullif(p_fields->>'image_url',''),swift_product_url=new_url,
      swift_product_id=case when old_url is distinct from new_url then null else swift_product_id end,
      swift_sku=case when old_url is distinct from new_url then null else swift_sku end,
      price_cents=case when old_url is distinct from new_url then null else price_cents end,
      regular_price_cents=case when old_url is distinct from new_url then null else regular_price_cents end,
      promo_price_cents=case when old_url is distinct from new_url then null else promo_price_cents end,
      promo_min_quantity=case when old_url is distinct from new_url then null else promo_min_quantity end,
      pricing_type=case when old_url is distinct from new_url then null else pricing_type end,
      price_unit=case when old_url is distinct from new_url then null else price_unit end,
      price_source=case when old_url is distinct from new_url then null else price_source end,
      price_last_checked_at=case when old_url is distinct from new_url then null else price_last_checked_at end,
      price_last_success_at=case when old_url is distinct from new_url then null else price_last_success_at end,
      price_last_changed_at=case when old_url is distinct from new_url then null else price_last_changed_at end,
      price_region=case when old_url is distinct from new_url then null else price_region end,
      price_reference_zip_code=case when old_url is distinct from new_url then null else price_reference_zip_code end,
      price_source_hash=case when old_url is distinct from new_url then null else price_source_hash end,
      price_error=null, price_status=case when old_url is not distinct from new_url then price_status when new_url is null then 'MISSING_SOURCE'::public.product_price_status else 'STALE'::public.product_price_status end
    where id=p_product_id returning * into result;
  end if;
  delete from public.product_categories where product_id=result.id;
  insert into public.product_categories(product_id,category_id,sort_order)
    select result.id, id, ordinality::int from unnest(coalesce(p_section_ids,'{}')) with ordinality as x(id,ordinality);
  return result;
end $$;

revoke all on function public.begin_swift_price_sync(text), public.finish_swift_price_sync(bigint,jsonb,jsonb),
  public.apply_swift_price_observation(uuid,jsonb), public.mark_swift_price_failure(uuid,text,timestamptz,boolean),
  public.save_site_product_atomic(uuid,jsonb,uuid[]) from public;
grant execute on function public.save_site_product_atomic(uuid,jsonb,uuid[]) to authenticated;
grant execute on function public.begin_swift_price_sync(text), public.finish_swift_price_sync(bigint,jsonb,jsonb),
  public.apply_swift_price_observation(uuid,jsonb), public.mark_swift_price_failure(uuid,text,timestamptz,boolean) to service_role;
