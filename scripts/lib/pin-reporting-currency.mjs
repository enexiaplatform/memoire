/**
 * Pins the reporting currency for contract scripts that assert money figures.
 *
 * Import this **first** in any verifier whose fixtures are denominated in a
 * particular currency:
 *
 *     import './lib/pin-reporting-currency.mjs';
 *
 * ## Why this exists
 *
 * `getReportingCurrency()` reads `localStorage`, and falls back to
 * `DEFAULT_REPORTING_CURRENCY` when there is none - which is every Node script.
 * That default moved from VND to USD when the product stopped opening every new
 * workspace worldwide in one market's currency, and a dozen contracts went red:
 * they assert revenue recognition, margin, nudge thresholds and forecast maths
 * against VND fixtures, and every converted total shifted underneath them.
 *
 * Those contracts are not about currency. Rewriting each expectation into USD
 * would pin them to the *new* default just as tightly, and the next change would
 * break them again. So they pin the currency their fixtures are written in, and
 * keep testing the thing they are named after.
 *
 * The product default is guarded on purpose elsewhere, and deliberately not
 * here: `verify-currency-locale.mjs` and `verify-money-model.mjs` assert that
 * `DEFAULT_REPORTING_CURRENCY` is USD and that it is not the rate anchor. Those
 * two must never import this file, or nothing would be watching the default.
 *
 * No product code changed for this. `getReportingCurrency` reads `localStorage`
 * lazily inside the function, so a stub installed before the first call is all
 * it takes.
 */

const PINNED = 'VND';
const KEY = 'memoire_reporting_currency';

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map([[KEY, PINNED]]);
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)); },
    removeItem: (key) => { store.delete(key); },
    clear: () => { store.clear(); },
    key: (index) => [...store.keys()][index] ?? null,
    get length() { return store.size; },
  };
}

export const PINNED_REPORTING_CURRENCY = PINNED;
