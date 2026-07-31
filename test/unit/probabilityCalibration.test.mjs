import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildProbabilityCalibration } from '../../src/utils/forecastCalibration.ts';

let counter = 0;
const closed = (probability, result, patch = {}) => {
  counter += 1;
  return {
    id: `oc${counter}`,
    opportunityId: `o${counter}`,
    accountName: 'MDL',
    opportunityName: `Deal ${counter}`,
    outcome: result,
    outcomeDate: '2026-06-01',
    finalAmount: 1000,
    currency: 'VND',
    forecastEvidenceCategoryBeforeOutcome: 'Defensible',
    decisionRecommendationBeforeOutcome: 'Defend',
    stageBeforeOutcome: 'Proposal',
    pipelineProbabilityBeforeOutcome: probability,
    reasonCategory: 'Price',
    reasonText: 'Lost on price',
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    storageMode: 'local',
    ...patch,
  };
};

const band = (calibration, id) => calibration.rows.find((row) => row.bandId === id);

describe('probability calibration', () => {
  // The one number a CRM will not give a solo seller.
  test('grades a band against what actually closed', () => {
    const calibration = buildProbabilityCalibration({
      outcomes: [
        closed(80, 'Won'), closed(80, 'Lost'), closed(90, 'Lost'), closed(85, 'Lost'),
      ],
    });

    const high = band(calibration, '76-100');
    assert.equal(high.closed, 4);
    assert.equal(high.won, 1);
    assert.equal(high.actualWinRate, 0.25);
    assert.equal(high.verdict, 'optimistic');
    assert.match(calibration.headline, /over 75%/i);
    assert.match(calibration.headline, /1 of 4/);
  });

  test('says so when the seller is marking themselves down', () => {
    const calibration = buildProbabilityCalibration({
      outcomes: [closed(30, 'Won'), closed(30, 'Won'), closed(40, 'Won'), closed(35, 'Lost')],
    });

    const low = band(calibration, '26-50');
    assert.equal(low.verdict, 'pessimistic');
    assert.match(calibration.headline, /marking yourself down/);
  });

  test('calls a band that lands close enough calibrated', () => {
    // Claimed midpoint for 51-75 is 63. Three of five won is 60% - a 3-point
    // gap, which is noise at this sample size and must not be called a miss.
    const calibration = buildProbabilityCalibration({
      outcomes: [
        closed(60, 'Won'), closed(70, 'Won'), closed(65, 'Won'),
        closed(60, 'Lost'), closed(55, 'Lost'),
      ],
    });

    assert.equal(band(calibration, '51-75').verdict, 'calibrated');
    assert.match(calibration.headline, /holding up/);
  });

  // Two closed deals is an anecdote. Rating it would invent a track record.
  test('leaves a band under the minimum sample unrated', () => {
    const calibration = buildProbabilityCalibration({
      outcomes: [closed(80, 'Lost'), closed(80, 'Lost')],
    });

    const high = band(calibration, '76-100');
    assert.equal(high.closed, 2);
    assert.equal(high.sufficientSample, false);
    assert.equal(high.gap, null);
    assert.equal(high.verdict, 'unrated');
  });

  // Reading the live deal would grade the seller on the 100% it ended at.
  test('ignores deals closed before a probability was ever recorded', () => {
    const calibration = buildProbabilityCalibration({
      outcomes: [
        closed(null, 'Won'), closed(undefined, 'Lost'), closed(80, 'Won'),
      ],
    });

    assert.equal(calibration.totalClosed, 1);
    assert.equal(calibration.hasEnoughData, false);
    assert.match(calibration.headline, /Not enough closed deals/);
  });

  // Delayed and No decision are states, not verdicts on a forecast.
  test('counts only Won and Lost', () => {
    const calibration = buildProbabilityCalibration({
      outcomes: [closed(80, 'Delayed'), closed(80, 'No decision'), closed(80, 'Won')],
    });

    assert.equal(calibration.totalClosed, 1);
  });

  test('a re-closed deal is counted once', () => {
    const first = closed(80, 'Lost');
    const second = { ...first, id: 'oc-again', outcome: 'Won', outcomeDate: '2026-07-01' };

    const calibration = buildProbabilityCalibration({ outcomes: [first, second] });
    assert.equal(calibration.totalClosed, 1);
    assert.equal(band(calibration, '76-100').won, 1, 'the latest outcome wins');
  });

  test('an empty workspace explains what to do rather than showing zeroes', () => {
    const calibration = buildProbabilityCalibration({ outcomes: [] });
    assert.equal(calibration.totalClosed, 0);
    assert.equal(calibration.hasEnoughData, false);
    assert.match(calibration.headline, /Set a probability on your deals/);
    assert.ok(calibration.rows.every((row) => row.verdict === 'unrated'));
  });
});
