import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import '../support/reportingCurrency.mjs';
import {
  DEFAULT_FINANCING_ANNUAL_RATE_PCT,
  buildCreditScenarios,
  buildQuotePricing,
  describePricing,
  isQuotingStage,
  normalizeRatePct,
} from '../../src/utils/quotePricing.ts';
import { parsePaymentTerm } from '../../src/utils/paymentTerms.ts';

/**
 * Pricing before the number is sent, with the cost of credit inside it.
 *
 * The arithmetic being checked is the founder's actual argument: giving a
 * customer time to pay is lending them money at the operator's own overdraft
 * rate, and a price worked out without it is a price that quietly gives margin
 * away. Every figure here is one somebody would quote from, so the cases that
 * matter most are the ones where the model must refuse to answer.
 */

const cost = (overrides = {}) => ({
  goodsAmount: 700_000_000,
  goodsCurrency: 'VND',
  freightAmount: null,
  dutyAmount: null,
  otherAmount: null,
  extrasCurrency: 'VND',
  ...overrides,
});

describe('quote pricing: what the credit actually costs', () => {
  test('paying on the day costs nothing to carry', () => {
    const pricing = buildQuotePricing({
      cost: cost(),
      installments: parsePaymentTerm('100% in advance').installments,
      targetPct: 20,
      financingRatePct: 12,
    });

    assert.equal(pricing.creditDays, 0);
    assert.equal(pricing.financingCostBase, 0);
    assert.equal(pricing.trueCostBase, pricing.landedCostBase);
    assert.equal(Math.round(pricing.suggestedPriceBase), 875_000_000);
  });

  test('sixty days of credit on a 12% facility is real money', () => {
    const pricing = buildQuotePricing({
      cost: cost({ goodsAmount: 1_000_000_000 }),
      installments: parsePaymentTerm('100% net 60').installments,
      targetPct: 20,
      financingRatePct: 12,
    });

    assert.equal(pricing.creditDays, 60);
    // 1,000,000,000 x 12% x 60/365
    assert.equal(Math.round(pricing.financingCostBase), 19_726_027);
    assert.ok(
      pricing.suggestedPriceBase > pricing.priceIfPaidImmediatelyBase,
      'terms with credit must ask for more than terms without',
    );
  });

  test('a deposit shields its own share from the financing cost', () => {
    const withDeposit = buildQuotePricing({
      cost: cost({ goodsAmount: 1_000_000_000 }),
      installments: parsePaymentTerm('30% deposit, 70% net 60').installments,
      targetPct: 20,
      financingRatePct: 12,
    });
    const withoutDeposit = buildQuotePricing({
      cost: cost({ goodsAmount: 1_000_000_000 }),
      installments: parsePaymentTerm('100% net 60').installments,
      targetPct: 20,
      financingRatePct: 12,
    });

    assert.equal(withDeposit.creditDays, 42);
    assert.ok(withDeposit.financingCostBase < withoutDeposit.financingCostBase);
    // Exactly 70% of it, which is the whole reason a deposit is worth asking for.
    assert.equal(
      Math.round(withDeposit.financingCostBase),
      Math.round(withoutDeposit.financingCostBase * 0.7),
    );
  });

  test('interest is charged on the money out the door, not on the selling price', () => {
    const cheap = buildQuotePricing({
      cost: cost({ goodsAmount: 100_000_000 }),
      installments: parsePaymentTerm('100% net 60').installments,
      targetPct: 20,
      financingRatePct: 12,
    });
    const expensiveTarget = buildQuotePricing({
      cost: cost({ goodsAmount: 100_000_000 }),
      installments: parsePaymentTerm('100% net 60').installments,
      targetPct: 60,
      financingRatePct: 12,
    });

    // A bigger hoped-for margin does not make the overdraft cost more.
    assert.equal(cheap.financingCostBase, expensiveTarget.financingCostBase);
  });

  test('waiting for delivery is part of the credit period', () => {
    const shipsToday = buildQuotePricing({
      cost: cost(),
      installments: parsePaymentTerm('100% on delivery').installments,
      targetPct: 20,
    });
    const shipsInSixWeeks = buildQuotePricing({
      cost: cost(),
      installments: parsePaymentTerm('100% on delivery').installments,
      deliveryLagDays: 45,
      targetPct: 20,
    });

    assert.equal(shipsToday.creditDays, 0);
    assert.equal(shipsInSixWeeks.creditDays, 45);
    assert.ok(shipsInSixWeeks.suggestedPriceBase > shipsToday.suggestedPriceBase);
  });

  test('one more day of credit has a price', () => {
    const pricing = buildQuotePricing({
      cost: cost({ goodsAmount: 1_000_000_000 }),
      installments: parsePaymentTerm('100% net 30').installments,
      targetPct: 20,
      financingRatePct: 12,
    });

    const thirtyOne = buildQuotePricing({
      cost: cost({ goodsAmount: 1_000_000_000 }),
      installments: [{ id: 'a', label: 'x', percent: 100, amount: null, trigger: 'invoice', offsetDays: 31 }],
      targetPct: 20,
      financingRatePct: 12,
    });

    assert.ok(pricing.costPerCreditDayBase > 0);
    assert.equal(
      Math.round(thirtyOne.suggestedPriceBase - pricing.suggestedPriceBase),
      Math.round(pricing.costPerCreditDayBase),
    );
  });

  test('the price a day adds and the interest a day costs are both reported', () => {
    // Two different true numbers. The card shows one and the reader derives the
    // other from the tile beside it, so the difference has to be stated rather
    // than left to look like a mistake: interest is what the day costs, the
    // price is that interest with the target margin put back on it.
    const pricing = buildQuotePricing({
      cost: cost({ goodsAmount: 1_000_000_000 }),
      installments: [{ id: 'a', label: 'x', percent: 100, amount: null, trigger: 'invoice', offsetDays: 30 }],
      targetPct: 20,
      financingRatePct: 12,
    });

    const expectedInterest = 1_000_000_000 * 0.12 / 365;
    assert.ok(Math.abs(pricing.interestPerCreditDayBase - expectedInterest) < 1);
    assert.ok(Math.abs(pricing.costPerCreditDayBase - expectedInterest / 0.8) < 1);
    assert.ok(
      pricing.costPerCreditDayBase > pricing.interestPerCreditDayBase,
      'holding the margin costs more than the interest alone',
    );
    // And the interest tile must reconcile with the period figure it sits next to.
    assert.ok(
      Math.abs(pricing.financingCostBase / pricing.creditDays - pricing.interestPerCreditDayBase) < 1,
      'cost of credit over the period must be the per-day interest times the days',
    );
  });
});

describe('quote pricing: grading a price that is on the table', () => {
  test('the financing drag is the margin the terms take away', () => {
    const pricing = buildQuotePricing({
      cost: cost({ goodsAmount: 800_000_000 }),
      installments: parsePaymentTerm('100% net 90').installments,
      targetPct: 20,
      financingRatePct: 12,
      proposedPriceBase: 1_000_000_000,
    });

    assert.equal(pricing.grossMarginPct, 20, 'on landed cost alone this looks like a clean 20%');
    assert.ok(pricing.netMarginPct < 20, 'after ninety days of credit it is not');
    assert.ok(pricing.financingDragPct > 0);
    assert.equal(pricing.meetsTarget, false, 'a price that only clears the target before financing does not clear it');
  });

  test('a price above the suggestion reports its discount room', () => {
    const pricing = buildQuotePricing({
      cost: cost({ goodsAmount: 500_000_000 }),
      installments: parsePaymentTerm('100% in advance').installments,
      targetPct: 20,
      proposedPriceBase: 800_000_000,
    });

    assert.equal(pricing.meetsTarget, true);
    assert.equal(pricing.shortfallBase, 0);
    assert.equal(Math.round(pricing.headroomBase), 175_000_000);
  });

  test('a price below the suggestion reports what it is short by', () => {
    const pricing = buildQuotePricing({
      cost: cost({ goodsAmount: 500_000_000 }),
      installments: parsePaymentTerm('100% in advance').installments,
      targetPct: 20,
      proposedPriceBase: 600_000_000,
    });

    assert.equal(pricing.meetsTarget, false);
    assert.equal(Math.round(pricing.shortfallBase), 25_000_000);
    assert.equal(pricing.headroomBase, 0);
  });

  test('an uncosted quote never reports that it meets the target', () => {
    const pricing = buildQuotePricing({
      cost: cost({ goodsAmount: null }),
      installments: parsePaymentTerm('Net 30').installments,
      targetPct: 20,
      proposedPriceBase: 900_000_000,
    });

    assert.equal(pricing.hasCost, false);
    assert.equal(pricing.meetsTarget, false, 'unknown is not a pass');
    assert.equal(pricing.shortfallBase, 0, 'and it is not a failure either - there is nothing to compare');
  });

  test('a quote with no price yet reports the suggestion and nothing about margin', () => {
    const pricing = buildQuotePricing({
      cost: cost(),
      installments: parsePaymentTerm('Net 30').installments,
      targetPct: 20,
    });

    assert.equal(pricing.proposedPriceBase, null);
    assert.equal(pricing.netMarginPct, null);
    assert.equal(pricing.meetsTarget, false);
    assert.ok(pricing.suggestedPriceBase > 0);
  });

  test('landed cost is goods plus the extras, in their own currency', () => {
    const pricing = buildQuotePricing({
      cost: cost({
        goodsAmount: 10_000,
        goodsCurrency: 'USD',
        freightAmount: 20_000_000,
        dutyAmount: 5_000_000,
        extrasCurrency: 'VND',
      }),
      installments: parsePaymentTerm('100% in advance').installments,
      targetPct: 20,
    });

    // 10,000 USD at the planning rate, plus 25m dong of extras.
    assert.equal(pricing.goodsBase, 260_000_000);
    assert.equal(pricing.extrasBase, 25_000_000);
    assert.equal(pricing.landedCostBase, 285_000_000);
  });
});

describe('quote pricing: the terms-for-price trade', () => {
  test('each credit period carries the premium it needs', () => {
    const scenarios = buildCreditScenarios({
      landedCostBase: 1_000_000_000,
      targetPct: 20,
      financingRatePct: 12,
    });

    assert.deepEqual(scenarios.map((s) => s.creditDays), [0, 30, 45, 60, 90]);
    assert.equal(scenarios[0].premiumBase, 0, 'paying on the day is the baseline');
    assert.ok(scenarios[4].premiumBase > scenarios[1].premiumBase);
    assert.ok(scenarios[4].premiumPct > 0);
  });

  test('duplicated and unsorted credit options are cleaned up', () => {
    const scenarios = buildCreditScenarios({
      landedCostBase: 100,
      targetPct: 20,
      creditDayOptions: [60, 30, 60, 0],
    });

    assert.deepEqual(scenarios.map((s) => s.creditDays), [0, 30, 60]);
  });

  test('no cost recorded means no premium invented', () => {
    const scenarios = buildCreditScenarios({ landedCostBase: 0, targetPct: 20 });
    assert.ok(scenarios.every((s) => s.premiumBase === 0 && s.suggestedPriceBase === 0));
  });
});

describe('quote pricing: the sentence taken into the room', () => {
  const money = (value) => `${Math.round(value).toLocaleString('en-US')} VND`;

  test('an uncosted quote gets silence rather than a confident non-statement', () => {
    const pricing = buildQuotePricing({
      cost: cost({ goodsAmount: null }),
      installments: parsePaymentTerm('Net 30').installments,
      targetPct: 20,
    });

    assert.equal(describePricing(pricing, money), '');
  });

  test('an unpriced quote is told what to charge and why', () => {
    const pricing = buildQuotePricing({
      cost: cost(),
      installments: parsePaymentTerm('100% net 60').installments,
      targetPct: 20,
      financingRatePct: 12,
    });

    const sentence = describePricing(pricing, money);
    assert.match(sentence, /60 days of credit/);
    assert.match(sentence, /to carry/);
  });

  test('a thin price is told the two ways out of it', () => {
    const pricing = buildQuotePricing({
      cost: cost({ goodsAmount: 900_000_000 }),
      installments: parsePaymentTerm('100% net 60').installments,
      targetPct: 20,
      financingRatePct: 12,
      proposedPriceBase: 1_000_000_000,
    });

    const sentence = describePricing(pricing, money);
    assert.match(sentence, /short/);
    assert.match(sentence, /shorten the 60 days of credit/);
  });
});

describe('quote pricing: bounds', () => {
  test('a missing or absurd rate falls back to something a bank could charge', () => {
    assert.equal(normalizeRatePct(undefined), DEFAULT_FINANCING_ANNUAL_RATE_PCT);
    assert.equal(normalizeRatePct('not a number'), DEFAULT_FINANCING_ANNUAL_RATE_PCT);
    assert.equal(normalizeRatePct(-4), DEFAULT_FINANCING_ANNUAL_RATE_PCT);
    assert.equal(normalizeRatePct(1200), 100, 'a mistyped rate is clamped, not quoted from');
    assert.equal(normalizeRatePct(12.5), 12.5);
    assert.equal(normalizeRatePct(0), 0, 'an operator with no facility cost is allowed to say so');
  });

  test('a target of 100% has no price that satisfies it, and does not divide by zero', () => {
    const pricing = buildQuotePricing({
      cost: cost(),
      installments: parsePaymentTerm('Net 30').installments,
      targetPct: 100,
    });

    assert.equal(pricing.targetPct, 99, 'the target is capped where the arithmetic still means something');
    assert.ok(Number.isFinite(pricing.suggestedPriceBase));
  });
});

describe('quote pricing: when the panel should appear', () => {
  test('the quoting stages carry it', () => {
    assert.equal(isQuotingStage({ stage: 'Proposal', status: 'Active' }, 0), true);
    assert.equal(isQuotingStage({ stage: 'Negotiation', status: 'Active' }, 0), true);
    assert.equal(isQuotingStage({ stage: 'Procurement', status: 'Active' }, 0), true);
  });

  test('an early deal is not asked for a landed cost', () => {
    assert.equal(isQuotingStage({ stage: 'Lead', status: 'Active' }, 0), false);
    assert.equal(isQuotingStage({ stage: 'Discovery', status: 'Active' }, 0), false);
    assert.equal(isQuotingStage({ stage: 'Demo', status: 'Active' }, 0), false);
  });

  test('a quote already raised beats whatever the stage says', () => {
    // The stage is the field people forget to move; a quote against the deal is
    // proof the pricing has already started.
    assert.equal(isQuotingStage({ stage: 'Discovery', status: 'Active' }, 1), true);
  });

  test('a won deal keeps its pricing panel', () => {
    // The cost recorded here is the same record that grades the order after it
    // lands, so it must stay reachable once the deal closes.
    assert.equal(isQuotingStage({ stage: 'Won', status: 'Won' }, 0), true);
  });

  test('a missing stage is not a quoting stage', () => {
    assert.equal(isQuotingStage({}, 0), false);
    assert.equal(isQuotingStage({ stage: undefined, status: undefined }, 0), false);
  });
});
