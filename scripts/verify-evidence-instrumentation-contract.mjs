import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

// The deep-loop events were page opens and copy-button clicks. They measured
// which rooms the seller walked into, which told us nothing about whether the
// product worked - and most of them named destinations that no longer exist,
// so keeping them would have left a funnel reading as a collapse in usage.
// The taxonomy is now behaviour-centric; `verify-product-analytics-contract.mjs`
// owns the three-way sync between client, endpoint and table.

// 1. Every behaviour event has a real call site. A declared event with no
// emitter lies to the funnel exactly as loudly as a dropped one.
//
// This list names the file each event is emitted from, which is worth pinning
// and is not the same as checking that the taxonomy is emitted at all. It
// cannot be: a hand-written list only notices the events somebody thought to
// add to it, and this one omitted `capture_saved` and the three activation
// events that had no emitter anywhere in the app for the whole of the free
// preview. That check is derived from the taxonomy instead, and lives in
// `verify-product-analytics-contract.mjs` beside the taxonomy itself.
const CALL_SITES = {
  capture_saved: 'src/services/salesActivityStore.ts',
  first_thread_linked: 'src/services/salesActivityStore.ts',
  commitment_created: 'src/features/commitments/useCommitmentLedger.ts',
  commitment_completed: 'src/features/commitments/useCommitmentLedger.ts',
  commitment_rescheduled: 'src/features/commitments/useCommitmentLedger.ts',
  commercial_risk_viewed: 'src/features/threads/CommercialRiskPanel.tsx',
  commercial_risk_acted_on: 'src/features/threads/CommercialRiskPanel.tsx',
  backup_exported: 'src/features/settings/ExportTab.tsx',
  restore_completed: 'src/features/settings/ExportTab.tsx',
};
for (const [eventName, file] of Object.entries(CALL_SITES)) {
  const source = read(file);
  assert.ok(
    new RegExp(`track(?:ProductEvent|FirstTimeEvent)\\(\\s*'${eventName}'`).test(source),
    `${file} missing call site for ${eventName}`,
  );
}

// The four activation events that no longer have a hand-written call site.
// They used to be fired on the line below their core event, and that is the
// arrangement that let three of the five go missing - `review_completed` alone
// has six call sites, each one a chance to forget the line under it. They are
// now paired once, so the pairing is what gets pinned.
{
  const pairs = read('src/utils/activationEvents.ts');
  for (const [trigger, activation] of [
    ['capture_saved', 'first_capture_saved'],
    ['commitment_created', 'first_commitment_created'],
    ['commitment_completed', 'first_commitment_completed'],
    ['review_completed', 'first_review_completed'],
  ]) {
    assert.ok(
      new RegExp(`${trigger}:\\s*'${activation}'`).test(pairs),
      `ACTIVATION_OF no longer pairs ${trigger} with ${activation} - that step of the funnel goes dark`,
    );
  }
}

// 2. Analytics goes to its own endpoint, not through lead capture.
const clientAnalytics = read('src/utils/productAnalytics.ts');
assert.ok(clientAnalytics.includes("'/api/product-events'"), 'analytics must post to its own endpoint');
assert.equal(
  read('api/request-access.ts').includes('PRODUCT_EVENTS'),
  false,
  'the lead endpoint must no longer carry the analytics allowlist',
);

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
for (const marker of ['VITE_APP_URL', 'VITE_CLIENT_LOG_ENDPOINT', 'LEMONSQUEEZY_API_KEY', '/api/health', 'product_events']) {
  assert.ok(runbook.includes(marker), `runbook missing: ${marker}`);
}
// The runbook must not send an operator shopping for an AI key Memoire does not
// use. It may name the keys - it names them to forbid them - so the contract
// checks for the prohibition rather than for the absence of the strings.
assert.ok(
  runbook.includes('No AI configuration is required'),
  'runbook must state that no AI configuration is required',
);
assert.ok(
  runbook.includes('Do not** set') || runbook.includes('Do **not** set'),
  'runbook must explicitly tell the operator not to set AI provider keys',
);
assert.equal(
  runbook.includes('capture-ai-classify'),
  false,
  'runbook still references the removed capture AI endpoint',
);

console.log('Evidence instrumentation contract verified.');
