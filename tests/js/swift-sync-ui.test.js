import { describe, expect, it } from 'vitest';
import { buildSwiftSyncReport, normalizeSwiftSyncError } from '../../swift-sync-ui.js';

function httpError(status, payload) {
  const original = new Error(`Edge Function returned a non-2xx status code (${status})`);
  original.context = new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
  return original;
}

describe('Swift sync diagnostics', () => {
  it.each([
    [404, { error: 'not_found' }, 'function_not_found'],
    [401, { code: 'unauthorized' }, 'unauthorized'],
    [403, { code: 'forbidden' }, 'forbidden'],
    [503, { code: 'service_misconfigured', missing: ['SWIFT_REFERENCE_ZIP_CODE'] }, 'service_misconfigured'],
    [502, { code: 'swift_unavailable' }, 'swift_unavailable'],
    [502, { code: 'invalid_swift_page' }, 'invalid_swift_page'],
    [502, { code: 'price_not_found' }, 'price_not_found'],
  ])('maps HTTP %s/%s without discarding its response', async (status, payload, code) => {
    const original = httpError(status, payload);
    const result = await normalizeSwiftSyncError(original);
    expect(result).toMatchObject({ status, code });
    expect(result.technical.original).toBe(original);
    expect(result.technical.providerCode).toBe(payload.code || payload.error);
  });

  it('classifies transport errors and retains their exact technical message', async () => {
    const result = await normalizeSwiftSyncError(new TypeError('fetch failed'));
    expect(result).toMatchObject({ code: 'network_error', retryable: true });
    expect(result.technical.message).toBe('fetch failed');
  });
  it('distinguishes a handler product 404 from a missing deployed function', async () => {
    await expect(normalizeSwiftSyncError(httpError(404, { code: 'product_not_found', correlation_id: 'trace-1' })))
      .resolves.toMatchObject({ code: 'product_not_found', correlationId: 'trace-1' });
  });
});

describe('Swift sync step report', () => {
  it('details successful and failed stages in a partial batch', () => {
    const data = { run_id: 7, correlation_id: 'trace', products_synced: 3, products_updated: 1, products_unchanged: 1, products_failed: 1, failures: [{ product_name: 'Picanha', code: 'price_not_found' }] };
    const report = buildSwiftSyncReport({ data, error: { code: 'partial_sync', message: 'Uma falha', runId: 7 } });
    expect(report.steps).toHaveLength(6);
    expect(report.steps.map(step => step.status)).toEqual(['success', 'success', 'success', 'warning', 'warning', 'success']);
    expect(report.failures).toEqual([{ product: 'Picanha', code: 'price_not_found' }]);
  });

  it('marks all downstream stages as skipped after a network error', () => {
    const report = buildSwiftSyncReport({ data: null, error: { code: 'network_error', message: 'Sem conexão' } });
    expect(report.steps.map(step => step.status)).toEqual(['success', 'error', 'skipped', 'skipped', 'skipped', 'success']);
  });
});
