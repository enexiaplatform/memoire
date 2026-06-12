export function getRequiredEnv(name, fallbackName) {
  const value = process.env[name] || (fallbackName ? process.env[fallbackName] : undefined);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}${fallbackName ? ` or ${fallbackName}` : ''}`);
  }
  return value;
}

export function getSupabaseUrl() {
  return getRequiredEnv('SUPABASE_URL', 'VITE_SUPABASE_URL');
}

export function getSupabaseAnonKey() {
  return getRequiredEnv('VITE_SUPABASE_ANON_KEY');
}

export function getSupabaseServiceRoleKey() {
  return getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY');
}
