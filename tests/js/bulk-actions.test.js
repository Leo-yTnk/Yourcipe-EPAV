import { describe, expect, it } from 'vitest';
import { parseBRLPrice, priceEditPolicy, summarizeBulkResults, toggleSelected } from '../../bulk-actions.js';

describe('bulk selection state', () => {
  it('selects one, selects several, and deselects without duplicates', () => {
    expect(toggleSelected([], 'a')).toEqual(['a']);
    expect(toggleSelected(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleSelected(['a', 'b'], 'a')).toEqual(['b']);
  });
  it('reports partial mutation outcomes', () => {
    expect(summarizeBulkResults([{}, { error: new Error('in use') }], 'categoria')).toMatchObject({ partial: true, ok: false });
  });
});

describe('spreadsheet price policy', () => {
  it.each([['12,34', 12.34], ['R$ 1.234,56', 1234.56], ['0', 0]])('accepts %s', (input, value) => expect(parseBRLPrice(input)).toEqual({ value }));
  it.each(['', '-1', 'abc', '1,999'])('rejects invalid price %s', input => expect(parseBRLPrice(input).error).toBeTruthy());
  it('prevents local edits to the Swift source of truth', () => {
    expect(priceEditPolicy({ swift_product_url: 'https://www.swift.com.br/a' }).editable).toBe(false);
    expect(priceEditPolicy({ price_source: 'SWIFT' }).editable).toBe(false);
    expect(priceEditPolicy({ price: 10 }).editable).toBe(true);
  });
});
