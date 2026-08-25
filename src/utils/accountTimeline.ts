import type { CrmLiteOpportunity } from '../services/opportunityStore';
import type { OpportunityOutcomeRecord } from '../services/opportunityOutcomeStore';
import type { QuoteRecord } from '../services/quoteStore';
import type { SalesActivityRecord } from '../services/salesActivityStore';
import type { AccountMemory } from './accountMemory.ts';
import { compareBusinessDateDesc, isValidBusinessDate, sanitizeBusinessDate } from './safeDate.ts';

/**
 * One customer's whole story, in the order it happened.
 *
 * The account panel already held every piece of this - deals, touches, quotes,
 * outcomes - and showed them as counts and separate boxes: "12 contacts | 34
 * activities". A count is not a memory. Walking into a meeting, the question is
 * never "how many touches", it is "what happened here, and in what order".
 *
 * Nothing is derived that is not recorded. Every entry points at the record it
 * came from, so the history is a way into the data rather than a retelling of
 * it.
 */

export type AccountTimelineKind = 'activity' | 'opportunity' | 'quote' | 'outcome';

export type AccountTimelineEntry = {
  id: string;
  date: string;
  kind: AccountTimelineKind;
  /** What happened, in a few words. */
  title: string;
  /** The type of touch, the stage, the quote status - one short label. */
  label: string;
  /** The captured detail, never invented. Empty when the record carried none. */
  detail: string;
  /** What was promised next, if anything was. */
  nextAction: string;
  href: string;
};

export type AccountTimeline = {
  entries: AccountTimelineEntry[];
  /** Total before any cap, so the UI can say what it is not showing. */
  totalCount: number;
  firstDate: string;
  lastDate: string;
};

export function buildAccountTimeline(input: {
  memory: AccountMemory;
  quotes: QuoteRecord[];
  outcomes?: OpportunityOutcomeRecord[];
  /** How many entries to return. The rest stay counted but unrendered. */
  limit?: number;
}): AccountTimeline {
  const entries: AccountTimelineEntry[] = [
    ...activityEntries([...input.memory.linkedActivities, ...input.memory.matchingActivities]),
    ...opportunityEntries(input.memory.opportunities),
    ...quoteEntries(input.quotes),
    ...outcomeEntries(input.outcomes || [], input.memory.opportunities),
  ]
    .filter((entry) => isValidBusinessDate(entry.date))
    // Newest first: the last thing that happened is the thing being asked about.
    .sort((left, right) => compareBusinessDateDesc(left.date, right.date) || left.id.localeCompare(right.id));

  const dates = entries.map((entry) => entry.date);

  return {
    entries: typeof input.limit === 'number' ? entries.slice(0, input.limit) : entries,
    totalCount: entries.length,
    lastDate: dates[0] || '',
    firstDate: dates[dates.length - 1] || '',
  };
}

function activityEntries(activities: SalesActivityRecord[]): AccountTimelineEntry[] {
  return activities.map((activity) => ({
    id: `activity:${activity.id}`,
    date: sanitizeBusinessDate(activity.activityDate),
    kind: 'activity' as const,
    title: activity.activityType || 'Touch',
    label: activity.linkStatus === 'Linked' ? 'Linked' : 'Matched by name',
    detail: (activity.summary || '').trim(),
    nextAction: (activity.nextAction || '').trim(),
    href: `/app/timeline?view=history&activityId=${encodeURIComponent(activity.id)}`,
  }));
}

/**
 * A deal enters the story on the day it was created. Its later movement is not
 * invented here: an opportunity record keeps only its current stage, so
 * claiming to know when it moved would be a guess dressed as history.
 */
function opportunityEntries(opportunities: CrmLiteOpportunity[]): AccountTimelineEntry[] {
  return opportunities.map((opportunity) => ({
    id: `opportunity:${opportunity.id}`,
    date: sanitizeBusinessDate((opportunity.createdAt || '').slice(0, 10)),
    kind: 'opportunity' as const,
    title: opportunity.opportunityName || 'Opportunity',
    label: `${opportunity.stage} - ${opportunity.status}`,
    detail: (opportunity.productOrSolution || '').trim(),
    nextAction: (opportunity.nextAction || '').trim(),
    href: `/app/opportunities?opportunityId=${encodeURIComponent(opportunity.id)}`,
  }));
}

function quoteEntries(quotes: QuoteRecord[]): AccountTimelineEntry[] {
  return quotes.map((quote) => ({
    id: `quote:${quote.id}`,
    date: sanitizeBusinessDate(quote.quoteDate),
    kind: 'quote' as const,
    title: quote.title || quote.quoteId || 'Quote',
    label: quote.status,
    detail: [quote.poStatus, quote.deliveryStatus, quote.paymentStatus]
      .map((value) => (value || '').trim())
      .filter(Boolean)
      .join(' - '),
    nextAction: (quote.nextAction || '').trim(),
    href: `/app/quotes?quoteId=${encodeURIComponent(quote.id)}`,
  }));
}

/**
 * How a deal ended, and why. This is the entry the rest of the history exists
 * to explain, which is why the reason travels with it rather than living only
 * in a win/loss report nobody opens mid-conversation.
 */
function outcomeEntries(
  outcomes: OpportunityOutcomeRecord[],
  opportunities: CrmLiteOpportunity[],
): AccountTimelineEntry[] {
  const opportunityIds = new Set(opportunities.map((opportunity) => opportunity.id));
  return outcomes
    .filter((outcome) => opportunityIds.has(outcome.opportunityId))
    .map((outcome) => ({
      id: `outcome:${outcome.id}`,
      date: sanitizeBusinessDate(outcome.outcomeDate),
      kind: 'outcome' as const,
      title: `${outcome.opportunityName || 'Opportunity'} - ${outcome.outcome}`,
      label: outcome.reasonCategory,
      detail: (outcome.reasonText || '').trim(),
      nextAction: (outcome.lessonLearned || '').trim(),
      href: `/app/opportunities?opportunityId=${encodeURIComponent(outcome.opportunityId)}`,
    }));
}
