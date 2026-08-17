import { describe, expect, it } from 'vitest';
import { INPUT_LIMITS, parseNonNegativePrice, validateName, validateOptionalHttpUrl } from '../../input-validation.js';

describe('catalog input validation', () => {
  it('rejects blank and overlong names', () => {
    expect(validateName('   ')).toMatch(/Informe/);
    expect(validateName('a'.repeat(INPUT_LIMITS.name + 1))).toMatch(/máximo/);
    expect(validateName(' Produto ')).toBe('');
  });

  it('accepts only optional HTTP(S) image URLs', () => {
    expect(validateOptionalHttpUrl('')).toBe('');
    expect(validateOptionalHttpUrl('https://cdn.example/image.jpg')).toBe('');
    expect(validateOptionalHttpUrl('javascript:alert(1)')).toMatch(/HTTP/);
    expect(validateOptionalHttpUrl('data:image/svg+xml,<svg/>')).toMatch(/HTTP/);
  });

  it('does not silently coerce malformed prices to zero', () => {
    expect(parseNonNegativePrice('abc').error).toBeTruthy();
    expect(parseNonNegativePrice('-1').error).toBeTruthy();
    expect(parseNonNegativePrice('12,50')).toEqual({ value: 12.5 });
  });
});
