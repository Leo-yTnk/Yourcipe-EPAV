// Data access for "Modo de Criação": personal recipes/products/categories,
// recipe sharing, personal copies, and safe authorship lookup. Every
// function here talks to Supabase directly — RLS (see
// supabase/004_catalog_schema.sql and supabase/005_creation_mode_sharing.sql)
// is what actually enforces ownership and read-only shared access; this
// module never re-implements those checks client-side, it just shapes the
// calls and normalizes the responses. owner_id is only ever read back from
// Supabase, never invented or forwarded by the caller of these functions —
// the one exception (createRecipe/createProduct/createCategory taking an
// ownerId argument) always receives it from the caller's own
// session.user.id, never from anywhere else.
import { supabase } from './supabase-client.js';

const RECIPE_SELECT = 'id, recipe_code, owner_id, scope, status, name, category_id, prep_time, servings, difficulty, image_url, featured, extras, instructions, tips, version, created_at, updated_at';
const PRODUCT_SELECT = 'id, product_code, owner_id, scope, name, category_id, unit, price, active, version, created_at, updated_at';
const CATEGORY_SELECT = 'id, category_code, owner_id, scope, type, name, slug, sort_order, active, version';

function unwrap({ data, error }) {
  if (error) return { error };
  return { data };
}

// ---- Categories ----
export async function fetchMyCategories(userId, type) {
  let q = supabase.from('categories').select(CATEGORY_SELECT).eq('owner_id', userId).eq('scope', 'personal').order('name');
  if (type) q = q.eq('type', type);
  return unwrap(await q);
}
export async function createCategory(ownerId, { type, name }) {
  return unwrap(await supabase.from('categories').insert({ owner_id: ownerId, scope: 'personal', type, name }).select(CATEGORY_SELECT).single());
}
export async function updateCategoryName(id, name) {
  return unwrap(await supabase.from('categories').update({ name }).eq('id', id).select(CATEGORY_SELECT).single());
}
export async function deleteCategory(id) {
  return unwrap(await supabase.from('categories').delete().eq('id', id));
}

// ---- Products ----
export async function fetchMyProducts(userId) {
  return unwrap(await supabase.from('products').select(`${PRODUCT_SELECT}, category:categories(id, name)`).eq('owner_id', userId).eq('scope', 'personal').order('name'));
}
export async function createProduct(ownerId, { name, categoryId, unit, price }) {
  return unwrap(await supabase.from('products').insert({ owner_id: ownerId, scope: 'personal', name, category_id: categoryId, unit, price }).select(PRODUCT_SELECT).single());
}
export async function updateProduct(id, patch) {
  return unwrap(await supabase.from('products').update(patch).eq('id', id).select(PRODUCT_SELECT).single());
}
export async function deleteProduct(id) {
  return unwrap(await supabase.from('products').delete().eq('id', id));
}

// ---- Recipes: list + full detail ----
export async function fetchMyRecipes(userId) {
  return unwrap(await supabase.from('recipes').select(`${RECIPE_SELECT}, category:categories(id, name)`).eq('owner_id', userId).eq('scope', 'personal').order('name'));
}

// Recipes the caller has active read-only access to via a share (their
// "biblioteca compartilhada"), newest grant first.
export async function fetchSharedLibrary(userId) {
  return unwrap(await supabase
    .from('recipe_access_grants')
    .select(`granted_at, recipe:recipes(${RECIPE_SELECT}, category:categories(id, name))`)
    .eq('grantee_id', userId)
    .is('revoked_at', null)
    .order('granted_at', { ascending: false }));
}

export async function fetchRecipeDetail(recipeId) {
  const { data: recipe, error: recipeError } = await supabase.from('recipes').select(`${RECIPE_SELECT}, category:categories(id, name, type, owner_id, scope, active)`).eq('id', recipeId).single();
  if (recipeError) return { error: recipeError };
  const [{ data: ingredients, error: ingError }, { data: sections, error: secError }] = await Promise.all([
    supabase.from('recipe_ingredients').select(`id, product_id, quantity, sort_order, product:products(${PRODUCT_SELECT}, category:categories(id, name))`).eq('recipe_id', recipeId).order('sort_order'),
    supabase.from('recipe_categories').select('category_id, sort_order, category:categories(id, name, type, owner_id, scope, active)').eq('recipe_id', recipeId).order('sort_order'),
  ]);
  if (ingError) return { error: ingError };
  if (secError) return { error: secError };
  return { data: { recipe, ingredients: ingredients || [], sections: sections || [] } };
}

export async function createRecipe(ownerId, fields) {
  return unwrap(await supabase.from('recipes').insert({
    owner_id: ownerId, scope: 'personal', status: 'private',
    name: fields.name, category_id: fields.categoryId, prep_time: fields.prepTime, servings: fields.servings,
    difficulty: fields.difficulty, image_url: fields.imageUrl || null,
    extras: fields.extras || [], instructions: fields.instructions || [], tips: fields.tips || [],
  }).select(RECIPE_SELECT).single());
}
export async function updateRecipe(id, patch) {
  return unwrap(await supabase.from('recipes').update(patch).eq('id', id).select(RECIPE_SELECT).single());
}
export async function deleteRecipe(id) {
  return unwrap(await supabase.from('recipes').delete().eq('id', id));
}

// Full replace is simplest/safest for a form-driven editor: clear then
// re-insert, inside the two calls below (not a single DB transaction, but
// each call is RLS-scoped to rows this owner already controls, so a partial
// failure can only ever leave the caller's own recipe in a recoverable
// state — never touches another user's data).
export async function replaceRecipeIngredients(recipeId, rows) {
  const del = await supabase.from('recipe_ingredients').delete().eq('recipe_id', recipeId);
  if (del.error) return { error: del.error };
  if (!rows.length) return { data: [] };
  return unwrap(await supabase.from('recipe_ingredients').insert(
    rows.map((row, i) => ({ recipe_id: recipeId, product_id: row.productId, quantity: row.quantity, sort_order: i }))
  ).select());
}
export async function replaceRecipeCategories(recipeId, categoryIds) {
  const del = await supabase.from('recipe_categories').delete().eq('recipe_id', recipeId);
  if (del.error) return { error: del.error };
  if (!categoryIds.length) return { data: [] };
  return unwrap(await supabase.from('recipe_categories').insert(
    categoryIds.map((categoryId, i) => ({ recipe_id: recipeId, category_id: categoryId, sort_order: i }))
  ).select());
}

// ---- Sharing (owner side) ----
export async function activateSharing(recipeId) {
  return unwrap(await supabase.rpc('activate_recipe_sharing', { p_recipe_id: recipeId }));
}
export async function regenerateShareCode(recipeId) {
  return unwrap(await supabase.rpc('regenerate_recipe_share_code', { p_recipe_id: recipeId }));
}
export async function deactivateSharing(recipeId) {
  return unwrap(await supabase.rpc('deactivate_recipe_sharing', { p_recipe_id: recipeId }));
}
export async function revokeAccess(recipeId, granteeId) {
  return unwrap(await supabase.rpc('revoke_recipe_access', { p_recipe_id: recipeId, p_grantee_id: granteeId || null }));
}
export async function fetchShareStatus(recipeId) {
  const { data, error } = await supabase.from('recipe_shares').select('share_code, active').eq('recipe_id', recipeId).maybeSingle();
  if (error) return { error };
  return { data };
}
export async function fetchActiveGrantCount(recipeId) {
  const { count, error } = await supabase.from('recipe_access_grants').select('id', { count: 'exact', head: true }).eq('recipe_id', recipeId).is('revoked_at', null);
  if (error) return { error };
  return { data: count || 0 };
}

// ---- Redemption (grantee side) ----
const SHARE_CODE_GENERIC_ERROR = 'Código inválido. Verifique e tente novamente.';
export async function redeemShareCode(rawCode) {
  const { data, error } = await supabase.rpc('redeem_recipe_share', { p_share_code: String(rawCode || '').trim() });
  if (error) {
    const msg = (error.message || '').toLowerCase();
    if (msg.includes('cannot_add_own_recipe')) return { error: { friendly: 'Esta receita já é sua.' } };
    return { error: { friendly: SHARE_CODE_GENERIC_ERROR } };
  }
  return { data };
}

// ---- Authorship ----
export async function getRecipeAuthorName(recipeId) {
  return unwrap(await supabase.rpc('get_recipe_author_name', { p_recipe_id: recipeId }));
}

// ---- Personal copy ----
export async function createRecipeCopy(recipeId, resolutions) {
  const { data, error } = await supabase.rpc('create_recipe_copy', { p_recipe_id: recipeId, p_resolutions: resolutions || [] });
  if (error) return { error };
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
