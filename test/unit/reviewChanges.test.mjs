import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import '../support/reportingCurrency.mjs';
import { buildChangesSinceLastReview, resolveReviewWindowStart } from '../../src/utils/reviewChanges.ts';
import { buildLeadFunnel } from '../../src/utils/leadQueue.ts';

const TODAY = '2026-09-16';

const deal = (patch = {}) => ({
  id: 'o1', accountName: 'ABC Pharma', opportunityName: 'QC lab', stage: 'Discovery', status: 'Active',
  estimatedValue: 500_000_000, currency: 'VND', expectedClosePeriod: 'Q4 2026', productOrSolution: '', decisionMaker: '',
  budgetOwner: '', procurementPath: '', technicalCriteria: '', nextAction: '', nextActionDate: '', evidence: '',
  missingContext: '', objectionDebt: '', forecastEvidenceCategory: 'Weak but recoverable', decisionRecommendation: 'Monitor',
  createdAt: '2026-06-01T09:00:00.000Z', updatedAt: '2026-06-01T09:00:00.000Z', storageMode: 'local', ...patch,
});

let eventSeq = 0;
const event = (patch) => ({
  id: `e-${eventSeq += 1}`, userId: null, occurredAt: '2026-09-14T10:00:00.000Z', recordedAt: '2026-09-14T10:00:00.000Z',
  summary: '', structuredPayload: {}, createdAt: '2026-09-14T10:00:00.000Z', opportunityId: 'o1', ...patch,
});

const base = (patch = {}) => ({
  opportunities: [], opportunityOutcomes: [], activities: [], stakeholders: [], events: [], today: TODAY, ...patch,
});

describe('where the window opens', () => {
  test('at the last confirmed review before today', () => {
    const window = resolveReviewWindowStart([
      { confirmedAt: '2026-09-01T08:00:00.000Z' },
      { confirmedAt: '2026-09-08T08:00:00.000Z' },
    ], TODAY);
    assert.equal(window.since, '2026-09-08');
    assert.equal(window.basis, 'last-review');
  });

  test('the last seven days when there has never been a review, and it says so', () => {
    const window = resolveReviewWindowStart([], TODAY);
    assert.equal(window.since, '2026-09-09');
    assert.equal(window.basis, 'last-7-days');
    assert.match(window.sinceLabel, /last 7 days/);
  });
});

describe('only what is proven', () => {
  test('a record edited this week with no event says nothing changed', () => {
    const changes = buildChangesSinceLastReview(base({
      opportunities: [deal({ updatedAt: '2026-09-15T09:00:00.000Z', expectedClosePeriod: 'Q1 2027' })],
    }));
    assert.deepEqual(changes.lines, [], 'updated_at is not evidence of what changed');
  });

  test('a slip is an observed close-period move later, with the pipeline it moved out', () => {
    const changes = buildChangesSinceLastReview(base({
      opportunities: [deal()],
      events: [event({ eventType: 'opportunity_close_period_changed', structuredPayload: { from: 'Q4 2026', to: 'Q1 2027' } })],
    }));
    const slipped = changes.lines.find((line) => line.kind === 'deals-slipped');
    assert.equal(slipped.count, 1);
    assert.equal(slipped.provenance, 'event');
    assert.deepEqual(slipped.sourceIds, ['o1']);
    assert.match(slipped.statement, /moved out/);
  });

  test('a move before the window is not news this period', () => {
    const changes = buildChangesSinceLastReview(base({
      opportunities: [deal()],
      events: [event({ eventType: 'opportunity_close_period_changed', occurredAt: '2026-08-01T00:00:00.000Z', structuredPayload: { from: 'Q3 2026', to: 'Q4 2026' } })],
    }));
    assert.equal(changes.lines.length, 0);
  });

  test('leads added, qualified and disqualified come from creation, events and close-outs', () => {
    const changes = buildChangesSinceLastReview(base({
      opportunities: [
        deal({ id: 'new-lead', stage: 'Lead', createdAt: '2026-09-12T09:00:00.000Z' }),
        deal({ id: 'o1', stage: 'Discovery', createdAt: '2026-09-10T09:00:00.000Z' }),
        deal({ id: 'dq', stage: 'Lost', status: 'Lost', createdAt: '2026-08-01T09:00:00.000Z' }),
      ],
      events: [event({ eventType: 'opportunity_stage_changed', structuredPayload: { from: 'Lead', to: 'Discovery' } })],
      opportunityOutcomes: [{
        id: 'out', opportunityId: 'dq', accountName: 'Old Lead', opportunityName: '', outcome: 'Lost', outcomeDate: '2026-09-13',
        finalAmount: null, currency: 'VND', stageBeforeOutcome: 'Lead', reasonCategory: 'Budget', reasonText: 'No budget - frozen',
        createdAt: '2026-09-13T09:00:00.000Z', updatedAt: '', storageMode: 'local',
      }],
    }));
    const kinds = Object.fromEntries(changes.lines.map((line) => [line.kind, line.count]));
    assert.equal(kinds['leads-added'], 2, 'the lead qualified the same week still arrived as a lead');
    assert.equal(kinds['leads-qualified'], 1);
    assert.equal(kinds['leads-disqualified'], 1);
    assert.equal(kinds['deals-added'], undefined, 'a qualified lead is not a deal opened directly');
    assert.equal(kinds['deals-lost'], undefined, 'a disqualified lead is not a lost deal');
  });

  test('an account goes quiet in the window only if the silence began in it', () => {
    const touch = (activityDate) => ({ id: activityDate, accountName: 'ABC Pharma', linkedAccountName: 'ABC Pharma', activityDate });
    const began = buildChangesSinceLastReview(base({ opportunities: [deal()], activities: [touch('2026-08-28')] }));
    assert.equal(began.lines.find((line) => line.kind === 'accounts-went-quiet')?.count, 1);
    const already = buildChangesSinceLastReview(base({ opportunities: [deal()], activities: [touch('2026-07-01')] }));
    assert.equal(already.lines.some((line) => line.kind === 'accounts-went-quiet'), false);
  });

  test('money that cannot be converted is counted as unpriced, never as zero', () => {
    const changes = buildChangesSinceLastReview(base({
      opportunities: [deal({ currency: 'XYZ' })],
      events: [event({ eventType: 'opportunity_close_period_changed', structuredPayload: { from: 'Q4 2026', to: 'Q2 2027' } })],
    }));
    const slipped = changes.lines.find((line) => line.kind === 'deals-slipped');
    assert.equal(slipped.amountBase, null);
    assert.equal(slipped.unpricedCount, 1);
  });

  test('demo records never reach a real review', () => {
    const changes = buildChangesSinceLastReview(base({
      opportunities: [deal({ id: 'demo', stage: 'Lead', isSample: true, createdAt: '2026-09-12T00:00:00.000Z' })],
    }));
    assert.equal(changes.lines.length, 0);
  });
});

describe('the lead funnel', () => {
  const lead = (id, patch = {}) => deal({ id, accountName: id, opportunityName: id, stage: 'Lead', createdAt: '2026-09-01T00:00:00.000Z', ...patch });

  test('counts only what the records prove started as a lead', () => {
    const funnel = buildLeadFunnel({
      opportunities: [
        lead('a', { leadSource: 'Trade show' }),
        lead('b', { stage: 'Discovery', leadSource: 'Trade show' }),
        deal({ id: 'never-a-lead', stage: 'Discovery' }),
      ],
      activities: [{ id: 't', accountName: 'a', opportunityName: 'a', linkedOpportunityId: 'a', linkedOpportunityName: 'a', linkStatus: 'Linked', activityDate: '2026-09-04' }],
      events: [{ eventType: 'opportunity_stage_changed', opportunityId: 'b', occurredAt: '2026-09-11T00:00:00.000Z', structuredPayload: { from: 'Lead', to: 'Discovery' } }],
      outcomes: [],
    });
    assert.equal(funnel.leads, 2);
    assert.equal(funnel.engaged, 1);
    assert.equal(funnel.qualified, 1);
    assert.equal(funnel.medianDaysToFirstTouch, 3);
    assert.equal(funnel.medianDaysToQualify, 10);
    assert.equal(funnel.qualifiedRate, null, 'two leads is not a rate');
    assert.deepEqual(funnel.bySource[0], { label: 'Trade show', leads: 2, qualified: 1, won: 0, qualifiedRate: null });
  });

  test('disqualification reasons are counted from the close-outs', () => {
    const funnel = buildLeadFunnel({
      opportunities: [lead('x', { stage: 'Lost', status: 'Lost' }), lead('y', { stage: 'Lost', status: 'Lost' })],
      activities: [], events: [],
      outcomes: [
        { opportunityId: 'x', outcome: 'Lost', stageBeforeOutcome: 'Lead', reasonText: 'No budget - frozen', createdAt: '' },
        { opportunityId: 'y', outcome: 'Lost', stageBeforeOutcome: 'Lead', reasonText: 'No budget', createdAt: '' },
      ],
    });
    assert.deepEqual(funnel.disqualifyReasons, [{ reason: 'No budget', count: 2 }]);
  });
});
