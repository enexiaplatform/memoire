import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  bucketForScore,
  scoreCohortRequest,
  summariseCohortBuckets,
} from '../src/utils/cohortQualification.ts';

const request = (patch = {}) => ({
  id: `r-${Math.random().toString(36).slice(2)}`, createdAt: '2026-07-10T00:00:00.000Z',
  name: 'A', workEmail: 'a@x.com', role: 'Account Executive / Sales Rep',
  segment: 'B2B SaaS', currentTool: 'Salesforce', pipelineReviewFrequency: 'Weekly',
  biggestPain: 'Weak forecast evidence', interestedMost: 'Pipeline Defense Brief',
  preferredUseCase: 'Prep my Monday forecast call', budgetOwner: 'Company', ...patch,
});

// 1. Buckets follow the doc thresholds exactly.
assert.equal(bucketForScore(10), 'invite-first');
assert.equal(bucketForScore(8), 'invite-first');
assert.equal(bucketForScore(7), 'backup');
assert.equal(bucketForScore(6), 'backup');
assert.equal(bucketForScore(5), 'clarify');
assert.equal(bucketForScore(4), 'clarify');
assert.equal(bucketForScore(3), 'skip');
assert.equal(bucketForScore(0), 'skip');

// 2. A fully-qualified request scores the maximum and invites first.
{
  const q = scoreCohortRequest(request());
  assert.equal(q.maxScore, 10, 'the rubric totals 10 points');
  assert.equal(q.score, 10, 'an ideal request earns every point');
  assert.equal(q.bucket, 'invite-first');
  assert.ok(q.signals.every((s) => s.met), 'all signals met for the ideal request');
}

// 3. Each signal is derived from the right field.
{
  assert.equal(scoreCohortRequest(request({ pipelineReviewFrequency: 'Irregular' })).score, 8, 'review pain worth 2');
  assert.equal(scoreCohortRequest(request({ role: 'Sales Manager' })).score, 8, 'manager-only role loses the active-B2B point');
  assert.equal(scoreCohortRequest(request({ currentTool: '', interestedMost: 'Quick Capture' })).score, 8, 'no importable pipeline loses 2');
  assert.equal(scoreCohortRequest(request({ biggestPain: 'CRM is too noisy' })).score, 8, 'off-rubric pain loses the evidence point');
  assert.equal(scoreCohortRequest(request({ preferredUseCase: '' })).score, 9, 'no use case loses the inferred willing point');
  assert.equal(scoreCohortRequest(request({ budgetOwner: 'Not sure' })).score, 9, 'unnamed budget loses 1');
}

// 4. The willing signal is honest about being inferred, not measured.
{
  const willing = scoreCohortRequest(request()).signals.find((s) => s.id === 'willing');
  assert.ok(willing?.note && /confirm/i.test(willing.note), 'the willing signal must flag that it needs confirming');
}

// 5. A weak request lands in skip and the distribution counts it.
{
  const weak = request({
    role: 'Sales Manager', currentTool: '', interestedMost: 'Quick Capture',
    pipelineReviewFrequency: 'Not sure', biggestPain: 'CRM is too noisy',
    preferredUseCase: '', budgetOwner: 'Not sure',
  });
  assert.equal(scoreCohortRequest(weak).score, 0);
  assert.equal(scoreCohortRequest(weak).bucket, 'skip');

  const dist = summariseCohortBuckets([request(), weak]);
  assert.equal(dist['invite-first'], 1);
  assert.equal(dist.skip, 1);
}

// 6. The console wires scoring, ranking, buckets, and signals into the page.
const page = readFileSync('src/features/validation/ValidationFeedbackPage.tsx', 'utf8');
for (const marker of ['scoreCohortRequest', 'summariseCohortBuckets', 'CohortBucketSummary', 'qualification.signals', 'right.qualification.score - left.qualification.score']) {
  assert.ok(page.includes(marker), `Validation page missing cohort console wiring: ${marker}`);
}

console.log('Cohort qualification contract verified.');
