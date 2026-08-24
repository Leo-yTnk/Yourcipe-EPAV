// Optional real-provider smoke test: SWIFT_SMOKE_URLS is a comma-separated
// allowlisted set of known product detail URLs. Run manually with Deno.
import { canonicalizeSwiftUrl, parseSwiftProductPage } from '../_shared/swift-price-core.js';
for (const raw of (Deno.env.get('SWIFT_SMOKE_URLS') || '').split(',').filter(Boolean)) {
  const url = canonicalizeSwiftUrl(raw);
  const zip = (Deno.env.get('SWIFT_REFERENCE_ZIP_CODE') || '').replace(/\D/g, '');
  if (zip.length !== 8) throw new Error('SWIFT_REFERENCE_ZIP_CODE must contain eight digits');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(Deno.env.get('SWIFT_PRICE_REQUEST_TIMEOUT_MS') || 10000));
  const response = await fetch(url, { redirect: 'manual', signal: controller.signal, headers: {
    accept: 'text/html,application/xhtml+xml', 'accept-language': 'pt-BR,pt;q=0.9',
    'user-agent': 'Yourcipe-EPAV-PriceMonitor/0.42 (+administracao EPAV)',
    cookie: `postalCode=${zip}; zipcode=${zip}`, 'x-postal-code': zip,
  }});
  clearTimeout(timer);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  console.log(url, parseSwiftProductPage(await response.text(), { canonicalUrl: url }));
}
