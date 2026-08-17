import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import '../support/reportingCurrency.mjs';
import { classifyOpportunitySilence } from '../../src/utils/proactiveNudges.ts';

/**
 * Six files matched account and opportunity names with their own
 * `toLowerCase().trim()` instead of `normalizeEntityName`. That key is
 * diacritic- and punctuation-sensitive, so in a Vietnamese book the ordinary
 * spelling difference broke the link between a record and its deal.
 *
 * `classifyOpportunitySilence` is the sharpest of them, because the miss does
 * not just hide a fact - it raises a critical alarm about it.
 */

const TODAY = '2026-08-17';

const deal = (accountName) => ({
  id: 'o1',
  accountName,
  opportunityName: 'Q3 supply',
  status: 'Active',
  stage: 'Proposal',
  nextActionDate: '',
  nextAction: '',
  estimatedValue: 1000,
  currency: 'VND',
  createdAt: '2026-05-01T00:00:00.000Z',
});

const touchedYesterday = (accountName) => ({
  id: 'a1',
  accountName,
  linkedAccountName: '',
  linkedOpportunityId: '',
  activityDate: '2026-08-16',
  activityType: 'Customer meeting',
});

describe('a touch reaches its deal however the name was spelled', () => {
  const cases = [
    ['CÔNG TY DƯỢC PHẨM CỬU LONG', 'Cong ty Duoc Pham Cuu Long', 'diacritics dropped when typing fast'],
    ['VNVC', 'VNVC.', 'a trailing full stop'],
    ['ĐỨC PHÁT', 'Duc Phat', 'd-with-stroke'],
    ['Truong Son', 'TRUONG SON', 'case alone, which always worked'],
  ];

  for (const [dealName, touchName, why] of cases) {
    test(`${why}`, () => {
      const state = classifyOpportunitySilence(deal(dealName), [touchedYesterday(touchName)], TODAY);
      assert.equal(state.daysQuiet, 1, 'the deal was touched yesterday');
      assert.equal(state.status, 'quiet-ok');
    });
  }

  test('and a deal genuinely untouched since creation is still reported silent', () => {
    // The guard against over-correcting: the alarm must still fire when it should.
    const state = classifyOpportunitySilence(deal('Beinco'), [touchedYesterday('Someone Else')], TODAY);
    assert.equal(state.status, 'silent');
    assert.equal(state.daysQuiet, 108);
  });
});
