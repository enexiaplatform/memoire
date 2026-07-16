import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEntityName, sameAccount } from '../../src/utils/accountIdentity.ts';

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
