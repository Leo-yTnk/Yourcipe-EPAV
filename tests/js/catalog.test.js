import { describe, it, expect, vi } from 'vitest';

// catalog.js imports supabase-client.js, which imports the real
// @supabase/supabase-js package from esm.sh — unreachable in this (and any
// offline) test environment. Stubbed here so the pure, non-network logic in
// catalog.js (computeForeignReferences) can be unit-tested in isolation,
// same reasoning as supabase/STAGING.md's documented esm.sh limitation.
//
// catalog.js imports supabase-client.js with a `?v=...` cache-busting query
// string (see the comment block at the top of index.html), so vi.mock's
// specifier must match that exact string — including the query — or the
// mock silently misses and the real module (which reaches out to esm.sh)
// gets loaded instead. Keep this in sync whenever the version is bumped.
vi.mock('../../supabase-client.js?v=20260803-2', () => ({ supabase: {} }));

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

  // RECIPE_DETAIL_WITH_CATEGORY_SELECT is the same recipes->categories embed,
  // just with a wider column set (used by fetchRecipeDetail) — must name the
  // exact same real FK constraint, never a different/typo'd one.
  it('RECIPE_DETAIL_WITH_CATEGORY_SELECT names the real recipes_category_id_fkey constraint', () => {
    expect(catalogModule.RECIPE_DETAIL_WITH_CATEGORY_SELECT).toContain('recipes_category_id_fkey');
  });

  // Regression guard against the specific failure mode a pure "is there any
  // bare embed anywhere in the string" check (BARE_EMBED_RE.test above) can
  // miss: a select string that embeds the SAME table more than once (e.g. a
  // doubly-nested embed reaching `categories` both directly and through a
  // nested `product`/`recipe_ingredients` path) could have its FIRST
  // occurrence hinted and a LATER occurrence left bare, and a naive
  // "contains at least one hinted occurrence" assertion would still pass.
  // PostgREST requires a hint at EVERY embed occurrence of an ambiguous
  // pair, not just the first, so this enumerates every single
  // `categories(`/`products(` occurrence in each constant (via a global
  // regex, not .test()) and asserts EACH ONE individually carries its own
  // "!" hint immediately before it.
  const EMBED_OCCURRENCE_RE = /\b(categories|products)(!\w+)?\(/g;
  SELECT_CONSTANT_NAMES.forEach((name) => {
    it(`${name}: every categories(/products( occurrence (not just the first) is hinted`, () => {
      const value = catalogModule[name];
      const occurrences = [...value.matchAll(EMBED_OCCURRENCE_RE)];
      // Sanity check: every one of these constants is expected to actually
      // embed at least one of these tables — if this ever becomes 0 for a
      // given constant, the test below would vacuously pass without
      // checking anything, which would be worse than not having the test.
      expect(occurrences.length).toBeGreaterThan(0);
      occurrences.forEach(([fullMatch, table, hint]) => {
        expect(hint, `un-hinted "${table}(" occurrence in ${name} (matched "${fullMatch}")`).toBeTruthy();
      });
    });
  });

  // Hedge for a *future* embed of `recipe_ingredients(...)` (none of the six
  // exported constants embeds it today — recipe_ingredients is only ever
  // the FROM table, never nested inside another select here) — if one is
  // ever added, it must carry one of `recipe_ingredients`'s two real FK
  // hints (verified against pg_constraint — see supabase/STAGING.md),
  // whichever side is being embedded from, not a bare or wrong-named hint.
  it('any select string that embeds recipe_ingredients( names one of its two real FK constraints', () => {
    SELECT_CONSTANT_NAMES.forEach((name) => {
      const value = catalogModule[name];
      if (!/\brecipe_ingredients\(/.test(value)) return;
      const namesRealFk = value.includes('recipe_ingredients_recipe_id_fkey') || value.includes('recipe_ingredients_product_id_fkey');
      expect(namesRealFk, `${name} embeds recipe_ingredients( but names neither real FK constraint`).toBe(true);
    });
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

// ---------------------------------------------------------------------
// fetchAllPages: the pagination LOOP LOGIC used by fetchAdminCategories/
// Products/Recipes so the admin catalog view never silently truncates once
// a table grows past PostgREST's default row cap. Tested here against a
// stubbed query-builder function (no live database needed) — exactly the
// approach the task calls for.
// ---------------------------------------------------------------------
const { fetchAllPages } = catalogModule;

function pagedQuery(pages) {
  // Returns a `(from, to) => Promise<{data, error}>` stand-in for a real
  // supabase query builder's `.range(from, to)` call, backed by a plain
  // array of pre-baked pages (each page is itself an array of "rows").
  let call = 0;
  return async (from, to) => {
    const page = pages[call] || [];
    call += 1;
    return { data: page, error: null };
  };
}

describe('fetchAllPages', () => {
  it('returns every row from a single short page without looping again', async () => {
    const query = pagedQuery([[{ id: 1 }, { id: 2 }]]);
    const result = await fetchAllPages(query, 'test', 5);
    expect(result.error).toBeUndefined();
    expect(result.data).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('keeps paging while a page comes back exactly full-sized, and stops on the first short page', async () => {
    const pageSize = 2;
    const pages = [
      [{ id: 1 }, { id: 2 }], // full page — keep going
      [{ id: 3 }, { id: 4 }], // full page — keep going
      [{ id: 5 }],            // short page — stop here
    ];
    const query = pagedQuery(pages);
    const result = await fetchAllPages(query, 'test', pageSize);
    expect(result.data).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }]);
  });

  it('never loses rows across many full pages before the final short page (no truncation as data grows)', async () => {
    const pageSize = 3;
    // 7 full-size-multiple rows across 3 full pages + 1 short final page.
    const allRows = Array.from({ length: 10 }, (_, i) => ({ id: i + 1 }));
    const pages = [];
    for (let i = 0; i < allRows.length; i += pageSize) pages.push(allRows.slice(i, i + pageSize));
    const query = pagedQuery(pages);
    const result = await fetchAllPages(query, 'test', pageSize);
    expect(result.data).toHaveLength(10);
    expect(result.data).toEqual(allRows);
  });

  it('stops immediately and returns an empty array for a table with zero rows', async () => {
    const query = pagedQuery([[]]);
    const result = await fetchAllPages(query, 'test', 5);
    expect(result.data).toEqual([]);
  });

  it('passes the correct (from, to) range to the query builder on each call', async () => {
    const pageSize = 2;
    const seenRanges = [];
    const query = async (from, to) => {
      seenRanges.push([from, to]);
      if (seenRanges.length === 1) return { data: [{ id: 1 }, { id: 2 }], error: null };
      return { data: [{ id: 3 }], error: null };
    };
    await fetchAllPages(query, 'test', pageSize);
    expect(seenRanges).toEqual([[0, 1], [2, 3]]);
  });

  it('surfaces an error from any page immediately, without swallowing it or returning partial data as success', async () => {
    const err = { code: 'PGRST000', message: 'boom', details: null, hint: null };
    const query = async () => ({ data: null, error: err });
    const result = await fetchAllPages(query, 'fetchAdminRecipes', 5);
    expect(result.data).toBeUndefined();
    expect(result.error).toEqual({ code: 'PGRST000', message: 'boom', details: null, hint: null, operation: 'fetchAdminRecipes' });
  });
});
