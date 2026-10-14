import { test } from 'node:test';
import assert from 'node:assert/strict';
import { explorerRows, filterExplorerRows, explorerGroups, explorerCsv, packExplorer, relatedExplorerRows } from '../../src/utils/visualExplorer.ts';

const opportunity = (id, extra = {}) => ({ id, opportunityName: id, accountName: 'Acme', stage: 'Proposal', status: 'Active', brand: 'PMM', currency: 'USD', estimatedValue: 100, pipelineProbability: 50, createdAt: '2026-09-01', ...extra });
const filters = { currency: 'USD', brand: '', stage: '', month: '', query: '' };

test('explorer keeps missing money distinct from zero and never mixes currency totals', () => {
  const rows = explorerRows([opportunity('usd'), opportunity('vnd', { currency: 'VND', estimatedValue: 1000000 }), opportunity('zero', { estimatedValue: 0 }), opportunity('missing', { estimatedValue: null }), opportunity('bad', { estimatedValue: Infinity }), opportunity('lead', { stage: 'Lead' })]);
  const selected = filterExplorerRows(rows, filters);
  assert.equal(rows.length, 5);
  assert.equal(selected.length, 4);
  const group = explorerGroups(selected, 'brand')[0];
  assert.equal(group.value, 100); assert.equal(group.known, 2);
  assert.equal(selected.find(row => row.id === 'zero').value, 0);
  assert.equal(selected.find(row => row.id === 'missing').value, null);
});

test('circle packing is deterministic, fits the scene and preserves value-area ratios', () => {
  const rows = explorerRows(Array.from({ length: 160 }, (_, i) => opportunity(String(i), { brand: `Brand ${i % 6}`, estimatedValue: 100 + (i * 971 % 20000) })));
  const scene = packExplorer(rows, 780, 530), shuffled = packExplorer([...rows].reverse(), 780, 530);
  assert.equal(scene.points.length, 160); assert.equal(scene.clusters.length, 6);
  assert.deepEqual(scene, shuffled);
  for (const point of scene.points) {
    assert.ok(point.x - point.r >= 0 && point.x + point.r <= 780);
    assert.ok(point.y - point.r >= 0 && point.y + point.r <= 530);
  }
  for (let i = 0; i < scene.points.length; i++) for (let j = i + 1; j < scene.points.length; j++) {
    const a = scene.points[i], b = scene.points[j];
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= a.r + b.r - .001, 'circles must not overlap');
  }
  const a = scene.points.find(point => point.row.id === '10'), b = scene.points.find(point => point.row.id === '15');
  assert.ok(Math.abs(a.r ** 2 / b.r ** 2 - a.row.value / b.row.value) < .001);
});

test('connections honor confirmed account merges and never join missing customers', () => {
  const rows = explorerRows([opportunity('a', { accountName: 'Acme Lab' }), opportunity('b', { accountName: 'Old Acme', brand: 'Other' }), opportunity('c', { accountName: '' }), opportunity('d', { accountName: '' })], [{ kind: 'merge', canonicalAccountName: 'Acme Lab', mergedNames: ['Old Acme'] }]);
  assert.deepEqual(relatedExplorerRows(rows, rows[0]).map(row => row.id), ['b']);
  assert.deepEqual(relatedExplorerRows(rows, rows[2]), []);
});

test('linked filters intersect and canonical brand spellings stay together', () => {
  const rows = explorerRows([opportunity('a'), opportunity('b', { brand: ' pmm ', stage: 'Won' }), opportunity('c', { brand: 'Other', createdAt: '2026-10-01' })]);
  assert.equal(explorerGroups(rows, 'brand').length, 2);
  assert.equal(filterExplorerRows(rows, { ...filters, brand: 'PMM', stage: 'Won', month: '2026-09', query: 'acme' })[0].id, 'b');
  assert.equal(filterExplorerRows(rows, { ...filters, brand: 'PMM', month: '2026-10' }).length, 0);
});

test('unknown dates and probabilities are visible missingness; export is safe and complete', () => {
  const rows = explorerRows([opportunity('a', { opportunityName: '=HYPERLINK("bad")', estimatedValue: null, currency: '', pipelineProbability: 101, createdAt: '' }), opportunity('b', { pipelineProbability: 0 })]);
  assert.equal(rows[0].currency, 'Unspecified'); assert.equal(rows[0].probability, null);
  assert.equal(rows[1].probability, 0); assert.equal(explorerGroups(rows, 'month').some(group => group.key === 'Unknown date'), true);
  const csv = explorerCsv(rows);
  assert.ok(csv.includes("'=")); assert.ok(csv.includes('""bad""'));
  assert.equal(csv.split('\r\n').length, 3); assert.ok(csv.includes('"Unspecified","","",""'));
});
