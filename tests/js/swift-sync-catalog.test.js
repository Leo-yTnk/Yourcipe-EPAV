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
    expect(mocks.invoke).toHaveBeenCalledWith('swift-price-sync', { body: { productId: 'product-1' } });
  });

  it('invokes a batch update with an empty body', async () => {
    mocks.invoke.mockResolvedValue({ data: { products_synced: 3, products_failed: 0 }, error: null });
    await expect(refreshAllProductPrices()).resolves.toMatchObject({ data: { products_synced: 3 }, error: null });
    expect(mocks.invoke).toHaveBeenCalledWith('swift-price-sync', { body: {} });
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
  });
});
