import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { scoreCohortRequest, bucketForScore, summariseCohortBuckets } from '../../src/utils/cohortQualification.ts';

const request = (patch = {}) => ({
  id: 'r', createdAt: '2026-07-10T00:00:00.000Z', name: 'A', workEmail: 'a@x.com',
  role: 'Account Executive / Sales Rep', segment: 'B2B SaaS', currentTool: 'Salesforce',
  pipelineReviewFrequency: 'Weekly', biggestPain: 'Weak forecast evidence',
  interestedMost: 'Pipeline Defense Brief', preferredUseCase: 'Prep my forecast call',
  budgetOwner: 'Company', ...patch,
});

describe('scoreCohortRequest', () => {
  test('an ideal request scores the maximum and invites first', () => {
    const q = scoreCohortRequest(request());
    assert.equal(q.score, 10);
    assert.equal(q.maxScore, 10);
    assert.equal(q.bucket, 'invite-first');
  });

  test('a manager who only wants dashboards loses the active-B2B point', () => {
    assert.equal(scoreCohortRequest(request({ role: 'Sales Manager' })).score, 8);
  });

  test('the inferred willing signal is flagged, not silently invented', () => {
    const willing = scoreCohortRequest(request()).signals.find((s) => s.id === 'willing');
    assert.match(willing.note, /confirm/i);
  });

  test('a weak request lands in skip', () => {
    const weak = request({
      role: 'Sales Manager', currentTool: '', interestedMost: 'Quick Capture',
      pipelineReviewFrequency: 'Not sure', biggestPain: 'CRM is too noisy',
      preferredUseCase: '', budgetOwner: 'Not sure',
    });
    assert.equal(scoreCohortRequest(weak).bucket, 'skip');
  });
});

describe('bucketForScore', () => {
  test('doc thresholds', () => {
    assert.equal(bucketForScore(8), 'invite-first');
    assert.equal(bucketForScore(7), 'backup');
    assert.equal(bucketForScore(5), 'clarify');
    assert.equal(bucketForScore(3), 'skip');
  });
});

describe('summariseCohortBuckets', () => {
  test('counts each request into its bucket', () => {
    const weak = request({
      role: 'Sales Manager', currentTool: '', interestedMost: 'Quick Capture',
      pipelineReviewFrequency: 'Not sure', biggestPain: 'CRM is too noisy',
      preferredUseCase: '', budgetOwner: 'Not sure',
    });
    const dist = summariseCohortBuckets([request(), weak]);
    assert.equal(dist['invite-first'], 1);
    assert.equal(dist.skip, 1);
  });
});
