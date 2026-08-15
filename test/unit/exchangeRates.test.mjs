import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import '../support/reportingCurrency.mjs';
import {
  BASE_CURRENCY,
  EXCHANGE_RATES_AS_OF,
  EXCHANGE_RATES_TO_VND,
  convertMoney,
  getExchangeRateToBase,
  isExchangeRateOverridden,
  setExchangeRateOverride,
} from '../../src/utils/money.ts';

/**
 * Conversion used to happen at a rate nobody could see or change: hard-coded,
 * undated, and applied to every total on every page. These assert the two
 * things that make it honest - the operator's own rate wins, and the anchor
 * cannot be moved out from under the rest of the arithmetic.
 */

beforeEach(() => {
  for (const currency of ['USD', 'SGD', 'EUR']) setExchangeRateOverride(currency, null);
});

describe('exchange rates', () => {
  test('the shipped rate is dated, so a stale one can be spotted', () => {
    assert.match(EXCHANGE_RATES_AS_OF, /^\d{4}-\d{2}-\d{2}$/);
  });

  test('with nothing overridden, the shipped table is what converts', () => {
    assert.equal(getExchangeRateToBase('USD'), EXCHANGE_RATES_TO_VND.USD);
    assert.equal(isExchangeRateOverridden('USD'), false);
  });

  test("the operator's own rate wins and every total follows it", () => {
    const before = convertMoney(1000, 'SGD', 'USD');
    setExchangeRateOverride('SGD', EXCHANGE_RATES_TO_VND.SGD * 2);

    assert.equal(isExchangeRateOverridden('SGD'), true);
    assert.equal(getExchangeRateToBase('SGD'), EXCHANGE_RATES_TO_VND.SGD * 2);
    assert.equal(convertMoney(1000, 'SGD', 'USD'), before * 2);
  });

  test('clearing an override restores the shipped rate', () => {
    setExchangeRateOverride('EUR', 1);
    setExchangeRateOverride('EUR', null);

    assert.equal(isExchangeRateOverridden('EUR'), false);
    assert.equal(getExchangeRateToBase('EUR'), EXCHANGE_RATES_TO_VND.EUR);
  });

  test('the anchor currency cannot be overridden', () => {
    // It is 1 by definition. Letting it move would rescale every figure the
    // workspace owns, silently and all at once.
    assert.equal(setExchangeRateOverride(BASE_CURRENCY, 2), false);
    assert.equal(getExchangeRateToBase(BASE_CURRENCY), 1);
  });

  test('a nonsense rate is refused rather than stored', () => {
    assert.equal(setExchangeRateOverride('USD', 0), false);
    assert.equal(setExchangeRateOverride('USD', -5), false);
    assert.equal(setExchangeRateOverride('USD', Number.NaN), false);
    assert.equal(isExchangeRateOverridden('USD'), false);
  });
});
