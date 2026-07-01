export const SUPPORTED_CURRENCIES = ['VND', 'SGD', 'USD', 'EUR'] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export const BASE_CURRENCY: SupportedCurrency = 'VND';

// Static planning rates. These are deliberately centralized so they can be
// replaced by workspace-configured or live rates without changing consumers.
export const EXCHANGE_RATES_TO_VND: Readonly<Record<SupportedCurrency, number>> = {
  VND: 1,
  SGD: 20_000,
  USD: 26_000,
  EUR: 30_000,
};

export type MoneyValue = {
  amount?: number | null;
  currency?: string | null;
};

export function isSupportedCurrency(currency?: string | null) {
  return SUPPORTED_CURRENCIES.includes(normalizeCurrency(currency) as SupportedCurrency);
}

export function convertMoney(
  amount: number | null | undefined,
  fromCurrency: string | null | undefined,
  toCurrency: SupportedCurrency = BASE_CURRENCY,
) {
  const numericAmount = toFiniteAmount(amount);
  const normalizedFrom = normalizeCurrency(fromCurrency);
  if (!isSupportedCurrency(normalizedFrom)) return null;
  const supportedFrom = normalizedFrom as SupportedCurrency;

  return numericAmount * EXCHANGE_RATES_TO_VND[supportedFrom] / EXCHANGE_RATES_TO_VND[toCurrency];
}

/**
 * Sums only after converting every supported input to the requested currency.
 * Unknown currencies are excluded rather than being treated as the base currency.
 */
export function sumMoney(values: MoneyValue[], toCurrency: SupportedCurrency = BASE_CURRENCY) {
  return values.reduce((total, value) => {
    const converted = convertMoney(value.amount, value.currency, toCurrency);
    return converted === null ? total : total + converted;
  }, 0);
}

export function sumMoneyInBase(values: MoneyValue[]) {
  return sumMoney(values, BASE_CURRENCY);
}

/** Item-level formatter: always preserves the supplied currency code. */
export function formatCurrencyAmount(value?: number | null, currency: string = BASE_CURRENCY) {
  const numericValue = toFiniteAmount(value);
  const normalizedCurrency = normalizeCurrency(currency) || BASE_CURRENCY;
  const formattedValue = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: normalizedCurrency === 'VND' ? 0 : 2,
  }).format(numericValue);

  return `${formattedValue} ${normalizedCurrency}`;
}

export function formatCompactCurrencyAmount(value?: number | null, currency: string = BASE_CURRENCY) {
  const numericValue = toFiniteAmount(value);
  const normalizedCurrency = normalizeCurrency(currency) || BASE_CURRENCY;
  const formattedValue = new Intl.NumberFormat(undefined, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(numericValue);
  return `${formattedValue} ${normalizedCurrency}`;
}

/** Aggregate formatter: makes the reporting basis explicit in every money card. */
export function formatBaseCurrencyAmount(value?: number | null, compact = false) {
  const formatted = compact
    ? formatCompactCurrencyAmount(value, BASE_CURRENCY)
    : formatCurrencyAmount(value, BASE_CURRENCY);
  return `${formatted} (Base: ${BASE_CURRENCY})`;
}

function normalizeCurrency(currency?: string | null) {
  return (currency || '').trim().toUpperCase();
}

function toFiniteAmount(value?: number | null) {
  const numericValue = Number(value || 0);
  return Number.isFinite(numericValue) ? numericValue : 0;
}
