// Centralized helpers for the YCP-XXXX-XXXX credential system.
// The credential never encodes personal data — it is 8 random characters
// drawn from crypto.getRandomValues(), formatted with a fixed prefix.

const CREDENTIAL_PREFIX = 'YCP';
const CREDENTIAL_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, L, O, 0, 1
const CREDENTIAL_RAW_LENGTH = 8;
const CREDENTIAL_EMAIL_DOMAIN = 'credential.yourcipe.local';

const CHARSET_RE = new RegExp(`^[${CREDENTIAL_CHARSET}]{${CREDENTIAL_RAW_LENGTH}}$`);

function randomRawChars() {
  const bytes = new Uint8Array(CREDENTIAL_RAW_LENGTH);
  crypto.getRandomValues(bytes);
  let out = '';
  // CREDENTIAL_CHARSET has 32 entries and 256 % 32 === 0, so byte % 32 is unbiased.
  for (let i = 0; i < CREDENTIAL_RAW_LENGTH; i++) out += CREDENTIAL_CHARSET[bytes[i] % CREDENTIAL_CHARSET.length];
  return out;
}

/** Generates a fresh credential, e.g. "YCP-7K9M-W2Q8". */
export function generateCredential() {
  return formatCredential(randomRawChars());
}

/** Formats 8 raw characters into "YCP-XXXX-XXXX". Returns null if invalid. */
export function formatCredential(rawChars) {
  const clean = String(rawChars || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!CHARSET_RE.test(clean)) return null;
  return `${CREDENTIAL_PREFIX}-${clean.slice(0, 4)}-${clean.slice(4, 8)}`;
}

/**
 * Accepts "YCP-7K9M-W2Q8", "ycp-7k9m-w2q8", "7K9MW2Q8" or "7k9m w2q8"
 * and returns the canonical "YCP-7K9M-W2Q8" form, or null if invalid.
 */
export function normalizeCredential(input) {
  if (!input) return null;
  let clean = String(input).trim().toUpperCase().replace(/[\s-]/g, '');
  // Only strip the prefix when it's actually a prefix (full length with it),
  // since the charset itself can legally start with the letters Y, C or P.
  if (clean.startsWith(CREDENTIAL_PREFIX) && clean.length === CREDENTIAL_PREFIX.length + CREDENTIAL_RAW_LENGTH) {
    clean = clean.slice(CREDENTIAL_PREFIX.length);
  }
  return formatCredential(clean);
}

/** Converts a credential to the internal, non-contactable Supabase Auth identifier. */
export function credentialToInternalEmail(credential) {
  const normalized = normalizeCredential(credential);
  if (!normalized) return null;
  return `${normalized.toLowerCase()}@${CREDENTIAL_EMAIL_DOMAIN}`;
}

/** Recovers the canonical credential from an internal technical email. */
export function internalEmailToCredential(email) {
  const local = String(email || '').split('@')[0];
  return normalizeCredential(local);
}
