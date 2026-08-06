import { DEFAULT_TARGET_MARGIN_PCT, normalizeTargetPct } from './orderMargin.ts';

/**
 * The margin this operator expects to keep.
 *
 * One number, and it is what turns cost analysis from a report into a judgement:
 * "you kept 14%" is trivia, "you kept 14% against the 22% you aim for, and the
 * gap is 340 million dong" is a decision about who gets the next quote.
 *
 * Held in this browser rather than on the account, unlike reporting currency and
 * opening cash balance. Those two are on `user_profiles` because they change how
 * every number in the product reads and a seller meets them on a phone and a
 * laptop both. This one grades a single page, costs nothing to set again, and
 * putting it on the account means a schema change reaching a live database - the
 * kind of migration this workspace has been bitten by before. If it turns out to
 * be worth syncing it should ride along with the next preference that genuinely
 * needs a column, not drag one of its own.
 */
const STORAGE_KEY = 'memoire.targetMarginPct.v1';

export const TARGET_MARGIN_CHANGED_EVENT = 'memoire:target-margin-changed';

export function getTargetMarginPct(): number {
  if (typeof window === 'undefined') return DEFAULT_TARGET_MARGIN_PCT;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return DEFAULT_TARGET_MARGIN_PCT;
    return normalizeTargetPct(raw);
  } catch {
    return DEFAULT_TARGET_MARGIN_PCT;
  }
}

/** Returns whether the value survived the write, so the caller can say so. */
export function setTargetMarginPct(value: unknown): boolean {
  if (typeof window === 'undefined') return false;
  const normalized = normalizeTargetPct(value);
  try {
    window.localStorage.setItem(STORAGE_KEY, String(normalized));
    window.dispatchEvent(new CustomEvent(TARGET_MARGIN_CHANGED_EVENT, { detail: normalized }));
    return true;
  } catch {
    return false;
  }
}
