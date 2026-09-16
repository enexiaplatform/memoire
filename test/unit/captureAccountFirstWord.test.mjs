import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { matchKnownAccount } from '../../src/domain/commercialKernel/parseCapture.ts';

// The first-word fallback in matchKnownAccount lets a note that shortens a
// customer's name still find it. It used to fire on any shared first word, so
// a note about a new company filed itself under an existing one - and once
// Capture could create a lead from a note, that meant a lead created under the
// wrong customer.
const accounts = [{ id: 'a', accountName: 'Delta Nutrition' }, { id: 'b', accountName: 'Rohto Vietnam' }];

describe('matching a note to a customer on the books', () => {
  test('a shortened name plus a department is the same customer', () => {
    assert.equal(matchKnownAccount('Met Rohto QC today.', 'Rohto QC', { accounts }), 'Rohto Vietnam');
  });

  test('the first word alone still finds the customer', () => {
    assert.equal(matchKnownAccount('Called Rohto about the chambers.', 'Rohto', { accounts }), 'Rohto Vietnam');
  });

  test('a different company that shares a first word is somebody new', () => {
    assert.equal(matchKnownAccount('Met Hoa at Delta Labs. New lab next year.', 'Delta Labs', { accounts }), '');
  });

  test('the full name always matches', () => {
    assert.equal(matchKnownAccount('Visited Delta Nutrition.', 'Delta Nutrition', { accounts }), 'Delta Nutrition');
  });
});
