/**
 * The one way a plain count is written on screen.
 *
 * `value.toLocaleString()` with no locale takes the browser's, and money already
 * pins itself to English through `MONEY_LOCALE`. On a Vietnamese machine that
 * put "CUSTOMERS 1.010" on the dashboard and "117,400 SGD" in the table below
 * it - two separators for two kinds of number on one screen. "1.010" reads as
 * one-point-oh-one to anyone whose browser disagrees with the machine that wrote
 * it, and there is no way to tell which reading was meant.
 *
 * English, because the interface copy is English. Same reasoning, same answer,
 * same locale as money.
 */

const COUNT_LOCALE = 'en';

/**
 * Built once. `Intl.NumberFormat` resolves a locale and builds a pipeline per
 * construction, and counts appear once per row on tables thousands of rows long
 * - the same reason `money.ts` caches its formatters.
 */
const countFormatter = new Intl.NumberFormat(COUNT_LOCALE, { maximumFractionDigits: 0 });

/** A whole number of things: accounts, deals, touches, records. */
export function formatCount(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '0';
  return countFormatter.format(value);
}

const decimalFormatters = new Map<number, Intl.NumberFormat>();

/** A measured number that keeps decimals - days, ratios, percentages. */
export function formatDecimal(value: number | null | undefined, maximumFractionDigits = 1): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '0';
  let formatter = decimalFormatters.get(maximumFractionDigits);
  if (!formatter) {
    formatter = new Intl.NumberFormat(COUNT_LOCALE, { maximumFractionDigits });
    decimalFormatters.set(maximumFractionDigits, formatter);
  }
  return formatter.format(value);
}

/**
 * A byte count in the largest unit that leaves a readable number.
 *
 * Settings rendered a 10 GB storage quota as "10277.2 MB", which is a number
 * nobody can read at a glance and the one figure on that panel a person is
 * meant to compare against.
 */
export function formatBytes(bytes: number | null | undefined): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return '0 KB';
  if (bytes < 1024) return `${Math.round(bytes)} B`;

  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${formatDecimal(value, value < 10 ? 1 : 0)} ${units[unit]}`;
}

/**
 * An amount as somebody's spreadsheet wrote it, in whichever convention their
 * country uses.
 *
 * The importer read amounts with `Number(value.replace(/[^\d.-]/g, ''))`, which
 * assumes the Anglo convention and quietly mangles the rest of the world: a
 * German export of eighty-five thousand euros, "85.000,50", became 85.0005, and
 * "1.250.000" SEK became nothing at all - "Missing value." on a row that had
 * one. Half of Europe, all of Latin America and Indonesia write money that way,
 * and this product is sold in dollars to whoever will buy it.
 *
 * The rule is the one a person uses reading it: the LAST separator is the
 * decimal point, unless it is followed by exactly three digits and nothing else
 * in the number contradicts it - "1.250" is one thousand two hundred and fifty,
 * "1.25" is one and a quarter. Separators that repeat are grouping by
 * definition, since a number has one decimal point.
 */
export function parseLocalizedAmount(raw: string | number | null | undefined): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== 'string') return null;

  const trimmed = raw.trim();
  if (!trimmed) return null;

  const negative = /^\(.*\)$/.test(trimmed) || trimmed.startsWith('-');
  const digitsAndSeparators = trimmed.replace(/[^\d.,]/g, '');
  if (!digitsAndSeparators) return null;

  const lastDot = digitsAndSeparators.lastIndexOf('.');
  const lastComma = digitsAndSeparators.lastIndexOf(',');
  const decimalAt = Math.max(lastDot, lastComma);
  const decimalChar = decimalAt < 0 ? '' : digitsAndSeparators[decimalAt];
  const repeated = decimalChar
    ? digitsAndSeparators.split(decimalChar).length - 1 > 1
    : false;
  const tail = decimalAt < 0 ? '' : digitsAndSeparators.slice(decimalAt + 1);
  const isGrouping = !decimalChar || repeated || /^\d{3}$/.test(tail);

  const normalized = isGrouping
    ? digitsAndSeparators.replace(/[.,]/g, '')
    : `${digitsAndSeparators.slice(0, decimalAt).replace(/[.,]/g, '')}.${tail}`;

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return negative ? -parsed : parsed;
}

/**
 * "1 days late" shipped on three surfaces at once (Cash collection's Average
 * wait stat, its "Chase this one first" banner and every row of the order
 * list), because each of them concatenated a count with a hard-coded plural.
 * A receivables screen that cannot say "1 day" reads like a placeholder, and
 * this product's whole claim is that the numbers on it were looked at.
 *
 * English-only on purpose: the product ships one language today, and a real
 * Intl.PluralRules table would be a fiction until a second one exists.
 */
export function pluralizeCount(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${Math.abs(count) === 1 ? singular : plural}`;
}
