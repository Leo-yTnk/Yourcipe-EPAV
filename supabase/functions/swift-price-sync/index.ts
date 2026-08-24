import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildSwiftFailureUpdate, buildSwiftSuccessUpdate, canonicalizeSwiftUrl, isFresh, isSuspiciousChange, parseSwiftProductPage } from '../_shared/swift-price-core.js';

const env = (key: string, fallback?: string) => Deno.env.get(key) || fallback;
const ZIP = (env('SWIFT_REFERENCE_ZIP_CODE') || '').replace(/\D/g, '');
const MAX_AGE = Number(env('SWIFT_PRICE_MAX_AGE_MINUTES', '30'));
const SYNC_INTERVAL = Number(env('SWIFT_PRICE_SYNC_INTERVAL_MINUTES', '30'));
const TIMEOUT = Number(env('SWIFT_PRICE_REQUEST_TIMEOUT_MS', '10000'));
const RETRIES = Number(env('SWIFT_PRICE_MAX_RETRIES', '3'));
const CONCURRENCY = Number(env('SWIFT_PRICE_SYNC_CONCURRENCY', '3'));
const WARNING_PERCENT = Number(env('SWIFT_PRICE_CHANGE_WARNING_PERCENT', '50'));
const REGION_COOKIE = env('SWIFT_REGION_COOKIE_NAME', 'postalCode');
// Browser calls to an Edge Function are preflighted because Supabase sends
// Authorization/apikey headers.  Without an OPTIONS response the SDK reports
// the rather opaque "Failed to send a request to the Edge Function" before
// this handler ever gets a chance to run.
const responseHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
  'content-type': 'application/json',
};
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const log = (event: string, fields = {}) => console.log(JSON.stringify({ provider: 'swift', event, ...fields }));

async function hashObservation(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2, '0')).join('');
}

async function fetchPage(url: string) {
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT);
    try {
      const response = await fetch(url, { redirect: 'manual', signal: controller.signal, headers: {
        accept: 'text/html,application/xhtml+xml', 'accept-language': 'pt-BR,pt;q=0.9',
        'user-agent': 'Yourcipe-EPAV-PriceMonitor/0.42 (+administracao EPAV)',
        cookie: `${REGION_COOKIE}=${ZIP}; zipcode=${ZIP}; postalCode=${ZIP}`,
        'x-postal-code': ZIP,
      }});
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) throw new Error('redirect_without_location');
        const redirected = canonicalizeSwiftUrl(new URL(location, url).toString());
        if (redirected !== url) throw new Error('unexpected_product_redirect');
      }
      if (response.ok) return await response.text();
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt === RETRIES) throw new Error(`swift_http_${response.status}`);
      const retryAfter = Number(response.headers.get('retry-after')) * 1000;
      await sleep(retryAfter || (250 * 2 ** attempt + Math.random() * 250));
    } catch (error) {
      if (attempt === RETRIES || String(error).includes('swift_http_4')) throw error;
      await sleep(250 * 2 ** attempt + Math.random() * 250);
    } finally { clearTimeout(timer); }
  }
  throw new Error('swift_unavailable');
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: responseHeaders });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405, headers: responseHeaders });
  if (!ZIP || ZIP.length !== 8) return new Response(JSON.stringify({ error: 'SWIFT_REFERENCE_ZIP_CODE must contain 8 digits' }), { status: 503, headers: responseHeaders });
  const supabase = createClient(env('SUPABASE_URL')!, env('SUPABASE_SERVICE_ROLE_KEY')!);
  const auth = req.headers.get('authorization') || '';
  const cronAuthorized = req.headers.get('x-cron-secret') === env('SWIFT_PRICE_CRON_SECRET');
  let adminAuthorized = false;
  if (auth.startsWith('Bearer ')) {
    const userClient = createClient(env('SUPABASE_URL')!, env('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
    const { data } = await userClient.rpc('is_admin'); adminAuthorized = data === true;
  }
  if (!cronAuthorized && !adminAuthorized) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: responseHeaders });
  let body: { productId?: string; staleOnly?: boolean } = {};
  try { body = await req.json(); } catch { /* cron may have no body */ }
  if (cronAuthorized && !body.productId) {
    const { data: lastRun } = await supabase.from('swift_price_sync_runs').select('started_at').not('finished_at', 'is', null).order('started_at', { ascending: false }).limit(1).maybeSingle();
    if (lastRun && Date.now() - Date.parse(lastRun.started_at) < SYNC_INTERVAL * 60_000)
      return new Response(JSON.stringify({ skipped: 'sync_interval_not_elapsed' }), { headers: responseHeaders });
  }
  let query = supabase.from('products').select('*').eq('scope', 'site').eq('active', true);
  if (body.productId) query = query.eq('id', body.productId);
  const { data: products, error } = await query;
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: responseHeaders });
  const started = Date.now();
  const metrics = { products_synced: 0, products_updated: 0, products_unchanged: 0, products_failed: 0, products_stale: 0 };
  const { data: run } = await supabase.from('swift_price_sync_runs').insert({}).select('id').single();

  async function refresh(product: Record<string, any>) {
    if (!product.swift_product_url) {
      await supabase.from('products').update({ price_status: 'MISSING_SOURCE', price_error: 'Página Swift não cadastrada' }).eq('id', product.id);
      metrics.products_failed++; return;
    }
    if (body.staleOnly && isFresh(product.price_last_success_at, MAX_AGE)) return;
    metrics.products_synced++;
    const checkedAt = new Date().toISOString();
    await supabase.from('products').update({ price_status: 'SYNCING', price_last_checked_at: checkedAt }).eq('id', product.id);
    try {
      const url = canonicalizeSwiftUrl(product.swift_product_url);
      let parsed = parseSwiftProductPage(await fetchPage(url), { expectedName: product.name, expectedSku: product.swift_sku, canonicalUrl: url });
      if (isSuspiciousChange(product.regular_price_cents, parsed.regularPriceCents, WARNING_PERCENT)) {
        await sleep(500 + Math.random() * 500);
        const confirmation = parseSwiftProductPage(await fetchPage(url), { expectedName: product.name, expectedSku: product.swift_sku, canonicalUrl: url });
        if (JSON.stringify(parsed) !== JSON.stringify(confirmation)) throw new Error('suspicious_price_not_confirmed');
        parsed = confirmation;
      }
      const sourceHash = await hashObservation({ ...parsed, zip: ZIP });
      parsed.canonicalUrl = url;
      const { changed, update } = buildSwiftSuccessUpdate(product, parsed, {
        checkedAt, region: env('SWIFT_REFERENCE_REGION') || null, zip: ZIP, sourceHash,
      });
      const { error: updateError } = await supabase.from('products').update(update).eq('id', product.id);
      if (updateError) throw updateError;
      await supabase.from('product_price_history').insert({ product_id: product.id, regular_price_cents: parsed.regularPriceCents,
        promo_price_cents: parsed.promoPriceCents, promo_min_quantity: parsed.promoMinQuantity, pricing_type: parsed.pricingType,
        price_unit: parsed.priceUnit, reference_zip_code: ZIP, region: update.price_region, source: 'SWIFT', source_hash: sourceHash });
      metrics[changed ? 'products_updated' : 'products_unchanged']++;
      log('product_synced', { product_id: product.id, changed, pricing_type: parsed.pricingType });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      const stale = !!product.price_last_success_at;
      await supabase.from('products').update(buildSwiftFailureUpdate(product, message, checkedAt)).eq('id', product.id);
      metrics.products_failed++; if (stale) metrics.products_stale++;
      log('product_failed', { product_id: product.id, error: message, last_success_at: product.price_last_success_at });
    }
  }
  const queue = [...(products || [])];
  await Promise.all(Array.from({ length: Math.max(1, Math.min(CONCURRENCY, 10)) }, async () => { while (queue.length) await refresh(queue.shift()!); }));
  const duration_ms = Date.now() - started;
  if (run) await supabase.from('swift_price_sync_runs').update({ ...metrics, duration_ms, finished_at: new Date().toISOString() }).eq('id', run.id);
  if (metrics.products_failed >= 3) log('provider_alert', { reason: 'consecutive_batch_failures', ...metrics });
  return new Response(JSON.stringify({ ...metrics, duration_ms }), { headers: responseHeaders });
 });
