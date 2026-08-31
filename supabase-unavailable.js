const UNAVAILABLE_ERROR = Object.freeze({
  code: 'SUPABASE_CLIENT_UNAVAILABLE',
  message: 'O serviço online está temporariamente indisponível.',
  details: null,
  hint: 'Verifique a conexão e tente novamente.',
});

function unavailableResult() {
  return { data: null, error: { ...UNAVAILABLE_ERROR }, count: null };
}

function createUnavailableQuery() {
  let query;
  query = new Proxy({}, {
    get(_target, property) {
      if (property === 'then') {
        return (resolve, reject) => Promise.resolve(unavailableResult()).then(resolve, reject);
      }
      // Supabase query builders are fluent. Returning the same safe builder
      // lets existing calls finish normally, whatever filters they append.
      return () => query;
    },
  });
  return query;
}

/**
 * Minimal fail-closed client used only when the CDN module cannot be loaded.
 * It keeps the application renderable (with its bundled demo catalog) while
 * every operation that needs the backend returns an explicit error.
 */
export function createUnavailableSupabaseClient() {
  const query = () => createUnavailableQuery();
  return {
    from: query,
    rpc: query,
    channel: query,
    removeChannel: async () => 'ok',
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signUp: async () => unavailableResult(),
      signInWithPassword: async () => unavailableResult(),
      signOut: async () => unavailableResult(),
    },
    functions: { invoke: async () => unavailableResult() },
    storage: { from: query },
  };
}

export { UNAVAILABLE_ERROR };
