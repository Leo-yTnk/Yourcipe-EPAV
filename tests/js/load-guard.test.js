import { describe, it, expect, vi } from 'vitest';
import { createLoadGuard } from '../../load-guard.js';

const deferred = () => { let resolve, reject; const promise = new Promise((res, rej) => { resolve = res; reject = rej; }); return { promise, resolve, reject }; };
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

describe('generation-safe load guard', () => {
  it('finishes normally and releases its key', async () => {
    const guard = createLoadGuard();
    expect(await guard.run('home', async commit => { commit(() => {}); return 'ok'; })).toBe('ok');
    expect(guard.has('home')).toBe(false);
  });

  it('captures a rejection, reports it, and does not block another key', async () => {
    const onError = vi.fn();
    const guard = createLoadGuard();
    const pending = deferred();
    guard.run('other', () => pending.promise);
    const result = await guard.run('broken', async () => { throw new Error('RPC failed'); }, { onError });
    expect(result).toEqual({ ok: false, error: 'RPC failed' });
    expect(onError).toHaveBeenCalledOnce();
    expect(guard.has('other')).toBe(true);
    pending.resolve();
  });

  it('times out, reports an error state, and releases the key', async () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const guard = createLoadGuard();
    guard.run('home', () => new Promise(() => {}), { timeoutMs: 20, onTimeout });
    await vi.advanceTimersByTimeAsync(20);
    expect(onTimeout).toHaveBeenCalledOnce();
    expect(guard.has('home')).toBe(false);
    vi.useRealTimers();
  });

  it('retry starts a genuinely new execution after timeout', async () => {
    vi.useFakeTimers();
    const first = deferred();
    const guard = createLoadGuard();
    guard.run('home', () => first.promise, { timeoutMs: 10 });
    const firstId = guard.executionId('home');
    await vi.advanceTimersByTimeAsync(10);
    const retry = guard.run('home', async () => 'retry', { timeoutMs: 10 });
    expect(guard.executionId('home')).toBeGreaterThan(firstId);
    expect(await retry).toBe('retry');
    first.resolve('late');
    vi.useRealTimers();
  });

  it('late response cannot overwrite retry state', async () => {
    vi.useFakeTimers();
    const first = deferred();
    const state = { value: '' };
    const guard = createLoadGuard();
    guard.run('home', async commit => { const value = await first.promise; commit(() => { state.value = value; }); }, { timeoutMs: 10 });
    await vi.advanceTimersByTimeAsync(10);
    await guard.run('home', async commit => commit(() => { state.value = 'new'; }));
    first.resolve('old');
    await flush();
    expect(state.value).toBe('new');
    vi.useRealTimers();
  });

  it('finally from a stale execution cannot clear a newer execution', async () => {
    vi.useFakeTimers();
    const first = deferred(), second = deferred();
    const guard = createLoadGuard();
    guard.run('home', () => first.promise, { timeoutMs: 10 });
    await vi.advanceTimersByTimeAsync(10);
    guard.run('home', () => second.promise, { timeoutMs: 100 });
    const secondId = guard.executionId('home');
    first.resolve();
    await flush();
    expect(guard.executionId('home')).toBe(secondId);
    second.resolve();
    vi.useRealTimers();
  });

  it('deduplicates only the same key', async () => {
    const a = deferred(), b = deferred();
    const guard = createLoadGuard();
    const a1 = guard.run('home', () => a.promise);
    const a2 = guard.run('home', () => { throw new Error('must not run'); });
    const bp = guard.run('creation', () => b.promise);
    expect(a2).toBe(a1);
    expect(guard.executionId('home')).not.toBe(guard.executionId('creation'));
    a.resolve(); b.resolve(); await Promise.all([a1, bp]);
  });
});
