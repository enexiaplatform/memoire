import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { matchesSearchQuery, normalizeSearchText } from '../../src/utils/textSearch.ts';
import { buildPlanLinkOptions, stripPlanLinkFromDraft } from '../../src/utils/weeklyPlan.ts';

/**
 * The founder's report was "không search ra mặc dù đã có" - it does not come up
 * even though it is there. Two separate causes, both fixed here.
 */

describe('search matching', () => {
  const name = 'CÔNG TY CỔ PHẦN DƯỢC PHẨM CỬU LONG';

  test('folds Vietnamese diacritics, so the fast way of typing a name finds it', () => {
    assert.equal(normalizeSearchText(name), 'cong ty co phan duoc pham cuu long');
    assert.equal(matchesSearchQuery(name, 'duoc pham cuu long'), true);
    assert.equal(matchesSearchQuery(name, 'CỬU LONG'), true);
  });

  test('matches words in any order and out of sequence', () => {
    assert.equal(matchesSearchQuery(name, 'cuu long duoc'), true);
  });

  test('narrows rather than widens as more is typed', () => {
    assert.equal(matchesSearchQuery(name, 'duoc samil'), false);
  });

  test('đ is folded even though NFD leaves it alone', () => {
    assert.equal(matchesSearchQuery('CÔNG TY TNHH ĐẠT VI PHÚ', 'dat vi phu'), true);
  });

  test('an empty query keeps every row', () => {
    assert.equal(matchesSearchQuery(name, '   '), true);
  });
});

describe('plan link suggestions', () => {
  const accountNames = [
    'CÔNG TY TNHH KHOA HỌC KỸ THUẬT TOÀN CẦU',
    'CÔNG TY CỔ PHẦN DƯỢC PHẨM CỬU LONG',
    'CÔNG TY TNHH SAMIL PHARMACEUTICAL',
    'CÔNG TY CỔ PHẦN PYMEPHARCO',
  ];

  test('the customer typed leads the list instead of losing it to legal boilerplate', () => {
    const options = buildPlanLinkOptions({
      draft: 'Gửi báo giá CỬU LONG',
      opportunities: [],
      accountNames,
    });
    assert.equal(options[0].display, 'CÔNG TY CỔ PHẦN DƯỢC PHẨM CỬU LONG');
  });

  test('"cong ty" alone does not nominate the whole book at random', () => {
    const options = buildPlanLinkOptions({
      draft: 'samil',
      opportunities: [],
      accountNames,
    });
    assert.equal(options.length, 1);
    assert.equal(options[0].display, 'CÔNG TY TNHH SAMIL PHARMACEUTICAL');
  });
});

describe('the composer text after a link is picked', () => {
  test('the customer name leaves the box, because it is now the chip', () => {
    assert.equal(
      stripPlanLinkFromDraft('Samil', 'CÔNG TY TNHH SAMIL PHARMACEUTICAL'),
      '',
    );
  });

  test('the work survives, and a dangling connective does not', () => {
    assert.equal(
      stripPlanLinkFromDraft('Send price + CoA for Pymepharco', 'CÔNG TY CỔ PHẦN PYMEPHARCO'),
      'Send price + CoA',
    );
  });

  test('text that has nothing to do with the name is untouched', () => {
    assert.equal(
      stripPlanLinkFromDraft('Confirm the current stage', 'CÔNG TY TNHH SAMIL PHARMACEUTICAL'),
      'Confirm the current stage',
    );
  });
});

describe('search in scripts that are not Latin', () => {
  /**
   * The keep-set used to be `a-z0-9`, which discarded every character of CJK,
   * Thai, Cyrillic, Greek and Arabic. This product ships planning rates for CNY,
   * TWD, THB, KRW and JPY, so those customers are expected, not hypothetical.
   */
  test('a record named in Chinese survives normalization and is findable', () => {
    const name = '上海医药集团';
    assert.equal(normalizeSearchText(name), '上海医药集团', 'it used to normalize to nothing at all');
    assert.equal(matchesSearchQuery(name, '上海'), true);
    assert.equal(matchesSearchQuery(name, '医药'), true);
  });

  test('a query in Chinese does not match every record in the book', () => {
    // The bad one. A query that normalized to '' was zero tokens, which
    // `matchesSearchQuery` reads as an empty query - so it matched everything,
    // and nothing told the operator their query had been thrown away.
    assert.equal(matchesSearchQuery('Truong Son Long An', '上海'), false);
    assert.equal(matchesSearchQuery('Beinco', 'บริษัท'), false);
  });

  test('Thai keeps its vowel marks rather than being cut into fragments', () => {
    // These are \p{M}, not \p{L}. Stripping them left `บร ษ ท`, which matched
    // itself only because the query was mangled identically.
    assert.equal(normalizeSearchText('บริษัท'), 'บริษัท');
    assert.equal(matchesSearchQuery('บริษัท ไทยพาณิชย์', 'ไทยพาณิชย์'), true);
  });

  test('Cyrillic and Greek are letters too', () => {
    assert.equal(matchesSearchQuery('Газпром нефть', 'нефть'), true);
    assert.equal(matchesSearchQuery('Ελληνικά Πετρέλαια', 'Πετρέλαια'), true);
  });

  test('and the Vietnamese fold is untouched by any of it', () => {
    const name = 'CÔNG TY CỔ PHẦN DƯỢC PHẨM CỬU LONG';
    assert.equal(normalizeSearchText(name), 'cong ty co phan duoc pham cuu long');
    assert.equal(matchesSearchQuery(name, 'duoc pham cuu long'), true);
  });
});
