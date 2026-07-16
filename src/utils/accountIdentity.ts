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
export function normalizeEntityName(value: string): string {
  return (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
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
