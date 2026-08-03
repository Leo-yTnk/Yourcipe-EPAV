-- pgTAP tests for supabase/007_change_requests.sql.
-- Run against a local Postgres with supabase/tests/000_local_harness.sql,
-- supabase/schema.sql, supabase/002_..._phase1.sql, supabase/004_..._schema.sql,
-- supabase/005_creation_mode_sharing.sql and
-- supabase/006_admin_catalog_publishing.sql already applied.
-- Never run against a real Supabase project.
begin;
select plan(53);

select test.act_as(null, null);
insert into auth.users (id, raw_user_meta_data) values
  ('60000000-0000-0000-0000-000000000001', jsonb_build_object('display_name', 'Req Admin')),
  ('60000000-0000-0000-0000-000000000002', jsonb_build_object('display_name', 'Req User')),
  ('60000000-0000-0000-0000-000000000003', jsonb_build_object('display_name', 'Req User Two'));
update public.profiles set role = 'admin' where id = '60000000-0000-0000-0000-000000000001';

\set admin1 '''60000000-0000-0000-0000-000000000001'''
\set user1 '''60000000-0000-0000-0000-000000000002'''
\set user2 '''60000000-0000-0000-0000-000000000003'''

-- ---------------------------------------------------------------------
-- Fixture: user1's personal category (type=proteina) + product.
-- ---------------------------------------------------------------------
select test.act_as(:user1, 'authenticated');
insert into public.categories (scope, owner_id, type, name) values ('personal', :user1, 'proteina', 'Prot Pessoal User1')
  returning id as u1_prod_cat \gset
insert into public.products (scope, owner_id, name, category_id, unit, price) values ('personal', :user1, 'Produto Pessoal User1', :'u1_prod_cat', 'kg', 12.50)
  returning id as u1_product \gset

-- ---------------------------------------------------------------------
-- 1. Submitting a category request: dependency-free, always allowed.
-- ---------------------------------------------------------------------
select public.submit_category_request(:'u1_prod_cat', 'quero publicar minha categoria') as cat_req_id \gset
select ok(:'cat_req_id' is not null, 'submit_category_request returns a request id');
select is((select status from public.change_requests where id = :'cat_req_id'), 'submitted', 'a fresh category request has status=submitted');
select matches((select request_code from public.change_requests where id = :'cat_req_id'), '^YRQ-\d{4}$', 'request_code follows the YRQ-0001 pattern');
select is((select requester_display_name_snapshot from public.change_requests where id = :'cat_req_id'), 'Req User', 'requester_display_name_snapshot comes from the server-side profile, not the client');
select is((select current_revision from public.change_requests where id = :'cat_req_id'), 1, 'a fresh request starts at revision 1');
select is(
  (select payload ->> 'name' from public.change_request_revisions where request_id = :'cat_req_id' and revision_number = 1),
  'Prot Pessoal User1',
  'the revision 1 snapshot captures the category name at submission time'
);

-- Cannot submit a second request for the same source while one is pending.
select throws_like(
  format($$select public.submit_category_request(%L, 'de novo')$$, :'u1_prod_cat'),
  'request_already_pending',
  'a second submission for the same source item while one is pending is rejected'
);

-- ---------------------------------------------------------------------
-- 2. Product submission is blocked while its category is still personal;
--    unblocked once the category is public.
-- ---------------------------------------------------------------------
select throws_like(
  format($$select public.submit_product_request(%L, 'quero publicar')$$, :'u1_product'),
  'product_has_personal_dependencies',
  'submit_product_request is blocked while the product''s own category is still personal'
);

-- ---------------------------------------------------------------------
-- 3. A plain user cannot review requests; admin can.
-- ---------------------------------------------------------------------
select throws_like(
  format($$select public.review_change_request(%L, 'approve', null, 'published')$$, :'cat_req_id'),
  'not_admin',
  'a plain user cannot call review_change_request'
);

select test.act_as(:admin1, 'authenticated');
select public.review_change_request(:'cat_req_id', 'approve', null, 'published') as cat_review_result \gset
select is((select status from public.change_requests where id = :'cat_req_id'), 'approved', 'approving a category request marks it approved');
select isnt((select target_id from public.change_requests where id = :'cat_req_id'), null, 'approving sets target_id');
select matches((select target_code from public.change_requests where id = :'cat_req_id'), '^YCT-\d{4}$', 'the newly published category gets its own YCT code');
select is(
  (select owner_id from public.categories where id = (select target_id from public.change_requests where id = :'cat_req_id')),
  null,
  'the newly published category has owner_id=NULL (public, not converted from the personal one)'
);
-- Checked as superuser (bypassing RLS) purely as a DB-state fact, since
-- admin cannot (and per spec, must not) generally SELECT another user's
-- personal rows — this is a state assertion, not a permission check.
select test.act_as(null, null);
select is(
  (select scope from public.categories c join public.change_requests cr on cr.source_id = c.id where cr.id = :'cat_req_id'),
  'personal',
  'the ORIGINAL personal category is untouched — still scope=personal (never converted, never deleted)'
);
select test.act_as(:admin1, 'authenticated');

select target_id as u1_public_prod_cat from public.change_requests where id = :'cat_req_id' \gset

-- ---------------------------------------------------------------------
-- 4. Now that the category is public, product submission succeeds — but
--    only once the user has actually relinked their personal product to
--    the newly published public category. Publishing a category never
--    auto-relinks anything that used to reference the personal one (no
--    automatic cascade, same "não publicar... automaticamente em
--    cascata" principle as recipe dependencies) — this is the
--    "substituir por item público" shortcut applied here by hand, exactly
--    as a real user would do it via the personal product's own edit form.
-- ---------------------------------------------------------------------
select test.act_as(:user1, 'authenticated');
update public.products set category_id = :'u1_public_prod_cat' where id = :'u1_product';
select test.act_as(:user1, 'authenticated');
select public.submit_product_request(:'u1_product', 'produto pronto') as prod_req_id \gset
select is((select status from public.change_requests where id = :'prod_req_id'), 'submitted', 'product request submits once its category dependency is resolved');

-- Admin approves as DRAFT this time (not published).
select test.act_as(:admin1, 'authenticated');
select public.review_change_request(:'prod_req_id', 'approve', null, 'draft');
select target_id as u1_public_product from public.change_requests where id = :'prod_req_id' \gset
select is((select active from public.products where id = :'u1_public_product'), false, '"Aprovar como rascunho" for a product creates it with active=false');

-- ---------------------------------------------------------------------
-- 5. Recipe submission: blocked while its own category/sections/
--    ingredients still reference personal items; unblocked once resolved.
-- ---------------------------------------------------------------------
select test.act_as(:user1, 'authenticated');
insert into public.categories (scope, owner_id, type, name) values ('personal', :user1, 'receita', 'Cat Receita Pessoal')
  returning id as u1_recipe_cat \gset
insert into public.recipes (scope, owner_id, status, name, category_id, difficulty)
  values ('personal', :user1, 'private', 'Receita Para Publicar', :'u1_recipe_cat', 'Fácil')
  returning id as u1_recipe \gset
insert into public.recipe_ingredients (recipe_id, product_id, quantity) values (:'u1_recipe', :'u1_product', 2);

select (public.check_recipe_publish_dependencies(:'u1_recipe') ->> 'blocked')::boolean as deps_blocked \gset
select ok(:'deps_blocked', 'check_recipe_publish_dependencies reports blocked=true while dependencies remain personal');

select throws_like(
  format($$select public.submit_recipe_request(%L, 'quero publicar')$$, :'u1_recipe'),
  'recipe_has_personal_dependencies',
  'submit_recipe_request refuses to finalize while the recipe has personal dependencies (category + ingredient product)'
);

-- Resolve the remaining dependencies: activate the already-published
-- product, relink the recipe's ingredient row to that PUBLIC product
-- (publishing never auto-relinks anything that referenced the personal
-- original — same "substituir por item público" shortcut as above, one
-- level up), and publish the recipe's own category too.
select test.act_as(:admin1, 'authenticated');
update public.products set active = true where id = :'u1_public_product';

select test.act_as(:user1, 'authenticated');
update public.recipe_ingredients set product_id = :'u1_public_product' where recipe_id = :'u1_recipe';
select public.submit_category_request(:'u1_recipe_cat', null) as recipe_cat_req_id \gset
select test.act_as(:admin1, 'authenticated');
select public.review_change_request(:'recipe_cat_req_id', 'approve', null, 'published');
select target_id as u1_public_recipe_cat from public.change_requests where id = :'recipe_cat_req_id' \gset

select test.act_as(:user1, 'authenticated');
update public.recipes set category_id = :'u1_public_recipe_cat' where id = :'u1_recipe';

-- Now every reference the recipe touches is public+active — submission
-- must succeed.
select test.act_as(:user1, 'authenticated');
select (public.check_recipe_publish_dependencies(:'u1_recipe') ->> 'blocked')::boolean as deps_blocked2 \gset
select ok(not :'deps_blocked2', 'check_recipe_publish_dependencies reports blocked=false once every reference is public');

select public.submit_recipe_request(:'u1_recipe', 'receita pronta') as recipe_req_id \gset
select is((select status from public.change_requests where id = :'recipe_req_id'), 'submitted', 'submit_recipe_request succeeds once all dependencies are public');
select is(
  (select jsonb_array_length(payload -> 'ingredients') from public.change_request_revisions where request_id = :'recipe_req_id' and revision_number = 1),
  1,
  'the recipe snapshot captures its ingredient list'
);
select is(
  (select (payload -> 'ingredients' -> 0 ->> 'price')::numeric from public.change_request_revisions where request_id = :'recipe_req_id' and revision_number = 1),
  12.50,
  'the recipe snapshot captures the ingredient product''s price at submission time'
);

-- ---------------------------------------------------------------------
-- 6. Return for edit (admin) — requires a note, moves to
--    changes_requested, never creates public content, never touches the
--    existing snapshot/revision.
-- ---------------------------------------------------------------------
select test.act_as(:admin1, 'authenticated');
select throws_like(
  format($$select public.return_change_request(%L, null)$$, :'recipe_req_id'),
  'admin_note_required',
  'return_change_request requires a non-empty admin_note'
);
select public.return_change_request(:'recipe_req_id', 'Ajuste o tempo de preparo, por favor.');
select is((select status from public.change_requests where id = :'recipe_req_id'), 'changes_requested', 'return_change_request moves the request to changes_requested');
select is((select admin_note from public.change_requests where id = :'recipe_req_id'), 'Ajuste o tempo de preparo, por favor.', 'the admin note is recorded');
select is((select count(*)::int from public.recipes where scope = 'site' and name = 'Receita Para Publicar'), 0, 'returning for edit never creates any public content');
select is((select current_revision from public.change_requests where id = :'recipe_req_id'), 1, 'returning for edit does not touch current_revision');

-- Only the requester can resubmit, and only while changes_requested.
select test.act_as(:user2, 'authenticated');
select throws_like(
  format($$select public.resubmit_recipe_request(%L, 'não sou eu')$$, :'recipe_req_id'),
  'not_found_or_not_owned',
  'a different user cannot resubmit someone else''s request'
);

select test.act_as(:user1, 'authenticated');
update public.recipes set prep_time = 45 where id = :'u1_recipe';
select public.resubmit_recipe_request(:'recipe_req_id', 'Ajustado, obrigado!') as new_rev \gset
select is(:'new_rev'::int, 2, 'resubmit_recipe_request bumps current_revision to 2');
select is((select status from public.change_requests where id = :'recipe_req_id'), 'resubmitted', 'resubmitting sets status=resubmitted');
select is(
  (select payload ->> 'name' from public.change_request_revisions where request_id = :'recipe_req_id' and revision_number = 1),
  'Receita Para Publicar',
  'the original revision 1 payload is preserved unchanged after resubmission'
);
select is(
  ((select payload ->> 'prep_time' from public.change_request_revisions where request_id = :'recipe_req_id' and revision_number = 2))::int,
  45,
  'the new revision 2 reflects the freshly reloaded server-side data, not a client-supplied payload'
);
select throws_matching(
  $$update public.change_request_revisions set message = 'hacked' where revision_number = 1$$,
  'permission denied',
  'a revision can never be updated directly by an authenticated client — no UPDATE grant at all'
);
select throws_matching(
  $$delete from public.change_request_revisions where revision_number = 1$$,
  'permission denied',
  'a revision can never be deleted directly by an authenticated client — no DELETE grant at all'
);

-- ---------------------------------------------------------------------
-- 7. Approve and publish — full recipe with ingredients + section tags.
-- ---------------------------------------------------------------------
select test.act_as(:admin1, 'authenticated');
select public.review_change_request(:'recipe_req_id', 'approve', 'Ficou ótima!', 'published') as recipe_review \gset
select is((select status from public.change_requests where id = :'recipe_req_id'), 'approved', 'approving the recipe request marks it approved');
select target_id as u1_public_recipe from public.change_requests where id = :'recipe_req_id' \gset
select is((select status from public.recipes where id = :'u1_public_recipe'), 'published', '"Aprovar e publicar" creates the recipe already published');
select isnt((select published_at from public.recipes where id = :'u1_public_recipe'), null, 'published_at is set on the newly published recipe');
select is((select prep_time from public.recipes where id = :'u1_public_recipe'), 45, 'the published recipe reflects the latest (revision 2) resubmitted data');
select is((select count(*)::int from public.recipe_ingredients where recipe_id = :'u1_public_recipe'), 1, 'the published recipe has its ingredient row created');

-- Checked as superuser, same reasoning as the earlier category ownership
-- check: admin has no general SELECT on another user's personal rows.
select test.act_as(null, null);
select is(
  (select owner_id from public.recipes where id = :'u1_recipe'),
  :user1::uuid,
  'the ORIGINAL personal recipe is still owned by user1, unconverted, unpublished (status=private)'
);
select is((select status from public.recipes where id = :'u1_recipe'), 'private', 'the original personal recipe keeps status=private');
select test.act_as(:admin1, 'authenticated');

-- Publicly visible now.
select test.act_as('99999999-0000-0000-0000-000000000097', 'anon');
select is((select count(*)::int from public.recipes where id = :'u1_public_recipe'), 1, 'anon can see the newly published recipe');

-- ---------------------------------------------------------------------
-- 8. Rejection.
-- ---------------------------------------------------------------------
select test.act_as(:user2, 'authenticated');
insert into public.categories (scope, owner_id, type, name) values ('personal', :user2, 'secao', 'Seção Recusada')
  returning id as u2_cat \gset
select public.submit_category_request(:'u2_cat', 'tentando') as reject_req_id \gset
select test.act_as(:admin1, 'authenticated');
select throws_like(
  format($$select public.review_change_request(%L, 'reject', null, null)$$, :'reject_req_id'),
  'admin_note_required',
  'rejecting also requires a non-empty admin_note'
);
select public.review_change_request(:'reject_req_id', 'reject', 'Já existe uma seção equivalente.', null);
select is((select status from public.change_requests where id = :'reject_req_id'), 'rejected', 'rejecting sets status=rejected');
select is((select target_id from public.change_requests where id = :'reject_req_id'), null, 'a rejected request never gets a target_id');

-- ---------------------------------------------------------------------
-- 9. Cancellation (requester-only, only from a non-terminal state).
-- ---------------------------------------------------------------------
select test.act_as(:user2, 'authenticated');
insert into public.categories (scope, owner_id, type, name) values ('personal', :user2, 'secao', 'Seção A Cancelar')
  returning id as u2_cat2 \gset
select public.submit_category_request(:'u2_cat2', null) as cancel_req_id \gset
select public.cancel_change_request(:'cancel_req_id');
select is((select status from public.change_requests where id = :'cancel_req_id'), 'cancelled', 'cancel_change_request works on a submitted request');
select throws_like(
  format($$select public.cancel_change_request(%L)$$, :'cancel_req_id'),
  'not_found_or_not_cancellable',
  'an already-cancelled request cannot be cancelled again'
);

-- ---------------------------------------------------------------------
-- 10. RLS isolation: user2 cannot see user1's requests/revisions; admin
--     sees everything.
-- ---------------------------------------------------------------------
select test.act_as(:user2, 'authenticated');
select is((select count(*)::int from public.change_requests where id = :'recipe_req_id'), 0, 'user2 cannot see user1''s change_requests row');
select is((select count(*)::int from public.change_request_revisions where request_id = :'recipe_req_id'), 0, 'user2 cannot see user1''s revisions either');

select test.act_as(:admin1, 'authenticated');
select ok((select count(*)::int from public.change_requests) >= 5, 'admin can see every change_requests row across all users');

-- ---------------------------------------------------------------------
-- 11. Version conflict on an action_type='update' request (simulated
--     directly, since no submission RPC produces 'update' in this PR —
--     see the migration's header comment).
-- ---------------------------------------------------------------------
select test.act_as(null, null);
insert into public.change_requests (
  requester_id, requester_display_name_snapshot, entity_type, action_type,
  source_id, target_id, base_version, status, submitted_at
) values (
  :user1, 'Req User', 'category', 'update',
  :'u1_prod_cat', :'u1_public_prod_cat', 999, 'submitted', now()
) returning id as conflict_req_id \gset
insert into public.change_request_revisions (request_id, revision_number, payload, submitted_by)
values (:'conflict_req_id', 1, jsonb_build_object('name', 'Nome Novo', 'type', 'proteina'), :user1);

select test.act_as(:admin1, 'authenticated');
select throws_like(
  format($$select public.review_change_request(%L, 'approve', null, 'published')$$, :'conflict_req_id'),
  'version_conflict',
  'review_change_request blocks approval when base_version does not match the live target''s current version'
);
select is((select status from public.change_requests where id = :'conflict_req_id'), 'submitted', 'a version-conflict rollback leaves the request untouched (still submitted, not approved)');
select is((select name from public.categories where id = :'u1_public_prod_cat'), 'Prot Pessoal User1', 'a version-conflict rollback leaves the target category untouched');

select test.act_as(null, null);
select * from finish();
rollback;