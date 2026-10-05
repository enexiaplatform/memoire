import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMasterDashboard } from '../../src/utils/masterDashboard.ts';

test('Review weekly adherence matches the current Plan and preserves overdue backlog records', () => {
  const planRecords = [
    ...Array.from({ length: 408 }, (_, i) => ({ id: `old-${i}`, date: '2026-09-01', label: 'Old work', tag: '', done: false })),
    { id: 'this-week-1', date: '2026-10-05', label: 'Current work', tag: '', done: true },
    { id: 'this-week-2', date: '2026-10-06', label: 'Current work', tag: '', done: true },
    { id: 'future', date: '2026-10-20', label: 'Future work', tag: '', done: false },
  ];
  const before = structuredClone(planRecords);
  const model = buildMasterDashboard({ opportunities: [], opportunityOutcomes: [], quotes: [], activities: [], expenses: [], planRecords, today: '2026-10-05' });
  assert.equal(model.execution.planned, 2);
  assert.equal(model.execution.done, 2);
  assert.equal(model.execution.adherenceRate, 1);
  assert.equal(model.execution.personal, 2);
  assert.equal(model.execution.fromCaptures, 0);
  assert.equal(model.execution.fromPipeline, 0);
  assert.equal(model.execution.weekStart, '2026-10-05');
  assert.equal(model.execution.weekEnd, '2026-10-11');
  assert.deepEqual(planRecords, before);
});
