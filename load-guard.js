// Generation-safe async loader coordinator. Each key is independent; a timed
// out run becomes stale immediately, so its response/finally cannot mutate UI
// state or clear a newer retry.
export function createLoadGuard({ setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  const active = new Map();
  let sequence = 0;

  function run(key, operation, { timeoutMs = 20000, onTimeout, onError } = {}) {
    const existing = active.get(key);
    if (existing) return existing.promise;

    const token = { key, id: ++sequence, promise: null, timer: null };
    const isCurrent = () => active.get(key) === token;
    const commit = (update) => {
      if (!isCurrent()) return false;
      update();
      return true;
    };

    token.promise = Promise.resolve().then(() => operation(commit, token.id)).catch((error) => {
      if (isCurrent() && onError) onError(error);
      return { ok: false, error: (error && error.message) || String(error) };
    }).finally(() => {
      clearTimer(token.timer);
      if (isCurrent()) active.delete(key);
    });
    active.set(key, token);
    token.timer = setTimer(() => {
      if (!isCurrent()) return;
      active.delete(key);
      if (onTimeout) onTimeout();
    }, timeoutMs);
    return token.promise;
  }

  return {
    run,
    has: (key) => active.has(key),
    executionId: (key) => active.get(key)?.id ?? null,
    isCurrent: (key, id) => active.get(key)?.id === id,
  };
}
