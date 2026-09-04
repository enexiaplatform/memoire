import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeLocalRecords, writeLocalCollection } from '../../src/services/localWriteGuard.ts';

/*
 * What the operator is told when a save does not land.
 *
 * The guard always caught the failure; what it got wrong was which failure it
 * was. Classification required `error instanceof DOMException` before looking
 * at anything else, so the quota branch - and the only message that tells
 * somebody what to do about a full browser - was reachable only when the error
 * came from this realm's constructor. A privacy extension wrapping
 * `localStorage`, an error crossing an iframe boundary, or Safari in private
 * mode all produce a genuine quota failure that fails `instanceof`, and each
 * one got "Memoire could not save to this browser" instead of "export a backup
 * and sign in so records sync".
 *
 * These pin the shape-based classification, because the constructor-based one
 * passed every test that only checked `ok === false`.
 */

function storageThrowing(error) {
  const map = new Map();
  return {
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
    setItem: () => { throw error; },
  };
}

function install(storage) {
  globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } };
  globalThis.window = { localStorage: storage, dispatchEvent: () => true, CustomEvent: globalThis.CustomEvent };
  globalThis.localStorage = storage;
}

const quotaShaped = (patch) => Object.assign(new Error('The quota has been exceeded.'), patch);

beforeEach(() => { delete globalThis.window; delete globalThis.localStorage; });

describe('a full browser is reported as a full browser', () => {
  const CASES = [
    ['a plain Error named QuotaExceededError', quotaShaped({ name: 'QuotaExceededError' })],
    ['code 22 with no useful name', quotaShaped({ name: 'Error', code: 22 })],
    ['Firefox NS_ERROR_DOM_QUOTA_REACHED', quotaShaped({ name: 'NS_ERROR_DOM_QUOTA_REACHED' })],
    ['Safari private mode, code 1014', quotaShaped({ name: 'Error', code: 1014 })],
  ];

  CASES.forEach(([label, error]) => {
    test(label, () => {
      install(storageThrowing(error));
      const result = writeLocalRecords('memoire.opportunities.v1', [{ id: 'a' }]);
      assert.equal(result.ok, false);
      assert.equal(result.reason, 'quota', 'a quota failure must not be classified as unknown');
      // The message has to carry the way out, not just the bad news.
      assert.match(result.message, /run out of space/i);
      assert.match(result.message, /export|sign in/i);
    });
  });

  test('a real DOMException still classifies the same way', () => {
    const error = new DOMException('quota', 'QuotaExceededError');
    install(storageThrowing(error));
    assert.equal(writeLocalRecords('memoire.opportunities.v1', []).reason, 'quota');
  });
});

describe('a browser refusing storage is told apart from one that is full', () => {
  test('a SecurityError reads as unavailable, not as quota', () => {
    install(storageThrowing(Object.assign(new Error('blocked'), { name: 'SecurityError' })));
    const result = writeLocalRecords('memoire.opportunities.v1', []);
    assert.equal(result.reason, 'unavailable');
    assert.match(result.message, /blocking local storage/i);
  });

  test('no storage at all is unavailable before anything is attempted', () => {
    globalThis.window = { localStorage: undefined, dispatchEvent: () => true };
    globalThis.localStorage = undefined;
    const result = writeLocalCollection('memoire.opportunities.v1', '[]');
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'unavailable');
  });
});

describe('anything else stays honestly unknown', () => {
  test('an error with no recognisable shape is not guessed at', () => {
    // Claiming "your browser is full" when it is not sends the operator to
    // delete data they did not need to delete.
    install(storageThrowing(new Error('something else entirely')));
    const result = writeLocalRecords('memoire.opportunities.v1', []);
    assert.equal(result.reason, 'unknown');
    assert.doesNotMatch(result.message, /run out of space/i);
  });

  test('a value that cannot be serialised fails rather than saving nothing quietly', () => {
    install(storageThrowing(new Error('never reached')));
    const cyclic = {};
    cyclic.self = cyclic;
    const result = writeLocalRecords('memoire.opportunities.v1', cyclic);
    assert.equal(result.ok, false, 'a serialisation failure that reads as a save is the same bug');
  });
});
