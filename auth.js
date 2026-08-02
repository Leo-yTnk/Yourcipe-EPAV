// Centralized Supabase Auth flows for the credential system. Never log
// credentials, passwords, sessions or captcha tokens from this module.
import { supabase } from './supabase-client.js';
import { normalizeCredential, credentialToInternalEmail } from './credential.js';

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
 */
export async function signUpAttempt(password, captchaToken, credential) {
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

/** Reads the caller's own role from public.profiles (RLS-restricted to the own row). */
export async function fetchProfileRole(userId) {
  if (!userId) return null;
  const { data, error } = await supabase.from('profiles').select('role').eq('id', userId).single();
  if (error || !data) return 'user';
  return data.role === 'admin' ? 'admin' : 'user';
}

export async function signOut() {
  await supabase.auth.signOut();
}
