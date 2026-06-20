import { existsSync, readFileSync } from 'node:fs';
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

function requireExists(file, label) {
  if (!existsSync(resolve(root, file))) fail(label);
}

const weeklyReview = read('docs/operations/weekly-operating-review-template-2026-06-17.md');
for (const marker of [
  'Roadmap slice: C3 weekly production monitoring and Session 12 operating loop',
  'Funnel SQL results from `docs/product/operator-funnel-queries-2026-06-16.sql`',
  'Cohort tracker rows from `docs/product/cohort-feedback-tracker-2026-06-16.csv`',
  'Support notes from `docs/operations/early-access-support-incident-runbook-2026-06-17.md`',
  '`/api/health` production result',
  'Vercel function error summary',
  'Vercel log search for `Memoire client operational event`',
  'Supabase Auth and database error summary',
  'AI provider usage and daily cost',
  'Paid-intent signals',
  'Failed cloud sync events',
  'AI spend',
  'Release Gate Review',
  'Monitoring Review',
  'Go/No-Go Decision',
  'docs/operations/weekly-reviews/YYYY-MM-DD-operating-review.md',
  'Pass Criteria For C3',
  'First completed review is still missing.',
]) {
  requireIncludes(weeklyReview, marker, `weekly operating review template missing marker: ${marker}`);
}

for (const gate of ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10', 'C3', 'C5']) {
  requireIncludes(weeklyReview, `| ${gate} |`, `weekly operating review missing gate ${gate}`);
}

for (const signal of [
  '`/api/health`',
  'Vercel function errors',
  'Client operational events',
  'Supabase Auth errors',
  'Supabase database errors',
  'AI provider usage/cost',
  'Stripe/webhook errors, if enabled',
]) {
  requireIncludes(weeklyReview, signal, `weekly monitoring review missing signal: ${signal}`);
}

const queryPack = read('docs/product/operator-funnel-queries-2026-06-16.sql');
for (const marker of [
  'Run these with a trusted operator/service-role context only.',
  'Daily funnel scoreboard',
  'Last 7 days activation snapshot',
  'Anonymous journey progress for the latest active visitors',
  'New early-access lead follow-up queue',
  'Early-access request status trend',
  'Claim a new lead for follow-up',
  'Retention review queue',
  'FROM public.operator_funnel_daily',
  'FROM public.operator_funnel_anonymous_progress',
  'FROM public.operator_early_access_queue',
  'FROM public.operator_early_access_daily',
]) {
  requireIncludes(queryPack, marker, `operator funnel query pack missing marker: ${marker}`);
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
  requireIncludes(queryPack, eventName, `operator funnel query pack missing event ${eventName}`);
}

const funnelMigration = read('supabase/migrations/20260616103000_operator_funnel_measurement.sql');
for (const marker of [
  'CREATE OR REPLACE VIEW public.operator_funnel_daily',
  'CREATE OR REPLACE VIEW public.operator_funnel_anonymous_progress',
  'CREATE OR REPLACE VIEW public.operator_early_access_daily',
  'REVOKE ALL ON TABLE public.operator_funnel_daily FROM anon, authenticated',
  'GRANT SELECT ON TABLE public.operator_funnel_daily TO service_role',
  'No email, sales content, account names, or deal data.',
]) {
  requireIncludes(funnelMigration, marker, `operator funnel migration missing marker: ${marker}`);
}

const monitoringDoc = read('docs/deployment/operator-monitoring-signals-2026-06-16.md');
for (const marker of [
  'Daily Cohort Review',
  'Check `/api/health`.',
  'Check Vercel function errors.',
  'Review AI provider usage and daily cost.',
  'Pass Rule For A7',
  'There is still no external alerting integration.',
]) {
  requireIncludes(monitoringDoc, marker, `operator monitoring doc missing marker: ${marker}`);
}

requireExists('docs/operations/weekly-reviews/README.md', 'weekly review storage README is missing');
const weeklyReviewsReadme = read('docs/operations/weekly-reviews/README.md');
for (const marker of [
  'Store completed weekly operating reviews here.',
  'Do not include confidential customer content',
  'C3 remains open until at least one completed review is saved here',
]) {
  requireIncludes(weeklyReviewsReadme, marker, `weekly review README missing marker: ${marker}`);
}

const coverageDoc = read('docs/operations/commercial-operating-loop-contract-coverage-2026-06-17.md');
for (const marker of [
  'C3 remains open',
  'R7 improves from missing query-pack evidence to static operating-loop coverage',
  'scripts/verify-commercial-operating-loop-contract.mjs',
  'Runtime Evidence Still Required',
]) {
  requireIncludes(coverageDoc, marker, `operating-loop coverage doc missing marker: ${marker}`);
}

const releaseGate = read('docs/product/commercial-release-gate-2026-06-16.md');
for (const marker of [
  'docs/operations/commercial-operating-loop-contract-coverage-2026-06-17.md',
  'scripts/verify-commercial-operating-loop-contract.mjs',
  'npm run verify:commercial-operating-loop',
]) {
  requireIncludes(releaseGate, marker, `release gate missing operating-loop marker: ${marker}`);
}

const roadmap = read('docs/product/commercialization-roadmap-2026-06-16.md');
for (const marker of [
  'docs/operations/commercial-operating-loop-contract-coverage-2026-06-17.md',
  'npm run verify:commercial-operating-loop',
  'R7 improves from missing query-pack evidence',
]) {
  requireIncludes(roadmap, marker, `roadmap missing operating-loop marker: ${marker}`);
}

const packet = read('docs/product/cohort-release-evidence-packet-2026-06-17.md');
for (const marker of [
  'scripts/verify-commercial-operating-loop-contract.mjs',
  'npm run verify:commercial-operating-loop',
]) {
  requireIncludes(packet, marker, `cohort packet missing operating-loop marker: ${marker}`);
}

const packageJson = read('package.json');
requireIncludes(packageJson, '"verify:commercial-operating-loop"', 'package.json missing verify:commercial-operating-loop script');
requireIncludes(packageJson, 'npm run verify:commercial-operating-loop', 'npm run check does not include operating-loop verifier');

const appRoutes = read('src/App.tsx');
requireIncludes(appRoutes, 'path="weekly-brief" element={<SalesReviewsPage />}',
  'App route missing /app/weekly-brief Commercial Review Brief entry point');
requireIncludes(appRoutes, 'path="reviews" element={<SalesReviewsPage />}',
  'Legacy /app/reviews route should remain available');

const sidebar = read('src/components/layout/Sidebar.tsx');
requireIncludes(sidebar, "to: '/app/weekly-brief', label: 'Weekly Brief'",
  'Sidebar missing Weekly Brief review entry');

const salesReviewsPage = read('src/features/reviews/SalesReviewsPage.tsx');
for (const marker of [
  'Commercial Review Brief',
  'Copy weekly brief',
  'Copy commercial brief',
  'Generate activity recap',
]) {
  requireIncludes(salesReviewsPage, marker, `Weekly Brief page missing marker: ${marker}`);
}

const pipelineDefensePage = read('src/features/pipeline/PipelineReviewDefenseBriefPage.tsx');
for (const marker of [
  'Commercial handoff',
  'After defense, move the money loop.',
  '/app/weekly-brief',
  '/app/quotes',
  '/app/revenue',
]) {
  requireIncludes(pipelineDefensePage, marker, `Pipeline Defense commercial handoff missing marker: ${marker}`);
}

const accountsPage = read('src/features/accounts/AccountsPage.tsx');
for (const marker of [
  'AccountCommercialLoop',
  'Commercial loop',
  'Opportunity to revenue',
  'More account context',
  'Edit account details',
]) {
  requireIncludes(accountsPage, marker, `Customer Workspace 2.0 missing marker: ${marker}`);
}

const quoteStore = read('src/services/quoteStore.ts');
for (const marker of [
  'PurchaseOrderStatus',
  'DeliveryStatus',
  'PaymentStatus',
  'getCommercialCheckpointRisk',
  'getQuoteCommercialStage',
]) {
  requireIncludes(quoteStore, marker, `Commercial fulfillment quote model missing marker: ${marker}`);
}

const quotesPage = read('src/features/quotes/QuotesPage.tsx');
for (const marker of ['Commercial progress', 'Expected delivery', 'Payment due']) {
  requireIncludes(quotesPage, marker, `Quote Tracker fulfillment UI missing marker: ${marker}`);
}

const revenueView = read('src/utils/revenueView.ts');
for (const marker of ['pendingDelivery', "'Waiting on delivery'", "'Payment overdue'", 'quotedOpportunityIds']) {
  requireIncludes(revenueView, marker, `Revenue View fulfillment logic missing marker: ${marker}`);
}

requireIncludes(packageJson, 'npm run verify:commercial-fulfillment',
  'npm run check does not include commercial fulfillment verification');

if (failures.length > 0) {
  console.error('Commercial operating-loop contract verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Commercial operating-loop contract verification passed.');
