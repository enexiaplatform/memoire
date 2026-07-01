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

const app = read('src/App.tsx');
for (const marker of [
  'path="/privacy"',
  'to="/legal/privacy"',
  'path="/terms"',
  'to="/legal/terms"',
  'path="/legal/:document"',
  'LegalPage',
]) {
  requireIncludes(app, marker, `public legal route missing marker: ${marker}`);
}

const legalPage = read('src/features/legal/LegalPage.tsx');
for (const marker of [
  'Privacy Policy',
  'Terms of Service',
  'Product and Data Boundaries',
  'AI-assisted features',
  'configured server-side AI provider',
  'Do not submit confidential customer information',
  'early-access product',
  'not as a system of record, legal record, or guaranteed forecast',
  'human review',
  'does not silently update external systems',
  'does not currently provide enterprise SSO, team administration, or native CRM writeback',
  'hello@memoire.app',
]) {
  requireIncludes(legalPage, marker, `legal page missing trust-boundary marker: ${marker}`);
}

const boundariesTab = read('src/features/settings/BoundariesTab.tsx');
for (const marker of [
  'Data and Product Boundaries',
  'where human review is required',
  'No CRM writeback, enterprise SSO, team administration, or manager scoring is available today.',
  'AI-assisted text may be sent to the configured provider only when you explicitly use that feature.',
  'View full product boundaries',
  'to="/legal/boundaries"',
]) {
  requireIncludes(boundariesTab, marker, `settings boundaries tab missing marker: ${marker}`);
}

const askMemoire = read('src/features/v31/AskMemoirePage.tsx');
for (const marker of [
  'Ask Memoire uses local rule-based answers when the configured endpoint is unavailable.',
  'Ask endpoint unavailable - showing a local rule-based answer.',
  'Answered with the configured Ask endpoint.',
  'Cloud answers may send the selected sales context to your configured AI provider.',
  'confidential customer data unless that provider is approved by your organization.',
]) {
  requireIncludes(askMemoire, marker, `Ask Memoire missing AI/provider marker: ${marker}`);
}

const dailyCapture = read('src/features/dailyCapture/DailyCapturePage.tsx');
for (const marker of [
  'AI unavailable — using local fallback. Please review before saving.',
  'AI parsed. Review the fields before saving.',
  'AI parses Full Notes automatically. Confirm or correct every field before saving.',
  'Local fallback preview',
  'Needs confirmation',
  'AI Assist sends this note to your configured server-side AI endpoint.',
  'Do not use it for confidential customer data unless your provider is approved.',
]) {
  requireIncludes(dailyCapture, marker, `Daily Capture missing AI disclosure marker: ${marker}`);
}

const quickCapture = read('src/features/v31/QuickCapturePanel.tsx');
for (const marker of [
  'Quick Note',
  'Email Thread',
  'Local parsing.',
  'AI-assisted when configured.',
  'Signed-in structuring may send this note to the configured server-side AI endpoint.',
  'Review output before saving',
  'avoid confidential customer data unless that provider is approved.',
  'Email thread structuring runs in this browser flow.',
  'Review extracted fields before saving to Sales Memory.',
]) {
  requireIncludes(quickCapture, marker, `Quick Capture missing boundary marker: ${marker}`);
}

const pipelineDefense = read('src/features/pipeline/PipelineReviewDefenseBriefPage.tsx');
for (const marker of [
  'Mock AI draft',
  'Deterministic local drafting only. No AI API or network request is used.',
  'Draft provider: {providerLabel}',
  'Generating local draft...',
]) {
  requireIncludes(pipelineDefense, marker, `Pipeline Defense draft boundary missing marker: ${marker}`);
}

const boundaryDoc = read('docs/product/ai-disclosure-boundary-hardening-2026-06-17.md');
for (const marker of [
  'A8/R10 trust readiness',
  'does not replace legal review',
  'Ask Memoire may send selected sales context',
  'Daily Capture AI Assist may send the full note',
  'Quick Capture quick-note structuring may send the submitted note',
  'Quick Capture email-thread structuring is local parsing',
  'Pipeline Defense Draft Assist uses the local mock provider only',
  'Legal review for the actual jurisdiction and business entity.',
]) {
  requireIncludes(boundaryDoc, marker, `AI disclosure hardening doc missing marker: ${marker}`);
}

const coverageDoc = read('docs/product/trust-boundary-contract-coverage-2026-06-17.md');
for (const marker of [
  'A8 remains open',
  'R10 remains open until deployed UX QA',
  'scripts/verify-trust-boundary-contract.mjs',
  'Runtime Evidence Still Required',
]) {
  requireIncludes(coverageDoc, marker, `trust-boundary coverage doc missing marker: ${marker}`);
}

const releaseGate = read('docs/product/commercial-release-gate-2026-06-16.md');
requireIncludes(releaseGate, 'scripts/verify-trust-boundary-contract.mjs', 'release gate does not reference trust-boundary verifier');

const packet = read('docs/product/cohort-release-evidence-packet-2026-06-17.md');
requireIncludes(packet, 'scripts/verify-trust-boundary-contract.mjs', 'cohort packet does not reference trust-boundary verifier');

if (failures.length > 0) {
  console.error('Trust-boundary contract verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Trust-boundary contract verification passed.');
