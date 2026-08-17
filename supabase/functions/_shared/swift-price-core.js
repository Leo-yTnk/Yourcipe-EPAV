// Pure Swift catalogue parsing/validation shared by the Edge Function and tests.
// Network and persistence deliberately live outside this module.
export const PRICING_TYPES = Object.freeze(['FIXED_PACKAGE', 'FIXED_UNIT', 'PER_KG', 'VARIABLE_WEIGHT']);
export const PRICE_STATUSES = Object.freeze(['CURRENT', 'STALE', 'SYNCING', 'ERROR', 'MISSING_SOURCE']);

const ALLOWED_HOSTS = new Set(['swift.com.br', 'www.swift.com.br']);
const BLOCKED_PATHS = /^\/(?:busca|search|categoria|categorias|colecao|collections?)(?:\/|$)/i;

export function canonicalizeSwiftUrl(input) {
  let url;
  try { url = new URL(String(input || '').trim()); } catch { throw new Error('invalid_swift_url'); }
  if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname.toLowerCase()) || BLOCKED_PATHS.test(url.pathname)) {
    throw new Error('invalid_swift_product_url');
  }
  const path = url.pathname.replace(/\/{2,}/g, '/').replace(/\/$/, '');
  if (!path || path === '/') throw new Error('invalid_swift_product_url');
  return `https://www.swift.com.br${path}`;
}

export function parseBRLCents(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value * 100) : null;
  const text = String(value ?? '').replace(/R\$|BRL/gi, '').trim();
  const match = text.match(/\d{1,3}(?:[.\s]\d{3})*(?:,\d{1,2})|\d+(?:[.,]\d{1,2})?/);
  if (!match) return null;
  let normalized = match[0].replace(/\s/g, '');
  if (normalized.includes(',')) normalized = normalized.replace(/\./g, '').replace(',', '.');
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.round(amount * 100) : null;
}

function pricingFrom(text) {
  const value = String(text || '').toLowerCase();
  if (/peso\s*vari[aá]vel|peso aproximado|valor final.*peso/.test(value)) return ['VARIABLE_WEIGHT', 'KG'];
  if (/(?:\/|por)\s*k(?:g|ilo)|quilograma/.test(value)) return ['PER_KG', 'KG'];
  if (/(?:\/|por)\s*(?:un|unidade)|cada unidade/.test(value)) return ['FIXED_UNIT', 'UN'];
  if (/caixa/.test(value)) return ['FIXED_PACKAGE', 'CAIXA'];
  if (/pacote|embalagem|bandeja|pote/.test(value)) return ['FIXED_PACKAGE', 'EMBALAGEM'];
  return [null, null];
}

function allJsonObjects(value, output = []) {
  if (!value || typeof value !== 'object') return output;
  output.push(value);
  for (const child of Array.isArray(value) ? value : Object.values(value)) allJsonObjects(child, output);
  return output;
}

function scripts(html, type) {
  const re = new RegExp(`<script[^>]*type=["']${type}["'][^>]*>([\\s\\S]*?)<\\/script>`, 'gi');
  return [...html.matchAll(re)].map(m => m[1]);
}

export function parseSwiftProductPage(html, { expectedName, expectedSku, canonicalUrl } = {}) {
  if (!html || html.length < 80) throw new Error('incomplete_product_page');
  const candidates = [];
  for (const raw of [...scripts(html, 'application/ld\\+json'), ...scripts(html, 'application/json')]) {
    try { candidates.push(...allJsonObjects(JSON.parse(raw))); } catch { /* malformed unrelated script */ }
  }
  const product = candidates.find(o => String(o['@type'] || o.type || '').toLowerCase() === 'product' && (o.offers || o.price));
  const pageText = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/\s+/g, ' ');
  const offer = product && (Array.isArray(product.offers) ? product.offers[0] : product.offers);
  const name = product?.name || html.match(/<h1[^>]*>([^<]+)/i)?.[1]?.trim();
  const sku = product?.sku || product?.productID || null;
  if (!name) throw new Error('product_identity_not_found');
  if (expectedSku && sku && String(expectedSku) !== String(sku)) throw new Error('product_sku_mismatch');
  if (expectedName) {
    const words = String(expectedName).toLowerCase().split(/\W+/).filter(w => w.length > 3);
    if (words.length && !words.some(w => String(name).toLowerCase().includes(w))) throw new Error('product_name_mismatch');
  }
  const currency = offer?.priceCurrency || product?.priceCurrency || (pageText.includes('R$') ? 'BRL' : null);
  if (currency !== 'BRL') throw new Error('invalid_currency');
  const contextual = `${offer?.priceSpecification?.unitText || ''} ${offer?.description || ''} ${product?.description || ''} ${pageText}`;
  let [pricingType, priceUnit] = pricingFrom(contextual);
  if (!pricingType) throw new Error('unrecognized_price_unit');
  let regular = parseBRLCents(offer?.highPrice ?? offer?.price ?? product?.price);
  const promoText = pageText.match(/(?:a partir de|comprando|leve)\s*(\d+)\s*(?:unidades?|itens?)?[^R]{0,80}R\$\s*([\d.,]+)/i);
  let promo = promoText ? parseBRLCents(promoText[2]) : null;
  let promoMinQuantity = promoText ? Number(promoText[1]) : null;
  const oldPrice = pageText.match(/(?:de|pre[cç]o regular|pre[cç]o normal)\s*:?[\s]*R\$\s*([\d.,]+)/i);
  if (oldPrice) regular = parseBRLCents(oldPrice[1]);
  if (!regular) {
    const visible = pageText.match(/R\$\s*([\d.,]+)\s*(?:\/|por)\s*(?:kg|quilo|unidade|un|embalagem|pacote|caixa|pote)/i);
    regular = visible && parseBRLCents(visible[1]);
  }
  if (!regular || regular < 50 || regular > 1_000_000) throw new Error('invalid_product_price');
  if (promo && (promo < 1 || promo >= regular)) { promo = null; promoMinQuantity = null; }
  return { name, swiftSku: sku ? String(sku) : null, swiftProductId: product?.productID ? String(product.productID) : null,
    canonicalUrl, regularPriceCents: regular, priceCents: regular, promoPriceCents: promo,
    promoMinQuantity, pricingType, priceUnit, currency: 'BRL' };
}

export function isFresh(lastSuccessAt, maxAgeMinutes, now = Date.now()) {
  const timestamp = Date.parse(lastSuccessAt || '');
  return Number.isFinite(timestamp) && now - timestamp <= Number(maxAgeMinutes) * 60_000;
}

export function effectivePriceCents(price, quantity = 1) {
  return price.promoPriceCents && price.promoMinQuantity && quantity >= price.promoMinQuantity
    ? price.promoPriceCents : price.regularPriceCents;
}

export function isSuspiciousChange(previous, next, warningPercent) {
  if (!previous || !next) return false;
  return Math.abs(next - previous) / previous * 100 > Number(warningPercent);
}
