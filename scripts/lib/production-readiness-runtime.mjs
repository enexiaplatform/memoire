export const AUTH_REDIRECT_PATHS = ['/login?verified=1', '/reset-password', '/app/today'];

// Keys that would signal an AI provider had been wired back into the product.
// Memoire's parsing, prioritisation, search and recommendations are all
// deterministic and local; none of these should ever be set in production.
export const AI_PROVIDER_ENV_KEYS = [
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GROQ_API_KEY',
  'GOOGLE_GENERATIVE_AI_API_KEY',
  'COHERE_API_KEY',
  'CAPTURE_AI_PROVIDER',
  'CAPTURE_AI_ENDPOINT',
  'CAPTURE_AI_API_KEY',
  'CAPTURE_AI_MODEL',
];

export function evaluateProductionReadiness(env = process.env, options = {}) {
  const appUrl = parseAppUrl(env.VITE_APP_URL);
  const requestHost = normalizeHost(options.requestHost);
  const appUrlHost = appUrl ? appUrl.hostname.toLowerCase() : null;
  const checks = [
    required('supabase_url', hasEnv(env, 'SUPABASE_URL') || hasEnv(env, 'VITE_SUPABASE_URL')),
    required('supabase_anon_key', hasEnv(env, 'VITE_SUPABASE_ANON_KEY')),
    required('supabase_service_role', hasEnv(env, 'SUPABASE_SERVICE_ROLE_KEY')),
    required('app_url', hasEnv(env, 'VITE_APP_URL')),
    required('app_url_valid', Boolean(appUrl)),
    // Memoire has no AI dependency. The readiness contract used to require an
    // AI generation provider and an OpenAI embeddings key; both outlived the
    // features that needed them and were failing production health for
    // configuration the product no longer uses. `no_ai_provider_configured`
    // replaces them: it fails loudly if an AI key is set, so a paid external
    // dependency cannot be reintroduced by environment configuration alone.
    warning('no_ai_provider_configured', !hasAnyEnv(env, AI_PROVIDER_ENV_KEYS)),
    warning('app_url_https', appUrl?.protocol === 'https:'),
    warning('app_url_not_localhost', Boolean(appUrl && !['localhost', '127.0.0.1'].includes(appUrl.hostname))),
    // Catches VITE_APP_URL pointing at a domain this deployment does not
    // serve - auth emails would send users to a stranger's site.
    warning('app_url_matches_request_host', !requestHost || !appUrlHost || requestHost === appUrlHost),
    warning('demo_mode_disabled', env.VITE_ENABLE_DEMO_MODE !== 'true'),
    warning('founder_workspace_disabled', env.VITE_ENABLE_FOUNDER_WORKSPACE !== 'true'),
    // The digest is a listed feature of the paid plan, and three separate
    // pieces of configuration have to exist before one can be sent: the two the
    // sending endpoint needs, and the shared secret the scheduled job
    // authenticates with. Health reported `ok: true` while none of them were
    // set and the scheduled sender had failed on every run since it was
    // written, because nothing here looked. `optional`, because an operator may
    // deliberately not offer digests - but visible, so "on" and "will arrive"
    // can stop being two different things.
    optional('digest_email_api_key', hasEnv(env, 'EMAIL_API_KEY')),
    optional('digest_email_from', hasEnv(env, 'EMAIL_FROM')),
    optional('digest_cron_secret', hasEnv(env, 'CRON_SECRET')),
    optional('lemonsqueezy_api_key', hasEnv(env, 'LEMONSQUEEZY_API_KEY')),
    optional('lemonsqueezy_store', hasEnv(env, 'LEMONSQUEEZY_STORE_ID')),
    optional('lemonsqueezy_webhook_secret', hasEnv(env, 'LEMONSQUEEZY_WEBHOOK_SECRET')),
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
      appUrlHost,
      requestHost,
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

function parseAppUrl(value) {
  if (!value) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function normalizeHost(value) {
  if (!value || typeof value !== 'string') return null;
  return value.split(':')[0].trim().toLowerCase() || null;
}

function hasEnv(env, key) {
  return Boolean(String(env[key] || '').trim());
}

function hasAnyEnv(env, keys) {
  return keys.some((key) => hasEnv(env, key));
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
