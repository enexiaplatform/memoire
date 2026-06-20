export function formatCurrencyAmount(value?: number | null, currency = 'VND') {
  const numericValue = Number(value || 0);
  const normalizedCurrency = (currency || 'VND').trim().toUpperCase();

  if (!Number.isFinite(numericValue)) {
    return `0 ${normalizedCurrency}`;
  }

  const formattedValue = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: normalizedCurrency === 'VND' ? 0 : 2,
  }).format(numericValue);

  return `${formattedValue} ${normalizedCurrency}`;
}

export function formatCompactCurrencyAmount(value?: number | null, currency = 'VND') {
  const numericValue = Number(value || 0);
  const normalizedCurrency = (currency || 'VND').trim().toUpperCase();
  if (!Number.isFinite(numericValue)) return `0 ${normalizedCurrency}`;

  const formattedValue = new Intl.NumberFormat(undefined, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(numericValue);
  return `${formattedValue} ${normalizedCurrency}`;
}
