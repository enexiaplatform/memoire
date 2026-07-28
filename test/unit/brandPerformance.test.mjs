import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildBrandPerformance, UNBRANDED_LABEL } from '../../src/utils/brandPerformance.ts';

describe('brand performance: which line is carrying the number', () => {
  const opportunity = (id, overrides = {}) => ({
    id,
    accountName: 'DP Lab',
    opportunityName: `Deal ${id}`,
    stage: 'Negotiation',
    status: 'Active',
    estimatedValue: 100,
    currency: 'VND',
    pipelineProbability: null,
    brand: 'Sartorius',
    ...overrides,
  });

  test('the panel stays hidden until a brand is actually recorded', () => {
    const report = buildBrandPerformance({
      opportunities: [opportunity('a', { brand: '' })],
    });
    assert.equal(report.hasBrands, false);
    assert.equal(report.brands[0].brand, UNBRANDED_LABEL);
  });

  test('share of active pipeline is measured in money, not deal count', () => {
    const report = buildBrandPerformance({
      opportunities: [
        opportunity('big', { brand: 'Sartorius', estimatedValue: 900 }),
        opportunity('small1', { brand: 'Cobetter', estimatedValue: 50 }),
        opportunity('small2', { brand: 'Cobetter', estimatedValue: 50 }),
      ],
    });

    assert.equal(report.brands[0].brand, 'Sartorius');
    assert.equal(report.brands[0].shareOfActive, 0.9);
    assert.equal(report.leader.brand, 'Sartorius');
  });

  test('a win rate is withheld until enough deals have closed', () => {
    const thin = buildBrandPerformance({
      opportunities: [
        opportunity('w', { status: 'Won' }),
        opportunity('l', { status: 'Lost' }),
      ],
    });
    assert.equal(thin.brands[0].winRate, null);

    const enough = buildBrandPerformance({
      opportunities: [
        opportunity('w1', { status: 'Won' }),
        opportunity('w2', { status: 'Won' }),
        opportunity('l1', { status: 'Lost' }),
      ],
    });
    assert.equal(Math.round(enough.brands[0].winRate * 100), 67);
  });

  test('deals with no brand are named as a gap, never folded into a real line', () => {
    const report = buildBrandPerformance({
      opportunities: [
        opportunity('branded', { brand: 'Sartorius' }),
        opportunity('loose', { brand: '' }),
      ],
    });

    assert.equal(report.unbrandedActiveCount, 1);
    assert.match(report.coverageMessage, /no brand/);
    // Named brands lead; the gap bucket always sits last.
    assert.equal(report.brands[report.brands.length - 1].unbranded, true);
    assert.equal(report.leader.brand, 'Sartorius');
  });

  test('committed orders are counted per brand', () => {
    const report = buildBrandPerformance({
      opportunities: [
        opportunity('committed', { pipelineProbability: 95, estimatedValue: 500 }),
        opportunity('early', { pipelineProbability: 40, estimatedValue: 500 }),
      ],
    });

    assert.equal(report.brands[0].committedCount, 1);
    assert.equal(report.brands[0].committedValueBase, 500);
  });
});
