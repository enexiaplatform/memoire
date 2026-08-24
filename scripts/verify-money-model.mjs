import assert from 'node:assert/strict';
import {
  BASE_CURRENCY,
  DEFAULT_REPORTING_CURRENCY,
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

// `sumMoneyInBase` sums into the *reporting* currency, not the rate anchor -
// the name is older than the distinction. Everything below is expressed through
// the rate table so it stays true if either the rates or the default move.
const reporting = getReportingCurrency();
const aggregate = sumMoneyInBase(mixedCurrencyFixture);
const totalInVnd = 500_000 * EXCHANGE_RATES_TO_VND.SGD + 100_000_000;
const expected = totalInVnd / EXCHANGE_RATES_TO_VND[reporting];

// The two currencies are different decisions: VND anchors the rate table, and
// the workspace opens in USD because the product is sold worldwide.
assert.equal(BASE_CURRENCY, 'VND');
assert.equal(reporting, DEFAULT_REPORTING_CURRENCY);
assert.equal(reporting, 'USD', 'a new workspace must not open in one market’s currency');

// Rounded: the implementation converts each row and then sums, so it carries a
// different float error from a single divide. The equality that matters is the
// figure, not the last bit of it.
assert.equal(Math.round(aggregate * 100), Math.round(expected * 100));
assert.notEqual(aggregate, 600_000, 'mixed currencies must not be added as bare numbers');
// The aggregate names the currency it is in, once. It used to append
// "(Base: USD)" to a string already ending in " USD" - the same three letters
// twice, adjacent, in every mode and for every currency, saying nothing a
// reader could act on. `formatMoneyWithBase` still labels a *converted* figure,
// and verify-currency-locale pins that; this pins the total.
assert.match(formatBaseCurrencyAmount(aggregate), new RegExp(`${reporting}$`));
assert.equal(formatBaseCurrencyAmount(aggregate).includes('Base:'), false, 'a total must not repeat its own currency code');
assert.equal(formatBaseCurrencyAmount(aggregate, true).includes('Base:'), false, 'compact totals too');
assert.match(formatCurrencyAmount(mixedCurrencyFixture[0].amount, mixedCurrencyFixture[0].currency), /SGD$/);

assert.ok(SUPPORTED_CURRENCIES.includes('USD') && SUPPORTED_CURRENCIES.includes('EUR') && SUPPORTED_CURRENCIES.includes('SGD'));
assert.match(formatCompactBaseAmount(aggregate), new RegExp(`${reporting}$`));

console.log(`Money model verified: mixed-currency aggregate is ${formatBaseCurrencyAmount(aggregate)}; item currency remains SGD; reporting currency defaults to ${reporting}.`);
