import type { CrmLiteOpportunity } from '../../services/opportunityStore';
import type { QuoteRecord } from '../../services/quoteStore';
import type { SalesActivityRecord } from '../../services/salesActivityStore';
import {
  isThreadClosed,
  type CommercialCommitment,
  type CommercialThread,
  type MoneyState,
  type ThreadStatus,
  type WaitingParty,
} from './types.ts';

/**
 * A commercial thread as the product shows it: the stored row where one exists,
 * derived from the workspace where one does not.
 */
export type ResolvedThread = CommercialThread & {
  /** True when no row exists yet and this was computed from existing records. */
  derived: boolean;
  /** The most recent thing that happened, in the user's words. */
  lastEventSummary: string;
  /** The next open promise on this thread, soonest due first. */
  nextCommitment: CommercialCommitment | null;
  openCommitmentCount: number;
  /** Days since anything happened. Null when nothing has ever happened. */
  daysSinceActivity: number | null;
};

/**
 * Derives commercial threads from records the workspace already has.
 *
 * The alternative was a migration that wrote a thread row for every existing
 * opportunity. That would have been irreversible, would have doubled the number
 * of records a user could see, and would have been wrong the moment an
 * opportunity was renamed or merged. Deriving instead means a workspace that
 * has never written a thread row still sees its commercial threads, an explicit
 * thread always wins over the derived one, and nothing has to be backfilled.
 *
 * One opportunity is one thread. An account with commercial activity but no
 * opportunity gets one account-level thread, because "we have been talking to
 * this customer and nothing is going anywhere" is exactly the silence worth
 * seeing - and it is invisible if threads only exist where deals do.
 */
export function resolveCommercialThreads(input: {
  storedThreads: CommercialThread[];
  opportunities: CrmLiteOpportunity[];
  activities: SalesActivityRecord[];
  quotes: QuoteRecord[];
  commitments: CommercialCommitment[];
  /** Defaults to now; injectable so the derivation is testable. */
  today?: Date;
}): ResolvedThread[] {
  const today = input.today || new Date();
  const storedByOpportunity = new Map<string, CommercialThread>();
  const storedByAccountKey = new Map<string, CommercialThread>();

  for (const thread of input.storedThreads) {
    if (thread.opportunityId) storedByOpportunity.set(thread.opportunityId, thread);
    else if (thread.accountName) storedByAccountKey.set(normalizeAccount(thread.accountName), thread);
  }

  const resolved: ResolvedThread[] = [];
  const accountsWithOpportunity = new Set<string>();

  // A commitment recorded against a customer, without naming a deal, still has
  // to reach that customer's thread - otherwise the thread reports "no next
  // commitment" while the promise sits in the ledger one panel away. It can
  // only be attached when there is no ambiguity about which thread it belongs
  // to, so accounts running more than one deal are left alone rather than
  // guessed at.
  // Only *open* deals compete for an unattached commitment. A won or lost deal
  // cannot receive a new promise, so counting it as ambiguity would strand
  // every commitment for a customer who has ever closed anything - which is
  // most customers worth having.
  const openDealCountByAccount = new Map<string, number>();
  for (const opportunity of input.opportunities) {
    if (threadStatusForOpportunity(opportunity.status) !== 'active') continue;
    const key = normalizeAccount(opportunity.accountName);
    openDealCountByAccount.set(key, (openDealCountByAccount.get(key) || 0) + 1);
  }

  for (const opportunity of input.opportunities) {
    const accountKey = normalizeAccount(opportunity.accountName);
    accountsWithOpportunity.add(accountKey);
    const stored = storedByOpportunity.get(opportunity.id);
    const activities = activitiesForOpportunity(input.activities, opportunity);
    const quotes = input.quotes.filter((quote) => quote.opportunityId === opportunity.id);
    const soleDealForAccount = threadStatusForOpportunity(opportunity.status) === 'active'
      && openDealCountByAccount.get(accountKey) === 1;
    const commitments = input.commitments.filter(
      (commitment) => commitment.opportunityId === opportunity.id
        || (stored && commitment.threadId === stored.id)
        || (soleDealForAccount
          && !commitment.opportunityId
          && !commitment.threadId
          && normalizeAccount(commitment.accountName) === accountKey),
    );

    resolved.push(buildResolved({
      stored,
      fallbackId: `derived-opportunity-${opportunity.id}`,
      accountId: '',
      accountName: opportunity.accountName,
      opportunityId: opportunity.id,
      title: opportunity.opportunityName || opportunity.accountName,
      objective: opportunity.productOrSolution || '',
      status: threadStatusForOpportunity(opportunity.status),
      moneyState: moneyStateFromQuotes(quotes),
      activities,
      commitments,
      today,
    }));
  }

  // Accounts with activity but no opportunity: the conversations that never
  // became deals, which is where silence hides most often.
  const accountActivity = new Map<string, SalesActivityRecord[]>();
  for (const activity of input.activities) {
    const name = activity.linkedAccountName || activity.accountName;
    if (!name?.trim()) continue;
    const key = normalizeAccount(name);
    if (accountsWithOpportunity.has(key)) continue;
    accountActivity.set(key, [...(accountActivity.get(key) || []), activity]);
  }

  for (const [key, activities] of accountActivity) {
    const stored = storedByAccountKey.get(key);
    const accountName = activities[0].linkedAccountName || activities[0].accountName;
    const commitments = input.commitments.filter(
      (commitment) => normalizeAccount(commitment.accountName) === key && !commitment.opportunityId,
    );

    resolved.push(buildResolved({
      stored,
      fallbackId: `derived-account-${key}`,
      accountId: '',
      accountName,
      opportunityId: null,
      title: accountName,
      objective: '',
      status: 'active',
      moneyState: 'none',
      activities,
      commitments,
      today,
    }));
  }

  // Stored threads that match nothing in the workspace still belong to the
  // user - a thread written by hand, or one whose opportunity was archived.
  const seen = new Set(resolved.map((thread) => thread.id));
  for (const thread of input.storedThreads) {
    if (seen.has(thread.id)) continue;
    const commitments = input.commitments.filter((commitment) => commitment.threadId === thread.id);
    resolved.push(decorate(thread, false, [], commitments, today));
  }

  return resolved.sort((left, right) => right.lastActivityAt.localeCompare(left.lastActivityAt));
}

function buildResolved(input: {
  stored?: CommercialThread;
  fallbackId: string;
  accountId: string;
  accountName: string;
  opportunityId: string | null;
  title: string;
  objective: string;
  status: ThreadStatus;
  moneyState: MoneyState;
  activities: SalesActivityRecord[];
  commitments: CommercialCommitment[];
  today: Date;
}): ResolvedThread {
  const lastActivityAt = latestActivityTimestamp(input.activities)
    || input.stored?.lastActivityAt
    || input.stored?.createdAt
    || '';

  if (input.stored) {
    // An explicit thread always wins on the fields a person set. Only the
    // activity clock is refreshed, because that is measured, not decided.
    return decorate(
      {
        ...input.stored,
        lastActivityAt: lastActivityAt > input.stored.lastActivityAt ? lastActivityAt : input.stored.lastActivityAt,
      },
      false,
      input.activities,
      input.commitments,
      input.today,
    );
  }

  const timestamp = lastActivityAt || new Date(input.today).toISOString();
  const derived: CommercialThread = {
    id: input.fallbackId,
    userId: null,
    accountId: input.accountId,
    accountName: input.accountName,
    opportunityId: input.opportunityId,
    title: input.title,
    objective: input.objective,
    status: input.status,
    currentMoneyState: input.moneyState,
    currentWaitingParty: waitingPartyFromCommitments(input.commitments),
    lastActivityAt: timestamp,
    archivedAt: null,
    sourceType: 'system_rule',
    sourceId: input.opportunityId,
    sourceUrl: null,
    sourceUpdatedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  return decorate(derived, true, input.activities, input.commitments, input.today);
}

function decorate(
  thread: CommercialThread,
  derived: boolean,
  activities: SalesActivityRecord[],
  commitments: CommercialCommitment[],
  today: Date,
): ResolvedThread {
  const open = commitments
    .filter((commitment) => commitment.status === 'open')
    .sort((left, right) => (left.currentDueDate || '9999-12-31').localeCompare(right.currentDueDate || '9999-12-31'));

  const latest = [...activities].sort((left, right) =>
    (right.activityDate || '').localeCompare(left.activityDate || ''))[0];

  return {
    ...thread,
    derived,
    lastEventSummary: latest?.summary || '',
    nextCommitment: open[0] || null,
    openCommitmentCount: open.length,
    daysSinceActivity: daysSince(thread.lastActivityAt, today),
    currentWaitingParty: thread.currentWaitingParty === 'none'
      ? waitingPartyFromCommitments(commitments)
      : thread.currentWaitingParty,
  };
}

/**
 * Who the thread is waiting on, read off the open promises: if the customer
 * owes something, we are waiting on them; otherwise the ball is with whoever
 * else holds an open commitment.
 */
function waitingPartyFromCommitments(commitments: CommercialCommitment[]): WaitingParty {
  const open = commitments.filter((commitment) => commitment.status === 'open');
  if (open.some((commitment) => commitment.commitmentParty === 'customer')) return 'customer';
  if (open.some((commitment) => commitment.commitmentParty === 'internal')) return 'internal';
  if (open.some((commitment) => commitment.commitmentParty === 'self')) return 'self';
  return 'none';
}

function threadStatusForOpportunity(status: string): ThreadStatus {
  const value = status.trim().toLowerCase();
  if (value === 'won') return 'won';
  if (value === 'lost') return 'lost';
  if (value === 'archived') return 'archived';
  return 'active';
}

function moneyStateFromQuotes(quotes: QuoteRecord[]): MoneyState {
  if (quotes.length === 0) return 'none';
  // The furthest-along quote sets the thread's money position: a customer with
  // one paid quote and one draft is not "awaiting payment" overall.
  const ranked: MoneyState[] = quotes.map((quote) => {
    if (quote.paymentStatus === 'Paid') return 'paid';
    if (quote.deliveryStatus === 'Delivered') return 'awaiting_payment';
    if (quote.poStatus === 'Received') return 'awaiting_delivery';
    if (quote.status === 'Accepted') return 'awaiting_po';
    if (quote.status === 'Sent' || quote.status === 'Revised') return 'awaiting_customer_decision';
    return 'quoted';
  });

  const order: MoneyState[] = [
    'none',
    'quoted',
    'awaiting_customer_decision',
    'awaiting_po',
    'awaiting_delivery',
    'awaiting_payment',
    'paid',
  ];
  return ranked.reduce((furthest, state) =>
    (order.indexOf(state) > order.indexOf(furthest) ? state : furthest), 'quoted' as MoneyState);
}

function activitiesForOpportunity(activities: SalesActivityRecord[], opportunity: CrmLiteOpportunity) {
  const accountKey = normalizeAccount(opportunity.accountName);
  return activities.filter((activity) => {
    if (activity.linkedOpportunityId) return activity.linkedOpportunityId === opportunity.id;
    return normalizeAccount(activity.linkedAccountName || activity.accountName) === accountKey;
  });
}

/**
 * An activity date is a calendar day the user chose, not an instant. Parsing it
 * as local time and re-serialising to ISO shifts it backwards a day for anyone
 * east of UTC - which would have made a thread look a day staler than it is,
 * and in a timezone like UTC+7 could push a same-day touch into "yesterday".
 * Reading it as UTC keeps the day the user recorded.
 */
function latestActivityTimestamp(activities: SalesActivityRecord[]) {
  const latest = activities
    .map((activity) => activity.activityDate)
    .filter(Boolean)
    .sort()
    .pop();
  return latest ? `${latest}T00:00:00.000Z` : '';
}

function daysSince(timestamp: string, today: Date): number | null {
  if (!timestamp) return null;
  const then = new Date(timestamp).getTime();
  if (Number.isNaN(then)) return null;
  return Math.max(0, Math.floor((today.getTime() - then) / 86_400_000));
}

function normalizeAccount(name: string) {
  return name.trim().toLowerCase();
}

export { isThreadClosed };
