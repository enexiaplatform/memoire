import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCarryOverSelections,
  buildWeeklyCommitmentSnapshot,
  reconcileWeeklyCommitment,
  resolveCommitmentItem,
} from '../../src/utils/weeklyCommitment.ts';

const suggestion = (id, label, extra = {}) => ({
  id, label, detail: `${label} detail`, href: '/app/opportunities', reason: `${label} reason`, ...extra,
});

const activity = (id, accountName, activityDate, linkedOpportunityId = '') => ({
  id, accountName, activityDate, linkedOpportunityId, linkedAccountName: '',
  opportunityName: '', activityType: 'Meeting', summary: '', nextAction: '', dueDate: '',
  tags: [], rawNote: '', linkedOpportunityName: '', linkStatus: 'Unlinked',
  createdAt: '', updatedAt: '', storageMode: 'local',
});

const week = {
  weekId: '2026-07-20',
  periodStart: '2026-07-20',
  periodEnd: '2026-07-26',
};

describe('buildWeeklyCommitmentSnapshot', () => {
  test('separates what was chosen from what was merely suggested', () => {
    const suggestions = [suggestion('s1', 'Unstick Acme'), suggestion('s2', 'Call Beta'), suggestion('s3', 'Restart pilot')];
    const snapshot = buildWeeklyCommitmentSnapshot({
      ...week,
      suggestions,
      selections: [{ suggestionId: 's1', label: 'Unstick Acme', detail: 'Unstick Acme detail' }],
    });

    assert.equal(snapshot.items.length, 1);
    assert.equal(snapshot.items[0].source, 'suggested');
    assert.equal(snapshot.items[0].editedFromSuggestion, false);
    assert.deepEqual(snapshot.suggestedButRejected.map((item) => item.suggestionId), ['s2', 's3']);
  });

  test('flags an edited suggestion and keeps its original reason', () => {
    const suggestions = [suggestion('s1', 'Unstick Acme')];
    const snapshot = buildWeeklyCommitmentSnapshot({
      ...week,
      suggestions,
      selections: [{ suggestionId: 's1', label: 'Unstick Acme by getting the PO signed' }],
    });

    assert.equal(snapshot.items[0].editedFromSuggestion, true);
    assert.equal(snapshot.items[0].suggestionReason, 'Unstick Acme reason');
  });

  test('caps commitments at five', () => {
    const selections = Array.from({ length: 8 }, (_, index) => ({ label: `Item ${index}` }));
    const snapshot = buildWeeklyCommitmentSnapshot({ ...week, suggestions: [], selections });
    assert.equal(snapshot.items.length, 5);
  });

  test('user-added items are not counted as accepted suggestions', () => {
    const snapshot = buildWeeklyCommitmentSnapshot({
      ...week,
      suggestions: [suggestion('s1', 'Unstick Acme')],
      selections: [{ label: 'Something Memoire never proposed' }],
    });
    assert.equal(snapshot.items[0].source, 'user-added');
    assert.equal(snapshot.suggestedButRejected.length, 1);
  });
});

describe('historical truth', () => {
  test('resolving an item never rewrites the frozen label or confirmedAt', () => {
    const snapshot = buildWeeklyCommitmentSnapshot({
      ...week,
      suggestions: [suggestion('s1', 'Unstick Acme')],
      selections: [{ suggestionId: 's1', label: 'Unstick Acme' }],
      confirmedAt: '2026-07-19T09:00:00.000Z',
    });

    const resolved = resolveCommitmentItem(snapshot, snapshot.items[0].id, 'completed', 'PO signed');

    assert.equal(resolved.confirmedAt, '2026-07-19T09:00:00.000Z');
    assert.equal(resolved.items[0].label, 'Unstick Acme');
    assert.equal(resolved.items[0].resolution, 'completed');
    assert.equal(resolved.items[0].resolutionNote, 'PO signed');
    assert.ok(resolved.items[0].resolvedAt);
    // The rejection list is part of the historical record too.
    assert.deepEqual(resolved.suggestedButRejected, snapshot.suggestedButRejected);
  });
});

describe('reconcileWeeklyCommitment', () => {
  test('attaches evidence without promoting an unresolved item', () => {
    const snapshot = buildWeeklyCommitmentSnapshot({
      ...week,
      suggestions: [suggestion('s1', 'Unstick Acme', { linkedOpportunityId: 'opp-1', linkedAccountName: 'Acme' })],
      selections: [{ suggestionId: 's1', label: 'Unstick Acme', linkedOpportunityId: 'opp-1', linkedAccountName: 'Acme' }],
    });

    const model = reconcileWeeklyCommitment({
      snapshot,
      activities: [activity('a1', 'Acme', '2026-07-22', 'opp-1'), activity('a2', 'Acme', '2026-07-24', 'opp-1')],
    });

    assert.equal(model.items[0].evidence.activityCount, 2);
    // Evidence is not completion. Only the user closes a commitment.
    assert.equal(model.items[0].resolution, 'open');
    assert.equal(model.completedCount, 0);
    assert.equal(model.openCount, 1);
  });

  test('counts resolutions the user actually set', () => {
    let snapshot = buildWeeklyCommitmentSnapshot({
      ...week,
      suggestions: [],
      selections: [{ label: 'A' }, { label: 'B' }, { label: 'C' }],
    });
    snapshot = resolveCommitmentItem(snapshot, snapshot.items[0].id, 'completed');
    snapshot = resolveCommitmentItem(snapshot, snapshot.items[1].id, 'carried-over');
    snapshot = resolveCommitmentItem(snapshot, snapshot.items[2].id, 'dropped');

    const model = reconcileWeeklyCommitment({ snapshot, activities: [] });
    assert.equal(model.completedCount, 1);
    assert.equal(model.carriedOverCount, 1);
    assert.equal(model.droppedCount, 1);
    assert.equal(model.openCount, 0);
  });

  test('surfaces work outside the plan as unplanned, not as a miss', () => {
    const snapshot = buildWeeklyCommitmentSnapshot({
      ...week,
      suggestions: [],
      selections: [{ label: 'Unstick Acme', linkedAccountName: 'Acme' }],
    });

    const model = reconcileWeeklyCommitment({
      snapshot,
      activities: [
        activity('a1', 'Acme', '2026-07-21'),
        activity('a2', 'Zephyr', '2026-07-22'),
        activity('a3', 'Zephyr', '2026-07-23'),
      ],
    });

    assert.equal(model.unplannedWork.length, 1);
    assert.equal(model.unplannedWork[0].accountName, 'Zephyr');
    assert.equal(model.unplannedWork[0].activityCount, 2);
  });

  test('ignores activity outside the committed period', () => {
    const snapshot = buildWeeklyCommitmentSnapshot({
      ...week,
      suggestions: [],
      selections: [{ label: 'Unstick Acme', linkedAccountName: 'Acme' }],
    });

    const model = reconcileWeeklyCommitment({
      snapshot,
      activities: [activity('a1', 'Acme', '2026-08-05')],
    });

    assert.equal(model.items[0].evidence, undefined);
    assert.equal(model.unplannedWork.length, 0);
  });

  test('reports suggestion acceptance against what was shown', () => {
    const suggestions = [suggestion('s1', 'A'), suggestion('s2', 'B'), suggestion('s3', 'C'), suggestion('s4', 'D')];
    const snapshot = buildWeeklyCommitmentSnapshot({
      ...week,
      suggestions,
      selections: [{ suggestionId: 's1', label: 'A' }, { suggestionId: 's2', label: 'B edited' }],
    });

    const model = reconcileWeeklyCommitment({ snapshot, activities: [] });
    assert.equal(model.suggestionsShown, 4);
    assert.equal(model.suggestionsAccepted, 2);
    assert.equal(model.suggestionsEdited, 1);
  });
});

describe('buildCarryOverSelections', () => {
  test('carries only the items explicitly marked carried-over', () => {
    let snapshot = buildWeeklyCommitmentSnapshot({
      ...week,
      suggestions: [],
      selections: [{ label: 'A', linkedAccountName: 'Acme' }, { label: 'B' }, { label: 'C' }],
    });
    snapshot = resolveCommitmentItem(snapshot, snapshot.items[0].id, 'carried-over');
    snapshot = resolveCommitmentItem(snapshot, snapshot.items[1].id, 'completed');

    const carried = buildCarryOverSelections(snapshot);
    assert.equal(carried.length, 1);
    assert.equal(carried[0].label, 'A');
    assert.equal(carried[0].linkedAccountName, 'Acme');
  });
});
