// Supabase client for the browser. Only the publishable (anon) key is used here —
// the Turnstile Secret Key and any Supabase service_role key must never appear
// in this codebase; they live only in the Supabase project dashboard.
import { createUnavailableSupabaseClient } from './supabase-unavailable.js?v=20260831-3';

const SUPABASE_URL = 'https://ytvztfvypiwgnslisxep.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_TdHX924qP71RTF3qKQGdUA_Zd9LcBRT';

const SUPABASE_MODULE_URL = 'https://esm.sh/@supabase/supabase-js@2.45.4';
const CLIENT_LOAD_TIMEOUT_MS = 5000;

async function loadSupabaseClient() {
  try {
    const modulePromise = import(SUPABASE_MODULE_URL);
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Tempo limite ao carregar o cliente Supabase.')), CLIENT_LOAD_TIMEOUT_MS);
    });
    const { createClient } = await Promise.race([modulePromise, timeoutPromise]);
    return createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  } catch (error) {
    // A static CDN import used to prevent the entire ES module graph from
    // evaluating, leaving only index.html's "Carregando…" placeholder. Keep
    // the UI usable and let each online feature report its ordinary error.
    console.error('[Supabase] cliente indisponível; iniciando em modo local.', error);
    return createUnavailableSupabaseClient();
  }
}

// Do not use top-level await here. While this module is waiting for the CDN,
// the browser cannot evaluate app.js, so even the first Preact render never
// happens and index.html remains frozen on its static "Carregando…" screen.
// The facade starts the download in parallel and only makes operations that
// actually need Supabase wait for it.
const clientPromise = loadSupabaseClient();

function deferredQuery(startMethod, startArgs) {
  const calls = [];
  let query;
  query = new Proxy({}, {
    get(_target, property) {
      if (property === 'then') {
        return (resolve, reject) => clientPromise.then(async (client) => {
          const owner = startMethod === 'storage.from' ? client.storage : client;
          const method = startMethod === 'storage.from' ? 'from' : startMethod;
          let builder = owner[method](...startArgs);
          for (const [method, args] of calls) builder = builder[method](...args);
          return builder;
        }).then(resolve, reject);
      }
      return (...args) => {
        calls.push([property, args]);
        return query;
      };
    },
  });
  return query;
}

function deferredAuthSubscription(callback) {
  let subscription;
  let cancelled = false;
  clientPromise.then((client) => {
    if (cancelled) return;
    subscription = client.auth.onAuthStateChange(callback).data.subscription;
  });
  return {
    data: {
      subscription: {
        unsubscribe() {
          cancelled = true;
          subscription?.unsubscribe();
        },
      },
    },
  };
}

export const supabase = {
  from: (...args) => deferredQuery('from', args),
  rpc: (...args) => deferredQuery('rpc', args),
  channel: (...args) => deferredQuery('channel', args),
  removeChannel: async (...args) => (await clientPromise).removeChannel(...args),
  auth: new Proxy({}, {
    get(_target, property) {
      if (property === 'onAuthStateChange') return deferredAuthSubscription;
      return async (...args) => (await clientPromise).auth[property](...args);
    },
  }),
  functions: {
    invoke: async (...args) => (await clientPromise).functions.invoke(...args),
  },
  storage: {
    from: (...args) => deferredQuery('storage.from', args),
  },
};
