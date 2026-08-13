/**
 * Pins the reporting currency for tests that assert money figures.
 *
 * `getReportingCurrency()` reads localStorage and falls back to
 * DEFAULT_REPORTING_CURRENCY, which is USD. Every money engine converts its
 * `*Base` outputs into that currency, so the default is not a display detail -
 * it changes the number the engine returns.
 *
 * These suites were written in VND against a VND default. When the default
 * became USD every figure in them was divided by the USD rate, and 49 tests
 * across the whole money spine started failing at once: cash position, P&L,
 * receivables, order margin, quote pricing, the outcome scoreboard. None of
 * that was caught, because `npm run check` did not run `npm test`.
 *
 * Importing this module first pins the basis explicitly, which is what these
 * tests always meant. A test that asserts `250_000` is asserting an amount in
 * *some* currency; leaving that to a default is how the assertion silently
 * changed meaning.
 *
 * Must be imported ABOVE the module under test: ESM evaluates imports in
 * declaration order, and the store has to exist before anything reads it.
 */

const REPORTING_CURRENCY_KEY = 'memoire_reporting_currency';

class MemoryStorage {
  #entries = new Map();

  getItem(key) {
    return this.#entries.has(key) ? this.#entries.get(key) : null;
  }

  setItem(key, value) {
    this.#entries.set(key, String(value));
  }

  removeItem(key) {
    this.#entries.delete(key);
  }

  clear() {
    this.#entries.clear();
  }
}

if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = new MemoryStorage();
}

/** The basis these suites are written in. */
export function useBaseCurrencyForReporting() {
  globalThis.localStorage.setItem(REPORTING_CURRENCY_KEY, 'VND');
}

useBaseCurrencyForReporting();
