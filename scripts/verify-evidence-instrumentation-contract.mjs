import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const DEEP_LOOP_EVENTS = [
  'activity_ledger_opened',
  'business_review_opened',
  'money_flow_opened',
  'cockpit_tile_clicked',
  'morning_brief_question_clicked',
  'follow_up_logged_as_sent',
  'next_touch_booked',
  'calibration_viewed',
  'proven_responses_copied',
  'voice_dictation_used',
  'learning_brief_copied',
  'revenue_risk_brief_copied',
  'follow_up_brief_copied',
];

// 1. Client union and server whitelist stay in sync - an event missing on
// either side is silently dropped, which is exactly the failure this guards.
const clientAnalytics = read('src/utils/productAnalytics.ts');
const serverWhitelist = read('api/request-access.ts');
for (const eventName of DEEP_LOOP_EVENTS) {
  assert.ok(clientAnalytics.includes(`'${eventName}'`), `client union missing ${eventName}`);
  assert.ok(serverWhitelist.includes(`'${eventName}'`), `server PRODUCT_EVENTS missing ${eventName}`);
}

// 2. Every event has a real call site - dead event names lie to the funnel.
const CALL_SITES = {
  activity_ledger_opened: 'src/features/calendar/SalesActivityCalendarPage.tsx',
  business_review_opened: 'src/features/reviews/SalesReviewsPage.tsx',
  money_flow_opened: 'src/features/revenue/RevenueViewPage.tsx',
  cockpit_tile_clicked: 'src/features/dashboard/BusinessCockpitStrip.tsx',
  morning_brief_question_clicked: 'src/features/dashboard/MorningBriefCard.tsx',
  follow_up_logged_as_sent: 'src/features/v31/FollowUpComposerPanel.tsx',
  next_touch_booked: 'src/features/v31/FollowUpComposerPanel.tsx',
  calibration_viewed: 'src/features/pipeline/PipelineReviewDefenseBriefPage.tsx',
  proven_responses_copied: 'src/features/playbook/SalesPlaybookPage.tsx',
  voice_dictation_used: 'src/hooks/useSpeechDictation.ts',
  learning_brief_copied: 'src/features/reviews/SalesReviewsPage.tsx',
  revenue_risk_brief_copied: 'src/features/reviews/SalesReviewsPage.tsx',
  follow_up_brief_copied: 'src/features/reviews/SalesReviewsPage.tsx',
};
for (const [eventName, file] of Object.entries(CALL_SITES)) {
  assert.ok(read(file).includes(`trackProductEvent('${eventName}'`), `${file} missing call site for ${eventName}`);
}

// 3. Global error reporter: installed at boot, deduped, capped, noise-filtered,
// and inert without the endpoint env (via the telemetry pipe).
const reporter = read('src/lib/globalErrorReporter.ts');
for (const marker of [
  'MAX_REPORTS_PER_SESSION = 5',
  'reportedSignatures',
  'ResizeObserver loop',
  'unhandledrejection',
  "eventName: 'client_render_error'",
]) {
  assert.ok(reporter.includes(marker), `globalErrorReporter missing marker: ${marker}`);
}
assert.ok(read('src/main.tsx').includes('installGlobalErrorReporter()'), 'main.tsx must install the reporter');
assert.ok(read('api/client-log.ts').includes("'client_render_error'"), 'client-log must accept client_render_error');
assert.ok(read('src/services/clientTelemetry.ts').includes('VITE_CLIENT_LOG_ENDPOINT'), 'telemetry must stay endpoint-gated');

// 4. The founder runbook exists and covers the launch-blocking env steps.
const runbook = read('docs/deployment/founder-launch-runbook.md');
for (const marker of ['VITE_APP_URL', 'OPENAI_API_KEY', 'VITE_CLIENT_LOG_ENDPOINT', 'STRIPE_SECRET_KEY', '/api/health', 'product_funnel_events']) {
  assert.ok(runbook.includes(marker), `runbook missing: ${marker}`);
}

console.log('Evidence instrumentation contract verified.');
