import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), getSession: vi.fn() }));
vi.mock('../../supabase-client.js?v=20260819-2', () => ({
  supabase: {
    auth: { getSession: mocks.getSession },
    functions: { invoke: mocks.invoke },
    from: vi.fn(), rpc: vi.fn(),
  },
}));

const { refreshProductPrice, refreshAllProductPrices } = await import('../../catalog.js');

describe('Swift sync catalog calls', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.invoke.mockReset();
    mocks.getSession.mockReset().mockResolvedValue({ data: { session: { access_token: 'test-jwt' } }, error: null });
  });

  it('invokes an individual update with the product id and returns success', async () => {
    mocks.invoke.mockResolvedValue({ data: { products_synced: 1, products_updated: 1, products_failed: 0 }, error: null });
    await expect(refreshProductPrice('product-1')).resolves.toMatchObject({ data: { products_updated: 1 }, error: null });
    expect(mocks.invoke).toHaveBeenCalledWith('swift-price-sync', { body: expect.objectContaining({ productId: 'product-1', requestId: expect.any(String) }) });
  });

  it('invokes a batch update with an empty body', async () => {
    mocks.invoke.mockResolvedValue({ data: { products_synced: 3, products_failed: 0 }, error: null });
    await expect(refreshAllProductPrices()).resolves.toMatchObject({ data: { products_synced: 3 }, error: null });
    expect(mocks.invoke).toHaveBeenCalledWith('swift-price-sync', { body: expect.objectContaining({ requestId: expect.any(String) }) });
  });

  it('does not call the function when the user session is absent', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
    const result = await refreshProductPrice('product-1');
    expect(result.error.code).toBe('session_expired');
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('does not retry permanent authorization errors', async () => {
    const error = new Error('non-2xx');
    error.context = new Response('{"code":"forbidden"}', { status: 403 });
    mocks.invoke.mockResolvedValue({ data: null, error });
    const result = await refreshAllProductPrices();
    expect(result.error.code).toBe('forbidden');
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
  });

  it('retries a transport failure once and preserves the original failure', async () => {
    const error = new TypeError('fetch failed');
    mocks.invoke.mockResolvedValue({ data: null, error });
    const result = await refreshProductPrice('product-1');
    expect(result.error.code).toBe('network_error');
    expect(result.error.technical.original).toBe(error);
    expect(mocks.invoke).toHaveBeenCalledTimes(2);
    expect(mocks.invoke.mock.calls[0][1].body.requestId).toBe(mocks.invoke.mock.calls[1][1].body.requestId);
  });

  it('does not report HTTP success when product metrics contain failures', async () => {
    mocks.invoke.mockResolvedValue({ data: { products_synced: 3, products_failed: 1, run_id: 7 }, error: null });
    const result = await refreshAllProductPrices();
    expect(result.error).toMatchObject({ code: 'partial_sync' });
    expect(result.data.products_failed).toBe(1);
  });

  it('coalesces simultaneous clicks into one request', async () => {
    let release;
    mocks.invoke.mockReturnValue(new Promise(resolve => { release = resolve; }));
    const first = refreshProductPrice('product-1');
    const second = refreshProductPrice('product-1');
    await Promise.resolve();
    release({ data: { products_synced: 1, products_failed: 0 }, error: null });
    expect(await first).toEqual(await second);
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
  });

  it('does not retry a backend 500 after the backend acquired its lock', async () => {
    const error = new Error('non-2xx');
    error.context = new Response('{"code":"sync_internal_error","run_id":9,"stage":"sync_products"}', { status: 500 });
    mocks.invoke.mockResolvedValue({ data: null, error });
    const result = await refreshAllProductPrices();
    expect(result.error).toMatchObject({ code: 'sync_internal_error', runId: 9 });
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
  });

  it('rejects a response without trustworthy metrics', async () => {
    mocks.invoke.mockResolvedValue({ data: { ok: true }, error: null });
    expect((await refreshAllProductPrices()).error.code).toBe('invalid_sync_response');
  });
});
