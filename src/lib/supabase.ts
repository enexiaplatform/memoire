import { createClient } from '@supabase/supabase-js';
import { SUPABASE_ENV_ERROR, isSupabaseConfigured } from './demoMode';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!isSupabaseConfigured) {
  console.error(SUPABASE_ENV_ERROR);
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key'
);
