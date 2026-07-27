import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

class MemoryStorage {
  #data = new Map();
  getItem(key) { return this.#data.has(key) ? this.#data.get(key) : null; }
  setItem(key, value) { this.#data.set(key, String(value)); }
  removeItem(key) { this.#data.delete(key); }
  clear() { this.#data.clear(); }
}

const storage = new MemoryStorage();
const dispatched = [];

globalThis.window = {
  localStorage: storage,
  dispatchEvent: (event) => { dispatched.push(event.type); return true; },
  addEventListener: () => {},
  removeEventListener: () => {},
};
globalThis.localStorage = storage;
globalThis.CustomEvent = class CustomEvent {
  constructor(type, init) { this.type = type; this.detail = init?.detail; }
};

const { writeLocal, readLocal } = await import('../../src/services/commercialKernel/kernelRepository.ts');
const { commitmentCodec } = await import('../../src/services/commercialKernel/commitmentStore.ts');
const {
  beginWorkspaceSyncCheck,
  reportWorkspaceSyncReady,
  reportWorkspaceSyncError,
  getWorkspaceSyncStatus,
} = await import('../../src/services/workspaceSyncStatus.ts');

const commitment = (patch = {}) => ({
  id: 'c-1', threadId: '', accountId: '', accountName: 'Northstar Foods', opportunityId: null,
  commitmentParty: 'self', ownerLabel: 'You', commitmentText: 'Send revised quote',
  originalDueDate: '2026-08-01', currentDueDate: '2026-08-01', silenceThresholdDays: 3,
  status: 'open', impactType: 'none', dueDateHistory: [], sourceType: 'manual',
  createdAt: '2026-07-27T00:00:00.000Z', updatedAt: '2026-07-27T00:00:00.000Z', ...patch,
});

beforeEach(() => {
  storage.clear();
  dispatched.length = 0;
});

describe('writeLocal', () => {
  test('announces a real change', () => {
    writeLocal(commitmentCodec, [commitment()]);
    assert.equal(dispatched.length, 1);
    assert.equal(dispatched[0], 'memoire:commercial-commitments-updated');
  });

  // The regression this file exists for. Every load path ends in a write: a
  // cloud/local merge finishes by persisting the merged result, which is
  // normally identical to what was already stored. When that counted as a
  // change, a surface listening for the update refetched the workspace, the
  // refetch merged and wrote again, and the cycle never terminated - the sync
  // pill flickered and Supabase took an upsert on every pass.
  test('a write that changes nothing announces nothing', () => {
    writeLocal(commitmentCodec, [commitment()]);
    dispatched.length = 0;

    writeLocal(commitmentCodec, [commitment()]);
    assert.deepEqual(dispatched, [], 'an identical re-write must not look like a change');

    // Re-deriving the same list many times, as a merge loop would.
    for (let i = 0; i < 25; i += 1) writeLocal(commitmentCodec, [commitment()]);
    assert.deepEqual(dispatched, [], 'no number of identical writes may produce an event');
  });

  test('still returns the stored records when it announces nothing', () => {
    writeLocal(commitmentCodec, [commitment()]);
    const second = writeLocal(commitmentCodec, [commitment()]);
    assert.equal(second.length, 1);
    assert.equal(second[0].commitmentText, 'Send revised quote');
    assert.equal(readLocal(commitmentCodec).length, 1);
  });

  test('a genuine edit is announced', () => {
    writeLocal(commitmentCodec, [commitment()]);
    dispatched.length = 0;

    writeLocal(commitmentCodec, [commitment({ status: 'completed', updatedAt: '2026-07-28T00:00:00.000Z' })]);
    assert.equal(dispatched.length, 1, 'completing a promise is a change');

    dispatched.length = 0;
    writeLocal(commitmentCodec, []);
    assert.equal(dispatched.length, 1, 'removing the last record is a change');
  });
});

describe('workspace sync status', () => {
  test('the first check is announced, later ones are silent', () => {
    // "Checking sync..." is honest the first time. Afterwards it is noise:
    // several surfaces reload as the user moves around, and announcing each one
    // flickered the pill between "Checking sync..." and its real state.
    beginWorkspaceSyncCheck();
    assert.equal(getWorkspaceSyncStatus().state, 'checking');

    reportWorkspaceSyncReady();
    assert.equal(getWorkspaceSyncStatus().state, 'ready');

    for (let i = 0; i < 10; i += 1) {
      beginWorkspaceSyncCheck();
      assert.equal(getWorkspaceSyncStatus().state, 'ready', 'a background recheck must not flicker the pill');
    }
  });

  test('a failure still gets through, and repeats stay quiet', () => {
    reportWorkspaceSyncError('Cloud sync is unavailable.');
    assert.equal(getWorkspaceSyncStatus().state, 'error');

    const before = dispatched.length;
    reportWorkspaceSyncError('Cloud sync is unavailable.');
    assert.equal(dispatched.length, before, 'the same error twice is not news');
  });
});
