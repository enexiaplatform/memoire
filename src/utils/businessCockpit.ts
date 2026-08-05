import type { NudgeRecord } from '../services/nudgeStore.ts';
import type { CrmLiteOpportunity } from '../services/opportunityStore.ts';
import type { QuoteRecord } from '../services/quoteStore.ts';
import type { RevenueActionItem } from './revenueView.ts';
import { formatCompactCurrencyAmount } from './money.ts';
import { isBusinessDateOverdue, sanitizeBusinessDate, todayDateKey } from './safeDate.ts';

export type BusinessCockpitAnswer = {
  id: 'money' | 'deals' | 'follow-ups' | 'initiatives' | 'capture';
  question: string;
  /**
   * The thing the question is about, in one or two words. The strip lists the
   * subjects of the answers it folds away, and a question cannot be reused for
   * that: stripping "Which ... ?" off "Which follow-ups are late?" yields
   * "follow-ups are late", which under a "Clear:" heading says the opposite of
   * what is true.
   */
  subject: string;
  answer: string;
  /**
   * Why this is flagged, in the operator's own field names, when the answer can
   * say. A card that names a customer and a risk but not the condition behind
   * it is a card you cannot act on: the first operator edited three fields on a
   * flagged deal and the flag stayed, because none of them was the one holding
   * it up.
   */
  detail?: string;
  href: string;
  urgent: boolean;
  /**
   * The deal this answer is about, when it is about one.
   *
   * Without it the strip had to read its own `href` back and guess, which meant
   * only one URL shape in five ever opened the quick look - and the other four
   * threw the operator off Today to answer a question Today had just asked.
   * A quote-shaped answer resolves to the deal behind the quote, so "what moves
   * money today" opens the deal rather than a document.
   */
  opportunityId?: string;
  /**
   * The nudge this answer was built from, when it was built from one. The
   * morning brief below the strip reads it so the two never open the day by
   * saying the same sentence twice.
   */
  nudgeId?: string;
  /**
   * The customer this answer is about. The brief skips any nudge naming a
   * customer already on a card - a second alarm about the same account is still
   * the same account read twice at the top of the day.
   */
  accountName?: string;
  /**
   * True when there is something here to act on. Not the same as `urgent`: a
   * capture inbox with eight waiting items is work, but it is not an alarm.
   * The strip draws these as cards and folds the rest into one quiet line.
   */
  actionable: boolean;
};

type BusinessCockpitInput = {
  commercialRiskItems: RevenueActionItem[];
  nudges: NudgeRecord[];
  opportunities: CrmLiteOpportunity[];
  /** Used only to resolve a quote-shaped answer back to its deal. */
  quotes?: QuoteRecord[];
  captureInboxCount: number;
  today?: string;
};

/**
 * The Today page's operating logic as five fixed questions (pivot Phase 2).
 * Every answer is a glance plus a deep link - the cockpit never invents work,
 * it routes to surfaces that already own the follow-through.
 */
/**
 * A nudge's entity as a deep link to its handling spot. Revenue nudges store a
 * prefixed entityId (`quote-x` / `opportunity-x`, see buildRevenueNudges);
 * opportunity/initiative nudges store the raw record id - normalize both.
 */
export function nudgeEntityHref(nudge: NudgeRecord | undefined): string {
  if (!nudge?.entityId) return '';
  if (nudge.entityType === 'opportunity') {
    return `/app/opportunities?opportunityId=${encodeURIComponent(nudge.entityId.replace(/^opportunity-/, ''))}`;
  }
  if (nudge.entityType === 'quote') {
    return `/app/quotes?quoteId=${encodeURIComponent(nudge.entityId.replace(/^quote-/, ''))}`;
  }
  if (nudge.entityType === 'initiative') {
    return `/app/operating-system?contextId=${encodeURIComponent(nudge.entityId)}`;
  }
  return '';
}

/**
 * The deal an answer is really about.
 *
 * A cockpit answer can arrive as an opportunity, as a quote, or as a nudge that
 * names either. All three are the operator's *deal*, so all three resolve to
 * one: a quote carries `opportunityId` when it was linked, and falls back to
 * matching the deal by the account and opportunity name it was written with -
 * the same name-first join the rest of the workspace uses, because
 * `opportunityId` is not always written.
 */
function resolveOpportunityId(
  candidate: { opportunityId?: string; quoteId?: string; accountName?: string; opportunityName?: string } | undefined,
  opportunities: CrmLiteOpportunity[],
  quotes: QuoteRecord[],
): string | undefined {
  if (!candidate) return undefined;
  if (candidate.opportunityId && opportunities.some((item) => item.id === candidate.opportunityId)) {
    return candidate.opportunityId;
  }
  const quote = candidate.quoteId
    ? quotes.find((item) => item.id === candidate.quoteId || item.quoteId === candidate.quoteId)
    : undefined;
  const linked = quote?.opportunityId;
  if (linked && opportunities.some((item) => item.id === linked)) return linked;

  const account = (quote?.accountName || candidate.accountName || '').trim().toLowerCase();
  const deal = (quote?.opportunityName || candidate.opportunityName || '').trim().toLowerCase();
  if (!account) return undefined;
  const matches = opportunities.filter((item) => (item.accountName || '').trim().toLowerCase() === account);
  if (matches.length === 0) return undefined;
  if (deal) {
    const exact = matches.find((item) => (item.opportunityName || '').trim().toLowerCase() === deal);
    if (exact) return exact.id;
  }
  // One deal with that customer is not a guess. Several is, so the answer keeps
  // its link rather than opening an arbitrary one of them.
  return matches.length === 1 ? matches[0].id : undefined;
}

/** The record id inside a `/app/...?xId=` deep link, whatever the surface. */
function idFromHref(href: string | undefined, key: string): string | undefined {
  const match = (href || '').match(new RegExp(`[?&]${key}=([^&]+)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

export function buildBusinessCockpit(input: BusinessCockpitInput): BusinessCockpitAnswer[] {
  const today = sanitizeBusinessDate(input.today) || todayDateKey();
  const nudges = input.nudges || [];
  const opportunities = input.opportunities || [];
  const quotes = input.quotes || [];

  const moneyItem = input.commercialRiskItems[0];
  const moneyDealId = resolveOpportunityId({
    opportunityId: idFromHref(moneyItem?.href, 'opportunityId'),
    quoteId: idFromHref(moneyItem?.href, 'quoteId'),
    accountName: moneyItem?.accountName,
  }, opportunities, quotes);

  // "What moves money today" and "which deals are hot" were allowed to pick the
  // same record, and on a workspace whose loudest alarm is also its hottest deal
  // they always did - two cards, one sentence, said twice. The second question
  // now answers about the next distinct thread, or admits it has nothing to add.
  const moneyKey = moneyDealId || idFromHref(moneyItem?.href, 'quoteId') || moneyItem?.id;

  // The money card is built from a risk item rather than a nudge, but the same
  // trouble usually raised a nudge too - and the morning brief underneath opens
  // with whichever nudge is top. Finding that twin is what stops the brief
  // repeating this card's sentence one line below it.
  const moneyAccount = (moneyItem?.accountName || '').trim().toLowerCase();
  const moneyNudge = moneyItem
    ? nudges.find((nudge) => {
      const nudgeId = (nudge.entityId || '').replace(/^(opportunity|quote)-/, '');
      if (moneyKey && nudgeId === moneyKey) return true;
      if (moneyDealId) {
        const nudgeDealId = resolveOpportunityId({
          opportunityId: nudge.entityType === 'opportunity' ? nudgeId : undefined,
          quoteId: nudge.entityType === 'quote' ? nudgeId : undefined,
          accountName: nudge.accountName,
          opportunityName: nudge.opportunityName,
        }, opportunities, quotes);
        if (nudgeDealId && nudgeDealId === moneyDealId) return true;
      }
      return Boolean(moneyAccount) && (nudge.accountName || '').trim().toLowerCase() === moneyAccount;
    })
    : undefined;
  const hotDealNudge = nudges.find((nudge) => {
    if (nudge.source !== 'opportunity' && nudge.source !== 'revenue') return false;
    // The nudge the money card is already standing on, even where it was matched
    // only by customer - two cards about one customer is the repetition this
    // whole block exists to stop.
    if (moneyNudge && nudge.id === moneyNudge.id) return false;
    if (!moneyKey) return true;
    const nudgeId = (nudge.entityId || '').replace(/^(opportunity|quote)-/, '');
    const nudgeDealId = resolveOpportunityId({
      opportunityId: nudge.entityType === 'opportunity' ? nudgeId : undefined,
      quoteId: nudge.entityType === 'quote' ? nudgeId : undefined,
      accountName: nudge.accountName,
      opportunityName: nudge.opportunityName,
    }, opportunities, quotes);
    return nudgeId !== moneyKey && (!nudgeDealId || nudgeDealId !== moneyDealId);
  });
  const hotDealId = resolveOpportunityId({
    opportunityId: hotDealNudge?.entityType === 'opportunity' ? (hotDealNudge.entityId || '').replace(/^opportunity-/, '') : undefined,
    quoteId: hotDealNudge?.entityType === 'quote' ? (hotDealNudge.entityId || '').replace(/^quote-/, '') : undefined,
    accountName: hotDealNudge?.accountName,
    opportunityName: hotDealNudge?.opportunityName,
  }, opportunities, quotes);

  // Most overdue first, so the one deal this card opens is the worst one.
  const lateFollowUps = opportunities
    .filter((opportunity) => (
      opportunity.status === 'Active' && isBusinessDateOverdue(opportunity.nextActionDate, today)
    ))
    .sort((left, right) => (left.nextActionDate || '').localeCompare(right.nextActionDate || ''));
  const stalledInitiative = nudges.find((nudge) => nudge.source === 'initiative');

  // Every urgent answer routes to the exact record that raised it (the quote,
  // the deal, the initiative) - a page top is only the fallback for calm tiles.
  return [
    {
      id: 'money',
      subject: 'Money',
      question: 'What moves money today?',
      answer: moneyItem
        ? `${moneyItem.risk}: ${moneyItem.accountName || 'Needs confirmation'}${typeof moneyItem.amount === 'number' && moneyItem.currency ? ` (${formatCompactCurrencyAmount(moneyItem.amount, moneyItem.currency)})` : ''}`
        : 'No money action is waiting on you.',
      detail: moneyItem?.reason,
      href: moneyItem?.href || '/app/revenue',
      urgent: Boolean(moneyItem),
      opportunityId: moneyDealId,
      nudgeId: moneyNudge?.id,
      accountName: moneyItem?.accountName,
      actionable: Boolean(moneyItem),
    },
    {
      id: 'deals',
      subject: 'Deals',
      question: 'Which deals are hot?',
      answer: hotDealNudge
        ? `${hotDealNudge.title}: ${[hotDealNudge.accountName, hotDealNudge.opportunityName].filter(Boolean).join(' / ')}`
        : 'No deal is flashing right now.',
      href: nudgeEntityHref(hotDealNudge) || '/app/opportunities',
      urgent: Boolean(hotDealNudge && (hotDealNudge.urgency === 'critical' || hotDealNudge.urgency === 'high')),
      opportunityId: hotDealId,
      nudgeId: hotDealNudge?.id,
      accountName: hotDealNudge?.accountName,
      actionable: Boolean(hotDealNudge),
    },
    {
      id: 'follow-ups',
      subject: 'Follow-ups',
      question: 'Which follow-ups are late?',
      answer: lateFollowUps.length > 0
        ? `${lateFollowUps.length} overdue: ${lateFollowUps.slice(0, 2).map((item) => item.accountName).filter(Boolean).join(', ')}${lateFollowUps.length > 2 ? '...' : ''}`
        : 'Nothing overdue. Keep it that way.',
      href: lateFollowUps.length === 1
        ? `/app/opportunities?opportunityId=${encodeURIComponent(lateFollowUps[0].id)}`
        : lateFollowUps.length > 1
          ? '/app/opportunities?filter=needsAction'
          : '/app/opportunities',
      urgent: lateFollowUps.length > 0,
      // Opens the worst one. The card still says how many there are, and the
      // drawer's "Open full record" is one tap from the filtered list - which is
      // a better place to land than a list you have to re-sort yourself.
      opportunityId: lateFollowUps[0]?.id,
      accountName: lateFollowUps[0]?.accountName,
      actionable: lateFollowUps.length > 0,
    },
    {
      id: 'initiatives',
      subject: 'Initiatives',
      question: 'Which initiative is stuck?',
      answer: stalledInitiative
        ? `${stalledInitiative.title}: ${stalledInitiative.opportunityName}`
        : 'No initiative looks stalled.',
      href: stalledInitiative?.entityId
        ? `/app/operating-system?contextId=${encodeURIComponent(stalledInitiative.entityId)}`
        : '/app/operating-system',
      urgent: Boolean(stalledInitiative),
      nudgeId: stalledInitiative?.id,
      actionable: Boolean(stalledInitiative),
    },
    {
      id: 'capture',
      subject: 'Capture inbox',
      question: 'What needs capturing?',
      answer: input.captureInboxCount > 0
        ? `${input.captureInboxCount} captured ${input.captureInboxCount === 1 ? 'item needs' : 'items need'} confirmation.`
        : 'Inbox clear. Capture the next touch right after it happens.',
      href: input.captureInboxCount > 0 ? '/app/capture' : '/app/capture?mode=quick',
      // Deliberately not urgent: unconfirmed captures are work waiting, not an
      // alarm, and colouring them amber next to an overdue payment would say
      // they were the same thing.
      urgent: false,
      actionable: input.captureInboxCount > 0,
    },
  ];
}
