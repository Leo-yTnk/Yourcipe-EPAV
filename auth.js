// Centralized Supabase Auth flows for the credential system. Never log
// credentials, passwords, sessions, access/refresh tokens or captcha tokens
// from this module.
import { supabase } from './supabase-client.js';
import { normalizeCredential, credentialToInternalEmail } from './credential.js';

export const MAX_SIGNUP_ATTEMPTS = 5;
export const AUTH_GENERIC_ERROR = 'Credencial ou senha incorreta.';

function isDuplicateIdentifier(data, error) {
  // Primary signal: with "Confirm email" OFF (required here, since
  // @credential.yourcipe.local can never receive a confirmation link),
  // Supabase rejects a signUp for an existing identifier with an error.
  if (error) {
    const code = String(error.code || '').toLowerCase();
    const msg = String(error.message || '').toLowerCase();
    if (code === 'user_already_exists') return true;
    return msg.includes('already registered') || msg.includes('already exists') || msg.includes('user already');
  }
  // Defensive fallback only: if "Confirm email" were ever re-enabled,
  // Supabase instead returns 200 with an identities-less user for an
  // existing email (anti-enumeration), with no error at all.
  return !!(data && data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0);
}

/**
 * Attempts to register exactly one credential. Every Turnstile token is
 * single-use, so callers must supply a fresh one per attempt and drive the
 * up-to-5-retries-on-collision loop themselves (see app.js), obtaining a new
 * captchaToken before each retry.
 */
export async function signUpAttempt(credential, password, captchaToken) {
  const email = credentialToInternalEmail(credential);
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { captchaToken, data: { credential } },
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
 * Reads the caller's own role from public.profiles (RLS-restricted to the
 * own row). This is the only source of truth for authorization — never
 * trust session.user.user_metadata for role decisions, since metadata is
 * client-suppliable at signUp time and is display-only.
 */
export async function fetchProfileRole(userId) {
  if (!userId) return null;
  const { data, error } = await supabase.from('profiles').select('role').eq('id', userId).single();
  if (error || !data) return 'user';
  return data.role === 'admin' ? 'admin' : 'user';
}

export async function signOut() {
  await supabase.auth.signOut();
}
