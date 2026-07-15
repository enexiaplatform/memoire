import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildRouteHealth, UNSPECIFIED_ROUTE } from '../../src/utils/routeHealth.ts';

const opp = (patch = {}) => ({
  id: `o${Math.random()}`, productOrSolution: 'Analyzer', estimatedValue: 1000,
  currency: 'VND', status: 'Active', ...patch,
});

describe('buildRouteHealth', () => {
  test('empty pipeline: no routes, not enough data, honest message', () => {
    const report = buildRouteHealth({ opportunities: [] });
    assert.equal(report.routes.length, 0);
    assert.equal(report.hasEnoughData, false);
    assert.ok(report.lowDataMessage.length > 0);
  });

  test('blank product falls to the unspecified route', () => {
    const report = buildRouteHealth({ opportunities: [opp({ productOrSolution: '' })] });
    assert.equal(report.routes[0].route, UNSPECIFIED_ROUTE);
  });

  test('win rate hidden below the per-route floor, shown at/above it', () => {
    const two = buildRouteHealth({ opportunities: [opp({ status: 'Won' }), opp({ status: 'Lost' })] });
    assert.equal(two.routes[0].winRate, null);

    const three = buildRouteHealth({ opportunities: [opp({ status: 'Won' }), opp({ status: 'Won' }), opp({ status: 'Lost' })] });
    assert.equal(three.routes[0].winRate, 2 / 3);
    assert.equal(three.hasEnoughData, true);
  });

  test('active value in base currency; sorted by money at stake', () => {
    const report = buildRouteHealth({ opportunities: [
      opp({ productOrSolution: 'Small', estimatedValue: 1000, currency: 'VND' }),
      opp({ productOrSolution: 'Big', estimatedValue: 100, currency: 'USD' }), // 100 * 26000
    ] });
    assert.equal(report.routes[0].route, 'Big');
    assert.equal(report.routes[0].activeValueBase, 2_600_000);
  });
});
