import { describe, expect, it } from 'vitest';
import { canonicalizeSwiftUrl, effectivePriceCents, isFresh, isSuspiciousChange, parseBRLCents, parseSwiftProductPage } from '../../swift-price-core.js';

const page = ({ name = 'Filé de Peito de Frango Swift', price = '18.90', unit = '/ Embalagem', extra = '', sku = '123' } = {}) => `<!doctype html><html><head><script type="application/ld+json">${JSON.stringify({ '@type': 'Product', name, sku, offers: { price, priceCurrency: 'BRL', description: unit } })}</script></head><body><h1>${name}</h1><p>R$ ${String(price).replace('.', ',')} ${unit}</p>${extra}</body></html>`;

describe('Swift price parser', () => {
  it.each([
    ['/ Embalagem', 'FIXED_PACKAGE', 'EMBALAGEM'], ['/ unidade', 'FIXED_UNIT', 'UN'],
    ['/ Kg', 'PER_KG', 'KG'], ['Peso variável - valor final conforme peso', 'VARIABLE_WEIGHT', 'KG'],
  ])('classifies %s', (unit, type, priceUnit) => expect(parseSwiftProductPage(page({ unit }))).toMatchObject({ pricingType: type, priceUnit }));
  it('keeps regular and conditional promotional prices separate', () => expect(parseSwiftProductPage(page({ extra: '<p>A partir de 2 unidades R$ 17,90 cada</p>' }))).toMatchObject({ regularPriceCents: 1890, promoPriceCents: 1790, promoMinQuantity: 2 }));
  it('handles BRL formats and no promotion', () => { expect(parseBRLCents('R$ 1.234,56')).toBe(123456); expect(parseSwiftProductPage(page()).promoPriceCents).toBeNull(); });
  it.each(['', '<html>bad</html>', '<html>'.padEnd(100, 'x') + '</html>'] )('rejects incomplete/missing price pages', html => expect(() => parseSwiftProductPage(html)).toThrow());
  it('rejects the wrong product', () => expect(() => parseSwiftProductPage(page(), { expectedName: 'Costela bovina' })).toThrow('product_name_mismatch'));
});

describe('Swift safety and freshness', () => {
  it('canonicalizes detail URLs and removes tracking', () => expect(canonicalizeSwiftUrl('https://swift.com.br/file-de-frango/?utm_source=x')).toBe('https://www.swift.com.br/file-de-frango'));
  it.each(['http://www.swift.com.br/p/a', 'https://evil.test/p/a', 'https://www.swift.com.br/busca?q=a'])('blocks SSRF/non-detail URL %s', url => expect(() => canonicalizeSwiftUrl(url)).toThrow());
  it('distinguishes fresh and expired confirmation', () => { expect(isFresh('2026-01-01T00:00:00Z', 30, Date.parse('2026-01-01T00:20:00Z'))).toBe(true); expect(isFresh('2026-01-01T00:00:00Z', 30, Date.parse('2026-01-01T00:31:00Z'))).toBe(false); });
  it('applies promotions only at minimum quantity', () => { const p = { regularPriceCents: 1890, promoPriceCents: 1790, promoMinQuantity: 2 }; expect(effectivePriceCents(p, 1)).toBe(1890); expect(effectivePriceCents(p, 2)).toBe(1790); });
  it('flags abnormal changes', () => expect(isSuspiciousChange(4990, 499, 50)).toBe(true));
});
