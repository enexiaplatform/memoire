import { createHash, timingSafeEqual } from 'node:crypto';
import { stagingBackend, stagingKey, stagingOrigin } from '../scripts/staging/isolation.mjs';

const digest = value => createHash('sha256').update(value).digest();

export function stagingBindings(env = process.env) {
  const commit = env.VERCEL_GIT_COMMIT_SHA;
  if (env.VERCEL_ENV !== 'preview' || env.MEMOIRE_STAGING_ATTESTATION !== 'true' ||
    !/^[0-9a-f]{40}$/.test(commit ?? '') || !env.SUPABASE_SERVICE_ROLE_KEY ||
    !env.VITE_SUPABASE_ANON_KEY || env.VITE_ENABLE_NATIVE_WORKSPACES !== 'true' ||
    ['AUTOMATION_ENABLED', 'AI_CHAT_ENABLED', 'BILLING_CHECKOUT_ENABLED'].some(key => env[key] === 'true') ||
    ['CRON_SECRET', 'EMAIL_API_KEY', 'LEMONSQUEEZY_API_KEY', 'ANTHROPIC_API_KEY', 'GROQ_API_KEY',
      'COMMERCIAL_WEBHOOK_TARGETS'].some(key => Boolean(env[key]))) return null;
  try {
    const origin = stagingOrigin(env.MEMOIRE_STAGING_APP_ORIGIN);
    const backend = stagingBackend(env.MEMOIRE_STAGING_PROJECT_REF, env.SUPABASE_URL, env.VITE_SUPABASE_URL);
    stagingKey(env.SUPABASE_SERVICE_ROLE_KEY, env.MEMOIRE_STAGING_PROJECT_REF, 'service_role');
    stagingKey(env.VITE_SUPABASE_ANON_KEY, env.MEMOIRE_STAGING_PROJECT_REF, 'anon');
    return { origin, backend, commit, planCompletionEnabled: env.PLAN_COMPLETION_ENABLED === 'true' };
  } catch {
    return null;
  }
}

export function stagingAttestation(req, env = process.env) {
  const token = env.MEMOIRE_STAGING_PROBE_TOKEN;
  const auth = req.headers?.authorization;
  if (req.method !== 'GET' || !token || token.length < 32 || typeof auth !== 'string'
    || !timingSafeEqual(digest(auth), digest('Bearer ' + token))) return null;
  return stagingBindings(env);
}
