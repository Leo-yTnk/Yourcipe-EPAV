-- V0.42.2 -- leased, globally exclusive and auditable Swift synchronization runs.
-- Apply after 028. The lease is renewed by the Edge Function; only an expired
-- lease can be recovered by a later caller.

alter table public.swift_price_sync_runs
  add column if not exists heartbeat_at timestamptz,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists outcome text not null default 'running',
  add column if not exists internal_error_code text,
  add column if not exists recovered_at timestamptz,
  add column if not exists recovered_by_run_id bigint;

-- Migration-time reconciliation preserves every row. This is only relevant to
-- databases already containing more than one open run under the old per-key lock.
with ranked as (
  select id, row_number() over (order by started_at desc, id desc) position
  from public.swift_price_sync_runs where finished_at is null
)
update public.swift_price_sync_runs r set
  finished_at=now(), outcome='abandoned', recovered_at=now(),
  internal_error_code='migration_reconciled_duplicate_open_run',
  error_summary=jsonb_build_object('lifecycle','migration_reconciled_duplicate_open_run')
from ranked where r.id=ranked.id and ranked.position > 1;

update public.swift_price_sync_runs set
  heartbeat_at=coalesce(heartbeat_at,started_at),
  lease_expires_at=coalesce(lease_expires_at,started_at + interval '5 minutes')
where finished_at is null;

drop index if exists public.swift_price_sync_one_running_batch;
create unique index if not exists swift_price_sync_one_active_run
  on public.swift_price_sync_runs ((1)) where finished_at is null;

create or replace function public.begin_swift_price_sync(
  p_request_key text default null, p_lease_seconds integer default 300)
returns table(id bigint, correlation_id uuid, disposition text, recovered_run_id bigint)
language plpgsql security definer set search_path = '' as $$
declare
  existing public.swift_price_sync_runs;
  recovered_id bigint;
  new_id bigint;
  new_correlation uuid;
  lease_seconds integer := greatest(60, least(coalesce(p_lease_seconds,300),3600));
begin
  -- Serializes inspection/recovery/insertion even when an expired row is present.
  perform pg_advisory_xact_lock(hashtext('public.swift_price_sync_runs'));
  if nullif(p_request_key,'') is not null then
    select * into existing from public.swift_price_sync_runs where request_key=nullif(p_request_key,'');
    if found then
      return query select existing.id, existing.correlation_id,
        case when existing.finished_at is null then 'duplicate_active' else 'duplicate_finished' end, null::bigint;
      return;
    end if;
  end if;
  select * into existing from public.swift_price_sync_runs
    where finished_at is null order by started_at desc limit 1 for update;
  if found and coalesce(existing.lease_expires_at, existing.started_at + interval '5 minutes') > now() then
    return query select existing.id, existing.correlation_id, 'active_conflict'::text, null::bigint;
    return;
  elsif found then
    recovered_id := existing.id;
    update public.swift_price_sync_runs set finished_at=now(), outcome='abandoned',
      recovered_at=now(), internal_error_code='lease_expired_recovered',
      error_summary=coalesce(error_summary,'{}'::jsonb) || jsonb_build_object('lifecycle','lease_expired_recovered')
    where swift_price_sync_runs.id=existing.id and finished_at is null;
  end if;
  insert into public.swift_price_sync_runs(request_key,heartbeat_at,lease_expires_at)
    values(nullif(p_request_key,''),now(),now()+make_interval(secs=>lease_seconds))
    returning swift_price_sync_runs.id, swift_price_sync_runs.correlation_id into new_id,new_correlation;
  if recovered_id is not null then
    update public.swift_price_sync_runs set recovered_by_run_id=new_id where swift_price_sync_runs.id=recovered_id;
  end if;
  return query select new_id,new_correlation,
    case when recovered_id is null then 'started' else 'recovered_and_started' end, recovered_id;
end $$;

create or replace function public.heartbeat_swift_price_sync(p_run_id bigint, p_lease_seconds integer default 300)
returns boolean language plpgsql security definer set search_path = '' as $$
declare updated_count integer;
begin
  update public.swift_price_sync_runs set heartbeat_at=now(),
    lease_expires_at=now()+make_interval(secs=>greatest(60,least(coalesce(p_lease_seconds,300),3600)))
  where id=p_run_id and finished_at is null;
  get diagnostics updated_count = row_count;
  return updated_count = 1;
end $$;

create or replace function public.finish_swift_price_sync(
  p_run_id bigint, p_metrics jsonb, p_errors jsonb default '{}'::jsonb,
  p_outcome text default 'completed', p_internal_error_code text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.swift_price_sync_runs set
    products_synced=coalesce((p_metrics->>'products_synced')::int,0),
    products_updated=coalesce((p_metrics->>'products_updated')::int,0),
    products_unchanged=coalesce((p_metrics->>'products_unchanged')::int,0),
    products_failed=coalesce((p_metrics->>'products_failed')::int,0),
    products_stale=coalesce((p_metrics->>'products_stale')::int,0),
    duration_ms=(p_metrics->>'duration_ms')::int, error_summary=coalesce(p_errors,'{}'::jsonb),
    outcome=case when p_outcome in ('completed','partial','failed') then p_outcome else 'failed' end,
    internal_error_code=left(p_internal_error_code,100), finished_at=now()
  where id=p_run_id and finished_at is null;
  if not found then raise exception 'sync_run_not_active'; end if;
end $$;

revoke all on function public.begin_swift_price_sync(text,integer),
  public.heartbeat_swift_price_sync(bigint,integer),
  public.finish_swift_price_sync(bigint,jsonb,jsonb,text,text) from public;
grant execute on function public.begin_swift_price_sync(text,integer),
  public.heartbeat_swift_price_sync(bigint,integer),
  public.finish_swift_price_sync(bigint,jsonb,jsonb,text,text) to service_role;

-- Rollback: deploy the previous function first, drop swift_price_sync_one_active_run,
-- recreate the 028 partial indexes/functions, and retain these audit columns/data.
