import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCommercialThreads } from '../../src/domain/commercialKernel/deriveThreads.ts';

const TODAY = new Date('2026-07-26T00:00:00Z');

const opportunity = (patch = {}) => ({
  id: 'opp-1', accountName: 'Northstar Foods', opportunityName: 'QC analyser rollout',
  stage: 'Proposal', status: 'Active', productOrSolution: 'Analyser', ...patch,
});

const activity = (patch = {}) => ({
  id: `act-${Math.random()}`, accountName: 'Northstar Foods', linkedAccountName: '',
  linkedOpportunityId: '', summary: 'Call with lab manager', activityDate: '2026-07-20', ...patch,
});

const quote = (patch = {}) => ({
  id: 'q-1', quoteId: 'Q-118', accountName: 'Northstar Foods', opportunityId: 'opp-1',
  status: 'Sent', poStatus: 'Pending', deliveryStatus: 'Not scheduled', paymentStatus: 'Not due',
  validUntil: '2026-08-15', ...patch,
});

const commitment = (patch = {}) => ({
  id: `c-${Math.random()}`, threadId: '', accountId: '', accountName: 'Northstar Foods',
  opportunityId: 'opp-1', commitmentParty: 'customer', ownerLabel: 'Northstar Foods',
  commitmentText: 'Confirm quantity', originalDueDate: '2026-07-22', currentDueDate: '2026-07-22',
  silenceThresholdDays: 3, status: 'open', impactType: 'none', dueDateHistory: [],
  sourceType: 'manual', createdAt: '', updatedAt: '', ...patch,
});

const base = (patch = {}) => ({
  storedThreads: [], opportunities: [], activities: [], quotes: [], commitments: [], today: TODAY, ...patch,
});

describe('resolveCommercialThreads', () => {
  test('an empty workspace has no threads', () => {
    assert.deepEqual(resolveCommercialThreads(base()), []);
  });

  test('every opportunity becomes a thread without any migration', () => {
    const threads = resolveCommercialThreads(base({ opportunities: [opportunity()] }));
    assert.equal(threads.length, 1);
    assert.equal(threads[0].derived, true, 'nothing was written to storage to produce this');
    assert.equal(threads[0].title, 'QC analyser rollout');
    assert.equal(threads[0].opportunityId, 'opp-1');
  });

  test('an account with activity but no opportunity still gets a thread', () => {
    const threads = resolveCommercialThreads(base({
      activities: [activity({ accountName: 'Harbour Labs' })],
    }));
    assert.equal(threads.length, 1);
    assert.equal(threads[0].accountName, 'Harbour Labs');
    assert.equal(threads[0].opportunityId, null, 'a conversation that never became a deal is still a thread');
  });

  test('an account is not duplicated when it has both an opportunity and loose activity', () => {
    const threads = resolveCommercialThreads(base({
      opportunities: [opportunity()],
      activities: [activity(), activity({ activityDate: '2026-07-24' })],
    }));
    assert.equal(threads.length, 1, 'the account thread folds into the opportunity thread');
  });

  test('a stored thread wins over the derived one, but the activity clock still moves', () => {
    const stored = {
      id: 'thread-1', userId: null, accountId: '', accountName: 'Northstar Foods', opportunityId: 'opp-1',
      title: 'Renamed by the seller', objective: 'Displace incumbent', status: 'waiting',
      currentMoneyState: 'awaiting_customer_decision', currentWaitingParty: 'customer',
      lastActivityAt: '2026-07-01T00:00:00.000Z', archivedAt: null, sourceType: 'manual',
      createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z',
    };
    const threads = resolveCommercialThreads(base({
      storedThreads: [stored],
      opportunities: [opportunity()],
      activities: [activity({ activityDate: '2026-07-24' })],
    }));

    assert.equal(threads.length, 1);
    assert.equal(threads[0].derived, false);
    assert.equal(threads[0].title, 'Renamed by the seller', 'what a person set is not overwritten');
    assert.equal(threads[0].status, 'waiting');
    assert.ok(
      threads[0].lastActivityAt.startsWith('2026-07-24'),
      'the silence clock is measured, not decided, so it refreshes',
    );
  });

  test('money state reads the furthest-along quote, not the newest', () => {
    const threads = resolveCommercialThreads(base({
      opportunities: [opportunity()],
      quotes: [
        quote({ id: 'q-2', status: 'Draft' }),
        quote({ id: 'q-1', paymentStatus: 'Paid', deliveryStatus: 'Delivered', poStatus: 'Received', status: 'Accepted' }),
      ],
    }));
    assert.equal(threads[0].currentMoneyState, 'paid');
  });

  test('the waiting party is read off the open promises', () => {
    const customerOwes = resolveCommercialThreads(base({
      opportunities: [opportunity()],
      commitments: [commitment({ commitmentParty: 'customer' })],
    }));
    assert.equal(customerOwes[0].currentWaitingParty, 'customer');

    const iOwe = resolveCommercialThreads(base({
      opportunities: [opportunity()],
      commitments: [commitment({ commitmentParty: 'self' })],
    }));
    assert.equal(iOwe[0].currentWaitingParty, 'self');

    const settled = resolveCommercialThreads(base({
      opportunities: [opportunity()],
      commitments: [commitment({ status: 'completed' })],
    }));
    assert.equal(settled[0].currentWaitingParty, 'none', 'a kept promise is not something to wait on');
  });

  test('the next commitment is the soonest open one, and closed ones do not count', () => {
    const threads = resolveCommercialThreads(base({
      opportunities: [opportunity()],
      commitments: [
        commitment({ id: 'late', currentDueDate: '2026-08-10', commitmentText: 'Later' }),
        commitment({ id: 'soon', currentDueDate: '2026-07-28', commitmentText: 'Sooner' }),
        commitment({ id: 'done', currentDueDate: '2026-07-01', status: 'completed' }),
      ],
    }));
    assert.equal(threads[0].nextCommitment.commitmentText, 'Sooner');
    assert.equal(threads[0].openCommitmentCount, 2);
  });

  test('a commitment recorded against a customer reaches that customer\'s only thread', () => {
    // Without this, the thread reported "no next commitment" while the promise
    // sat in the ledger one panel away.
    const threads = resolveCommercialThreads(base({
      opportunities: [opportunity()],
      commitments: [commitment({ opportunityId: undefined, threadId: '', commitmentText: 'Confirm quantity' })],
    }));
    assert.equal(threads[0].nextCommitment?.commitmentText, 'Confirm quantity');
    assert.equal(threads[0].currentWaitingParty, 'customer');
  });

  test('but an account running two open deals is left alone rather than guessed at', () => {
    const threads = resolveCommercialThreads(base({
      opportunities: [opportunity(), opportunity({ id: 'opp-2', opportunityName: 'Second deal' })],
      commitments: [commitment({ opportunityId: undefined, threadId: '' })],
    }));
    assert.equal(threads.length, 2);
    for (const thread of threads) {
      assert.equal(thread.nextCommitment, null, 'an ambiguous commitment is not attached to either deal');
    }
  });

  test('a closed deal does not count as competition for an unattached commitment', () => {
    // Otherwise every customer who has ever won or lost something stops
    // receiving commitments on their live thread.
    const threads = resolveCommercialThreads(base({
      opportunities: [
        opportunity(),
        opportunity({ id: 'opp-won', opportunityName: 'Last year', status: 'Won' }),
      ],
      commitments: [commitment({ opportunityId: undefined, threadId: '', commitmentText: 'Confirm quantity' })],
    }));

    const live = threads.find((thread) => thread.status === 'active');
    assert.equal(live.nextCommitment?.commitmentText, 'Confirm quantity');
    const won = threads.find((thread) => thread.status === 'won');
    assert.equal(won.nextCommitment, null, 'a won thread never picks up a new promise');
  });

  test('days since activity is measured from the last thing that happened', () => {
    const threads = resolveCommercialThreads(base({
      opportunities: [opportunity()],
      activities: [activity({ activityDate: '2026-07-16' })],
    }));
    assert.equal(threads[0].daysSinceActivity, 10);
  });

  test('a won or lost opportunity closes its thread', () => {
    const won = resolveCommercialThreads(base({ opportunities: [opportunity({ status: 'Won' })] }));
    assert.equal(won[0].status, 'won');
    const lost = resolveCommercialThreads(base({ opportunities: [opportunity({ status: 'Lost' })] }));
    assert.equal(lost[0].status, 'lost');
  });

  test('a stored thread with no matching workspace record is never dropped', () => {
    const orphan = {
      id: 'thread-orphan', userId: null, accountId: '', accountName: 'Gone Ltd', opportunityId: 'archived-opp',
      title: 'Handwritten thread', objective: '', status: 'active', currentMoneyState: 'none',
      currentWaitingParty: 'none', lastActivityAt: '2026-06-01T00:00:00.000Z', archivedAt: null,
      sourceType: 'manual', createdAt: '', updatedAt: '',
    };
    const threads = resolveCommercialThreads(base({ storedThreads: [orphan] }));
    assert.equal(threads.length, 1);
    assert.equal(threads[0].title, 'Handwritten thread');
  });
});
