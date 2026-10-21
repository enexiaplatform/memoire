import { convertMoney, getReportingCurrency, hasExchangeRate, sumMoneyInBase, type MoneyValue, type SupportedCurrency } from './money.ts';

/** Immutable per-run conversion; never changes browser globals or another owner's basis. */
export type MoneyContext = {
  currency: SupportedCurrency;
  hasRate(currency?: string | null): boolean;
  convert(amount: number, currency?: string | null): number | null;
  sum(values: MoneyValue[]): number;
};
export function explicitMoneyContext(basis: { currency: string; ratesToVnd: Record<string, number> }): MoneyContext {
  const rates = { ...basis.ratesToVnd }, currency = basis.currency.trim().toUpperCase() as SupportedCurrency;
  const rate = (code?: string | null) => rates[(code || 'VND').trim().toUpperCase()];
  if (!(rate(currency) > 0)) throw new Error('Reporting currency has no confirmed rate.');
  const convert = (amount: number, code?: string | null) => Number.isFinite(amount) && rate(code) > 0
    ? amount * rate(code) / rate(currency) : null;
  return { currency, hasRate: code => rate(code) > 0, convert,
    sum: values => values.reduce((total, value) => total + (typeof value.amount === 'number' ? convert(value.amount, value.currency) ?? 0 : 0), 0) };
}
export function browserMoneyContext(): MoneyContext {
  return { currency: getReportingCurrency(), hasRate: hasExchangeRate, convert: convertMoney, sum: sumMoneyInBase };
}
