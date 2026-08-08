import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

/**
 * The test for the bug that made a business look gone.
 *
 * A signed-in seller opened Accounts and saw 0 of 984, Stakeholders 0 of 1,000
 * and Opportunities 11 of 126, in the same session, with every Supabase request
 * answering 200. The screen was drawn from the browser copy at first paint, and
 * the test guarding that fast path only asked whether the copy held any record
 * at all - which it did, because eleven deals had been edited on that device.
 *
 * Nothing mirrors a cloud load into localStorage, so a signed-in seller's copy is
 * never a workspace. That is the distinction being pinned here.
 */

class FakeStorage {
  constructor() { this.map = new Map(); }
  get length() { return this.map.size; }
  key(index) { return [...this.map.keys()][index] ?? null; }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
  clear() { this.map.clear(); }
}

const USER = 'user-1';

let census;

describe('workspace census: telling a workspace from a fragment of one', () => {
  beforeEach(async () => {
    const storage = new FakeStorage();
    globalThis.localStorage = storage;
    globalThis.window = { localStorage: storage, dispatchEvent() {}, addEventListener() {} };
    census = await import(`../../src/services/workspaceCensus.ts?case=${Math.random()}`);
  });

  test('a device that has never completed a cloud load waits rather than guessing', () => {
    // The exact shape that shipped: eleven locally-edited deals and nothing else.
    const local = { opportunities: new Array(11).fill({}), accounts: [], stakeholders: [] };
    assert.equal(census.isLocalCopyComplete(USER, local), false);
    assert.match(census.describeLocalShortfall(USER, local), /has ever completed/);
  });

  test('a copy short of what the cloud last held is refused', () => {
    census.recordWorkspaceCensus(USER, {
      accounts: new Array(1086).fill({}),
      stakeholders: new Array(1738).fill({}),
      opportunities: new Array(126).fill({}),
    });

    const fragment = { accounts: [], stakeholders: [], opportunities: new Array(11).fill({}) };
    assert.equal(census.isLocalCopyComplete(USER, fragment), false);

    const shortfall = census.describeLocalShortfall(USER, fragment);
    assert.match(shortfall, /accounts 0\/1086/);
    assert.match(shortfall, /stakeholders 0\/1738/);
    assert.match(shortfall, /opportunities 11\/126/);
  });

  test('a copy that matches the census is served', () => {
    census.recordWorkspaceCensus(USER, { accounts: new Array(10).fill({}), opportunities: new Array(4).fill({}) });
    assert.equal(
      census.isLocalCopyComplete(USER, { accounts: new Array(10).fill({}), opportunities: new Array(4).fill({}) }),
      true,
    );
  });

  test('a few records deleted on another device do not pin the fast path off', () => {
    census.recordWorkspaceCensus(USER, { accounts: new Array(100).fill({}) });
    // Inside the 5% tolerance.
    assert.equal(census.isLocalCopyComplete(USER, { accounts: new Array(96).fill({}) }), true);
    // Outside it.
    assert.equal(census.isLocalCopyComplete(USER, { accounts: new Array(90).fill({}) }), false);
  });

  test('collections the cloud has none of are not held against the copy', () => {
    // A real workspace legitimately has no expenses. Requiring every collection
    // would mean nobody ever gets the fast path.
    census.recordWorkspaceCensus(USER, { accounts: new Array(5).fill({}), expenses: [] });
    assert.equal(census.isLocalCopyComplete(USER, { accounts: new Array(5).fill({}) }), true);
  });

  test('one user\'s census is not another\'s', () => {
    census.recordWorkspaceCensus(USER, { accounts: new Array(500).fill({}) });
    assert.equal(census.isLocalCopyComplete('user-2', { accounts: new Array(500).fill({}) }), false);
  });

  test('a cleared census sends the next first paint back to waiting', () => {
    census.recordWorkspaceCensus(USER, { accounts: new Array(5).fill({}) });
    census.clearWorkspaceCensus(USER);
    assert.equal(census.getWorkspaceCensus(USER), null);
    assert.equal(census.isLocalCopyComplete(USER, { accounts: new Array(5).fill({}) }), false);
  });
});
