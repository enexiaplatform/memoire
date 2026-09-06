import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  rankRecommendations,
  recommendationRuleConcerns,
  recommendationRuleShape,
  suppressionReasons,
  urgencyBands,
} from '../src/domain/commercialKernel/rankRecommendations.ts';
import { deltaObjectionDimension } from '../src/domain/commercialKernel/deriveDelta.ts';
import { objectionTypes } from '../src/services/objectionStore.ts';
import { evaluateCommercialPolicies, reasonCodes } from '../src/domain/commercialKernel/policyEngine.ts';

/*
 * Next Best Action, and the four ways it could quietly become something else.
 *
 *   1. A sixth prioritisation engine. Memoire already has five overlapping ones
 *      and the whole point of this primitive is to be the thing they can
 *      collapse into - which it cannot be if it ever invents a candidate of its
 *      own. Ranking is a permutation of the policy engine's output, and these
 *      assertions hold it to that.
 *   2. An opaque score. "Priority 83" is unarguable, so a seller who disagrees
 *      with the order has nowhere to look and stops reading it.
 *   3. Money deciding everything. The largest deal in the book is very often
 *      the one nobody has touched in a year.
 *   4. Naive currency comparison, which is invisible: both numbers look right.
 */

const TODAY = new Date('2026-09-05T00:00:00.000Z');
const ACCOUNT = 'Harbour Analytics';
const dayKey = (offset) => new Date(TODAY.getTime() + offset * 86_400_000).toISOString().slice(0, 10);
const iso = (offset) => new Date(TODAY.getTime() + offset * 86_400_000).toISOString();

const codeOf = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');
const readCode = (file) => codeOf(readFileSync(file, 'utf8'));

const rankingCode = readCode('src/domain/commercialKernel/rankRecommendations.ts');
const panelCode = readCode('src/features/threads/CommercialRiskPanel.tsx');

const opportunity = (patch = {}) => ({
  id: 'opp-1', accountName: ACCOUNT, opportunityName: 'Analyser rollout', stage: 'Proposal',
  estimatedValue: 300_000_000, currency: 'VND', expectedClosePeriod: 'Q4', productOrSolution: '',
  decisionMaker: '', budgetOwner: '', procurementPath: '', technicalCriteria: '',
  nextAction: 'Confirm criteria', nextActionDate: dayKey(20), evidence: 'Trial signed off',
  missingContext: '', objectionDebt: '', forecastEvidenceCategory: 'Defensible',
  decisionRecommendation: 'Monitor', status: 'Active', createdAt: iso(-120), updatedAt: iso(-1),
  storageMode: 'local', ...patch,
});

const commitment = (patch = {}) => ({
  id: 'c-1', userId: null, threadId: 'thread-1', accountId: '', accountName: ACCOUNT,
  opportunityId: 'opp-1', commitmentParty: 'customer', ownerLabel: 'Ana Ferreira',
  commitmentText: 'Return the signed PO', originalDueDate: dayKey(-9), currentDueDate: dayKey(-9),
  silenceThresholdDays: 3, status: 'open', impactType: 'none', impactAmount: null,
  impactCurrency: null, dueDateHistory: [], sourceType: 'manual',
  createdAt: iso(-40), updatedAt: iso(-2), ...patch,
});

const recommendation = (patch = {}) => ({
  id: 'rec-1', reasonCode: 'THREAD_SILENT', reasonText: 'Nothing has happened for 21 days.',
  sourceRecordIds: ['thread-1'], threshold: 10, severity: 'medium',
  recommendedAction: 'Make contact, or record why this thread is parked.',
  calculatedAt: TODAY.toISOString(), accountName: ACCOUNT, threadId: 'thread-1',
  opportunityId: 'opp-1', commitmentId: null, href: '/app/opportunities', ...patch,
});

const rank = (patch = {}) => rankRecommendations({
  recommendations: [], opportunities: [], quotes: [], commitments: [], objections: [],
  today: TODAY, reportingCurrency: 'VND', ...patch,
});

// ---------------------------------------------------------------- Contract A
// Ranking reuses the kernel's recommendations. It is not a producer.
{
  const thread = {
    id: 'thread-1', userId: null, accountId: '', accountName: ACCOUNT, opportunityId: 'opp-1',
    title: 'Analyser rollout', objective: '', status: 'active', currentMoneyState: 'none',
    currentWaitingParty: 'none', lastActivityAt: iso(-30), archivedAt: null,
    sourceType: 'system_rule', createdAt: '', updatedAt: '', derived: true, lastEventSummary: '',
    nextCommitment: null, openCommitmentCount: 1, daysSinceActivity: 30,
  };
  const produced = evaluateCommercialPolicies({
    threads: [thread], commitments: [commitment()], opportunities: [opportunity()],
    quotes: [], today: TODAY,
  });
  assert.ok(produced.length > 0, 'the fixture must produce policy recommendations');

  const result = rank({
    recommendations: produced, opportunities: [opportunity()], commitments: [commitment()],
  });

  const producedIds = new Set(produced.map((item) => item.id));
  for (const item of result.ranked) {
    assert.ok(producedIds.has(item.id), `ranking invented a candidate: ${item.id}`);
  }
  const accountedFor = result.ranked.length + result.suppressed.length;
  assert.equal(
    accountedFor,
    produced.length,
    'every candidate must be ranked or explicitly suppressed - never silently dropped',
  );

  // Every rule the policy engine can raise has a declared shape here, derived
  // from the engine's own union rather than a second hand-written list.
  assert.deepEqual(
    Object.keys(recommendationRuleShape).sort(),
    [...reasonCodes].sort(),
    'the ranking shape map and the policy rules must be the same set',
  );
}

// ---------------------------------------------------------------- Contract B
// No independent recommendation producer, and no second severity scale.
{
  for (const forbidden of ['reasonText:', 'recommendedAction:', 'reasonCode:', 'severity:']) {
    assert.equal(
      new RegExp(`${forbidden.replace(':', '\\s*:')}\\s*['"\`]`).test(rankingCode),
      false,
      `ranking must not author recommendation content (${forbidden})`,
    );
  }
  assert.equal(
    /export const severit(y|ies)|export type Severity =/.test(rankingCode),
    false,
    'the severity vocabulary belongs to the policy engine; ranking may not declare a second one',
  );
  assert.equal(
    rankingCode.includes('evaluateCommercialPolicies'),
    false,
    'ranking must not run the rules; it ranks what it is handed',
  );
}

// ---------------------------------------------------------------- Contract C
// Deterministic ordering, from an injected clock.
{
  const input = {
    recommendations: [
      recommendation({ id: 'a' }),
      recommendation({ id: 'b', opportunityId: 'opp-2', threadId: 'thread-2' }),
      recommendation({
        id: 'c', reasonCode: 'CUSTOMER_COMMITMENT_OVERDUE', commitmentId: 'c-1',
        sourceRecordIds: ['c-1'], severity: 'critical',
        reasonText: 'Ana Ferreira committed to "Return the signed PO". It is 9 days overdue.',
        recommendedAction: 'Send a confirmation follow-up.',
      }),
    ],
    opportunities: [opportunity(), opportunity({ id: 'opp-2', estimatedValue: 900_000_000 })],
    commitments: [commitment()],
  };
  assert.equal(JSON.stringify(rank(input)), JSON.stringify(rank(input)), 'ranking must be reproducible');

  assert.ok(/today\?: Date/.test(rankingCode), 'the clock must be injectable');
  assert.equal(
    (rankingCode.match(/new Date\(\)/g) || []).length,
    1,
    'exactly one `new Date()` is allowed: the default for the injected clock',
  );

  // The old alphabetical fallback must not come back. A book in account-name
  // order reads like a judgement about the accounts.
  assert.equal(
    /accountName.*localeCompare|localeCompare.*accountName/.test(rankingCode),
    false,
    'a tie may never be broken on the account name - it reads as a commercial verdict',
  );
}

// ---------------------------------------------------------------- Contract D
// Evidence traceability, and a semantic explanation rather than a score.
{
  const result = rank({
    recommendations: [recommendation(), recommendation({
      id: 'rec-2', reasonCode: 'CUSTOMER_COMMITMENT_OVERDUE', commitmentId: 'c-1',
      sourceRecordIds: ['c-1'], severity: 'critical',
      reasonText: 'Ana Ferreira committed to "Return the signed PO". It is 9 days overdue.',
      recommendedAction: 'Send a confirmation follow-up.',
    })],
    opportunities: [opportunity()],
    commitments: [commitment()],
  });

  for (const item of result.ranked) {
    assert.ok(item.sourceRecordIds.length > 0, `${item.id} names no record that proves it`);
    assert.ok(item.rationale.length > 0, `${item.id} cannot say why it is where it is`);
    assert.equal(item.rationale[0], item.reasonText, 'the finding leads the explanation');
    assert.ok(item.candidateAction.trim().length > 0, 'every ranked row proposes a move');
    assert.ok(item.calculatedAt, 'and says when it was worked out');
    for (const line of item.rationale) {
      assert.doesNotMatch(line, /^\s*(priority\s+)?score\b/i, 'a score is not an explanation');
      assert.ok(/[a-z]/i.test(line), 'every line of the reasoning is a sentence');
    }
  }

  // And the interface shows the reasoning, not a number.
  assert.ok(panelCode.includes('item.rationale'), 'the panel must render the reasoning');
  assert.ok(panelCode.includes('Why am I seeing this?'), 'the existing explainability must survive');
  assert.equal(
    /Priority score|priorityScore|item\.score/.test(panelCode),
    false,
    'the panel must never present a score as the explanation',
  );
}

// ---------------------------------------------------------------- Contract E
// Purity. Ranking reads; it never writes.
{
  for (const line of rankingCode.split('\n')) {
    const match = line.match(/^import\s+(type\s+)?.*from\s+'([^']+)'/);
    if (!match) continue;
    const [, isType, specifier] = match;
    if (!specifier.includes('/services/')) continue;
    assert.ok(isType, `ranking imports a service at runtime (${specifier}); types only`);
  }
  for (const forbidden of ['localStorage', 'supabase', 'appendEvent', 'writeLocal', 'saveCommitment', 'recordCommercialEvent']) {
    assert.equal(rankingCode.includes(forbidden), false, `ranking must not reach a write path: ${forbidden}`);
  }

  const input = {
    recommendations: [recommendation()],
    opportunities: [opportunity()],
    commitments: [commitment()],
  };
  const snapshot = JSON.stringify(input);
  rank(input);
  assert.equal(JSON.stringify(input), snapshot, 'ranking must not mutate its inputs');
}

// ---------------------------------------------------------------- Contract F
// Money modifies; it never decides.
{
  const overdue = recommendation({
    id: 'urgent-small', reasonCode: 'CUSTOMER_COMMITMENT_OVERDUE', commitmentId: 'c-1',
    sourceRecordIds: ['c-1'], severity: 'critical',
    reasonText: 'Ana Ferreira committed to "Return the signed PO". It is 9 days overdue.',
    recommendedAction: 'Send a confirmation follow-up.',
  });
  const huge = recommendation({ id: 'huge-quiet', opportunityId: 'opp-huge', threadId: 'thread-huge' });

  const result = rank({
    recommendations: [huge, overdue],
    opportunities: [opportunity(), opportunity({ id: 'opp-huge', estimatedValue: 90_000_000_000 })],
    commitments: [commitment()],
  });
  assert.equal(
    result.ranked[0].id,
    'urgent-small',
    'a very large quiet deal must not outrank an overdue promise on a small one',
  );

  // Value is the fourth key, and the code says so where the comparison lives.
  const compare = rankingCode.slice(rankingCode.indexOf('function compareRanked'));
  const order = ['URGENCY_ORDER', 'UNBLOCKING_ORDER', 'EVIDENCE_ORDER', 'amountBase'];
  let cursor = -1;
  for (const key of order) {
    const at = compare.indexOf(key);
    assert.ok(at > cursor, `the comparison must reach ${key} only after the dimensions above it`);
    cursor = at;
  }

  // No weighted total anywhere: that is the shape that becomes "priority 83".
  assert.equal(
    /weight\s*\*|\*\s*weight|totalScore|\bscore\s*\+=/.test(rankingCode),
    false,
    'the order must come from named dimensions in precedence, not from a weighted sum',
  );
}

// ---------------------------------------------------------------- Contract G
// Currencies are converted before they are compared.
{
  const result = rank({
    recommendations: [
      recommendation({ id: 'vnd', opportunityId: 'opp-vnd', threadId: 't-vnd' }),
      recommendation({ id: 'eur', opportunityId: 'opp-eur', threadId: 't-eur' }),
    ],
    opportunities: [
      opportunity({ id: 'opp-vnd', estimatedValue: 3_000_000_000, currency: 'VND' }),
      opportunity({ id: 'opp-eur', estimatedValue: 400_000, currency: 'EUR' }),
    ],
  });
  assert.deepEqual(
    result.ranked.map((item) => item.id),
    ['eur', 'vnd'],
    '400,000 EUR is more money than 3,000,000,000 VND, and the larger raw number is the smaller sum',
  );

  const unpriced = rank({
    recommendations: [recommendation({ id: 'unpriced' })],
    opportunities: [opportunity({ estimatedValue: 500_000, currency: 'BRL' })],
  });
  assert.equal(
    unpriced.ranked[0].value.amountBase,
    null,
    'a currency with no rate must never be given a comparable figure',
  );

  assert.ok(rankingCode.includes('convertMoney'), 'ranking must use the shared conversion');
  assert.equal(
    /EXCHANGE_RATES|\/\s*26_000|rate\s*=/.test(rankingCode),
    false,
    'ranking must not carry a second copy of the currency model',
  );
}

// ---------------------------------------------------------------- Contract H
// Contradicted recommendations are withheld, and the reason is returned.
{
  for (const status of ['Won', 'Lost']) {
    const closed = rank({
      recommendations: [recommendation()],
      opportunities: [opportunity({ status })],
    });
    assert.deepEqual(closed.ranked, [], `a ${status} deal must carry no live work`);
    assert.equal(closed.suppressed[0].reason, 'opportunity_closed');
    assert.ok(closed.suppressed[0].contradictedBy.length > 0, 'suppression must name what contradicts it');
  }

  const scheduled = rank({
    recommendations: [recommendation({
      reasonCode: 'THREAD_WITHOUT_NEXT_COMMITMENT',
      reasonText: 'Nothing is scheduled to move it.',
      recommendedAction: 'Set the next commitment: what happens, by whom, by when.',
    })],
    opportunities: [opportunity()],
    commitments: [commitment({ currentDueDate: dayKey(4) })],
  });
  assert.deepEqual(scheduled.ranked, [], '"nothing is scheduled" must not survive a scheduled promise');
  assert.equal(scheduled.suppressed[0].reason, 'commitment_already_scheduled');

  // Every declared reason is one the code can actually produce.
  const producible = new Set(suppressionReasons);
  for (const reason of suppressionReasons) {
    assert.ok(
      new RegExp(`'${reason}'`).test(rankingCode),
      `suppression reason ${reason} is declared but never used`,
    );
    producible.delete(reason);
  }

  // A settled objection is never talked about as a live blocker.
  const settled = rank({
    recommendations: [recommendation()],
    opportunities: [opportunity()],
    objections: [{
      id: 'obj-1', accountId: '', accountName: ACCOUNT, opportunityId: 'opp-1',
      opportunityName: 'Analyser rollout', stakeholderId: '', stakeholderName: '',
      sourceActivityId: '', objectionType: 'Price', objectionText: 'Terms', impact: 'High',
      status: 'Resolved', requiredProof: '', responsePlan: '', resolutionNote: '', dueDate: '',
      resolvedAt: dayKey(-2), tags: [], createdAt: iso(-40), updatedAt: iso(-2), storageMode: 'local',
    }],
  });
  assert.equal(
    /objection is still (open|unresolved)/i.test(JSON.stringify(settled.ranked)),
    false,
    'a resolved objection must not be described as still open',
  );
}

// ---------------------------------------------------------------- Contract I
// Attention is scarce. The surfaces cap what they show.
{
  const many = Array.from({ length: 20 }, (unused, index) => recommendation({
    id: `r-${index}`, opportunityId: `opp-${index}`, threadId: `t-${index}`,
  }));
  const result = rank({
    recommendations: many,
    opportunities: many.map((item, index) => opportunity({ id: `opp-${index}` })),
  });
  assert.equal(result.ranked.length, 20, 'the primitive ranks everything; the caller decides what to show');
  assert.deepEqual(
    result.ranked.map((item) => item.rank),
    [...Array(20).keys()].map((index) => index + 1),
    'ranks are contiguous and 1-based',
  );

  assert.ok(/limit\s*=\s*\d+/.test(panelCode), 'the risk panel must cap what it renders');
  assert.ok(
    panelCode.includes('slice(0, limit)'),
    'and must actually apply the cap',
  );
  const delta = readCode('src/features/threads/DeltaPanel.tsx');
  assert.ok(/changeLimit\s*=\s*\d+/.test(delta) && /conditionLimit\s*=\s*\d+/.test(delta),
    'the subject panel must cap both of its lists');
}

// ---------------------------------------------------------------- Contract J
// No AI, anywhere near this.
{
  for (const marker of ['openai', 'anthropic', 'llm', 'prompt', 'completion', 'fetch(']) {
    assert.equal(
      rankingCode.toLowerCase().includes(marker),
      false,
      `ranking must stay a local pure function: ${marker}`,
    );
  }
}

// ---------------------------------------------------------------- Contract K
// No seventh destination. Ranking is a primitive, not a page.
{
  const app = readCode('src/App.tsx');
  for (const marker of ['rankRecommendations', 'BestMove', 'NextBestAction']) {
    assert.equal(app.includes(marker), false, `Next Best Action must not become a route: ${marker}`);
  }
  assert.equal(
    readCode('src/config/featureRegistry.ts').includes('next-best-action'),
    false,
    'Next Best Action must not become a navigable feature',
  );
}


// ---------------------------------------------------------------- Contract L
// Delta pressure requires explicit relevance, never mere proximity.
{
  const purchasingChange = {
    id: 'chg-price', kind: 'objection_opened', observation: 'transition',
    provenance: 'record_occurrence', statement: 'Price objection opened',
    occurredAt: iso(-3), dimension: 'purchasing', direction: 'weakened',
    significance: 'high', sourceRecordIds: ['obj-1'],
  };
  const openObjection = {
    id: 'obj-1', accountId: '', accountName: ACCOUNT, opportunityId: 'opp-1',
    opportunityName: 'Analyser rollout', stakeholderId: '', stakeholderName: '',
    sourceActivityId: '', objectionType: 'Price', objectionText: 'Terms', impact: 'High',
    status: 'Open', requiredProof: '', responsePlan: '', resolutionNote: '', dueDate: '',
    resolvedAt: '', tags: [], createdAt: iso(-40), updatedAt: iso(-3), storageMode: 'local',
  };
  const quoteRecord = {
    id: 'q-1', quoteId: 'Q-1', accountName: ACCOUNT, opportunityId: 'opp-1',
    opportunityName: 'Analyser rollout', title: '', quoteDate: dayKey(-20), validUntil: dayKey(4),
    amount: 250_000_000, currency: 'VND', grossMarginEstimate: null, discount: null,
    paymentTerm: '', status: 'Sent', poStatus: 'Pending', deliveryStatus: 'Not scheduled',
    expectedDeliveryDate: '', paymentStatus: 'Not due', paymentDueDate: '', nextAction: '',
    notes: '', createdAt: iso(-20), updatedAt: iso(-3),
  };

  const related = recommendation({
    id: 'quote', reasonCode: 'QUOTE_EXPIRING', sourceRecordIds: ['q-1'],
    recommendedAction: 'Chase the decision, or extend the validity.',
  });
  const unrelated = recommendation({
    id: 'evidence', reasonCode: 'OPPORTUNITY_WITHOUT_STAGE_EVIDENCE', sourceRecordIds: ['opp-1'],
    recommendedAction: 'Record what the customer actually did.',
  });

  const shared = { opportunities: [opportunity()], quotes: [quoteRecord], objections: [openObjection] };

  const pressed = rank({ ...shared, recommendations: [related], observedChanges: [purchasingChange] });
  const untouched = rank({ ...shared, recommendations: [unrelated], observedChanges: [purchasingChange] });
  const baseline = rank({ ...shared, recommendations: [unrelated] });

  assert.equal(pressed.ranked[0].urgency, 'now', 'a purchasing change must reach a purchasing matter');
  assert.equal(
    untouched.ranked[0].urgency,
    baseline.ranked[0].urgency,
    'the same change must not reach a recommendation it has nothing to do with',
  );
  assert.deepEqual(
    untouched.ranked[0].supportingChangeIds,
    [],
    'and must not be cited as having moved it',
  );

  // The relevance decision is a declared mapping, not a guess.
  assert.deepEqual(
    Object.keys(recommendationRuleConcerns).sort(),
    [...reasonCodes].sort(),
    'every policy rule must declare what it is about, or nothing can be relevant to it',
  );
  for (const code of reasonCodes) {
    assert.ok(
      recommendationRuleConcerns[code].length > 0,
      code + ' declares no concern, so relevance for it is undefined',
    );
  }
  for (const forbidden of ['toLowerCase().includes', 'levenshtein', 'similarity']) {
    assert.equal(
      rankingCode.includes(forbidden),
      false,
      'relevance must be a declared mapping, not string matching: ' + forbidden,
    );
  }
}

// ---------------------------------------------------------------- Contract M
// Canonical truth beats historical pressure.
{
  const openedThenResolved = {
    id: 'chg-price', kind: 'objection_opened', observation: 'transition',
    provenance: 'record_occurrence', statement: 'Price objection opened',
    occurredAt: iso(-3), dimension: 'purchasing', direction: 'weakened',
    significance: 'high', sourceRecordIds: ['obj-1'],
  };
  const resolvedObjection = {
    id: 'obj-1', accountId: '', accountName: ACCOUNT, opportunityId: 'opp-1',
    opportunityName: 'Analyser rollout', stakeholderId: '', stakeholderName: '',
    sourceActivityId: '', objectionType: 'Price', objectionText: 'Terms', impact: 'High',
    status: 'Resolved', requiredProof: '', responsePlan: '', resolutionNote: 'Agreed 60 days',
    dueDate: '', resolvedAt: dayKey(-1), tags: [], createdAt: iso(-40), updatedAt: iso(-1),
    storageMode: 'local',
  };
  const quoteRecord = {
    id: 'q-1', quoteId: 'Q-1', accountName: ACCOUNT, opportunityId: 'opp-1',
    opportunityName: 'Analyser rollout', title: '', quoteDate: dayKey(-20), validUntil: dayKey(4),
    amount: 250_000_000, currency: 'VND', grossMarginEstimate: null, discount: null,
    paymentTerm: '', status: 'Sent', poStatus: 'Pending', deliveryStatus: 'Not scheduled',
    expectedDeliveryDate: '', paymentStatus: 'Not due', paymentDueDate: '', nextAction: '',
    notes: '', createdAt: iso(-20), updatedAt: iso(-1),
  };
  const quoteRec = recommendation({
    id: 'quote', reasonCode: 'QUOTE_EXPIRING', sourceRecordIds: ['q-1'],
    recommendedAction: 'Chase the decision, or extend the validity.',
  });

  const result = rank({
    recommendations: [quoteRec], opportunities: [opportunity()], quotes: [quoteRecord],
    objections: [resolvedObjection], observedChanges: [openedThenResolved],
  });

  assert.equal(
    result.ranked[0].urgency,
    'this_week',
    'a change the records have already answered must not keep pressing',
  );
  assert.deepEqual(result.ranked[0].supportingChangeIds, []);
  assert.equal(
    /objection is still (open|unresolved)/i.test(JSON.stringify(result.ranked)),
    false,
    'and must not be described as live',
  );

  // Suppression happens before pressure is applied, so an old change can never
  // keep a contradicted recommendation alive.
  const rankBody = rankingCode.slice(rankingCode.indexOf('export function rankRecommendations'));
  const suppressAt = rankBody.indexOf('findContradiction');
  const pressureAt = rankBody.indexOf('eligiblePressure');
  const describeAt = rankBody.indexOf('describe(recommendation');
  assert.ok(
    suppressAt > 0 && pressureAt > suppressAt && describeAt > pressureAt,
    'contradiction suppression must run before delta pressure and before ranking',
  );
}

// ---------------------------------------------------------------- Contract N
// Explanation evidence must be relevant, not merely nearby.
{
  const champion = new Map([['opp-1', {
    opportunityId: 'opp-1', accountName: ACCOUNT, opportunityName: 'Analyser rollout',
    elements: [], weighted: 0, max: 32, percentOfMax: 0,
    blockers: [{
      key: 'champion', label: 'Champion', weight: 4, status: 'Unknown', points: 0,
      weightedPoints: 0, evidence: [], gaps: [], blocking: true,
    }],
    claimedStage: 'Proposal', evidenceStage: 'Lead', stageGap: 4,
    backsForecast: false, clearsEffortGate: false,
  }]]);
  const openObjection = {
    id: 'obj-1', accountId: '', accountName: ACCOUNT, opportunityId: 'opp-1',
    opportunityName: 'Analyser rollout', stakeholderId: '', stakeholderName: '',
    sourceActivityId: '', objectionType: 'Price', objectionText: 'Terms', impact: 'High',
    status: 'Open', requiredProof: '', responsePlan: '', resolutionNote: '', dueDate: '',
    resolvedAt: '', tags: [], createdAt: iso(-3), updatedAt: iso(-3), storageMode: 'local',
  };

  // An overdue promise with nothing recorded about what it is for: neither the
  // price objection nor the missing champion explains why it is late.
  const overdue = rank({
    recommendations: [recommendation({
      id: 'overdue', reasonCode: 'CUSTOMER_COMMITMENT_OVERDUE', commitmentId: 'c-1',
      sourceRecordIds: ['c-1'], severity: 'critical',
      reasonText: 'Ana committed to return the signed PO. It is 9 days overdue.',
      recommendedAction: 'Send a confirmation follow-up.',
    })],
    opportunities: [opportunity()], commitments: [commitment({ impactType: 'none' })],
    objections: [openObjection], qualification: champion,
  });
  for (const line of overdue.ranked[0].rationale) {
    assert.doesNotMatch(line, /still missing/i, 'a qualification gap does not explain a late promise');
    assert.doesNotMatch(line, /objection/i, 'nor does an objection the promise says nothing about');
  }

  // The same gap beside a rule that is about evidence: relevant, and shown.
  const evidence = rank({
    recommendations: [recommendation({
      id: 'evidence', reasonCode: 'OPPORTUNITY_WITHOUT_STAGE_EVIDENCE', sourceRecordIds: ['opp-1'],
      recommendedAction: 'Record what the customer actually did.',
    })],
    opportunities: [opportunity()], qualification: champion,
  });
  assert.ok(
    evidence.ranked[0].rationale.some((line) => /still missing/i.test(line)),
    'an evidence gap does explain a finding about missing evidence',
  );

  // There is one classification of what an objection is about, and ranking
  // reads it rather than keeping a second copy that could drift.
  assert.ok(
    rankingCode.includes('deltaObjectionDimension'),
    'ranking must read the shared objection classification',
  );
  assert.equal(
    /Price:\s*'purchasing'/.test(rankingCode),
    false,
    'ranking must not keep its own copy of the objection classification',
  );
  for (const type of objectionTypes) {
    assert.ok(
      deltaObjectionDimension[type],
      'objection type "' + type + '" has no commercial dimension, so relevance for it is undefined',
    );
  }
}

// ------------------------------------------------------------- vocabulary
{
  assert.deepEqual(
    [...urgencyBands],
    ['now', 'this_week', 'soon', 'whenever'],
    'urgency bands are ordered most pressing first, and the order is load-bearing',
  );
}

console.log('Recommendation ranking verified: one engine, four named dimensions, money last, nothing invented.');
