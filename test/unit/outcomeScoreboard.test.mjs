import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import '../support/reportingCurrency.mjs';
import { buildOutcomeScoreboard } from '../../src/utils/outcomeScoreboard.ts';

const outcome = (id, overrides = {}) => ({
  id,
  opportunityId: `opp-${id}`,
  accountName: 'DP Lab',
  opportunityName: `Deal ${id}`,
  outcome: 'Won',
  outcomeDate: '2026-07-15',
  finalAmount: 100_000_000,
  currency: 'VND',
  forecastEvidenceCategoryBeforeOutcome: 'Defensible',
  decisionRecommendationBeforeOutcome: 'Advance',
  stageBeforeOutcome: 'Negotiation',
  pipelineProbabilityBeforeOutcome: 70,
  reasonCategory: 'Price',
  reasonText: '',
  createdAt: '2026-07-15T00:00:00.000Z',
  updatedAt: '2026-07-15T00:00:00.000Z',
  storageMode: 'local',
  ...overrides,
});

const week = {
  kind: 'week',
  label: 'Jul 13 - Jul 19',
  start: '2026-07-13',
  end: '2026-07-19',
};

const target = (period, amount, fiscalYear = 2026) => ({ period, fiscalYear, amount });

describe('outcome scoreboard: what the period produced', () => {
  test('a period is graded on what closed in it, not on what the pipeline hopes', () => {
    const board = buildOutcomeScoreboard({
      period: week,
      outcomes: [
        outcome('a'),
        outcome('b', { outcome: 'Lost', finalAmount: 50_000_000 }),
        // Outside the window - counted by the quarter, not by the week.
        outcome('c', { outcomeDate: '2026-07-02' }),
      ],
      quotes: [],
      activities: [],
      targets: [],
      today: '2026-07-20',
    });

    assert.equal(board.won.count, 1);
    assert.equal(board.won.valueBase, 100_000_000);
    assert.equal(board.lost.count, 1);
    assert.equal(board.winRate, 0.5);
    assert.equal(board.movement.dealsDecided, 2);
  });

  test('the previous period is the same window, one step back', () => {
    const board = buildOutcomeScoreboard({
      period: week,
      outcomes: [outcome('a'), outcome('last', { outcomeDate: '2026-07-08' })],
      quotes: [],
      activities: [],
      targets: [],
      today: '2026-07-20',
    });

    assert.equal(board.won.count, 1);
    assert.equal(board.previousWon.count, 1);
    assert.equal(board.previousWon.valueBase, 100_000_000);
  });

  test('quotes and touches inside the window are counted as movement', () => {
    const board = buildOutcomeScoreboard({
      period: week,
      outcomes: [],
      quotes: [
        { id: 'q1', quoteDate: '2026-07-14', status: 'Sent' },
        { id: 'q2', quoteDate: '2026-07-15', status: 'Accepted' },
        { id: 'q3', quoteDate: '2026-06-30', status: 'Sent' },
        { id: 'q4', quoteDate: '2026-07-15', status: 'Sent', __deleted: true },
      ],
      activities: [
        { id: 'a1', activityDate: '2026-07-14', accountName: 'DP Lab' },
        { id: 'a2', activityDate: '2026-07-15', accountName: 'DP Lab' },
        { id: 'a3', activityDate: '2026-07-16', accountName: 'Orion' },
      ],
      targets: [],
      today: '2026-07-20',
    });

    assert.equal(board.movement.quotesSent, 2);
    assert.equal(board.movement.quotesAccepted, 1);
    assert.equal(board.movement.touches, 3);
    assert.equal(board.movement.accountsTouched, 2);
  });
});

describe('outcome scoreboard: against the quarter and the year', () => {
  test('quarter and year read the targets that are set, and only the wins inside them', () => {
    const board = buildOutcomeScoreboard({
      period: week,
      outcomes: [
        outcome('q3a', { outcomeDate: '2026-07-15', finalAmount: 300_000_000 }),
        outcome('q3b', { outcomeDate: '2026-08-02', finalAmount: 200_000_000 }),
        // Q2: inside the fiscal year, outside the quarter.
        outcome('q2a', { outcomeDate: '2026-05-11', finalAmount: 400_000_000 }),
        // Last year: outside both.
        outcome('old', { outcomeDate: '2025-12-11', finalAmount: 900_000_000 }),
      ],
      quotes: [],
      activities: [],
      targets: [target('Q3', 1_000_000_000), target('Q2', 800_000_000), target('Q4', 1_200_000_000)],
      today: '2026-08-15',
    });

    assert.equal(board.quarter.label, 'Q3 FY2026');
    assert.equal(board.quarter.target, 1_000_000_000);
    assert.equal(board.quarter.won, 500_000_000, 'only Q3 wins count towards Q3');
    assert.equal(board.quarter.gap, 500_000_000);
    assert.equal(board.quarter.attainment, 0.5);

    assert.equal(board.year.label, 'FY2026');
    assert.equal(board.year.target, 3_000_000_000, 'the year is the sum of its quarters');
    assert.equal(board.year.won, 900_000_000, 'every win dated inside the fiscal year');
  });

  test('pace is arithmetic: the rate so far, carried to the end of the window', () => {
    // Half the quarter gone (Jul 1 - Sep 30, today Aug 15), a quarter of the
    // number in: the projection lands near half of target.
    const board = buildOutcomeScoreboard({
      period: week,
      outcomes: [outcome('a', { outcomeDate: '2026-07-20', finalAmount: 250_000_000 })],
      quotes: [],
      activities: [],
      targets: [target('Q3', 1_000_000_000)],
      today: '2026-08-15',
    });

    assert.ok(board.quarter.projected > 480_000_000 && board.quarter.projected < 560_000_000);
    assert.equal(board.quarter.onTrack, false, 'a quarter of the number at half time is behind');
    assert.ok(board.quarter.requiredPerWeek > 0);
    assert.match(board.verdict, /Q3 FY2026 is at 25% with \d+ days left/);
  });

  test('ahead of the calendar reads as on track', () => {
    const board = buildOutcomeScoreboard({
      period: week,
      outcomes: [outcome('a', { outcomeDate: '2026-07-20', finalAmount: 900_000_000 })],
      quotes: [],
      activities: [],
      targets: [target('Q3', 1_000_000_000)],
      today: '2026-08-15',
    });

    assert.equal(board.quarter.onTrack, true);
    assert.equal(board.quarter.gap, 100_000_000);
  });

  test('with no target there is no score, and the page says so instead of inventing one', () => {
    const board = buildOutcomeScoreboard({
      period: week,
      outcomes: [outcome('a')],
      quotes: [],
      activities: [],
      targets: [],
      today: '2026-07-20',
    });

    assert.equal(board.quarter, null);
    assert.equal(board.year, null);
    assert.equal(board.hasTargets, false);
    assert.match(board.verdict, /Set a quarterly target/);
  });

  test('a fiscal year starting in April keeps January in the year it belongs to', () => {
    const board = buildOutcomeScoreboard({
      period: week,
      outcomes: [outcome('a', { outcomeDate: '2027-01-20', finalAmount: 100_000_000 })],
      quotes: [],
      activities: [],
      targets: [{ period: 'Q4', fiscalYear: 2026, amount: 500_000_000, fiscalYearStartMonth: 4 }],
      today: '2027-01-25',
    });

    assert.equal(board.quarter.label, 'Q4 FY2026');
    assert.equal(board.quarter.won, 100_000_000);
  });
});
