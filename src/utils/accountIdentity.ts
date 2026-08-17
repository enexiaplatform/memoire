import { normalizeSearchText } from './textSearch.ts';

/**
 * The one way the app decides two account names are the same account.
 *
 * Account Memory used to match on `toLowerCase().trim()` - exact, diacritic- and
 * punctuation-sensitive - so a deal on "VNVC" and an Account Memory record for
 * "VNVC." (or "Công ty VNVC") were different accounts: Account Memory reported 0
 * active opportunities while the deals sat one screen over. Capture already
 * resolved names the tolerant way; this is that algorithm, extracted so every
 * surface counts the same relationships.
 *
 * The key is diacritic- and punctuation-insensitive: it lowercases, strips
 * accents, and collapses every run of non-alphanumerics to a single space.
 */
/**
 * Memoised, because the answer only depends on the string and the same handful
 * of customer names is normalised thousands of times per render - it cost
 * three quarters of a second of Today's cold load at 300 deals. `normalize`
 * plus two regex passes is not free, and a workspace has hundreds of distinct
 * names, not hundreds of thousands, so the cache stays small on its own.
 */
const normalizedNames = new Map<string, string>();

/**
 * The rule itself is `normalizeSearchText`, not a second copy of it.
 *
 * This function used to have its own, and the two disagreed in the one place
 * that matters most for a Vietnamese book: it had no `đ/Đ → d` fold. `Đ` has no
 * combining mark, so NFD leaves it standing, and the old ASCII keep-set then
 * deleted it and put a space in its place. `ĐỨC PHÁT` keyed as `uc phat` -
 * missing the first letter of the word - so it was a *different customer* from
 * `DUC PHAT`, while search folded both to `duc phat` and found them together.
 * Deals, touches and coverage split in two for one account, and the surface that
 * could find the record was the one that disagreed about who it belonged to.
 * Vietnamese company names beginning Đông, Đại, Đức, Đồng, Đạt are ordinary.
 *
 * The keep-set is also Unicode now, which matters here even more than it does
 * in search: every CJK and Thai name normalised to the empty string, and an
 * empty key is not "no match" to a `Map` - it is *one shared bucket*, so
 * unrelated customers were grouped into a single account, reported as duplicates
 * of each other, and counted as touched when any one of them was.
 *
 * This file's own opening comment says the point is that "every surface counts
 * the same relationships". One rule, one place, is how that stays true.
 */
export function normalizeEntityName(value: string): string {
  const input = value || '';
  const cached = normalizedNames.get(input);
  if (cached !== undefined) return cached;

  const normalized = normalizeSearchText(input);
  normalizedNames.set(input, normalized);
  return normalized;
}

/** The canonical key for an account name - equal keys mean the same account. */
export function accountKey(value: string): string {
  return normalizeEntityName(value);
}

/** True when both names are present and resolve to the same account. */
export function sameAccount(left: string, right: string): boolean {
  const leftKey = accountKey(left);
  return Boolean(leftKey && leftKey === accountKey(right));
}

/**
 * Drops the Vietnamese legal form from the front of a company name.
 *
 * Only for display, and only when something is left: "CÔNG TY TNHH" on its own
 * stays as it is rather than becoming an empty chip. The canonical name is what
 * everything else - matching, merging, the tooltip - keeps using.
 */
const LEGAL_PREFIX = /^(c[ôo]ng\s+ty\s+(?:c[ổo]\s*ph[ầa]n|tnhh(?:\s+mtv)?|li[êe]n\s+doanh)?|c[ôo]ng\s+ty|cty)\s+/i;

export function withoutLegalPrefix(name: string) {
  const trimmed = (name || '').trim();
  const stripped = trimmed.replace(LEGAL_PREFIX, '').trim();
  return stripped || trimmed;
}
