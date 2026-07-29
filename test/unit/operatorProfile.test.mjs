import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildOperatorProfile, profileMinimums } from '../../src/utils/operatorProfile.ts';

const opportunity = (overrides = {}) => ({
  id: 'o1', accountName: 'MDL', opportunityName: 'Analyzer', stage: 'Proposal',
  estimatedValue: 100_000_000, currency: 'VND', status: 'Active',
  createdAt: '2026-01-05', updatedAt: '2026-01-05',
  ...overrides,
});

const outcome = (overrides = {}) => ({
  id: `x-${overrides.opportunityId || 'o1'}`, opportunityId: 'o1', accountName: 'MDL',
  opportunityName: 'Analyzer', outcome: 'Won', outcomeDate: '2026-03-01',
  finalAmount: 100_000_000, currency: 'VND',
  forecastEvidenceCategoryBeforeOutcome: 'Defensible', decisionRecommendationBeforeOutcome: 'Defend',
  stageBeforeOutcome: 'Proposal', reasonCategory: 'Technical fit', reasonText: '',
  createdAt: '2026-03-01', updatedAt: '2026-03-01', storageMode: 'local',
  ...overrides,
});

const activity = (overrides = {}) => ({
  id: 'a1', accountName: 'MDL', linkedAccountName: 'MDL', linkedOpportunityId: 'o1',
  activityType: 'Customer meeting', activityDate: '2026-02-01',
  nextAction: '', dueDate: '', nextActions: [], summary: '', tags: [], rawNote: '',
  ...overrides,
});

/** n closed deals, alternating won/lost, each on its own opportunity. */
function closedSet(count, { wonEvery = 2, amount = 100_000_000 } = {}) {
  const opportunities = [];
  const outcomes = [];
  for (let index = 0; index < count; index += 1) {
    const id = `o${index}`;
    opportunities.push(opportunity({ id, createdAt: '2026-01-01' }));
    outcomes.push(outcome({
      id: `x${index}`,
      opportunityId: id,
      outcome: index % wonEvery === 0 ? 'Won' : 'Lost',
      outcomeDate: '2026-03-01',
      finalAmount: amount,
    }));
  }
  return { opportunities, outcomes };
}

describe('buildOperatorProfile', () => {
  test('says nothing about a cycle it cannot see, and reports what is missing instead', () => {
    const profile = buildOperatorProfile({
      opportunities: [opportunity()],
      opportunityOutcomes: [outcome()],
      activities: [],
      quotes: [],
      today: '2026-03-10',
    });

    assert.equal(profile.traits.find((trait) => trait.id === 'cycle'), undefined);
    const gap = profile.gaps.find((entry) => entry.id === 'cycle');
    assert.ok(gap, 'a trait below its minimum is reported as a gap');
    assert.equal(gap.have, 1);
    assert.equal(gap.need, profileMinimums.cycleEmerging);
    assert.equal(profile.economics.medianCycleDays, null);
  });

  test('measures the cycle from the first captured touch, not from an import date', () => {
    // The deal was created in the workspace on Feb 20 (a CSV import), but the
    // relationship has touches going back to January. Trusting createdAt alone
    // would report a 9-day sales cycle.
    const profile = buildOperatorProfile({
      opportunities: ['o0', 'o1', 'o2'].map((id) => opportunity({ id, createdAt: '2026-02-20' })),
      opportunityOutcomes: ['o0', 'o1', 'o2'].map((id) => outcome({
        id: `x-${id}`, opportunityId: id, outcome: 'Won', outcomeDate: '2026-03-01',
      })),
      activities: ['o0', 'o1', 'o2'].map((id) => activity({ id: `a-${id}`, linkedOpportunityId: id, activityDate: '2026-01-01' })),
      quotes: [],
      today: '2026-03-10',
    });

    assert.equal(profile.economics.medianCycleDays, 59);
    const cycle = profile.traits.find((trait) => trait.id === 'cycle');
    assert.match(cycle.reading, /median of 59 days/);
  });

  test('a no-decision counts against the win rate, because it consumed the same months', () => {
    const opportunities = [];
    const outcomes = [];
    ['Won', 'Won', 'Lost', 'No decision', 'Delayed'].forEach((result, index) => {
      const id = `o${index}`;
      opportunities.push(opportunity({ id }));
      outcomes.push(outcome({ id: `x${index}`, opportunityId: id, outcome: result }));
    });

    const profile = buildOperatorProfile({
      opportunities, opportunityOutcomes: outcomes, activities: [], quotes: [], today: '2026-03-10',
    });

    assert.equal(profile.economics.closedCount, 5);
    assert.equal(profile.economics.wonCount, 2);
    assert.equal(profile.economics.winRate, 0.4);
    const winRate = profile.traits.find((trait) => trait.id === 'winRate');
    assert.match(winRate.reading, /2 of 5/);
  });

  test('one outcome per deal, even when a close was recorded twice', () => {
    const profile = buildOperatorProfile({
      opportunities: [opportunity({ id: 'o1' })],
      opportunityOutcomes: [
        outcome({ id: 'first', opportunityId: 'o1', outcome: 'Lost', outcomeDate: '2026-03-01' }),
        outcome({ id: 'corrected', opportunityId: 'o1', outcome: 'Won', outcomeDate: '2026-03-04' }),
      ],
      activities: [], quotes: [], today: '2026-03-10',
    });

    assert.equal(profile.economics.closedCount, 1);
    assert.equal(profile.economics.wonCount, 1);
  });

  test('the touch pattern needs deals on both sides before it compares them', () => {
    const { opportunities, outcomes } = closedSet(6, { wonEvery: 1 }); // all won
    const activities = opportunities.flatMap((item, index) =>
      Array.from({ length: 4 }, (_, touch) => activity({
        id: `a${index}-${touch}`, linkedOpportunityId: item.id, activityDate: '2026-02-01',
      })));

    const profile = buildOperatorProfile({
      opportunities, opportunityOutcomes: outcomes, activities, quotes: [], today: '2026-03-10',
    });

    assert.equal(profile.traits.find((trait) => trait.id === 'touchPattern'), undefined);
    assert.ok(profile.gaps.find((entry) => entry.id === 'touchPattern'));
  });

  test('reads how many touches separate a win from a loss', () => {
    const opportunities = [];
    const outcomes = [];
    const activities = [];
    // Three wins with six touches each, three losses with two.
    [['Won', 6], ['Won', 6], ['Won', 6], ['Lost', 2], ['Lost', 2], ['Lost', 2]].forEach(([result, touches], index) => {
      const id = `o${index}`;
      opportunities.push(opportunity({ id }));
      outcomes.push(outcome({ id: `x${index}`, opportunityId: id, outcome: result }));
      for (let touch = 0; touch < touches; touch += 1) {
        activities.push(activity({ id: `a${index}-${touch}`, linkedOpportunityId: id, activityDate: '2026-02-01' }));
      }
    });

    const profile = buildOperatorProfile({
      opportunities, opportunityOutcomes: outcomes, activities, quotes: [], today: '2026-03-10',
    });

    const trait = profile.traits.find((entry) => entry.id === 'touchPattern');
    assert.match(trait.reading, /median of 6 captured touches/);
    assert.match(trait.reading, /lose carry 2/);
    assert.match(trait.soWhat, /under 3 touches/);
  });

  test('a touch recorded after the deal closed is not evidence about the deal', () => {
    const opportunities = [];
    const outcomes = [];
    const activities = [];
    [['Won', 3], ['Won', 3], ['Won', 3], ['Lost', 3], ['Lost', 3], ['Lost', 3]].forEach(([result, touches], index) => {
      const id = `o${index}`;
      opportunities.push(opportunity({ id }));
      outcomes.push(outcome({ id: `x${index}`, opportunityId: id, outcome: result, outcomeDate: '2026-03-01' }));
      for (let touch = 0; touch < touches; touch += 1) {
        activities.push(activity({ id: `a${index}-${touch}`, linkedOpportunityId: id, activityDate: '2026-02-01' }));
      }
      // A post-mortem note captured after the close.
      activities.push(activity({ id: `after-${index}`, linkedOpportunityId: id, activityDate: '2026-04-01' }));
    });

    const profile = buildOperatorProfile({
      opportunities, opportunityOutcomes: outcomes, activities, quotes: [], today: '2026-05-01',
    });

    const trait = profile.traits.find((entry) => entry.id === 'touchPattern');
    assert.match(trait.reading, /median of 3 captured touches/);
  });

  test('deal size only becomes a finding when the two bands really differ', () => {
    const opportunities = [];
    const outcomes = [];
    // Small deals win, large deals lose - a 100-point spread.
    [[10_000_000, 'Won'], [10_000_000, 'Won'], [10_000_000, 'Won'],
      [900_000_000, 'Lost'], [900_000_000, 'Lost'], [900_000_000, 'Lost']].forEach(([amount, result], index) => {
      const id = `o${index}`;
      opportunities.push(opportunity({ id }));
      outcomes.push(outcome({ id: `x${index}`, opportunityId: id, outcome: result, finalAmount: amount }));
    });

    const profile = buildOperatorProfile({
      opportunities, opportunityOutcomes: outcomes, activities: [], quotes: [], today: '2026-03-10',
    });

    const trait = profile.traits.find((entry) => entry.id === 'sizeBand');
    assert.match(trait.reading, /100% of deals under/);
    assert.match(trait.soWhat, /big deals are the ones failing/);
  });

  test('an even win rate across sizes is reported as no finding, not as a finding', () => {
    const opportunities = [];
    const outcomes = [];
    [[10_000_000, 'Won'], [10_000_000, 'Lost'], [10_000_000, 'Won'],
      [900_000_000, 'Won'], [900_000_000, 'Lost'], [900_000_000, 'Won']].forEach(([amount, result], index) => {
      const id = `o${index}`;
      opportunities.push(opportunity({ id }));
      outcomes.push(outcome({ id: `x${index}`, opportunityId: id, outcome: result, finalAmount: amount }));
    });

    const profile = buildOperatorProfile({
      opportunities, opportunityOutcomes: outcomes, activities: [], quotes: [], today: '2026-03-10',
    });

    const trait = profile.traits.find((entry) => entry.id === 'sizeBand');
    assert.match(trait.reading, /Deal size does not change your odds/);
    assert.equal(trait.soWhat, undefined);
  });

  test('an account is quiet against its own rhythm, not against a shared threshold', () => {
    // KN is touched every two days and has not been touched for 20; ACH is
    // touched roughly monthly and was last touched 20 days ago, which for ACH is
    // normal. A fixed 14-day rule would flag both.
    const activities = [
      ...['2026-06-01', '2026-06-03', '2026-06-05', '2026-06-07'].map((date, index) => activity({
        id: `kn${index}`, accountName: 'KN', linkedAccountName: 'KN', linkedOpportunityId: '', activityDate: date,
      })),
      ...['2026-03-10', '2026-04-08', '2026-05-09', '2026-06-07'].map((date, index) => activity({
        id: `ach${index}`, accountName: 'ACH', linkedAccountName: 'ACH', linkedOpportunityId: '', activityDate: date,
      })),
    ];

    const profile = buildOperatorProfile({
      opportunities: [], opportunityOutcomes: [], activities, quotes: [], today: '2026-06-27',
    });

    const names = profile.unusuallyQuiet.map((entry) => entry.account);
    assert.deepEqual(names, ['KN']);
    assert.equal(profile.unusuallyQuiet[0].normalGapDays, 2);
    assert.equal(profile.unusuallyQuiet[0].daysSinceTouch, 20);
  });

  test('an account with too little history has no rhythm to be off', () => {
    const activities = ['2026-06-01', '2026-06-03'].map((date, index) => activity({
      id: `kn${index}`, accountName: 'KN', linkedAccountName: 'KN', activityDate: date,
    }));

    const profile = buildOperatorProfile({
      opportunities: [], opportunityOutcomes: [], activities, quotes: [], today: '2026-06-27',
    });

    assert.deepEqual(profile.unusuallyQuiet, []);
  });

  test('quote conversion stays null until enough quoted deals have ended', () => {
    const { opportunities, outcomes } = closedSet(4);
    const quotes = opportunities.map((item, index) => ({
      id: `q${index}`, quoteId: `Q${index}`, accountName: 'MDL', opportunityId: item.id,
      title: '', quoteDate: '2026-02-01', validUntil: '2026-03-01', amount: 1, currency: 'VND',
      grossMarginEstimate: null, discount: null, paymentTerm: '', status: 'Sent',
      poStatus: 'None', deliveryStatus: 'Not started', expectedDeliveryDate: '',
      paymentStatus: 'Not due', paymentDueDate: '', nextAction: '', notes: '',
      createdAt: '2026-02-01', updatedAt: '2026-02-01',
    }));

    const profile = buildOperatorProfile({
      opportunities, opportunityOutcomes: outcomes, activities: [], quotes, today: '2026-03-10',
    });

    assert.equal(profile.economics.quoteToWinRate, null);
    assert.equal(profile.economics.quotedClosedCount, 4);
  });

  test('an empty workspace says so rather than describing a seller it has never seen', () => {
    const profile = buildOperatorProfile({
      opportunities: [], opportunityOutcomes: [], activities: [], quotes: [], today: '2026-03-10',
    });

    assert.deepEqual(profile.traits, []);
    assert.match(profile.headline, /Not enough closed history/);
    assert.equal(profile.economics.winRate, null);
    assert.ok(profile.gaps.length > 0, 'the gaps say what would unlock each reading');
  });
});
