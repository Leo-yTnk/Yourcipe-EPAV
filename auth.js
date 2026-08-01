// Centralized Supabase Auth flows for the credential system. Never log
// credentials, passwords, sessions or captcha tokens from this module.
import { supabase } from './supabase-client.js';
import { generateCredential, normalizeCredential, credentialToInternalEmail } from './credential.js';

const MAX_SIGNUP_ATTEMPTS = 5;

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

/** Generates a fresh credential, registers it with Supabase Auth, and retries on collision. */
export async function signUpWithCredential(password, captchaToken) {
  for (let attempt = 0; attempt < MAX_SIGNUP_ATTEMPTS; attempt++) {
    const credential = generateCredential();
    const email = credentialToInternalEmail(credential);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { captchaToken, data: { credential } },
    });
    if (isDuplicateIdentifier(data, error)) continue;
    if (error) return { error };
    return { credential, session: data.session || null, user: data.user || null };
  }
  return { error: new Error('signup-attempts-exhausted') };
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
