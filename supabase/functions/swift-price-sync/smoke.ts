// Optional real-provider smoke test: SWIFT_SMOKE_URLS is a comma-separated
// allowlisted set of known product detail URLs. Run manually with Deno.
import { canonicalizeSwiftUrl, parseSwiftProductPage } from '../_shared/swift-price-core.js';
for (const raw of (Deno.env.get('SWIFT_SMOKE_URLS') || '').split(',').filter(Boolean)) {
  const url = canonicalizeSwiftUrl(raw);
  const response = await fetch(url, { redirect: 'manual' });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  console.log(url, parseSwiftProductPage(await response.text(), { canonicalUrl: url }));
}
