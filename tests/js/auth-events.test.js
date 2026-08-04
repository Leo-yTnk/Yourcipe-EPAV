import { describe, it, expect } from 'vitest';
import { shouldApplyAuthEvent } from '../../auth-events.js';

const session = id => ({ user: { id } });
describe('late Supabase auth events', () => {
  it('TOKEN_REFRESHED for the current identity is UI-neutral', () => {
    expect(shouldApplyAuthEvent('TOKEN_REFRESHED', session('a'), 'a')).toBe(false);
  });
  it('duplicate SIGNED_IN and INITIAL_SESSION do not reinitialize state', () => {
    expect(shouldApplyAuthEvent('SIGNED_IN', session('a'), 'a')).toBe(false);
    expect(shouldApplyAuthEvent('INITIAL_SESSION', session('a'), 'a')).toBe(false);
  });
  it('identity changes and sign-out are applied', () => {
    expect(shouldApplyAuthEvent('SIGNED_IN', session('b'), 'a')).toBe(true);
    expect(shouldApplyAuthEvent('SIGNED_OUT', null, 'a')).toBe(true);
  });
});
