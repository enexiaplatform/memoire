import test from 'node:test';
import assert from 'node:assert/strict';
import { portfolioReportDraft, portfolioReportHref } from '../../src/domain/reports/reportHandoffs.ts';
import { dashboardFromReport } from '../../src/domain/dashboards/dashboardDefinition.ts';
import { changeSavedReport } from '../../src/domain/reports/reportRecord.ts';
import { reportTemplate } from '../../src/domain/reports/reportDefinition.ts';

const node = { id: 'brand & 1', kind: 'brand', name: 'Brand A' };
const saved = definition => changeSavedReport([], { id: 'question', expectedVersion: 0, sample: true,
  at: '2026-10-01T00:00:00.000Z', state: { definition, archived: false } })[0];
test('catalog handoff filters by stable identity, with AND semantics and no query interpolation', () => {
  const href = new URL(portfolioReportHref('brand', node.id), 'https://fixture.invalid');
  assert.equal(href.searchParams.get('catalogId'), node.id);
  const draft = portfolioReportDraft('brand', node.id, [node]);
  assert.deepEqual(draft.filters, [{ field: 'brand', operator: 'equals', value: node.id }]);
  assert.equal(draft.filterMode, 'all'); assert.equal(draft.population, 'qualified');
  assert.equal(portfolioReportDraft('brand', node.id, [{ ...node, name: 'Renamed' }]).filters[0].value, node.id);
});
test('missing, foreign-workspace and wrong-kind catalog links never widen into all records', () => {
  for (const [kind, id, nodes] of [['brand', 'missing', [node]], ['brand', node.id, []], ['unit', node.id, [node]], ['constructor', node.id, [node]], [null, node.id, [node]]]) {
    assert.throws(() => portfolioReportDraft(kind, id, nodes), /Invalid|unavailable/);
  }
});
test('dashboard draft reuses the saved report and selects a meaningful available measure', () => {
  const report = saved(reportTemplate('portfolio'));
  const draft = dashboardFromReport(report, 'widget');
  assert.deepEqual(draft.widgets, [{ id: 'widget', title: 'Qualified pipeline', reportId: report.id, type: 'bar', metric: 'pipeline' }]);
  assert.deepEqual(draft.filters, []); // The report already owns its conditions; no second copied query.
  const collections = saved({ ...reportTemplate('collections'), groupBy: [] });
  assert.equal(dashboardFromReport(collections, 'cash').widgets[0].metric, 'outstanding');
  assert.equal(dashboardFromReport(collections, 'cash').widgets[0].type, 'metric');
  const oneBrand = saved(portfolioReportDraft('brand', node.id, [node]));
  assert.equal(dashboardFromReport(oneBrand, 'brand').widgets[0].type, 'metric', 'a fixed single brand needs a reading, not a one-bar comparison');
});
test('removed preferred measure falls back to a supported measure, archived reports refuse handoff', () => {
  const report = saved({ ...reportTemplate('portfolio'), metrics: ['recordCount'], groupBy: [] });
  assert.equal(dashboardFromReport(report, 'count').widgets[0].metric, 'recordCount');
  assert.throws(() => dashboardFromReport({ ...report, archived: true }, 'count'), /Restore/);
});
