import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildCommercialJourneySnapshot, formatJourneyCommitment } from '../src/utils/commercialJourney.ts';

const today = '2026-07-09';

function makeOpportunity(patch = {}) {
  return {
    id: 'opp-1', accountName: 'Apex Labs', opportunityName: 'Validation', stage: 'Negotiation',
    estimatedValue: 100_000_000, currency: 'VND', expectedClosePeriod: '', productOrSolution: '',
    decisionMaker: '', budgetOwner: '', procurementPath: '', technicalCriteria: '',
    nextAction: 'Send revised quote', nextActionDate: '2026-07-12', evidence: 'Budget approved.',
    missingContext: '', objectionDebt: 'Lead time concern',
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

function makeQuote(patch = {}) {
  return {
    id: 'q-1', quoteId: 'Q-1', accountName: 'Apex Labs', opportunityId: 'opp-1', opportunityName: 'Validation',
    title: 'Validation quote', quoteDate: '2026-06-20', validUntil: '2026-07-20', amount: 100_000_000,
    currency: 'VND', grossMarginEstimate: null, discount: null, paymentTerm: '', status: 'Accepted',
    poStatus: 'Received', deliveryStatus: 'Delivered', expectedDeliveryDate: '', paymentStatus: 'Due',
    paymentDueDate: '2026-07-01', nextAction: '', notes: '', createdAt: '', updatedAt: '',
    ...patch,
  };
}

// 1. With a quote, the money flow speaks for the journey position.
{
  const snapshot = buildCommercialJourneySnapshot({
    opportunity: makeOpportunity(),
    quotes: [makeQuote()],
    activities: [makeActivity()],
    objections: [],
    today,
  });
  assert.equal(snapshot.position, 'Pending payment');
  assert.equal(snapshot.positionSource, 'money-flow');
  assert.ok(snapshot.moneyStatus.includes('Payment overdue'), 'overdue payment must surface as stuck money');
  assert.equal(snapshot.lastTouch?.date, '2026-07-05');
  assert.equal(formatJourneyCommitment(snapshot.nextCommitment), 'Send revised quote - Jul 12, 2026');
}

// 2. Without a quote, the sales stage speaks for the journey head.
{
  const snapshot = buildCommercialJourneySnapshot({
    opportunity: makeOpportunity(),
    quotes: [],
    activities: [],
    objections: [],
    today,
  });
  assert.equal(snapshot.position, 'Negotiation');
  assert.equal(snapshot.positionSource, 'stage');
  assert.equal(snapshot.moneyStatus, 'No quote yet');
  assert.equal(snapshot.lastTouch, null);
}

// 3. Blockers: an open objection beats the static objection-debt text; risk names silence.
{
  const snapshot = buildCommercialJourneySnapshot({
    opportunity: makeOpportunity({ nextActionDate: '', nextAction: '', forecastEvidenceCategory: 'Hope-based' }),
    quotes: [],
    activities: [makeActivity({ activityDate: '2026-06-20' })],
    objections: [{
      id: 'ob-1', accountId: '', accountName: 'Apex Labs', opportunityId: 'opp-1', opportunityName: 'Validation',
      stakeholderId: '', stakeholderName: '', sourceActivityId: '', objectionType: 'Price',
      objectionText: 'Too expensive vs incumbent', impact: 'High', status: 'Open',
      requiredProof: '', responsePlan: '', resolutionNote: '', dueDate: '', resolvedAt: '', tags: [],
      createdAt: '', updatedAt: '', storageMode: 'local',
    }],
    today,
  });
  assert.equal(snapshot.blocker, 'Too expensive vs incumbent');
  assert.ok(snapshot.riskStatus.includes('Going silent (quiet 19d)'), 'silence must be named with quiet days');
  assert.ok(snapshot.riskStatus.includes('Hope-based forecast'));
}

// 4. Healthy deal reads honestly.
{
  const snapshot = buildCommercialJourneySnapshot({
    opportunity: makeOpportunity({ objectionDebt: '' }),
    quotes: [],
    activities: [makeActivity({ activityDate: '2026-07-08' })],
    objections: [],
    today,
  });
  assert.equal(snapshot.riskStatus, 'No active risk signal');
  assert.equal(snapshot.blocker, '');
}

// 5. UI contract: the ledger's detail modal shows where the deal stands.
const ledger = readFileSync(new URL('../src/features/calendar/SalesActivityCalendarPage.tsx', import.meta.url), 'utf8');
for (const marker of ['buildCommercialJourneySnapshot', 'Where this deal stands', 'Next commitment', 'formatJourneyCommitment']) {
  assert.ok(ledger.includes(marker), `Activity Ledger missing journey marker: ${marker}`);
}

console.log('Commercial journey read-model contract verified.');
