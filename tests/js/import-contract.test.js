import { describe, expect, it } from 'vitest';
import { parseCatalogSectionLinkRow } from '../../import-contract.js';

const normalizeText = value => String(value || '').trim().toLowerCase();
const normalizeKey = value => normalizeText(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '');
const get = (row, names) => {
  const normalized = Object.fromEntries(Object.entries(row).map(([key, value]) => [normalizeKey(key), value]));
  return names.map(name => normalized[normalizeKey(name)]).find(value => value !== undefined) ?? '';
};

describe('normalized spreadsheet section-link contract', () => {
  it('translates the Portuguese receita header to the RPC recipe property', () => {
    const result = parseCatalogSectionLinkRow({ pagina: 'home', secao: 'Destaques', receita: 'Picanha Assada', ordem: 1 }, 'receita', { get, normalizeText }, 2);
    expect(result).toEqual({ page: 'home', section: 'Destaques', recipe: 'Picanha Assada', sort_order: 1, source_line: 2 });
    expect(result).not.toHaveProperty('receita');
  });

  it('translates the Portuguese produto header to the RPC product property', () => {
    const result = parseCatalogSectionLinkRow({ pagina: 'products', secao: 'Churrasco', produto: 'Picanha Swift', ordem: 1 }, 'produto', { get, normalizeText }, 2);
    expect(result).toEqual({ page: 'products', section: 'Churrasco', product: 'Picanha Swift', sort_order: 1, source_line: 2 });
    expect(result).not.toHaveProperty('produto');
  });
});
