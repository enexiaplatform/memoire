/**
 * Build-time product flags.
 *
 * These are not user settings and not runtime toggles: they mark capabilities
 * that exist in the codebase but are deliberately outside the beta product
 * surface. Keeping them as flags rather than deletions preserves the data and
 * the implementation while keeping the tested proposition narrow.
 */

/**
 * Generic business accounting on Money: expense logging, the profit-and-loss
 * statement, opening cash balance and cash-on-hand.
 *
 * Off by default. Memoire's Money surface is a commercial-flow tracker - quote,
 * customer decision, PO, delivery, invoice, paid, and what is stuck - not an
 * accounting ledger. Testing "personal commercial control tower" and "solo
 * business accounting" in the same beta teaches neither: a seller who does not
 * bookkeep here sees an empty P&L and concludes the product is unfinished,
 * while a seller who does starts wanting an accounting product Memoire will
 * never be.
 *
 * Expense records are untouched by this flag. They stay in storage, keep
 * syncing, and are still included in export and restore - only the surface is
 * hidden, so switching this on returns every record intact.
 */
export const BUSINESS_ACCOUNTING_ENABLED =
  import.meta.env.VITE_ENABLE_BUSINESS_ACCOUNTING === 'true';
