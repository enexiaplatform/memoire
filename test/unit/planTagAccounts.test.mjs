import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildPlanTagAccountCandidates, planRecordsForCandidate } from '../../src/utils/planTagAccounts.ts';

const record = (overrides = {}) => ({
  id: `r-${Math.random().toString(36).slice(2)}`,
  date: '2026-07-27', label: 'Do the thing', tag: 'FKV',
  done: false, createdAt: '', updatedAt: '', ...overrides,
});

const week = { rangeStart: '2026-07-27', rangeEnd: '2026-08-02' };
const base = { accounts: [], opportunities: [], ...week };

describe('buildPlanTagAccountCandidates', () => {
  test('proposes the customers a hand-written week is actually about', () => {
    const candidates = buildPlanTagAccountCandidates({
      ...base,
      records: [
        record({ tag: 'FKV', label: 'Connect Ms. Yen & Ms. Mai' }),
        record({ tag: 'Bidiphar', label: 'Asking sample from PMM' }),
      ],
    });

    assert.deepEqual(candidates.map((candidate) => candidate.name).sort(), ['Bidiphar', 'FKV']);
    assert.equal(candidates.every((candidate) => candidate.itemCount === 1), true);
  });

  test('one customer written two ways is proposed once, with the fuller spelling', () => {
    // Straight from a real plan: "[DP Lab] Meeting" and "[DPLab] Pricing for Conda".
    const candidates = buildPlanTagAccountCandidates({
      ...base,
      records: [
        record({ tag: 'DP Lab', label: 'Meeting' }),
        record({ tag: 'DPLab', label: 'Pricing for Conda' }),
      ],
    });

    assert.equal(candidates.length, 1, 'creating two accounts here would manufacture a duplicate');
    assert.equal(candidates[0].name, 'DP Lab', 'the spelling a person spaced out reads best');
    assert.deepEqual(candidates[0].spellings, ['DP Lab', 'DPLab']);
    assert.equal(candidates[0].itemCount, 2);
  });

  test('category tags are never turned into customers', () => {
    const candidates = buildPlanTagAccountCandidates({
      ...base,
      records: [
        record({ tag: 'Internal', label: 'Weekly meeting' }),
        record({ tag: 'New Customer', label: 'Euvipharm, Rohto book' }),
        record({ tag: 'Masan', label: 'Follow up & Meeting' }),
      ],
    });

    assert.deepEqual(candidates.map((candidate) => candidate.name), ['Masan']);
  });

  test('an account the workspace already knows is not proposed again', () => {
    const candidates = buildPlanTagAccountCandidates({
      ...base,
      accounts: [{ id: 'a1', accountName: 'Masan' }],
      opportunities: [{ id: 'o1', accountName: 'PMP' }],
      records: [
        record({ tag: 'Masan' }),
        record({ tag: 'PMP' }),
        record({ tag: 'NamKhoa' }),
      ],
    });

    assert.deepEqual(candidates.map((candidate) => candidate.name), ['NamKhoa']);
  });

  test('items outside the period, and items already linked, are left alone', () => {
    const candidates = buildPlanTagAccountCandidates({
      ...base,
      records: [
        record({ tag: 'NextMonth', date: '2026-09-01' }),
        record({ tag: 'AlreadyLinked', linkedAccountName: 'AlreadyLinked' }),
        record({ tag: 'Cobetter' }),
      ],
    });

    assert.deepEqual(candidates.map((candidate) => candidate.name), ['Cobetter']);
  });

  test('completion stubs for derived items are not candidates', () => {
    // These carry a deal's account, which exists by definition.
    const candidates = buildPlanTagAccountCandidates({
      ...base,
      records: [record({ tag: 'SomeDeal', derivedKey: 'deal:o1:2026-07-27' })],
    });
    assert.deepEqual(candidates, []);
  });

  test('a real week of customers is reported in full, not silently truncated', () => {
    // A hand-written week routinely names a dozen-plus customers. Telling the
    // operator there are eight when there are fifteen hides the work.
    const records = Array.from({ length: 15 }, (_, index) => record({ tag: `Customer ${index}`, label: `Work ${index}` }));
    const candidates = buildPlanTagAccountCandidates({ ...base, records });
    assert.equal(candidates.length, 15);
  });

  test('creating the account links every spelling, not just the one clicked', () => {
    const records = [
      record({ id: 'r1', tag: 'DP Lab' }),
      record({ id: 'r2', tag: 'DPLab' }),
      record({ id: 'r3', tag: 'Masan' }),
    ];
    const [candidate] = buildPlanTagAccountCandidates({ ...base, records: records.filter((r) => r.tag !== 'Masan') });
    const linked = planRecordsForCandidate(records, candidate).map((r) => r.id).sort();
    assert.deepEqual(linked, ['r1', 'r2']);
  });
});
