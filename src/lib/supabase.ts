import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { CONFIG } from '../config';

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!client) {
    client = createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return client;
}

export function sb(): SupabaseClient {
  return getSupabase();
}
