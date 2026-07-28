import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSupplierCommitments,
  createSupplierCommitmentRecord,
  defaultPartyForKind,
  supplierCommitmentsAsOwnObligations,
  SUPPLIER_OBLIGATION_MARKER,
} from '../../src/utils/supplierCommitments.ts';
import { buildOwnObligations } from '../../src/utils/ownObligations.ts';
import { buildPlanBoard } from '../../src/utils/weeklyPlan.ts';

const commitment = (id, overrides = {}) => ({
  id,
  brand: 'Sartorius',
  party: 'self',
  kind: 'Forecast',
  label: `Item ${id}`,
  dueDate: '2026-07-30',
  status: 'open',
  amount: null,
  currency: 'VND',
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
  ...overrides,
});

describe('supplier commitments: both directions stay separate', () => {
  test('what you owe and what they owe are never mixed into one list', () => {
    const model = buildSupplierCommitments({
      records: [
        commitment('a', { party: 'self', kind: 'Forecast' }),
        commitment('b', { party: 'supplier', kind: 'Pricing' }),
      ],
      today: '2026-07-28',
    });

    const [group] = model.groups;
    assert.equal(group.brand, 'Sartorius');
    assert.deepEqual(group.iOwe.map((view) => view.id), ['a']);
    assert.deepEqual(group.theyOwe.map((view) => view.id), ['b']);
    assert.equal(model.waitingOnSuppliers.length, 1);
  });

  test('done and cancelled items leave the open picture', () => {
    const model = buildSupplierCommitments({
      records: [
        commitment('open'),
        commitment('done', { status: 'done' }),
        commitment('cancelled', { status: 'cancelled' }),
        commitment('deleted', { __deleted: true }),
      ],
      today: '2026-07-28',
    });

    assert.equal(model.openCount, 1);
    assert.equal(model.groups[0].openCount, 1);
  });

  test('a principal with something overdue sorts to the top', () => {
    const model = buildSupplierCommitments({
      records: [
        commitment('quiet', { brand: 'Cobetter', dueDate: '2026-08-30' }),
        commitment('late', { brand: 'Conda', dueDate: '2026-07-01', party: 'supplier', kind: 'Sample' }),
      ],
      today: '2026-07-28',
    });

    assert.equal(model.groups[0].brand, 'Conda');
    assert.equal(model.groups[0].overdueCount, 1);
    assert.equal(model.overdueCount, 1);
  });
});

describe('supplier commitments: only your own side becomes an obligation', () => {
  test('what the principal owes you is never counted as an obligation you owe', () => {
    const obligations = supplierCommitmentsAsOwnObligations({
      records: [
        commitment('mine', { party: 'self' }),
        commitment('theirs', { party: 'supplier', kind: 'Pricing' }),
      ],
      today: '2026-07-28',
    });

    assert.equal(obligations.length, 1);
    assert.equal(obligations[0].id, 'obligation-supplier-mine');
    assert.equal(obligations[0].counterparty, 'Sartorius');
  });

  test('an undated promise never lands on a day it did not earn', () => {
    const obligations = supplierCommitmentsAsOwnObligations({
      records: [commitment('nodate', { dueDate: '' })],
      today: '2026-07-28',
    });
    assert.equal(obligations.length, 0);
  });

  test('they join the week beside quote and expense obligations', () => {
    const model = buildOwnObligations({
      expenses: [],
      quotes: [],
      supplierObligations: supplierCommitmentsAsOwnObligations({
        records: [commitment('late', { dueDate: '2026-07-01' })],
        today: '2026-07-28',
      }),
      today: '2026-07-28',
    });

    assert.equal(model.obligations.length, 1);
    assert.equal(model.overdue.length, 1);
    assert.match(model.obligations[0].label, /Forecast/);
  });

  test('money owed to a principal counts toward what you owe', () => {
    const model = buildOwnObligations({
      expenses: [],
      quotes: [],
      supplierObligations: supplierCommitmentsAsOwnObligations({
        records: [commitment('pay', { kind: 'Payment', amount: 250_000, currency: 'VND' })],
        today: '2026-07-28',
      }),
      today: '2026-07-28',
    });

    assert.equal(model.paymentsOwedBase, 250_000);
  });

  test('the supplier marker survives the plan board wrapping its own prefix on', () => {
    // The board builds its item id as `obligation-${obligation.id}`, so a
    // supplier obligation arrives as obligation-obligation-supplier-<id>. A
    // startsWith check reads false there and the board explains the wrong
    // record - which is exactly what happened before this test existed.
    const board = buildPlanBoard({
      periodType: 'week',
      anchorDate: new Date(2026, 6, 28),
      opportunities: [],
      obligations: supplierCommitmentsAsOwnObligations({
        records: [commitment('forecast', { dueDate: '2026-07-30' })],
        today: '2026-07-28',
      }),
      records: [],
      today: '2026-07-28',
    });

    const item = board.days.flatMap((day) => day.items).find((entry) => entry.kind === 'obligation');
    assert.ok(item, 'the obligation must reach the board');
    assert.equal(item.id.startsWith(SUPPLIER_OBLIGATION_MARKER), false, 'the marker is not at the start');
    assert.ok(item.id.includes(SUPPLIER_OBLIGATION_MARKER), 'the marker must still be findable inside the id');
  });

  test('a new record defaults to the side that usually owes that thing', () => {
    assert.equal(defaultPartyForKind.Forecast, 'self');
    assert.equal(defaultPartyForKind.Sample, 'supplier');
    const record = createSupplierCommitmentRecord({
      brand: 'Conda',
      party: defaultPartyForKind.Sample,
      kind: 'Sample',
      label: 'Demo unit for DP Lab',
      dueDate: '2026-08-05',
    });
    assert.equal(record.party, 'supplier');
    assert.equal(record.status, 'open');
  });
});
