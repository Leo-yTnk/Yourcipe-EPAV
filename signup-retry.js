// Pure signup collision-retry loop, with no DOM/Preact/Supabase dependency,
// so it can be unit-tested directly. Turnstile tokens are single-use, so a
// fresh one must be obtained before every retry — this loop never reuses one.
//
// - attemptSignUp(credential, token) performs exactly one supabase.auth.signUp().
// - requestFreshToken() resets the Turnstile widget and resolves with either
//   { token } once solved, or { timeout: true } if it never resolves in time.
// - Stops immediately on any non-collision outcome (success or hard error).
export async function runSignupRetryLoop({ initialToken, maxAttempts, generateCredential, attemptSignUp, requestFreshToken }) {
  let token = initialToken;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const credential = generateCredential();
    const result = await attemptSignUp(credential, token);
    if (!result.duplicate) return { outcome: result, attempts: attempt };
    if (attempt === maxAttempts) break;
    const next = await requestFreshToken();
    if (next.timeout) return { captchaTimedOut: true, attempts: attempt };
    token = next.token;
  }
  return { outcome: { error: new Error('signup-attempts-exhausted') }, attempts: maxAttempts };
}
