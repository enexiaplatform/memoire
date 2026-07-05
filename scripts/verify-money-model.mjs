import assert from 'node:assert/strict';
import {
  BASE_CURRENCY,
  EXCHANGE_RATES_TO_VND,
  SUPPORTED_CURRENCIES,
  formatBaseCurrencyAmount,
  formatCompactBaseAmount,
  formatCurrencyAmount,
  getReportingCurrency,
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

// Reporting currency is user-selectable but defaults to the base currency in
// non-browser contexts (no localStorage), so aggregates and labels stay VND here.
assert.equal(getReportingCurrency(), BASE_CURRENCY);
assert.ok(SUPPORTED_CURRENCIES.includes('USD') && SUPPORTED_CURRENCIES.includes('EUR') && SUPPORTED_CURRENCIES.includes('SGD'));
assert.match(formatCompactBaseAmount(aggregate), /VND$/);

console.log(`Money model verified: mixed-currency aggregate is ${formatBaseCurrencyAmount(aggregate)}; item currency remains SGD; reporting currency defaults to ${getReportingCurrency()}.`);
