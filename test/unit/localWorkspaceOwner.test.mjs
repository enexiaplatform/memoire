import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

/**
 * The isolation this file guards is the one that failed in the field: a new
 * account signed in on a browser that still held another workspace and read its
 * customers. The two things that must stay true are that the foreign records go
 * and that the Supabase session does not go with them.
 */

class FakeStorage {
  constructor(entries = {}) {
    this.map = new Map(Object.entries(entries));
  }
  get length() { return this.map.size; }
  key(index) { return [...this.map.keys()][index] ?? null; }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
}

const OWNER_KEY = 'memoire.local-workspace-owner.v1';
const FOUNDER = '5b87bd58-aa3e-4167-bf62-82531597bf8a';
const NEWCOMER = '8252530c-4ea6-4416-9d92-1b2502d17363';

function foreignWorkspace(owner) {
  return new FakeStorage({
    [OWNER_KEY]: owner,
    'memoire.opportunities.v1': '[{"id":"opp-1","accountName":"SUNTORY PEPSICO"}]',
    'memoire.accountMerges.v1': '[{"id":"merge-1","canonicalAccountName":"CALOFIC"}]',
    'memoire_reporting_currency': 'SGD',
    'memoire.workspace.census.v1': '{}',
    'memoire.supabase.auth': '{"access_token":"keep-me"}',
    'memoire.analytics.anonymousId.v1': 'device-1',
    'sb-project-auth-token': '{"access_token":"keep-me-too"}',
  });
}

let scope;
const events = [];

beforeEach(async () => {
  events.length = 0;
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, init = {}) { this.type = type; this.detail = init.detail ?? null; }
  };
  globalThis.window = {
    localStorage: new FakeStorage(),
    dispatchEvent: (event) => { events.push(event); return true; },
  };
  scope = await import(`../../src/services/localWorkspaceOwner.ts?case=${Math.random()}`);
});

describe('claimLocalWorkspace', () => {
  test('clears another account\'s records before the new account can read them', () => {
    globalThis.window.localStorage = foreignWorkspace(FOUNDER);

    const result = scope.claimLocalWorkspace(NEWCOMER);

    assert.equal(result.outcome, 'purged');
    assert.equal(result.previousOwner, FOUNDER);
    const storage = globalThis.window.localStorage;
    assert.equal(storage.getItem('memoire.opportunities.v1'), null);
    assert.equal(storage.getItem('memoire.accountMerges.v1'), null);
    assert.equal(storage.getItem('memoire.workspace.census.v1'), null);
    assert.equal(storage.getItem(OWNER_KEY), NEWCOMER);
  });

  test('the reporting currency does not survive a change of owner', () => {
    // A workspace opened in SGD because the browser, not the account, said so.
    globalThis.window.localStorage = foreignWorkspace(FOUNDER);

    scope.claimLocalWorkspace(NEWCOMER);

    assert.equal(globalThis.window.localStorage.getItem('memoire_reporting_currency'), null);
  });

  test('keeps the session, so protecting the user does not sign them out', () => {
    globalThis.window.localStorage = foreignWorkspace(FOUNDER);

    scope.claimLocalWorkspace(NEWCOMER);

    const storage = globalThis.window.localStorage;
    assert.equal(storage.getItem('memoire.supabase.auth'), '{"access_token":"keep-me"}');
    assert.equal(storage.getItem('sb-project-auth-token'), '{"access_token":"keep-me-too"}');
    assert.equal(storage.getItem('memoire.analytics.anonymousId.v1'), 'device-1');
  });

  test('records captured signed out are adopted, not destroyed', () => {
    globalThis.window.localStorage = new FakeStorage({
      'memoire.opportunities.v1': '[{"id":"opp-trial"}]',
    });

    const result = scope.claimLocalWorkspace(NEWCOMER);

    assert.equal(result.outcome, 'adopted');
    assert.equal(globalThis.window.localStorage.getItem('memoire.opportunities.v1'), '[{"id":"opp-trial"}]');
    assert.equal(globalThis.window.localStorage.getItem(OWNER_KEY), NEWCOMER);
  });

  test('the owner signing back in keeps their own records', () => {
    globalThis.window.localStorage = foreignWorkspace(FOUNDER);

    const result = scope.claimLocalWorkspace(FOUNDER);

    assert.equal(result.outcome, 'unchanged');
    assert.equal(result.removedKeys.length, 0);
    assert.ok(globalThis.window.localStorage.getItem('memoire.opportunities.v1'));
  });

  test('announces the purge so the shell can explain the empty workspace', () => {
    globalThis.window.localStorage = foreignWorkspace(FOUNDER);

    scope.claimLocalWorkspace(NEWCOMER);

    const purge = events.find((event) => event.type === scope.LOCAL_WORKSPACE_PURGED_EVENT);
    assert.ok(purge, 'expected a purge event');
    assert.ok(purge.detail.removedKeyCount > 0);
  });
});

describe('isWorkspaceScopedKey', () => {
  test('separates records from device state', () => {
    assert.equal(scope.isWorkspaceScopedKey('memoire.opportunities.v1'), true);
    assert.equal(scope.isWorkspaceScopedKey('memoire_reporting_currency'), true);
    assert.equal(scope.isWorkspaceScopedKey('memoire.supabase.auth'), false);
    assert.equal(scope.isWorkspaceScopedKey('memoire.analytics.anonymousId.v1'), false);
    assert.equal(scope.isWorkspaceScopedKey(OWNER_KEY), false);
    assert.equal(scope.isWorkspaceScopedKey('sb-project-auth-token'), false);
  });
});
