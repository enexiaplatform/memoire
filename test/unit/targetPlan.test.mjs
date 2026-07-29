import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildTargetPlan } from '../../src/utils/targetPlan.ts';

const quarter = (overrides = {}) => ({
  quarter: 'Q3',
  isCurrent: true,
  daysLeft: 60,
  target: 1_000_000_000,
  committed: 200_000_000,
  openPipeline: 800_000_000,
  weightedDeclared: 400_000_000,
  weightedSupported: 300_000_000,
  gap: 500_000_000,
  coverage: 0.5,
  opportunityCount: 9,
  ...overrides,
});

const economics = (overrides = {}) => ({
  winRate: 0.4,
  wonCount: 6,
  closedCount: 15,
  medianDealValueBase: 100_000_000,
  medianCycleDays: 30,
  quoteToWinRate: 0.5,
  quotedClosedCount: 12,
  ...overrides,
});

describe('buildTargetPlan', () => {
  test('without a target there is nothing to work backwards from', () => {
    const plan = buildTargetPlan({ quarter: quarter({ target: 0 }), economics: economics() });
    assert.equal(plan.hasTarget, false);
    assert.deepEqual(plan.routes, []);
    assert.match(plan.reading, /Set a quarterly target/);
  });

  test('turns a money gap into deals, and deals into a weekly rate', () => {
    const plan = buildTargetPlan({ quarter: quarter(), economics: economics() });

    assert.equal(plan.winsNeeded, 5);
    assert.equal(plan.pipelineNeededBase, 1_250_000_000);
    assert.equal(plan.dealsNeeded, 13);
    assert.equal(plan.weeksLeft, 9);
    assert.equal(plan.dealsPerWeek, 1.4);
    assert.equal(plan.quotesNeeded, 10);
    assert.equal(plan.quotesPerWeek, 1.1);
    assert.deepEqual(plan.missing, []);
    assert.match(plan.reading, /13 more deals in play/);
  });

  test('a rate it does not have produces no number and says which reading is missing', () => {
    const plan = buildTargetPlan({
      quarter: quarter(),
      economics: economics({ winRate: null, medianDealValueBase: null, quoteToWinRate: null }),
    });

    assert.equal(plan.pipelineNeededBase, null);
    assert.equal(plan.dealsNeeded, null);
    assert.equal(plan.dealsPerWeek, null);
    assert.equal(plan.quotesNeeded, null);
    assert.deepEqual(plan.missing, ['your win rate', 'your typical deal size', 'how often a quote of yours converts']);
    assert.match(plan.reading, /cannot turn that into a weekly number yet/);
  });

  test('says out loud when the quarter is already too short for a new deal to close', () => {
    const plan = buildTargetPlan({
      quarter: quarter({ daysLeft: 40 }),
      economics: economics({ medianCycleDays: 71 }),
    });

    assert.equal(plan.tooLateForNewPipeline, true);
    assert.match(plan.reading, /new pipeline opened now belongs to next quarter/);

    const routeIds = plan.routes.map((route) => route.id);
    assert.ok(!routeIds.includes('open'), 'prospecting is not offered as a route to a number it cannot reach');
    const accelerate = plan.routes.find((route) => route.id === 'accelerate');
    assert.match(accelerate.detail, /only pipeline that can still close in time/);
  });

  test('offers new deals while there is still time for one to close', () => {
    const plan = buildTargetPlan({
      quarter: quarter({ daysLeft: 90 }),
      economics: economics({ medianCycleDays: 30 }),
    });

    assert.equal(plan.tooLateForNewPipeline, false);
    assert.ok(plan.routes.map((route) => route.id).includes('open'));
  });

  test('recovering forecast you already claimed is offered before anything new', () => {
    const plan = buildTargetPlan({
      quarter: quarter(),
      economics: economics(),
      unsupportedValueBase: 180_000_000,
      unsupportedDealCount: 3,
      whitespace: [{ accountName: 'MDL', relationshipValueBase: 400_000_000, brandsTouched: 1, missingBrands: ['Bruker', 'Waters'] }],
    });

    assert.deepEqual(plan.routes.map((route) => route.id), ['recover', 'accelerate', 'whitespace', 'open']);
    assert.equal(plan.routes[0].valueBase, 180_000_000);
    assert.match(plan.routes[2].detail, /never been offered 2 of your lines/);
  });

  test('a covered quarter is told it is covered, and offered no work it does not need', () => {
    const plan = buildTargetPlan({
      quarter: quarter({ gap: -50_000_000, coverage: 1.05 }),
      economics: economics(),
      unsupportedValueBase: 180_000_000,
      unsupportedDealCount: 3,
    });

    assert.deepEqual(plan.routes, []);
    assert.equal(plan.dealsNeeded, 0);
    assert.match(plan.reading, /The quarter is covered: 105%/);
  });
});
