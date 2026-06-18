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

const cohortPlan = read('docs/product/cohort-validation-system-2026-06-16.md');
for (const marker of [
  'controlled 5-10 person early-access cohort',
  '14 calendar days',
  'No paid checkout',
  'No unrestricted public signup',
  'No CRM writeback',
  'Score every request from 0-10.',
  '8-10 points: invite first.',
  'Day -2 To Day 0: Select And Invite',
  'Day 0: Onboarding',
  'Day 1-3: First Review Push',
  'Day 4-10: Real Usage Window',
  'Day 11-14: Closeout Interview',
  'Would you pay personally, ask your company to pay, or not pay?',
  'Go To Paid Offer Design',
  'Pause Or Reposition',
  'Use `docs/operations/weekly-operating-review-template-2026-06-17.md` as the source of truth',
  'Support contact path ready.',
  'Cohort tracker ready.',
]) {
  requireIncludes(cohortPlan, marker, `cohort validation plan missing marker: ${marker}`);
}

const outreach = read('docs/product/cohort-outreach-templates-2026-06-16.md');
for (const marker of [
  'Invite: Qualified Lead',
  'Invite: Warm DM',
  'Clarification Before Invite',
  'Onboarding Confirmation',
  'Activation Nudge',
  'Closeout Interview Ask',
  'Not A Fit Yet',
  'Post-Cohort Paid Intent Ask',
  'No CRM writeback, no payment, and no broad team rollout yet.',
  'share one feedback call after using it',
  'If you hit friction, reply with the exact step where it stopped.',
]) {
  requireIncludes(outreach, marker, `cohort outreach template missing marker: ${marker}`);
}

const tracker = read('docs/product/cohort-feedback-tracker-2026-06-16.csv');
for (const marker of [
  'participant_id',
  'qualification_score',
  'primary_pain',
  'active_deals_count',
  'can_use_csv',
  'can_join_feedback_call',
  'invite_status',
  'csv_import_completed_at',
  'pipeline_brief_created_at',
  'review_pack_saved_at',
  'manager_summary_copied',
  'first_review_completed',
  'weekly_usage_intent',
  'willingness_to_pay',
  'trust_blocker',
  'product_blocker',
  'support_notes',
  'decision',
  'next_step',
]) {
  requireIncludes(tracker, marker, `cohort feedback tracker missing column: ${marker}`);
}

const supportRunbook = read('docs/operations/early-access-support-incident-runbook-2026-06-17.md');
for (const marker of [
  'lightweight early-access support process for a 5-10 person controlled cohort',
  '`hello@memoire.app`',
  'The mailbox exists and receives external mail.',
  'At least one named person checks it every business day during the cohort.',
  'A backup owner exists for weekends, travel, or illness.',
  'Support notes are recorded in the cohort tracker or operating review notes.',
  'src/features/settings/ExportTab.tsx',
  'What they were doing.',
  'Approximate time.',
  'Visible error message.',
  'Whether they were signed in or using local/demo mode.',
  'Optional workspace export when support needs evidence for sync, deletion, or data recovery.',
  '| SEV0 |',
  '| SEV1 |',
  '| SEV2 |',
  '| SEV3 |',
  'Never require a user to send confidential customer data to get basic help.',
  'Check `/api/health` for environment readiness.',
  'Search Vercel logs for API errors and `Memoire client operational event`.',
  'Check Supabase Auth and database logs for the same time window.',
  'Store received exports only in the approved support workspace.',
  'Never paste customer content into an AI tool unless the user explicitly approves that provider and use case.',
  'Paid checkout remains blocked.',
  'Support inbox is confirmed live.',
  'Named primary and backup owners are recorded.',
  'First test support request is received and answered.',
  'SEV0/SEV1 escalation owner is confirmed.',
]) {
  requireIncludes(supportRunbook, marker, `support runbook missing marker: ${marker}`);
}

const exportTab = read('src/features/settings/ExportTab.tsx');
for (const marker of [
  "const SUPPORT_EMAIL = 'hello@memoire.app';",
  "mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Memoire early-access support')}",
  'Support package',
  'For early-access support, include what you were doing, the approximate time, the visible error message,',
  'and whether you were signed in or using local/demo mode.',
  'Download an export first if support needs',
  'Contact support',
  'Exports may contain customer and pipeline information.',
  'Only share an export when you choose to include',
  'This archive may contain sensitive customer and pipeline information. Store it securely.',
  'For support: share this archive only if you choose to include workspace data for troubleshooting.',
  'Support contact: ${SUPPORT_EMAIL}',
]) {
  requireIncludes(exportTab, marker, `ExportTab support guidance missing marker: ${marker}`);
}

const weeklyReview = read('docs/operations/weekly-operating-review-template-2026-06-17.md');
for (const marker of [
  'Support notes from `docs/operations/early-access-support-incident-runbook-2026-06-17.md`.',
  '| Support | Open SEV0/SEV1 issues |',
  '| A9 | Are cohort support/interview notes current? |',
  '| C5 | Any support incident requiring escalation? |',
  '## Support And Incident Review',
  'If support exports were received, record retention/deletion plan.',
  'Do not include confidential customer content in the review.',
]) {
  requireIncludes(weeklyReview, marker, `weekly operating review missing support marker: ${marker}`);
}

const coverageDoc = read('docs/product/cohort-support-contract-coverage-2026-06-17.md');
for (const marker of [
  'A9 remains open',
  'C5 remains open',
  'scripts/verify-support-cohort-contract.mjs',
  'Runtime Evidence Still Required',
]) {
  requireIncludes(coverageDoc, marker, `cohort support coverage doc missing marker: ${marker}`);
}

const packageJson = read('package.json');
requireIncludes(packageJson, '"verify:support-cohort"', 'package.json missing verify:support-cohort script');
requireIncludes(packageJson, 'npm run verify:support-cohort', 'npm run check does not include support-cohort verifier');

const releaseGate = read('docs/product/commercial-release-gate-2026-06-16.md');
requireIncludes(releaseGate, 'scripts/verify-support-cohort-contract.mjs', 'release gate does not reference support/cohort verifier');

const packet = read('docs/product/cohort-release-evidence-packet-2026-06-17.md');
requireIncludes(packet, 'scripts/verify-support-cohort-contract.mjs', 'cohort packet does not reference support/cohort verifier');

if (failures.length > 0) {
  console.error('Support/cohort contract verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Support/cohort contract verification passed.');
