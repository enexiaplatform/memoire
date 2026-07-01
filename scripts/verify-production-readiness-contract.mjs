import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = process.cwd();
const failures = [];

function read(file) {
  return readFileSync(resolve(root, file), 'utf8');
}

function fail(message) {
  failures.push(message);
}

function requireIncludes(text, marker, label) {
  if (!text.includes(marker)) fail(label);
}

const readiness = read('scripts/lib/production-readiness-runtime.mjs');
const health = read('api/health.ts');
const clientLogEndpoint = read('api/client-log.ts');

for (const marker of [
  'evaluateProductionReadiness',
  "service: 'memoire'",
  'requiredFailed',
  'authRedirects',
  'checks',
]) {
  requireIncludes(readiness, marker, `readiness runtime missing contract marker: ${marker}`);
}

for (const checkName of [
  'supabase_url',
  'supabase_anon_key',
  'supabase_service_role',
  'app_url',
  'app_url_valid',
  'ai_generation_provider',
  'openai_embeddings',
]) {
  requireIncludes(readiness, checkName, `readiness runtime missing required check ${checkName}`);
}

for (const warningName of [
  'app_url_https',
  'app_url_not_localhost',
  'demo_mode_disabled',
  'founder_workspace_disabled',
]) {
  requireIncludes(readiness, warningName, `readiness runtime missing warning check ${warningName}`);
}

for (const optionalName of ['capture_ai_provider', 'stripe_secret', 'stripe_webhook_secret', 'billing_checkout_disabled']) {
  requireIncludes(readiness, optionalName, `readiness runtime missing optional check ${optionalName}`);
}

for (const redirectPath of ['/login?verified=1', '/reset-password', '/app/today']) {
  requireIncludes(readiness, redirectPath, `readiness runtime missing auth redirect path ${redirectPath}`);
}

for (const marker of [
  "evaluateProductionReadiness(process.env)",
  "'Cache-Control'",
  "'no-store'",
  "'GET'",
  "'HEAD'",
  "'Allow'",
  "'GET, HEAD'",
  'readiness.ok ? 200 : 503',
]) {
  requireIncludes(health, marker, `health endpoint missing contract marker: ${marker}`);
}

const clientLog = read('src/services/clientTelemetry.ts');
for (const marker of [
  'VITE_CLIENT_LOG_ENDPOINT',
  'void fetch(import.meta.env.VITE_CLIENT_LOG_ENDPOINT',
  "method: 'POST'",
  "headers: { 'Content-Type': 'application/json' }",
  'keepalive: body.length < 8_000',
]) {
  requireIncludes(clientLog, marker, `external client telemetry contract missing marker: ${marker}`);
}

for (const eventName of ['cloud_json_sync_failed', 'pipeline_defense_cloud_sync_failed']) {
  requireIncludes(clientLog, eventName, `client telemetry missing allowlisted event ${eventName}`);
}

for (const field of ['eventName', 'route', 'dataMode', 'component', 'operation', 'table', 'severity', 'error']) {
  requireIncludes(clientLog, field, `client telemetry missing field ${field}`);
}

for (const marker of [
  "from './_rateLimit.js'",
  "res.setHeader('Allow', 'POST')",
  "enforceRateLimit(req, 'client-log'",
  "return res.status(202).json({ success: true })",
  "message: 'Memoire client operational event'",
  'console.error(JSON.stringify',
  'buildClientLogPayload',
  'cleanRoute',
  'cleanText(body.error, 240)',
  '!route.includes(\'?\')',
  '!route.includes(\'#\')',
]) {
  requireIncludes(clientLogEndpoint, marker, `client-log endpoint missing contract marker: ${marker}`);
}

for (const eventName of ['cloud_json_sync_failed', 'pipeline_defense_cloud_sync_failed']) {
  requireIncludes(clientLogEndpoint, eventName, `client-log endpoint missing allowlisted event ${eventName}`);
}

for (const dataMode of ['demo-local', 'cloud-browser', 'browser-only', 'sync-issue', 'unknown']) {
  requireIncludes(clientLogEndpoint, dataMode, `client-log endpoint missing data mode ${dataMode}`);
}

const vercel = read('vercel.json');
for (const marker of ['"source": "/api/(.*)"', '"key": "Cache-Control"', '"value": "no-store"']) {
  requireIncludes(vercel, marker, `API runtime cache contract missing ${marker}`);
}

const contractDoc = read('docs/deployment/production-readiness-contract-coverage-2026-06-17.md');
for (const marker of ['A1 remains open', 'A7 remains open', 'scripts/verify-production-readiness-contract.mjs']) {
  requireIncludes(contractDoc, marker, `production readiness contract doc missing ${marker}`);
}

const releaseGate = read('docs/product/commercial-release-gate-2026-06-16.md');
requireIncludes(releaseGate, 'scripts/verify-production-readiness-contract.mjs', 'release gate does not reference production readiness verifier');
requireIncludes(releaseGate, 'scripts/verify-health-runtime-contract.mjs', 'release gate does not reference health runtime verifier');

const packet = read('docs/product/cohort-release-evidence-packet-2026-06-17.md');
requireIncludes(packet, 'scripts/verify-production-readiness-contract.mjs', 'cohort packet does not reference production readiness verifier');
requireIncludes(packet, 'scripts/verify-health-runtime-contract.mjs', 'cohort packet does not reference health runtime verifier');

const packageJson = read('package.json');
requireIncludes(packageJson, '"verify:health-runtime"', 'package.json missing verify:health-runtime script');
requireIncludes(packageJson, 'npm run verify:health-runtime', 'npm run check does not include health runtime verifier');

const clientLogHandler = await loadApiHandler('api/client-log.ts', {
  "from './_rateLimit.js'": `from '${pathToFileURL(resolve('api/_rateLimit.js')).href}'`,
});
const validLog = await invokeClientLog(clientLogHandler, 'POST', {
  eventName: 'cloud_json_sync_failed',
  route: '/app/settings?secret=1',
  dataMode: 'cloud-browser',
  component: 'ExportTab',
  operation: 'export',
  table: 'review_packs',
  severity: 'error',
  error: 'x'.repeat(300),
});
assert.equal(validLog.statusCode, 202, 'valid client operational event should return HTTP 202');
assert.equal(validLog.body?.success, true, 'valid client operational event should return success true');
assert.equal(validLog.logs.length, 1, 'valid client operational event should write one server log');
const parsedLog = JSON.parse(validLog.logs[0]);
assert.equal(parsedLog.message, 'Memoire client operational event', 'client log should include operator search marker');
assert.equal(parsedLog.eventName, 'cloud_json_sync_failed', 'client log should preserve allowlisted event');
assert.equal(parsedLog.route, '', 'client log should reject routes with query strings');
assert.equal(parsedLog.severity, 'error', 'client log should preserve valid severity');
assert.equal(parsedLog.error.length, 240, 'client log should cap error text at 240 characters');
assert.ok(parsedLog.timestamp, 'client log should include timestamp');

const invalidLog = await invokeClientLog(clientLogHandler, 'POST', {
  eventName: 'arbitrary_customer_payload',
  route: '/app/settings',
  dataMode: 'cloud-browser',
  component: 'ExportTab',
  operation: 'export',
});
assert.equal(invalidLog.statusCode, 400, 'invalid client operational event should return HTTP 400');

const methodLog = await invokeClientLog(clientLogHandler, 'GET', {});
assert.equal(methodLog.statusCode, 405, 'unsupported client-log methods should return HTTP 405');
assert.equal(methodLog.headers.Allow, 'POST', 'unsupported client-log methods should set Allow: POST');

let quietLimitResponse;
for (let i = 0; i < 31; i += 1) {
  quietLimitResponse = await invokeClientLog(clientLogHandler, 'POST', {
    eventName: 'pipeline_defense_cloud_sync_failed',
    route: '/app/pipeline-defense',
    dataMode: 'cloud-browser',
    component: 'PipelineDefenseCloudStore',
    operation: 'load',
    severity: 'warning',
  }, '198.51.100.77');
}
assert.equal(quietLimitResponse.statusCode, 202, 'rate-limited client logs should still return HTTP 202');
assert.equal(quietLimitResponse.body?.success, true, 'rate-limited client logs should quietly succeed');
assert.equal(quietLimitResponse.logs.length, 0, 'rate-limited client logs should not write another server log');
assert.equal(quietLimitResponse.headers['X-RateLimit-Remaining'], '0', 'rate-limited client logs should expose zero remaining');

if (failures.length > 0) {
  console.error('Production readiness contract verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Production readiness contract verification passed.');

async function loadApiHandler(file, replacements = {}) {
  let source = readFileSync(resolve(file), 'utf8');
  for (const [from, to] of Object.entries(replacements)) {
    source = source.replace(from, to);
  }

  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: resolve(file),
  }).outputText;

  const tempDir = join(tmpdir(), `memoire-api-runtime-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(tempDir, { recursive: true });
  const tempFile = join(tempDir, 'handler.mjs');
  writeFileSync(tempFile, compiled);

  try {
    const module = await import(pathToFileURL(tempFile).href);
    assert.equal(typeof module.default, 'function', `${file} should export a default handler`);
    return module.default;
  } finally {
    rmSync(dirname(tempFile), { recursive: true, force: true });
  }
}

async function invokeClientLog(handler, method, body, address = '203.0.113.45') {
  const logs = [];
  const originalError = console.error;
  console.error = (entry) => logs.push(String(entry));
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
    json(value) {
      this.body = value;
      return this;
    },
    end() {
      this.ended = true;
      return this;
    },
  };

  try {
    await handler({
      method,
      body,
      headers: { 'x-forwarded-for': address },
      socket: { remoteAddress: address },
    }, res);
  } finally {
    console.error = originalError;
  }

  return { ...res, logs };
}
