import { describe, it, expect } from 'vitest';
import { moveById } from '../../section-order.js';

describe('moveById', () => {
  const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  it('moves a held section to the drop target without mutating input', () => {
    const result = moveById(rows, 'a', 'c');
    expect(result.map(r => r.id)).toEqual(['b', 'c', 'a']);
    expect(rows.map(r => r.id)).toEqual(['a', 'b', 'c']);
  });
  it('supports moving upward', () => expect(moveById(rows, 'c', 'a').map(r => r.id)).toEqual(['c', 'a', 'b']));
  it('returns the same list for invalid or identical targets', () => {
    expect(moveById(rows, 'a', 'a')).toBe(rows);
    expect(moveById(rows, 'x', 'a')).toBe(rows);
  });
});
