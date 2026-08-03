import { describe, it, expect, vi } from 'vitest';

// catalog.js imports supabase-client.js, which imports the real
// @supabase/supabase-js package from esm.sh — unreachable in this (and any
// offline) test environment. Stubbed here so the pure, non-network logic in
// catalog.js (computeForeignReferences) can be unit-tested in isolation,
// same reasoning as supabase/STAGING.md's documented esm.sh limitation.
vi.mock('../../supabase-client.js', () => ({ supabase: {} }));

const catalogModule = await import('../../catalog.js');
const { computeForeignReferences } = catalogModule;

// Regression guard for the PGRST201 ambiguous-embed bug: `recipes` and
// `categories` have two relationship paths PostgREST can see (the direct
// FK `recipes.category_id -> categories.id`, and the implicit many-to-many
// path via the `recipe_categories` bridge table), so any embed of
// `categories(...)` (or `products(...)`, defensively) from any of these
// exported select-string constants MUST always carry an explicit
// `!<fk_constraint_name>` hint — a bare `categories(` or `products(` here
// would silently reintroduce the ambiguity error. This scans the actual
// exported string literals (not a re-implementation of the fix), so it
// fails the moment a future edit adds an un-hinted embed back in.
const SELECT_CONSTANT_NAMES = [
  'PRODUCT_WITH_CATEGORY_SELECT',
  'RECIPE_WITH_CATEGORY_SELECT',
  'RECIPE_DETAIL_WITH_CATEGORY_SELECT',
  'RECIPE_INGREDIENT_DETAIL_SELECT',
  'RECIPE_SECTION_DETAIL_SELECT',
  'RECIPE_SECTION_SLUG_SELECT',
];
// Matches `categories(` / `products(` (optionally preceded by an alias like
// `category:`) that is NOT immediately preceded by `!` (an FK hint).
const BARE_EMBED_RE = /(?<!!)\b(categories|products)\(/;

describe('shared select constants always specify an explicit FK hint', () => {
  it('exports every expected select constant as a non-empty string', () => {
    SELECT_CONSTANT_NAMES.forEach((name) => {
      expect(typeof catalogModule[name]).toBe('string');
      expect(catalogModule[name].length).toBeGreaterThan(0);
    });
  });

  SELECT_CONSTANT_NAMES.forEach((name) => {
    it(`${name} has no bare (un-hinted) categories(/products( embed`, () => {
      const value = catalogModule[name];
      expect(BARE_EMBED_RE.test(value)).toBe(false);
    });
  });

  it('every categories(/products( embed across all constants carries a "!" FK hint', () => {
    const offenders = SELECT_CONSTANT_NAMES
      .map((name) => ({ name, value: catalogModule[name] }))
      .filter(({ value }) => BARE_EMBED_RE.test(value));
    expect(offenders).toEqual([]);
  });

  // fetchPublicRecipes (the exact call the bug report's console error pointed
  // at) uses RECIPE_WITH_CATEGORY_SELECT — this pins it to the real,
  // pg_constraint-verified FK name (see supabase/STAGING.md section 2) so a
  // future edit can't silently swap in a different/wrong constraint name
  // (or drop the hint back to a bare `categories(`) without failing CI.
  it('RECIPE_WITH_CATEGORY_SELECT names the real recipes_category_id_fkey constraint', () => {
    expect(catalogModule.RECIPE_WITH_CATEGORY_SELECT).toContain('recipes_category_id_fkey');
  });
});

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
