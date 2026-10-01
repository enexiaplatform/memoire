import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changePortfolioRecord, mergePortfolioRecords, parsePortfolioRecord, suggestPortfolioNode, validatePortfolioCatalog } from '../../src/domain/portfolio/portfolioCatalog.ts';
import { buildPortfolioFacts, summarizePortfolio } from '../../src/domain/portfolio/portfolioAnalytics.ts';
const at = '2026-10-01T00:00:00.000Z';
const node = (kind, name, extra = {}) => ({ kind, name, code: '', description: '', status: 'active', parentId: null, brandId: null, groupId: null, aliases: [], ...extra });
const change = (records, id, state, expectedVersion = 0, extra = {}) => changePortfolioRecord({ records, id, state, expectedVersion, at, sample: false, ...extra });
const assignment = (opportunityId, extra = {}) => ({ kind: 'assignment', opportunityId, businessUnitId: null, brandId: null, groupId: null, productId: null, originalBrand: 'Legacy', originalProduct: 'Bundle', ...extra });

test('rename and retirement preserve stable links and complete earlier states', () => {
  let records = change([], 'brand', node('brand', 'PMM'));
  records = change(records, 'assignment', assignment('o', { brandId: 'brand' }));
  records = change(records, 'brand', node('brand', 'New name', { status: 'retired', aliases: ['PMM'] }), 1);
  const renamed = records.find(row => row.id === 'brand');
  assert.equal(renamed.version, 2);
  assert.equal(renamed.history[0].state.name, 'PMM');
  assert.equal(records.find(row => row.kind === 'assignment').brandId, 'brand');
  assert.throws(() => change(records, 'brand', node('brand', 'Stale edit'), 1), /changed/);
  assert.equal(suggestPortfolioNode(records, 'brand', 'PMM'), null);
  assert.throws(() => change(records, 'new-assignment', assignment('other', { brandId: 'brand' })), /Retired/);
  assert.doesNotThrow(() => change(records, 'assignment', assignment('o', { brandId: 'brand' }), 1));
});
test('organization and product group trees are separate, acyclic and scope-safe', () => {
  let records = change([], 'root', node('unit', 'Group A'));
  records = change(records, 'child', node('unit', 'Healthcare', { parentId: 'root' }));
  assert.throws(() => change(records, 'root', node('unit', 'Group A', { parentId: 'child' }), 1), /cycle/);
  assert.throws(() => change(records, 'g', node('group', 'Devices', { parentId: 'root' })), /incompatible/);
  assert.throws(() => change(records, 'p', node('product', 'Device', { brandId: 'foreign-id' })), /Missing/);
});
test('aliases are explicit and do not merge similar names', () => {
  const records = change([], 'b', node('brand', 'CondaLab', { aliases: ['COL'] }));
  assert.equal(suggestPortfolioNode(records, 'brand', ' col ').id, 'b');
  assert.equal(suggestPortfolioNode(records, 'brand', 'CondaLab Labs'), null);
  assert.throws(() => change(records, 'other', node('brand', 'COL')), /already belongs/);
  assert.throws(() => change(records, 'another', assignment('o', { brandId: 'foreign-brand' })), /Missing/);
  assert.throws(() => validatePortfolioCatalog([...change(records, 'a', assignment('o')), { ...change(records, 'a', assignment('o')).at(-1), id: 'duplicate' }]), /only one/);
});
test('unknown versions, broken history and changed identities fail closed', () => {
  const record = change([], 'b', node('brand', 'Brand'))[0];
  assert.throws(() => parsePortfolioRecord({ ...record, schemaVersion: 2 }), /Unsupported/);
  assert.throws(() => parsePortfolioRecord({ ...record, version: 2 }), /Incomplete/);
  assert.throws(() => change([record], 'b', node('unit', 'Changed kind'), 1), /identity/);
  assert.throws(() => change([record], 'b', node('brand', 'Sample switch'), 1, { sample: true }), /identity/);
});
test('sync accepts descendants but never chooses between divergent devices', () => {
  const first = change([], 'b', node('brand', 'Brand'));
  const deviceA = change(first, 'b', node('brand', 'Brand A'), 1);
  const deviceB = change(first, 'b', node('brand', 'Brand B'), 1);
  assert.equal(mergePortfolioRecords(first, deviceA)[0].name, 'Brand A');
  assert.throws(() => mergePortfolioRecords(deviceA, deviceB), /sync conflict/);
  const third = change(deviceA, 'b', node('brand', 'Brand C'), 2);
  assert.equal(mergePortfolioRecords(third, deviceA)[0].version, 3);
  assert.throws(() => mergePortfolioRecords(first, [{ ...first[0], createdAt: '2026-09-30T00:00:00.000Z' }]), /sync conflict/);
});

const opportunity = (id, extra = {}) => ({ id, accountName: 'Acme', opportunityName: `Deal ${id}`, brand: 'Legacy', productOrSolution: 'Bundle', status: 'Active', stage: 'Discovery', estimatedValue: 100, currency: 'VND', nextAction: '', nextActionDate: '', ...extra });
const facts = (opportunities, extra = {}) => buildPortfolioFacts({ opportunities, outcomes: [], records: [], money: { currency: 'VND', ratesToVnd: { VND: 1 }, ratesAsOf: '2026-08-01' }, sample: false, ...extra });
test('qualified pipeline excludes leads and demo; unknown amounts/rates stay missing', () => {
  const rows = facts([opportunity('a'), opportunity('lead', { stage: 'Lead' }), opportunity('sample', { source: 'demo' }), opportunity('missing', { estimatedValue: null }), opportunity('fx', { currency: 'ABC' })]);
  const totals = summarizePortfolio(rows);
  assert.equal(totals.pipeline, 100); assert.equal(totals.activeCount, 3); assert.equal(totals.pipelineMissing, 2);
  assert.equal(totals.unmapped, 3);
  assert.equal(summarizePortfolio(facts([opportunity('missing', { estimatedValue: null })])).pipeline, null);
  assert.throws(() => facts([opportunity('a'), opportunity('a')]), /Duplicate/);
});
test('win rate has one denominator, hides small samples and excludes disqualified leads', () => {
  const opportunities = [opportunity('won1', { status: 'Won' }), opportunity('won2', { status: 'Won' }), opportunity('lost', { status: 'Lost' }), opportunity('disqualified', { status: 'Lost', stage: 'Lost' })];
  const rows = facts(opportunities, { outcomes: [{ opportunityId: 'disqualified', outcome: 'Lost', stageBeforeOutcome: 'Lead' }] });
  assert.equal(summarizePortfolio(rows).winRate, 2 / 3);
  assert.equal(summarizePortfolio(rows.slice(0, 2)).winRate, null);
  assert.equal(facts([opportunity('won1', { status: 'Won' })], {
    outcomes: [{ opportunityId: 'won1', outcomeDate: '2026-09-01', source: 'demo', isSample: true }],
  })[0].closedOn, '', 'sample outcomes cannot supply live dates');
});
test('classification is linked by ID, preserves original text and does not infer a product allocation', () => {
  let records = change([], 'b', node('brand', 'Standard brand'));
  records = change(records, 'a', assignment('o', { brandId: 'b' }));
  const row = facts([opportunity('o')], { records })[0];
  assert.equal(row.brand, 'Standard brand'); assert.equal(row.originalBrand, 'Legacy');
  assert.equal(row.product, 'Unassigned'); assert.equal(row.reportingValue, 100);
});
