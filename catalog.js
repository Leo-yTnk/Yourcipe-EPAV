// Data access for "Modo de Criação": personal recipes/products/categories,
// recipe sharing, personal copies, safe authorship lookup, the public
// catalog (read for everyone, write for admin only), and the change-request
// (publication) workflow. Every function here talks to Supabase directly —
// RLS (see supabase/004_catalog_schema.sql, supabase/005_..._sharing.sql,
// supabase/006_..._publishing.sql, supabase/007_change_requests.sql) is
// what actually enforces ownership, role, and read-only shared access; this
// module never re-implements those checks client-side, it just shapes the
// calls and normalizes the responses. owner_id/requester_id/role/
// display_name are only ever read back from Supabase, never invented or
// forwarded by the caller of these functions — the one exception
// (createRecipe/createProduct/createCategory/createSiteRecipe/... taking an
// ownerId argument) always receives it from the caller's own
// session.user.id, never from anywhere else; the server independently
// re-validates it via RLS/RPC regardless.
import { supabase } from './supabase-client.js?v=20260803-1';

const RECIPE_SELECT = 'id, recipe_code, owner_id, scope, status, name, category_id, prep_time, servings, difficulty, image_url, featured, extras, instructions, tips, version, created_at, updated_at';
const PRODUCT_SELECT = 'id, product_code, owner_id, scope, name, category_id, unit, price, active, version, created_at, updated_at';
const CATEGORY_SELECT = 'id, category_code, owner_id, scope, type, name, slug, sort_order, active, version';

// ---------------------------------------------------------------------
// Shared, FK-hinted embed selects.
//
// `recipes` and `categories` have TWO relationship paths PostgREST can see:
// (1) the direct FK recipes.category_id -> categories.id
//     (constraint `recipes_category_id_fkey`), and
// (2) an implicit many-to-many path via the `recipe_categories` bridge
//     table (constraints `recipe_categories_recipe_id_fkey` and
//     `recipe_categories_category_id_fkey`).
// Any `.from('recipes').select('..., categories(...)')` without an explicit
// FK hint is therefore genuinely ambiguous to PostgREST's embedding
// resolver, which is exactly what produces `PGRST201` ("Could not embed
// because more than one relationship was found"). The fix is always the
// same shape: `categories!<constraint_name>(...)`.
//
// `products`/`recipe_ingredients`/`recipe_categories` each only have a
// single direct FK to `categories`/`products`/`recipes` respectively (no
// bridge table connects them a second way), so those embeds are not
// actually ambiguous today — but every embed below still names its FK
// constraint explicitly anyway, both for symmetry/readability and as a
// hedge against a *future* schema change (e.g. a second FK) silently
// reintroducing PGRST201 somewhere. Every FK name here was verified against
// `pg_constraint` on a from-scratch local Postgres 16 instance with
// schema.sql + 002 + 004 + 005 + 006 + 007 applied (see supabase/STAGING.md).
//
// All embeds use ordinary left-join semantics (never `!inner`) so a recipe
// with zero `recipe_categories` rows or zero `recipe_ingredients` rows is
// still returned by every query below — never silently dropped.
//
// Every caller that needs one of these shapes uses the constant exported
// here instead of hand-rolling its own select string, so there is exactly
// one place to fix if a shape or FK hint ever needs to change.
// ---------------------------------------------------------------------
const CATEGORY_MINI_SELECT = 'id, name';
const CATEGORY_DETAIL_SELECT = 'id, name, type, owner_id, scope, active';

export const PRODUCT_WITH_CATEGORY_SELECT =
  `${PRODUCT_SELECT}, category:categories!products_category_id_fkey(${CATEGORY_MINI_SELECT})`;

export const RECIPE_WITH_CATEGORY_SELECT =
  `${RECIPE_SELECT}, category:categories!recipes_category_id_fkey(${CATEGORY_MINI_SELECT})`;

export const RECIPE_DETAIL_WITH_CATEGORY_SELECT =
  `${RECIPE_SELECT}, category:categories!recipes_category_id_fkey(${CATEGORY_DETAIL_SELECT})`;

export const RECIPE_INGREDIENT_DETAIL_SELECT =
  `id, product_id, quantity, sort_order, product:products!recipe_ingredients_product_id_fkey(${PRODUCT_SELECT}, category:categories!products_category_id_fkey(${CATEGORY_MINI_SELECT}))`;

export const RECIPE_SECTION_DETAIL_SELECT =
  `category_id, sort_order, category:categories!recipe_categories_category_id_fkey(${CATEGORY_DETAIL_SELECT})`;

export const RECIPE_SECTION_SLUG_SELECT =
  `recipe_id, category:categories!recipe_categories_category_id_fkey(slug)`;

// Every failed Supabase call is logged here with its real code/message/
// details/hint (never only a generic string) and returns a normalized
// `{ error: { code, message, details, hint, operation } }` so the UI can
// show something real instead of a bare "não foi possível carregar" —
// see the PR description for why this matters (bug #2's investigation).
function logSupabaseError(operation, error) {
  // eslint-disable-next-line no-console
  console.error(`[Supabase] ${operation} failed`, {
    code: error && error.code, message: error && error.message,
    details: error && error.details, hint: error && error.hint,
  });
}
function unwrap({ data, error }, operation) {
  if (error) {
    logSupabaseError(operation, error);
    return { error: { code: error.code, message: error.message, details: error.details, hint: error.hint, operation } };
  }
  return { data };
}

// ---- Categories (personal) ----
export async function fetchMyCategories(userId, type) {
  let q = supabase.from('categories').select(CATEGORY_SELECT).eq('owner_id', userId).eq('scope', 'personal').order('name');
  if (type) q = q.eq('type', type);
  return unwrap(await q, 'fetchMyCategories');
}
export async function createCategory(ownerId, { type, name }) {
  return unwrap(await supabase.from('categories').insert({ owner_id: ownerId, scope: 'personal', type, name }).select(CATEGORY_SELECT).single(), 'createCategory');
}
export async function updateCategoryName(id, name) {
  return unwrap(await supabase.from('categories').update({ name }).eq('id', id).select(CATEGORY_SELECT).single(), 'updateCategoryName');
}
export async function deleteCategory(id) {
  return unwrap(await supabase.from('categories').delete().eq('id', id), 'deleteCategory');
}

// ---- Products (personal) ----
export async function fetchMyProducts(userId) {
  return unwrap(await supabase.from('products').select(PRODUCT_WITH_CATEGORY_SELECT).eq('owner_id', userId).eq('scope', 'personal').order('name'), 'fetchMyProducts');
}
export async function createProduct(ownerId, { name, categoryId, unit, price }) {
  return unwrap(await supabase.from('products').insert({ owner_id: ownerId, scope: 'personal', name, category_id: categoryId, unit, price }).select(PRODUCT_SELECT).single(), 'createProduct');
}
export async function updateProduct(id, patch) {
  return unwrap(await supabase.from('products').update(patch).eq('id', id).select(PRODUCT_SELECT).single(), 'updateProduct');
}
export async function deleteProduct(id) {
  return unwrap(await supabase.from('products').delete().eq('id', id), 'deleteProduct');
}

// ---- Recipes (personal): list + full detail ----
export async function fetchMyRecipes(userId) {
  return unwrap(await supabase.from('recipes').select(RECIPE_WITH_CATEGORY_SELECT).eq('owner_id', userId).eq('scope', 'personal').order('name'), 'fetchMyRecipes');
}

// Recipes the caller has active read-only access to via a share (their
// "biblioteca compartilhada"), newest grant first.
export async function fetchSharedLibrary(userId) {
  return unwrap(await supabase
    .from('recipe_access_grants')
    // `recipe_access_grants` has exactly one FK to `recipes`
    // (`recipe_access_grants_recipe_id_fkey`, verified against
    // pg_constraint — see supabase/STAGING.md), so this embed was never
    // actually ambiguous. The hint is added anyway, for the same
    // consistency/hedge reasoning as every other embed in this file.
    .select(`granted_at, recipe:recipes!recipe_access_grants_recipe_id_fkey(${RECIPE_WITH_CATEGORY_SELECT})`)
    .eq('grantee_id', userId)
    .is('revoked_at', null)
    .order('granted_at', { ascending: false }), 'fetchSharedLibrary');
}

export async function fetchRecipeDetail(recipeId) {
  const { data: recipe, error: recipeError } = await supabase.from('recipes').select(RECIPE_DETAIL_WITH_CATEGORY_SELECT).eq('id', recipeId).single();
  if (recipeError) { logSupabaseError('fetchRecipeDetail:recipe', recipeError); return { error: { code: recipeError.code, message: recipeError.message, details: recipeError.details, hint: recipeError.hint, operation: 'fetchRecipeDetail' } }; }
  const [{ data: ingredients, error: ingError }, { data: sections, error: secError }] = await Promise.all([
    supabase.from('recipe_ingredients').select(RECIPE_INGREDIENT_DETAIL_SELECT).eq('recipe_id', recipeId).order('sort_order'),
    supabase.from('recipe_categories').select(RECIPE_SECTION_DETAIL_SELECT).eq('recipe_id', recipeId).order('sort_order'),
  ]);
  if (ingError) { logSupabaseError('fetchRecipeDetail:ingredients', ingError); return { error: { code: ingError.code, message: ingError.message, details: ingError.details, hint: ingError.hint, operation: 'fetchRecipeDetail' } }; }
  if (secError) { logSupabaseError('fetchRecipeDetail:sections', secError); return { error: { code: secError.code, message: secError.message, details: secError.details, hint: secError.hint, operation: 'fetchRecipeDetail' } }; }
  return { data: { recipe, ingredients: ingredients || [], sections: sections || [] } };
}

export async function createRecipe(ownerId, fields) {
  return unwrap(await supabase.from('recipes').insert({
    owner_id: ownerId, scope: 'personal', status: 'private',
    name: fields.name, category_id: fields.categoryId, prep_time: fields.prepTime, servings: fields.servings,
    difficulty: fields.difficulty, image_url: fields.imageUrl || null,
    extras: fields.extras || [], instructions: fields.instructions || [], tips: fields.tips || [],
  }).select(RECIPE_SELECT).single(), 'createRecipe');
}
export async function updateRecipe(id, patch) {
  return unwrap(await supabase.from('recipes').update(patch).eq('id', id).select(RECIPE_SELECT).single(), 'updateRecipe');
}
export async function deleteRecipe(id) {
  return unwrap(await supabase.from('recipes').delete().eq('id', id), 'deleteRecipe');
}

// Full replace is simplest/safest for a form-driven editor: clear then
// re-insert. Works identically for a personal recipe or a site recipe —
// RLS (personal-owner policies from 004, admin-site policies from 006)
// decides which rows the caller is actually allowed to touch either way.
export async function replaceRecipeIngredients(recipeId, rows) {
  const del = await supabase.from('recipe_ingredients').delete().eq('recipe_id', recipeId);
  if (del.error) { logSupabaseError('replaceRecipeIngredients:delete', del.error); return { error: { code: del.error.code, message: del.error.message, details: del.error.details, hint: del.error.hint, operation: 'replaceRecipeIngredients' } }; }
  if (!rows.length) return { data: [] };
  return unwrap(await supabase.from('recipe_ingredients').insert(
    rows.map((row, i) => ({ recipe_id: recipeId, product_id: row.productId, quantity: row.quantity, sort_order: i }))
  ).select(), 'replaceRecipeIngredients:insert');
}
export async function replaceRecipeCategories(recipeId, categoryIds) {
  const del = await supabase.from('recipe_categories').delete().eq('recipe_id', recipeId);
  if (del.error) { logSupabaseError('replaceRecipeCategories:delete', del.error); return { error: { code: del.error.code, message: del.error.message, details: del.error.details, hint: del.error.hint, operation: 'replaceRecipeCategories' } }; }
  if (!categoryIds.length) return { data: [] };
  return unwrap(await supabase.from('recipe_categories').insert(
    categoryIds.map((categoryId, i) => ({ recipe_id: recipeId, category_id: categoryId, sort_order: i }))
  ).select(), 'replaceRecipeCategories:insert');
}

// ---- Sharing (owner side) ----
export async function activateSharing(recipeId) {
  return unwrap(await supabase.rpc('activate_recipe_sharing', { p_recipe_id: recipeId }), 'activateSharing');
}
export async function regenerateShareCode(recipeId) {
  return unwrap(await supabase.rpc('regenerate_recipe_share_code', { p_recipe_id: recipeId }), 'regenerateShareCode');
}
export async function deactivateSharing(recipeId) {
  return unwrap(await supabase.rpc('deactivate_recipe_sharing', { p_recipe_id: recipeId }), 'deactivateSharing');
}
export async function revokeAccess(recipeId, granteeId) {
  return unwrap(await supabase.rpc('revoke_recipe_access', { p_recipe_id: recipeId, p_grantee_id: granteeId || null }), 'revokeAccess');
}
export async function fetchShareStatus(recipeId) {
  const { data, error } = await supabase.from('recipe_shares').select('share_code, active').eq('recipe_id', recipeId).maybeSingle();
  if (error) { logSupabaseError('fetchShareStatus', error); return { error: { code: error.code, message: error.message, details: error.details, hint: error.hint, operation: 'fetchShareStatus' } }; }
  return { data };
}
export async function fetchActiveGrantCount(recipeId) {
  const { count, error } = await supabase.from('recipe_access_grants').select('id', { count: 'exact', head: true }).eq('recipe_id', recipeId).is('revoked_at', null);
  if (error) { logSupabaseError('fetchActiveGrantCount', error); return { error: { code: error.code, message: error.message, details: error.details, hint: error.hint, operation: 'fetchActiveGrantCount' } }; }
  return { data: count || 0 };
}

// ---- Redemption (grantee side) ----
const SHARE_CODE_GENERIC_ERROR = 'Código inválido. Verifique e tente novamente.';
export async function redeemShareCode(rawCode) {
  const { data, error } = await supabase.rpc('redeem_recipe_share', { p_share_code: String(rawCode || '').trim() });
  if (error) {
    logSupabaseError('redeemShareCode', error);
    const msg = (error.message || '').toLowerCase();
    if (msg.includes('cannot_add_own_recipe')) return { error: { friendly: 'Esta receita já é sua.' } };
    return { error: { friendly: SHARE_CODE_GENERIC_ERROR } };
  }
  return { data };
}

// ---- Authorship ----
export async function getRecipeAuthorName(recipeId) {
  return unwrap(await supabase.rpc('get_recipe_author_name', { p_recipe_id: recipeId }), 'getRecipeAuthorName');
}

// ---- Personal copy ----
export async function createRecipeCopy(recipeId, resolutions) {
  const { data, error } = await supabase.rpc('create_recipe_copy', { p_recipe_id: recipeId, p_resolutions: resolutions || [] });
  if (error) { logSupabaseError('createRecipeCopy', error); return { error: { code: error.code, message: error.message, details: error.details, hint: error.hint, operation: 'createRecipeCopy' } }; }
  return { data };
}

// Computes which category/product references a recipe's full detail
// (as returned by fetchRecipeDetail) touches that are "foreign" to
// `viewerId` — scope='personal' and owned by someone else — and therefore
// need a decision (add/map/remove) before create_recipe_copy() will
// finalize a copy. Pure/client-side: only used to drive the popup; the RPC
// itself independently recomputes the same set server-side and is the
// actual authority (see supabase/005_creation_mode_sharing.sql).
function isForeign(cat, viewerId) {
  return !!cat && cat.scope === 'personal' && cat.owner_id !== viewerId;
}
export function computeForeignReferences(detail, viewerId) {
  const refs = [];
  const seen = new Set();
  const addRef = (refType, refId, label, purpose) => {
    const key = refType + ':' + refId;
    if (seen.has(key)) return;
    seen.add(key);
    refs.push({ refType, refId, label, purpose });
  };
  const primaryCat = detail.recipe.category;
  if (isForeign(primaryCat, viewerId)) addRef('category', primaryCat.id, primaryCat.name, 'primary');
  (detail.sections || []).forEach((s) => {
    if (isForeign(s.category, viewerId)) addRef('category', s.category.id, s.category.name, 'section');
  });
  (detail.ingredients || []).forEach((ing) => {
    const p = ing.product;
    if (p && p.scope === 'personal' && p.owner_id !== viewerId) addRef('product', p.id, p.name, 'ingredient');
  });
  return refs;
}

// ---- Public catalog (read: everyone; write: admin only) ----
export async function fetchPublicCategories() {
  return unwrap(await supabase.from('categories').select(CATEGORY_SELECT).eq('scope', 'site').eq('active', true).order('name'), 'fetchPublicCategories');
}
export async function fetchPublicProducts() {
  return unwrap(await supabase.from('products').select(PRODUCT_WITH_CATEGORY_SELECT).eq('scope', 'site').eq('active', true).order('name'), 'fetchPublicProducts');
}
export async function fetchPublicRecipes() {
  return unwrap(await supabase.from('recipes').select(RECIPE_WITH_CATEGORY_SELECT).eq('scope', 'site').eq('status', 'published').order('name'), 'fetchPublicRecipes');
}
// Bulk-fetch ingredients/section tags for a set of published recipe ids —
// used to hydrate the full Home/Search catalog in two extra round trips
// instead of one per recipe.
export async function fetchRecipeIngredientsBulk(recipeIds) {
  if (!recipeIds.length) return { data: [] };
  return unwrap(await supabase.from('recipe_ingredients').select('recipe_id, product_id, quantity, sort_order').in('recipe_id', recipeIds).order('sort_order'), 'fetchRecipeIngredientsBulk');
}
export async function fetchRecipeSectionsBulk(recipeIds) {
  if (!recipeIds.length) return { data: [] };
  return unwrap(await supabase.from('recipe_categories').select(RECIPE_SECTION_SLUG_SELECT).in('recipe_id', recipeIds), 'fetchRecipeSectionsBulk');
}

// ---- Admin: full visibility into the public catalog (any status/active),
// gated server-side by the *_select_admin_site RLS policies (006) ----
export async function fetchAdminCategories() {
  return unwrap(await supabase.from('categories').select(CATEGORY_SELECT).eq('scope', 'site').order('name'), 'fetchAdminCategories');
}
export async function fetchAdminProducts() {
  return unwrap(await supabase.from('products').select(PRODUCT_WITH_CATEGORY_SELECT).eq('scope', 'site').order('name'), 'fetchAdminProducts');
}
export async function fetchAdminRecipes() {
  return unwrap(await supabase.from('recipes').select(RECIPE_WITH_CATEGORY_SELECT).eq('scope', 'site').order('name'), 'fetchAdminRecipes');
}

// ---- Admin: direct catalog authoring (scope='site', owner_id=NULL) ----
export async function createSiteCategory({ type, name, active }) {
  return unwrap(await supabase.from('categories').insert({ scope: 'site', owner_id: null, type, name, active: !!active }).select(CATEGORY_SELECT).single(), 'createSiteCategory');
}
export async function updateSiteCategory(id, patch) {
  return unwrap(await supabase.from('categories').update(patch).eq('id', id).select(CATEGORY_SELECT).single(), 'updateSiteCategory');
}
export async function createSiteProduct({ name, categoryId, unit, price, active }) {
  return unwrap(await supabase.from('products').insert({ scope: 'site', owner_id: null, name, category_id: categoryId, unit, price, active: !!active }).select(PRODUCT_SELECT).single(), 'createSiteProduct');
}
export async function updateSiteProduct(id, patch) {
  return unwrap(await supabase.from('products').update(patch).eq('id', id).select(PRODUCT_SELECT).single(), 'updateSiteProduct');
}
export async function createSiteRecipe(fields) {
  return unwrap(await supabase.from('recipes').insert({
    scope: 'site', owner_id: null, status: fields.status,
    name: fields.name, category_id: fields.categoryId, prep_time: fields.prepTime, servings: fields.servings,
    difficulty: fields.difficulty, image_url: fields.imageUrl || null, featured: !!fields.featured,
    extras: fields.extras || [], instructions: fields.instructions || [], tips: fields.tips || [],
  }).select(RECIPE_SELECT).single(), 'createSiteRecipe');
}
export async function updateSiteRecipe(id, patch) {
  return unwrap(await supabase.from('recipes').update(patch).eq('id', id).select(RECIPE_SELECT).single(), 'updateSiteRecipe');
}

// ---- Change requests: submission (requester side) ----
export async function checkRecipePublishDependencies(recipeId) {
  return unwrap(await supabase.rpc('check_recipe_publish_dependencies', { p_recipe_id: recipeId }), 'checkRecipePublishDependencies');
}
export async function submitCategoryRequest(sourceId, reason) {
  return unwrap(await supabase.rpc('submit_category_request', { p_source_id: sourceId, p_reason: reason || null }), 'submitCategoryRequest');
}
export async function submitProductRequest(sourceId, reason) {
  return unwrap(await supabase.rpc('submit_product_request', { p_source_id: sourceId, p_reason: reason || null }), 'submitProductRequest');
}
export async function submitRecipeRequest(sourceId, reason) {
  return unwrap(await supabase.rpc('submit_recipe_request', { p_source_id: sourceId, p_reason: reason || null }), 'submitRecipeRequest');
}
export async function resubmitCategoryRequest(requestId, message) {
  return unwrap(await supabase.rpc('resubmit_category_request', { p_request_id: requestId, p_message: message || null }), 'resubmitCategoryRequest');
}
export async function resubmitProductRequest(requestId, message) {
  return unwrap(await supabase.rpc('resubmit_product_request', { p_request_id: requestId, p_message: message || null }), 'resubmitProductRequest');
}
export async function resubmitRecipeRequest(requestId, message) {
  return unwrap(await supabase.rpc('resubmit_recipe_request', { p_request_id: requestId, p_message: message || null }), 'resubmitRecipeRequest');
}
export async function cancelChangeRequest(requestId) {
  return unwrap(await supabase.rpc('cancel_change_request', { p_request_id: requestId }), 'cancelChangeRequest');
}

// ---- Change requests: reading ("Meus Pedidos" / "Solicitações Recebidas") ----
const REQUEST_SELECT = 'id, request_code, requester_id, requester_display_name_snapshot, entity_type, action_type, source_id, source_code, target_id, target_code, base_version, current_revision, status, reason, admin_note, created_at, updated_at, submitted_at, reviewed_at, reviewed_by';
export async function fetchMyChangeRequests(userId) {
  return unwrap(await supabase.from('change_requests').select(REQUEST_SELECT).eq('requester_id', userId).order('created_at', { ascending: false }), 'fetchMyChangeRequests');
}
export async function fetchAllChangeRequests() {
  return unwrap(await supabase.from('change_requests').select(REQUEST_SELECT).order('created_at', { ascending: false }), 'fetchAllChangeRequests');
}
export async function fetchChangeRequestRevisions(requestId) {
  return unwrap(await supabase.from('change_request_revisions').select('id, revision_number, payload, message, submitted_by, created_at').eq('request_id', requestId).order('revision_number'), 'fetchChangeRequestRevisions');
}

// ---- Change requests: admin review ----
export async function returnChangeRequest(requestId, adminNote) {
  return unwrap(await supabase.rpc('return_change_request', { p_request_id: requestId, p_admin_note: adminNote }), 'returnChangeRequest');
}
export async function reviewChangeRequest(requestId, decision, adminNote, publishMode) {
  return unwrap(await supabase.rpc('review_change_request', {
    p_request_id: requestId, p_decision: decision, p_admin_note: adminNote || null, p_publish_mode: publishMode || 'published',
  }), 'reviewChangeRequest');
}
export async function findSimilarSiteItems(entityType, name) {
  return unwrap(await supabase.rpc('find_similar_site_items', { p_entity_type: entityType, p_name: name }), 'findSimilarSiteItems');
}
