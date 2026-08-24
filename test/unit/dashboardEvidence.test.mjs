import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import '../support/reportingCurrency.mjs';
import { buildMasterDashboard } from '../../src/utils/masterDashboard.ts';
import { buildBusinessLens } from '../../src/utils/businessLens.ts';

const TODAY = '2026-08-24';

const deal = (id, overrides = {}) => ({
  id,
  accountName: `Account ${id}`,
  opportunityName: `Deal ${id}`,
  stage: 'Proposal',
  estimatedValue: 100_000,
  currency: 'VND',
  expectedClosePeriod: 'Q4 2026',
  productOrSolution: '',
  decisionMaker: '',
  budgetOwner: '', procurementPath: '', technicalCriteria: '',
  nextAction: 'Send it', nextActionDate: '',
  evidence: '', missingContext: '', objectionDebt: '',
  forecastEvidenceCategory: 'Weak but recoverable',
  decisionRecommendation: 'Monitor',
  status: 'Active',
  createdAt: '2026-03-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  storageMode: 'local',
  ...overrides,
});

const touch = (accountName, opportunityName) => ({
  id: `t-${accountName}`, accountName, opportunityName, contactName: '', stakeholderName: '',
  stakeholderRole: '', competitors: [], buyingSignals: [], risks: [], timelineSignals: [],
  nextActions: [], activityType: 'Customer meeting', summary: '', nextAction: '', dueDate: '',
  tags: [], rawNote: '', activityDate: '2026-08-20', linkedOpportunityId: '',
  linkedOpportunityName: '', linkedAccountName: accountName, linkStatus: 'Unlinked',
  createdAt: '2026-08-20T00:00:00.000Z', updatedAt: '2026-08-20T00:00:00.000Z', storageMode: 'local',
});

const model = (opportunities, activities = []) => buildMasterDashboard({
  opportunities, activities, quotes: [], expenses: [], opportunityOutcomes: [], today: TODAY,
});

describe('"Is the pipeline believable?" when nobody has graded it', () => {
  test('an ungraded book is reported as ungraded, not as one colour', () => {
    // An imported book carries the same forecast category on every row, so the
    // card drew one full-width bar reading "Weak but recoverable: 18" - the
    // whole pipeline in one colour, answering nothing, under a subtitle
    // promising evidence "not how they feel".
    const result = model([deal('a'), deal('b'), deal('c')]);
    assert.equal(result.evidence.graded, false);
    assert.equal(result.evidence.activeDeals, 3);
  });

  test('once two grades are in play it is graded', () => {
    const result = model([deal('a'), deal('b', { forecastEvidenceCategory: 'Defensible' })]);
    assert.equal(result.evidence.graded, true);
  });

  test('the records answer even when the operator has not', () => {
    const result = model(
      [
        deal('a'),
        deal('b', { decisionMaker: 'Sofia Marques' }),
        deal('c', { nextActionDate: '2026-09-01' }),
      ],
      [touch('Account a', 'Deal a')],
    );
    assert.equal(result.evidence.noTouch, 2, 'two of the three have no touch');
    assert.equal(result.evidence.noDecisionMaker, 2);
    assert.equal(result.evidence.noNextStep, 2);
  });

  test('a touch linked by id counts even when the names do not match', () => {
    const linked = { ...touch('Someone else', 'Another name'), linkedOpportunityId: 'a' };
    const result = model([deal('a')], [linked]);
    assert.equal(result.evidence.noTouch, 0);
  });

  test('closed deals are not judged', () => {
    const result = model([deal('a', { status: 'Won' }), deal('b')]);
    assert.equal(result.evidence.activeDeals, 1);
  });
});

describe('the customer count the concentration line claims', () => {
  test('it counts customers with open deals, and says so', () => {
    // The sentence said "N customers in total" directly under a tile reading
    // "Customers 21", on a workspace where 18 of them had a live deal.
    const lens = buildBusinessLens({
      // Five accounts on the books; only four of them carry an open deal.
      accounts: ['a', 'b', 'c', 'd', 'e', 'f', 'dormant'].map((id) => ({
        id: `acc-${id}`, accountName: `Account ${id}`, accountCode: '', industry: '', location: '',
        relationshipStage: 'New', potential: 'Unknown', notes: '', createdAt: '2026-03-01T00:00:00.000Z',
        updatedAt: '2026-03-01T00:00:00.000Z', storageMode: 'local',
      })),
      // Six, so the top three are half the pipeline rather than most of it -
      // the concentrated case has copy of its own.
      opportunities: ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => deal(id)),
      activities: [],
      today: TODAY,
    });
    const headline = lens.concentration.headline;
    assert.equal(/in total/.test(headline), false, headline);
    assert.ok(/with open deals/.test(headline), headline);
    // The claim and the tile beside it must not disagree.
    assert.equal(lens.accounts.total, 7);
  });
});

describe('the touches tile measures one window, not two', () => {
  test('deal coverage is counted over the same thirty days the tile counts', () => {
    // The detail line under "Touches, last 30 days" must be measured over those
    // thirty days. Counting deals touched *ever* put "3" above "8 of 18",
    // which is two windows read as one.
    const old = { ...touch('Account a', 'Deal a'), activityDate: '2026-01-05' };
    const recent = { ...touch('Account b', 'Deal b'), activityDate: '2026-08-20' };
    const result = model([deal('a'), deal('b'), deal('c')], [old, recent]);
    assert.equal(result.evidence.touchedLast30, 1, 'only the August touch is inside the window');
    assert.equal(result.evidence.noTouch, 1, 'but two of the three have been touched at some point');
  });

  test('a deal touched today counts', () => {
    const result = model([deal('a')], [{ ...touch('Account a', 'Deal a'), activityDate: TODAY }]);
    assert.equal(result.evidence.touchedLast30, 1);
  });
});
