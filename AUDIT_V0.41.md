# V0.41 production audit

Scope: every frontend module, render path, modal/form family, Supabase migration,
RLS policy/RPC, and automated test in this repository. This is a source audit;
the hosted Supabase project and a real browser/session matrix were not available.

## Critical

### Untrusted catalog image URLs and unbounded names
- **Location:** catalog create/edit forms; `categories`, `products`, `recipes`.
- **Problem:** ordinary CRUD accepted arbitrary image schemes and unbounded names;
  only the spreadsheet importer required HTTP(S). Client validation alone would
  still be bypassable.
- **Risk:** stored hostile/unusable URLs, tracking payloads, oversized records,
  inconsistent importer/manual behavior.
- **Fix:** shared UX validation plus database `CHECK` constraints for all future
  writes. Constraints are `NOT VALID` so legacy bad rows cannot block rollout.
- **Status:** Fixed.

No exposed secret, service-role credential, unsafe HTML sink, cross-owner RLS
policy, or unauthenticated privileged RPC was found. The committed Supabase key
is the intended publishable client key; authorization remains in RLS and
server-side functions.

## High

### Recipe and product-section edits are not atomic
- **Location:** `catalog.replaceRecipeIngredients`,
  `catalog.replaceRecipeCategories`, `catalog.replaceProductCategories`, and
  their form save flows.
- **Problem:** each helper deletes children and then inserts replacements; parent,
  ingredients, and sections are also saved through independent requests.
- **Risk:** a network/database failure after delete can leave an otherwise saved
  recipe empty or only partially updated. The UI correctly reports partial
  success, but cannot roll it back.
- **Fix:** replace each multi-request edit with one ownership-checked RPC that
  validates the complete payload and updates parent/children in one transaction,
  including an expected `version` for optimistic concurrency.
- **Status:** Recommended.

### Click submissions do not share a universal pending lock
- **Location:** legacy personal/admin form save handlers and status toggles in
  `app.js`/`template.js`.
- **Problem:** keyboard submits have a rapid-submit guard, and several modern
  actions have busy state, but a number of clickable save/toggle controls do not.
- **Risk:** rapid clicks can issue overlapping updates; toggles can calculate the
  same next state twice and user feedback becomes nondeterministic.
- **Fix:** add one operation-keyed in-flight guard and expose its pending state to
  semantic buttons; keep controls disabled until refresh completes.
- **Status:** Recommended.

### Hosted authorization still needs deployment verification
- **Location:** all SQL under `supabase/`, especially RLS/RPC/storage deployment.
- **Problem:** source policies consistently bind ownership to `auth.uid()` and
  privileged RPCs re-check admin/owner, but repository inspection cannot prove
  that every migration is applied to the hosted project in order.
- **Risk:** schema drift can recreate IDOR or missing-column failures despite safe
  source.
- **Fix:** execute the documented two-user/admin staging matrix and compare live
  policies/functions with migrations before production promotion.
- **Status:** Needs manual decision.

## Medium

### Non-semantic interactive controls remain
- **Location:** authentication actions and multiple admin row actions in
  `template.js`.
- **Problem:** several actions are clickable `div` elements rather than native
  buttons; keyboard behavior is partly supplied by global modal handling.
- **Risk:** inconsistent focus/disabled semantics and degraded screen-reader or
  keyboard use.
- **Fix:** migrate these controls to a shared native `button` primitive while
  preserving current tokens and layouts.
- **Status:** Recommended.

### Oversized mixed-responsibility modules
- **Location:** `app.js` and `template.js`.
- **Problem:** state, remote orchestration, view-model construction, and all route
  rendering are concentrated in two very large files.
- **Risk:** changes have a broad regression surface and duplicated presentation
  patterns are difficult to discover or enforce.
- **Fix:** incrementally extract by product flow (auth, personal catalog, admin,
  requests), starting with shared buttons/modal shells and pure validators; do
  not rewrite routing/state wholesale.
- **Status:** Partially fixed.

### Error presentation is inconsistent
- **Location:** catalog/admin mutations and external dashboard loaders.
- **Problem:** some failures use inline retryable state, others use transient
  messages, and several user messages interpolate raw backend `error.message`.
- **Risk:** uneven recovery UX and possible disclosure of schema/function names.
- **Fix:** retain structured errors in diagnostics but map known error codes to
  stable user-safe messages through a shared formatter.
- **Status:** Recommended.

### List queries are not paginated for normal user libraries
- **Location:** personal recipes/products/categories, requests, and sales fetches
  in `catalog.js`.
- **Problem:** admin lists have a paged helper, while ordinary lists request every
  matching row.
- **Risk:** growing accounts will increase latency, memory, and render cost.
- **Fix:** add cursor/range pagination where account data is expected to grow;
  retain bulk child hydration to avoid N+1 requests.
- **Status:** Recommended.

### Product and recipe validators were duplicated
- **Location:** personal and site save handlers.
- **Problem:** name, URL, and numeric parsing had subtly different behavior;
  malformed prices could be silently converted to zero.
- **Risk:** unpredictable data and admin/user behavior divergence.
- **Fix:** shared pure validators are now used by both product families and image
  validation by both recipe families, with regression tests.
- **Status:** Fixed.

## Low

### Visual tokens coexist with extensive inline styles
- **Location:** `styles.css` and `template.js`.
- **Problem:** colors/radii/shadows use the established tokens, but repeated modal
  padding, headings, and action styles are still inline variants.
- **Risk:** slow visual drift and more expensive responsive maintenance.
- **Fix:** extract only repeated patterns into modal/card/action classes; preserve
  the current visual identity and existing token palette.
- **Status:** Partially fixed.

### Loading and empty-state patterns vary by feature
- **Location:** route loaders, creation/admin tables, and picker/modals.
- **Problem:** deliberate loading/error/empty states exist for major loaders, but
  wording and indicator treatment are not unified.
- **Risk:** minor perceived inconsistency rather than data corruption.
- **Fix:** introduce a small shared status block after the higher-risk atomicity
  and accessibility work.
- **Status:** Recommended.

### Product scope exceeds current implementation
- **Location:** whole repository.
- **Problem:** there is no order domain/flow in this version; requested order
  creation/update/status checks therefore cannot be traced or tested.
- **Risk:** none to current code, but product requirements may be incomplete.
- **Fix:** confirm whether orders are intentionally out of V0.41 scope before
  designing schema or UI.
- **Status:** Needs manual decision.

## Verification notes

- RLS is enabled on profiles, catalog, sharing, request, product-section, and
  sales tables. Owner policies use `auth.uid()`; site mutations use
  `is_admin()`; server-side enum/range/relationship checks are present.
- Destructive recipe/product/category flows use authorization-checking RPCs and
  explicit reference resolution. Raw direct deletes remain RLS constrained.
- Auth waits for session/profile resolution before protected views; stale async
  loaders use the load guard. Logout clears session-derived state.
- Preact interpolation is used instead of `innerHTML`; no committed private key
  or service-role credential was found.
- No browser automation is configured. Responsive layout, focus appearance,
  contrast, hover/pressed states, and screen-reader announcements require a
  manual browser/device pass; the source-level audit cannot visually certify
  them.
