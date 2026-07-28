import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';

const {
  clearCachedWorkspacePromise,
  getCachedWorkspacePromise,
  getCachedWorkspaceValue,
  getWorkspaceDataGeneration,
  invalidateWorkspaceDataCache,
  setCachedWorkspacePromise,
  setCachedWorkspaceValue,
} = await import('../../src/services/workspaceDataCache.ts');

const KEY = 'sales-workspace:user-1';

describe('workspace data cache', () => {
  beforeEach(() => {
    invalidateWorkspaceDataCache();
  });

  it('shares one in-flight load with every surface that asks during it', () => {
    const load = Promise.resolve({ accounts: [] });
    setCachedWorkspacePromise(KEY, load);

    assert.equal(getCachedWorkspacePromise(KEY), load);
    assert.equal(getCachedWorkspacePromise(KEY), load);
  });

  it('stops sharing a load once the workspace changes underneath it', () => {
    const load = Promise.resolve({ accounts: [] });
    setCachedWorkspacePromise(KEY, load);
    invalidateWorkspaceDataCache();

    assert.equal(getCachedWorkspacePromise(KEY), null);
  });

  it('refuses to cache a value merged before the workspace changed', () => {
    const generationAtLoadStart = getWorkspaceDataGeneration();
    invalidateWorkspaceDataCache();
    setCachedWorkspaceValue(KEY, { accounts: ['stale'] }, generationAtLoadStart);

    assert.equal(getCachedWorkspaceValue(KEY), null);
  });

  it('serves a value merged from the current workspace', () => {
    const value = { accounts: ['fresh'] };
    setCachedWorkspaceValue(KEY, value, getWorkspaceDataGeneration());

    assert.equal(getCachedWorkspaceValue(KEY), value);
  });

  it('drops every cached value on invalidation', () => {
    setCachedWorkspaceValue(KEY, { accounts: ['fresh'] }, getWorkspaceDataGeneration());
    invalidateWorkspaceDataCache();

    assert.equal(getCachedWorkspaceValue(KEY), null);
  });

  it('only clears the in-flight entry that finished, not a newer one', () => {
    const abandoned = Promise.resolve({ accounts: [] });
    const current = Promise.resolve({ accounts: [] });
    setCachedWorkspacePromise(KEY, abandoned);
    setCachedWorkspacePromise(KEY, current);

    clearCachedWorkspacePromise(KEY, abandoned);

    assert.equal(getCachedWorkspacePromise(KEY), current);
  });
});
