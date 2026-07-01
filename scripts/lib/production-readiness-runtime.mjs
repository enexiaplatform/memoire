export const AUTH_REDIRECT_PATHS = ['/login?verified=1', '/reset-password', '/app/today'];

export function evaluateProductionReadiness(env = process.env) {
  const appUrl = parseAppUrl(env.VITE_APP_URL);
  const checks = [
    required('supabase_url', hasEnv(env, 'SUPABASE_URL') || hasEnv(env, 'VITE_SUPABASE_URL')),
    required('supabase_anon_key', hasEnv(env, 'VITE_SUPABASE_ANON_KEY')),
    required('supabase_service_role', hasEnv(env, 'SUPABASE_SERVICE_ROLE_KEY')),
    required('app_url', hasEnv(env, 'VITE_APP_URL')),
    required('app_url_valid', Boolean(appUrl)),
    required('ai_generation_provider', hasEnv(env, 'ANTHROPIC_API_KEY') || hasEnv(env, 'GROQ_API_KEY')),
    required('openai_embeddings', hasEnv(env, 'OPENAI_API_KEY')),
    warning('app_url_https', appUrl?.protocol === 'https:'),
    warning('app_url_not_localhost', Boolean(appUrl && !['localhost', '127.0.0.1'].includes(appUrl.hostname))),
    warning('demo_mode_disabled', env.VITE_ENABLE_DEMO_MODE !== 'true'),
    warning('founder_workspace_disabled', env.VITE_ENABLE_FOUNDER_WORKSPACE !== 'true'),
    optional('capture_ai_provider', captureAiProviderIsCompleteOrUnset(env)),
    optional('stripe_secret', hasEnv(env, 'STRIPE_SECRET_KEY')),
    optional('stripe_webhook_secret', hasEnv(env, 'STRIPE_WEBHOOK_SECRET')),
    optional('billing_checkout_disabled', env.BILLING_CHECKOUT_ENABLED !== 'true'),
  ];
  const requiredFailures = checks.filter((check) => check.severity === 'required' && !check.ok);

  return {
    ok: requiredFailures.length === 0,
    service: 'memoire',
    summary: {
      requiredPassed: checks.filter((check) => check.severity === 'required' && check.ok).length,
      requiredFailed: requiredFailures.length,
      warnings: checks.filter((check) => check.severity === 'warning' && !check.ok).length,
    },
    authRedirects: {
      appUrlConfigured: Boolean(appUrl),
      requiredPaths: AUTH_REDIRECT_PATHS,
      requiredUrls: appUrl ? AUTH_REDIRECT_PATHS.map((path) => new URL(path, appUrl).toString()) : [],
      supabaseChecklist: [
        'Set Supabase Auth Site URL to VITE_APP_URL.',
        'Allow email verification redirect to /login?verified=1.',
        'Allow password recovery redirect to /reset-password.',
        'Allow OAuth app return path to /app/today or the protected /app/* route under test.',
      ],
    },
    checks,
  };
}

function captureAiProviderIsCompleteOrUnset(env) {
  const keys = ['CAPTURE_AI_PROVIDER', 'CAPTURE_AI_ENDPOINT', 'CAPTURE_AI_API_KEY', 'CAPTURE_AI_MODEL'];
  if (!keys.some((key) => hasEnv(env, key))) return true;
  return env.CAPTURE_AI_PROVIDER === 'openai-compatible' && keys.slice(1).every((key) => hasEnv(env, key));
}

function parseAppUrl(value) {
  if (!value) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function hasEnv(env, key) {
  return Boolean(String(env[key] || '').trim());
}

function required(name, ok) {
  return { name, ok, severity: 'required' };
}

function warning(name, ok) {
  return { name, ok, severity: 'warning' };
}

function optional(name, ok) {
  return { name, ok, severity: 'optional' };
}
