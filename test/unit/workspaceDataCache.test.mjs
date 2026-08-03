import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';

const {
  clearCachedWorkspacePromise,
  getCachedWorkspacePromise,
  getCachedWorkspaceValue,
  getWorkspaceCacheStamp,
  invalidateWorkspaceCollection,
  invalidateWorkspaceDataCache,
  setCachedWorkspacePromise,
  setCachedWorkspaceValue,
} = await import('../../src/services/workspaceDataCache.ts');

// Keys are `ws:<userId>:<collection>` - the last segment is what a scoped
// invalidation matches on.
const ACCOUNTS = 'ws:user-1:accounts';
const OPPORTUNITIES = 'ws:user-1:opportunities';

describe('workspace data cache', () => {
  beforeEach(() => {
    invalidateWorkspaceDataCache();
  });

  it('shares one in-flight load with every surface that asks during it', () => {
    const load = Promise.resolve([]);
    setCachedWorkspacePromise(ACCOUNTS, load);

    assert.equal(getCachedWorkspacePromise(ACCOUNTS), load);
    assert.equal(getCachedWorkspacePromise(ACCOUNTS), load);
  });

  it('stops sharing a load once the workspace changes underneath it', () => {
    const load = Promise.resolve([]);
    setCachedWorkspacePromise(ACCOUNTS, load);
    invalidateWorkspaceDataCache();

    assert.equal(getCachedWorkspacePromise(ACCOUNTS), null);
  });

  it('refuses to cache a value merged before the workspace changed', () => {
    const stampAtLoadStart = getWorkspaceCacheStamp('accounts');
    invalidateWorkspaceDataCache();
    setCachedWorkspaceValue(ACCOUNTS, ['stale'], stampAtLoadStart);

    assert.equal(getCachedWorkspaceValue(ACCOUNTS), null);
  });

  it('serves a value merged from the current workspace', () => {
    const value = ['fresh'];
    setCachedWorkspaceValue(ACCOUNTS, value, getWorkspaceCacheStamp('accounts'));

    assert.equal(getCachedWorkspaceValue(ACCOUNTS), value);
  });

  it('drops every cached value on invalidation', () => {
    setCachedWorkspaceValue(ACCOUNTS, ['fresh'], getWorkspaceCacheStamp('accounts'));
    invalidateWorkspaceDataCache();

    assert.equal(getCachedWorkspaceValue(ACCOUNTS), null);
  });

  it('only clears the in-flight entry that finished, not a newer one', () => {
    const abandoned = Promise.resolve([]);
    const current = Promise.resolve([]);
    setCachedWorkspacePromise(ACCOUNTS, abandoned);
    setCachedWorkspacePromise(ACCOUNTS, current);

    clearCachedWorkspacePromise(ACCOUNTS, abandoned);

    assert.equal(getCachedWorkspacePromise(ACCOUNTS), current);
  });
});

/**
 * Saving one record used to clear all sixteen collections, so editing a deal
 * made the next screen refetch 1,083 accounts and 1,738 stakeholders it had not
 * touched - about 3 MB of JSON. A write now names what it changed.
 */
describe('workspace cache: a write only drops what it changed', () => {
  beforeEach(() => {
    invalidateWorkspaceDataCache();
  });

  it('keeps the other collections when one is invalidated', () => {
    setCachedWorkspaceValue(ACCOUNTS, ['acme'], getWorkspaceCacheStamp('accounts'));
    setCachedWorkspaceValue(OPPORTUNITIES, ['deal'], getWorkspaceCacheStamp('opportunities'));

    invalidateWorkspaceCollection('opportunities');

    assert.deepEqual(getCachedWorkspaceValue(ACCOUNTS), ['acme']);
    assert.equal(getCachedWorkspaceValue(OPPORTUNITIES), null);
  });

  it('drops the same collection for every user it is cached under', () => {
    setCachedWorkspaceValue('ws:user-1:opportunities', ['a'], getWorkspaceCacheStamp('opportunities'));
    setCachedWorkspaceValue('ws:local:opportunities', ['b'], getWorkspaceCacheStamp('opportunities'));

    invalidateWorkspaceCollection('opportunities');

    assert.equal(getCachedWorkspaceValue('ws:user-1:opportunities'), null);
    assert.equal(getCachedWorkspaceValue('ws:local:opportunities'), null);
  });

  it('refuses a load that started before its own collection changed', () => {
    const stampAtLoadStart = getWorkspaceCacheStamp('opportunities');
    invalidateWorkspaceCollection('opportunities');
    setCachedWorkspaceValue(OPPORTUNITIES, ['stale'], stampAtLoadStart);

    assert.equal(getCachedWorkspaceValue(OPPORTUNITIES), null);
  });

  it('still accepts a load whose own collection did not change', () => {
    const stampAtLoadStart = getWorkspaceCacheStamp('accounts');
    invalidateWorkspaceCollection('opportunities');
    setCachedWorkspaceValue(ACCOUNTS, ['acme'], stampAtLoadStart);

    assert.deepEqual(getCachedWorkspaceValue(ACCOUNTS), ['acme']);
  });

  it('stops sharing an in-flight load of the collection that changed', () => {
    const load = Promise.resolve([]);
    setCachedWorkspacePromise(OPPORTUNITIES, load);
    invalidateWorkspaceCollection('opportunities');

    assert.equal(getCachedWorkspacePromise(OPPORTUNITIES), null);
  });

  it('leaves an unrelated in-flight load alone', () => {
    const load = Promise.resolve([]);
    setCachedWorkspacePromise(ACCOUNTS, load);
    invalidateWorkspaceCollection('opportunities');

    assert.equal(getCachedWorkspacePromise(ACCOUNTS), load);
  });

  it('a collection outside the workspace cannot clear one inside it', () => {
    // Plan items, nudges, order milestones and both commitment stores are not
    // part of SalesWorkspaceData. Ticking a plan item used to clear the whole
    // cached workspace for data the workspace does not even hold.
    setCachedWorkspaceValue(ACCOUNTS, ['acme'], getWorkspaceCacheStamp('accounts'));

    invalidateWorkspaceCollection('planItems');

    assert.deepEqual(getCachedWorkspaceValue(ACCOUNTS), ['acme']);
  });
});
