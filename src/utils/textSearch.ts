/**
 * The one thing every search box in this product does.
 *
 * Every list here filtered with `haystack.toLowerCase().includes(query)`, which
 * is two assumptions that do not hold for this workspace:
 *
 *   1. **That the operator types the accents.** This book is Vietnamese. A
 *      record filed as "CÔNG TY CỔ PHẦN DƯỢC PHẨM CỬU LONG" was unfindable by
 *      "duoc pham cuu long" - the ordinary way to type it fast, and the way a
 *      phone keyboard offers first. The record was there; the search said it was
 *      not, which is worse than an empty workspace because it teaches the
 *      operator that the search cannot be trusted.
 *   2. **That the words are adjacent and in order.** "cuu long duoc" found
 *      nothing, and neither did "Cuu Long" against "... CỬU LONG" when the
 *      operator had also typed a word from the middle of the legal name.
 *
 * So: fold the diacritics, split into words, and require every word to appear
 * somewhere. AND rather than OR, because a second word typed is the operator
 * narrowing, and a search that widens when you type more is not a search.
 */

/**
 * Lowercase, diacritics removed, punctuation reduced to spaces.
 *
 * The keep-set is `\p{L}\p{N}` - a letter or a number in *any* script - not
 * `a-z0-9`. The ASCII version threw away every character of Chinese, Japanese,
 * Korean, Thai, Cyrillic, Greek and Arabic, and this product ships planning
 * rates for CNY, TWD, THB, KRW and JPY precisely because it expects customers
 * with names in those scripts.
 *
 * It failed twice over, and the second way is the bad one:
 *
 *   1. A record named only in such a script normalized to `''`, so no query
 *      could ever reach it - the same "the record is there and the search says
 *      it is not" this function was written to end.
 *   2. A *query* in such a script normalized to `''` too, which is zero tokens,
 *      which `matchesSearchQuery` treats as an empty query - so it matched
 *      **every** record. The operator typed a customer's name, got the whole
 *      book back, and nothing said their query had been discarded.
 */
export function normalizeSearchText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    // Vietnamese đ/Đ carries no combining mark, so NFD leaves it as-is.
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    // `\p{M}` is in the keep-set too, and it is safe to keep here: the Vietnamese
    // fold above has already removed U+0300-036F, so the only marks still
    // standing are the ones that are part of a letter rather than an accent on
    // it - Thai vowel signs, Devanagari matras, Arabic harakat. Without it
    // `บริษัท` came out as `บร ษ ท`, which still matched itself but only because
    // the query was mangled the same way.
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, ' ')
    .trim();
}

/**
 * Does this record answer what was typed?
 *
 * An empty query matches everything, which keeps every caller's `!query ||`
 * guard unnecessary rather than merely redundant.
 */
export function matchesSearchQuery(haystack: string, query: string): boolean {
  const tokens = normalizeSearchText(query).split(' ').filter(Boolean);
  if (tokens.length === 0) return true;
  const normalizedHaystack = normalizeSearchText(haystack);
  return tokens.every((token) => normalizedHaystack.includes(token));
}
