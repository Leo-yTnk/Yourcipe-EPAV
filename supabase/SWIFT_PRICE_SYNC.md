# Swift price synchronization (V0.42)

## Architecture and deployment

The existing stack remains unchanged: the static Preact client reads Supabase/Postgres,
and a Supabase Edge Function is the trusted network boundary. Deploy
`swift-price-sync`, apply `024_swift_price_sync.sql`, and schedule an authenticated
POST (for example every minute); the function uses
`SWIFT_PRICE_SYNC_INTERVAL_MINUTES` to avoid unnecessary runs. Never expose the
service-role or cron secret to the browser.

Production is project `ytvztfvypiwgnslisxep`, the same project hard-coded by the
browser client. Merging a function/configuration change to `main` runs
`.github/workflows/deploy-swift-price-sync.yml`; the protected GitHub `production`
environment must contain `SUPABASE_ACCESS_TOKEN`. The workflow deploys with
`--no-verify-jwt` (matching `supabase/config.toml`) and fails unless the live
`OPTIONS` preflight returns 200. Git content alone does **not** update a deployed
Edge Function.

### GitHub Actions credential

The access token used by the deployment is an operator credential and cannot be
created or recovered by the workflow. Create a Supabase personal access token, then
add it in GitHub under **Settings → Environments → production → Environment
secrets**, using the exact name `SUPABASE_ACCESS_TOKEN`. Do not use the project's
anon key, service-role key, database password, or a repository variable: those are
different credentials, and GitHub variables are not exposed through the `secrets`
context.

A key beginning with `sb_publishable_` is the public browser credential. It is
already configured in `supabase-client.js` and is safe to send with frontend API
requests, but it cannot authorize a CLI deployment. Do not save it as
`SUPABASE_ACCESS_TOKEN`; create a personal access token from the Supabase account
dashboard instead. Never commit or paste that personal access token into source
code, issues, or workflow logs.

After saving the environment secret, rerun the failed job from GitHub Actions. The
workflow validates that the credential is present and is not a publishable browser
key before invoking the Supabase CLI, so a missing, misspelled, or obviously invalid
secret produces an actionable annotation rather than a generic CLI authentication
message. Environment protection rules may also require an authorized reviewer
before GitHub releases the secret to the job.

The authenticated post-deploy checks are optional. When
`SWIFT_SMOKE_USER_JWT` and `SWIFT_SMOKE_ADMIN_JWT` are absent, their shell step logs
that it was skipped instead of using the `secrets` context in a step-level `if`
expression (which GitHub Actions rejects while parsing the workflow). If both JWTs
are configured, also configure `SWIFT_SMOKE_PRODUCT_ID`; the user JWT must belong to
a non-admin account and the admin JWT to an administrator. The unauthenticated POST
and browser `OPTIONS` checks always run.

For an audited manual recovery, an operator with Supabase CLI access can run:

```sh
export SUPABASE_ACCESS_TOKEN='...' # operator token; never commit it
supabase functions deploy swift-price-sync \
  --project-ref ytvztfvypiwgnslisxep --no-verify-jwt
curl --fail-with-body -i -X OPTIONS \
  https://ytvztfvypiwgnslisxep.supabase.co/functions/v1/swift-price-sync
```

The provider allowlists HTTPS detail URLs on `www.swift.com.br`, rejects search and
category paths and cross-domain redirects, sends the configured reference CEP in the
regional cookie/header context, prefers JSON-LD/application JSON, and only then uses a
semantic text fallback. It validates identity, BRL, unit and bounds before persistence.
The live Swift site was not reachable from this development environment (proxy 403),
so the regional cookie name is configurable and must be confirmed in staging Network
tools for the EPAV account before production promotion.

## Required secrets/configuration

- `SWIFT_REFERENCE_ZIP_CODE` (must be set manually; required, exactly eight digits)
- `SWIFT_REFERENCE_REGION` (recommended human-readable region)
- `SWIFT_PRICE_CRON_SECRET` (must be set manually only when scheduler calls are used)
- `SWIFT_PRICE_SYNC_INTERVAL_MINUTES` (default `30`)
- `SWIFT_PRICE_MAX_AGE_MINUTES` (default `30`)
- `SWIFT_PRICE_REQUEST_TIMEOUT_MS` (default `10000`)
- `SWIFT_PRICE_MAX_RETRIES` (default `3`)
- `SWIFT_PRICE_SYNC_CONCURRENCY` (default `3`, capped at 10)
- `SWIFT_PRICE_CHANGE_WARNING_PERCENT` (default `50`)
- `SWIFT_REGION_COOKIE_NAME` (default `postalCode`; verify in staging)
- standard Edge secrets `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
  `SUPABASE_SERVICE_ROLE_KEY` (automatically supplied by hosted Supabase; do not
  duplicate them in GitHub or the browser)

Set manual function secrets reproducibly (values shown are placeholders):

```sh
supabase secrets set --project-ref ytvztfvypiwgnslisxep \
  SWIFT_REFERENCE_ZIP_CODE=00000000 \
  SWIFT_REFERENCE_REGION='Cidade/UF' \
  SWIFT_PRICE_CRON_SECRET='a-long-random-value'
```

At startup of every POST, the function validates the standard secrets, CEP and
all numeric settings. Missing/invalid values return HTTP 503 with code
`service_misconfigured` and only the **names** of invalid settings (never values).
An absent cron secret can no longer accidentally authorize a request. Browser
requests require a valid user JWT (401), then `is_admin()` (403 for a non-admin).

## Operations and audit

Admin product rows expose missing sources and sync state. Add only an unequivocal
official detail page, then use **Atualizar preço agora**, or use **Atualizar todos os
preços na Swift**. Successful observations append history; failures preserve cents and
last success while setting `STALE`/`ERROR`. The freshness view computes expiry at read
time. Batch metrics and structured logs alert after three or more failures.

Audit unresolved active products after migration (do not guess matches):

```sql
select id, product_code, name
from public.products
where scope = 'site' and active and swift_product_url is null
order by name;
```

Optional real smoke test (not CI): set `SWIFT_SMOKE_URLS` to a small comma-separated
set of reviewed detail URLs and run `deno run --allow-env --allow-net
supabase/functions/swift-price-sync/smoke.ts`.

## Transaction, locking, deployment verification and rollback (V0.42.1)

Apply migrations through `028_harden_swift_price_sync.sql` before deploying the
function. `apply_swift_price_observation` inserts history and updates the product in
one PostgreSQL transaction; a constraint/history failure rolls both operations back.
History rejects UPDATE/DELETE. `begin_swift_price_sync` supplies the database-backed
batch lock and request-key idempotency; every response exposes a run and correlation
identifier and a partial batch returns HTTP 207 with `partial=true`, never HTTP 200.
The admin reads `products_with_price_freshness`, so expiry is visible without a run.

The production GitHub environment additionally needs `SUPABASE_DB_PASSWORD` so the
pinned CLI can apply migrations before deploying code. When that optional deployment
credential is absent, the workflow emits a warning and still deploys the function;
this keeps the route and its CORS preflight from remaining at HTTP 404. An operator
must then apply pending migrations before using synchronization. For the controlled 401/403/
admin smoke, configure `SWIFT_SMOKE_USER_JWT`, `SWIFT_SMOKE_ADMIN_JWT`, and
`SWIFT_SMOKE_PRODUCT_ID`; without those optional secrets the authenticated smoke step
is intentionally skipped and must be performed by an operator. Configure
`SWIFT_PRICE_ALERT_WEBHOOK_URL` as an Edge secret to deliver threshold alerts.

Scheduler provisioning remains an external Supabase operation because its cron
secret must not be stored in a migration. Create one scheduled POST every 30 minutes
with `x-cron-secret`, then observe one complete staging cycle and confirm a finished
row in `swift_price_sync_runs`. This observation, real Swift regional behavior, and
revocation of the leaked browser session cannot be accomplished by repository code.

Rollback: disable the scheduler first, redeploy the preceding function version, and
leave migration 028 in place (its atomicity and immutable audit guarantees are
backward-safe). Never roll back by deleting history. Reconcile with:

```sql
select p.id, p.price_last_success_at, max(h.fetched_at) history_at
from public.products p left join public.product_price_history h on h.product_id=p.id
where p.price_source='SWIFT' group by p.id
having p.price_last_success_at is distinct from max(h.fetched_at);
```

## Leased lock and incident diagnostics (V0.42.2)

The observed `500 → OPTIONS 200 → 409` sequence has two separate causes in the
pre-V0.42.2 code. `catalog.js` retried every HTTP 500 once with the same `requestId`;
the OPTIONS is merely that retry's normal browser preflight. Migration 028's begin
function collapsed both unique constraints into an empty result, so the replay then
became the generic `sync_already_running` 409 whether the first run was still open
**or had already finished**. Thus the 409 alone is not evidence of an orphan. The
first 500 could be returned after acquisition by a product-query failure, a failed
`finish_swift_price_sync`, or an uncaught exception in the worker/queue; the query path attempted
finalization, the finalize-failure path proves it failed, and the uncaught path
skipped it. The old response/log must be matched
by correlation id to distinguish the production event. V0.42.2 removes that
ambiguity: no automatic retry of an internal 500, structured stage/internal code,
and guaranteed finalization attempt after acquisition.

Apply `029_swift_price_sync_leases.sql` before deploying the matching function.
There is one global active run regardless of whether it is a batch or a single
product. The function renews a five-minute lease (configurable with
`SWIFT_PRICE_SYNC_LEASE_SECONDS`, minimum 60 seconds) at product boundaries. A new
caller never takes a live lease; under an advisory transaction lock it marks an
expired run `abandoned`, links it to its successor, and retains both audit rows.
Normal and exceptional handler exits call `finish_swift_price_sync` from `finally`.
An abrupt process death or database outage is recovered only after lease expiry.

The 409 codes are intentionally distinct: `sync_batch_in_progress` means a different
run owns the lease, `sync_request_in_progress` is the same request key still running,
and `sync_request_already_completed` is a replay of a finished request. A successful
recovery starts the new request and is logged as `abandoned_run_recovered`; it is not
reported as a conflict. Unexpected HTTP 500 responses are not automatically retried
by the browser, so the original stage/run diagnostic is not replaced by a follow-up
idempotency response.

Safe read-only incident queries:

```sql
-- 1/2: open runs and their age/lease state
select id, correlation_id, request_key, started_at, heartbeat_at, lease_expires_at,
       now()-started_at as age, lease_expires_at <= now() as lease_expired
from public.swift_price_sync_runs where finished_at is null order by started_at;

-- 3: most recent completed run
select * from public.swift_price_sync_runs where finished_at is not null
order by finished_at desc limit 1;

-- 4: recorded failures/recoveries
select id, correlation_id, started_at, finished_at, outcome, internal_error_code,
       error_summary, recovered_at, recovered_by_run_id
from public.swift_price_sync_runs
where outcome in ('failed','partial','abandoned') or internal_error_code is not null
order by started_at desc limit 50;

-- 5: orphan candidate (diagnostic only; expiry is the required evidence)
select id, correlation_id, now()-coalesce(heartbeat_at,started_at) as time_without_heartbeat,
       lease_expires_at, lease_expires_at <= now() as confirmed_expired
from public.swift_price_sync_runs
where finished_at is null and lease_expires_at <= now();
```

The next legitimate request automatically recovers a confirmed expired lease. If an
operator must close one immediately, first verify its `id`, expired lease, function
logs and absence of a working invocation, then substitute that single id below. The
predicate prevents changing a live or already-finished run and no history is deleted:

```sql
begin;
update public.swift_price_sync_runs
set finished_at=now(), outcome='abandoned', recovered_at=now(),
    internal_error_code='manual_confirmed_abandoned_recovery',
    error_summary=coalesce(error_summary,'{}'::jsonb)
      || '{"lifecycle":"manual_confirmed_abandoned_recovery"}'::jsonb
where id = 12345 and finished_at is null and lease_expires_at <= now()
returning id, correlation_id, started_at, finished_at, outcome;
-- Commit only if exactly the reviewed row was returned; otherwise ROLLBACK.
commit;
```

Deploy in this exact order: (1) disable the scheduler/admin trigger during the short
migration window; (2) `supabase link --project-ref ytvztfvypiwgnslisxep`; (3)
`supabase db push --linked`; (4) deploy with `supabase functions deploy
swift-price-sync --project-ref ytvztfvypiwgnslisxep --no-verify-jwt`; (5) run the
workflow's OPTIONS/401/403 checks; (6) re-enable the scheduler. Roll back by disabling
callers, deploying the previous function, restoring the migration-028 RPC/index
definitions, and retaining the added columns and audit rows.

In production, start one controlled admin sync and confirm one POST, a changing
`heartbeat_at`, and then `finished_at/outcome`. During a longer controlled run, a
different request must receive `sync_batch_in_progress`; replaying its request id must
receive the corresponding idempotency code. In staging only, expire a test lease and
confirm that the next request logs recovery and links `recovered_by_run_id`.
