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
