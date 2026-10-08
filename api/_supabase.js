import { createClient } from '@supabase/supabase-js';
import { ConfigError } from './_http.js';

let anon;
let admin;

export function getSupabaseAnon() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new ConfigError('SUPABASE_URL and SUPABASE_ANON_KEY are required.');
  anon ??= createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return anon;
}

export function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new ConfigError('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  admin ??= createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return admin;
}
