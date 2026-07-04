import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import { evaluateProductionReadiness } from './lib/production-readiness-runtime.mjs';

const completeEnv = {
  SUPABASE_URL: 'https://project.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'anon-secret-value',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-secret-value',
  VITE_APP_URL: 'https://app.memoire.test',
  ANTHROPIC_API_KEY: 'anthropic-secret-value',
  OPENAI_API_KEY: 'openai-secret-value',
  VITE_ENABLE_DEMO_MODE: 'false',
  VITE_ENABLE_FOUNDER_WORKSPACE: 'false',
  BILLING_CHECKOUT_ENABLED: 'false',
};

const healthy = evaluateProductionReadiness(completeEnv);
assert.equal(healthy.ok, true, 'complete env should be production-ready');
assert.equal(healthy.service, 'memoire');
assert.equal(healthy.summary.requiredFailed, 0);
assert.ok(healthy.authRedirects.requiredUrls.includes('https://app.memoire.test/login?verified=1'));
assert.ok(healthy.authRedirects.requiredUrls.includes('https://app.memoire.test/reset-password'));
assert.ok(healthy.authRedirects.requiredUrls.includes('https://app.memoire.test/app/today'));

// The serving host must match VITE_APP_URL, or auth emails send users to a
// domain this deployment does not own.
const hostMatch = evaluateProductionReadiness(completeEnv, { requestHost: 'app.memoire.test' });
assert.equal(hostMatch.checks.find((check) => check.name === 'app_url_matches_request_host').ok, true, 'matching host should pass');
assert.equal(hostMatch.authRedirects.requestHost, 'app.memoire.test');
assert.equal(hostMatch.authRedirects.appUrlHost, 'app.memoire.test');

const hostMismatch = evaluateProductionReadiness(completeEnv, { requestHost: 'someone-elses-domain.vercel.app' });
const mismatchCheck = hostMismatch.checks.find((check) => check.name === 'app_url_matches_request_host');
assert.equal(mismatchCheck.ok, false, 'mismatched host must fail the check');
assert.equal(mismatchCheck.severity, 'warning');
assert.ok(hostMismatch.summary.warnings >= 1, 'host mismatch should count as a warning');

const hostUnknown = evaluateProductionReadiness(completeEnv, {});
assert.equal(hostUnknown.checks.find((check) => check.name === 'app_url_matches_request_host').ok, true, 'missing request host should not fail the check');

const hostWithPort = evaluateProductionReadiness(completeEnv, { requestHost: 'APP.MEMOIRE.TEST:443' });
assert.equal(hostWithPort.checks.find((check) => check.name === 'app_url_matches_request_host').ok, true, 'host with port and case should normalize');

const checkNames = new Set(healthy.checks.map((check) => check.name));
for (const name of [
  'supabase_url', 'supabase_anon_key', 'supabase_service_role', 'app_url', 'app_url_valid',
  'ai_generation_provider', 'openai_embeddings', 'app_url_https', 'app_url_not_localhost',
  'demo_mode_disabled', 'founder_workspace_disabled', 'capture_ai_provider', 'stripe_secret',
  'stripe_webhook_secret', 'billing_checkout_disabled',
]) assert.ok(checkNames.has(name), `readiness result missing check ${name}`);

const serialized = JSON.stringify(healthy);
for (const secret of [completeEnv.VITE_SUPABASE_ANON_KEY, completeEnv.SUPABASE_SERVICE_ROLE_KEY, completeEnv.ANTHROPIC_API_KEY, completeEnv.OPENAI_API_KEY]) {
  assert.ok(!serialized.includes(secret), 'readiness result must not expose secret values');
}

const missing = evaluateProductionReadiness({ ...completeEnv, SUPABASE_SERVICE_ROLE_KEY: '', OPENAI_API_KEY: '' });
assert.equal(missing.ok, false);
assert.equal(missing.summary.requiredFailed, 2);

const invalidUrl = evaluateProductionReadiness({ ...completeEnv, VITE_APP_URL: 'not a url' });
assert.equal(invalidUrl.ok, false);
assert.equal(invalidUrl.authRedirects.appUrlConfigured, false);
assert.deepEqual(invalidUrl.authRedirects.requiredUrls, []);

const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'));
const apiHeaders = vercel.headers?.find((entry) => entry.source === '/api/(.*)')?.headers || [];
assert.ok(apiHeaders.some((header) => header.key === 'Cache-Control' && header.value === 'no-store'), 'API runtime must retain no-store cache policy');

const healthHandler = await loadHealthHandler();

const originalEnv = process.env;
process.env = { ...completeEnv };
try {
  const getRes = await invokeHealth(healthHandler, 'GET');
  assert.equal(getRes.statusCode, 200, 'GET /api/health should return HTTP 200 for complete env');
  assert.equal(getRes.headers['Cache-Control'], 'no-store', 'GET /api/health should set no-store');
  assert.equal(getRes.body?.ok, true, 'GET /api/health should return ok: true for complete env');
  assert.equal(getRes.body?.summary?.requiredFailed, 0, 'GET /api/health should report zero required failures for complete env');
  assert.ok(getRes.body?.authRedirects?.requiredUrls?.includes('https://app.memoire.test/app/today'), 'GET /api/health should include app auth redirect URL');

  const headRes = await invokeHealth(healthHandler, 'HEAD');
  assert.equal(headRes.statusCode, 200, 'HEAD /api/health should return HTTP 200 for complete env');
  assert.equal(headRes.headers['Cache-Control'], 'no-store', 'HEAD /api/health should set no-store');
  assert.equal(headRes.ended, true, 'HEAD /api/health should end without JSON body');
  assert.equal(headRes.body, undefined, 'HEAD /api/health should not return JSON body');

  process.env = { ...completeEnv, SUPABASE_SERVICE_ROLE_KEY: '', OPENAI_API_KEY: '' };
  const unhealthyRes = await invokeHealth(healthHandler, 'GET');
  assert.equal(unhealthyRes.statusCode, 503, 'GET /api/health should return HTTP 503 when required env is missing');
  assert.equal(unhealthyRes.body?.ok, false, 'GET /api/health should return ok: false when required env is missing');

  const methodRes = await invokeHealth(healthHandler, 'POST');
  assert.equal(methodRes.statusCode, 405, 'unsupported /api/health methods should return HTTP 405');
  assert.equal(methodRes.headers.Allow, 'GET, HEAD', 'unsupported /api/health methods should set Allow');
  assert.equal(methodRes.body?.error, 'Method not allowed', 'unsupported /api/health methods should return method error');
} finally {
  process.env = originalEnv;
}

console.log('Health/readiness runtime contract verification passed.');

async function loadHealthHandler() {
  const sourcePath = resolve('api/health.ts');
  const runtimePath = resolve('scripts/lib/production-readiness-runtime.mjs');
  const source = readFileSync(sourcePath, 'utf8').replace(
    "from '../scripts/lib/production-readiness-runtime.mjs'",
    `from '${pathToFileURL(runtimePath).href}'`,
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: sourcePath,
  }).outputText;

  const tempDir = join(tmpdir(), `memoire-health-runtime-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(tempDir, { recursive: true });
  const tempFile = join(tempDir, 'health.mjs');
  writeFileSync(tempFile, compiled);

  try {
    const module = await import(pathToFileURL(tempFile).href);
    assert.equal(typeof module.default, 'function', 'api/health.ts should export a default handler');
    return module.default;
  } finally {
    rmSync(dirname(tempFile), { recursive: true, force: true });
  }
}

async function invokeHealth(handler, method) {
  const res = {
    headers: {},
    statusCode: undefined,
    body: undefined,
    ended: false,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    end() {
      this.ended = true;
      return this;
    },
  };

  await handler({ method }, res);
  return res;
}
