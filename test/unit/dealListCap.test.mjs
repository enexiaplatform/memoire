import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { capDealList, describeDealListCap, DEALS_PRINTED_IN_FULL } from '../../src/utils/dealListCap.ts';

/**
 * Pipeline Defense printed every deal at full height in three sections at once.
 * Measured in a browser: 5 deals came to 39,564px and 3,269 DOM nodes, 40 deals
 * to 216,049px and 17,101 nodes. The page the landing page sells as the payoff
 * became three hundred phone screens for a normal pipeline.
 *
 * What is pinned here is the part that must not drift: the cap holds, the
 * remainder is always counted rather than dropped, and the operator's own
 * ordering survives.
 */

const deals = (count) => Array.from({ length: count }, (_, i) => ({ id: `deal-${i}`, account: `Account ${i}` }));

describe('the deal list cap', () => {
  test('a normal review is not truncated', () => {
    const cap = capDealList(deals(DEALS_PRINTED_IN_FULL));
    assert.equal(cap.visible.length, DEALS_PRINTED_IN_FULL);
    assert.equal(cap.hidden, 0);
    assert.equal(cap.capped, false, 'no control when nothing is held back');
  });

  test('a big pipeline is capped, and the remainder is counted not dropped', () => {
    const cap = capDealList(deals(40));
    assert.equal(cap.visible.length, DEALS_PRINTED_IN_FULL);
    assert.equal(cap.hidden, 40 - DEALS_PRINTED_IN_FULL);
    assert.equal(cap.capped, true);
    assert.equal(cap.visible.length + cap.hidden, 40, 'every deal is accounted for');
  });

  test('expanding shows everything and keeps offering the way back', () => {
    const cap = capDealList(deals(40), { expanded: true });
    assert.equal(cap.visible.length, 40);
    assert.equal(cap.hidden, 0);
    assert.equal(cap.capped, true, 'the control must stay so the page can be collapsed again');
  });

  test('the operator’s own order is never rearranged', () => {
    const input = deals(20);
    const cap = capDealList(input);
    assert.deepEqual(
      cap.visible.map((deal) => deal.id),
      input.slice(0, DEALS_PRINTED_IN_FULL).map((deal) => deal.id),
    );
  });

  test('the visible list is a copy, so a caller cannot mutate the brief through it', () => {
    const input = deals(3);
    const cap = capDealList(input, { expanded: true });
    cap.visible.push({ id: 'stray' });
    assert.equal(input.length, 3);
  });

  test('nonsense limits fall back to the documented one', () => {
    for (const limit of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.equal(capDealList(deals(40), { limit }).visible.length, DEALS_PRINTED_IN_FULL, `limit ${limit}`);
    }
  });

  test('empty and missing inputs do not throw', () => {
    assert.deepEqual(capDealList([]), { visible: [], hidden: 0, capped: false });
    assert.deepEqual(capDealList(undefined), { visible: [], hidden: 0, capped: false });
  });
});

describe('what the control says', () => {
  test('it always names how many are behind it', () => {
    assert.equal(describeDealListCap(capDealList(deals(40)), false), 'Show the other 28 deals');
    assert.equal(describeDealListCap(capDealList(deals(13)), false), 'Show the other 1 deal');
  });

  test('expanded, it offers the way back', () => {
    assert.equal(describeDealListCap(capDealList(deals(40), { expanded: true }), true), 'Show fewer');
  });

  test('it says nothing when nothing is capped', () => {
    assert.equal(describeDealListCap(capDealList(deals(3)), false), '');
  });
});
