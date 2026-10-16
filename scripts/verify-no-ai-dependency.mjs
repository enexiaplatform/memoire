import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { evaluateProductionReadiness } from './lib/production-readiness-runtime.mjs';

// Historical command name retained in the full release gate. The user's
// 2026-10-16 decision adds optional chat; the core must still work without AI.
const read = path => readFileSync(path, 'utf8');
const pkg = JSON.parse(read('package.json'));
for (const name of ['openai', '@anthropic-ai/sdk', 'groq-sdk', '@google/generative-ai', 'langchain']) {
  assert.equal({ ...pkg.dependencies, ...pkg.devDependencies }[name], undefined, `Unexpected AI SDK: ${name}`);
}
const files = [];
function walk(dir) {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const path = `${dir}/${item.name}`;
    if (item.isDirectory()) walk(path);
    else if (/\.(ts|tsx)$/.test(path)) files.push(path);
  }
}
walk('src');
for (const file of files) {
  const source = read(file);
  for (const marker of ['GROQ_API_KEY', 'api.groq.com', 'OPENAI_API_KEY', 'api.openai.com']) {
    assert.equal(source.includes(marker), false, `${file} exposes a provider configuration or direct provider call`);
  }
  if (/fetch\(['"]\/api\/ai-chat['"]/.test(source)) assert.equal(file, 'src/services/aiChat.ts', 'Chat requests must use the single authenticated client');
}
const endpoint = read('api/_aiChat.js');
for (const marker of ['getBearerToken', 'verifyUserToken', "body.consent !== true", 'ownedSources', 'AbortSignal.timeout', 'enforceRateLimit', 'private, no-store']) assert.ok(endpoint.includes(marker), `Chat boundary missing: ${marker}`);
assert.match(endpoint, /\.eq\(['"]user_id['"], userId\)/, 'Source queries must be owner-bound');
assert.equal(endpoint.includes('SERVICE_ROLE'), false, 'AI chat must use caller RLS, not service authority');
const panel = read('src/features/aiChat/AiChatPanel.tsx');
for (const marker of ['Data preview', 'I choose to share', 'captureLocalWorkspaceScope', 'Confirm and add to Plan', 'Nothing is sent to the customer.']) assert.ok(panel.includes(marker), `Chat disclosure missing: ${marker}`);
const legal = read('src/features/legal/LegalPage.tsx');
for (const marker of ['Optional AI chat', 'Groq', 'page memory', 'human review']) assert.ok(legal.includes(marker));
for (const falseClaim of ['Memoire has no AI provider', 'Nothing you write is sent to a language model', 'There is no AI provider in this list']) assert.equal(legal.includes(falseClaim), false, `Stale privacy claim: ${falseClaim}`);
assert.ok(read('src/features/dailyCapture/DailyCapturePage.tsx').includes('nothing is sent to an AI service'), 'Capture remains on-device');
const healthy = evaluateProductionReadiness({ VITE_SUPABASE_URL: 'https://project.supabase.co', VITE_SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service', VITE_APP_URL: 'https://memoire.test' });
assert.equal(healthy.ok, true, 'No AI configuration may be required to run the core app');
assert.equal(healthy.checks.some(check => check.severity === 'required' && /ai|groq/i.test(check.name)), false);
console.log('Optional AI boundary verified: local core, explicit sharing, authenticated Groq, no client secrets.');
