import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildOperatorProfile, profileMinimums } from '../src/utils/operatorProfile.ts';
import { buildMetricTrend, buildOperatorTrends, trendRules } from '../src/utils/metricTrend.ts';
import { buildTargetPlan } from '../src/utils/targetPlan.ts';

/**
 * The operator-insight contract.
 *
 * This feature's whole value is that a seller can trust what it says about
 * them, so the properties pinned here are the ones whose loss would turn it
 * into a horoscope: no claim below its minimum sample, no rate invented when
 * the history is missing, no direction called from a half-finished week, and no
 * silent change to the alarms the user is shown every day.
 */

const opp = (patch = {}) => ({
  id: `o-${Math.random().toString(36).slice(2)}`, accountName: 'Acct', opportunityName: 'Deal',
  stage: 'Proposal', estimatedValue: 100_000_000, currency: 'VND', expectedClosePeriod: 'Q3',
  productOrSolution: '', decisionMaker: '', budgetOwner: '', procurementPath: '',
  technicalCriteria: '', nextAction: '', nextActionDate: '', evidence: '', missingContext: '',
  objectionDebt: '', forecastEvidenceCategory: 'Defensible', decisionRecommendation: 'Monitor',
  status: 'Active', createdAt: '2026-01-01', updatedAt: '2026-01-01', storageMode: 'local', ...patch,
});

const closed = (opportunityId, patch = {}) => ({
  id: `x-${opportunityId}`, opportunityId, accountName: 'Acct', opportunityName: 'Deal',
  outcome: 'Won', outcomeDate: '2026-03-01', finalAmount: 100_000_000, currency: 'VND',
  forecastEvidenceCategoryBeforeOutcome: 'Defensible', decisionRecommendationBeforeOutcome: 'Defend',
  stageBeforeOutcome: 'Proposal', reasonCategory: 'Technical fit', reasonText: '',
  createdAt: '2026-03-01', updatedAt: '2026-03-01', storageMode: 'local', ...patch,
});

// 1. An empty workspace describes nobody. Every rate is null, no trait is
//    emitted, and the gaps say what recording would unlock.
{
  const profile = buildOperatorProfile({
    opportunities: [], opportunityOutcomes: [], activities: [], quotes: [], today: '2026-03-10',
  });
  assert.deepEqual(profile.traits, []);
  assert.equal(profile.economics.winRate, null);
  assert.equal(profile.economics.medianDealValueBase, null);
  assert.equal(profile.economics.medianCycleDays, null);
  assert.equal(profile.economics.quoteToWinRate, null);
  assert.ok(profile.gaps.length > 0, 'an unearned reading is reported, not hidden');
  profile.gaps.forEach((gap) => assert.ok(gap.need > gap.have && gap.unlocks.length > 0));
}

// 2. A rate stays null one record below its minimum and appears at it. This is
//    the line between a reading and an anecdote.
{
  const belowOpportunities = [];
  const belowOutcomes = [];
  for (let index = 0; index < profileMinimums.winRateEmerging - 1; index += 1) {
    const opportunity = opp({ id: `o${index}` });
    belowOpportunities.push(opportunity);
    belowOutcomes.push(closed(opportunity.id, { outcome: index === 0 ? 'Won' : 'Lost' }));
  }
  const below = buildOperatorProfile({
    opportunities: belowOpportunities, opportunityOutcomes: belowOutcomes, activities: [], quotes: [], today: '2026-03-10',
  });
  assert.equal(below.economics.winRate, null, 'one record below the minimum is still null');

  const atOpportunity = opp({ id: 'o-last' });
  const at = buildOperatorProfile({
    opportunities: [...belowOpportunities, atOpportunity],
    opportunityOutcomes: [...belowOutcomes, closed(atOpportunity.id, { outcome: 'Lost' })],
    activities: [], quotes: [], today: '2026-03-10',
  });
  assert.equal(at.economics.winRate, 1 / profileMinimums.winRateEmerging);
}

// 3. Losses that were never decided still count against the win rate. A rate
//    that quietly drops no-decision deals makes the target arithmetic optimistic
//    in exactly the way that misses a quarter.
{
  const opportunities = ['Won', 'Lost', 'No decision', 'Delayed', 'Won'].map((_, index) => opp({ id: `o${index}` }));
  const outcomes = ['Won', 'Lost', 'No decision', 'Delayed', 'Won'].map((outcome, index) =>
    closed(`o${index}`, { outcome }));
  const profile = buildOperatorProfile({
    opportunities, opportunityOutcomes: outcomes, activities: [], quotes: [], today: '2026-03-10',
  });
  assert.equal(profile.economics.closedCount, 5);
  assert.equal(profile.economics.winRate, 0.4);
}

// 4. The trend never judges the period still running, and refuses a direction
//    below its minimum number of completed periods.
{
  const withRunning = buildMetricTrend({
    id: 't', label: 'Touches captured', unit: 'count',
    points: [
      { start: '2026-06-01', end: '2026-06-07', value: 5, complete: true },
      { start: '2026-06-08', end: '2026-06-14', value: 5, complete: true },
      { start: '2026-06-15', end: '2026-06-21', value: 5, complete: true },
      { start: '2026-06-22', end: '2026-06-28', value: 5, complete: true },
      { start: '2026-06-29', end: '2026-07-05', value: 0, complete: false },
    ],
  });
  assert.equal(withRunning.direction, 'steady', 'a Wednesday is not a bad week yet');
  assert.equal(withRunning.latest, 5);

  const tooShort = buildMetricTrend({
    id: 't', label: 'Touches captured', unit: 'count',
    points: Array.from({ length: trendRules.minimumPeriods - 1 }, (_, index) => ({
      start: '2026-06-01', end: '2026-06-07', value: 10 - index, complete: true,
    })),
  });
  assert.equal(tooShort.direction, 'unreadable');
  assert.equal(tooShort.notable, false);
}

// 4b. A percentage needs a base worth taking a percentage of. One deal last
//     week and none this week is a 100% collapse on paper and nothing in life.
{
  const lowVolume = buildMetricTrend({
    id: 't', label: 'New deals opened', unit: 'count',
    points: [1, 1, 0, 0].map((value) => ({ start: '2026-06-01', end: '2026-06-07', value, complete: true })),
  });
  assert.equal(lowVolume.direction, 'unreadable');
  assert.equal(lowVolume.notable, false);

  const realSlide = buildMetricTrend({
    id: 't', label: 'New deals opened', unit: 'count',
    points: [3, 2, 1, 0].map((value) => ({ start: '2026-06-01', end: '2026-06-07', value, complete: true })),
  });
  assert.equal(realSlide.direction, 'falling', 'a run of three is a slide at any volume');
}

// 5. The standard trend set is always complete, so a metric can read as empty
//    but never go missing.
{
  const trends = buildOperatorTrends({
    activities: [], opportunities: [], opportunityOutcomes: [], quotes: [], planRecords: [], today: '2026-07-29',
  });
  assert.deepEqual(trends.map((trend) => trend.id), ['touches', 'followThrough', 'newDeals', 'quotes', 'wonValue']);
}

// 6. The target plan invents nothing. Without the seller's own rates it returns
//    nulls and names what is missing.
{
  const quarter = {
    quarter: 'Q3', isCurrent: true, daysLeft: 60, target: 1_000_000_000, committed: 0,
    openPipeline: 400_000_000, weightedDeclared: 200_000_000, weightedSupported: 200_000_000,
    gap: 800_000_000, coverage: 0.2, opportunityCount: 4,
  };
  const blind = buildTargetPlan({
    quarter,
    economics: {
      winRate: null, wonCount: 0, closedCount: 0, medianDealValueBase: null,
      medianCycleDays: null, quoteToWinRate: null, quotedClosedCount: 0,
    },
  });
  assert.equal(blind.dealsNeeded, null);
  assert.equal(blind.pipelineNeededBase, null);
  assert.equal(blind.quotesNeeded, null);
  assert.ok(blind.missing.length >= 3, 'the missing readings are named, not defaulted');

  const informed = buildTargetPlan({
    quarter,
    economics: {
      winRate: 0.5, wonCount: 8, closedCount: 16, medianDealValueBase: 200_000_000,
      medianCycleDays: 30, quoteToWinRate: 0.5, quotedClosedCount: 12,
    },
  });
  assert.equal(informed.winsNeeded, 4);
  assert.equal(informed.pipelineNeededBase, 1_600_000_000);
  assert.equal(informed.dealsNeeded, 8);
  assert.deepEqual(informed.missing, []);
}

// 7. The discouraging answer survives. When the quarter is shorter than the
//    seller's own cycle, prospecting is not offered as a route to this number.
{
  const plan = buildTargetPlan({
    quarter: {
      quarter: 'Q4', isCurrent: true, daysLeft: 30, target: 1_000_000_000, committed: 0,
      openPipeline: 400_000_000, weightedDeclared: 200_000_000, weightedSupported: 200_000_000,
      gap: 800_000_000, coverage: 0.2, opportunityCount: 4,
    },
    economics: {
      winRate: 0.5, wonCount: 8, closedCount: 16, medianDealValueBase: 200_000_000,
      medianCycleDays: 71, quoteToWinRate: 0.5, quotedClosedCount: 12,
    },
  });
  assert.equal(plan.tooLateForNewPipeline, true);
  assert.ok(!plan.routes.some((route) => route.id === 'open'));
  assert.match(plan.reading, /next quarter/);
}

// 8. Reading only. The profile may observe that an account is off its own pace,
//    but the shared silence thresholds the user is shown daily stay in the
//    policy engine, unchanged and inspectable.
{
  const engine = readFileSync('src/domain/commercialKernel/policyEngine.ts', 'utf8');
  assert.ok(engine.includes('threadSilenceDays: 10'), 'the published silence threshold is still a fixed, visible number');

  const profileSource = readFileSync('src/utils/operatorProfile.ts', 'utf8');
  assert.ok(
    !profileSource.includes('policyThresholds'),
    'operatorProfile must not reach into the policy thresholds - it observes, it does not adapt the alarms',
  );
}

// 9. Wired into the two surfaces that own the questions, and no third one.
{
  const analytics = readFileSync('src/features/reviews/ReviewAnalyticsSection.tsx', 'utf8');
  assert.ok(analytics.includes('<OperatorProfileSection'), 'Review > Analytics must carry the profile');

  const money = readFileSync('src/features/revenue/RevenueViewPage.tsx', 'utf8');
  assert.ok(money.includes('<TargetPlanPanel'), 'Money must carry the target plan under Coverage');
  assert.ok(
    money.indexOf('<CoveragePanel') < money.indexOf('<TargetPlanPanel'),
    'the target plan is the second half of Coverage\'s sentence and follows it',
  );

  const app = readFileSync('src/App.tsx', 'utf8');
  for (const forbidden of ['path="operator-profile"', 'path="insights"', 'path="target-plan"']) {
    assert.ok(!app.includes(forbidden), `insight is a panel, never a seventh destination: ${forbidden}`);
  }
}

console.log('Operator insight contract verified.');
