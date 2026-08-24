import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildSwiftSuccessUpdate, canonicalizeSwiftUrl, isFresh, isSuspiciousChange, parseSwiftProductPage } from '../_shared/swift-price-core.js';

const env = (key: string, fallback?: string) => Deno.env.get(key) || fallback;
const ZIP = (env('SWIFT_REFERENCE_ZIP_CODE') || '').replace(/\D/g, '');
const MAX_AGE = Number(env('SWIFT_PRICE_MAX_AGE_MINUTES', '30'));
const SYNC_INTERVAL = Number(env('SWIFT_PRICE_SYNC_INTERVAL_MINUTES', '30'));
const TIMEOUT = Number(env('SWIFT_PRICE_REQUEST_TIMEOUT_MS', '10000'));
const RETRIES = Number(env('SWIFT_PRICE_MAX_RETRIES', '3'));
const CONCURRENCY = Number(env('SWIFT_PRICE_SYNC_CONCURRENCY', '3'));
const WARNING_PERCENT = Number(env('SWIFT_PRICE_CHANGE_WARNING_PERCENT', '50'));
const REGION_COOKIE = env('SWIFT_REGION_COOKIE_NAME', 'postalCode');
const ALERT_WEBHOOK = env('SWIFT_PRICE_ALERT_WEBHOOK_URL');
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
const json = (payload: Record<string, unknown>, status = 200) => new Response(JSON.stringify(payload), { status, headers: responseHeaders });

function configurationError() {
  const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
  const missing = required.filter(key => !env(key));
  if (!ZIP || ZIP.length !== 8) missing.push('SWIFT_REFERENCE_ZIP_CODE');
  const numeric = { SWIFT_PRICE_MAX_AGE_MINUTES: MAX_AGE, SWIFT_PRICE_SYNC_INTERVAL_MINUTES: SYNC_INTERVAL,
    SWIFT_PRICE_REQUEST_TIMEOUT_MS: TIMEOUT, SWIFT_PRICE_MAX_RETRIES: RETRIES,
    SWIFT_PRICE_SYNC_CONCURRENCY: CONCURRENCY, SWIFT_PRICE_CHANGE_WARNING_PERCENT: WARNING_PERCENT };
  const invalid = Object.entries(numeric).filter(([, value]) => !Number.isFinite(value) || value < 0).map(([key]) => key);
  return { missing: [...new Set(missing)], invalid };
}

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
  if (req.method !== 'POST') return json({ error: 'method_not_allowed', code: 'method_not_allowed' }, 405);
  const config = configurationError();
  if (config.missing.length || config.invalid.length) {
    log('configuration_error', config);
    return json({ error: 'service_misconfigured', code: 'service_misconfigured',
      message: 'Required Edge Function configuration is missing or invalid', ...config }, 503);
  }
  const supabase = createClient(env('SUPABASE_URL')!, env('SUPABASE_SERVICE_ROLE_KEY')!);
  const auth = req.headers.get('authorization') || '';
  const cronSecret = env('SWIFT_PRICE_CRON_SECRET');
  const cronHeader = req.headers.get('x-cron-secret');
  const cronAuthorized = !!cronSecret && !!cronHeader && cronHeader === cronSecret;
  let adminAuthorized = false;
  let authenticated = false;
  if (auth.startsWith('Bearer ')) {
    const userClient = createClient(env('SUPABASE_URL')!, env('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
    const { data: userData } = await userClient.auth.getUser();
    authenticated = !!userData?.user;
    if (authenticated) {
      const { data, error: adminError } = await userClient.rpc('is_admin');
      if (adminError) {
        log('admin_check_failed', { code: adminError.code });
        return json({ error: 'admin_check_failed', code: 'sync_internal_error' }, 500);
      }
      adminAuthorized = data === true;
    }
  }
  if (!cronAuthorized && !authenticated) return json({ error: 'unauthorized', code: 'unauthorized' }, 401);
  if (!cronAuthorized && !adminAuthorized) return json({ error: 'forbidden', code: 'forbidden' }, 403);
  let body: { productId?: string; staleOnly?: boolean; requestId?: string } = {};
  try { body = await req.json(); } catch { /* cron may have no body */ }
  if (cronAuthorized && !body.productId) {
    const { data: lastRun, error: intervalError } = await supabase.from('swift_price_sync_runs').select('started_at').not('finished_at', 'is', null).order('started_at', { ascending: false }).limit(1).maybeSingle();
    if (intervalError) return json({ error: 'interval_check_failed', code: 'sync_internal_error' }, 500);
    if (lastRun && Date.now() - Date.parse(lastRun.started_at) < SYNC_INTERVAL * 60_000)
      return new Response(JSON.stringify({ skipped: 'sync_interval_not_elapsed' }), { headers: responseHeaders });
  }
  const requestKey = body.requestId ? `${body.productId || 'batch'}:${body.requestId}` : null;
  const { data: begun, error: beginError } = await supabase.rpc('begin_swift_price_sync', { p_request_key: requestKey });
  if (beginError) return json({ error: 'sync_lock_failed', code: 'sync_internal_error' }, 500);
  const run = begun?.[0];
  if (!run) return json({ error: 'sync_already_running', code: 'sync_already_running' }, 409);
  let query = supabase.from('products').select('*').eq('scope', 'site').eq('active', true);
  if (body.productId) query = query.eq('id', body.productId);
  const { data: products, error } = await query;
  if (error) {
    await supabase.rpc('finish_swift_price_sync', { p_run_id: run.id, p_metrics: {}, p_errors: { query: error.code } });
    return json({ error: 'product_query_failed', code: 'sync_internal_error', run_id: run.id, correlation_id: run.correlation_id }, 500);
  }
  if (body.productId && !products?.length) {
    await supabase.rpc('finish_swift_price_sync', { p_run_id: run.id, p_metrics: {}, p_errors: { product: 'not_found' } });
    return json({ error: 'product_not_found', code: 'product_not_found', run_id: run.id, correlation_id: run.correlation_id }, 404);
  }
  const started = Date.now();
  const metrics = { products_synced: 0, products_updated: 0, products_unchanged: 0, products_failed: 0, products_stale: 0 };
  const failures: Array<{ product_id: string; code: string }> = [];

  async function refresh(product: Record<string, any>) {
    if (!product.swift_product_url) {
      const { error: missingError } = await supabase.rpc('mark_swift_price_failure', { p_product_id: product.id, p_message: 'Página Swift não cadastrada', p_checked_at: new Date().toISOString(), p_missing: true });
      failures.push({ product_id: product.id, code: missingError ? `database_missing_source_failed:${missingError.code}` : 'missing_source' });
      metrics.products_failed++; return;
    }
    if (body.staleOnly && isFresh(product.price_last_success_at, MAX_AGE)) return;
    metrics.products_synced++;
    const checkedAt = new Date().toISOString();
    const { error: syncingError } = await supabase.from('products').update({ price_status: 'SYNCING', price_last_checked_at: checkedAt }).eq('id', product.id);
    if (syncingError) {
      failures.push({ product_id: product.id, code: `database_syncing_failed:${syncingError.code}` });
      metrics.products_failed++; return;
    }
    try {
      const url = canonicalizeSwiftUrl(product.swift_product_url);
      let parsed = parseSwiftProductPage(await fetchPage(url), { expectedName: product.name, expectedSku: product.swift_sku, expectedProductId: product.swift_product_id, canonicalUrl: url });
      if (isSuspiciousChange(product.regular_price_cents, parsed.regularPriceCents, WARNING_PERCENT)) {
        await sleep(500 + Math.random() * 500);
        const confirmation = parseSwiftProductPage(await fetchPage(url), { expectedName: product.name, expectedSku: product.swift_sku, expectedProductId: product.swift_product_id, canonicalUrl: url });
        if (JSON.stringify(parsed) !== JSON.stringify(confirmation)) throw new Error('suspicious_price_not_confirmed');
        parsed = confirmation;
      }
      const sourceHash = await hashObservation({ ...parsed, zip: ZIP });
      parsed.canonicalUrl = url;
      const { update } = buildSwiftSuccessUpdate(product, parsed, {
        checkedAt, region: env('SWIFT_REFERENCE_REGION') || null, zip: ZIP, sourceHash,
      });
      const observation = { ...update, checked_at: checkedAt, reference_zip_code: ZIP };
      const { data: changed, error: observationError } = await supabase.rpc('apply_swift_price_observation', { p_product_id: product.id, p_observation: observation });
      if (observationError) throw new Error(`atomic_observation_failed:${observationError.code}`);
      metrics[changed ? 'products_updated' : 'products_unchanged']++;
      log('product_synced', { product_id: product.id, changed, pricing_type: parsed.pricingType });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      failures.push({ product_id: product.id, code: message });
      const stale = !!product.price_last_success_at;
      const { error: failureError } = await supabase.rpc('mark_swift_price_failure', { p_product_id: product.id, p_message: message, p_checked_at: checkedAt, p_missing: false });
      if (failureError) log('failure_persistence_failed', { product_id: product.id, code: failureError.code });
      metrics.products_failed++; if (stale) metrics.products_stale++;
      log('product_failed', { product_id: product.id, error: message, last_success_at: product.price_last_success_at });
    }
  }
  const queue = [...(products || [])];
  await Promise.all(Array.from({ length: Math.max(1, Math.min(CONCURRENCY, 10)) }, async () => { while (queue.length) await refresh(queue.shift()!); }));
  const duration_ms = Date.now() - started;
  const { error: finishError } = await supabase.rpc('finish_swift_price_sync', { p_run_id: run.id, p_metrics: { ...metrics, duration_ms }, p_errors: failures });
  if (finishError) return json({ error: 'run_finalize_failed', code: 'sync_internal_error', run_id: run.id, correlation_id: run.correlation_id }, 500);
  if (metrics.products_failed >= 3) {
    log('provider_alert', { reason: 'batch_failure_threshold', run_id: run.id, correlation_id: run.correlation_id, ...metrics });
    if (ALERT_WEBHOOK) {
      try {
        const alert = await fetch(ALERT_WEBHOOK, { method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ provider: 'swift', reason: 'batch_failure_threshold', run_id: run.id, correlation_id: run.correlation_id, ...metrics }) });
        if (!alert.ok) log('alert_delivery_failed', { run_id: run.id, status: alert.status });
      } catch (cause) { log('alert_delivery_failed', { run_id: run.id, error: String(cause) }); }
    }
  }
  if (body.productId && metrics.products_failed) {
    const failureCode = failures[0]?.code || '';
    const code = /price_not_found|invalid_price/.test(failureCode) ? 'price_not_found'
      : /invalid|mismatch|not_found|redirect|swift_http_4/.test(failureCode) ? 'invalid_swift_page' : 'swift_unavailable';
    return json({ ...metrics, failures, duration_ms, error: 'product_sync_failed', code, run_id: run.id, correlation_id: run.correlation_id }, 502);
  }
  const payload = { ...metrics, failures, duration_ms, run_id: run.id, correlation_id: run.correlation_id,
    partial: metrics.products_failed > 0 };
  return json(payload, metrics.products_failed > 0 ? 207 : 200);
 });
