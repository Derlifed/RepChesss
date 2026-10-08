// Supabase client for serverless auth operations.
import { createClient } from '@supabase/supabase-js';
import { ConfigError } from './_http.js';

let supabase;

export function getSupabase() {
  if (!supabase) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new ConfigError('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
    }
    supabase = createClient(url, key);
  }
  return supabase;
}
