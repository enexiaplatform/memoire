import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reportTemplate } from '../../src/domain/reports/reportDefinition.ts';
import { changeSavedReport, mergeSavedReports, parseSavedReport } from '../../src/domain/reports/reportRecord.ts';
const definition = reportTemplate('portfolio'), at = '2026-10-01T00:00:00.000Z';
const change = (records, id, extra = {}, expectedVersion = 0) => changeSavedReport(records, { id, state: { definition, archived: false, ...extra }, expectedVersion, sample: false, at });
test('save, rename, duplicate and archive retain definition identity/history and stale edits are refused', () => {
  const first = change([], 'report');
  const renamed = change(first, 'report', { definition: { ...definition, name: 'New title' } }, 1);
  assert.equal(renamed[0].history[0].state.definition.name, definition.name);
  const archived = change(renamed, 'report', { definition: renamed[0].definition, archived: true }, 2);
  assert.equal(archived[0].archived, true); assert.equal(archived[0].version, 3);
  const duplicate = change(archived, 'copy', { definition: archived[0].definition });
  assert.equal(duplicate.find(row => row.id === 'copy').version, 1);
  assert.throws(() => change(archived, 'report', {}, 1), /changed/);
});
test('unknown saved formats and broken history cannot be overwritten; merge accepts only proven descendants', () => {
  const first = change([], 'report'), left = change(first, 'report', { definition: { ...definition, name: 'A' } }, 1), right = change(first, 'report', { definition: { ...definition, name: 'B' } }, 1);
  assert.equal(mergeSavedReports(first, left)[0].version, 2);
  assert.throws(() => mergeSavedReports(left, right), /sync conflict/);
  assert.throws(() => parseSavedReport({ ...first[0], schemaVersion: 2 }), /version/);
  assert.throws(() => parseSavedReport({ ...left[0], history: [] }), /Incomplete/);
  assert.throws(() => mergeSavedReports(first, [{ ...first[0], source: 'demo', isSample: true }]), /sync conflict/);
});
