import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

const health = read('api/health.ts');

for (const marker of [
  "req.method !== 'GET' && req.method !== 'HEAD'",
  "res.setHeader('Allow', 'GET, HEAD')",
  "res.setHeader('Cache-Control', 'no-store')",
  "req.method === 'HEAD'",
  "service: 'memoire'",
  'requiredFailed',
  'authRedirects',
  'checks',
]) {
  requireIncludes(health, marker, `health endpoint missing contract marker: ${marker}`);
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
  requireIncludes(health, checkName, `health endpoint missing required check ${checkName}`);
}

for (const warningName of [
  'app_url_https',
  'app_url_not_localhost',
  'demo_mode_disabled',
  'founder_workspace_disabled',
]) {
  requireIncludes(health, warningName, `health endpoint missing warning check ${warningName}`);
}

for (const optionalName of ['capture_ai_provider', 'stripe_secret', 'stripe_webhook_secret', 'billing_checkout_disabled']) {
  requireIncludes(health, optionalName, `health endpoint missing optional check ${optionalName}`);
}

for (const redirectPath of ['/login?verified=1', '/reset-password', '/app/dashboard']) {
  requireIncludes(health, redirectPath, `health endpoint missing auth redirect path ${redirectPath}`);
}

const healthJsonBlock = health.slice(health.indexOf('return res.status(statusCode).json({'), health.indexOf('function buildChecks'));
if (healthJsonBlock.includes('process.env') || healthJsonBlock.includes('envValue(')) {
  fail('health response appears to expose raw env access in JSON response block');
}

const clientLog = read('api/client-log.ts');
for (const marker of [
  "from './_rateLimit.js'",
  "res.setHeader('Allow', 'POST')",
  "enforceRateLimit(req, 'client-log'",
  "return res.status(202).json({ success: true })",
  "message: 'Memoire client operational event'",
  'console.error(JSON.stringify(entry))',
  'cleanRoute',
  'cleanText',
]) {
  requireIncludes(clientLog, marker, `client-log endpoint missing contract marker: ${marker}`);
}

for (const eventName of ['cloud_json_sync_failed', 'pipeline_defense_cloud_sync_failed']) {
  requireIncludes(clientLog, eventName, `client-log endpoint missing allowlisted event ${eventName}`);
}

for (const dataMode of ['demo-local', 'cloud-browser', 'browser-only', 'sync-issue', 'unknown']) {
  requireIncludes(clientLog, dataMode, `client-log endpoint missing data mode ${dataMode}`);
}

for (const field of ['eventName', 'route', 'dataMode', 'component', 'operation', 'table', 'error', 'timestamp']) {
  requireIncludes(clientLog, field, `client-log endpoint missing sanitized log field ${field}`);
}

if (!/cleanText\(body\.error,\s*240\)/.test(clientLog)) fail('client-log error field must be capped at 240 characters');
if (!/cleanText\(value,\s*160\)/.test(clientLog)) fail('client-log route field must be capped at 160 characters');
if (!clientLog.includes("!route.includes('?')") || !clientLog.includes("!route.includes('#')")) {
  fail('client-log route cleaner must reject query strings and fragments');
}

const readinessDoc = read('docs/deployment/production-readiness-health-check-2026-06-16.md');
for (const marker of ['GET /api/health', 'HEAD /api/health', 'Cache-Control: no-store', 'No secret values are returned']) {
  requireIncludes(readinessDoc, marker, `production readiness doc missing ${marker}`);
}

const monitoringDoc = read('docs/deployment/operator-monitoring-signals-2026-06-16.md');
for (const marker of ['POST /api/client-log', 'Memoire client operational event', 'cloud_json_sync_failed', 'pipeline_defense_cloud_sync_failed']) {
  requireIncludes(monitoringDoc, marker, `monitoring doc missing ${marker}`);
}

const contractDoc = read('docs/deployment/production-readiness-contract-coverage-2026-06-17.md');
for (const marker of ['A1 remains open', 'A7 remains open', 'scripts/verify-production-readiness-contract.mjs']) {
  requireIncludes(contractDoc, marker, `production readiness contract doc missing ${marker}`);
}

const healthRuntimeDoc = read('docs/deployment/health-runtime-contract-coverage-2026-06-17.md');
for (const marker of ['scripts/verify-health-runtime-contract.mjs', 'HTTP `200`', 'HTTP `503`', 'A1, A6, and A7 remain open']) {
  requireIncludes(healthRuntimeDoc, marker, `health runtime coverage doc missing ${marker}`);
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

if (failures.length > 0) {
  console.error('Production readiness contract verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Production readiness contract verification passed.');
