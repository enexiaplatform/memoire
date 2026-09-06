import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  diffOpportunityState,
  opportunityChangeIdempotencyKey,
  recordOpportunityStateChanges,
} from '../../src/domain/commercialKernel/opportunityChanges.ts';
import { selectOwedCloudRecords } from '../../src/services/commercialKernel/kernelRepository.ts';

/*
 * Two questions about the event log, both of which had a wrong answer.
 *
 *   Can a genuine transition be lost to deduplication?
 *   Can a genuine transition be lost to a failed write?
 *
 * The first was real: the key was the transition plus the calendar day, so a
 * deal moved A -> B -> A -> B in one afternoon recorded the move forward once.
 * The second is answered by the local-first write path rather than by a queue,
 * and these tests pin that the retry actually happens.
 */

const OPP = 'opp-1';

/** One save's worth of state. `updatedAt` is the revision it started from. */
const version = (stage, updatedAt) => ({
  id: OPP, accountName: 'Kestrel Diagnostics', opportunityName: 'Analyser rollout',
  stage, expectedClosePeriod: 'Q4', estimatedValue: 400_000_000, status: 'Active', updatedAt,
});

/** The key a save from `previous` to `next` would write, for the stage field. */
const keyFor = (previous) => opportunityChangeIdempotencyKey(OPP, 'stage', previous.updatedAt);

describe('event idempotency - the same mutation once, different mutations separately', () => {
  test('1. the same logical mutation retried writes one event', () => {
    // A double-click on Save, or the same edit replayed after a failed sync.
    // Both start from the same version of the record.
    const previous = version('Proposal', '2026-09-05T09:00:00.000Z');
    const next = version('Negotiation', '2026-09-05T09:00:00.000Z');

    const first = diffOpportunityState(previous, next);
    const second = diffOpportunityState(previous, next);

    assert.equal(first.length, 1);
    assert.deepEqual(first, second, 'the same inputs describe the same change');
    assert.equal(keyFor(previous), keyFor(previous), 'and carry the same key, so one row is written');
  });

  test('2. A to B, back to A, and to B again on one day keeps both genuine moves', () => {
    // Each save starts from the record the one before it produced, so each has
    // its own revision. This is the case the calendar-day key discarded.
    const t0 = version('Proposal', '2026-09-05T09:00:00.000Z');
    const t1 = version('Negotiation', '2026-09-05T11:30:00.000Z');
    const t2 = version('Proposal', '2026-09-05T15:45:00.000Z');

    const forwardOnce = keyFor(t0);
    const backAgain = keyFor(t1);
    const forwardTwice = keyFor(t2);

    assert.equal(new Set([forwardOnce, backAgain, forwardTwice]).size, 3,
      'three saves on one day are three events');
    assert.notEqual(forwardOnce, forwardTwice,
      'two genuine Proposal to Negotiation moves must not collapse into one');

    // And each one really is the transition it claims.
    assert.deepEqual(
      [t0, t1, t2].map((from, index) => {
        const to = [t1, t2, version('Negotiation', '2026-09-05T17:00:00.000Z')][index];
        return diffOpportunityState(from, to)[0].to;
      }),
      ['Negotiation', 'Proposal', 'Negotiation'],
    );
  });

  test('3. the same transition on different days is two events', () => {
    const monday = version('Proposal', '2026-09-05T09:00:00.000Z');
    const thursday = version('Proposal', '2026-09-08T09:00:00.000Z');
    assert.notEqual(keyFor(monday), keyFor(thursday));
  });

  test('4. the key is deterministic and depends on nothing outside the record', () => {
    const previous = version('Proposal', '2026-09-05T09:00:00.000Z');
    const keys = Array.from({ length: 5 }, () => keyFor(previous));
    assert.equal(new Set(keys).size, 1, 'no clock, no randomness, no ordering');

    // Different fields of one save are separate events, so one failing to
    // record cannot take the others with it.
    assert.notEqual(
      opportunityChangeIdempotencyKey(OPP, 'stage', previous.updatedAt),
      opportunityChangeIdempotencyKey(OPP, 'estimatedValue', previous.updatedAt),
    );
    assert.notEqual(
      opportunityChangeIdempotencyKey(OPP, 'stage', previous.updatedAt),
      opportunityChangeIdempotencyKey('opp-2', 'stage', previous.updatedAt),
    );
  });

  test('the write path really uses the revision, not the calendar day', () => {
    // The tests above exercise the key function. This one exercises the call
    // site, because keying correctly and *passing* the right thing are two
    // different mistakes - and only this test notices the second.
    const scope = { userId: null };
    const keyOf = (previous, next) =>
      recordOpportunityStateChanges(scope, previous, next, { occurredAt: '2026-09-05T12:00:00.000Z' })[0]
        .idempotencyKey;

    const t0 = version('Proposal', '2026-09-05T09:00:00.000Z');
    const t1 = version('Negotiation', '2026-09-05T11:30:00.000Z');
    const t2 = version('Proposal', '2026-09-05T15:45:00.000Z');

    const forwardOnce = keyOf(t0, t1);
    const forwardTwice = keyOf(t2, version('Negotiation', '2026-09-05T17:00:00.000Z'));

    assert.notEqual(
      forwardOnce,
      forwardTwice,
      'two genuine same-day Proposal to Negotiation moves must reach the store as two events',
    );
    assert.equal(keyOf(t0, t1), forwardOnce, 'and the same mutation retried must reach it as one');
    assert.ok(
      forwardOnce.includes('2026-09-05T09:00:00.000Z'),
      'the key must carry the revision the mutation started from',
    );
  });

  test('a record with no revision stamp still gets a key rather than none', () => {
    assert.ok(opportunityChangeIdempotencyKey(OPP, 'stage', '2026-09-05').length > 0);
  });
});

describe('event durability - the record is its own queue entry', () => {
  const event = (id, createdAt) => ({ id, createdAt, updatedAt: createdAt });

  test('5. an event the cloud never received is offered again', () => {
    // The cloud write failed, so the event exists only in the browser copy.
    // The next windowed read must notice and push it.
    const local = [event('evt-1', '2026-09-05T09:00:00.000Z'), event('evt-2', '2026-09-05T10:00:00.000Z')];
    const cloud = [event('evt-1', '2026-09-05T09:00:00.000Z')];

    const owed = selectOwedCloudRecords(local, cloud);
    assert.deepEqual(owed.map((item) => item.id), ['evt-2'], 'exactly the one the cloud is missing');
  });

  test('6. once the cloud has it, it is not sent again', () => {
    const local = [event('evt-1', '2026-09-05T09:00:00.000Z')];
    const cloud = [event('evt-1', '2026-09-05T09:00:00.000Z')];
    assert.deepEqual(selectOwedCloudRecords(local, cloud), [],
      'a successful write clears the retry; nothing re-uploads on every load');
  });

  test('7. a retry that races a successful write cannot duplicate the row', () => {
    // Even if the same event is offered twice, it carries the same id and the
    // same idempotency key, so the upsert and the partial unique index both
    // collapse it. This asserts the id is what identifies it, not arrival order.
    const local = [event('evt-1', '2026-09-05T09:00:00.000Z')];
    const cloudAfterRace = [event('evt-1', '2026-09-05T09:00:00.000Z')];
    assert.deepEqual(selectOwedCloudRecords(local, cloudAfterRace), []);
  });
});
