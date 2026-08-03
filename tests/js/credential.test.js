import { describe, it, expect } from 'vitest';
import { generateCredential, normalizeCredential, credentialToInternalEmail, internalEmailToCredential } from '../../credential.js';

describe('credential.js (regression coverage — point 2 of the plan)', () => {
  it('generateCredential always produces a normalizable YCP-XXXX-XXXX credential', () => {
    for (let i = 0; i < 50; i++) {
      const cred = generateCredential();
      expect(cred).toMatch(/^YCP-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
      expect(normalizeCredential(cred)).toBe(cred);
    }
  });

  it('round-trips credential -> internal email -> credential', () => {
    const cred = generateCredential();
    const email = credentialToInternalEmail(cred);
    expect(email).toMatch(/@credential\.yourcipe\.local$/);
    expect(internalEmailToCredential(email)).toBe(cred);
  });

  it('normalizes lowercase/spaced/unprefixed input to the canonical form', () => {
    const cred = generateCredential();
    const raw = cred.toLowerCase().replace(/-/g, ' ');
    expect(normalizeCredential(raw)).toBe(cred);
  });
});
