import { describe, expect, it, vi } from 'vitest';
import { createUnavailableSupabaseClient } from '../../supabase-unavailable.js';

describe('createUnavailableSupabaseClient', () => {
  it('lets fluent queries settle with an actionable backend error', async () => {
    const client = createUnavailableSupabaseClient();
    const result = await client.from('recipes').select('*').eq('scope', 'site').order('name');

    expect(result.data).toBeNull();
    expect(result.error.code).toBe('SUPABASE_CLIENT_UNAVAILABLE');
  });

  it('starts signed out and provides a safe auth subscription', async () => {
    const client = createUnavailableSupabaseClient();
    const callback = vi.fn();

    expect(await client.auth.getSession()).toEqual({ data: { session: null }, error: null });
    expect(client.auth.onAuthStateChange(callback).data.subscription.unsubscribe).toBeTypeOf('function');
    expect(callback).not.toHaveBeenCalled();
  });
});
