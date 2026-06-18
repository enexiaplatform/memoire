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

const requestAccessApi = read('api/request-access.ts');
for (const marker of [
  "res.setHeader('Allow', 'POST')",
  "body.kind === 'event'",
  'export function buildLeadInsertPayload',
  'export function buildProductEventPayload',
  'export function isHoneypotSubmission',
  'export function cleanRoute',
  "typeof body.website === 'string' && body.website.trim()",
  "EMAIL_PATTERN.test(workEmail)",
  'body.consent !== true',
  "enforceRateLimit(req, 'request-access', leadPayload.rateLimitIdentity, 3, 60 * 60 * 1000)",
  'getSupabaseServiceRoleKey()',
  "supabase.from('early_access_requests').insert",
  "source: 'request_access_page'",
  "recordProductEvent(req, res, body)",
  "supabase.from('product_funnel_events').insert",
  "return res.status(202).json({ success: true })",
  "message: 'Product event insert failed'",
]) {
  requireIncludes(requestAccessApi, marker, `request-access API missing marker: ${marker}`);
}

for (const eventName of [
  'demo_started',
  'demo_completed',
  'request_access_submitted',
  'signup_completed',
  'csv_import_completed',
  'pipeline_defense_brief_created',
  'review_pack_saved',
]) {
  requireIncludes(requestAccessApi, eventName, `request-access API missing product event ${eventName}`);
}

const requestPage = read('src/features/earlyAccess/EarlyAccessRequestPage.tsx');
for (const marker of [
  'submitEarlyAccessRequest(form, consent, website)',
  "trackProductEvent('request_access_submitted'",
  'Do not include confidential customer data',
  'within 2 business days',
  'Submitting does not add you to a marketing list',
  'Privacy Policy',
  'Website',
  'autoComplete="off"',
]) {
  requireIncludes(requestPage, marker, `early-access page missing marker: ${marker}`);
}

const util = read('src/utils/earlyAccessRequests.ts');
for (const marker of [
  "fetch('/api/request-access'",
  'workEmail',
  'preferredUseCase',
  'consent',
  'website',
]) {
  requireIncludes(util, marker, `early-access utility missing marker: ${marker}`);
}

const baseMigration = read('supabase/migrations/20260615124612_early_access_requests.sql');
for (const marker of [
  'CREATE TABLE public.early_access_requests',
  'work_email text NOT NULL',
  'consent_at timestamptz NOT NULL',
  "CHECK (status IN ('new', 'contacted', 'approved', 'declined', 'archived'))",
  'ALTER TABLE public.early_access_requests ENABLE ROW LEVEL SECURITY',
  'REVOKE ALL ON TABLE public.early_access_requests FROM anon, authenticated',
  'GRANT ALL ON TABLE public.early_access_requests TO service_role',
]) {
  requireIncludes(baseMigration, marker, `early-access base migration missing marker: ${marker}`);
}

const workflowMigration = read('supabase/migrations/20260616113000_early_access_operator_workflow.sql');
for (const marker of [
  'operator_owner',
  'follow_up_due_at',
  'contacted_at',
  'decided_at',
  'operator_note',
  'status_updated_at',
  'CREATE OR REPLACE VIEW public.operator_early_access_queue',
  'CREATE OR REPLACE VIEW public.operator_early_access_daily',
  'REVOKE ALL ON TABLE public.operator_early_access_queue FROM anon, authenticated',
  'REVOKE ALL ON TABLE public.operator_early_access_daily FROM anon, authenticated',
  'GRANT SELECT ON TABLE public.operator_early_access_queue TO service_role',
  'GRANT SELECT ON TABLE public.operator_early_access_daily TO service_role',
  'overdue_follow_ups',
  'Avoid sensitive customer content',
]) {
  requireIncludes(workflowMigration, marker, `lead workflow migration missing marker: ${marker}`);
}

const queryPack = read('docs/product/operator-funnel-queries-2026-06-16.sql');
for (const marker of [
  'New early-access lead follow-up queue',
  'Claim a new lead for follow-up',
  'Mark a lead as contacted',
  'Approve a lead for cohort invite',
  'Decline or archive a lead',
  'Retention review queue',
  "status = 'new'",
  "TARGET_STATUS must be 'declined' or 'archived'",
  "now() + interval '2 days'",
  "now() - interval '90 days'",
]) {
  requireIncludes(queryPack, marker, `operator query pack missing marker: ${marker}`);
}

const runbook = read('docs/product/early-access-lead-operations-2026-06-16.md');
for (const marker of [
  'operator_owner',
  'follow_up_due_at',
  'contacted_at',
  'decided_at',
  'operator_note',
  'New lead claimed within 1 business day',
  'First follow-up sent within 2 business days',
  'Do not store secrets',
  'A5 can move from "improved" to "operational evidence exists"',
]) {
  requireIncludes(runbook, marker, `lead operations runbook missing marker: ${marker}`);
}

const coverageDoc = read('docs/product/lead-operations-contract-coverage-2026-06-17.md');
for (const marker of ['A5 remains open', 'scripts/verify-lead-operations-contract.mjs', 'scripts/verify-lead-operations-runtime-contract.mjs', 'Runtime Evidence Still Required']) {
  requireIncludes(coverageDoc, marker, `lead operations coverage doc missing marker: ${marker}`);
}

const runtimeCoverageDoc = read('docs/product/lead-operations-runtime-contract-coverage-2026-06-17.md');
for (const marker of [
  'A5 remains open',
  'normalized operational fields',
  'privacy-minimized funnel events',
  'npm run verify:lead-ops-runtime',
]) {
  requireIncludes(runtimeCoverageDoc, marker, `lead operations runtime coverage doc missing marker: ${marker}`);
}

const releaseGate = read('docs/product/commercial-release-gate-2026-06-16.md');
requireIncludes(releaseGate, 'scripts/verify-lead-operations-contract.mjs', 'release gate does not reference lead operations verifier');
requireIncludes(releaseGate, 'scripts/verify-lead-operations-runtime-contract.mjs', 'release gate does not reference lead operations runtime verifier');

const packet = read('docs/product/cohort-release-evidence-packet-2026-06-17.md');
requireIncludes(packet, 'scripts/verify-lead-operations-contract.mjs', 'cohort packet does not reference lead operations verifier');
requireIncludes(packet, 'scripts/verify-lead-operations-runtime-contract.mjs', 'cohort packet does not reference lead operations runtime verifier');

const packageJson = read('package.json');
requireIncludes(packageJson, '"verify:lead-ops-runtime"', 'package.json missing verify:lead-ops-runtime script');
requireIncludes(packageJson, 'npm run verify:lead-ops-runtime', 'npm run check does not include lead-ops runtime verifier');

if (failures.length > 0) {
  console.error('Lead operations contract verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Lead operations contract verification passed.');
