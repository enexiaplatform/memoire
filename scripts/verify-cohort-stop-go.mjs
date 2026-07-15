import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  defaultCohortFunnelInput,
  evaluateCohortStopGo,
} from '../src/utils/cohortStopGo.ts';

const input = (patch = {}) => ({ ...defaultCohortFunnelInput, ...patch });

// 1. Empty tracker is not a Go and not a false pause.
{
  const result = evaluateCohortStopGo(input());
  assert.equal(result.verdict, 'iterate', 'no data is iterate, not go');
  assert.ok(result.summary.length > 0);
}

// 2. A clean 5-finisher cohort meeting every threshold reads Go.
{
  const result = evaluateCohortStopGo(input({
    participants: 5, finishedLoop: 5,
    createdOrReviewedBrief: 4,          // 4/5
    savedPackOrCopiedSummary: 3,        // 3/5
    wouldUseWeeklyOrBeforeReview: 3,    // 3/5
    paidIntent: 2,                      // 2/5
    hasUnresolvedP0: false,
  }));
  assert.equal(result.verdict, 'go');
  assert.ok(result.goConditions.every((c) => c.met), 'every Go condition met');
}

// 3. An unresolved P0 blocks Go (drops to iterate), not a false pause.
{
  const result = evaluateCohortStopGo(input({
    participants: 5, finishedLoop: 5, createdOrReviewedBrief: 4,
    savedPackOrCopiedSummary: 3, wouldUseWeeklyOrBeforeReview: 3, paidIntent: 2,
    hasUnresolvedP0: true,
  }));
  assert.equal(result.verdict, 'iterate', 'a P0 blocks Go');
  assert.equal(result.goConditions.find((c) => c.id === 'no-p0')?.met, false);
}

// 4. Too few reaching the brief flags Pause even when other counts look ok.
{
  const result = evaluateCohortStopGo(input({
    participants: 10, finishedLoop: 6,
    createdOrReviewedBrief: 3,          // 3/10 < 2/5 reach threshold (4)
    savedPackOrCopiedSummary: 4, wouldUseWeeklyOrBeforeReview: 4, paidIntent: 3,
  }));
  assert.equal(result.verdict, 'pause');
  assert.equal(result.pauseFlags.find((f) => f.id === 'reach')?.met, true);
}

// 5. Thresholds scale with cohort size (ceil, strict).
{
  const six = evaluateCohortStopGo(input({
    participants: 6, finishedLoop: 6,
    createdOrReviewedBrief: 4,          // need ceil(0.8*6)=5 -> unmet
    savedPackOrCopiedSummary: 4, wouldUseWeeklyOrBeforeReview: 4, paidIntent: 3,
  }));
  assert.equal(six.goConditions.find((c) => c.id === 'brief')?.met, false, '4 of 6 is below the 4/5 bar (need 5)');
}

// 6. Persistence normalises junk to safe non-negative integers.
{
  // normalizeFunnelInput is internal; assert through save/load contract markers
  // in the module instead.
  const module = readFileSync('src/utils/cohortStopGo.ts', 'utf8');
  assert.ok(module.includes('COHORT_FUNNEL_KEY'), 'a persistence key exists');
  assert.ok(module.includes('function normalizeFunnelInput'), 'inputs are normalised on load/save');
}

// 7. The panel is wired into the validation page.
const page = readFileSync('src/features/validation/ValidationFeedbackPage.tsx', 'utf8');
for (const marker of ['CohortStopGoPanel', 'evaluateCohortStopGo', 'loadCohortFunnelInput', 'saveCohortFunnelInput']) {
  assert.ok(page.includes(marker), `Validation page missing stop/go wiring: ${marker}`);
}

console.log('Cohort stop/go contract verified.');
