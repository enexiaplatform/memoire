import { writeLocalCollection } from '../services/localWriteGuard.ts';

export const SUPPORTED_CURRENCIES = [
  'VND', 'USD', 'EUR', 'GBP', 'SGD', 'JPY', 'KRW', 'CNY', 'HKD', 'TWD',
  'THB', 'MYR', 'IDR', 'PHP', 'INR', 'AUD', 'NZD', 'CAD', 'CHF', 'AED', 'SAR',
] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

/** Display names for the Settings currency picker. */
export const CURRENCY_NAMES: Readonly<Record<SupportedCurrency, string>> = {
  VND: 'Vietnamese Dong',
  USD: 'US Dollar',
  EUR: 'Euro',
  GBP: 'British Pound',
  SGD: 'Singapore Dollar',
  JPY: 'Japanese Yen',
  KRW: 'South Korean Won',
  CNY: 'Chinese Yuan',
  HKD: 'Hong Kong Dollar',
  TWD: 'New Taiwan Dollar',
  THB: 'Thai Baht',
  MYR: 'Malaysian Ringgit',
  IDR: 'Indonesian Rupiah',
  PHP: 'Philippine Peso',
  INR: 'Indian Rupee',
  AUD: 'Australian Dollar',
  NZD: 'New Zealand Dollar',
  CAD: 'Canadian Dollar',
  CHF: 'Swiss Franc',
  AED: 'UAE Dirham',
  SAR: 'Saudi Riyal',
};

/**
 * The exchange-rate anchor ONLY - the pivot every rate is expressed against.
 * It is NOT the display basis: that is getReportingCurrency(). Conflating the
 * two is what made a converted VND figure render as "4,000,000,000 SGD".
 */
export const BASE_CURRENCY: SupportedCurrency = 'VND';

// The UI copy is English, so money must format English. Leaving the locale to
// the browser rendered Vietnamese compact units ("4 Tr") inside English copy.
const MONEY_LOCALE = 'en';

/**
 * When the shipped rates below were last set by hand.
 *
 * Shown wherever a converted total is, because a total quietly produced at an
 * undated rate is a number nobody can check. A workspace selling across
 * currencies moves several percent a quarter against these, which is more than
 * the margin most of this product's arithmetic is arguing about.
 */
export const EXCHANGE_RATES_AS_OF = '2026-08-01';

// Static planning rates, overridable per workspace - see `setExchangeRateOverride`.
// The pivot is BASE_CURRENCY; nothing here is a live feed, and the interface
// says so rather than implying one.
export const EXCHANGE_RATES_TO_VND: Readonly<Record<SupportedCurrency, number>> = {
  VND: 1,
  USD: 26_000,
  EUR: 30_000,
  GBP: 35_000,
  SGD: 20_000,
  JPY: 175,
  KRW: 19,
  CNY: 3_600,
  HKD: 3_350,
  TWD: 850,
  THB: 780,
  MYR: 6_100,
  IDR: 1.6,
  PHP: 460,
  INR: 300,
  AUD: 17_500,
  NZD: 16_000,
  CAD: 19_000,
  CHF: 32_000,
  AED: 7_100,
  SAR: 6_900,
};

export type MoneyValue = {
  amount?: number | null;
  currency?: string | null;
};

export function isSupportedCurrency(currency?: string | null) {
  return SUPPORTED_CURRENCIES.includes(normalizeCurrency(currency) as SupportedCurrency);
}

/**
 * Every currency this product will let somebody record money in.
 *
 * `SUPPORTED_CURRENCIES` above is not that list - it is the list of currencies
 * this file ships a planning rate for, and it is twenty-one codes covering Asia
 * Pacific and the majors. An operator in Stockholm, Warsaw, Mexico City or São
 * Paulo could not name their own currency at all: not on a deal, not on a quote,
 * and not as the currency they report in. Their own money was the one thing the
 * product could not hold.
 *
 * So the picker asks the platform instead. Every ISO-4217 code the runtime knows
 * is selectable; the twenty-one with a shipped rate convert immediately, and any
 * other converts as soon as the operator gives it a rate in Settings. Until they
 * do, an amount in it is shown as written and left out of converted totals -
 * which is what already happens, said out loud, rather than a number invented
 * from a rate nobody has.
 */
let isoCurrencyCache: string[] | null = null;

export function listIsoCurrencyCodes(): string[] {
  if (isoCurrencyCache) return isoCurrencyCache;
  let codes: string[] = [];
  try {
    const supportedValuesOf = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
    codes = typeof supportedValuesOf === 'function' ? supportedValuesOf('currency') : [];
  } catch {
    codes = [];
  }
  // A runtime without `supportedValuesOf` still has to offer the shipped list.
  isoCurrencyCache = codes.length > 0 ? codes : [...SUPPORTED_CURRENCIES];
  return isoCurrencyCache;
}

const currencyNameCache = new Map<string, string>();

/** "Swedish Krona", from the platform's own data rather than a table to maintain. */
export function getCurrencyName(currency: string): string {
  const code = normalizeCurrency(currency);
  const cached = currencyNameCache.get(code);
  if (cached) return cached;
  let name = CURRENCY_NAMES[code as SupportedCurrency] || '';
  if (!name) {
    try {
      name = new Intl.DisplayNames([MONEY_LOCALE], { type: 'currency' }).of(code) || code;
    } catch {
      name = code;
    }
  }
  currencyNameCache.set(code, name);
  return name;
}

/** A rate exists for this currency: shipped with the product, or set by the operator. */
export function hasExchangeRate(currency?: string | null) {
  const code = normalizeCurrency(currency);
  if (!code) return false;
  if (isSupportedCurrency(code)) return true;
  return getExchangeRateOverrides()[code] !== undefined;
}

export type SelectableCurrency = { code: string; name: string; hasRate: boolean };

/** The picker's list: what converts today first, then everything else by code. */
export function listSelectableCurrencies(): SelectableCurrency[] {
  const seen = new Set<string>();
  const rows: SelectableCurrency[] = [];
  for (const code of [...SUPPORTED_CURRENCIES, ...listIsoCurrencyCodes()]) {
    const normalized = normalizeCurrency(code);
    if (!/^[A-Z]{3}$/.test(normalized) || seen.has(normalized)) continue;
    seen.add(normalized);
    rows.push({ code: normalized, name: getCurrencyName(normalized), hasRate: hasExchangeRate(normalized) });
  }
  return rows.sort((left, right) => {
    if (left.hasRate !== right.hasRate) return left.hasRate ? -1 : 1;
    return left.code.localeCompare(right.code);
  });
}

/**
 * Converts into the reporting currency by default - the same currency every
 * money label names. It used to default to BASE_CURRENCY (VND) while the
 * formatters labelled the result with the reporting currency, so a seller
 * reporting in SGD saw 200,000 SGD echoed as "4,000,000,000 SGD": the number
 * was VND, the label was not.
 */
export function convertMoney(
  amount: number | null | undefined,
  fromCurrency: string | null | undefined,
  toCurrency: SupportedCurrency = getReportingCurrency(),
) {
  const numericAmount = toFiniteAmount(amount);
  const normalizedFrom = normalizeCurrency(fromCurrency);
  // A rate, not a membership list: a currency the operator has given a rate to
  // converts like any other, and one nobody has priced still returns null
  // rather than a fabricated figure.
  if (!hasExchangeRate(normalizedFrom) || !hasExchangeRate(toCurrency)) return null;
  const supportedFrom = normalizedFrom as SupportedCurrency;

  return numericAmount * getExchangeRateToBase(supportedFrom) / getExchangeRateToBase(toCurrency);
}

const RATE_OVERRIDE_KEY = 'memoire.exchangeRateOverrides.v1';
/** Fired when a rate changes, so every figure on screen can be recomputed. */
export const EXCHANGE_RATES_CHANGED_EVENT = 'memoire:exchange-rates-changed';

/**
 * The rates this workspace actually converts at.
 *
 * Shipped defaults, with whatever the operator has corrected on top. Somebody
 * running a real book knows their own bank rate and it is not the one hard-coded
 * in a file six months ago; refusing to let them say so means every total on
 * every page is wrong by an amount only they can see.
 *
 * Kept in this browser rather than on the account, and labelled that way in
 * Settings. Adding a column to `user_profiles` for it would be the better home,
 * and is a migration rather than a code change.
 */
export function getExchangeRateOverrides(): Record<string, number> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(RATE_OVERRIDE_KEY) || '{}');
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<string, number> = {};
    for (const [currency, rate] of Object.entries(parsed as Record<string, unknown>)) {
      const normalized = normalizeCurrency(currency);
      // Any ISO code, not just the ones shipped with a rate - the whole point of
      // the override is to price a currency this file does not carry.
      if (!/^[A-Z]{3}$/.test(normalized)) continue;
      const numeric = Number(rate);
      if (!Number.isFinite(numeric) || numeric <= 0) continue;
      out[normalized] = numeric;
    }
    return out;
  } catch {
    return {};
  }
}

export function getExchangeRateToBase(currency: SupportedCurrency | string): number {
  // The anchor is 1 by definition and must never be overridable: a workspace
  // that set it to anything else would rescale every figure it owns.
  if (currency === BASE_CURRENCY) return 1;
  // NaN for a currency nobody has priced, which is why every caller goes
  // through `hasExchangeRate` first rather than dividing by it.
  return getExchangeRateOverrides()[currency as SupportedCurrency]
    ?? EXCHANGE_RATES_TO_VND[currency as SupportedCurrency];
}

export function isExchangeRateOverridden(currency: SupportedCurrency | string): boolean {
  return currency !== BASE_CURRENCY && getExchangeRateOverrides()[currency] !== undefined;
}

/** Passing `null` restores the shipped rate for that currency. */
export function setExchangeRateOverride(currency: SupportedCurrency | string, rate: number | null): boolean {
  if (typeof localStorage === 'undefined' || currency === BASE_CURRENCY) return false;
  const overrides = getExchangeRateOverrides();
  if (rate === null) delete overrides[currency];
  else if (Number.isFinite(rate) && rate > 0) overrides[currency] = rate;
  else return false;

  const written = writeLocalCollection(RATE_OVERRIDE_KEY, JSON.stringify(overrides));
  if (written.ok && typeof window !== 'undefined') {
    window.dispatchEvent(new Event(EXCHANGE_RATES_CHANGED_EVENT));
  }
  return written.ok;
}

/**
 * Sums only after converting every supported input to the requested currency.
 * Unknown currencies are excluded rather than being treated as the base currency.
 */
export function sumMoney(values: MoneyValue[], toCurrency: SupportedCurrency = getReportingCurrency()) {
  return values.reduce((total, value) => {
    const converted = convertMoney(value.amount, value.currency, toCurrency);
    return converted === null ? total : total + converted;
  }, 0);
}

const REPORTING_CURRENCY_KEY = 'memoire_reporting_currency';
export const REPORTING_CURRENCY_CHANGED_EVENT = 'memoire:reporting-currency-changed';

/**
 * What a workspace reports in before anyone chooses.
 *
 * Deliberately not BASE_CURRENCY. The anchor is an implementation detail of the
 * rate table; this is the first number a new operator sees, and it used to
 * inherit the anchor - so a product sold worldwide opened every new workspace
 * in Vietnamese Dong. Changing the anchor would mean rewriting every rate;
 * changing this means changing this.
 *
 * Existing workspaces are unaffected: they have a stored value, and this is
 * only the fallback when there is none.
 */
export const DEFAULT_REPORTING_CURRENCY: SupportedCurrency = 'USD';

/**
 * The user-selectable currency that aggregates and charts are reported in.
 * BASE_CURRENCY (VND) stays the exchange-rate anchor; this is display-only.
 * Safe in non-browser contexts (contract scripts): no localStorage means the
 * default.
 */
export function getReportingCurrency(): SupportedCurrency {
  try {
    if (typeof localStorage === 'undefined') return DEFAULT_REPORTING_CURRENCY;
    const stored = normalizeCurrency(localStorage.getItem(REPORTING_CURRENCY_KEY));
    // A rate, not the shipped list: an operator who priced their own currency
    // reports in it. One that has lost its rate falls back rather than
    // denominating every total in something nothing converts into.
    return hasExchangeRate(stored) ? (stored as SupportedCurrency) : DEFAULT_REPORTING_CURRENCY;
  } catch {
    return DEFAULT_REPORTING_CURRENCY;
  }
}

/**
 * Writes the browser's copy of the reporting currency.
 *
 * It returns whether the write landed, and that return is the whole point. This
 * used to be a bare `try { setItem } catch { }` with the catch commented
 * "ignore storage failures", which is the exact shape of the bug the first
 * operator hit: they picked SGD, the
 * select showed SGD, the next load showed VND, and nothing anywhere said the
 * save had been refused. A workspace of a few hundred records fills the ~5MB
 * localStorage ceiling, and `setItem` then throws QuotaExceededError on the
 * next write - which was this one.
 *
 * The durable copy lives on the account (see services/workspacePreferences.ts).
 * This is the cache in front of it, and a cache that fails silently is worse
 * than no cache.
 */
export function setReportingCurrency(currency: string): boolean {
  const normalized = normalizeCurrency(currency);
  // Refused only when nothing could be converted into it. Settings asks for the
  // rate before it gets here; this is the guard that stops a workspace ending up
  // denominated in a currency with no arithmetic behind it.
  if (!hasExchangeRate(normalized)) return false;
  try {
    localStorage.setItem(REPORTING_CURRENCY_KEY, normalized);
  } catch {
    return false;
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(REPORTING_CURRENCY_CHANGED_EVENT));
  return true;
}

export function sumMoneyInBase(values: MoneyValue[]) {
  return sumMoney(values, getReportingCurrency());
}

/** Compact aggregate formatter in the user's reporting currency. */
export function formatCompactBaseAmount(value?: number | null) {
  return formatCompactCurrencyAmount(value, getReportingCurrency());
}

/**
 * Number formatters, built once each.
 *
 * `new Intl.NumberFormat(...)` is not a cheap constructor - it resolves a
 * locale and builds a formatting pipeline - and these two functions are called
 * once per money value on screen, which on a real book of business is thousands
 * of times per render. Profiled on 2026-08-02 at 300 deals, constructing them
 * per call cost 4.0 seconds of the 4.5 seconds Today took to appear, making it
 * the single most expensive thing in the product. There are two distinct shapes
 * here and both are reused forever, so the cache is two entries deep and needs
 * no eviction.
 */
const numberFormatters = new Map<string, Intl.NumberFormat>();

function numberFormatter(compact: boolean, maximumFractionDigits: number) {
  const key = `${compact ? 'c' : 'p'}:${maximumFractionDigits}`;
  let formatter = numberFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(MONEY_LOCALE, compact
      ? { notation: 'compact', maximumFractionDigits }
      : { maximumFractionDigits });
    numberFormatters.set(key, formatter);
  }
  return formatter;
}

/**
 * How many decimals a currency is actually written with.
 *
 * This was `currency === 'VND' ? 0 : 2` - the home market special-cased and
 * every other zero-decimal market wrong. A seller reporting in JPY read a
 * converted total on Today as "3,714,285.71 JPY", and the yen has no
 * hundredths; the same held for KRW and IDR. CLDR already knows the minor units
 * for every code in SUPPORTED_CURRENCIES (VND, JPY, KRW and IDR are 0, the rest
 * 2), so it is asked once per currency rather than kept as a second list here
 * for someone to forget when a currency is added.
 */
const currencyFractionDigits = new Map<string, number>();

function fractionDigitsFor(currency: string) {
  const cached = currencyFractionDigits.get(currency);
  if (cached !== undefined) return cached;
  let digits = 2;
  try {
    digits = new Intl.NumberFormat(MONEY_LOCALE, { style: 'currency', currency }).resolvedOptions()
      .maximumFractionDigits ?? 2;
  } catch {
    // An unknown code is formatted as an ordinary number; two decimals is the
    // safe assumption and never invents precision the amount did not have.
    digits = 2;
  }
  currencyFractionDigits.set(currency, digits);
  return digits;
}

/** Item-level formatter: always preserves the supplied currency code. */
export function formatCurrencyAmount(value?: number | null, currency: string = BASE_CURRENCY) {
  const numericValue = toFiniteAmount(value);
  const normalizedCurrency = normalizeCurrency(currency) || BASE_CURRENCY;
  const formattedValue = numberFormatter(false, fractionDigitsFor(normalizedCurrency)).format(numericValue);

  return `${formattedValue} ${normalizedCurrency}`;
}

export function formatCompactCurrencyAmount(value?: number | null, currency: string = BASE_CURRENCY) {
  const numericValue = toFiniteAmount(value);
  const normalizedCurrency = normalizeCurrency(currency) || BASE_CURRENCY;
  const formattedValue = numberFormatter(true, 1).format(numericValue);
  return `${formattedValue} ${normalizedCurrency}`;
}

/**
 * An amount in its own currency, plus its reporting-currency equivalent only
 * when that is genuinely a different figure. Callers keep their own
 * missing-value copy; this formats an amount that is present.
 *
 * Replaces four hand-rolled copies of the same concatenation, which is how the
 * mislabelled conversion spread across Today, nudges, Pipeline Defense, and
 * outcome retros at once.
 */
export function formatMoneyWithBase(amount: number, currency: string, options: { compact?: boolean } = {}) {
  const reporting = getReportingCurrency();
  const source = normalizeCurrency(currency);
  const item = formatCurrencyAmount(amount, source);
  // Same currency: the "base" figure would just repeat the number the seller
  // has already read ("650,000,000 VND · 650,000,000 VND (Base: VND)").
  if (source === reporting) return item;

  const converted = convertMoney(amount, source, reporting);
  if (converted === null) return `${item} · Needs confirmation`;
  return `${item} · ${formatBaseCurrencyAmount(converted, options.compact)}`;
}

/**
 * Aggregate formatter: a total, in the reporting currency.
 *
 * It used to append "(Base: EUR)" to a string that already ended in " EUR",
 * because both formatters below print the ISO code and neither prints a
 * symbol. So it said the same three letters twice, adjacent, in every mode and
 * for every currency - seven times on one Cost Analysis screen, and
 * "27.3M AED (Base: AED)" on a workspace whose reporting currency was AED.
 *
 * The suffix was meant to say "this total is a converted mix". It never could:
 * the string is identical whether or not anything was converted, so a reader
 * learns nothing from it either way. That signal is carried where it can
 * actually be computed - the quarter heading's "1 not converted", and
 * `formatMoneyWithBase`, which shows a deal's own currency next to its
 * converted figure and is deliberately unchanged here. `formatCompactBaseAmount`
 * has never appended it, so the two siblings now agree as well.
 */
export function formatBaseCurrencyAmount(value?: number | null, compact = false) {
  const currency = getReportingCurrency();
  return compact
    ? formatCompactCurrencyAmount(value, currency)
    : formatCurrencyAmount(value, currency);
}

function normalizeCurrency(currency?: string | null) {
  return (currency || '').trim().toUpperCase();
}

function toFiniteAmount(value?: number | null) {
  const numericValue = Number(value || 0);
  return Number.isFinite(numericValue) ? numericValue : 0;
}
