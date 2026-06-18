interface ApiRequest {
  method?: string;
}

interface ApiResponse {
  status: (code: number) => ApiResponse;
  json: (body: unknown) => void;
  end: () => void;
  setHeader: (name: string, value: string) => void;
}

interface CheckResult {
  name: string;
  ok: boolean;
  severity: 'required' | 'warning' | 'optional';
  detail: string;
}

const APP_VERSION = process.env.VERCEL_GIT_COMMIT_SHA || process.env.npm_package_version || 'unknown';
const AUTH_REDIRECT_PATHS = ['/login?verified=1', '/reset-password', '/app/dashboard'];

export default function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).end();
  }

  res.setHeader('Cache-Control', 'no-store');

  const checks = buildChecks();
  const authRedirects = buildAuthRedirects();
  const requiredFailures = checks.filter((check) => check.severity === 'required' && !check.ok);
  const warnings = checks.filter((check) => check.severity === 'warning' && !check.ok);
  const ready = requiredFailures.length === 0;
  const statusCode = ready ? 200 : 503;

  if (req.method === 'HEAD') return res.status(statusCode).end();

  return res.status(statusCode).json({
    ok: ready,
    service: 'memoire',
    version: APP_VERSION,
    timestamp: new Date().toISOString(),
    summary: {
      requiredPassed: checks.filter((check) => check.severity === 'required' && check.ok).length,
      requiredFailed: requiredFailures.length,
      warnings: warnings.length,
    },
    authRedirects,
    checks,
  });
}

function buildChecks(): CheckResult[] {
  const hasSupabaseUrl = hasEnv('SUPABASE_URL') || hasEnv('VITE_SUPABASE_URL');
  const hasAiGenerationProvider = hasEnv('ANTHROPIC_API_KEY') || hasEnv('GROQ_API_KEY');
  const appUrlStatus = getAppUrlStatus();
  const hasCaptureAiProvider =
    envValue('CAPTURE_AI_PROVIDER') === 'openai-compatible' &&
    hasEnv('CAPTURE_AI_ENDPOINT') &&
    hasEnv('CAPTURE_AI_API_KEY') &&
    hasEnv('CAPTURE_AI_MODEL');

  return [
    required('supabase_url', hasSupabaseUrl, 'SUPABASE_URL or VITE_SUPABASE_URL is configured.'),
    required('supabase_anon_key', hasEnv('VITE_SUPABASE_ANON_KEY'), 'VITE_SUPABASE_ANON_KEY is configured.'),
    required('supabase_service_role', hasEnv('SUPABASE_SERVICE_ROLE_KEY'), 'SUPABASE_SERVICE_ROLE_KEY is configured.'),
    required('app_url', appUrlStatus.configured, 'VITE_APP_URL is configured for redirects and billing callbacks.'),
    required('app_url_valid', appUrlStatus.valid, 'VITE_APP_URL is a valid URL.'),
    required('ai_generation_provider', hasAiGenerationProvider, 'ANTHROPIC_API_KEY or GROQ_API_KEY is configured.'),
    required('openai_embeddings', hasEnv('OPENAI_API_KEY'), 'OPENAI_API_KEY is configured for semantic search and embeddings.'),
    warning('app_url_https', appUrlStatus.https, 'VITE_APP_URL uses HTTPS for customer-facing production.'),
    warning('app_url_not_localhost', appUrlStatus.publicHost, 'VITE_APP_URL is not localhost or 127.0.0.1.'),
    warning('demo_mode_disabled', envValue('VITE_ENABLE_DEMO_MODE') !== 'true', 'VITE_ENABLE_DEMO_MODE is not true.'),
    warning(
      'founder_workspace_disabled',
      envValue('VITE_ENABLE_FOUNDER_WORKSPACE') !== 'true',
      'VITE_ENABLE_FOUNDER_WORKSPACE is not true.',
    ),
    optional(
      'capture_ai_provider',
      hasCaptureAiProvider || !hasAnyEnv(['CAPTURE_AI_PROVIDER', 'CAPTURE_AI_ENDPOINT', 'CAPTURE_AI_API_KEY', 'CAPTURE_AI_MODEL']),
      'Optional capture AI provider is either fully configured or intentionally unset.',
    ),
    optional('stripe_secret', hasEnv('STRIPE_SECRET_KEY'), 'STRIPE_SECRET_KEY is configured only when checkout is enabled.'),
    optional(
      'stripe_webhook_secret',
      hasEnv('STRIPE_WEBHOOK_SECRET'),
      'STRIPE_WEBHOOK_SECRET is configured only when checkout is enabled.',
    ),
    optional(
      'billing_checkout_disabled',
      envValue('BILLING_CHECKOUT_ENABLED') !== 'true',
      'BILLING_CHECKOUT_ENABLED is not true until paid checkout gates pass.',
    ),
  ];
}

function buildAuthRedirects() {
  const appUrl = parseAppUrl();
  return {
    appUrlConfigured: Boolean(appUrl),
    requiredPaths: AUTH_REDIRECT_PATHS,
    requiredUrls: appUrl ? AUTH_REDIRECT_PATHS.map((path) => new URL(path, appUrl).toString()) : [],
    supabaseChecklist: [
      'Set Supabase Auth Site URL to VITE_APP_URL.',
      'Allow email verification redirect to /login?verified=1.',
      'Allow password recovery redirect to /reset-password.',
      'Allow OAuth app return path to /app/dashboard or the protected /app/* route under test.',
    ],
  };
}

function getAppUrlStatus() {
  const configured = hasEnv('VITE_APP_URL');
  const appUrl = parseAppUrl();
  return {
    configured,
    valid: Boolean(appUrl),
    https: appUrl?.protocol === 'https:',
    publicHost: Boolean(appUrl && !['localhost', '127.0.0.1', '::1'].includes(appUrl.hostname)),
  };
}

function parseAppUrl() {
  const value = envValue('VITE_APP_URL');
  if (!value) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function required(name: string, ok: boolean, detail: string): CheckResult {
  return { name, ok, severity: 'required', detail };
}

function warning(name: string, ok: boolean, detail: string): CheckResult {
  return { name, ok, severity: 'warning', detail };
}

function optional(name: string, ok: boolean, detail: string): CheckResult {
  return { name, ok, severity: 'optional', detail };
}

function hasAnyEnv(names: string[]) {
  return names.some(hasEnv);
}

function hasEnv(name: string) {
  return Boolean(envValue(name));
}

function envValue(name: string) {
  return process.env[name]?.trim();
}
