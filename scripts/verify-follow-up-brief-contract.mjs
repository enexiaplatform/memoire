import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateFollowUpBriefMarkdown } from '../src/utils/followUpBrief.ts';

const today = '2026-07-09';

function makeOpportunity(patch = {}) {
  return {
    id: 'opp-1', accountName: 'Apex Labs', opportunityName: 'Validation', stage: 'Negotiation',
    estimatedValue: 100_000_000, currency: 'VND', expectedClosePeriod: '', productOrSolution: '',
    decisionMaker: '', budgetOwner: '', procurementPath: '', technicalCriteria: '',
    nextAction: '', nextActionDate: '', evidence: '', missingContext: '', objectionDebt: '',
    forecastEvidenceCategory: 'Defensible', decisionRecommendation: 'Defend',
    status: 'Active', createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '', storageMode: 'local',
    ...patch,
  };
}

function makeActivity(patch = {}) {
  return {
    id: `a-${Math.random().toString(36).slice(2)}`, accountName: 'Apex Labs', opportunityName: 'Validation',
    activityType: 'Meeting', summary: 'Met the buyer', nextAction: '', dueDate: '', tags: [],
    linkedOpportunityId: 'opp-1', linkedOpportunityName: 'Validation', linkedAccountName: 'Apex Labs',
    linkStatus: 'Linked', rawNote: 'x', activityDate: '2026-07-05', createdAt: '', updatedAt: '', storageMode: 'local',
    ...patch,
  };
}

// 1. Honest empty state: both halves say plainly there is nothing yet.
{
  const markdown = generateFollowUpBriefMarkdown({ activities: [], opportunities: [], periodLabel: 'Week of Jul 6', today });
  assert.ok(markdown.startsWith('# Follow-up Brief - Week of Jul 6'));
  assert.ok(markdown.includes('No active deal is quiet past the silence threshold'), 'empty quiet list must read as healthy, not blank');
  assert.ok(markdown.includes('No follow-ups logged'), 'empty impact must point at Log as sent');
}

// 2. A quiet deal is named with its quiet days and a concrete next step.
{
  const markdown = generateFollowUpBriefMarkdown({
    activities: [makeActivity({ activityDate: '2026-06-15' })],
    opportunities: [makeOpportunity()],
    periodLabel: 'Week of Jul 6',
    today,
  });
  assert.ok(markdown.includes('Apex Labs / Validation: quiet 24d'), 'a quiet deal must be named with its quiet days');
  assert.ok(markdown.includes('going silent'), 'past the critical threshold the label must say going silent');
  assert.ok(markdown.includes('Do next: Draft a follow-up and book the next touch.'), 'a deal without a next action must get the default step');
}

// 3. A deal with a dated next action is planned, not nagged.
{
  const markdown = generateFollowUpBriefMarkdown({
    activities: [makeActivity({ activityDate: '2026-06-15' })],
    opportunities: [makeOpportunity({ nextAction: 'Send recap', nextActionDate: '2026-07-12' })],
    periodLabel: 'Week of Jul 6',
    today,
  });
  assert.ok(markdown.includes('No active deal is quiet past the silence threshold'), 'a planned deal must not be nagged as quiet');
}

// 4. Logged follow-ups are measured: sent count and per-deal status.
{
  const markdown = generateFollowUpBriefMarkdown({
    activities: [
      makeActivity({ activityDate: '2026-06-10' }),
      makeActivity({ activityType: 'Follow-up', activityDate: '2026-07-01', summary: 'Sent the follow-up' }),
      makeActivity({ activityDate: '2026-07-05', summary: 'Customer replied' }),
    ],
    opportunities: [makeOpportunity({ nextAction: 'Send recap', nextActionDate: '2026-07-12' })],
    periodLabel: 'Week of Jul 6',
    today,
  });
  assert.ok(markdown.includes('1 follow-ups sent'), 'the sent count must be measured, not estimated');
  assert.ok(markdown.includes('Apex Labs / Validation:'), 'each measured follow-up must name its deal');
}

// 5. UI wiring: the review page composes and copies the brief.
const reviewsPage = readFileSync(new URL('../src/features/reviews/SalesReviewsPage.tsx', import.meta.url), 'utf8');
assert.ok(reviewsPage.includes('generateFollowUpBriefMarkdown'), 'the review page must compose the Follow-up Brief');
assert.ok(reviewsPage.includes('Follow-up Brief copied.'), 'copying must confirm to the user');
const panel = readFileSync(new URL('../src/features/reviews/WeeklyBusinessReviewPanel.tsx', import.meta.url), 'utf8');
assert.ok(panel.includes('Copy Follow-up Brief'), 'the review panel must expose the copy button');

console.log('Follow-up Brief contract verified.');
