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
