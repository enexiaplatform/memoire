import { DEFAULT_TARGET_MARGIN_PCT, normalizeTargetPct } from './orderMargin.ts';
import { DEFAULT_FINANCING_ANNUAL_RATE_PCT, normalizeRatePct } from './quotePricing.ts';

/**
 * The two numbers an operator declares about their own business, and the browser
 * cache in front of them.
 *
 * The target margin used to live here alone, in localStorage, and the comment
 * justifying that was explicit: it graded a single page, cost nothing to set
 * again, and putting it on the account meant a migration reaching a live
 * database. That was a fair trade for a figure that only annotated a report.
 *
 * It stopped being fair the moment cost analysis moved to the quoting flow.
 * These two numbers now decide the price a seller puts in front of a customer,
 * and a preference that says 20% on the laptop and 15% on the phone does not
 * produce a mildly inconsistent report - it produces two different quotes for
 * the same order. So both moved onto `user_profiles`, alongside reporting
 * currency and opening cash balance, for exactly the reason those two are there.
 *
 * Reads stay synchronous against this cache: the pricing panel recomputes on
 * every keystroke and cannot await a round trip. The account row is the record;
 * `services/workspacePreferences.ts` fills the cache at sign-in and writes
 * through on save.
 */

const TARGET_MARGIN_KEY = 'memoire.targetMarginPct.v1';
const FINANCING_RATE_KEY = 'memoire.financingRatePct.v1';

export const TARGET_MARGIN_CHANGED_EVENT = 'memoire:target-margin-changed';
export const FINANCING_RATE_CHANGED_EVENT = 'memoire:financing-rate-changed';

export function getTargetMarginPct(): number {
  return readNumber(TARGET_MARGIN_KEY, DEFAULT_TARGET_MARGIN_PCT, normalizeTargetPct);
}

/** Returns whether the value survived the write, so the caller can say so. */
export function setTargetMarginPct(value: unknown): boolean {
  return writeNumber(TARGET_MARGIN_KEY, normalizeTargetPct(value), TARGET_MARGIN_CHANGED_EVENT);
}

/**
 * The operator's own cost of capital, as an annual percentage.
 *
 * What their overdraft or facility charges while a customer takes sixty days to
 * pay. Nothing infers it and nothing learns it - this product cannot see anyone's
 * bank, and a financing rate quietly derived from the workspace's own numbers
 * would be a figure nobody could argue with, sitting inside every price.
 */
export function getFinancingRatePct(): number {
  return readNumber(FINANCING_RATE_KEY, DEFAULT_FINANCING_ANNUAL_RATE_PCT, normalizeRatePct);
}

export function setFinancingRatePct(value: unknown): boolean {
  return writeNumber(FINANCING_RATE_KEY, normalizeRatePct(value), FINANCING_RATE_CHANGED_EVENT);
}

function readNumber(key: string, fallback: number, normalize: (value: unknown) => number): number {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    return normalize(raw);
  } catch {
    return fallback;
  }
}

function writeNumber(key: string, normalized: number, eventName: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(key, String(normalized));
    window.dispatchEvent(new CustomEvent(eventName, { detail: normalized }));
    return true;
  } catch {
    // A workspace of a few hundred records sits near the ~5MB localStorage
    // ceiling, and past it setItem throws. Reporting the refusal is the whole
    // contract here: a preference that says "Saved" without saving is the bug
    // this shape exists to prevent.
    return false;
  }
}
