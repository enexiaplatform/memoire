import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildFirstWeekPath } from '../../src/utils/firstWeekPath.ts';

const activity = () => ({ id: `a${Math.random()}`, activityDate: '2026-07-10' });
const opportunity = () => ({ id: `o${Math.random()}`, status: 'Active' });
const brief = (patch = {}) => ({ id: `b${Math.random()}`, deals: [{ id: 'd' }], ...patch });

describe('buildFirstWeekPath', () => {
  test('empty workspace: nothing done, capture is next', () => {
    const path = buildFirstWeekPath({ activities: [], opportunities: [], briefs: [] });
    assert.equal(path.done, 0);
    assert.equal(path.complete, false);
    assert.equal(path.nextStep?.id, 'capture');
  });

  test('a sample starter brief does not count as a prepared review', () => {
    const path = buildFirstWeekPath({ activities: [], opportunities: [], briefs: [brief({ isSample: true })] });
    assert.equal(path.steps.find((s) => s.id === 'review').done, false);
  });

  test('advances in order: capture then organize then review', () => {
    assert.equal(buildFirstWeekPath({ activities: [activity()], opportunities: [], briefs: [] }).nextStep?.id, 'organize');
    assert.equal(buildFirstWeekPath({ activities: [activity()], opportunities: [opportunity()], briefs: [] }).nextStep?.id, 'review');
  });

  test('all three real milestones complete the path', () => {
    const path = buildFirstWeekPath({ activities: [activity()], opportunities: [opportunity()], briefs: [brief()] });
    assert.equal(path.complete, true);
    assert.equal(path.nextStep, null);
  });
});
