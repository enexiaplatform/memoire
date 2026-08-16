import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildFirstWeekPath } from '../../src/utils/firstWeekPath.ts';

const activity = (patch = {}) => ({ id: `a${Math.random()}`, activityDate: '2026-07-10', ...patch });
const opportunity = () => ({ id: `o${Math.random()}`, status: 'Active' });
const brief = (patch = {}) => ({ id: `b${Math.random()}`, deals: [{ id: 'd' }], ...patch });

describe('buildFirstWeekPath', () => {
  test('empty workspace: nothing done, capture is next', () => {
    const path = buildFirstWeekPath({ activities: [], opportunities: [], briefs: [] });
    assert.equal(path.done, 0);
    assert.equal(path.total, 5);
    assert.equal(path.complete, false);
    assert.equal(path.nextStep?.id, 'capture');
  });

  test('a capture that links to nothing does not advance past capture', () => {
    const path = buildFirstWeekPath({
      activities: [activity({ accountName: '', linkedAccountName: '', linkedOpportunityId: '' })],
      opportunities: [],
      briefs: [],
    });
    assert.equal(path.steps.find((step) => step.id === 'capture').done, true);
    assert.equal(path.nextStep?.id, 'link', 'an unlinked capture is exactly the silence Memoire watches for');
  });

  test('naming an account on the capture is enough to link it', () => {
    const path = buildFirstWeekPath({
      activities: [activity({ accountName: 'Northstar Foods' })],
      opportunities: [],
      briefs: [],
    });
    assert.equal(path.steps.find((step) => step.id === 'link').done, true);
    assert.equal(path.nextStep?.id, 'commit');
  });

  test('an undated next action is not yet a commitment', () => {
    const path = buildFirstWeekPath({
      activities: [activity({ accountName: 'Northstar', nextAction: 'Send revised quote' })],
      opportunities: [],
      briefs: [],
    });
    assert.equal(
      path.steps.find((step) => step.id === 'commit').done,
      false,
      'the step promises "by when"; an undated line never lands on a day or gets watched',
    );
    assert.equal(path.nextStep?.id, 'commit');
  });

  test('a captured next action with a date counts as the next commitment', () => {
    const path = buildFirstWeekPath({
      activities: [activity({ accountName: 'Northstar', nextAction: 'Send revised quote', dueDate: '2026-07-17' })],
      opportunities: [],
      briefs: [],
    });
    assert.equal(path.steps.find((step) => step.id === 'commit').done, true);
    assert.equal(path.nextStep?.id, 'close');
  });

  test('completing a commitment advances to the review step', () => {
    const path = buildFirstWeekPath({
      activities: [activity({ accountName: 'Northstar', nextAction: 'Send revised quote', dueDate: '2026-07-17' })],
      opportunities: [opportunity()],
      briefs: [],
      commitments: [{ done: true }],
    });
    assert.equal(path.steps.find((step) => step.id === 'close').done, true);
    assert.equal(path.nextStep?.id, 'review');
  });

  test('demo and sample commitments never advance a real workspace', () => {
    const path = buildFirstWeekPath({
      activities: [],
      opportunities: [],
      briefs: [],
      commitments: [{ done: true, isSample: true }, { status: 'completed', source: 'demo' }],
    });
    assert.equal(path.steps.find((step) => step.id === 'commit').done, false);
    assert.equal(path.steps.find((step) => step.id === 'close').done, false);
  });

  test('a sample starter brief does not count as a prepared review', () => {
    const path = buildFirstWeekPath({ activities: [], opportunities: [], briefs: [brief({ isSample: true })] });
    assert.equal(path.steps.find((step) => step.id === 'review').done, false);
  });

  test('all five real milestones complete the path', () => {
    const path = buildFirstWeekPath({
      activities: [activity({ accountName: 'Northstar', nextAction: 'Send revised quote', dueDate: '2026-07-17' })],
      opportunities: [opportunity()],
      briefs: [brief()],
      commitments: [{ status: 'completed' }],
    });
    assert.equal(path.done, 5);
    assert.equal(path.complete, true);
    assert.equal(path.nextStep, null);
  });
});
