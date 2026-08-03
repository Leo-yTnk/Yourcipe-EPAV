import { describe, it, expect } from 'vitest';
import { shouldShowWelcome, markWelcomeSeen } from '../../welcome.js';

function fakeStorage(initial = {}) {
  const store = { ...initial };
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = v; },
    _store: store,
  };
}

function throwingStorage() {
  return {
    getItem: () => { throw new Error('localStorage disabled'); },
    setItem: () => { throw new Error('localStorage disabled'); },
  };
}

describe('shouldShowWelcome', () => {
  it('shows on a first-ever visit (nothing stored yet)', () => {
    expect(shouldShowWelcome(fakeStorage(), 'yourcipe_welcome_seen_v1')).toBe(true);
  });

  it('does not show again once marked seen', () => {
    const storage = fakeStorage({ yourcipe_welcome_seen_v1: 'true' });
    expect(shouldShowWelcome(storage, 'yourcipe_welcome_seen_v1')).toBe(false);
  });

  it('fails safe (shows) when localStorage throws instead of breaking', () => {
    expect(() => shouldShowWelcome(throwingStorage(), 'yourcipe_welcome_seen_v1')).not.toThrow();
    expect(shouldShowWelcome(throwingStorage(), 'yourcipe_welcome_seen_v1')).toBe(true);
  });

  it('treats any stored value other than the literal string "true" as unseen', () => {
    const storage = fakeStorage({ yourcipe_welcome_seen_v1: 'false' });
    expect(shouldShowWelcome(storage, 'yourcipe_welcome_seen_v1')).toBe(true);
  });
});

describe('markWelcomeSeen', () => {
  it('persists the seen flag so a later shouldShowWelcome call returns false', () => {
    const storage = fakeStorage();
    markWelcomeSeen(storage, 'yourcipe_welcome_seen_v1');
    expect(shouldShowWelcome(storage, 'yourcipe_welcome_seen_v1')).toBe(false);
  });

  it('does not throw and does not crash the caller when localStorage is unavailable', () => {
    expect(() => markWelcomeSeen(throwingStorage(), 'yourcipe_welcome_seen_v1')).not.toThrow();
  });

  it('only ever sets the flag for this account-independent key, never a per-account one', () => {
    const storage = fakeStorage();
    markWelcomeSeen(storage, 'yourcipe_welcome_seen_v1');
    expect(Object.keys(storage._store)).toEqual(['yourcipe_welcome_seen_v1']);
  });
});
