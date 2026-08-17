import { describe, expect, it } from 'vitest';
import { buildSwiftFailureUpdate, buildSwiftSuccessUpdate, canonicalizeSwiftUrl, effectivePriceCents, isFresh, isSuspiciousChange, parseBRLCents, parseSwiftProductPage } from '../../swift-price-core.js';

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


describe('Swift persistence policy', () => {
  const parsed = { canonicalUrl: 'https://www.swift.com.br/produto', swiftProductId: 'p1', swiftSku: 's1', regularPriceCents: 1890, promoPriceCents: 1690, promoMinQuantity: 2, pricingType: 'FIXED_PACKAGE', priceUnit: 'EMBALAGEM' };
  it('fills confirmed cents and CURRENT only after a successful provider observation', () => {
    const { update } = buildSwiftSuccessUpdate({}, parsed, { checkedAt: '2026-08-17T12:00:00Z', zip: '01001000', sourceHash: 'hash' });
    expect(update).toMatchObject({ regular_price_cents: 1890, promo_price_cents: 1690, price_status: 'CURRENT', price_source: 'SWIFT', price_last_success_at: '2026-08-17T12:00:00Z' });
  });
  it('keeps an unconfirmed product without success metadata and marks ERROR', () => {
    expect(buildSwiftFailureUpdate({}, 'offline', '2026-08-17T12:00:00Z')).toEqual({ price_status: 'ERROR', price_error: 'offline', price_last_checked_at: '2026-08-17T12:00:00Z' });
  });
  it('preserves the previous confirmation on failure and marks it STALE', () => {
    const result = buildSwiftFailureUpdate({ price_last_success_at: '2026-08-17T11:00:00Z', regular_price_cents: 1990 }, 'offline', '2026-08-17T12:00:00Z');
    expect(result).toEqual({ price_status: 'STALE', price_error: 'offline', price_last_checked_at: '2026-08-17T12:00:00Z' });
    expect(result).not.toHaveProperty('regular_price_cents');
    expect(result).not.toHaveProperty('price_last_success_at');
  });
});
