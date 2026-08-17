import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEntityName, sameAccount } from '../../src/utils/accountIdentity.ts';
import { normalizeSearchText } from '../../src/utils/textSearch.ts';

describe('accountIdentity', () => {
  test('folds diacritics and punctuation to one key', () => {
    assert.equal(normalizeEntityName('Công ty VNVC.'), 'cong ty vnvc');
    assert.equal(normalizeEntityName('  VNVC-HN  '), 'vnvc hn');
  });
  test('sameAccount matches punctuation and diacritic variants', () => {
    assert.equal(sameAccount('VNVC', 'vnvc.'), true);
    assert.equal(sameAccount('Café Pharma', 'cafe pharma'), true);
    assert.equal(sameAccount('VNVC', 'DHG'), false);
    assert.equal(sameAccount('', 'VNVC'), false);
  });
});

describe('account identity: names this book is actually full of', () => {
  /**
   * `Đ` carries no combining mark, so NFD leaves it standing, and the old ASCII
   * keep-set deleted it and left a space. `ĐỨC PHÁT` keyed as `uc phat` - the
   * word's first letter gone - and was therefore a different customer from
   * `DUC PHAT`, while search folded both together. Vietnamese names beginning
   * Đông, Đại, Đức, Đồng, Đạt are ordinary.
   */
  test('d-with-stroke folds to d instead of being deleted', () => {
    assert.equal(normalizeEntityName('ĐỨC PHÁT'), 'duc phat');
    assert.equal(normalizeEntityName('Đồng Tâm'), 'dong tam');
    assert.equal(normalizeEntityName('CÔNG TY ĐẠI VIỆT'), 'cong ty dai viet');
  });

  test('the accented and unaccented spellings are one customer', () => {
    assert.equal(sameAccount('ĐỨC PHÁT', 'DUC PHAT'), true);
    assert.equal(sameAccount('Đồng Tâm', 'dong tam'), true);
  });

  test('a non-Latin name keys to itself, not to the shared empty bucket', () => {
    // An empty key is not "no match" to a Map - it is one bucket that every
    // such customer falls into, so unrelated accounts were grouped together,
    // offered as duplicates of each other, and counted as touched as a set.
    assert.notEqual(normalizeEntityName('上海医药集团'), '');
    assert.notEqual(normalizeEntityName('北京同仁堂'), '');
    assert.notEqual(
      normalizeEntityName('上海医药集团'),
      normalizeEntityName('北京同仁堂'),
      'two unrelated customers must not share a grouping key',
    );
    assert.equal(sameAccount('上海医药集团', '北京同仁堂'), false);
  });

  test('and the identity rule agrees with the search rule, by construction', () => {
    for (const name of ['ĐỨC PHÁT', 'CÔNG TY CỔ PHẦN DƯỢC PHẨM CỬU LONG', '上海医药集团', 'Beinco']) {
      assert.equal(normalizeEntityName(name), normalizeSearchText(name), name);
    }
  });
});
