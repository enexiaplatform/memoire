/**
 * One line, one name - even when it was typed six different ways.
 *
 * Brand is a free-text field on a deal, which is right: an operator adds a
 * principal the day they sign it, not the day someone updates a dropdown. The
 * cost is drift. A distributor's tracking workbook that was rebuilt from three
 * sheets found the *same* brand spelled three ways across them, and had to
 * carry a mapping table with a "basis" column just to fold them back together -
 * including several rows marked ASSUMPTION, because "COL" and "CondaLab" only
 * look like the same thing if you already know the business.
 *
 * Memoire splits that problem in two, and only solves the half that can be
 * solved without asking:
 *
 *   Case, spacing and accents are **not a decision**. "PMM", "pmm" and " Pmm "
 *   are one line by any reading, so they are folded at read time, everywhere,
 *   with no store, no migration and nothing for the operator to confirm.
 *
 *   A genuine second name - "ZTS" for Tailin - **is** a decision, and the app
 *   does not get to make it. Those are surfaced as a question
 *   (`findBrandSpellingClusters`) and left alone until somebody answers.
 *
 * The line between the two is the whole design. Folding on similarity would
 * silently merge two real principals the first time an operator carried both
 * "Bio-Rad" and "Biorad Labs", and a merge nobody was asked about is exactly
 * the kind of tidying that costs a book its trust.
 */

/**
 * The key two spellings of one brand share.
 *
 * Diacritics stripped, punctuation and spacing removed, lower-cased: the same
 * treatment `accountIdentity` gives a customer name, for the same reason. `đ`
 * is handled explicitly because it carries no combining mark and survives NFD.
 */
export function brandKey(value: string): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/[đĐ]/gu, 'd')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .trim();
}

/** True when two spellings are the same line by any reading. */
export function sameBrand(left: string, right: string): boolean {
  const leftKey = brandKey(left);
  return leftKey.length > 0 && leftKey === brandKey(right);
}

/**
 * The spelling to show for a brand, given every spelling in the book.
 *
 * The most-used one wins. Falls back to the input when nothing matches, so an
 * unknown brand is shown as typed rather than blanked.
 *
 * The tie-break is the fiddly part and is deliberately not `localeCompare`.
 * That orders "pmm" before "PMM" under ICU's default collation, so a brand
 * written once each way would be displayed lower-case - and worse, the answer
 * would depend on the runtime's locale data, which is not stability at all. So:
 * a capitalised spelling beats an all-lower-case one, because a principal's
 * name is a proper noun, and anything still tied falls to code-point order,
 * which is the same everywhere.
 */
export function canonicalBrandName(value: string, allSpellings: string[]): string {
  const key = brandKey(value);
  if (!key) return (value || '').trim();

  const counts = new Map<string, number>();
  allSpellings.forEach((spelling) => {
    const trimmed = (spelling || '').trim();
    if (!trimmed || brandKey(trimmed) !== key) return;
    counts.set(trimmed, (counts.get(trimmed) || 0) + 1);
  });

  const best = [...counts.entries()].sort(compareSpellings)[0];
  return best ? best[0] : (value || '').trim();
}

/** Most used, then capitalised, then code-point order. Locale-independent. */
function compareSpellings(left: [string, number], right: [string, number]): number {
  if (right[1] !== left[1]) return right[1] - left[1];
  const leftCaps = hasUpperCase(left[0]) ? 1 : 0;
  const rightCaps = hasUpperCase(right[0]) ? 1 : 0;
  if (leftCaps !== rightCaps) return rightCaps - leftCaps;
  return left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0;
}

function hasUpperCase(value: string): boolean {
  return /\p{Lu}/u.test(value);
}

export type BrandSpellingCluster = {
  /** The spelling to keep, by the same most-used rule. */
  canonical: string;
  /** Every spelling that folds into it, including the canonical one. */
  spellings: { name: string; deals: number }[];
  /** Deals across the whole cluster. */
  deals: number;
};

/**
 * Brands written more than one way, worst first.
 *
 * Only clusters that fold on the key - so this reports drift the app has
 * *already* corrected silently, and shows the operator what it did. It never
 * proposes merging two names that do not fold; those are two principals until
 * a human says otherwise, and no amount of string similarity changes that.
 */
export function findBrandSpellingClusters(spellings: string[]): BrandSpellingCluster[] {
  const byKey = new Map<string, Map<string, number>>();
  spellings.forEach((spelling) => {
    const trimmed = (spelling || '').trim();
    const key = brandKey(trimmed);
    if (!key) return;
    const bucket = byKey.get(key) || new Map<string, number>();
    bucket.set(trimmed, (bucket.get(trimmed) || 0) + 1);
    byKey.set(key, bucket);
  });

  return [...byKey.values()]
    .filter((bucket) => bucket.size > 1)
    .map((bucket) => {
      const rows = [...bucket.entries()]
        .sort(compareSpellings)
        .map(([name, deals]) => ({ name, deals }));
      return {
        canonical: rows[0].name,
        spellings: rows,
        deals: rows.reduce((total, row) => total + row.deals, 0),
      };
    })
    .sort((left, right) => (
      right.deals - left.deals
      || (left.canonical < right.canonical ? -1 : left.canonical > right.canonical ? 1 : 0)
    ));
}

/**
 * Every distinct line in the book, by its canonical spelling.
 *
 * The list a brand filter or a coverage matrix should be built from: without
 * it, "PMM" and "pmm" are two columns that each hold half the deals, and every
 * per-brand total is wrong in a way nothing on screen explains.
 */
export function distinctBrands(spellings: string[]): string[] {
  const seen = new Map<string, string>();
  spellings.forEach((spelling) => {
    const trimmed = (spelling || '').trim();
    const key = brandKey(trimmed);
    if (!key || seen.has(key)) return;
    seen.set(key, canonicalBrandName(trimmed, spellings));
  });
  // Code-point order, matching every other sort in this file, so the brand list
  // is the same list on every machine that renders it.
  return [...seen.values()].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}
