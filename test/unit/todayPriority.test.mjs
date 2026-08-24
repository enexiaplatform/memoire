import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import '../support/reportingCurrency.mjs';
import { buildUnifiedTodayCommandCenter } from '../../src/utils/todayCommandCenter.ts';
import { buildPipelineDefenseCenter } from '../../src/utils/pipelineDefenseCenter.ts';
import { buildProactiveNudges, classifyOpportunitySilence } from '../../src/utils/proactiveNudges.ts';

const TODAY = '2026-08-24';

const deal = (id, opportunity, estimatedValue) => ({
  id,
  account: `Account ${id}`,
  opportunity,
  pipelineContext: 'Stage: Proposal.',
  dealTruth: 'Under review.',
  riskType: ['Decision timeline'],
  evidence: ['Customer asked for a proposal.'],
  missingContext: ['Economic buyer'],
  objectionDebt: { objection: '', evidence: '', requiredAction: '', owner: '', status: 'Open' },
  forecastEvidenceCategory: 'Weak but recoverable',
  recommendedAction: opportunity,
  pipelineReviewAnswer: 'This deal needs rescue before review.',
  decisionRecommendation: 'Rescue',
  estimatedValue,
  currency: 'VND',
  // No due date, which is what an imported book looks like and the case where
  // the title used to decide.
  nextActionDate: '',
  lastSignalDate: '2026-08-01',
});

const brief = {
  id: 'brief-1', title: 'Review', weekLabel: 'Week', salesOwner: 'Seller', scope: 'Active pipeline',
  createdAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z', storageMode: 'local',
  // Named so that alphabetical order and money order disagree.
  deals: [
    deal('d-small', 'Answer the procurement questionnaire', 187_000_000),
    deal('d-mid', 'Agree retention terms with procurement', 412_000_000),
    deal('d-big', 'Agree the pilot site and scope', 460_000_000),
  ],
};

describe('what Today tells you to start with', () => {
  const center = buildUnifiedTodayCommandCenter({
    briefs: [brief],
    revenueActions: [],
    opportunities: [],
    activities: [],
    today: TODAY,
    pipelineHealth: buildPipelineDefenseCenter(brief.deals, TODAY),
  });

  test('the biggest deal comes first when everything else ties', () => {
    // All three are "Rescue before review" and none carries a due date, so the
    // sort used to fall through to `title.localeCompare`: "Agree retention"
    // (412,000) above "Agree the pilot" (460,000), and "Answer the..." third.
    // Every card printed its own amount while the page ignored it.
    assert.deepEqual(
      center.topActions.map((action) => action.amountBase),
      [460_000_000, 412_000_000, 187_000_000],
    );
  });

  test('the money reaches the card as a number, not only as a label', () => {
    assert.equal(typeof center.topActions[0].amountBase, 'number');
    assert.ok(center.topActions[0].moneyLabel.includes('460,000,000'));
  });
});

const opportunity = (overrides = {}) => ({
  id: 'opp-frulact',
  accountName: 'Frulact',
  opportunityName: 'Refrigeration heat reclaim - Maia',
  stage: 'Technical discussion',
  estimatedValue: 158_000,
  currency: 'VND',
  expectedClosePeriod: 'Q4 2026',
  productOrSolution: 'Refrigeration heat reclaim',
  decisionMaker: '', budgetOwner: '', procurementPath: '', technicalCriteria: '',
  nextAction: 'Run the site measurement week',
  // The field the silence rule used to be able to read, deliberately empty:
  // a promise made inside a capture never writes it.
  nextActionDate: '',
  evidence: '', missingContext: '', objectionDebt: '',
  forecastEvidenceCategory: 'Weak but recoverable',
  decisionRecommendation: 'Monitor',
  status: 'Active',
  createdAt: '2026-03-01T00:00:00.000Z',
  updatedAt: '2026-08-23T00:00:00.000Z',
  storageMode: 'local',
  ...overrides,
});

describe('a deal with a promise on it is not silent', () => {
  const dealCommitment = {
    opportunityId: 'opp-frulact',
    accountName: 'Frulact',
    currentDueDate: '2026-09-01',
    status: 'open',
  };

  test('a dated promise linked to the deal counts as planned', () => {
    const silence = classifyOpportunitySilence(opportunity(), [], TODAY, [dealCommitment]);
    assert.equal(silence.status, 'planned');
  });

  test('without the promise it is still called silent, as before', () => {
    const silence = classifyOpportunitySilence(opportunity(), [], TODAY, []);
    assert.notEqual(silence.status, 'planned');
  });

  test('a settled promise does not keep a dead deal alive', () => {
    const settled = { ...dealCommitment, status: 'kept' };
    assert.notEqual(classifyOpportunitySilence(opportunity(), [], TODAY, [settled]).status, 'planned');
  });

  test('Today raises no going-silent alarm over a booked follow-up', () => {
    // Today was showing "Follow up - Frulact - due Sep 1" in Coming up and, on
    // the same screen, a Critical nudge saying nothing was scheduled for it.
    const center = buildProactiveNudges({
      opportunities: [opportunity()],
      activities: [],
      plannedCommitments: [dealCommitment],
      today: TODAY,
    });
    const silentNudges = center.allActiveNudges.filter((nudge) => nudge.title === 'Deal going silent');
    assert.deepEqual(silentNudges, []);
  });

  test('a promise on the account but not the deal is said out loud, not as an alarm', () => {
    const accountOnly = { ...dealCommitment, opportunityId: null };
    const center = buildProactiveNudges({
      opportunities: [opportunity()],
      activities: [],
      plannedCommitments: [accountOnly],
      today: TODAY,
    });
    const nudge = center.allActiveNudges.find((item) => item.entityId?.includes('opp-frulact'));
    assert.ok(nudge, 'the deal still deserves a mention');
    assert.equal(nudge.urgency, 'high', 'not Critical when a date exists on the customer');
    assert.equal(/no next action is scheduled/.test(nudge.reason), false);
    assert.ok(/has a commitment dated/.test(nudge.reason), `got: ${nudge.reason}`);
  });
});

describe('the watch-list is capped, so its order decides what is seen', () => {
  test('the bigger deal outranks the smaller one when both are equally urgent', () => {
    // A 266 EUR leftover sat above a 158,000 EUR deal at the top of the list,
    // both Critical, because "L" sorts before "R".
    const tiny = opportunity({
      id: 'opp-tiny', accountName: 'Mai Nguyen', opportunityName: 'Landing page audit',
      estimatedValue: 267, updatedAt: '2026-08-23T00:00:00.000Z',
    });
    const big = opportunity({ id: 'opp-big', estimatedValue: 158_000 });
    const center = buildProactiveNudges({
      opportunities: [tiny, big],
      activities: [],
      today: TODAY,
    });
    const ordered = center.todayNudges
      .filter((nudge) => nudge.source === 'opportunity' && nudge.title === 'Deal going silent')
      .map((nudge) => nudge.accountName);
    assert.equal(ordered[0], 'Frulact', `expected the 158,000 deal first, got ${ordered.join(', ')}`);
  });
});

const cockpitDeal = (id, accountName, opportunityName, stage, estimatedValue) => opportunity({
  id, accountName, opportunityName, stage, estimatedValue, nextAction: 'Send the revised model',
});

const touch = (accountName, opportunityName, activityDate, buyingSignals = []) => ({
  accountName, opportunityName, activityDate, buyingSignals, linkedOpportunityId: '',
});

describe('the two questions Today opens the day with', () => {
  const deals = [
    cockpitDeal('o-small', 'Vila Gale Hoteis', 'Compressed air audit', 'Qualification', 48_500),
    cockpitDeal('o-big', 'Lactogal', 'VSD retrofit', 'Negotiation', 412_000),
    cockpitDeal('o-mid', 'Gallo Vidro', 'Furnace ORC feasibility', 'Discovery', 540_000),
  ];

  test('"what moves money today" names the money, not the loudest risk', async () => {
    const { buildBusinessCockpit } = await import('../../src/utils/businessCockpit.ts');
    // The old card read the top row of the revenue *risk* feed whatever it was,
    // so a 3.6M book answered with a 48,500 deal marked "Rescue".
    const answers = buildBusinessCockpit({
      commercialRiskItems: [{
        id: 'r1', accountName: 'Vila Gale Hoteis', label: 'Compressed air audit', amount: 48_500,
        currency: 'VND', baseAmount: 48_500, status: 'Active', risk: 'Weak pipeline',
        nextAction: 'Re-test the forecast', dueDate: '', href: '/app/opportunities', source: 'Opportunity',
      }],
      nudges: [], opportunities: deals, captureInboxCount: 0, today: TODAY,
    });
    const money = answers.find((item) => item.id === 'money');
    assert.ok(money.answer.includes('Lactogal'), `expected the deal closest to signing, got: ${money.answer}`);
    assert.equal(money.urgent, false, 'a deal sitting where it should be is not an alarm');
  });

  test('money that is genuinely late still leads', async () => {
    const { buildBusinessCockpit } = await import('../../src/utils/businessCockpit.ts');
    const answers = buildBusinessCockpit({
      commercialRiskItems: [{
        id: 'r2', accountName: 'Apex', label: 'Quote', amount: 100_000, currency: 'VND',
        baseAmount: 100_000, status: 'Sent', risk: 'Payment overdue', nextAction: 'Chase payment',
        dueDate: '', href: '/app/revenue', source: 'Quote',
      }],
      nudges: [], opportunities: deals, captureInboxCount: 0, today: TODAY,
    });
    const money = answers.find((item) => item.id === 'money');
    assert.ok(money.answer.includes('Payment overdue'));
    assert.equal(money.urgent, true);
  });

  test('"which deals are hot" answers with movement, never with an alarm', async () => {
    const { buildBusinessCockpit } = await import('../../src/utils/businessCockpit.ts');
    const answers = buildBusinessCockpit({
      commercialRiskItems: [], nudges: [], opportunities: deals, captureInboxCount: 0, today: TODAY,
      activities: [
        touch('Gallo Vidro', 'Furnace ORC feasibility', '2026-08-20', ['Approved in principle']),
        touch('Vila Gale Hoteis', 'Compressed air audit', '2026-08-22'),
      ],
    });
    const hot = answers.find((item) => item.id === 'deals');
    // A recorded buying signal beats a bare touch, however recent.
    assert.ok(hot.answer.includes('Gallo Vidro'), `got: ${hot.answer}`);
    assert.ok(hot.detail.includes('Approved in principle'));
    assert.equal(hot.urgent, false, 'movement is good news');
  });

  test('with nothing moving it says so instead of borrowing an alarm', async () => {
    const { buildBusinessCockpit } = await import('../../src/utils/businessCockpit.ts');
    const answers = buildBusinessCockpit({
      commercialRiskItems: [], nudges: [], opportunities: deals, captureInboxCount: 0, today: TODAY,
      activities: [touch('Gallo Vidro', 'Furnace ORC feasibility', '2026-01-05')],
    });
    const hot = answers.find((item) => item.id === 'deals');
    assert.ok(/No deal has moved/.test(hot.answer), `got: ${hot.answer}`);
    assert.equal(hot.actionable, false);
  });

  test('the two cards never stand on the same deal', async () => {
    const { buildBusinessCockpit } = await import('../../src/utils/businessCockpit.ts');
    const answers = buildBusinessCockpit({
      commercialRiskItems: [], nudges: [], opportunities: deals, captureInboxCount: 0, today: TODAY,
      activities: [touch('Lactogal', 'VSD retrofit', '2026-08-22')],
    });
    const money = answers.find((item) => item.id === 'money');
    const hot = answers.find((item) => item.id === 'deals');
    assert.notEqual(money.opportunityId, hot.opportunityId);
  });
});

describe('a workspace that failed to load is not a new account', () => {
  test('a failed load never opens the welcome screen', async () => {
    const { shouldOpenFirstRun } = await import('../../src/utils/firstRun.ts');
    // `loadDashboardData` rejects rather than hand back a partial workspace, so
    // a cloud that does not answer leaves exactly the shape a brand-new account
    // leaves: no records. Today read that and sent an operator with 27 deals to
    // "Record it once. Nothing goes quiet after that."
    assert.equal(shouldOpenFirstRun({
      userKey: 'user-1', hasAnyRecord: false, sampleDataActive: false, state: null, loadFailed: true,
    }), false);
  });

  test('a genuinely empty workspace still gets the welcome', async () => {
    const { shouldOpenFirstRun } = await import('../../src/utils/firstRun.ts');
    assert.equal(shouldOpenFirstRun({
      userKey: 'user-1', hasAnyRecord: false, sampleDataActive: false, state: null,
    }), true);
    assert.equal(shouldOpenFirstRun({
      userKey: 'user-1', hasAnyRecord: false, sampleDataActive: false, state: null, loadFailed: false,
    }), true);
  });

  test('a workspace with records is never sent there either way', async () => {
    const { shouldOpenFirstRun } = await import('../../src/utils/firstRun.ts');
    assert.equal(shouldOpenFirstRun({
      userKey: 'user-1', hasAnyRecord: true, sampleDataActive: false, state: null, loadFailed: true,
    }), false);
  });
});
