import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// `import.meta.env` is a Vite construct. Outside the bundler - Node running the
// domain tests, or any future server-side render - it is undefined, and reading
// through it throws at module load, taking down everything that imports a store.
// Defaulting to an empty config leaves `supabaseClient` null, which every caller
// already handles as "local only".
const viteEnv = (import.meta as { env?: Record<string, string | undefined> }).env || {};
const supabaseUrl = viteEnv.VITE_SUPABASE_URL || '';
const supabaseAnonKey = viteEnv.VITE_SUPABASE_ANON_KEY || '';

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
