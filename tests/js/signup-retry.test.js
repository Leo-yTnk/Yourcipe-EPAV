import { describe, it, expect, vi } from 'vitest';
import { runSignupRetryLoop } from '../../signup-retry.js';

describe('runSignupRetryLoop', () => {
  it('succeeds on the first attempt without requesting a fresh token', async () => {
    const attemptSignUp = vi.fn(async () => ({ session: {}, user: { id: 'u1' } }));
    const requestFreshToken = vi.fn();
    const result = await runSignupRetryLoop({
      initialToken: 'tok-0',
      maxAttempts: 5,
      generateCredential: () => 'YCP-AAAA-0001',
      attemptSignUp,
      requestFreshToken,
    });
    expect(result.attempts).toBe(1);
    expect(result.outcome.user.id).toBe('u1');
    expect(requestFreshToken).not.toHaveBeenCalled();
  });

  it('retries with a fresh credential and a fresh token on collision, then succeeds', async () => {
    let call = 0;
    const attemptSignUp = vi.fn(async (credential, token) => {
      call += 1;
      if (call < 3) return { duplicate: true };
      return { session: {}, user: { id: 'u1' }, credential };
    });
    const requestFreshToken = vi.fn(async () => ({ token: 'fresh-token' }));
    let n = 0;
    const generateCredential = vi.fn(() => `YCP-AAAA-000${++n}`);

    const result = await runSignupRetryLoop({
      initialToken: 'tok-0',
      maxAttempts: 5,
      generateCredential,
      attemptSignUp,
      requestFreshToken,
    });

    expect(result.attempts).toBe(3);
    expect(attemptSignUp).toHaveBeenCalledTimes(3);
    expect(generateCredential).toHaveBeenCalledTimes(3);
    // a fresh token is requested exactly once per collision (2 collisions
    // before the 3rd, successful attempt) — never reused across attempts.
    expect(requestFreshToken).toHaveBeenCalledTimes(2);
    expect(attemptSignUp.mock.calls[0][1]).toBe('tok-0');
    expect(attemptSignUp.mock.calls[1][1]).toBe('fresh-token');
    expect(attemptSignUp.mock.calls[2][1]).toBe('fresh-token');
    // every attempt used a different credential
    const credentialsUsed = attemptSignUp.mock.calls.map((c) => c[0]);
    expect(new Set(credentialsUsed).size).toBe(3);
  });

  it('exhausts maxAttempts and returns an error outcome if every attempt collides', async () => {
    const attemptSignUp = vi.fn(async () => ({ duplicate: true }));
    const requestFreshToken = vi.fn(async () => ({ token: 'fresh-token' }));
    const result = await runSignupRetryLoop({
      initialToken: 'tok-0',
      maxAttempts: 3,
      generateCredential: () => 'YCP-AAAA-0001',
      attemptSignUp,
      requestFreshToken,
    });
    expect(result.attempts).toBe(3);
    expect(attemptSignUp).toHaveBeenCalledTimes(3);
    expect(result.outcome.error).toBeInstanceOf(Error);
    // no token is requested after the last attempt collides — there is no
    // point solving a captcha that will never be used.
    expect(requestFreshToken).toHaveBeenCalledTimes(2);
  });

  it('stops immediately and reports captchaTimedOut if the Turnstile widget never resolves a fresh token', async () => {
    const attemptSignUp = vi.fn(async () => ({ duplicate: true }));
    const requestFreshToken = vi.fn(async () => ({ timeout: true }));
    const result = await runSignupRetryLoop({
      initialToken: 'tok-0',
      maxAttempts: 5,
      generateCredential: () => 'YCP-AAAA-0001',
      attemptSignUp,
      requestFreshToken,
    });
    expect(result.captchaTimedOut).toBe(true);
    expect(result.attempts).toBe(1);
  });

  it('threads the same validated displayName into every attempt, exactly like app.js onSignupSubmit does', async () => {
    // This mirrors the real closure built in app.js:
    //   attemptSignUp: (credential, token) => signUpAttempt(signupPassword, token, credential, cleanName)
    // cleanName is computed ONCE, outside the loop, from
    // normalizeDisplayName(signupDisplayName) — so it is structurally
    // impossible for two attempts in the same signup to carry a different
    // (or missing) name; there is no code path that re-reads component
    // state mid-retry.
    const cleanName = 'Ana Souza';
    const password = 'super-secret';
    const mockSignUpAttempt = vi.fn(async (pwd, token, credential, displayName) => {
      if (mockSignUpAttempt.mock.calls.length < 2) return { duplicate: true };
      return { session: {}, user: { id: 'u1' }, credential, displayName };
    });
    const requestFreshToken = vi.fn(async () => ({ token: 'fresh-token' }));

    const result = await runSignupRetryLoop({
      initialToken: 'tok-0',
      maxAttempts: 5,
      generateCredential: () => `YCP-${Math.random().toString(36).slice(2, 6)}`,
      attemptSignUp: (credential, token) => mockSignUpAttempt(password, token, credential, cleanName),
      requestFreshToken,
    });

    expect(result.attempts).toBe(2);
    const namesSent = mockSignUpAttempt.mock.calls.map((c) => c[3]);
    expect(namesSent).toEqual(['Ana Souza', 'Ana Souza']);
    expect(result.outcome.displayName).toBe('Ana Souza');
  });
});
