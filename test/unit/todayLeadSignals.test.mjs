import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import '../support/reportingCurrency.mjs';
import { buildUnifiedTodayCommandCenter } from '../../src/utils/todayCommandCenter.ts';
import { buildLeadQueue, buildLeadSignals } from '../../src/utils/leadQueue.ts';

const TODAY = '2026-09-16';

const record = (patch = {}) => ({
  id: 'o1', accountName: 'ABC Pharma', opportunityName: 'QC laboratory', stage: 'Lead', status: 'Active',
  estimatedValue: null, currency: 'VND', expectedClosePeriod: '', productOrSolution: '', decisionMaker: '',
  budgetOwner: '', procurementPath: '', technicalCriteria: '', nextAction: '', nextActionDate: '', evidence: '',
  missingContext: '', objectionDebt: '', forecastEvidenceCategory: 'Unsupported', decisionRecommendation: 'Monitor',
  createdAt: '2026-09-02T09:00:00.000Z', updatedAt: '2026-09-02T09:00:00.000Z', storageMode: 'local', ...patch,
});

function today(opportunities, extra = {}) {
  const leadSignals = buildLeadSignals(buildLeadQueue({ opportunities, today: TODAY, ...extra }));
  return buildUnifiedTodayCommandCenter({
    revenueActions: [], opportunities: opportunities.filter((item) => item.stage !== 'Lead'),
    activities: extra.activities || [], leadSignals, today: TODAY,
  });
}

describe('leads on Today', () => {
  test('a lead nobody has contacted is a move that says what, why and what to do', () => {
    const center = today([record()]);
    const move = center.allActions.find((action) => action.source === 'Lead');
    assert.ok(move, 'the lead exception reaches Today');
    assert.equal(move.title, 'Make first contact with ABC Pharma');
    assert.match(move.reason, /never been contacted/);
    assert.match(move.reason, /waiting 14 days/);
    assert.equal(move.href, '/app/leads?state=new');
    assert.equal(move.urgency, 'High', 'two weeks without a first touch is late');
  });

  test('a lead is never asked for a champion or forecast evidence', () => {
    // Even if a caller forgets to separate leads from the pipeline, the deal
    // rules must not grade a lead on MEDDIC.
    const center = buildUnifiedTodayCommandCenter({
      revenueActions: [], opportunities: [record()], activities: [], today: TODAY,
    });
    assert.equal(center.allActions.some((action) => /champion|forecast evidence/i.test(action.title)), false);
  });

  test('a nurtured revisit that has come due is a move; one still parked is not', () => {
    const due = today([record({ nurturedUntil: '2026-09-15', nurtureReason: 'Budget next FY' })], {
      activities: [{ id: 'a', accountName: 'ABC Pharma', opportunityName: 'QC laboratory', linkedOpportunityId: 'o1',
        linkedOpportunityName: 'QC laboratory', linkedAccountName: 'ABC Pharma', linkStatus: 'Linked', activityType: 'Meeting',
        summary: '', nextAction: '', dueDate: '', tags: [], rawNote: '', activityDate: '2026-06-01',
        createdAt: '', updatedAt: '', storageMode: 'local' }],
    });
    const revisit = due.allActions.find((action) => action.id === 'lead-revisit-due');
    assert.ok(revisit);
    assert.match(revisit.title, /^Revisit ABC Pharma/);
    assert.match(revisit.reason, /Budget next FY/);

    const parked = today([record({ nurturedUntil: '2026-12-01' })]);
    assert.equal(parked.allActions.some((action) => action.id === 'lead-revisit-due'), false);
  });

  test('several leads are one move naming them, not one move each', () => {
    const center = today([
      record({ id: 'a', accountName: 'Alpha', opportunityName: 'One' }),
      record({ id: 'b', accountName: 'Beta', opportunityName: 'Two' }),
      record({ id: 'c', accountName: 'Gamma', opportunityName: 'Three' }),
    ]);
    const moves = center.allActions.filter((action) => action.source === 'Lead');
    assert.equal(moves.length, 1);
    assert.equal(moves[0].accountName, '3 leads');
  });

  test('lead moves do not outrank overdue money', () => {
    const center = buildUnifiedTodayCommandCenter({
      revenueActions: [{
        id: 'r1', accountName: 'Customer', label: 'Invoice', amount: 1000, currency: 'VND', baseAmount: 1000,
        status: 'Invoice sent', risk: 'Payment overdue', nextAction: 'Chase payment', dueDate: '2026-09-01',
        href: '/app/revenue', source: 'Quote',
      }],
      opportunities: [], activities: [],
      leadSignals: buildLeadSignals(buildLeadQueue({ opportunities: [record()], today: TODAY })),
      today: TODAY,
    });
    assert.equal(center.topActions[0].source, 'Revenue');
  });
});
