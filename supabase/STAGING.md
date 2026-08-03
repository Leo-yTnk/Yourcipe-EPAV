# Staging setup and PR 1 runbook

## PR 3 (this PR): bug fixes + change_requests — root cause writeup

Three bugs were reported against the "Modo de Criação" PR. All three were
reproduced by reading the actual code path (not just re-diagnosed) and
fixed in this PR. Summary — see the PR description for the full detail:

1. **Admin-created catalog recipes never appeared for other users/visitors.**
   Root cause, two-part: (a) the admin "Receitas/Produtos/Categorias"
   screen never called Supabase at all — it mutated a localStorage-backed
   array (`this.state.recipes`/`this.state.products`, seeded from
   `data.js`), and Home/Search read from that same local array, so nothing
   ever left the browser that created it; (b) even had the UI tried to
   write to Supabase, `supabase/004_catalog_schema.sql` shipped with **no**
   RLS policy at all allowing anyone — including admin — to INSERT/UPDATE
   `scope='site'` rows (its own comment says so: "Admin write policies on
   scope='site' rows are added in PR 3, not here"). Fixed by
   `supabase/006_admin_catalog_publishing.sql` (the missing policies) plus
   a real "Catálogo Público" admin screen and a `loadPublicCatalog()` that
   makes Home/Search load `scope='site', status='published'`/`active=true`
   rows from Supabase, with local demo data used only as a clearly-labeled
   fallback on an actual fetch error — never silently.

2. **Personal data in "Modo de Criação" never loaded ("não foi possível
   carregar").** Root cause: `loadMyCreationData()` read
   `this.state.session.user.id` synchronously, in the same tick, right
   after `applySessionProfile()` had just called `setState({ session })`.
   Preact's `setState` is asynchronous (see
   `vendor/htm-preact-standalone.js`, `Component.prototype.setState` —
   it merges into a pending buffer and only flushes into `this.state` on
   the next microtask-scheduled render), so `this.state.session` was still
   stale/null at that point right after login, and the function returned
   silently with nothing loaded. A from-scratch local Postgres 16 + pgTAP
   reproduction (`supabase/tests/004_admin_catalog_publishing.pg.sql`,
   `005_change_requests.pg.sql`) confirmed the RLS/embed queries themselves
   do **not** error for a brand-new user with zero rows — ruling out an
   RLS/policy cause for the empty-state case. Fixed by passing the
   already-resolved uid/role explicitly into every loader instead of
   reading `this.state` right after a same-tick `setState`, and by
   surfacing the real `{ code, message, details, hint }` from Supabase
   (logged in full via `catalog.js`'s `logSupabaseError`, and now also
   shown in the UI) instead of only ever the generic string.

3. **Plain users saw admin editing controls.** Root cause:
   `adminTab` defaulted to `'recipes'` (the admin-only catalog-editing tab)
   in the initial state — a leftover from before "Modo de Criação" existed,
   when reaching `screen==='admin'` at all implied `role==='admin'` by
   construction. The "Modo de Criação" PR hid the *tab buttons* for
   non-admins but never changed this default or gated the tab *content*
   dispatch, so every non-admin landed on the admin catalog editor's full
   edit/delete UI by default, with no button ever needed to get there.
   Fixed by defaulting `adminTab` to `'myRecipes'` (available to everyone),
   resetting away from any admin-only tab whenever the resolved role isn't
   `'admin'` (including while it's still loading, or on a fetch failure —
   `auth.js`'s `fetchProfile` already defaults to `'user'` on error, never
   `'admin'`), and gating the admin-tab content dispatch itself on
   `isAdminRole` as defense in depth, not only the tab buttons.

See the PR description for the full file list, migration order, and the
manual two-account checklist.

---

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
5. `supabase/006_admin_catalog_publishing.sql` — this PR. Adds the RLS
   policies that let `role='admin'` directly author `scope='site'` rows
   (categories/products/recipes/recipe_ingredients/recipe_categories),
   which genuinely did not exist before (see the root-cause writeup above).
   Also adds one new CHECK constraint (`recipes_site_not_private_ck`) and a
   `published_at` trigger. Depends on 004. Widening-only for admin; does
   not change what a plain user or anon can do.
6. `supabase/007_change_requests.sql` — this PR. Adds the publication
   request/moderation workflow: `change_requests` and
   `change_request_revisions` tables, `YRQ-0001` code generation, and the
   submit/resubmit/cancel/return/review RPCs. Depends on 004 and 006 (the
   approval RPC creates public catalog rows the same way direct admin
   authoring does). Brand new tables — does not alter any existing table's
   data or policies.

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
psql -U postgres -h localhost -d yourcipe_test -v ON_ERROR_STOP=1 -f supabase/006_admin_catalog_publishing.sql
psql -U postgres -h localhost -d yourcipe_test -v ON_ERROR_STOP=1 -f supabase/007_change_requests.sql

pg_prove -h localhost -U postgres -d yourcipe_test supabase/tests/001_profiles_display_name.pg.sql
pg_prove -h localhost -U postgres -d yourcipe_test supabase/tests/002_catalog_schema.pg.sql
pg_prove -h localhost -U postgres -d yourcipe_test supabase/tests/003_creation_mode_sharing.pg.sql
pg_prove -h localhost -U postgres -d yourcipe_test supabase/tests/004_admin_catalog_publishing.pg.sql
pg_prove -h localhost -U postgres -d yourcipe_test supabase/tests/005_change_requests.pg.sql
```

`supabase/tests/004_admin_catalog_publishing.pg.sql` (20 assertions) covers:
a plain user has no path to write `scope='site'` rows (the actual bug #1
root cause) both before and after this migration, admin can write them,
`recipes_site_not_private_ck` holds independently of RLS, draft is
admin-only/published is everyone's (including anon), `published_at` is set
on first publish and re-stamped on every later re-publish but preserved
(not cleared) when archived, and a plain user cannot write a site recipe's
ingredients or deactivate a public product.

`supabase/tests/005_change_requests.pg.sql` (53 assertions) covers: the
full submit → block-on-dependency → resolve → submit → return → resubmit
→ approve lifecycle for all three entity types, `requester_display_name_snapshot`
coming from the server-side profile (never the client), immutable
revisions (no direct UPDATE/DELETE grant at all), the original personal
item staying completely untouched (unconverted, unpublished) after
approval, admin-only review with a required note for return/reject,
per-user RLS isolation on `change_requests`/`change_request_revisions`,
and a simulated `action_type='update'` request proving `review_change_request`
detects a `base_version` mismatch and rolls back the whole approval with no
partial writes.

All 5 files together: **157 pgTAP assertions passing** locally against
Postgres 16 + pgTAP, with no cross-file interference (each wraps its own
fixtures in `begin;...rollback;`).

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

## 8. This PR's bug fixes + change_requests — **[HUMAN]** manual checklist with two accounts

Same network limitation as sections 5/7 — not click-tested here. Once
staging has 006 and 007 applied and the app is pointed at it, verify by
hand with one plain-`user` account and one `role='admin'` account
(promoted via `supabase/promote_admin_example.sql`, staging only):

**Bug #1 — public catalog:**
- As admin, open "Catálogo: Categorias" → create a category, active on.
  Open "Catálogo: Produtos" → create a product in it. Open "Catálogo:
  Receitas" → create a recipe using that product, set status "Publicada".
- Reload the app in a **different, logged-out browser/tab** (or as the
  plain user, or as anon) → the recipe/product/category must appear on
  Home/Search. Set the recipe back to "Rascunho" (draft) → it must
  disappear from that other session on reload.
- Create a second recipe as "Rascunho" → confirm it does **not** appear
  for anon/the other user, but does still appear to admin in "Catálogo:
  Receitas" (admin-only visibility of drafts).

**Bug #2 — personal data loading:**
- As a plain user, log in and immediately land on "Modo de Criação" (or
  navigate there right after login) → "Minhas Receitas/Produtos/Categorias"
  must load (empty state "Você ainda não tem..." is fine and is NOT an
  error) — no "Não foi possível carregar" message.
- Repeat as the admin account → same result, and confirm the admin's "Meu
  conteúdo" tabs show **only their own** personal data, never another
  user's.
- To confirm the error path itself works (not just that it's silent): with
  browser devtools open, simulate a Supabase failure (e.g. block network
  to the Supabase host mid-session) and confirm the UI shows a real,
  specific message (not just "erro desconhecido") and the browser console
  shows the full `{ code, message, details, hint }`.

**Bug #3 — role-based visibility:**
- As the plain user: confirm "Catálogo: Receitas/Produtos/Categorias" and
  "Solicitações Recebidas" tabs are **not visible at all**, and that
  opening "Modo de Criação" lands on "Minhas Receitas", never on any
  catalog-editing screen.
- As admin: confirm those tabs **are** visible and functional.
- While the profile/role is still resolving (e.g. throttle network in
  devtools right after login): confirm no admin-only tab briefly flashes
  visible before the role resolves.

**Change requests — full lifecycle:**
- As the plain user: create a personal category + product (product's
  category must be the new personal one) + a personal recipe using that
  product. Try "Solicitar publicação" on the recipe → it must be **blocked**
  with a message naming the pending product/category dependencies, with a
  working "Solicitar publicação" shortcut for each.
- Use those shortcuts to submit the category, then (once approved below)
  the product; edit the recipe/product to point at the newly-public items;
  then submit the recipe itself → should succeed.
- As admin: open "Solicitações Recebidas" → see the pending requests with
  the requester's real display name (not a uuid/email). Open one, click
  "Devolver para edição" without a note → must be blocked; with a note →
  status becomes "Devolvido".
- As the user: see it under "Meus Pedidos" filtered to "Devolvidos" with
  the admin's note visible; "Editar item" → edit the personal item →
  "Reenviar" → status becomes "Reenviado", revision count increments.
- As admin: "Aprovar como rascunho" on one request, "Aprovar e publicar" on
  another → confirm the resulting public items appear in "Catálogo:
  Receitas/Produtos/Categorias" with new `YCR-`/`YPR-`/`YCT-` codes, and
  that the user's **original personal item is untouched** (still private,
  still editable, unrelated to the new public copy).
- "Rejeitar" a request without a note → blocked; with a note → status
  "Rejeitado", visible to the user with the note.
- As the user: "Cancelar" a still-pending request → status "Cancelado",
  disappears from actionable filters.

**Compatibility (must still work exactly as before):**
- Signup/login, display_name, Turnstile.
- YSH-code sharing: activate/copy/regenerate/deactivate/revoke, and a
  shared recipe still reads the owner's live price.
- "Criar cópia própria" from a shared recipe still works, independent of
  and unaffected by the change-request flow.
- Existing YCR/YPR/YCT codes on any previously-created catalog rows are
  untouched.

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
