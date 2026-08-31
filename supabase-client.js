// Supabase client for the browser. Only the publishable (anon) key is used here —
// the Turnstile Secret Key and any Supabase service_role key must never appear
// in this codebase; they live only in the Supabase project dashboard.
import { createUnavailableSupabaseClient } from './supabase-unavailable.js?v=20260831-1';

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

export const supabase = await loadSupabaseClient();
