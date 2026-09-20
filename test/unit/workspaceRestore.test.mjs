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
  test('a legacy backup starts a new verified boundary at restore time', async () => {
    const result = await restore.restoreWorkspace(envelope({ 'memoire.commercialConditions.v1': [] }));
    assert.equal(result.ok, true);
    const marker = JSON.parse(globalThis.window.localStorage.getItem('memoire.historyCoverage.v1'));
    assert.equal(marker.length, 1);
    assert.equal(marker[0].scope, 'guest');
    assert.ok(Date.parse(marker[0].historyGuaranteedFrom) > Date.parse('2026-08-01T00:00:00.000Z'));
    assert.deepEqual(JSON.parse(globalThis.window.localStorage.getItem('memoire.stateRevisions.v1')), []);
  });

  test('a signed-in historical backup is refused before replacing local state', async () => {
    globalThis.window.localStorage.setItem('memoire.settings.v1', JSON.stringify({ theme: 'old' }));
    await assert.rejects(restore.restoreWorkspace({ ...envelope({
      'memoire.commercialConditions.v1': [],
      'memoire.historyCoverage.v1': [{ scope: 'user-1', historyGuaranteedFrom: '2026-09-01T00:00:00Z', schemaVersion: 1 }],
      'memoire.stateRevisions.v1': [],
    }), formatVersion: 9 }, { userId: 'user-1' }), /transactional history restore/);
    assert.equal(globalThis.window.localStorage.getItem('memoire.settings.v1'), JSON.stringify({ theme: 'old' }));
  });

  test('history-only account restore and partial browser merge cannot claim continuity', async () => {
    const marker = { scope: 'user-1', historyGuaranteedFrom: '2026-09-01T00:00:00Z', schemaVersion: 1 };
    const file = { ...envelope({ 'memoire.historyCoverage.v1': [marker], 'memoire.stateRevisions.v1': [] }), formatVersion: 9 };
    await assert.rejects(restore.restoreWorkspace(file, { userId: 'user-1' }), /transactional history restore/);
    await assert.rejects(restore.restoreWorkspace(file, { clearFirst: false }), /must replace/);
    assert.equal(globalThis.window.localStorage.getItem('memoire.historyCoverage.v1'), null);
  });

  test('a local historical backup retains its original boundary and deleted-entity sequence', async () => {
    const marker = { scope: 'guest', historyGuaranteedFrom: '2026-09-01T00:00:00Z', schemaVersion: 1 };
    const base = { id: 'rev-1', scope: 'guest', entityType: 'commercial_conditions', entityId: 'gone',
      revisionNo: 1, mutationId: 'mutation-1', operation: 'baseline', recordedAt: '2026-09-01T00:00:00Z',
      schemaVersion: 1, state: { id: 'gone' } };
    const deleted = { ...base, id: 'rev-2', revisionNo: 2, mutationId: 'mutation-2',
      operation: 'delete', recordedAt: '2026-09-02T00:00:00Z', state: null };
    await restore.restoreWorkspace({ ...envelope({ 'memoire.commercialConditions.v1': [],
      'memoire.historyCoverage.v1': [marker], 'memoire.stateRevisions.v1': [base, deleted] }), formatVersion: 9 });
    assert.deepEqual(JSON.parse(globalThis.window.localStorage.getItem('memoire.historyCoverage.v1')), [marker]);
    assert.deepEqual(JSON.parse(globalThis.window.localStorage.getItem('memoire.stateRevisions.v1')), [base, deleted]);
  });

  test('a revision gap in a backup is rejected before replacing the workspace', async () => {
    globalThis.window.localStorage.setItem('memoire.settings.v1', JSON.stringify({ theme: 'old' }));
    const file = { ...envelope({
      'memoire.historyCoverage.v1': [{ scope: 'guest', historyGuaranteedFrom: '2026-09-01T00:00:00Z', schemaVersion: 1 }],
      'memoire.stateRevisions.v1': [{ id: 'rev-2', scope: 'guest', entityType: 'commercial_conditions',
        entityId: 'condition', revisionNo: 2, mutationId: 'mutation-2', operation: 'update',
        recordedAt: '2026-09-02T00:00:00Z', schemaVersion: 1, state: { id: 'condition' } }],
    }), formatVersion: 9 };
    await assert.rejects(restore.restoreWorkspace(file), /sequence/);
    assert.equal(globalThis.window.localStorage.getItem('memoire.settings.v1'), JSON.stringify({ theme: 'old' }));
  });
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

    await assert.rejects(restore.restoreWorkspace(envelope({
      'memoire.accounts.v1': [{ id: 'a' }],
      'memoire.quotes.v1': [{ id: 'q' }],
    })), /previous workspace was restored/);
    assert.equal(globalThis.window.localStorage.getItem('memoire.accounts.v1'), null);
    assert.equal(globalThis.window.localStorage.getItem('memoire.quotes.v1'), null);

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
    assert.match(result.summary, /Browser recovery only/);
  });

  test('a collection with no cloud table is reported as browser-only rather than pushed', async () => {
    const result = await restore.restoreWorkspace(
      envelope({ 'memoire.settings.v1': { theme: 'light' } }),
      { userId: 'user-1' },
    );

    // Browser preferences have no canonical cloud record to acknowledge.
    assert.equal(result.collections[0].cloudPushed, null);
  });
});
