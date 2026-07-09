import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildFollowUpImpact,
  followUpImpactStatusLabel,
  FOLLOW_UP_QUIET_THRESHOLD_DAYS,
} from '../src/utils/followUpImpact.ts';

const today = '2026-07-09';

function makeOpportunity(patch = {}) {
  return {
    id: 'opp-1',
    accountName: 'Summit Diagnostics',
    opportunityName: 'QC workflow',
    stage: 'Proposal',
    estimatedValue: 200_000_000,
    currency: 'VND',
    expectedClosePeriod: 'Q3',
    productOrSolution: 'QC suite',
    decisionMaker: '',
    budgetOwner: '',
    procurementPath: '',
    technicalCriteria: '',
    nextAction: '',
    nextActionDate: '',
    evidence: '',
    missingContext: '',
    objectionDebt: '',
    forecastEvidenceCategory: 'Weak but recoverable',
    decisionRecommendation: 'Monitor',
    status: 'Active',
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    storageMode: 'local',
    ...patch,
  };
}

function makeActivity(patch = {}) {
  return {
    id: `act-${Math.random().toString(36).slice(2)}`,
    accountName: 'Summit Diagnostics',
    opportunityName: 'QC workflow',
    contactName: '',
    stakeholderName: '',
    stakeholderRole: '',
    competitors: [],
    buyingSignals: [],
    risks: [],
    timelineSignals: [],
    nextActions: [],
    activityType: 'Meeting',
    summary: 'Touch',
    nextAction: '',
    dueDate: '',
    tags: [],
    linkedOpportunityId: 'opp-1',
    linkedOpportunityName: 'QC workflow',
    linkedAccountName: 'Summit Diagnostics',
    linkStatus: 'Linked',
    rawNote: 'Touch',
    activityDate: '2026-06-01',
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    storageMode: 'local',
    ...patch,
  };
}

// 1. Quiet deal + follow-up + later customer touch => revived, value counted.
{
  const impact = buildFollowUpImpact({
    today,
    opportunities: [makeOpportunity()],
    activities: [
      makeActivity({ id: 'touch-old', activityDate: '2026-06-10' }),
      makeActivity({ id: 'fu-1', activityType: 'Follow-up', tags: ['follow-up'], activityDate: '2026-06-28' }),
      makeActivity({ id: 'touch-reply', activityType: 'Call', activityDate: '2026-07-02' }),
    ],
  });
  assert.equal(impact.followUpsSent, 1);
  assert.equal(impact.quietDealsContacted, 1, 'an 18-day gap must count as a quiet-deal contact');
  assert.equal(impact.dealsRevived, 1);
  assert.equal(impact.dealsWaiting, 0);
  assert.ok(impact.valueBackInMotionBase >= 200_000_000, 'revived deal value must be counted in base currency');
  assert.equal(impact.events[0].status, 'revived');
  assert.ok(impact.events[0].evidence.includes('2026-07-02'));
  assert.equal(impact.events[0].daysQuietBefore, 18);
}

// 2. Follow-up then silence but a future next action booked => protected.
{
  const impact = buildFollowUpImpact({
    today,
    opportunities: [makeOpportunity({ nextActionDate: '2026-07-15' })],
    activities: [
      makeActivity({ id: 'touch-old', activityDate: '2026-06-01' }),
      makeActivity({ id: 'fu-1', activityType: 'Follow-up', activityDate: '2026-07-01' }),
    ],
  });
  assert.equal(impact.dealsProtected, 1);
  assert.equal(impact.events[0].status, 'protected');
}

// 3. Follow-up with no reply and nothing booked => waiting, value NOT counted.
{
  const impact = buildFollowUpImpact({
    today,
    opportunities: [makeOpportunity()],
    activities: [
      makeActivity({ id: 'touch-old', activityDate: '2026-06-01' }),
      makeActivity({ id: 'fu-1', activityType: 'Follow-up', activityDate: '2026-07-05' }),
    ],
  });
  assert.equal(impact.dealsWaiting, 1);
  assert.equal(impact.valueBackInMotionBase, 0, 'waiting deals must not inflate the value metric');
}

// 4. Follow-up on a deal that was NOT quiet: counted as sent, not as a quiet-deal contact.
{
  const impact = buildFollowUpImpact({
    today,
    opportunities: [makeOpportunity()],
    activities: [
      makeActivity({ id: 'touch-recent', activityDate: '2026-07-03' }),
      makeActivity({ id: 'fu-1', activityType: 'Follow-up', activityDate: '2026-07-05' }),
    ],
  });
  assert.equal(impact.followUpsSent, 1);
  assert.equal(impact.quietDealsContacted, 0);
}

// 5. Won outcome after the follow-up wins over everything else.
{
  const impact = buildFollowUpImpact({
    today,
    opportunities: [makeOpportunity()],
    activities: [
      makeActivity({ id: 'touch-old', activityDate: '2026-06-05' }),
      makeActivity({ id: 'fu-1', activityType: 'Follow-up', activityDate: '2026-06-25' }),
    ],
    opportunityOutcomes: [{
      id: 'out-1',
      opportunityId: 'opp-1',
      accountName: 'Summit Diagnostics',
      opportunityName: 'QC workflow',
      outcome: 'Won',
      outcomeDate: '2026-07-01',
      finalAmount: 200_000_000,
      currency: 'VND',
      forecastEvidenceCategoryBeforeOutcome: 'Defensible',
      decisionRecommendationBeforeOutcome: 'Defend',
      stageBeforeOutcome: 'Negotiation',
      reasonCategory: 'Other',
      reasonText: '',
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
      storageMode: 'local',
    }],
  });
  assert.equal(impact.dealsWon, 1);
  assert.equal(impact.events[0].status, 'won');
}

// 6. Follow-ups outside the window are ignored.
{
  const impact = buildFollowUpImpact({
    today,
    opportunities: [makeOpportunity()],
    activities: [
      makeActivity({ id: 'fu-old', activityType: 'Follow-up', activityDate: '2026-05-01' }),
    ],
  });
  assert.equal(impact.followUpsSent, 0);
}

// 7. Unlinked follow-up resolves through the single-deal account fallback.
{
  const impact = buildFollowUpImpact({
    today,
    opportunities: [makeOpportunity()],
    activities: [
      makeActivity({ id: 'touch-old', activityDate: '2026-06-01' }),
      makeActivity({
        id: 'fu-1',
        activityType: 'Follow-up',
        activityDate: '2026-07-01',
        linkedOpportunityId: '',
        linkedOpportunityName: '',
        opportunityName: '',
      }),
      makeActivity({ id: 'touch-reply', activityType: 'Email', activityDate: '2026-07-06', linkedOpportunityId: '' }),
    ],
  });
  assert.equal(impact.dealsRevived, 1, 'single-deal accounts must resolve without an explicit link');
}

// 8. Status labels stay honest: no label may overclaim.
assert.equal(followUpImpactStatusLabel('waiting'), 'Waiting on reply');
assert.equal(followUpImpactStatusLabel('protected'), 'Next touch booked');
assert.equal(FOLLOW_UP_QUIET_THRESHOLD_DAYS, 7, 'quiet threshold must match the silence classifier warning window');

// 9. Share-ready Pipeline Defense markdown carries the silence-rescue evidence.
// (Marker checks: the shareable-brief module chain uses extensionless imports
// that Node's type stripping cannot resolve outside the Vite build.)
{
  const shareableSource = readFileSync(new URL('../src/utils/shareablePipelineDefenseBrief.ts', import.meta.url), 'utf8');
  for (const marker of [
    'followUpImpact?: FollowUpImpactSummary | null',
    'Saved From Silence (Last ${impact.windowDays} Days)',
    'if (!impact || impact.followUpsSent === 0) return [];',
    'Deals back in motion:',
  ]) {
    assert.ok(shareableSource.includes(marker), `shareablePipelineDefenseBrief missing marker: ${marker}`);
  }
  const defensePage = readFileSync(new URL('../src/features/pipeline/PipelineReviewDefenseBriefPage.tsx', import.meta.url), 'utf8');
  for (const marker of ['buildFollowUpImpact', 'followUpImpact })']) {
    assert.ok(defensePage.includes(marker), `PipelineReviewDefenseBriefPage missing marker: ${marker}`);
  }
}

// 10. UI contract: the panel is wired into Today and only claims motion, not wins.
const panel = readFileSync(new URL('../src/features/dashboard/FollowUpImpactPanel.tsx', import.meta.url), 'utf8');
for (const marker of ['Saved from silence', 'Quiet deals contacted', 'Deals back in motion', 'Value back in motion', 'followUpsSent === 0']) {
  assert.ok(panel.includes(marker), `FollowUpImpactPanel missing marker: ${marker}`);
}
// Waiting deals must be actionable from the panel, and only waiting deals.
assert.ok(panel.includes("event.status === 'waiting'"), 'Draft follow-up must be limited to waiting deals');
assert.ok(panel.includes('onDraftFollowUp'), 'FollowUpImpactPanel missing onDraftFollowUp wiring');
const dashboard = readFileSync(new URL('../src/features/dashboard/DashboardPage.tsx', import.meta.url), 'utf8');
for (const marker of ['FollowUpImpactPanel', 'buildFollowUpImpact']) {
  assert.ok(dashboard.includes(marker), `DashboardPage missing marker: ${marker}`);
}
const reviewsPage = readFileSync(new URL('../src/features/reviews/SalesReviewsPage.tsx', import.meta.url), 'utf8');
for (const marker of ['FollowUpImpactPanel', 'periodFollowUpImpact', 'periodLabel={period.label}']) {
  assert.ok(reviewsPage.includes(marker), `SalesReviewsPage missing marker: ${marker}`);
}

// 11. Custom review windows: follow-ups are scoped to the selected period.
{
  const impact = buildFollowUpImpact({
    today: '2026-07-05',
    windowDays: 7,
    opportunities: [makeOpportunity()],
    activities: [
      makeActivity({ id: 'touch-old', activityDate: '2026-06-01' }),
      makeActivity({ id: 'fu-in-window', activityType: 'Follow-up', activityDate: '2026-07-01' }),
      makeActivity({ id: 'fu-before-window', activityType: 'Follow-up', activityDate: '2026-06-20' }),
    ],
  });
  assert.equal(impact.followUpsSent, 1, 'only follow-ups inside the review window count');
  assert.equal(impact.windowDays, 7);
}

console.log('Follow-up impact contract verified.');
