import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCoverage,
  daysLeftInQuarter,
  declaredProbability,
  evidenceAdjustedProbability,
  quarterAmounts,
  quarterForDate,
  quarterFromPeriodLabel,
} from '../../src/domain/commercialKernel/forecast.ts';

const TODAY = new Date('2026-08-15T00:00:00Z');

// Values are VND (the base currency) so the tests read as the numbers written.
const opp = (patch = {}) => ({
  id: 'opp-1', accountName: 'Northstar Foods', opportunityName: 'QC analyser',
  stage: 'Proposal', status: 'Active', estimatedValue: 100, currency: 'VND',
  expectedClosePeriod: '', productOrSolution: '', evidence: 'Lab signed off',
  nextAction: '', nextActionDate: '', ...patch,
});

const thread = (patch = {}) => ({
  id: 'thread-1', opportunityId: 'opp-1', accountName: 'Northstar Foods',
  status: 'active', daysSinceActivity: 1, openCommitmentCount: 1, ...patch,
});

describe('quarter maths', () => {
  test('calendar year by default', () => {
    assert.equal(quarterForDate(new Date('2026-02-10T00:00:00Z')), 'Q1');
    assert.equal(quarterForDate(new Date('2026-08-15T00:00:00Z')), 'Q3');
    assert.equal(quarterForDate(new Date('2026-12-31T00:00:00Z')), 'Q4');
  });

  test('a fiscal year starting in April shifts every quarter', () => {
    // April-June is Q1 for a business running an April fiscal year, and the
    // same August date that is Q3 on a calendar becomes Q2.
    assert.equal(quarterForDate(new Date('2026-04-01T00:00:00Z'), 4), 'Q1');
    assert.equal(quarterForDate(new Date('2026-08-15T00:00:00Z'), 4), 'Q2');
    assert.equal(quarterForDate(new Date('2026-03-31T00:00:00Z'), 4), 'Q4');
  });

  test('days left counts to the end of the quarter, not the month', () => {
    // Inclusive of today: on 15 Aug there are 47 days left in Q3 (16 in August,
    // 30 in September, plus today). "1 day left" therefore means today is the
    // last day, which is what a seller means by it.
    assert.equal(daysLeftInQuarter(new Date('2026-08-15T00:00:00Z')), 47);
    assert.equal(daysLeftInQuarter(new Date('2026-09-30T00:00:00Z')), 1);
    assert.equal(daysLeftInQuarter(new Date('2026-07-01T00:00:00Z')), 92, 'the whole of Q3');
  });

  test('reads a quarter out of whatever the period was called', () => {
    assert.equal(quarterFromPeriodLabel('Q3'), 'Q3');
    assert.equal(quarterFromPeriodLabel('Q2 FY26'), 'Q2');
    assert.equal(quarterFromPeriodLabel('2026-Q4'), 'Q4');
    assert.equal(quarterFromPeriodLabel('next year'), null);
    assert.equal(quarterFromPeriodLabel(''), null);
  });
});

describe('probability', () => {
  test('an explicit probability wins over the stage default', () => {
    assert.equal(declaredProbability(opp({ pipelineProbability: 90 })), 90);
    assert.equal(declaredProbability(opp({ stage: 'Proposal' })), 50);
    assert.equal(declaredProbability(opp({ stage: 'Discovery' })), 10);
  });

  test('a closed deal is a fact, not a forecast', () => {
    assert.equal(declaredProbability(opp({ status: 'Won', pipelineProbability: 40 })), 100);
    assert.equal(declaredProbability(opp({ status: 'Lost', pipelineProbability: 90 })), 0);
  });

  test('an unknown stage is treated cautiously, not optimistically', () => {
    assert.equal(declaredProbability(opp({ stage: 'Some new stage' })), 10);
  });

  test('a healthy deal keeps the probability it was given', () => {
    const result = evidenceAdjustedProbability(opp({ pipelineProbability: 90 }), thread());
    assert.equal(result.probability, 90);
    assert.deepEqual(result.penalties, []);
  });

  test('silence marks a declared probability down', () => {
    const quiet = evidenceAdjustedProbability(
      opp({ pipelineProbability: 90 }),
      thread({ daysSinceActivity: 25 }),
    );
    assert.equal(quiet.declared, 90);
    assert.equal(quiet.probability, 68, '90 cut by a quarter');
    assert.match(quiet.penalties[0].reason, /No contact for 25 days/);

    const veryQuiet = evidenceAdjustedProbability(
      opp({ pipelineProbability: 90 }),
      thread({ daysSinceActivity: 60 }),
    );
    assert.equal(veryQuiet.probability, 45, 'longer silence cuts harder');
  });

  test('penalties compound: quiet, no commitment, no evidence', () => {
    const result = evidenceAdjustedProbability(
      opp({ pipelineProbability: 90, evidence: '' }),
      thread({ daysSinceActivity: 60, openCommitmentCount: 0 }),
    );
    // 90 * 0.5 * 0.8 * 0.8 = 28.8
    assert.equal(result.probability, 29);
    assert.equal(result.penalties.length, 3);
  });

  test('evidence never marks a probability UP', () => {
    // The asymmetry is deliberate: a machine may tell you the forecast is
    // softer than you think, never that a deal is better than you think.
    const perfect = evidenceAdjustedProbability(
      opp({ pipelineProbability: 20, evidence: 'Signed LOI' }),
      thread({ daysSinceActivity: 0, openCommitmentCount: 5 }),
    );
    assert.equal(perfect.probability, 20);
  });

  test('a won deal is never discounted, however quiet', () => {
    const won = evidenceAdjustedProbability(
      opp({ status: 'Won' }),
      thread({ daysSinceActivity: 200, openCommitmentCount: 0 }),
    );
    assert.equal(won.probability, 100);
  });

  test('an opportunity with no thread is judged on its own record', () => {
    const result = evidenceAdjustedProbability(opp({ pipelineProbability: 50, evidence: '' }), undefined);
    assert.equal(result.probability, 40, 'only the missing-evidence penalty applies');
  });
});

describe('quarter allocation', () => {
  test('uses the imported split when there is one', () => {
    const amounts = quarterAmounts(opp({ quarterValues: { Q1: null, Q2: 100, Q3: 250, Q4: null } }), 'Q3');
    assert.deepEqual(amounts, { Q1: 0, Q2: 100, Q3: 250, Q4: 0 });
  });

  test('a null quarter is empty, not a real zero', () => {
    // Number(null) is 0, so nulls have to be skipped before the finite check
    // or every blank quarter would look like a deliberate zero.
    const amounts = quarterAmounts(opp({ quarterValues: { Q1: null, Q2: null, Q3: null, Q4: null }, estimatedValue: 500 }), 'Q3');
    assert.equal(amounts.Q3, 500, 'falls back to the whole value in the current quarter');
  });

  test('falls back to the named close period', () => {
    const amounts = quarterAmounts(opp({ estimatedValue: 300, expectedClosePeriod: 'Q2 FY26' }), 'Q3');
    assert.deepEqual(amounts, { Q1: 0, Q2: 300, Q3: 0, Q4: 0 });
  });

  test('an untidily dated opportunity still lands somewhere', () => {
    // Never silently dropped out of the forecast for having a messy period.
    const amounts = quarterAmounts(opp({ estimatedValue: 300, expectedClosePeriod: 'sometime' }), 'Q4');
    assert.equal(amounts.Q4, 300);
  });

  test('an opportunity worth nothing contributes nothing', () => {
    const amounts = quarterAmounts(opp({ estimatedValue: null, fy26Value: null }), 'Q3');
    assert.deepEqual(amounts, { Q1: 0, Q2: 0, Q3: 0, Q4: 0 });
  });
});

describe('coverage', () => {
  const run = (patch = {}) => buildCoverage({
    opportunities: [], threads: [], targets: [], today: TODAY, ...patch,
  });

  test('no targets means no coverage claims', () => {
    const report = run({ opportunities: [opp({ estimatedValue: 100 })] });
    assert.equal(report.hasTargets, false);
    assert.equal(report.quarters.find((q) => q.isCurrent).coverage, null);
  });

  test('marks the current quarter and counts the days left', () => {
    const report = run();
    assert.equal(report.currentQuarter, 'Q3');
    const current = report.quarters.find((q) => q.isCurrent);
    assert.equal(current.quarter, 'Q3');
    assert.equal(current.daysLeft, 47);
    assert.equal(report.quarters.filter((q) => q.isCurrent).length, 1);
  });

  test('separates won from weighted pipeline', () => {
    const report = run({
      targets: [{ quarter: 'Q3', amount: 1000 }],
      opportunities: [
        opp({ id: 'won', status: 'Won', quarterValues: { Q3: 400 } }),
        opp({ id: 'open', pipelineProbability: 50, quarterValues: { Q3: 400 } }),
      ],
      threads: [thread({ opportunityId: 'open' })],
    });

    const q3 = report.quarters.find((q) => q.quarter === 'Q3');
    assert.equal(q3.committed, 400, 'won money is committed, never weighted');
    assert.equal(q3.openPipeline, 400);
    assert.equal(q3.weightedDeclared, 200);
    assert.equal(q3.weightedSupported, 200, 'a healthy deal is not discounted');
    assert.equal(q3.gap, 400, '1000 target - 400 won - 200 weighted');
    assert.equal(q3.coverage, 0.6);
  });

  test('declared and evidence-backed forecasts are reported apart', () => {
    const report = run({
      targets: [{ quarter: 'Q3', amount: 1000 }],
      opportunities: [opp({ id: 'stale', pipelineProbability: 90, evidence: '', quarterValues: { Q3: 1000 } })],
      threads: [thread({ opportunityId: 'stale', daysSinceActivity: 60, openCommitmentCount: 0 })],
    });

    const q3 = report.quarters.find((q) => q.quarter === 'Q3');
    assert.equal(q3.weightedDeclared, 900, 'what the seller claims');
    assert.equal(q3.weightedSupported, 290, 'what the evidence supports');
    assert.ok(report.unsupportedValue > 600, 'the difference is surfaced, not hidden');

    const worst = report.unsupportedDeals[0];
    assert.equal(worst.declared, 90);
    assert.equal(worst.supported, 29);
    assert.equal(worst.reasons.length, 3);
  });

  test('lost deals leave the forecast entirely', () => {
    const report = run({
      targets: [{ quarter: 'Q3', amount: 1000 }],
      opportunities: [opp({ status: 'Lost', pipelineProbability: 90, quarterValues: { Q3: 1000 } })],
    });
    const q3 = report.quarters.find((q) => q.quarter === 'Q3');
    assert.equal(q3.openPipeline, 0);
    assert.equal(q3.weightedSupported, 0);
    assert.equal(q3.opportunityCount, 0);
  });

  test('sample records stay out of a real forecast', () => {
    const report = run({
      targets: [{ quarter: 'Q3', amount: 1000 }],
      opportunities: [opp({ isSample: true, quarterValues: { Q3: 1000 } })],
    });
    assert.equal(report.quarters.find((q) => q.quarter === 'Q3').openPipeline, 0);

    const demo = run({
      targets: [{ quarter: 'Q3', amount: 1000 }],
      opportunities: [opp({ isSample: true, quarterValues: { Q3: 1000 } })],
      includeSampleRecords: true,
    });
    assert.equal(demo.quarters.find((q) => q.quarter === 'Q3').openPipeline, 1000);
  });

  test('one deal spanning two quarters lands in both', () => {
    const report = run({
      opportunities: [opp({ pipelineProbability: 100, quarterValues: { Q1: 300, Q2: 700 } })],
      threads: [thread()],
    });
    assert.equal(report.quarters.find((q) => q.quarter === 'Q1').openPipeline, 300);
    assert.equal(report.quarters.find((q) => q.quarter === 'Q2').openPipeline, 700);
  });

  test('a fiscal year offset moves which quarter is current', () => {
    const report = buildCoverage({
      opportunities: [], threads: [], targets: [], today: TODAY, fiscalYearStartMonth: 4,
    });
    assert.equal(report.currentQuarter, 'Q2');
  });

  test('an over-covered quarter reports a negative gap, not a fake zero', () => {
    const report = run({
      targets: [{ quarter: 'Q3', amount: 100 }],
      opportunities: [opp({ status: 'Won', quarterValues: { Q3: 250 } })],
    });
    const q3 = report.quarters.find((q) => q.quarter === 'Q3');
    assert.equal(q3.gap, -150);
    assert.equal(q3.coverage, 2.5);
  });
});
