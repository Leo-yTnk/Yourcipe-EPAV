import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(new URL('../../supabase/033_catalog_import_contract_v0100.sql', import.meta.url), 'utf8');
const regression = readFileSync(new URL('../../supabase/tests/013_catalog_import_contract_v0100.pg.sql', import.meta.url), 'utf8');

describe('V0.100 database import contract', () => {
  it('reads only the normalized English relation properties', () => {
    expect(migration).toContain("v_row->>'recipe'");
    expect(migration).toContain("v_row->>'product'");
    expect(migration).not.toContain("v_row->>'receita'");
    expect(migration).not.toContain("v_row->>'produto'");
  });

  it('rejects absent references explicitly, before not-found validation', () => {
    expect(migration.indexOf('recipe_reference_missing')).toBeLessThan(migration.indexOf('recipe_not_found'));
    expect(migration.indexOf('product_reference_missing')).toBeLessThan(migration.indexOf('product_not_found'));
  });

  it('has integration coverage for joint, invalid and atomic imports', () => {
    for (const marker of ['joint six-sheet import', 'recipe_not_found: Inexistente', 'product_not_found: Inexistente', 'recipe_reference_missing', 'product_reference_missing', 'no partial category mutation']) expect(regression).toContain(marker);
  });
});
