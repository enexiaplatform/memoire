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

// This endpoint captures leads and nothing else. Product analytics moved to
// api/product-events.ts: a measurement and a sales lead have different
// retention, different privacy weight and different rate limits, and sharing a
// route meant neither could be changed safely.
const requestAccessApi = read('api/request-access.ts');
for (const marker of [
  "res.setHeader('Allow', 'POST')",
  'export function buildLeadInsertPayload',
  'export function isHoneypotSubmission',
  'export function cleanRoute',
  "typeof body.website === 'string' && body.website.trim()",
  "EMAIL_PATTERN.test(workEmail)",
  'body.consent !== true',
  "enforceRateLimit(req, 'request-access', leadPayload.rateLimitIdentity, 3, 60 * 60 * 1000)",
  'getSupabaseServiceRoleKey()',
  "supabase.from('early_access_requests').insert",
  "source: 'request_access_page'",
]) {
  requireIncludes(requestAccessApi, marker, `request-access API missing marker: ${marker}`);
}

/**
 * Somebody is told when a lead arrives.
 *
 * Nobody was. The form wrote a row and the operator console said so plainly:
 * "this list is the whole mechanism". A stranger's enquiry sat there until
 * somebody happened to open /admin, and nothing would ever have reported the
 * one that was missed.
 *
 * Three properties, each pinned to the line that provides it, because each one
 * is a different way to reintroduce the same class of loss:
 */
{
  const insertAt = requestAccessApi.indexOf("supabase.from('early_access_requests').insert");
  const notifyAt = requestAccessApi.indexOf('await notifyOperatorOfLead(');

  // 1. The alert never precedes the record. A notification that can throw
  //    before the insert takes the lead down with it.
  if (notifyAt === -1) {
    fail('request-access must notify somebody when a lead arrives - the /admin list cannot be the whole mechanism');
  } else if (notifyAt < insertAt) {
    fail('the lead notification runs before the insert - the alert must never be able to cost the record it is about');
  }

  // 2. Awaited. This is a serverless handler: an unawaited promise is killed
  //    when it returns, so fire-and-forget here is fire-and-never-send.
  requireIncludes(
    requestAccessApi,
    'await notifyOperatorOfLead(',
    'the lead notification must be awaited - a serverless handler kills an unawaited promise on return',
  );

  // 3. Its failure is swallowed, and its destination is configuration. The
  //    person filling in the form cannot fix our mailbox and must still get
  //    their 201; and no support address may be typed literally here, because
  //    it has one home in src/config/contact.ts.
  for (const marker of [
    'process.env.LEAD_NOTIFICATION_EMAIL || process.env.EMAIL_FROM',
    '  } catch {',
  ]) {
    requireIncludes(requestAccessApi, marker, `lead notification marker missing: ${marker}`);
  }
  if (/@memoire-official\.com/.test(requestAccessApi)) {
    fail('a support address is written literally in request-access.ts - it belongs in src/config/contact.ts');
  }
}

for (const analytics of [
  "body.kind === 'event'",
  'buildProductEventPayload',
  'PRODUCT_EVENTS',
  'product_funnel_events',
]) {
  if (requestAccessApi.includes(analytics)) {
    fail(`the lead endpoint must not carry product analytics: ${analytics}`);
  }
}

// The funnel event names now live with the rest of the taxonomy, in the
// dedicated analytics endpoint. `verify-product-analytics-contract.mjs` keeps
// them in sync with the client union and the product_events constraint.
const productEventsApi = read('api/product-events.ts');
for (const eventName of [
  'demo_started',
  'demo_completed',
  'request_access_submitted',
  'signup_completed',
  'csv_import_completed',
]) {
  requireIncludes(productEventsApi, eventName, `product-events API missing funnel event ${eventName}`);
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
