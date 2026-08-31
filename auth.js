// Centralized Supabase Auth flows for the credential system. Never log
// credentials, passwords, sessions or captcha tokens from this module.
import { supabase } from './supabase-client.js?v=20260831-3';
import { normalizeCredential, credentialToInternalEmail } from './credential.js?v=20260831-3';

export const MAX_SIGNUP_ATTEMPTS = 5;
export const AUTH_GENERIC_ERROR = 'Credencial ou senha incorreta.';

function isDuplicateIdentifier(data, error) {
  if (error) {
    const msg = (error.message || '').toLowerCase();
    return msg.includes('already registered') || msg.includes('already exists') || msg.includes('user already');
  }
  // When "Confirm email" is on, Supabase returns 200 with an identities-less
  // user for an email that already exists, instead of an error (anti-enumeration).
  return !!(data && data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0);
}

/**
 * Performs exactly one signUp attempt for the given credential — never loops.
 * Every Turnstile token is single-use, so the caller (app.js, where the
 * Turnstile widget lives) owns the collision-retry loop and must obtain a
 * fresh captchaToken before each retry; see signup-retry.js.
 *
 * `displayName` must already be normalized/validated by the caller (see
 * display-name.js) before this is called — this function does not
 * re-validate it. It is sent once per attempt via options.data, same as
 * `credential` already was; since app.js binds the same displayName into
 * every attempt of the retry loop (see onSignupSubmit), a collision retry
 * can never send a different, or a missing, name on a later attempt. The
 * database trigger (public.handle_new_user, see
 * supabase/002_profiles_display_name_phase1.sql) is the actual source of
 * truth for validation and never reads `role` from this payload — only
 * `credential` and `display_name` are ever sent here.
 */
export async function signUpAttempt(password, captchaToken, credential, displayName) {
  const email = credentialToInternalEmail(credential);
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { captchaToken, data: { credential, display_name: displayName } },
  });
  if (isDuplicateIdentifier(data, error)) return { duplicate: true };
  if (error) return { error };
  return { credential, session: data.session || null, user: data.user || null };
}

/** Normalizes the credential, converts it to the internal email, and signs in. */
export async function signInWithCredential(rawCredential, password, captchaToken) {
  const credential = normalizeCredential(rawCredential);
  if (!credential) return { error: new Error('invalid-credential-format') };
  const email = credentialToInternalEmail(credential);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password, options: { captchaToken } });
  if (error) return { error };
  return { session: data.session, user: data.user };
}

/**
 * Reads the caller's own role + display_name from public.profiles
 * (RLS-restricted to the own row — see supabase/schema.sql
 * "profiles_select_own"). displayName is null for a legacy account that
 * predates this column (see supabase/002_profiles_display_name_phase1.sql)
 * or for the brief nullable-migration window — callers must treat a null
 * displayName as "this account needs to complete its profile", never as an
 * error.
 */
export async function fetchProfile(userId) {
  if (!userId) return { role: null, displayName: null };
  const { data, error } = await supabase.from('profiles').select('role, display_name, catalog_card_layout').eq('id', userId).single();
  if (error || !data) return { role: 'user', displayName: null };
  return { role: data.role === 'admin' ? 'admin' : 'user', displayName: data.display_name || null, catalogCardLayout: data.catalog_card_layout === 'grid' ? 'grid' : 'carousel' };
}

export async function updateCatalogCardLayout(userId, layout) {
  if (!userId || !['carousel', 'grid'].includes(layout)) return { error: new Error('invalid-layout') };
  const { data, error } = await supabase.from('profiles').update({ catalog_card_layout: layout }).eq('id', userId).select('catalog_card_layout').single();
  return error ? { error } : { layout: data.catalog_card_layout };
}

/**
 * Self-service rename (point 6 of the plan): updates only display_name on
 * the caller's own row. RLS ("profiles_update_own") restricts this to
 * auth.uid() = id, and the trg_validate_display_name_on_update trigger
 * re-normalizes/re-validates server-side and cannot touch `role` (that is
 * still governed exclusively by trg_prevent_role_escalation) — `newName`
 * does not need to be pre-normalized by the caller for correctness, only
 * for a responsive UI, since the server is the actual authority.
 */
export async function updateDisplayName(userId, newName) {
  if (!userId) return { error: new Error('not-authenticated') };
  const { data, error } = await supabase
    .from('profiles')
    .update({ display_name: newName })
    .eq('id', userId)
    .select('display_name')
    .single();
  if (error) return { error };
  return { displayName: data.display_name };
}

export async function signOut() {
  await supabase.auth.signOut();
}
