import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import {
  derivePersonalLearning,
} from '../src/domain/commercialLearning/derivePersonalLearning.ts';
import {
  evidenceStrengths,
  learningPatterns,
  learningSampleFloors,
  MEANINGFUL_EFFECT_POINTS,
  strengthFor,
} from '../src/domain/commercialLearning/learningPatterns.ts';
import { personalEvidenceFor } from '../src/domain/commercialLearning/personalEvidenceFor.ts';
import { rankRecommendations } from '../src/domain/commercialKernel/rankRecommendations.ts';
import { profileMinimums } from '../src/utils/operatorProfile.ts';

/*
 * Personal Commercial Learning describes what a seller's own records contain.
 *
 * It is one short step from there to a product that tells people why they win,
 * on thirteen deals, in the confident voice of something that measured it. The
 * assertions here are the ones whose loss would take that step: the sample
 * floors, the missing-is-not-false rule, the chronology gates, the associative
 * voice, and the promise that nothing measured here reorders a single thing on
 * anybody's morning.
 */

const codeOf = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');
const readCode = (file) => codeOf(readFileSync(file, 'utf8'));

const registryCode = readCode('src/domain/commercialLearning/learningPatterns.ts');
const engineCode = readCode('src/domain/commercialLearning/derivePersonalLearning.ts');
const seamCode = readCode('src/domain/commercialLearning/personalEvidenceFor.ts');
const panelCode = readCode('src/features/reviews/PersonalLearningPanel.tsx');

const TODAY = new Date('2026-09-06T00:00:00.000Z');
const ACCOUNT = 'Rohto Pharma';
const day = (offset) => new Date(TODAY.getTime() + offset * 86_400_000).toISOString().slice(0, 10);
const stamp = (key) => `${key}T00:00:00.000Z`;

const opportunity = (id, patch = {}) => ({
  id, accountName: ACCOUNT, opportunityName: `Deal ${id}`, stage: 'Proposal',
  estimatedValue: 100_000_000, currency: 'VND', expectedClosePeriod: 'Q3 2026',
  productOrSolution: '', decisionMaker: '', budgetOwner: '', procurementPath: '',
  technicalCriteria: '', nextAction: '', nextActionDate: '', evidence: '', missingContext: '',
  objectionDebt: '', forecastEvidenceCategory: 'Defensible', decisionRecommendation: 'Monitor',
  status: 'Won', createdAt: stamp(day(-200)), updatedAt: stamp(day(-200)), storageMode: 'local',
  ...patch,
});

const outcome = (opportunityId, won, closedOn = day(-30)) => ({
  id: `out-${opportunityId}`, opportunityId, accountName: ACCOUNT,
  opportunityName: `Deal ${opportunityId}`, outcome: won ? 'Won' : 'Lost', outcomeDate: closedOn,
  finalAmount: 100_000_000, currency: 'VND', forecastEvidenceCategoryBeforeOutcome: 'Defensible',
  decisionRecommendationBeforeOutcome: 'Defend', stageBeforeOutcome: 'Proposal',
  pipelineProbabilityBeforeOutcome: null, reasonCategory: 'Technical fit', reasonText: '',
  createdAt: stamp(closedOn), updatedAt: stamp(closedOn), storageMode: 'local',
});

const commitment = (opportunityId, patch = {}) => ({
  id: `c-${opportunityId}`, userId: null, threadId: '', accountId: '', accountName: ACCOUNT,
  opportunityId, commitmentParty: 'customer', ownerLabel: 'Purchasing', commitmentText: 'Decide',
  originalDueDate: day(-35), currentDueDate: day(-35), silenceThresholdDays: 3, status: 'open',
  impactType: 'none', dueDateHistory: [], sourceType: 'manual',
  createdAt: stamp(day(-40)), updatedAt: stamp(day(-40)), ...patch,
});

const evidenceRecord = (opportunityId, patch = {}) => ({
  id: `ev-${opportunityId}`, userId: null, accountName: ACCOUNT, accountId: '', opportunityId,
  threadId: null, category: 'technical_outcome', direction: 'positive', summary: 'Trial passed',
  evidenceText: 'Trial passed.', observedAt: day(-40), recordedAt: stamp(day(-40)),
  sourceActivityId: null, sourceType: 'capture', sourceId: null, sourceUrl: null,
  sourceUpdatedAt: null, createdAt: stamp(day(-40)), updatedAt: stamp(day(-40)), ...patch,
});

const derive = (patch = {}) => derivePersonalLearning({
  opportunities: [], opportunityOutcomes: [], activities: [], stakeholders: [], objections: [],
  quotes: [], commitments: [], evidence: [], today: TODAY, ...patch,
});

const patternOf = (result, id) => result.patterns.find((item) => item.patternId === id);

/** `wins` won and `losses` lost, the first `exposed` of them carrying a promise. */
function commitmentBook(exposedWins, exposedLosses, plainWins, plainLosses) {
  const opportunities = [];
  const outcomes = [];
  const commitments = [];
  const push = (won, exposed) => {
    const id = `opp-${opportunities.length}`;
    opportunities.push(opportunity(id, { status: won ? 'Won' : 'Lost' }));
    outcomes.push(outcome(id, won));
    if (exposed) commitments.push(commitment(id));
  };
  for (let i = 0; i < exposedWins; i += 1) push(true, true);
  for (let i = 0; i < exposedLosses; i += 1) push(false, true);
  for (let i = 0; i < plainWins; i += 1) push(true, false);
  for (let i = 0; i < plainLosses; i += 1) push(false, false);
  // At least one commitment must exist or the pattern is not observable at all.
  if (commitments.length === 0) commitments.push(commitment('opp-none'));
  return { opportunities, opportunityOutcomes: outcomes, commitments };
}

// ---------------------------------------------------------------- Contract A
// Learning derives. It owns no store, writes nothing, and holds no clock.
{
  for (const forbidden of ['localStorage', 'supabase', 'fetch(', 'save', 'upsert', 'delete']) {
    assert.equal(
      `${registryCode}${engineCode}${seamCode}`.toLowerCase().includes(forbidden.toLowerCase()),
      false,
      `learning reached a write path or the network: ${forbidden}`,
    );
  }
  for (const line of engineCode.split('\n')) {
    const match = line.match(/^import\s+(type\s+)?.*from\s+'([^']+)'/);
    if (!match) continue;
    const [, isType, specifier] = match;
    if (!specifier.includes('/services/')) continue;
    assert.ok(isType, `the learning engine imports a service at runtime (${specifier}); types only`);
  }

  const workspace = commitmentBook(6, 6, 6, 6);
  const before = JSON.stringify(workspace);
  derive(workspace);
  assert.equal(JSON.stringify(workspace), before, 'learning must not mutate its inputs');
}

// ---------------------------------------------------------------- Contract B
// It is not a second recommendation engine.
{
  for (const forbidden of ['reasonCode', 'recommendedAction', 'Recommendation', 'severity', 'href']) {
    assert.equal(
      `${registryCode}${engineCode}`.includes(forbidden), false,
      `learning is producing recommendations of its own: ${forbidden}`,
    );
  }
  // The seam may name recommendations; it may not invent one.
  assert.equal(
    /recommendedAction|reasonText\s*[:=]/.test(seamCode), false,
    'the seam must attach evidence to existing recommendations, never author an action',
  );
}

// ---------------------------------------------------------------- Contract C
// Nothing derived here is persisted as truth.
{
  const migrations = readdirSync('supabase/migrations')
    .filter((file) => file.endsWith('.sql'))
    .map((file) => readFileSync(`supabase/migrations/${file}`, 'utf8'))
    .join('\n')
    .toLowerCase();
  for (const forbidden of ['learning_insight', 'learning_pattern', 'personal_learning', 'commercial_learning']) {
    assert.equal(
      migrations.includes(forbidden), false,
      `a learning table appeared in the schema: ${forbidden}`,
    );
  }
  const collections = readCode('src/services/workspaceData.ts');
  assert.equal(
    /learning/i.test(collections), false,
    'learning must not become a stored workspace collection',
  );
}

// ---------------------------------------------------------------- Contract D
// The floors are in code, and they are anchored to numbers already defended.
{
  assert.equal(learningSampleFloors.early.perGroup, profileMinimums.touchPatternPerSide);
  assert.equal(learningSampleFloors.established.perGroup, profileMinimums.winRateReliable);
  assert.ok(
    learningSampleFloors.early.total < learningSampleFloors.developing.total
    && learningSampleFloors.developing.total < learningSampleFloors.established.total,
    'the ladder must be ordered',
  );
  assert.ok(
    learningSampleFloors.early.total > learningSampleFloors.early.perGroup * 2,
    'the total floor must ask for more than a bare pair of minimum groups',
  );
  assert.ok(MEANINGFUL_EFFECT_POINTS >= 10, 'a smaller difference than this is one deal of noise');

  // And they bite.
  assert.equal(patternOf(derive(commitmentBook(2, 0, 0, 2)), 'customer_commitment_before_close').strength, 'insufficient');
  assert.equal(patternOf(derive(commitmentBook(10, 2, 3, 9)), 'customer_commitment_before_close').strength, 'developing');
}

// ---------------------------------------------------------------- Contract E
// Both sides, or it is not a comparison.
{
  assert.equal(strengthFor(29, 1), 'insufficient', '29 against 1 is not a comparison');
  assert.equal(strengthFor(100, 2), 'insufficient');
  const lopsided = patternOf(derive(commitmentBook(20, 9, 1, 0)), 'customer_commitment_before_close');
  assert.equal(lopsided.strength, 'insufficient');
  assert.equal(lopsided.direction, 'none');
  assert.ok(
    /Math\.min\(exposedDeals, comparisonDeals\)/.test(registryCode),
    'strength must be decided by the smaller group, not only by the total',
  );
}

// ---------------------------------------------------------------- Contract F
// Missing history is not evidence of absence.
{
  const workspace = commitmentBook(0, 0, 2, 2);
  // The only commitment in the workspace was written after both deals closed,
  // so nothing about them was observable.
  workspace.commitments = [commitment('opp-x', { createdAt: stamp(day(-5)) })];
  const pattern = patternOf(derive(workspace), 'customer_commitment_before_close');
  assert.equal(pattern.sample, 0, 'deals that closed before the instrument existed must be excluded');
  assert.equal(pattern.comparison.deals, 0, 'and must never be counted as the behaviour not happening');
  assert.ok(pattern.diagnostics.reasons.history_not_observable > 0);

  const none = patternOf(derive(commitmentBook(0, 0, 2, 2)), 'technical_acceptance_before_close');
  assert.equal(none.diagnostics.observableFrom, null);
  assert.equal(none.sample, 0);

  // A linkage gap is not an observed absence either. A quoted deal with no
  // activity linked to it has an unknown contact history, and reading that as
  // silence would manufacture the very finding the pattern exists to look for.
  assert.ok(
    /if \(linked\.length === 0\) return null;/.test(engineCode),
    'a deal with nothing linked to it must return unknown, not an empty history',
  );

  // The observability date is read off the records, never pinned to a release.
  assert.equal(
    /2026-0\d-\d\d/.test(engineCode), false,
    'the engine must not hardcode a "data complete since" date',
  );
  assert.ok(engineCode.includes('earliestDay'), 'observability must be derived from the records');
}

// ---------------------------------------------------------------- Contract G
// Nothing recorded after the outcome may describe the deal before it.
{
  const workspace = commitmentBook(0, 0, 1, 1);
  workspace.commitments = [
    commitment('opp-0', { createdAt: stamp(day(-40)) }),
    commitment('opp-1', { id: 'c-late', createdAt: stamp(day(-5)) }),
  ];
  const pattern = patternOf(derive(workspace), 'customer_commitment_before_close');
  assert.equal(pattern.exposed.deals, 1, 'the promise made after the close must not count');
  assert.equal(pattern.exposed.won, 1);

  // Evidence carries both a business date and a recording date, and both gate.
  const late = commitmentBook(0, 0, 1, 1);
  late.evidence = [
    evidenceRecord('opp-0'),
    evidenceRecord('opp-1', { id: 'ev-late', observedAt: day(-40), recordedAt: stamp(day(-2)) }),
  ];
  const technical = patternOf(derive(late), 'technical_acceptance_before_close');
  assert.equal(
    technical.exposed.deals, 1,
    'a record whose business date is early and whose recording date is late is still hindsight',
  );

  assert.ok(
    engineCode.includes('recordedAt') && engineCode.includes('closedOn'),
    'the engine must compare recording times against the outcome',
  );
}

// ---------------------------------------------------------------- Contract H
// Association, never cause.
{
  const CAUSAL = /\b(increases?|improves?|boosts?|causes?|leads? to|results? in|drives?|guarantees?|you should|always do)\b/i;
  const workspace = commitmentBook(10, 2, 3, 9);
  const result = derive(workspace);

  for (const pattern of result.patterns) {
    assert.ok(!CAUSAL.test(pattern.reading), `causal wording in a reading: ${pattern.reading}`);
    for (const limitation of pattern.limitations) {
      assert.ok(!CAUSAL.test(limitation), `causal wording in a limitation: ${limitation}`);
    }
  }

  const reported = patternOf(result, 'customer_commitment_before_close');
  assert.match(
    reported.reading, /in your recorded history/i,
    'a reported difference must name the history it came from',
  );
  assert.ok(
    reported.limitations.some((line) => /describes what happened rather than what caused it/i.test(line)),
    'a reported difference must say it is not a cause',
  );

  // The panel copy is held to the same voice.
  const visible = panelCode.match(/>[^<>{}]{12,}</g) || [];
  for (const line of visible) {
    assert.ok(!CAUSAL.test(line), `causal wording in the panel: ${line.trim()}`);
  }
}

// ---------------------------------------------------------------- Contract I
// The raw counts survive all the way to the surface.
{
  const pattern = patternOf(derive(commitmentBook(10, 2, 3, 9)), 'customer_commitment_before_close');
  assert.equal(pattern.exposed.won, 10);
  assert.equal(pattern.exposed.lost, 2);
  assert.equal(pattern.comparison.won, 3);
  assert.equal(pattern.comparison.lost, 9);
  assert.equal(pattern.supportingRecordIds.length, pattern.sample);
  assert.ok(pattern.diagnostics.usable >= 0 && typeof pattern.diagnostics.reasons === 'object');
  assert.ok(
    /exposed\.won/.test(panelCode) && /comparison\.lost/.test(panelCode),
    'the panel must show the counts, not only the rate',
  );
}

// ---------------------------------------------------------------- Contract J
// Strength is one of four words. There is no confidence percentage anywhere.
{
  assert.deepEqual([...evidenceStrengths], ['insufficient', 'early', 'developing', 'established']);
  for (const forbidden of ['confidence', 'probability', 'likelihood', 'pValue', 'significance']) {
    assert.equal(
      `${registryCode}${engineCode}`.toLowerCase().includes(forbidden.toLowerCase()), false,
      `learning grew a statistic it cannot justify: ${forbidden}`,
    );
  }
  for (const pattern of derive(commitmentBook(10, 2, 3, 9)).patterns) {
    assert.ok(evidenceStrengths.includes(pattern.strength));
  }
}

// ---------------------------------------------------------------- Contract K
// Relevance is typed, and it is the kernel's own map.
{
  assert.ok(
    seamCode.includes('recommendationRuleConcerns'),
    'the seam must reuse the kernel relevance map rather than keep a second copy',
  );
  for (const pattern of learningPatterns) {
    assert.ok(pattern.dimension, `${pattern.id} declares no dimension`);
  }
  assert.ok(
    /Record<EvidenceCategory|dimension: CommercialDimension/.test(registryCode),
    'the dimension must be the kernel vocabulary, not a string',
  );
}

// ---------------------------------------------------------------- Contract L
// Immature learning reaches nothing, and mature learning changes no order.
{
  const recommendation = (id, reasonCode) => ({
    id, reasonCode, reasonText: 'Something is true here.', sourceRecordIds: ['opp-0'],
    threshold: 1, severity: 'medium', recommendedAction: 'Do the thing.',
    calculatedAt: TODAY.toISOString(), accountName: ACCOUNT, opportunityId: `opp-${id}`,
    href: '/app/opportunities',
  });

  const mature = patternOf(derive(commitmentBook(10, 2, 3, 9)), 'customer_commitment_before_close');
  assert.equal(mature.strength, 'developing');

  const early = patternOf(derive(commitmentBook(3, 1, 2, 2)), 'customer_commitment_before_close');
  assert.equal(early.strength, 'early');
  assert.deepEqual(
    personalEvidenceFor([early], [recommendation('1', 'THREAD_SILENT')]), [],
    'an early pattern must not be quoted beside a recommendation',
  );

  const recommendations = [
    recommendation('1', 'THREAD_SILENT'),
    recommendation('2', 'OPPORTUNITY_WITHOUT_FUTURE_ACTION'),
    recommendation('3', 'QUOTE_EXPIRING'),
  ];
  const opportunities = recommendations.map((item) => opportunity(item.opportunityId, { status: 'Active' }));
  const rank = (personalEvidence) => rankRecommendations({
    recommendations, opportunities, quotes: [], commitments: [], objections: [],
    personalEvidence, today: TODAY,
  }).ranked.map((item) => item.id);

  assert.deepEqual(
    rank(personalEvidenceFor([mature], recommendations)),
    rank(undefined),
    'personal history must not reorder the kernel recommendations',
  );

  const quoted = personalEvidenceFor([mature], recommendations);
  assert.ok(quoted.length > 0, 'a matured, relevant pattern should still be quotable');
  for (const item of quoted) {
    assert.deepEqual(Object.keys(item).sort(), ['reading', 'recommendationIds']);
  }
  // Named individually rather than by a loose pattern: the file legitimately
  // contains the word "evidence" in every other line, and a check that matches
  // its own subject matter is a check that proves nothing.
  for (const dimension of ['urgency', 'unblocking', 'amountBase', 'compareRanked', 'rank:']) {
    assert.equal(
      seamCode.includes(dimension), false,
      `the seam must not touch a ranking dimension: ${dimension}`,
    );
  }
}

// ---------------------------------------------------------------- Contract M
// Canonical state wins. A recommendation the records contradict stays gone,
// whatever the seller's history says about behaviour of that kind.
{
  const won = opportunity('opp-closed', { status: 'Won' });
  const recommendation = {
    id: 'rec-closed', reasonCode: 'THREAD_SILENT', reasonText: 'Quiet for 21 days.',
    sourceRecordIds: ['opp-closed'], threshold: 10, severity: 'medium',
    recommendedAction: 'Make contact.', calculatedAt: TODAY.toISOString(), accountName: ACCOUNT,
    opportunityId: 'opp-closed', href: '/app/opportunities',
  };
  const mature = patternOf(derive(commitmentBook(10, 2, 3, 9)), 'customer_commitment_before_close');

  const result = rankRecommendations({
    recommendations: [recommendation], opportunities: [won], quotes: [], commitments: [],
    objections: [], personalEvidence: personalEvidenceFor([mature], [recommendation]), today: TODAY,
  });
  assert.equal(result.ranked.length, 0, 'a deal that is not running has no live work on it');
  assert.equal(result.suppressed.length, 1);
  assert.equal(result.suppressed[0].reason, 'opportunity_closed');
}

// ---------------------------------------------------------------- Contract N
// No AI, no external analytics.
{
  for (const file of [
    'src/domain/commercialLearning/learningPatterns.ts',
    'src/domain/commercialLearning/derivePersonalLearning.ts',
    'src/domain/commercialLearning/personalEvidenceFor.ts',
    'src/features/reviews/PersonalLearningPanel.tsx',
  ]) {
    const source = readFileSync(file, 'utf8').toLowerCase();
    for (const forbidden of ['openai', 'anthropic', 'embedding', 'fetch(', 'xmlhttprequest', 'segment.', 'amplitude', 'mixpanel']) {
      assert.equal(source.includes(forbidden), false, `${file} reaches a model or an analytics service: ${forbidden}`);
    }
  }
}

// ---------------------------------------------------------------- Contract O
// It lives on Review. There is no seventh destination.
{
  const routes = readCode('src/App.tsx');
  for (const forbidden of ['/app/learning', '/app/insights', '/app/analytics', 'LearningPage', 'InsightsDashboard', 'AiCoach']) {
    assert.equal(routes.includes(forbidden), false, `learning grew its own route: ${forbidden}`);
  }
  const registry = readCode('src/config/featureRegistry.ts');
  const block = registry.match(/export const PRIMARY_DESTINATION_IDS = \[([\s\S]*?)\] as const;/);
  assert.ok(block, 'featureRegistry must declare PRIMARY_DESTINATION_IDS');
  const destinations = [...block[1].matchAll(/'([a-z-]+)'/g)].map((match) => match[1]);
  assert.equal(destinations.length, 6, 'Memoire has six primary destinations; learning is not a seventh');
  assert.ok(!destinations.some((id) => /learn|insight|analytic/.test(id)));

  assert.ok(
    readCode('src/features/reviews/SalesReviewsPage.tsx').includes('PersonalLearningPanel'),
    'learning should surface on the page the seller already looks back from',
  );
}

console.log(
  'Commercial learning verified: it measures before concluding, says so when it cannot, '
  + 'describes rather than explains, and changes nobody\'s priorities.',
);
