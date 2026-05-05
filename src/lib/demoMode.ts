import type { User } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const demoModeEnabled = import.meta.env.VITE_ENABLE_DEMO_MODE === 'true';
export const isFounderWorkspaceEnabled = import.meta.env.VITE_ENABLE_FOUNDER_WORKSPACE === 'true';
export const DEMO_USER_ID = 'local-demo-user';
export const DEMO_AUTH_KEY = 'memoire_demo_auth';
export const DEMO_WORKSPACE_KEY = 'memoire_demo_workspace';

const runtimeDemoWorkspace =
  typeof window !== 'undefined' &&
  window.localStorage.getItem(DEMO_WORKSPACE_KEY) === 'interactive-demo';

export const isSupabaseConfigured =
  Boolean(supabaseUrl) &&
  Boolean(supabaseAnonKey) &&
  !supabaseUrl.includes('placeholder') &&
  !supabaseAnonKey.includes('placeholder');

export const isDemoMode = runtimeDemoWorkspace || isFounderWorkspaceEnabled || (demoModeEnabled && !isSupabaseConfigured);

export const missingSupabaseMessage =
  !supabaseUrl ||
  !supabaseAnonKey ||
  supabaseUrl.includes('placeholder') ||
  supabaseAnonKey.includes('placeholder');

export const SUPABASE_ENV_ERROR =
  'Real Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env. Demo mode is disabled unless VITE_ENABLE_DEMO_MODE=true.';

export function createDemoUser(email = 'admin@memoire.local', displayName = 'Local Admin') {
  return {
    id: DEMO_USER_ID,
    email,
    user_metadata: { display_name: displayName },
    app_metadata: {},
    aud: 'authenticated',
    created_at: new Date().toISOString(),
  } as User;
}
