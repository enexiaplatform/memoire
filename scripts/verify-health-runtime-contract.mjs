import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ts from 'typescript';

const failures = [];
const originalEnv = { ...process.env };

function fail(message) {
  failures.push(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function makeRes() {
  return {
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
}

function setEnv(values) {
  process.env = { ...originalEnv };
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

async function loadHealthHandler() {
  const source = await import('node:fs').then((fs) => fs.readFileSync('api/health.ts', 'utf8'));
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const dir = mkdtempSync(join(tmpdir(), 'memoire-health-contract-'));
  const file = join(dir, `health-${Date.now()}.mjs`);
  writeFileSync(file, transpiled.outputText, 'utf8');
  const mod = await import(`file:///${file.replaceAll('\\', '/')}`);
  return {
    handler: mod.default,
    cleanup() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

function checkNames(body, expectedNames) {
  const names = new Set(body.checks.map((check) => check.name));
  for (const name of expectedNames) assert(names.has(name), `health response missing check ${name}`);
}

let cleanup = () => {};

try {
  const loaded = await loadHealthHandler();
  const handler = loaded.handler;
  cleanup = loaded.cleanup;

  const secretValues = {
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

  setEnv(secretValues);
  const getRes = makeRes();
  handler({ method: 'GET' }, getRes);

  assert(getRes.statusCode === 200, 'complete env GET should return HTTP 200');
  assert(getRes.headers['Cache-Control'] === 'no-store', 'GET should set Cache-Control: no-store');
  assert(getRes.body?.ok === true, 'complete env GET should return ok true');
  assert(getRes.body?.service === 'memoire', 'GET should identify service as memoire');
  assert(getRes.body?.summary?.requiredFailed === 0, 'complete env should have zero required failures');
  assert(Array.isArray(getRes.body?.checks), 'GET should include checks array');
  assert(getRes.body?.authRedirects?.appUrlConfigured === true, 'GET should mark app URL configured');
  assert(
    getRes.body?.authRedirects?.requiredUrls?.includes('https://app.memoire.test/login?verified=1'),
    'GET should include verification redirect URL',
  );
  assert(
    getRes.body?.authRedirects?.requiredUrls?.includes('https://app.memoire.test/reset-password'),
    'GET should include password reset redirect URL',
  );
  assert(
    getRes.body?.authRedirects?.requiredUrls?.includes('https://app.memoire.test/app/dashboard'),
    'GET should include app dashboard redirect URL',
  );
  checkNames(getRes.body, [
    'supabase_url',
    'supabase_anon_key',
    'supabase_service_role',
    'app_url',
    'app_url_valid',
    'ai_generation_provider',
    'openai_embeddings',
    'app_url_https',
    'app_url_not_localhost',
    'demo_mode_disabled',
    'founder_workspace_disabled',
    'capture_ai_provider',
    'stripe_secret',
    'stripe_webhook_secret',
    'billing_checkout_disabled',
  ]);

  const serializedHealthyBody = JSON.stringify(getRes.body);
  for (const secret of [
    secretValues.VITE_SUPABASE_ANON_KEY,
    secretValues.SUPABASE_SERVICE_ROLE_KEY,
    secretValues.ANTHROPIC_API_KEY,
    secretValues.OPENAI_API_KEY,
  ]) {
    assert(!serializedHealthyBody.includes(secret), `health response should not expose secret value ${secret}`);
  }

  const headRes = makeRes();
  handler({ method: 'HEAD' }, headRes);
  assert(headRes.statusCode === 200, 'complete env HEAD should return HTTP 200');
  assert(headRes.ended === true, 'HEAD should end the response');
  assert(headRes.body === undefined, 'HEAD should not include a JSON body');
  assert(headRes.headers['Cache-Control'] === 'no-store', 'HEAD should set Cache-Control: no-store');

  const methodRes = makeRes();
  handler({ method: 'POST' }, methodRes);
  assert(methodRes.statusCode === 405, 'unsupported method should return HTTP 405');
  assert(methodRes.headers.Allow === 'GET, HEAD', 'unsupported method should set Allow: GET, HEAD');
  assert(methodRes.ended === true, 'unsupported method should end the response');

  setEnv({
    ...secretValues,
    SUPABASE_SERVICE_ROLE_KEY: undefined,
    OPENAI_API_KEY: undefined,
  });
  const missingEnvRes = makeRes();
  handler({ method: 'GET' }, missingEnvRes);
  assert(missingEnvRes.statusCode === 503, 'missing required env should return HTTP 503');
  assert(missingEnvRes.body?.ok === false, 'missing required env should return ok false');
  assert(missingEnvRes.body?.summary?.requiredFailed === 2, 'missing env should report two required failures');
  const failedChecks = new Set(missingEnvRes.body?.checks?.filter((check) => !check.ok).map((check) => check.name));
  assert(failedChecks.has('supabase_service_role'), 'missing env should fail supabase_service_role check');
  assert(failedChecks.has('openai_embeddings'), 'missing env should fail openai_embeddings check');

  setEnv({
    ...secretValues,
    VITE_APP_URL: 'not a url',
  });
  const invalidUrlRes = makeRes();
  handler({ method: 'GET' }, invalidUrlRes);
  assert(invalidUrlRes.statusCode === 503, 'invalid app URL should return HTTP 503');
  assert(invalidUrlRes.body?.authRedirects?.appUrlConfigured === false, 'invalid app URL should not be treated as configured redirects');
  assert(invalidUrlRes.body?.authRedirects?.requiredUrls?.length === 0, 'invalid app URL should not produce required redirect URLs');
  const invalidUrlChecks = new Map(invalidUrlRes.body?.checks?.map((check) => [check.name, check]));
  assert(invalidUrlChecks.get('app_url')?.ok === true, 'invalid but present app URL should pass configured check');
  assert(invalidUrlChecks.get('app_url_valid')?.ok === false, 'invalid app URL should fail valid check');
} finally {
  cleanup();
  process.env = originalEnv;
}

if (failures.length > 0) {
  console.error('Health runtime contract verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Health runtime contract verification passed.');
