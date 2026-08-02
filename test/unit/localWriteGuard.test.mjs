import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

/**
 * The guard is the only thing standing between a refused write and a record the
 * interface claims it saved, so its failure path is the part worth testing.
 */

class FakeStorage {
  constructor({ failWith } = {}) {
    this.map = new Map();
    this.failWith = failWith || null;
  }
  get length() { return this.map.size; }
  key(index) { return [...this.map.keys()][index] ?? null; }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) {
    if (this.failWith) throw this.failWith;
    this.map.set(key, String(value));
  }
  removeItem(key) { this.map.delete(key); }
}

const quotaError = () => {
  const error = new DOMException('exceeded the quota', 'QuotaExceededError');
  return error;
};

let guard;
const events = [];

beforeEach(async () => {
  events.length = 0;
  globalThis.window = {
    localStorage: new FakeStorage(),
    dispatchEvent: (event) => { events.push(event); return true; },
  };
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, init = {}) { this.type = type; this.detail = init.detail ?? null; }
  };
  // Fresh module per test: the guard holds the last failure in module state.
  guard = await import(`../../src/services/localWriteGuard.ts?case=${Math.random()}`);
});

afterEach(() => {
  delete globalThis.window;
  delete globalThis.CustomEvent;
});

describe('local write guard: a refused write is never silent', () => {
  test('a normal write succeeds and stores what it was given', () => {
    const result = guard.writeLocalRecords('memoire.test.v1', [{ id: 'a' }]);
    assert.equal(result.ok, true);
    assert.equal(globalThis.window.localStorage.getItem('memoire.test.v1'), '[{"id":"a"}]');
    assert.equal(guard.getLastLocalWriteFailure(), null);
  });

  test('a quota refusal is classified, remembered and announced', () => {
    globalThis.window.localStorage.failWith = quotaError();

    const result = guard.writeLocalRecords('memoire.activities.v1', [{ id: 'a' }]);

    assert.equal(result.ok, false);
    assert.equal(result.reason, 'quota');
    assert.match(result.message, /run out of space/i);

    const remembered = guard.getLastLocalWriteFailure();
    assert.equal(remembered.key, 'memoire.activities.v1');
    assert.equal(remembered.reason, 'quota');

    const announced = events.filter((event) => event.type === guard.LOCAL_WRITE_FAILED_EVENT);
    assert.equal(announced.length, 1, 'the shell has to hear about it to say anything');
    assert.equal(announced[0].detail.reason, 'quota');
  });

  test('the guard never throws, whatever the browser does', () => {
    globalThis.window.localStorage.failWith = new Error('something else entirely');
    const result = guard.writeLocalRecords('memoire.test.v1', [{ id: 'a' }]);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'unknown');
  });

  test('a write that succeeds after a failure clears the warning', () => {
    globalThis.window.localStorage.failWith = quotaError();
    guard.writeLocalRecords('memoire.test.v1', [{ id: 'a' }]);
    assert.ok(guard.getLastLocalWriteFailure());

    globalThis.window.localStorage.failWith = null;
    const result = guard.writeLocalRecords('memoire.test.v1', [{ id: 'a' }]);

    assert.equal(result.ok, true);
    assert.equal(guard.getLastLocalWriteFailure(), null, 'a stale warning about saved data is its own lie');
    assert.equal(events.filter((event) => event.type === guard.LOCAL_WRITE_RECOVERED_EVENT).length, 1);
  });

  test('no storage at all is reported as unavailable rather than pretended away', () => {
    globalThis.window.localStorage = null;
    const result = guard.writeLocalCollection('memoire.test.v1', 'x');
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'unavailable');
  });
});

describe('local write guard: measuring what is stored', () => {
  test('counts Memoire keys only, in the units the browser charges', () => {
    const storage = globalThis.window.localStorage;
    storage.setItem('memoire.opportunities.v1', JSON.stringify([{ id: 'a' }, { id: 'b' }]));
    storage.setItem('memoire.flag', 'true');
    storage.setItem('someone-elses-key', 'x'.repeat(1000));

    const usage = guard.measureLocalStorageUsage();

    assert.equal(usage.byKey.length, 2, 'other origins’ keys are not ours to report');
    const biggest = usage.byKey[0];
    assert.equal(biggest.key, 'memoire.opportunities.v1');
    assert.equal(biggest.records, 2);
    // UTF-16: two bytes per code unit, key included.
    assert.equal(biggest.bytes, ('memoire.opportunities.v1'.length + JSON.stringify([{ id: 'a' }, { id: 'b' }]).length) * 2);
    assert.equal(usage.memoireBytes, usage.byKey.reduce((sum, row) => sum + row.bytes, 0));
  });

  test('a non-list value has no record count rather than a wrong one', () => {
    globalThis.window.localStorage.setItem('memoire.flag', 'true');
    const usage = guard.measureLocalStorageUsage();
    assert.equal(usage.byKey[0].records, null);
  });
});
