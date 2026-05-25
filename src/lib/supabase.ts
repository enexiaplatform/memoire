import type { SupabaseClient } from '@supabase/supabase-js';
import {
  isPipelineSupabaseConfigured,
  pipelineSupabaseConfigMessage,
  supabaseClient,
} from './supabaseClient';

export const supabase = supabaseClient as SupabaseClient;
export { supabaseClient };
export const isSupabaseSingletonConfigured = isPipelineSupabaseConfigured;
export const SUPABASE_SINGLETON_CONFIG_MESSAGE = pipelineSupabaseConfigMessage;
