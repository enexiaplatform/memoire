export function quoteAmountError(amount: number | null | undefined): string {
  return amount != null && (!Number.isFinite(amount) || amount < 0)
    ? 'Quote amount must be zero or more.'
    : '';
}
