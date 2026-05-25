import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isPipelineSupabaseConfigured =
  Boolean(supabaseUrl) &&
  Boolean(supabaseAnonKey) &&
  !supabaseUrl.includes('placeholder') &&
  !supabaseAnonKey.includes('placeholder');

export const pipelineSupabaseConfigMessage =
  'Supabase cloud sync is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable Google sign-in and cloud persistence.';

declare global {
  var __memoireSupabaseClient: SupabaseClient | null | undefined;
}

export const supabaseClient: SupabaseClient | null = isPipelineSupabaseConfigured
  ? (globalThis.__memoireSupabaseClient ||= createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
        storageKey: 'memoire.supabase.auth',
      },
    }))
  : null;
