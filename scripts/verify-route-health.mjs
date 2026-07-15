import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildRouteHealth, MIN_TOTAL_DECIDED, UNSPECIFIED_ROUTE } from '../src/utils/routeHealth.ts';

const opp = (patch = {}) => ({
  id: `o-${Math.random().toString(36).slice(2)}`, accountName: 'Acct', opportunityName: 'Deal',
  stage: 'Proposal', estimatedValue: 1000, currency: 'VND', expectedClosePeriod: 'Q3',
  productOrSolution: 'Analyzer', decisionMaker: '', budgetOwner: '', procurementPath: '',
  technicalCriteria: '', nextAction: '', nextActionDate: '', evidence: '', missingContext: '',
  objectionDebt: '', forecastEvidenceCategory: '', decisionRecommendation: 'Monitor',
  status: 'Active', createdAt: '', updatedAt: '', storageMode: 'local', ...patch,
});

// 1. Empty pipeline: no routes, not enough data, honest message.
{
  const report = buildRouteHealth({ opportunities: [] });
  assert.equal(report.routes.length, 0);
  assert.equal(report.hasEnoughData, false);
  assert.ok(report.lowDataMessage.length > 0);
}

// 2. Groups by product/solution; blanks fall to the unspecified route.
{
  const report = buildRouteHealth({ opportunities: [
    opp({ productOrSolution: 'Analyzer' }),
    opp({ productOrSolution: '' }),
  ] });
  const routeNames = report.routes.map((r) => r.route);
  assert.ok(routeNames.includes('Analyzer'));
  assert.ok(routeNames.includes(UNSPECIFIED_ROUTE), 'blank product falls to the unspecified route');
}

// 3. Win rate stays hidden below the per-route floor, appears at/above it.
{
  const twoDecided = buildRouteHealth({ opportunities: [
    opp({ status: 'Won' }), opp({ status: 'Lost' }), opp({ status: 'Active' }),
  ] });
  assert.equal(twoDecided.routes[0].winRate, null, '2 decided is below the floor of 3');

  const threeDecided = buildRouteHealth({ opportunities: [
    opp({ status: 'Won' }), opp({ status: 'Won' }), opp({ status: 'Lost' }),
  ] });
  assert.equal(threeDecided.routes[0].winRate, 2 / 3, '3 decided -> 2 won / 3');
  assert.equal(threeDecided.totalDecided, 3);
  assert.equal(threeDecided.hasEnoughData, true);
}

// 4. Active value in base currency; sorted by money at stake descending.
{
  const report = buildRouteHealth({ opportunities: [
    opp({ productOrSolution: 'Small', estimatedValue: 1000, currency: 'VND', status: 'Active' }),
    opp({ productOrSolution: 'Big', estimatedValue: 100, currency: 'USD', status: 'Active' }), // 100 * 26000 = 2.6M VND
  ] });
  assert.equal(report.routes[0].route, 'Big', 'higher base value sorts first');
  assert.equal(report.routes[0].activeValueBase, 2_600_000);
  assert.equal(report.routes[1].activeValueBase, 1000);
}

// 5. Report-level density gate.
{
  const thin = buildRouteHealth({ opportunities: [opp({ status: 'Won' }), opp({ status: 'Active' })] });
  assert.equal(thin.hasEnoughData, false, `1 decided is below MIN_TOTAL_DECIDED=${MIN_TOTAL_DECIDED}`);
}

// 6. Wired into the Money page.
const page = readFileSync('src/features/revenue/RevenueViewPage.tsx', 'utf8');
for (const marker of ['buildRouteHealth', '<RouteHealthSection', 'Which routes make money']) {
  assert.ok(page.includes(marker), `Money page missing route-health wiring: ${marker}`);
}

console.log('Route health contract verified.');
