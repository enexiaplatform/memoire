import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

/**
 * A restore replaces someone's entire workspace, so the parts worth pinning are
 * the ones that decide whether they can get it back: does it replace rather
 * than merge, does it reach the account or only the browser, does it report a
 * write it did not make, and can it be undone.
 */

class FakeStorage {
  constructor(seed = {}) {
    this.map = new Map(Object.entries(seed));
    this.failFor = null;
  }
  get length() { return this.map.size; }
  key(index) { return [...this.map.keys()][index] ?? null; }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) {
    if (this.failFor && this.failFor(key)) throw new DOMException('full', 'QuotaExceededError');
    this.map.set(key, String(value));
  }
  removeItem(key) { this.map.delete(key); }
}

const envelope = (localBrowserData) => ({
  exportedAt: '2026-08-01T00:00:00.000Z',
  formatVersion: 1,
  localBrowserData,
});

let restore;
let cloudCalls;

beforeEach(async () => {
  cloudCalls = [];
  globalThis.window = {
    localStorage: new FakeStorage(),
    dispatchEvent: () => true,
  };
  globalThis.CustomEvent = class { constructor(type, init = {}) { this.type = type; this.detail = init.detail ?? null; } };
  restore = await import(`../../src/services/workspaceRestore.ts?case=${Math.random()}`);
});

afterEach(() => {
  delete globalThis.window;
  delete globalThis.CustomEvent;
});

describe('workspace restore: replacing a browser copy', () => {
  test('replaces rather than merges, and reports before and after per collection', async () => {
    globalThis.window.localStorage = new FakeStorage({
      'memoire.accounts.v1': JSON.stringify([{ id: 'old-1' }, { id: 'old-2' }]),
      'memoire.quotes.v1': JSON.stringify([{ id: 'stale' }]),
      'unrelated.key': 'left alone',
    });

    const result = await restore.restoreWorkspace(envelope({
      'memoire.accounts.v1': [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    }));

    const accounts = result.collections.find((entry) => entry.key === 'memoire.accounts.v1');
    assert.equal(accounts.before, 2);
    assert.equal(accounts.after, 3);
    assert.equal(accounts.localWritten, true);

    assert.equal(
      globalThis.window.localStorage.getItem('memoire.quotes.v1'),
      null,
      'a collection missing from the backup is cleared, not left behind as a merge',
    );
    assert.equal(
      globalThis.window.localStorage.getItem('unrelated.key'),
      'left alone',
      'a restore stays inside the app namespace',
    );
    assert.equal(result.restoredRecords, 3);
    assert.equal(result.ok, true);
  });

  test('demo records never ride a restore into a real workspace', async () => {
    const result = await restore.restoreWorkspace(envelope({
      'memoire.accounts.v1': [{ id: 'real' }, { id: 'demo', source: 'demo' }, { id: 'sample', isSample: true }],
    }));

    assert.equal(result.droppedSampleRecords, 2);
    assert.equal(result.restoredRecords, 1);
    assert.equal(JSON.parse(globalThis.window.localStorage.getItem('memoire.accounts.v1')).length, 1);
  });

  test('a refused write is reported as a failure, not counted as a restore', async () => {
    globalThis.window.localStorage.failFor = (key) => key === 'memoire.quotes.v1';

    const result = await restore.restoreWorkspace(envelope({
      'memoire.accounts.v1': [{ id: 'a' }],
      'memoire.quotes.v1': [{ id: 'q' }],
    }));

    assert.equal(result.ok, false);
    const quotes = result.collections.find((entry) => entry.key === 'memoire.quotes.v1');
    assert.equal(quotes.localWritten, false);
    assert.match(quotes.message, /run out of space|could not save/i);
    assert.match(result.summary, /part-restored/);
  });

  test('the workspace it replaced can be put back', async () => {
    globalThis.window.localStorage = new FakeStorage({
      'memoire.accounts.v1': JSON.stringify([{ id: 'original' }]),
    });

    const result = await restore.restoreWorkspace(envelope({
      'memoire.accounts.v1': [{ id: 'from-backup' }],
    }));
    assert.equal(JSON.parse(globalThis.window.localStorage.getItem('memoire.accounts.v1'))[0].id, 'from-backup');

    assert.equal(restore.undoRestore(result.snapshot), true);
    assert.equal(JSON.parse(globalThis.window.localStorage.getItem('memoire.accounts.v1'))[0].id, 'original');
  });
});

describe('workspace restore: reaching the account', () => {
  test('signed out, the summary does not claim the cloud has it', async () => {
    const result = await restore.restoreWorkspace(envelope({
      'memoire.quotes.v1': [{ id: 'q1' }],
    }));

    assert.equal(result.cloudPushedCount, 0);
    assert.equal(result.collections[0].cloudPushed, null);
    assert.match(result.summary, /This browser only/);
  });

  test('a collection with no cloud table is reported as browser-only rather than pushed', async () => {
    const result = await restore.restoreWorkspace(
      envelope({ 'memoire.accounts.v1': [{ id: 'a' }] }),
      { userId: 'user-1' },
    );

    // Accounts sync through their own store and table, not the JSON collection
    // registry - the restore says so instead of implying the account has it.
    assert.equal(result.collections[0].cloudPushed, null);
  });
});
