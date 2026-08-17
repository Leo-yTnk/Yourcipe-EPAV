# Swift price synchronization (V0.42)

## Architecture and deployment

The existing stack remains unchanged: the static Preact client reads Supabase/Postgres,
and a Supabase Edge Function is the trusted network boundary. Deploy
`swift-price-sync`, apply `024_swift_price_sync.sql`, and schedule an authenticated
POST (for example every minute); the function uses
`SWIFT_PRICE_SYNC_INTERVAL_MINUTES` to avoid unnecessary runs. Never expose the
service-role or cron secret to the browser.

The provider allowlists HTTPS detail URLs on `www.swift.com.br`, rejects search and
category paths and cross-domain redirects, sends the configured reference CEP in the
regional cookie/header context, prefers JSON-LD/application JSON, and only then uses a
semantic text fallback. It validates identity, BRL, unit and bounds before persistence.
The live Swift site was not reachable from this development environment (proxy 403),
so the regional cookie name is configurable and must be confirmed in staging Network
tools for the EPAV account before production promotion.

## Required secrets/configuration

- `SWIFT_REFERENCE_ZIP_CODE` (required, exactly eight digits)
- `SWIFT_REFERENCE_REGION` (recommended human-readable region)
- `SWIFT_PRICE_CRON_SECRET` (required for scheduler calls)
- `SWIFT_PRICE_SYNC_INTERVAL_MINUTES` (default `30`)
- `SWIFT_PRICE_MAX_AGE_MINUTES` (default `30`)
- `SWIFT_PRICE_REQUEST_TIMEOUT_MS` (default `10000`)
- `SWIFT_PRICE_MAX_RETRIES` (default `3`)
- `SWIFT_PRICE_SYNC_CONCURRENCY` (default `3`, capped at 10)
- `SWIFT_PRICE_CHANGE_WARNING_PERCENT` (default `50`)
- `SWIFT_REGION_COOKIE_NAME` (default `postalCode`; verify in staging)
- standard Edge secrets `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
  `SUPABASE_SERVICE_ROLE_KEY`

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
