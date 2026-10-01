import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../support/reportingCurrency.mjs';
import { newDashboard, parseDashboardDefinition } from '../../src/domain/dashboards/dashboardDefinition.ts';
import { runDashboard, widgetError, barGroups, measureText } from '../../src/domain/dashboards/dashboardEngine.ts';
import { changeSavedDashboard, mergeSavedDashboard, parseSavedDashboard } from '../../src/domain/dashboards/dashboardRecord.ts';
import { changeSavedReport } from '../../src/domain/reports/reportRecord.ts';
import { reportTemplate } from '../../src/domain/reports/reportDefinition.ts';
import { buildPortfolioFacts } from '../../src/domain/portfolio/portfolioAnalytics.ts';
import { buildReportSources } from '../../src/domain/reports/reportSources.ts';
const at = '2026-10-01T00:00:00.000Z', money = { currency: 'VND', ratesToVnd: { VND: 1 }, ratesAsOf: '2026-08-01' };
const widget = (id, extra = {}) => ({ id, title: id, reportId: 'r', type: 'metric', metric: 'pipeline', ...extra });
const board = (extra = {}) => ({ ...newDashboard(), widgets: [widget('pipeline'), widget('bars', { type: 'bar' })], ...extra });
function report(extra = {}) { return changeSavedReport([], { id: 'r', state: { archived: false, definition: { ...reportTemplate('portfolio'), ...extra } }, expectedVersion: 0, sample: false, at })[0]; }
function context(count = 3) {
  const opportunities = Array.from({ length: count }, (_, i) => ({ id: String(i), accountName: `Account ${i}`, opportunityName: `Deal ${i}`, source: 'user', isSample: false,
    status: 'Active', stage: 'Proposal', estimatedValue: (i + 1) * 100, currency: 'VND', nextAction: '', nextActionDate: '', brand: '', productOrSolution: '' }));
  const facts = buildPortfolioFacts({ opportunities, outcomes: [], records: [], sample: false, money });
  const sources = buildReportSources({ opportunities, facts, quotes: [], outcomes: [], milestones: [], costs: [], receivables: [], sample: false, today: '2026-10-01', money });
  sources.opportunities.forEach((row, index) => { row.references.brand = index % 2 ? 'b' : 'a'; row.values.brand = index % 2 ? 'Brand B' : 'Brand A'; });
  return { sources, scopeKey: 'owner:false', runAt: at, today: '2026-10-01', timezone: 'Asia/Ho_Chi_Minh', money, sourceStatus: 'Test sources' };
}
test('dashboard contracts restrict views, metrics, unique dimensions and bounded widget count', () => {
  for (const invalid of [{ ...board(), schemaVersion: 2 }, board({ widgets: [widget('same'), widget('same')] }), board({ widgets: Array.from({ length: 13 }, (_, i) => widget(String(i))) }),
    board({ filters: [{ field: 'account', id: 'a' }] }), board({ filters: [{ field: 'brand', id: 'a' }, { field: 'brand', id: 'b' }] }), board({ widgets: [widget('bad', { metric: '__proto__' })] })]) assert.throws(() => parseDashboardDefinition(invalid));
  assert.equal(parseDashboardDefinition(board()).widgets.length, 2);
});
test('widgets share one report result and a captured basis; source mutation cannot change them', () => {
  const input = context(), definition = board(), result = runDashboard(definition, [report()], input);
  assert.equal(result.results.length, 1); assert.equal(result.results[0].run.totals.pipeline.value, 600);
  input.sources.opportunities[0].values.account = 'Changed'; input.money.ratesToVnd.VND = 42; definition.widgets[0].title = 'Changed';
  assert.equal(result.results[0].run.rows[0].values.account, 'Account 0'); assert.equal(result.results[0].run.money.ratesToVnd.VND, 1); assert.equal(result.definition.widgets[0].title, 'pipeline');
  input.money.ratesToVnd.VND = 1;
});
test('global catalog scope intersects report OR filters without broadening the report', () => {
  const sourceReport = report({ filterMode: 'any', filters: [{ field: 'account', operator: 'equals', value: 'Account 0' }, { field: 'account', operator: 'equals', value: 'Account 1' }] });
  const result = runDashboard(board({ filters: [{ field: 'brand', id: 'a' }] }), [sourceReport], context());
  assert.deepEqual(result.results[0].run.rows.map(row => row.id), ['0']); assert.equal(result.results[0].run.totals.pipeline.value, 100);
  const empty = runDashboard(board({ filters: [{ field: 'brand', id: null }] }), [sourceReport], context());
  assert.equal(empty.results[0].run.rows.length, 0); assert.equal(empty.results[0].run.totals.pipeline.value, 0);
});
test('missing, archived, changed measures and ungrouped charts are explicit without corrupting other widgets', () => {
  const result = runDashboard(board({ widgets: [widget('ok'), widget('missing', { reportId: 'missing' })] }), [report()], context());
  assert.equal(widgetError(widget('ok'), result.results[0]), null); assert.match(widgetError(widget('missing'), result.results[1]), /missing/);
  assert.match(widgetError(widget('new', { metric: 'overdue' }), result.results[0]), /no longer selected/);
  const archived = { ...report(), archived: true }; assert.match(runDashboard(board(), [archived], context()).results[0].error, /archived/);
  const ungrouped = runDashboard(board(), [report({ groupBy: [] })], context()); assert.match(widgetError(widget('bar', { type: 'bar' }), ungrouped.results[0]), /grouped report/);
  assert.throws(() => runDashboard(board(), [report(), report()], context()), /Duplicate/);
});
test('top bars are an explicit subset, numeric zero remains visible and win-rate absence is not zero', () => {
  const result = runDashboard(board(), [report({ groupBy: ['account'] })], context(15)).results[0].run;
  assert.equal(result.groups.length, 15); const bars = barGroups(result, 'pipeline'); assert.equal(bars.length, 12); assert.equal(bars[0].metrics.pipeline.value, 1500);
  assert.equal(measureText('pipeline', { value: 0, missing: 0 }), '0'); assert.match(measureText('pipeline', { value: 100, missing: 1 }), /partial/);
  assert.match(measureText('winRate', { value: null, missing: 0, denominator: 2 }), /Needs 3/);
});
test('global filters never hide an oversized or duplicated source by returning a partial dashboard', () => {
  const input = context(1); input.sources.opportunities = Array.from({ length: 10001 }, () => input.sources.opportunities[0]);
  assert.match(runDashboard(board({ filters: [{ field: 'brand', id: 'none' }] }), [report()], input).results[0].error, /10,000/);
  input.sources.opportunities = input.sources.opportunities.slice(0, 2); assert.match(runDashboard(board(), [report()], input).results[0].error, /Duplicate/);
});
test('rename, reorder, archive and restoration retain history; stale and divergent edits are refused', () => {
  const create = (records, definition, archived, expectedVersion) => changeSavedDashboard(records, { id: 'board', state: { definition, archived }, expectedVersion, sample: false, at });
  const first = create([], board(), false, 0), second = create(first, { ...board(), name: 'Renamed', widgets: [...board().widgets].reverse() }, true, 1);
  const third = create(second, second[0].definition, false, 2);
  assert.equal(third[0].history.length, 2); assert.equal(third[0].history[0].state.definition.name, 'My dashboard'); assert.equal(third[0].history[1].state.archived, true);
  assert.equal(mergeSavedDashboard(first[0], third[0]).version, 3); assert.throws(() => create(third, board(), false, 1), /changed/);
  assert.throws(() => mergeSavedDashboard(second[0], create(first, { ...board(), name: 'Other device' }, false, 1)[0]), /conflict/);
  assert.throws(() => parseSavedDashboard({ ...third[0], history: [] }), /history/);
});
