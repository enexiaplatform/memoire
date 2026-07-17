import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildPostWonCustomers } from '../../src/utils/postWonCustomers.ts';

const won = (accountName, outcomeDate, finalAmount = 100_000_000) => ({
  outcome: 'Won', accountName, outcomeDate, finalAmount, currency: 'VND', opportunityName: 'Deal',
});

describe('buildPostWonCustomers', () => {
  test('surfaces a won customer with no active deal and no recent touch', () => {
    const model = buildPostWonCustomers({
      opportunities: [], quotes: [], activities: [],
      opportunityOutcomes: [won('Delta Nutrition', '2026-05-01', 320_000_000)],
      today: '2026-07-17',
    });
    assert.equal(model.quietCustomers.length, 1);
    assert.equal(model.quietCustomers[0].accountName, 'Delta Nutrition');
    assert.equal(model.quietCustomers[0].wonValueBase, 320_000_000);
  });

  test('excludes a won customer that still has an active deal', () => {
    const model = buildPostWonCustomers({
      opportunities: [{ accountName: 'Delta Nutrition', status: 'Active' }], quotes: [], activities: [],
      opportunityOutcomes: [won('Delta Nutrition', '2026-05-01')],
      today: '2026-07-17',
    });
    assert.equal(model.quietCustomers.length, 0);
  });

  test('a recent touch resets the quiet clock', () => {
    const model = buildPostWonCustomers({
      opportunities: [], quotes: [],
      activities: [{ accountName: 'Delta Nutrition', linkedAccountName: 'Delta Nutrition', activityDate: '2026-07-14' }],
      opportunityOutcomes: [won('Delta Nutrition', '2026-01-01')],
      today: '2026-07-17',
    });
    assert.equal(model.quietCustomers.length, 0);
  });

  test('a just-won customer is not yet quiet', () => {
    const model = buildPostWonCustomers({
      opportunities: [], quotes: [], activities: [],
      opportunityOutcomes: [won('Fresh Win Co', '2026-07-16')],
      today: '2026-07-17',
    });
    assert.equal(model.quietCustomers.length, 0);
  });

  test('matches accounts tolerantly (diacritics/punctuation)', () => {
    const model = buildPostWonCustomers({
      opportunities: [], quotes: [],
      activities: [{ accountName: 'VNVC.', linkedAccountName: 'VNVC.', activityDate: '2026-07-15' }],
      opportunityOutcomes: [won('VNVC', '2026-01-01')],
      today: '2026-07-17',
    });
    assert.equal(model.quietCustomers.length, 0, 'a touch on "VNVC." counts for the "VNVC" win');
  });
});
