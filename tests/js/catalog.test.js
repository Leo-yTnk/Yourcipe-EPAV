import { describe, it, expect, vi } from 'vitest';

// catalog.js imports supabase-client.js, which imports the real
// @supabase/supabase-js package from esm.sh — unreachable in this (and any
// offline) test environment. Stubbed here so the pure, non-network logic in
// catalog.js (computeForeignReferences) can be unit-tested in isolation,
// same reasoning as supabase/STAGING.md's documented esm.sh limitation.
vi.mock('../../supabase-client.js', () => ({ supabase: {} }));

const { computeForeignReferences } = await import('../../catalog.js');

const OWNER_ID = '10000000-0000-0000-0000-000000000001';
const OTHER_OWNER_ID = '10000000-0000-0000-0000-000000000002';

function detailFixture(overrides = {}) {
  return {
    recipe: { category: { id: 'cat-primary', name: 'Categoria Própria', scope: 'personal', owner_id: OWNER_ID } },
    sections: [],
    ingredients: [],
    ...overrides,
  };
}

describe('computeForeignReferences', () => {
  it('returns no references when everything is already own or site-scoped', () => {
    const detail = detailFixture({
      ingredients: [{ product: { id: 'p1', name: 'Sal', scope: 'personal', owner_id: OWNER_ID } }, { product: { id: 'p2', name: 'Arroz', scope: 'site', owner_id: null } }],
    });
    expect(computeForeignReferences(detail, OWNER_ID)).toEqual([]);
  });

  it('flags the recipe\'s own category as foreign when owned by someone else', () => {
    const detail = detailFixture({ recipe: { category: { id: 'cat-x', name: 'Categoria Alheia', scope: 'personal', owner_id: OTHER_OWNER_ID } } });
    const refs = computeForeignReferences(detail, OWNER_ID);
    expect(refs).toEqual([{ refType: 'category', refId: 'cat-x', label: 'Categoria Alheia', purpose: 'primary' }]);
  });

  it('flags a foreign section tag', () => {
    const detail = detailFixture({
      sections: [{ category: { id: 'sec-x', name: 'Seção Alheia', scope: 'personal', owner_id: OTHER_OWNER_ID } }],
    });
    const refs = computeForeignReferences(detail, OWNER_ID);
    expect(refs).toEqual([{ refType: 'category', refId: 'sec-x', label: 'Seção Alheia', purpose: 'section' }]);
  });

  it('flags a foreign ingredient product', () => {
    const detail = detailFixture({
      ingredients: [{ product: { id: 'p-x', name: 'Produto Alheio', scope: 'personal', owner_id: OTHER_OWNER_ID } }],
    });
    const refs = computeForeignReferences(detail, OWNER_ID);
    expect(refs).toEqual([{ refType: 'product', refId: 'p-x', label: 'Produto Alheio', purpose: 'ingredient' }]);
  });

  it('never flags a site-scoped reference, regardless of owner_id', () => {
    const detail = detailFixture({
      recipe: { category: { id: 'cat-site', name: 'Categoria Pública', scope: 'site', owner_id: null } },
      ingredients: [{ product: { id: 'p-site', name: 'Produto Público', scope: 'site', owner_id: null } }],
    });
    expect(computeForeignReferences(detail, OWNER_ID)).toEqual([]);
  });

  it('deduplicates the same reference used in multiple places (e.g. two ingredients from the same foreign product)', () => {
    const detail = detailFixture({
      ingredients: [
        { product: { id: 'p-x', name: 'Produto Alheio', scope: 'personal', owner_id: OTHER_OWNER_ID } },
        { product: { id: 'p-x', name: 'Produto Alheio', scope: 'personal', owner_id: OTHER_OWNER_ID } },
      ],
    });
    const refs = computeForeignReferences(detail, OWNER_ID);
    expect(refs).toHaveLength(1);
  });

  it('collects every kind of foreign reference at once', () => {
    const detail = {
      recipe: { category: { id: 'cat-x', name: 'Categoria Alheia', scope: 'personal', owner_id: OTHER_OWNER_ID } },
      sections: [{ category: { id: 'sec-x', name: 'Seção Alheia', scope: 'personal', owner_id: OTHER_OWNER_ID } }],
      ingredients: [{ product: { id: 'p-x', name: 'Produto Alheio', scope: 'personal', owner_id: OTHER_OWNER_ID } }],
    };
    const refs = computeForeignReferences(detail, OWNER_ID);
    expect(refs.map(r => r.purpose).sort()).toEqual(['ingredient', 'primary', 'section']);
  });
});
