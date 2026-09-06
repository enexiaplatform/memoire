import { readFileSync, writeFileSync } from 'node:fs';
import JSZip from 'jszip';

/**
 * The real-use validation baseline.
 *
 * One deterministic developer report answering: how is Memoire actually being
 * used, and is the commercial intelligence loop becoming more useful over time?
 *
 * ## Why this is a script and not a screen
 *
 * Every number here already exists. Capture counts its own facts on the device,
 * linkage readiness is derived on Review, learning strength comes out of the
 * same function the product shows. What was missing was somewhere to read them
 * all at once, on a date, without a person having to click through five
 * surfaces and write the numbers down. That is a developer question, so it gets
 * a developer answer - not a route, not a dashboard, not a stored table.
 *
 * ## The input
 *
 * The archive the product already produces: Settings > Export & Delete. It
 * carries `localBrowserData` (every `memoire.*` key, including the capture
 * counters that never leave the device) and `cloudData`. Nothing new is
 * collected, no endpoint is called, and the file never leaves the machine.
 *
 *   npm run report:product-validation -- --export ~/Downloads/memoire-export-2026-09-06.zip
 *   npm run report:product-validation -- --export archive.json --json baseline.local.json
 *
 * ## The rule this file is built around
 *
 * A rate computed from four observations is not a rate. Every ratio below is
 * gated behind an observation floor and prints "not enough observation yet"
 * instead of a number it cannot support - because the whole point of taking a
 * baseline is to compare it with a later one, and a ruler that reports noise
 * today will report a false improvement in a month.
 */

// ------------------------------------------------------------------ arguments

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : '';
};

const exportPath = option('export');
const jsonOut = option('json');

if (!exportPath) {
  console.error(`Usage: npm run report:product-validation -- --export <memoire-export.zip|.json> [--json out.local.json]

Produce the archive from the product: Settings > Export & Delete > Export workspace.
Nothing is uploaded; the file is read locally and only counts are printed.`);
  process.exit(1);
}

// ---------------------------------------------------------------- observation
//
// How much use a metric needs before its ratio means anything. Deliberately
// round and deliberately conservative: these exist to stop the first fortnight
// of use being reported as a trend.
const OBSERVATION_FLOORS = {
  /** Captures before acceptance / edit / ignore rates are quoted. */
  capture: 20,
  /** Scope resolutions before the automatic / correction rates are quoted. */
  scope: 20,
  /** Post-4.1 activities before a new-record link rate is quoted. */
  newRecords: 10,
};

/**
 * The day the capture path started carrying a confirmed commercial scope into
 * the activity writer. Records written before it had no way to be linked at
 * creation, so they are reported separately rather than averaged in.
 */
const LINKAGE_SHIPPED_ON = '2026-09-06';

// ------------------------------------------------------------- browser shim
//
// Several canonical modules read `window` at import time. The archive is the
// only data source; this shim exists so importing them does not require a
// browser, and it is deliberately empty so nothing can be read from it.
const memoryStore = new Map();
const storage = {
  getItem: (key) => (memoryStore.has(key) ? memoryStore.get(key) : null),
  setItem: (key, value) => { memoryStore.set(key, String(value)); },
  removeItem: (key) => { memoryStore.delete(key); },
  clear: () => memoryStore.clear(),
  key: (index) => [...memoryStore.keys()][index] ?? null,
  get length() { return memoryStore.size; },
};
globalThis.window = {
  localStorage: storage,
  dispatchEvent: () => true,
  addEventListener: () => {},
  removeEventListener: () => {},
};
globalThis.localStorage = storage;
globalThis.CustomEvent = class CustomEvent {
  constructor(type, init) { this.type = type; this.detail = init?.detail; }
};

const { captureFactRates } = await import('../src/services/captureFactMetrics.ts');
const { derivePersonalLearning } = await import('../src/domain/commercialLearning/derivePersonalLearning.ts');
const { buildCommercialDataReadiness } = await import('../src/domain/commercialLearning/commercialDataReadiness.ts');
const { projectCurrentEvidence } = await import('../src/domain/commercialKernel/commercialEvidence.ts');
const { evaluateCommercialPolicies } = await import('../src/domain/commercialKernel/policyEngine.ts');
const { rankRecommendations } = await import('../src/domain/commercialKernel/rankRecommendations.ts');
const { resolveCommercialThreads } = await import('../src/domain/commercialKernel/deriveThreads.ts');
const { mergePlanCommitments } = await import('../src/domain/commercialKernel/derivePlanCommitments.ts');
const { DELTA_WINDOW_DAYS } = await import('../src/domain/commercialKernel/deriveDelta.ts');
const { isAtLeast } = await import('../src/domain/commercialLearning/learningPatterns.ts');

// -------------------------------------------------------------------- input

async function readArchive(path) {
  const raw = readFileSync(path);
  if (path.toLowerCase().endsWith('.zip')) {
    const zip = await JSZip.loadAsync(raw);
    const entry = zip.file('memoire-workspace-export.json')
      || zip.file(Object.keys(zip.files).find((name) => name.endsWith('.json')));
    if (!entry) throw new Error('The archive contains no workspace JSON.');
    return JSON.parse(await entry.async('string'));
  }
  return JSON.parse(raw.toString('utf8'));
}

const archive = await readArchive(exportPath);
const local = archive.localBrowserData || {};
const table = (key) => {
  const value = local[`memoire.${key}.v1`];
  return Array.isArray(value) ? value : [];
};

const activities = table('salesActivities');
const opportunities = table('opportunities');
const stakeholders = table('stakeholders');
const objections = table('objections');
const quotes = table('quotes');
const commitmentsLedger = table('commercialCommitments');
const evidence = table('commercialEvidence');
const events = table('commercialEvents');
const outcomes = table('opportunityOutcomes');
const planItems = table('planItems');
const threadsStored = table('commercialThreads');
const valueOutcomes = table('commercialValueOutcomes');
const captureMetrics = local['memoire.captureFactMetrics.v1'] || null;

const today = new Date();
const todayKey = today.toISOString().slice(0, 10);

// ------------------------------------------------------------------ helpers

const pct = (top, bottom) => (bottom > 0 ? Math.round((top / bottom) * 100) : null);

/** A ratio, or an honest refusal when there is not enough behind it. */
function rate(top, bottom, floor) {
  if (bottom < floor) return { value: null, observed: bottom, floor, enough: false };
  return { value: pct(top, bottom), observed: bottom, floor, enough: true };
}

const showRate = (label, ratio, detail = '') => {
  if (!ratio.enough) {
    console.log(`  ${label.padEnd(34)} not enough observation yet (${ratio.observed}/${ratio.floor})`);
    return;
  }
  console.log(`  ${label.padEnd(34)} ${String(ratio.value).padStart(3)}%${detail ? `  ${detail}` : ''}`);
};

const count = (label, value, detail = '') =>
  console.log(`  ${label.padEnd(34)} ${String(value).padStart(3)}${detail ? `  ${detail}` : ''}`);

const sumValues = (record) => Object.values(record || {}).reduce((total, n) => total + (n || 0), 0);

const heading = (text) => console.log(`\n${text}\n${'-'.repeat(text.length)}`);

// ------------------------------------------------------------------- report

const report = { baselineDate: todayKey, exportedAt: archive.exportedAt || null };

console.log('MEMOIRE - REAL-USE VALIDATION BASELINE');
console.log(`Baseline date   ${todayKey}`);
console.log(`Archive exported ${archive.exportedAt || 'unknown'}`);
console.log(`Workspace mode   ${archive.mode || 'unknown'}`);
console.log('\nCounts and categories only. No customer, deal, person or note content is read.');

// ------------------------------------------------------------------ 1 capture

heading('1. CAPTURE');

if (!captureMetrics) {
  console.log('  No capture counters in this archive.');
  console.log('  These are device-local by design - they never leave the browser they were');
  console.log('  counted in - so an archive exported from a different device, or from the');
  console.log('  cloud copy alone, will not carry them. Nothing is inferred from that.');
  report.capture = { available: false };
} else {
  const rates = captureFactRates(captureMetrics);
  const proposed = sumValues(captureMetrics.proposed);
  const accepted = sumValues(captureMetrics.accepted);
  const edited = sumValues(captureMetrics.edited);
  const ignored = sumValues(captureMetrics.ignored);
  const alreadyRecorded = sumValues(captureMetrics.alreadyRecorded);

  count('captures', captureMetrics.captures);
  count('captures with no facts', captureMetrics.capturesWithNoFacts);
  count('review sets saved', captureMetrics.reviewsSaved);
  count('facts proposed', proposed);
  count('facts accepted', accepted);
  count('facts edited', edited);
  count('facts ignored', ignored);
  count('already recorded', alreadyRecorded);
  count('unsupported findings', captureMetrics.unsupported);
  count('save failures', captureMetrics.saveFailures);

  const floor = OBSERVATION_FLOORS.capture;
  showRate('acceptance rate', rate(accepted, proposed, floor), 'accepted / proposed');
  showRate('edit rate', rate(edited, accepted, floor), 'edited / accepted');
  showRate('ignore rate', rate(ignored, proposed, floor), 'ignored / proposed');
  showRate('useful capture rate', rate(captureMetrics.captures - captureMetrics.capturesWithNoFacts, captureMetrics.captures, floor));

  const kinds = new Set([...Object.keys(captureMetrics.proposed || {}), ...Object.keys(captureMetrics.accepted || {})]);
  if (kinds.size > 0) {
    console.log('\n  by fact kind                    proposed  accepted  edited  ignored');
    for (const kind of [...kinds].sort()) {
      console.log(`    ${kind.padEnd(28)}${String(captureMetrics.proposed?.[kind] || 0).padStart(8)}`
        + `${String(captureMetrics.accepted?.[kind] || 0).padStart(10)}`
        + `${String(captureMetrics.edited?.[kind] || 0).padStart(8)}`
        + `${String(captureMetrics.ignored?.[kind] || 0).padStart(9)}`);
    }
  }

  report.capture = {
    available: true,
    captures: captureMetrics.captures,
    capturesWithNoFacts: captureMetrics.capturesWithNoFacts,
    proposed, accepted, edited, ignored, alreadyRecorded,
    unsupported: captureMetrics.unsupported,
    saveFailures: captureMetrics.saveFailures,
    byKind: { proposed: captureMetrics.proposed, accepted: captureMetrics.accepted, edited: captureMetrics.edited, ignored: captureMetrics.ignored },
    rates: {
      acceptance: rate(accepted, proposed, floor),
      edit: rate(edited, accepted, floor),
      ignore: rate(ignored, proposed, floor),
      usefulCapture: rate(captureMetrics.captures - captureMetrics.capturesWithNoFacts, captureMetrics.captures, floor),
    },
    // Kept because it is the ratio family the AI decision was always going to
    // be argued from; unused here beyond confirming it still computes.
    libraryRates: Boolean(rates),
  };
}

// -------------------------------------------------------------------- 2 scope

heading('2. COMMERCIAL SCOPE  (introduced 4.1 - little observation time)');

const scope = captureMetrics?.scopeResolution || {};
const scopeTotal = sumValues(scope);
for (const state of ['exact', 'strong_match', 'multiple_matches', 'unresolved', 'corrected']) {
  count(state, scope[state] || 0);
}
count('total resolutions', scopeTotal);

const automatic = (scope.exact || 0) + (scope.strong_match || 0);
const scopeFloor = OBSERVATION_FLOORS.scope;
showRate('automatic resolution rate', rate(automatic, scopeTotal, scopeFloor), 'exact + strong_match');
showRate('ambiguity rate', rate(scope.multiple_matches || 0, scopeTotal, scopeFloor));
showRate('correction rate', rate(scope.corrected || 0, scopeTotal, scopeFloor), '<- the trust metric');
console.log('\n  A high automatic rate is only good while the correction rate stays low.');
console.log('  Confidently wrong is worse than honestly unresolved.');

report.scope = {
  counts: { ...scope },
  total: scopeTotal,
  automatic: rate(automatic, scopeTotal, scopeFloor),
  ambiguity: rate(scope.multiple_matches || 0, scopeTotal, scopeFloor),
  correction: rate(scope.corrected || 0, scopeTotal, scopeFloor),
};

// ------------------------------------------------------------------ 3 linkage

heading('3. LINKAGE');

const commitments = mergePlanCommitments(commitmentsLedger, { activities, planItems });
const learning = derivePersonalLearning({
  opportunities, opportunityOutcomes: outcomes, activities, stakeholders, objections,
  quotes, commitments: commitmentsLedger, evidence, today,
});
const readiness = buildCommercialDataReadiness({
  activities, opportunities, stakeholders, learning,
  evidenceCount: evidence.length,
  commitmentsCount: commitmentsLedger.length,
  eventHistoryCount: events.length,
});

count('activities', readiness.activitiesTotal);
count('account-linked', readiness.activitiesAccountLinked);
count('on accounts that have a deal', readiness.activitiesLinkableToOpportunity);
count('opportunity-linked', readiness.activitiesOpportunityLinked);
showRate(
  'opportunity-link rate',
  rate(readiness.activitiesOpportunityLinked, readiness.activitiesLinkableToOpportunity, 1),
  'of touches that could be linked',
);
count('open opportunities', readiness.openOpportunities);
count('open deals with a person on them', readiness.openOpportunitiesWithInvolvement);

const newRecords = activities.filter((activity) => (activity.createdAt || '').slice(0, 10) >= LINKAGE_SHIPPED_ON);
const newLinked = newRecords.filter((activity) => activity.linkStatus === 'Linked' && activity.linkedOpportunityId);
console.log(`\n  Records written on or after ${LINKAGE_SHIPPED_ON} (the new capture path):`);
count('new activities', newRecords.length);
count('  of those, opportunity-linked', newLinked.length);
showRate('new-record link rate', rate(newLinked.length, newRecords.length, OBSERVATION_FLOORS.newRecords));
console.log('  Older records were written by a path that could not carry a link at all,');
console.log('  so they are reported separately and never averaged into the new rate.');

report.linkage = {
  ...readiness,
  patternReadiness: undefined,
  newRecords: {
    since: LINKAGE_SHIPPED_ON,
    total: newRecords.length,
    opportunityLinked: newLinked.length,
    rate: rate(newLinked.length, newRecords.length, OBSERVATION_FLOORS.newRecords),
  },
};

// ----------------------------------------------------------------- 4 evidence

heading('4. COMMERCIAL EVIDENCE');

const projection = projectCurrentEvidence(evidence);
const byDirection = { positive: 0, negative: 0, neutral: 0 };
for (const record of evidence) byDirection[record.direction] = (byDirection[record.direction] || 0) + 1;
const fromCapture = evidence.filter((record) => record.sourceType === 'capture').length;
const scopesWithCurrent = projection.currentByScope.size;

count('technical evidence records', evidence.length);
count('  positive', byDirection.positive);
count('  negative', byDirection.negative);
count('  neutral', byDirection.neutral);
count('superseded by a later record', projection.supersededIds.size);
count('scopes with current evidence', scopesWithCurrent, '(deal, or customer when no deal)');
count('created through Capture', fromCapture);

report.evidence = {
  total: evidence.length,
  byDirection,
  superseded: projection.supersededIds.size,
  scopesWithCurrentEvidence: scopesWithCurrent,
  createdThroughCapture: fromCapture,
};

// -------------------------------------------------------------------- 5 delta

heading('5. DELTA COVERAGE');

const occurredAts = events.map((event) => event.occurredAt).filter(Boolean).sort();
const windowStart = new Date(today.getTime() - DELTA_WINDOW_DAYS * 86_400_000).toISOString();
const inWindow = events.filter((event) => (event.occurredAt || '') >= windowStart);
const opportunitiesWithEvents = new Set(
  events.map((event) => event.opportunityId).filter(Boolean),
);

count('commercial events', events.length);
console.log(`  ${'earliest observed event'.padEnd(34)} ${occurredAts[0] ? occurredAts[0].slice(0, 10) : 'none - no observed history yet'}`);
count(`events in the ${DELTA_WINDOW_DAYS}-day window`, inWindow.length);
count('deals with observed transitions', opportunitiesWithEvents.size);
count('deals with only current conditions', Math.max(0, readiness.openOpportunities - opportunitiesWithEvents.size));
console.log('\n  An empty log is not an empty history: field-level transitions only exist');
console.log('  from the day instrumentation shipped, and Delta says so rather than');
console.log('  inferring a change from a record having been touched.');

report.delta = {
  events: events.length,
  earliestObservedEvent: occurredAts[0] || null,
  windowDays: DELTA_WINDOW_DAYS,
  eventsInWindow: inWindow.length,
  opportunitiesWithObservedTransitions: opportunitiesWithEvents.size,
};

// ---------------------------------------------------------------------- 6 nba

heading('6. NEXT BEST ACTION');

const threads = resolveCommercialThreads({
  storedThreads: threadsStored, opportunities, activities, quotes, commitments,
});
const recommendations = evaluateCommercialPolicies({
  threads, commitments, opportunities, quotes, evidence, today,
});
const ranking = rankRecommendations({
  recommendations, opportunities, quotes, commitments, objections, today,
});

const byReason = {};
for (const item of recommendations) byReason[item.reasonCode] = (byReason[item.reasonCode] || 0) + 1;
const subjects = new Set(ranking.ranked.map((item) => item.opportunityId || item.threadId).filter(Boolean));

count('recommendations produced', recommendations.length);
count('ranked', ranking.ranked.length);
count('suppressed', ranking.suppressed.length);
count('deals/threads with a ranked action', subjects.size);
if (Object.keys(byReason).length > 0) {
  console.log('\n  by reason code');
  for (const [reasonCode, n] of Object.entries(byReason).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${reasonCode.padEnd(38)}${String(n).padStart(4)}`);
  }
}

const withRecommendation = valueOutcomes.filter((item) => item.recommendationId).length;
const byAssessment = {};
for (const item of valueOutcomes) byAssessment[item.userAssessment] = (byAssessment[item.userAssessment] || 0) + 1;

console.log('\n  Did the user act on a recommendation?');
console.log('    Not currently measurable. Nothing records whether a shown action was done.');
console.log('  What is recorded is the value ledger, which is a different question:');
count('  value verdicts recorded', valueOutcomes.length);
count('  of those tied to a recommendation', withRecommendation);
for (const [assessment, n] of Object.entries(byAssessment)) count(`    ${assessment}`, n);

report.nba = {
  produced: recommendations.length,
  ranked: ranking.ranked.length,
  suppressed: ranking.suppressed.length,
  subjectsWithRankedAction: subjects.size,
  byReasonCode: byReason,
  userActionTracking: 'not_currently_measurable',
  valueLedger: { total: valueOutcomes.length, tiedToRecommendation: withRecommendation, byAssessment },
};

// ----------------------------------------------------------------- 7 learning

heading('7. COMMERCIAL LEARNING');

const strengthCounts = { insufficient: 0, early: 0, developing: 0, established: 0 };
console.log('  pattern                              sample  exposed  compare  strength      observable from');
for (const pattern of learning.patterns) {
  strengthCounts[pattern.strength] += 1;
  const meaningful = pattern.direction !== 'none' ? ' *' : '';
  console.log(
    `  ${pattern.patternId.padEnd(36)}`
    + `${String(pattern.sample).padStart(6)}`
    + `${String(pattern.exposed.deals).padStart(9)}`
    + `${String(pattern.comparison.deals).padStart(9)}`
    + `  ${(pattern.strength + meaningful).padEnd(14)}`
    + `${pattern.diagnostics.observableFrom || 'never recorded'}`,
  );
}
console.log('\n  * = a difference large enough to report');
count('insufficient', strengthCounts.insufficient);
count('early', strengthCounts.early);
count('developing', strengthCounts.developing);
count('established', strengthCounts.established);
count('closed deals comparable at all', learning.closedDealsConsidered);

report.learning = {
  closedDealsConsidered: learning.closedDealsConsidered,
  strengthCounts,
  patterns: learning.patterns.map((pattern) => ({
    patternId: pattern.patternId,
    sample: pattern.sample,
    exposed: pattern.exposed,
    comparison: pattern.comparison,
    strength: pattern.strength,
    observableFrom: pattern.diagnostics.observableFrom,
    meaningfulEffect: pattern.direction !== 'none',
  })),
};

// ------------------------------------------------------- decision readiness

heading('REAL-USE READINESS');

/**
 * Review gates, not feature triggers.
 *
 * Each one answers "do we have enough evidence to sit down and look at this
 * question", and nothing here decides what to build. The rules are printed with
 * their inputs so a reader can disagree with the rule rather than the verdict.
 */
const gates = [];

const captureObserved = captureMetrics?.captures || 0;
const editRate = report.capture?.rates?.edit;
const ignoreRate = report.capture?.rates?.ignore;
const unsupportedPerCapture = captureObserved > 0 ? (captureMetrics.unsupported / captureObserved) : 0;
gates.push({
  id: 'llm_capture_review',
  question: 'Is a bounded optional-LLM capture experiment worth reviewing?',
  ready: captureObserved >= OBSERVATION_FLOORS.capture
    && Boolean(
      (editRate?.enough && editRate.value >= 40)
      || (ignoreRate?.enough && ignoreRate.value >= 30)
      || unsupportedPerCapture >= 0.5,
    ),
  because: captureObserved < OBSERVATION_FLOORS.capture
    ? `only ${captureObserved} captures; ${OBSERVATION_FLOORS.capture} needed before the parser can be judged`
    : 'edit, ignore and unsupported rates are all within what a deterministic pattern set can absorb',
});

gates.push({
  id: 'linkage_review',
  question: 'Does the capture linkage UX need another look?',
  ready: scopeTotal >= OBSERVATION_FLOORS.scope
    && Boolean(report.scope.correction.enough && report.scope.correction.value >= 20),
  because: scopeTotal < OBSERVATION_FLOORS.scope
    ? `only ${scopeTotal} scope resolutions; ${OBSERVATION_FLOORS.scope} needed`
    : 'correction rate is low enough that the resolver is not confidently wrong',
});

gates.push({
  id: 'focus_planner_review',
  question: 'Should Today be consolidated into a focus planner?',
  ready: false,
  because: 'needs real usage observation - nothing measures how Today is used, and '
    + 'this report deliberately does not add tracking to find out',
});

const developingOrBetter = learning.patterns.filter((pattern) => isAtLeast(pattern.strength, 'developing')).length;
gates.push({
  id: 'commercial_learning_review',
  question: 'Is expanding Commercial Learning worth reviewing?',
  ready: developingOrBetter >= 1,
  because: `${developingOrBetter} of ${learning.patterns.length} patterns have reached developing; `
    + 'the Phase 4 gate is at least one',
});

for (const gate of gates) {
  console.log(`\n  ${gate.question}`);
  console.log(`    ${gate.ready ? 'READY TO REVIEW' : 'not yet'} - ${gate.because}`);
}

const anyReady = gates.some((gate) => gate.ready);
console.log(`\n  Suggested product decision:`);
console.log(anyReady
  ? '    At least one question has enough evidence to review. Look at the gates marked READY.'
  : '    Continue real usage collection. No question has enough evidence behind it yet.');

report.gates = gates;
report.suggestedDecision = anyReady ? 'review_ready_gates' : 'continue_usage_collection';

// -------------------------------------------------------------------- output

if (jsonOut) {
  writeFileSync(jsonOut, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\nWrote ${jsonOut}`);
}
