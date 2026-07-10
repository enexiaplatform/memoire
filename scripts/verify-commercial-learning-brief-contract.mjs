import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateCommercialLearningBriefMarkdown } from '../src/utils/commercialLearningBrief.ts';

const today = '2026-07-09';

function makeOutcome(patch = {}) {
  return {
    id: `out-${Math.random().toString(36).slice(2)}`,
    opportunityId: `opp-${Math.random().toString(36).slice(2)}`,
    accountName: 'Summit Diagnostics',
    opportunityName: 'QC workflow',
    outcome: 'Won',
    outcomeDate: '2026-06-01',
    finalAmount: null,
    currency: 'VND',
    forecastEvidenceCategoryBeforeOutcome: 'Defensible',
    decisionRecommendationBeforeOutcome: 'Defend',
    stageBeforeOutcome: 'Negotiation',
    reasonCategory: 'Other',
    reasonText: '',
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    storageMode: 'local',
    ...patch,
  };
}

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
    forecastEvidenceCategory: 'Defensible',
    decisionRecommendation: 'Defend',
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

// 1. Empty history: every section states plainly that the data is too thin.
//    The brief must never fake confidence on weak data (AI-role rule 3).
{
  const markdown = generateCommercialLearningBriefMarkdown({
    objections: [],
    opportunityOutcomes: [],
    opportunities: [],
    activities: [],
    periodLabel: 'Week of Jul 6',
    today,
  });
  assert.ok(markdown.startsWith('# Commercial Learning Brief - Week of Jul 6'), 'brief must lead with its period');
  assert.ok(markdown.includes('Built from measured history only'), 'brief must declare its evidence-only sourcing');
  for (const section of [
    '## Forecast calibration',
    '## What follow-ups changed (last 30 days)',
    '## What worked against objections',
    '## Outcome patterns',
  ]) {
    assert.ok(markdown.includes(section), `brief missing section: ${section}`);
  }
  for (const honesty of [
    'No closed outcomes yet - no win-rate history to learn from.',
    'No follow-ups logged - use "Log as sent" so rescues become measurable.',
    'Not enough objection history yet - log resolution notes when objections close.',
    'Learning will improve after more closed outcomes',
  ]) {
    assert.ok(markdown.includes(honesty), `brief missing thin-data statement: ${honesty}`);
  }
}

// 2. Populated history: measured layers compose into the brief.
{
  const markdown = generateCommercialLearningBriefMarkdown({
    objections: [],
    opportunityOutcomes: [
      makeOutcome(), makeOutcome(), makeOutcome({ outcome: 'Lost', reasonCategory: 'Price' }), makeOutcome({ outcome: 'Delayed' }),
    ],
    opportunities: [makeOpportunity()],
    activities: [
      makeActivity({ id: 'touch-old', activityDate: '2026-06-10' }),
      makeActivity({ id: 'fu-1', activityType: 'Follow-up', tags: ['follow-up'], activityDate: '2026-06-28' }),
      makeActivity({ id: 'touch-reply', activityType: 'Call', activityDate: '2026-07-02' }),
    ],
    periodLabel: 'Week of Jul 6',
    today,
  });
  assert.ok(markdown.includes('Defensible: 50%'), 'forecast section must carry the measured win rate');
  assert.ok(!markdown.includes('No closed outcomes yet'), 'thin-data line must disappear once outcomes exist');
  assert.ok(/1 follow-ups sent/.test(markdown), 'follow-up section must count logged follow-ups');
  assert.ok(!markdown.includes('No follow-ups logged'), 'thin-data line must disappear once follow-ups exist');
}

// 3. UI contract: the brief is copyable from the Weekly Business Review header.
const panel = readFileSync(new URL('../src/features/reviews/WeeklyBusinessReviewPanel.tsx', import.meta.url), 'utf8');
for (const marker of ['Copy Learning Brief', 'onCopyLearningBrief']) {
  assert.ok(panel.includes(marker), `WeeklyBusinessReviewPanel missing marker: ${marker}`);
}
const page = readFileSync(new URL('../src/features/reviews/SalesReviewsPage.tsx', import.meta.url), 'utf8');
for (const marker of ['generateCommercialLearningBriefMarkdown', 'onCopyLearningBrief']) {
  assert.ok(page.includes(marker), `SalesReviewsPage missing marker: ${marker}`);
}

console.log('Commercial Learning Brief contract verified.');
