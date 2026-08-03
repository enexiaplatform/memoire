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

export function normalizeEntityName(value: string): string {
  const input = value || '';
  const cached = normalizedNames.get(input);
  if (cached !== undefined) return cached;

  const normalized = input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
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
