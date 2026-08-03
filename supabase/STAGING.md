# Staging setup and PR 1 runbook

This PR was built and tested entirely against a **local, throwaway PostgreSQL
instance** (see "What was actually run" below), not against a real Supabase
project. The agent that wrote this PR has no Supabase account credentials
and cannot create cloud projects or reach the Supabase Management API — so
the steps below marked **[HUMAN]** genuinely need a person with dashboard
access to this account. Nothing in this PR was applied to
`ytvztfvypiwgnslisxep` (the production project referenced in
`supabase-client.js`), and nothing will be, from this branch, without an
explicit separate step.

## 1. Create the staging project — **[HUMAN, one-time]**

1. In the Supabase dashboard, create a **new, separate project** (not a
   branch/fork of production — a fully independent project, its own URL and
   keys). Name it something unambiguous, e.g. `yourcipe-staging`.
2. **Authentication > Providers > Email > "Confirm email"**: turn **OFF**,
   permanently — same reason as production (see the comment at the top of
   `supabase/schema.sql`): credential accounts use a non-contactable
   `@credential.yourcipe.local` address that can never receive a
   confirmation link.
3. **Authentication > Settings > Bot and Abuse Protection**: enable
   Turnstile and set a Secret Key. Use a **Cloudflare Turnstile test
   site/secret key pair** (Cloudflare publishes fixed test keys that always
   pass/fail predictably), not the production site key — so staging never
   depends on the real Cloudflare site config. **Never commit the Secret
   Key anywhere in this repo.**
4. Note the project's URL and **publishable/anon key** (Project Settings >
   API). These are safe to use client-side (see "Secrets policy" below).

## 2. Apply the schema to staging — **[HUMAN]**

Run these files, **in this exact order**, in the staging project's SQL
Editor. Each is idempotent (safe to re-run). Do **not** run
`supabase/tests/*` against staging — those are a local-only test harness
(see below).

1. `supabase/schema.sql` (already existed before this PR; skip if staging
   was bootstrapped from a dump that already includes it).
2. `supabase/002_profiles_display_name_phase1.sql`
3. `supabase/004_catalog_schema.sql`
4. `supabase/005_creation_mode_sharing.sql` — added by the "Modo de Criação"
   PR (recipe sharing, personal copies, safe authorship lookup). Depends on
   004 already being applied. Does not touch `supabase/schema.sql`,
   `002`/`003`, or any row already in `categories`/`products`/`recipes` —
   it only adds two new tables (`recipe_shares`, `recipe_access_grants`),
   new functions/RPCs, and additional (widening-only) SELECT policies. Safe
   to run immediately after 004 in staging; nothing here requires a human
   decision the way phase 2 of the display_name migration does.

Do **not** run `supabase/003_profiles_display_name_phase2_not_null.sql`
yet — see "Phase 2 checkpoint" below. It refuses to run early on its own
(it raises if any `display_name` is still `NULL`), but the point is to
make a deliberate decision, not to race it.

None of this touches production. Production still only has
`supabase/schema.sql` applied, exactly as before this PR.

## 3. Point a local copy of the app at staging (manual, temporary) — **[HUMAN or agent, never committed]**

The app has no bundler and no env-var mechanism — `supabase-client.js`
hardcodes the production URL/publishable key directly, on purpose (this is
what actually ships to GitHub Pages). To exercise the UI against staging:

1. Temporarily edit the `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY`
   constants at the top of `supabase-client.js` in your local working copy,
   using staging's URL and **publishable** key from step 1.
2. Serve the app locally, e.g. `npx http-server .` (already available in
   this environment) or any static file server — the app has no build step.
3. **Before committing or pushing anything**, run `git diff
   supabase-client.js` and confirm it is empty. Never let a staging URL
   reach a commit. (If this becomes a recurring workflow, a follow-up PR
   could add an optional, gitignored local-override file instead of an
   edit-and-revert dance — deliberately not built in this PR, to avoid
   adding any code path that could point production at the wrong project by
   accident.)

## 4. Phase 2 checkpoint (`display_name NOT NULL`) — **[HUMAN decision]**

Before ever running `supabase/003_profiles_display_name_phase2_not_null.sql`
(in staging first, production much later):

```sql
select id, created_at from public.profiles where display_name is null order by created_at;
```

Every row returned here is an existing account without a name. Per the
plan: **do not invent a name for any of them.** Either the account
completes its own profile at next login (the app now gates on this — see
`showCompleteProfileModal` in `app.js`/`template.js`), or a human explicitly
decides a value per account. Only once this query returns zero rows should
phase 2 run. This applies independently to staging and to production later
— staging having zero seed accounts today means phase 2 can likely run in
staging almost immediately; production has real accounts and needs the real
backfill process.

## 5. What was actually run in this environment (not staging — local only)

This sandbox has no network access to Supabase and no Docker daemon
available, but does have PostgreSQL 16 and pgTAP installed locally. All SQL
and test files in this PR were validated against that local instance:

```bash
# one-time local setup (already reflected in the commands below)
sudo apt-get install -y postgresql-16-pgtap pgtap
sudo pg_ctlcluster 16 main start
sudo -u postgres createdb yourcipe_test
sudo -u postgres psql -d yourcipe_test -c "create extension if not exists pgtap; create extension if not exists pgcrypto;"

export PGPASSWORD=postgres
psql -U postgres -h localhost -d yourcipe_test -v ON_ERROR_STOP=1 -f supabase/tests/000_local_harness.sql
psql -U postgres -h localhost -d yourcipe_test -v ON_ERROR_STOP=1 -f supabase/schema.sql
psql -U postgres -h localhost -d yourcipe_test -v ON_ERROR_STOP=1 -f supabase/002_profiles_display_name_phase1.sql
psql -U postgres -h localhost -d yourcipe_test -v ON_ERROR_STOP=1 -f supabase/004_catalog_schema.sql
psql -U postgres -h localhost -d yourcipe_test -v ON_ERROR_STOP=1 -f supabase/005_creation_mode_sharing.sql

pg_prove -h localhost -U postgres -d yourcipe_test supabase/tests/001_profiles_display_name.pg.sql
pg_prove -h localhost -U postgres -d yourcipe_test supabase/tests/002_catalog_schema.pg.sql
pg_prove -h localhost -U postgres -d yourcipe_test supabase/tests/003_creation_mode_sharing.pg.sql
```

`supabase/tests/003_creation_mode_sharing.pg.sql` (44 assertions, all
passing against local Postgres 16 + pgTAP) covers: isolation before
redemption, the generic `invalid_share_code` error for both a
never-existed code and a rotated-away one, refusing to redeem your own
recipe's code, live sync of an owner's product price to a grantee, the
safe `get_recipe_author_name` RPC (including returning `null` for a
non-visible recipe — no leak), `create_recipe_copy` refusing to finalize
with an unresolved foreign reference, the "add"/"map"/"remove" resolution
actions (clone vs. reuse vs. drop), refusing to "remove" the recipe's own
primary category, and that revoking access removes the grantee's read
access to the original while leaving their independent copy (and its own
ingredients) completely untouched.

`supabase/tests/000_local_harness.sql` stubs the minimum Supabase-specific
surface (`auth.users`, `auth.uid()`, `auth.role()`, the
`anon`/`authenticated`/`service_role` roles) so the migration SQL can be
exercised without a real Supabase project. **Never run that file against
staging or production** — those already have the real `auth` schema, and
running a stub schema/role-creation script against a real project would be
actively harmful. See the comment at the top of that file.

Results from this run are pasted into the PR description. Re-running the
same 5 commands above reproduces them from a clean checkout.

### Why local Postgres is not a substitute for staging

The local harness proves the SQL is internally consistent (constraints,
triggers, RLS logic, non-recursion, code generation) using a hand-built
stand-in for Supabase's `auth` schema. It does **not** prove:
- that Turnstile actually integrates end-to-end (needs a real Cloudflare
  site/secret key pair);
- that `supabase-js`'s actual network behavior (session handling, realtime,
  PostgREST-specific error shapes) matches assumptions here;
- that the real `auth.uid()`/`auth.role()` (JWT-derived, via PostgREST) line
  up with the stub's GUC-based versions in every edge case.

**[HUMAN]** should re-run the `supabase-js`-based checks below against the
real staging project once it exists, before this is considered fully
verified — not just re-trust the local pgTAP results.

**Also not possible in this environment:** a full browser click-through of
the updated signup/login/complete-profile/change-name UI. `app.js` imports
`@supabase/supabase-js` from `https://esm.sh/...` at the top of
`supabase-client.js`, and this sandbox's outbound network policy does not
allow reaching `esm.sh` (nor `fonts.googleapis.com`) — confirmed via a
direct `curl` (`403` on the proxy CONNECT tunnel) and via a headless
Chromium load of `index.html` (`ERR_TUNNEL_CONNECTION_FAILED` on that
import), which means the Preact app never mounts in this sandbox at all,
regardless of anything in this PR. What was verified instead: `node --check`
on every changed/added `.js` file (syntax-valid), a full manual read-through
of the `app.js`/`auth.js`/`template.js` diffs, and the Vitest suite for all
the pure logic those files depend on. **[HUMAN]** should still do a real
click-through once pointed at staging (step 3) with real network access —
signup with the new Nome field, an intentionally-invalid name, login with a
legacy-in-staging account to see the complete-profile gate, and the
"Editar nome" flow — before considering the front-end changes fully
verified.

## 6. supabase-js checks still needed against real staging — **[HUMAN]**

Once staging exists and the schema is applied (steps 1–2), verify by hand
(or write a small `supabase-js` script, not included in this PR since it
needs a live project to run against):

- Sign up through the real UI (pointed at staging per step 3) with a valid
  name → `auth.users` + `public.profiles` both get created, `display_name`
  matches, `role='user'`.
- Sign up with an empty/1-character name → blocked client-side (the button
  never becomes clickable — see `canSubmitSignup` in `app.js`).
- Log in with an existing (freshly-created-in-staging) account that has no
  `display_name` → the "Complete seu perfil" modal appears and cannot be
  dismissed without a valid name.
- As a plain user, confirm `select` on another user's `scope='personal'`
  row (categories/products/recipes) returns zero rows via the browser's
  network tab / a manual PostgREST call.
- Promote one staging account to `admin` via
  `supabase/promote_admin_example.sql` (staging only!) and confirm
  `is_admin()` behaves as expected from the client.

## 7. Modo de Criação (recipe sharing / personal copies) — **[HUMAN]**, not click-tested here

Same sandbox network limitation as above (no route to `esm.sh` or a real
Supabase project — see section 5) means none of this PR's front-end
(`catalog.js`, and the new "Minhas Receitas/Meus Produtos/Minhas
Categorias" tabs, sharing controls, "Cadastrar Receita por ID", and the
copy/reference-resolution modal in `app.js`/`template.js`) could be
click-tested in a browser here. What was verified instead: `node --check`
on every changed/added `.js` file, a full manual read-through cross-checking
every view-model field the templates reference against what
`computeViewModel()` actually returns, and the full pgTAP suite above
(which is what actually proves the RLS/RPC security properties — the UI is
just a client of that). **[HUMAN]** should, once staging has this
migration applied and the app is pointed at it (step 3 above), verify by
hand:

- As a plain (non-admin) user: open "Modo de Criação" from Perfil — it
  should open directly (no "sem acesso administrativo" message), showing
  only the "Minhas Receitas / Meus Produtos / Minhas Categorias" tabs (the
  catalog-editing tabs stay admin-only).
- Create a personal category, a personal product, and a personal recipe
  end-to-end; confirm each gets a `YCT-`/`YPR-`/`YCR-` code.
- On a recipe's detail: activate sharing, copy the `YSH-` ID, and confirm
  a second staging account can add it via "Cadastrar Receita por ID" — and
  that an invalid ID shows the generic error, not a stack trace.
- With the second account: confirm the shared recipe is read-only (no
  edit/delete affordance), the ingredient price matches the owner's
  current price, and "Criar cópia própria" surfaces the reference-resolution
  popup only when the recipe actually uses the owner's personal
  products/categories.
- Back on the owner's account: "Gerar novo ID" and confirm the old ID no
  longer works; "Revogar acessos" and confirm the second account loses
  access to the original but keeps its own copy.

## Secrets policy

Never committed to this repository, under any circumstance:
- `service_role` key (any project)
- Turnstile Secret Key (any project)
- database password / connection string with credentials
- access tokens / refresh tokens of any kind

Safe to commit (already the case in `supabase-client.js`): the Supabase
**publishable/anon** key. It is meant to be public — the app's security
depends on RLS policies (this PR's `004_catalog_schema.sql`, plus
`schema.sql`), never on that key being secret. The same will be true of a
staging publishable key if one ever ends up committed by accident — not
ideal (mixes environments), but not a credential leak.
