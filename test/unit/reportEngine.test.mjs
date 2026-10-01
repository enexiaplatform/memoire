import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../support/reportingCurrency.mjs';
import { reportTemplate, parseReportDefinition, REPORT_ROW_LIMIT } from '../../src/domain/reports/reportDefinition.ts';
import { runReport, reportCsv, reportMetadata, csvCell } from '../../src/domain/reports/reportEngine.ts';
import { buildReportSources } from '../../src/domain/reports/reportSources.ts';
import { buildPortfolioFacts } from '../../src/domain/portfolio/portfolioAnalytics.ts';
const money = { currency: 'VND', ratesToVnd: { VND: 1, USD: 25000 }, ratesAsOf: '2026-08-01' };
const opportunity = (id, extra = {}) => ({ id, accountName: 'Acme', opportunityName: `Deal ${id}`, source: 'user', isSample: false,
  status: 'Active', stage: 'Proposal', estimatedValue: 100, currency: 'VND', brand: 'Legacy', productOrSolution: 'Bundle',
  nextAction: 'Call buyer', nextActionDate: '2026-10-02', missingContext: 'Invoice evidence', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z', ...extra });
function sources(opportunities, extra = {}) {
  const facts = buildPortfolioFacts({ opportunities, outcomes: [], records: [], sample: false, money });
  return buildReportSources({ opportunities, facts, quotes: [], outcomes: [], milestones: [], costs: [], receivables: [], sample: false, today: '2026-10-01', money, ...extra });
}
function run(source, extra = {}) {
  return runReport({ definition: reportTemplate('portfolio'), sources: source, scopeKey: 'owner:false', runAt: '2026-10-01T00:00:00.000Z', today: '2026-10-01', timezone: 'Asia/Ho_Chi_Minh', money, sourceStatus: 'Test workspace', ...extra });
}
test('definition registers dataset fields/operators and refuses unknown versions or untyped filters', () => {
  const definition = reportTemplate('portfolio');
  for (const invalid of [ { ...definition, datasetVersion: 2 }, { ...definition, columns: [{ field: 'rawEvidence', label: 'Secret' }] },
    { ...definition, columns: [...definition.columns, definition.columns[0]] }, { ...definition, groupBy: ['brand', 'brand'] },
    { ...definition, metrics: ['outstanding'] }, { ...definition, metrics: ['__proto__'] },
    { ...definition, filters: [{ field: 'reportingValue', operator: 'contains', value: '1' }] },
    { ...definition, filters: [{ field: 'closedOn', operator: 'gte', value: '2026-02-30' }] },
    { ...definition, filters: [{ field: 'reportingValue', operator: 'gte', value: '' }] } ]) assert.throws(() => parseReportDefinition(invalid));
});
test('qualified population and measures use portfolio semantics and recompute the total rate', () => {
  const result = run(sources([opportunity('a'), opportunity('lead', { stage: 'Lead', estimatedValue: 900 }),
    opportunity('won1', { status: 'Won' }), opportunity('won2', { status: 'Won' }), opportunity('lost', { status: 'Lost' }), opportunity('missing', { estimatedValue: null })]));
  assert.equal(result.rows.length, 5); assert.equal(result.totals.pipeline.value, 100); assert.equal(result.totals.pipeline.missing, 1);
  assert.equal(result.totals.winRate.value, 2 / 3); assert.equal(result.totals.winRate.denominator, 3);
  const definition = { ...result.definition, population: 'leads' };
  assert.equal(run(sources([opportunity('lead', { stage: 'Lead' })]), { definition }).totals.pipeline.value, 0);
});
test('AND/OR typed filters, missing dates and sorting never coerce missing money to zero', () => {
  const data = sources([opportunity('a', { estimatedValue: 10 }), opportunity('b', { estimatedValue: 20, nextActionDate: '' }), opportunity('c', { estimatedValue: null })]);
  const definition = { ...reportTemplate('portfolio'), filters: [{ field: 'reportingValue', operator: 'gte', value: 15 }, { field: 'nextActionDate', operator: 'empty', value: null }] };
  assert.deepEqual(run(data, { definition }).rows.map(row => row.id), ['b']);
  assert.equal(run(data, { definition: { ...definition, filterMode: 'any', filters: [definition.filters[0], { field: 'reportingValue', operator: 'empty', value: null }] } }).rows.length, 2);
  assert.deepEqual(run(data, { definition: { ...reportTemplate('portfolio'), sort: { field: 'reportingValue', direction: 'desc' } } }).rows.map(row => row.id), ['b', 'a', 'c']);
});
test('catalog filters and groups use stable IDs even when display labels are identical', () => {
  const data = sources([opportunity('a'), opportunity('b'), opportunity('c')]);
  data.opportunities[0].values.brand = 'Same label'; data.opportunities[0].references.brand = 'brand-1';
  data.opportunities[1].values.brand = 'Same label'; data.opportunities[1].references.brand = 'brand-2';
  const result = run(data);
  assert.equal(result.groups.length, 3);
  assert.equal(new Set(result.groups.flatMap(group => group.sourceIds)).size, 3);
  const definition = { ...reportTemplate('portfolio'), filters: [{ field: 'brand', operator: 'equals', value: 'brand-1' }] };
  assert.deepEqual(run(data, { definition }).rows.map(row => row.id), ['a']);
});
test('exports include all rows, prevent text formulas, retain numeric cells and match captured metadata', () => {
  const data = sources(Array.from({ length: 130 }, (_, i) => opportunity(String(i), { accountName: i ? 'Acme' : '=HYPERLINK("bad")', estimatedValue: -10 })));
  const result = run(data, { definition: { ...reportTemplate('portfolio'), view: 'details' } });
  data.opportunities[0].values.account = 'Mutated source'; money.ratesToVnd.TEST = 10;
  assert.equal(result.rows.find(row => row.id === '0').values.account, '=HYPERLINK("bad")');
  assert.equal(result.money.ratesToVnd.TEST, undefined);
  const csv = reportCsv(result, 'details'); assert.equal(csv.split('\r\n').length, 131); assert.match(csv, /'=HYPERLINK/);
  assert.equal(csvCell(-10), '"-10"'); assert.equal(csvCell(' \t+SUM(1)'), '"\' \t+SUM(1)"');
  assert.equal(JSON.parse(reportMetadata(result)).rows, 130);
  assert.equal(JSON.parse(reportMetadata(result)).totals.pipeline.value, -1300);
});
test('duplicate sources and row limits fail without returning a truncated result', () => {
  const data = sources([opportunity('a')]);
  assert.throws(() => run({ ...data, opportunities: [data.opportunities[0], data.opportunities[0]] }), /Duplicate/);
  assert.throws(() => run({ ...data, opportunities: Array.from({ length: REPORT_ROW_LIMIT + 1 }, () => data.opportunities[0]) }), /supports up to/);
});
test('collections use one order, latest linked quote and recorded receipts without multiplying deal value', () => {
  const opportunities = [opportunity('won', { status: 'Won', stage: 'Won', estimatedValue: 50 }), opportunity('lead', { stage: 'Lead', pipelineProbability: 99 })];
  const quote = (id, amount, at) => ({ id, quoteId: id, opportunityId: 'won', accountName: 'Acme', title: 'Order', amount, currency: 'VND', paymentTerm: '100% on order',
    quoteDate: '2026-09-01', status: 'Accepted', poStatus: 'Received', deliveryStatus: 'Delivered', paymentStatus: 'Due', createdAt: at, updatedAt: at });
  const unlinked = { ...quote('legacy', 900, '2026-10-01T00:00:00Z'), opportunityId: undefined, opportunityName: 'Deal won' };
  const result = run(sources(opportunities, { quotes: [quote('q1', 55, '2026-09-01T00:00:00Z'), quote('q2', 60, '2026-09-02T00:00:00Z'), unlinked],
    receivables: [{ id: 'r', opportunityId: 'won', installments: [], receipts: [{ id: 'payment', amount: 20, currency: 'VND', receivedOn: '2026-09-03', method: 'Transfer', note: '' }] }] }), { definition: reportTemplate('collections') });
  assert.equal(result.rows.length, 1); assert.equal(result.rows[0].values.reportingValue, 60);
  assert.equal(result.totals.received.value, 20); assert.equal(result.totals.outstanding.value, 40); assert.equal(result.totals.overdue.value, 40);
  assert.equal(result.rows[0].values.missingContext, 'Invoice evidence');
});
test('unknown receipt FX or amount stays unavailable, and duplicate order links are refused', () => {
  const opportunities = [opportunity('won', { status: 'Won' })];
  const record = { id: 'r', opportunityId: 'won', receipts: [{ id: 'p', amount: 20, currency: 'ABC', receivedOn: '2026-09-01' }], installments: [] };
  const result = run(sources(opportunities, { receivables: [record] }), { definition: reportTemplate('collections') });
  assert.equal(result.rows[0].values.valueUnavailable, true); assert.equal(result.totals.outstanding.value, null); assert.equal(result.totals.outstanding.missing, 1);
  assert.throws(() => sources(opportunities, { receivables: [record, { ...record, id: 'other' }] }), /Duplicate order-linked/);
  assert.equal(run(sources([opportunity('won', { status: 'Won', estimatedValue: null })]), { definition: reportTemplate('collections') }).rows[0].values.received, null);
});
