import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  BLOCKING_ELEMENTS,
  FORECAST_GATE,
  EFFORT_GATE,
  QUALIFICATION_ELEMENTS,
  describeStageGap,
  deriveEvidenceStage,
  scoreDealQualification,
  scoreForStatus,
  summariseQualification,
} from '../../src/utils/dealQualificationScore.ts';
import { buildCoverage } from '../../src/domain/commercialKernel/forecast.ts';

const deal = (overrides = {}) => ({
  id: 'o1',
  accountName: 'Frulact',
  opportunityName: 'RTU plate supply',
  stage: 'Discovery',
  status: 'Active',
  estimatedValue: 40000,
  currency: 'EUR',
  expectedClosePeriod: '',
  productOrSolution: 'RTU plates',
  decisionMaker: '',
  budgetOwner: '',
  procurementPath: '',
  technicalCriteria: '',
  nextAction: '',
  nextActionDate: '',
  evidence: '',
  missingContext: '',
  objectionDebt: '',
  forecastEvidenceCategory: 'Unsupported',
  decisionRecommendation: 'Monitor',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  storageMode: 'local',
  ...overrides,
});

/** A deal with every letter evidenced, so a test can knock one out at a time. */
const fullyEvidenced = (overrides = {}) => ({
  opportunity: deal({
    stage: 'Negotiation',
    expectedClosePeriod: 'Q4 2026',
    procurementPath: 'Framework agreement, PO raised by central purchasing',
    technicalCriteria: 'EP sterility, 21 CFR audit trail',
    evidence: 'Line downtime costs them 40k a month and the audit is in November.',
    missingContext: '',
    nextAction: 'Send the differentiator pack',
    ...(overrides.opportunity || {}),
  }),
  stakeholders: overrides.stakeholders || [
    { id: 's1', name: 'Ms Ha', accountName: 'Frulact', stakeholderRole: 'Champion', stance: 'Supportive' },
    { id: 's2', name: 'Mr Duc', accountName: 'Frulact', stakeholderRole: 'Economic Buyer', stance: 'Neutral' },
  ],
  objections: overrides.objections || [],
  activities: overrides.activities || [{
    id: 'a1', accountName: 'Frulact', linkedAccountName: 'Frulact', linkedOpportunityId: 'o1',
    activityType: 'Customer meeting', activityDate: '2026-08-20', summary: 'Audit deadline confirmed.',
    nextAction: '', dueDate: '', nextActions: [], tags: [],
    competitors: ['Merck'], buyingSignals: ['Budget released'], risks: [], timelineSignals: ['Audit in November'],
  }],
  quotes: overrides.quotes || [{
    id: 'q1', quoteId: 'Q-1', accountName: 'Frulact', opportunityId: 'o1', title: 'RTU plates',
    quoteDate: '2026-08-01', validUntil: '2026-10-01', amount: 40000, currency: 'EUR',
    grossMarginEstimate: null, discount: null, paymentTerm: 'Net 30', status: 'Sent',
    poStatus: 'Received', deliveryStatus: 'Pending', expectedDeliveryDate: '', paymentStatus: 'Unpaid',
    paymentDueDate: '', nextAction: '', notes: '', createdAt: '', updatedAt: '',
  }],
});

describe('the scorecard itself', () => {
  test('nine elements, weights summing to a maximum of 32', () => {
    assert.equal(QUALIFICATION_ELEMENTS.length, 9);
    const max = QUALIFICATION_ELEMENTS.reduce((total, element) => total + element.weight * 2, 0);
    assert.equal(max, 32);
  });

  test('champion and economic buyer are the two that block, and carry the most weight', () => {
    assert.deepEqual(BLOCKING_ELEMENTS, ['champion', 'economicBuyer']);
    BLOCKING_ELEMENTS.forEach((key) => {
      const element = QUALIFICATION_ELEMENTS.find((candidate) => candidate.key === key);
      assert.equal(element.weight, 3, `${key} carries the top weight`);
    });
  });

  test('the money gate is stricter than the effort gate', () => {
    // Different questions. "Solid enough to promise revenue on" deserves a high
    // bar; "did this person do real work" held to the same bar would mark a good
    // month of prospecting as a failure.
    assert.ok(FORECAST_GATE > EFFORT_GATE);
    assert.equal(FORECAST_GATE, 0.75);
    assert.equal(EFFORT_GATE, 0.5);
  });

  test('status maps to the same three answers the source scorecard allows', () => {
    assert.equal(scoreForStatus('Strong'), 2);
    assert.equal(scoreForStatus('Partial'), 1);
    assert.equal(scoreForStatus('Missing'), 0);
  });
});

describe('scoreDealQualification', () => {
  test('an empty deal scores nothing and is blocked', () => {
    const score = scoreDealQualification({ opportunity: deal() });
    assert.equal(score.max, 32);
    assert.ok(score.percentOfMax < FORECAST_GATE);
    assert.equal(score.backsForecast, false);
    assert.deepEqual(score.blockers.map((blocker) => blocker.key), ['champion', 'economicBuyer']);
  });

  test('a fully evidenced deal clears the forecast gate', () => {
    const score = scoreDealQualification(fullyEvidenced());
    assert.equal(score.blockers.length, 0);
    assert.ok(
      score.percentOfMax >= FORECAST_GATE,
      `expected the gate to be cleared, scored ${score.weighted}/${score.max}`,
    );
    assert.equal(score.backsForecast, true);
  });

  test('a missing letter is scored zero rather than dropped', () => {
    // Dropping it would lower the maximum and inflate the percentage - the deal
    // would look better for the app knowing less about it.
    const score = scoreDealQualification({
      opportunity: deal(),
      review: { fields: [], opportunityId: 'o1', accountName: '', opportunityName: '', category: 'Unsupported', gaps: [], recommendedQuestions: [], recommendedActions: [], defenseAnswer: '' },
    });
    assert.equal(score.max, 32);
    assert.equal(score.weighted, 0);
    assert.equal(score.elements.length, 9);
  });
});

describe('deriveEvidenceStage', () => {
  const elements = (points) => QUALIFICATION_ELEMENTS.map((element) => ({
    ...element,
    status: 'Strong',
    points: points[element.key] ?? 2,
    weightedPoints: (points[element.key] ?? 2) * element.weight,
    evidence: [],
    gaps: [],
    blocking: BLOCKING_ELEMENTS.includes(element.key),
  }));

  test('the first weak link decides the stage, not the total', () => {
    // Nine points of paperwork does not compensate for never having found the
    // pain. The deal is at Discovery whatever the total says.
    assert.equal(deriveEvidenceStage(elements({ identifyPain: 0 })), 'Discovery');
    assert.equal(deriveEvidenceStage(elements({ champion: 1 })), 'Qualification');
    assert.equal(deriveEvidenceStage(elements({ economicBuyer: 1 })), 'Demo');
    assert.equal(deriveEvidenceStage(elements({ paperProcess: 0 })), 'Proposal');
    assert.equal(deriveEvidenceStage(elements({})), 'Negotiation');
  });

  test('competition gates no stage', () => {
    // It is a risk, not a rung: a deal is not held at Discovery because nobody
    // has named a rival.
    assert.equal(deriveEvidenceStage(elements({ competition: 0 })), 'Negotiation');
  });
});

describe('claim versus evidence', () => {
  test('an over-stated deal reports the gap in the operator\'s own words', () => {
    const score = scoreDealQualification({ opportunity: deal({ stage: 'Negotiation' }) });
    assert.ok(score.stageGap > 0);
    const line = describeStageGap(score);
    // Blockers speak first - no champion is a bigger fact than a stage gap.
    assert.match(line, /champion/i);
  });

  test('a conservatively staged deal says nothing at all', () => {
    // A panel that produces a line for every deal is a panel people stop
    // reading, and most deals are honestly staged.
    const score = scoreDealQualification(fullyEvidenced({ opportunity: { stage: 'Discovery' } }));
    assert.ok(score.stageGap <= 0);
    assert.equal(describeStageGap(score), '');
  });

  test('a won deal is never reported as over-stated', () => {
    const score = scoreDealQualification({ opportunity: deal({ stage: 'Won', status: 'Won' }) });
    assert.equal(score.stageGap, 0);
  });
});

describe('summariseQualification', () => {
  test('counts the pipeline both ways and ranks the worst gaps first', () => {
    const scores = [
      scoreDealQualification(fullyEvidenced()),
      scoreDealQualification({ opportunity: deal({ id: 'o2', stage: 'Negotiation' }) }),
      scoreDealQualification({ opportunity: deal({ id: 'o3', stage: 'Discovery' }) }),
    ];
    const summary = summariseQualification(scores);
    assert.equal(summary.scored, 3);
    assert.equal(summary.backingForecast, 1);
    assert.equal(summary.blocked, 2);
    assert.equal(summary.worstGaps[0].opportunityId, 'o2', 'the biggest claim-versus-evidence gap leads');
  });
});

describe('forecast coverage, gated on qualification', () => {
  const target = [{ quarter: 'Q4', amount: 100000 }];
  // Amounts in the base currency, so the assertions are about coverage rather
  // than about an exchange rate.
  const q4Deal = (id, qualified) => deal({
    id,
    stage: 'Negotiation',
    currency: 'VND',
    brand: qualified ? 'PMM' : 'Tailin',
    quarterValues: { Q4: 60000 },
    pipelineProbability: 90,
  });

  test('an unqualified deal backs nothing, however large', () => {
    const report = buildCoverage({
      opportunities: [q4Deal('o1', false)],
      threads: [],
      targets: target,
      qualification: new Map([['o1', { backsForecast: false }]]),
      today: new Date('2026-11-15T00:00:00Z'),
    });
    const q4 = report.quarters.find((quarter) => quarter.quarter === 'Q4');
    assert.equal(q4.qualifiedPipeline, 0);
    assert.equal(q4.unqualifiedPipeline, 60000);
    assert.equal(q4.unbackedTarget, 100000, 'the whole target is unbacked');
    assert.equal(report.unbackedQuarters, 1);
  });

  test('a qualified deal counts at full value, not weighted', () => {
    // The gate has already done the discounting. Weighting on top would discount
    // the same doubt twice.
    const report = buildCoverage({
      opportunities: [q4Deal('o1', true)],
      threads: [],
      targets: target,
      qualification: new Map([['o1', { backsForecast: true }]]),
      today: new Date('2026-11-15T00:00:00Z'),
    });
    const q4 = report.quarters.find((quarter) => quarter.quarter === 'Q4');
    assert.equal(q4.qualifiedPipeline, 60000);
    assert.equal(q4.unbackedTarget, 40000);
  });

  test('a workspace with no scores reports everything as unbacked, not as covered', () => {
    // Defaulting the other way would let an empty book claim full cover, which
    // is the exact reassurance a forecast check exists to withhold.
    const report = buildCoverage({
      opportunities: [q4Deal('o1', true)],
      threads: [],
      targets: target,
      today: new Date('2026-11-15T00:00:00Z'),
    });
    const q4 = report.quarters.find((quarter) => quarter.quarter === 'Q4');
    assert.equal(q4.qualifiedPipeline, 0);
    assert.equal(q4.unbackedTarget, 100000);
  });

  test('unqualified money is broken down by the line it belongs to', () => {
    const report = buildCoverage({
      opportunities: [q4Deal('o1', false), q4Deal('o2', false)],
      threads: [],
      targets: target,
      qualification: new Map([['o1', { backsForecast: false }], ['o2', { backsForecast: false }]]),
      today: new Date('2026-11-15T00:00:00Z'),
    });
    assert.deepEqual(report.unqualifiedByBrand, [{ brand: 'Tailin', amount: 120000, deals: 2 }]);
  });

  test('won money needs no qualification behind it', () => {
    const report = buildCoverage({
      opportunities: [deal({ id: 'o1', status: 'Won', stage: 'Won', currency: 'VND', quarterValues: { Q4: 100000 } })],
      threads: [],
      targets: target,
      qualification: new Map(),
      today: new Date('2026-11-15T00:00:00Z'),
    });
    const q4 = report.quarters.find((quarter) => quarter.quarter === 'Q4');
    assert.equal(q4.committed, 100000);
    assert.equal(q4.unbackedTarget, 0);
  });

  test('a quarter with no target is not reported as short of one', () => {
    const report = buildCoverage({
      opportunities: [q4Deal('o1', false)],
      threads: [],
      targets: [],
      qualification: new Map([['o1', { backsForecast: false }]]),
      today: new Date('2026-11-15T00:00:00Z'),
    });
    assert.equal(report.unbackedQuarters, 0);
    assert.equal(report.unbackedValue, 0);
  });
});
