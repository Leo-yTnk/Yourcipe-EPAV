// Supabase client for the browser. Only the publishable (anon) key is used here —
// the Turnstile Secret Key and any Supabase service_role key must never appear
// in this codebase; they live only in the Supabase project dashboard.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const SUPABASE_URL = 'https://ytvztfvypiwgnslisxep.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_TdHX924qP71RTF3qKQGdUA_Zd9LcBRT';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
