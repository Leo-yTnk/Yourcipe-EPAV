import { describe, it, expect } from 'vitest';
import { normalizeDisplayName, DISPLAY_NAME_MIN, DISPLAY_NAME_MAX } from '../../display-name.js';

describe('normalizeDisplayName', () => {
  it('trims leading/trailing whitespace', () => {
    expect(normalizeDisplayName('  Marco Tanaka  ')).toBe('Marco Tanaka');
  });

  it('collapses duplicated internal whitespace', () => {
    expect(normalizeDisplayName('Marco    Tanaka')).toBe('Marco Tanaka');
  });

  it('collapses tabs/newlines into single spaces too', () => {
    expect(normalizeDisplayName('Marco\t\tTanaka\n')).toBe('Marco Tanaka');
  });

  it('rejects an empty name', () => {
    expect(normalizeDisplayName('')).toBeNull();
  });

  it('rejects a name that is only whitespace', () => {
    expect(normalizeDisplayName('   ')).toBeNull();
  });

  it('rejects null/undefined', () => {
    expect(normalizeDisplayName(null)).toBeNull();
    expect(normalizeDisplayName(undefined)).toBeNull();
  });

  it(`rejects a name shorter than ${DISPLAY_NAME_MIN} characters`, () => {
    expect(normalizeDisplayName('A')).toBeNull();
  });

  it(`accepts a name exactly ${DISPLAY_NAME_MIN} characters`, () => {
    expect(normalizeDisplayName('Al')).toBe('Al');
  });

  it(`accepts a name exactly ${DISPLAY_NAME_MAX} characters`, () => {
    const name = 'a'.repeat(DISPLAY_NAME_MAX);
    expect(normalizeDisplayName(name)).toBe(name);
  });

  it(`rejects a name longer than ${DISPLAY_NAME_MAX} characters`, () => {
    expect(normalizeDisplayName('a'.repeat(DISPLAY_NAME_MAX + 1))).toBeNull();
  });

  it('rejects a name that only becomes too short after trimming/collapsing', () => {
    // "A    " trims/collapses to "A" (1 char) -> invalid, even though the
    // raw input length before normalization was >= 2.
    expect(normalizeDisplayName('A    ')).toBeNull();
  });
});
