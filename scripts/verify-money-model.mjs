import assert from 'node:assert/strict';
import {
  BASE_CURRENCY,
  EXCHANGE_RATES_TO_VND,
  formatBaseCurrencyAmount,
  formatCurrencyAmount,
  sumMoneyInBase,
} from '../src/utils/money.ts';

const mixedCurrencyFixture = [
  { amount: 300_000, currency: 'SGD' },
  { amount: 200_000, currency: 'SGD' },
  { amount: 100_000_000, currency: 'VND' },
];

const aggregate = sumMoneyInBase(mixedCurrencyFixture);
const expected = 500_000 * EXCHANGE_RATES_TO_VND.SGD + 100_000_000;

assert.equal(BASE_CURRENCY, 'VND');
assert.equal(aggregate, expected);
assert.notEqual(aggregate, 600_000);
assert.match(formatBaseCurrencyAmount(aggregate), /Base: VND/);
assert.match(formatCurrencyAmount(mixedCurrencyFixture[0].amount, mixedCurrencyFixture[0].currency), /SGD$/);

console.log(`Money model verified: mixed-currency aggregate is ${formatBaseCurrencyAmount(aggregate)}; item currency remains SGD.`);
