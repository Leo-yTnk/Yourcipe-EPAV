-- Yourcipe V0.42 — authoritative, auditable Swift pricing.
-- Apply after 023. The Edge Function uses the service role; browsers can only read
-- public price metadata and admins invoke synchronization through the function.
create type public.product_pricing_type as enum ('FIXED_PACKAGE','FIXED_UNIT','PER_KG','VARIABLE_WEIGHT');
create type public.product_price_status as enum ('CURRENT','STALE','SYNCING','ERROR','MISSING_SOURCE');

alter table public.products
  add column swift_product_url text,
  add column swift_product_id text,
  add column swift_sku text,
  add column price_cents integer check (price_cents > 0),
  add column regular_price_cents integer check (regular_price_cents > 0),
  add column promo_price_cents integer check (promo_price_cents > 0),
  add column promo_min_quantity integer check (promo_min_quantity >= 2),
  add column pricing_type public.product_pricing_type,
  add column price_unit text check (price_unit in ('KG','UN','EMBALAGEM','CAIXA')),
  add column price_source text check (price_source is null or price_source = 'SWIFT'),
  add column price_last_checked_at timestamptz,
  add column price_last_changed_at timestamptz,
  add column price_last_success_at timestamptz,
  add column price_status public.product_price_status not null default 'MISSING_SOURCE',
  add column price_error text,
  add column price_region text,
  add column price_reference_zip_code text,
  add column price_source_hash text,
  add constraint products_swift_url_ck check (swift_product_url is null or swift_product_url ~ '^https://www\.swift\.com\.br/[^?#]+$'),
  add constraint products_promo_pair_ck check ((promo_price_cents is null) = (promo_min_quantity is null)),
  add constraint products_region_success_ck check (price_last_success_at is null or price_reference_zip_code is not null);

-- Preserve compatibility with existing calculations while ensuring the legacy
-- numeric value is derived from confirmed integer cents, never the reverse.
create or replace function public.sync_legacy_product_price() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.regular_price_cents is not null then new.price := new.regular_price_cents / 100.0; end if;
  return new;
end $$;
create trigger trg_sync_legacy_product_price before insert or update of regular_price_cents
on public.products for each row execute function public.sync_legacy_product_price();

create table public.product_price_history (
  id bigint generated always as identity primary key,
  product_id uuid not null references public.products(id) on delete cascade,
  regular_price_cents integer not null check (regular_price_cents > 0),
  promo_price_cents integer check (promo_price_cents > 0),
  promo_min_quantity integer check (promo_min_quantity >= 2),
  pricing_type public.product_pricing_type not null,
  price_unit text not null,
  reference_zip_code text not null,
  region text,
  fetched_at timestamptz not null default now(),
  source text not null check (source = 'SWIFT'),
  source_hash text not null
);
create index product_price_history_product_fetched_idx on public.product_price_history(product_id, fetched_at desc);
alter table public.product_price_history enable row level security;
create policy product_price_history_admin_read on public.product_price_history for select to authenticated using (public.is_admin());

create table public.swift_price_sync_runs (
  id bigint generated always as identity primary key, started_at timestamptz not null default now(), finished_at timestamptz,
  products_synced integer not null default 0, products_updated integer not null default 0,
  products_unchanged integer not null default 0, products_failed integer not null default 0,
  products_stale integer not null default 0, duration_ms integer, error_summary jsonb not null default '{}'::jsonb
);
alter table public.swift_price_sync_runs enable row level security;
create policy swift_runs_admin_read on public.swift_price_sync_runs for select to authenticated using (public.is_admin());

-- Server-side freshness view: CURRENT is computed, so an old stored label can
-- never make an expired confirmation look current after the cron stops.
create view public.products_with_price_freshness with (security_invoker=true) as
select p.*, case
  when p.swift_product_url is null then 'MISSING_SOURCE'::public.product_price_status
  when p.price_last_success_at is null then p.price_status
  when p.price_last_success_at < now() - make_interval(mins => coalesce(nullif(current_setting('app.swift_price_max_age_minutes', true), '')::int, 30)) then 'STALE'::public.product_price_status
  else p.price_status end as effective_price_status
from public.products p;
grant select on public.products_with_price_freshness to anon, authenticated;

-- Only admins may change source references through the public API. Provider
-- result fields have no browser UPDATE grant: the service-role function owns them.
create or replace function public.set_product_swift_source(p_product_id uuid, p_url text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  if p_url is not null and p_url !~ '^https://www\.swift\.com\.br/[^?#]+$' then raise exception 'invalid_swift_product_url'; end if;
  update public.products set swift_product_url=p_url, price_status=case when p_url is null then 'MISSING_SOURCE' else 'STALE' end, price_error=null where id=p_product_id and scope='site';
  if not found then raise exception 'product_not_found'; end if;
end $$;
revoke all on function public.set_product_swift_source(uuid,text) from public;
grant execute on function public.set_product_swift_source(uuid,text) to authenticated;

-- Scheduling is configured in Supabase Dashboard/cron to POST the function;
-- do not put the service-role secret in SQL. Recommended expression:
-- */30 * * * * (the function itself also enforces SWIFT_PRICE_SYNC_INTERVAL_MINUTES).
comment on table public.product_price_history is 'Immutable successful Swift observations; rows are inserted for changes and confirmations.';
