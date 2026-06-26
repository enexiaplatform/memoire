// Health endpoint for Memoire. Returns environment readiness and Supabase Auth redirect guidance.
//
// Set Supabase Auth Site URL to VITE_APP_URL.
// Allow email verification redirect to /login?verified=1.
// Allow password recovery redirect to /reset-password.
// Allow OAuth app return path to /app/dashboard or the protected /app/* route under test.

const AUTH_REDIRECT_PATHS = ['/login?verified=1', '/reset-password', '/app/dashboard'];

type CheckLevel = 'required' | 'warning' | 'optional';

interface Check {
  name: string;
  ok: boolean;
  level: CheckLevel;
  message?: string;
}

function envValue(name: string): string | undefined {
  return process.env[name] || undefined;
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function buildChecks(): Check[] {
  const supabaseUrl = envValue('SUPABASE_URL') || envValue('VITE_SUPABASE_URL');
  const supabaseAnonKey = envValue('VITE_SUPABASE_ANON_KEY');
  const supabaseServiceRole = envValue('SUPABASE_SERVICE_ROLE_KEY');
  const appUrl = envValue('VITE_APP_URL');
  const aiGenerationProvider = envValue('ANTHROPIC_API_KEY');
  const openaiKey = envValue('OPENAI_API_KEY');
  const captureAiProvider = envValue('ANTHROPIC_API_KEY') || envValue('OPENAI_API_KEY');
  const stripeSecret = envValue('STRIPE_SECRET_KEY');
  const stripeWebhookSecret = envValue('STRIPE_WEBHOOK_SECRET');
  const demoModeEnabled = envValue('VITE_ENABLE_DEMO_MODE');
  const founderWorkspaceEnabled = envValue('VITE_ENABLE_FOUNDER_WORKSPACE');

  const appUrlPresent = Boolean(appUrl);
  const appUrlValid = appUrlPresent && isValidHttpUrl(appUrl!);
  const appUrlHttps = appUrlValid && appUrl!.startsWith('https:');
  const appUrlNotLocalhost = appUrlValid && !appUrl!.includes('localhost') && !appUrl!.includes('127.0.0.1');

  return [
    { name: 'supabase_url', ok: Boolean(supabaseUrl), level: 'required' },
    { name: 'supabase_anon_key', ok: Boolean(supabaseAnonKey), level: 'required' },
    { name: 'supabase_service_role', ok: Boolean(supabaseServiceRole), level: 'required' },
    { name: 'app_url', ok: appUrlPresent, level: 'required' },
    { name: 'app_url_valid', ok: appUrlValid, level: 'required' },
    { name: 'ai_generation_provider', ok: Boolean(aiGenerationProvider), level: 'required' },
    { name: 'openai_embeddings', ok: Boolean(openaiKey), level: 'required' },
    { name: 'app_url_https', ok: appUrlHttps, level: 'warning' },
    { name: 'app_url_not_localhost', ok: appUrlNotLocalhost, level: 'warning' },
    { name: 'demo_mode_disabled', ok: demoModeEnabled !== 'true', level: 'warning' },
    { name: 'founder_workspace_disabled', ok: founderWorkspaceEnabled !== 'true', level: 'warning' },
    { name: 'capture_ai_provider', ok: Boolean(captureAiProvider), level: 'optional' },
    { name: 'stripe_secret', ok: Boolean(stripeSecret), level: 'optional' },
    { name: 'stripe_webhook_secret', ok: Boolean(stripeWebhookSecret), level: 'optional' },
    {
      name: 'billing_checkout_disabled',
      ok: envValue('BILLING_CHECKOUT_ENABLED') !== 'true',
      level: 'optional',
      message: 'BILLING_CHECKOUT_ENABLED must not be true until paid gates pass',
    },
  ];
}

export default function handler(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).end();
  }

  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'HEAD') {
    return res.status(200).end();
  }

  const checks = buildChecks();

  const requiredFailed = checks.filter((c) => c.level === 'required' && !c.ok).length;
  const statusCode = requiredFailed > 0 ? 503 : 200;

  const appUrl = envValue('VITE_APP_URL');
  const appUrlConfigured = Boolean(appUrl) && isValidHttpUrl(appUrl!);
  const requiredUrls = appUrlConfigured
    ? AUTH_REDIRECT_PATHS.map((path) => `${appUrl}${path}`)
    : [];

  return res.status(statusCode).json({
    ok: requiredFailed === 0,
    service: 'memoire',
    summary: {
      requiredFailed,
      total: checks.length,
    },
    checks: checks.map((c) => ({
      name: c.name,
      ok: c.ok,
      level: c.level,
      ...(c.message ? { message: c.message } : {}),
    })),
    authRedirects: {
      appUrlConfigured,
      requiredUrls,
      guidance: [
        'Set Supabase Auth Site URL to VITE_APP_URL.',
        'Allow email verification redirect to /login?verified=1.',
        'Allow password recovery redirect to /reset-password.',
        'Allow OAuth app return path to /app/dashboard or the protected /app/* route under test.',
      ],
    },
  });
}
