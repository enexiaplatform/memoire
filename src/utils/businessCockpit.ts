import type { NudgeRecord } from '../services/nudgeStore.ts';
import type { CrmLiteOpportunity } from '../services/opportunityStore.ts';
import type { QuoteRecord } from '../services/quoteStore.ts';
import type { RevenueActionItem } from './revenueView.ts';
import { convertMoney, formatCompactCurrencyAmount } from './money.ts';
import { resolveOpportunityByName, resolveQuoteOpportunityId } from './opportunityResolution.ts';
import { formatSafeBusinessDate, isBusinessDateOverdue, sanitizeBusinessDate, todayDateKey } from './safeDate.ts';
import { normalizeEntityName } from './accountIdentity.ts';

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

/** The only part of an activity the cockpit reads. */
type CockpitActivity = {
  accountName?: string;
  opportunityName?: string;
  linkedOpportunityId?: string;
  activityDate?: string;
  buyingSignals?: string[];
};

/** How far back a touch still counts as movement. */
const HOT_WINDOW_DAYS = 21;

type BusinessCockpitInput = {
  commercialRiskItems: RevenueActionItem[];
  /**
   * The touches, so "which deals are hot?" can be answered from movement
   * rather than from the alarm feed. Optional; without it the card says it has
   * nothing to add rather than borrowing an alarm.
   */
  activities?: CockpitActivity[];
  nudges: NudgeRecord[];
  opportunities: CrmLiteOpportunity[];
  /** Used only to resolve a quote-shaped answer back to its deal. */
  quotes?: QuoteRecord[];
  captureInboxCount: number;
  /**
   * Where the oldest unconfirmed capture actually is.
   *
   * The card used to send everybody to `/app/capture` - an empty note box -
   * however many items it had just said were waiting. It named a queue and
   * then opened a blank form, so the only way to reach the queue was to know,
   * without being told, that the linking UI lives in the Activity ledger's
   * detail. The inbox items have carried their own href the whole time.
   */
  captureInboxHref?: string;
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
 * one.
 *
 * The matching itself now lives in `opportunityResolution` and is shared with
 * the revenue view, which used to key on `quote.opportunityId` alone - so the
 * two surfaces disagreed about which deals had been quoted, and the strictly
 * less tolerant one was the one deciding what to warn about. What stays here is
 * only this file's job: turning a cockpit-shaped candidate into the account and
 * deal names the shared resolver takes.
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
  if (quote) return resolveQuoteOpportunityId(quote, opportunities);

  return resolveOpportunityByName(candidate.accountName, candidate.opportunityName, opportunities);
}

/** The record id inside a `/app/...?xId=` deep link, whatever the surface. */
function idFromHref(href: string | undefined, key: string): string | undefined {
  const match = (href || '').match(new RegExp(`[?&]${key}=([^&]+)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

/**
 * How close a stage is to a signature.
 *
 * "Where the money sits" is a question about position, and the stage is the
 * only ordering the pipeline actually carries.
 */
const CLOSING_STAGE_RANK: Record<string, number> = {
  Procurement: 6,
  Negotiation: 5,
  Proposal: 4,
  Demo: 3,
  'Technical discussion': 3,
  Qualification: 2,
  Lead: 1,
};

/** Money that is late is money that moves today, if you act on it. */
function isLateMoney(item: RevenueActionItem) {
  return /overdue|expired/i.test(item.risk || '');
}

function opportunityBaseAmount(opportunity: CrmLiteOpportunity) {
  const amount = opportunity.estimatedValue ?? opportunity.fy26Value ?? null;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || !opportunity.currency) return 0;
  return convertMoney(amount, opportunity.currency) ?? 0;
}

/**
 * The open deal closest to a signature, biggest first.
 *
 * The money card used to be the top row of the revenue *risk* feed, whatever
 * that row was. On a 3.6M EUR book whose loudest risk was a 48,500 EUR deal
 * marked "Rescue", the card headed "What moves money today?" answered
 * "Weak pipeline: Vila Gale Hoteis (48.5K EUR)" - the thirteenth largest thing
 * in the workspace, and an answer about risk under a question about money.
 */
function closestToSigning(opportunities: CrmLiteOpportunity[]) {
  return opportunities
    .filter((opportunity) => opportunity.status === 'Active')
    .map((opportunity) => ({
      opportunity,
      base: opportunityBaseAmount(opportunity),
      rank: CLOSING_STAGE_RANK[opportunity.stage] ?? 0,
    }))
    .filter((entry) => entry.base > 0 || entry.rank > 0)
    .sort((left, right) => right.rank - left.rank || right.base - left.base)[0];
}

/**
 * A deal that has actually moved lately, biggest first.
 *
 * "Which deals are hot?" was answered from the alarm feed, so on a quiet book
 * it replied "Deal going silent: Mai Nguyen / Landing page audit" - the
 * opposite of hot, about the smallest record in the workspace. Hot is a touch
 * or a buying signal inside the window, which is a thing the activity ledger
 * can actually answer.
 */
function hottestDeal(
  opportunities: CrmLiteOpportunity[],
  activities: CockpitActivity[],
  today: string,
  excludeOpportunityId?: string,
) {
  const windowStart = shiftDays(today, -HOT_WINDOW_DAYS);
  const recent = activities.filter((activity) => {
    const date = sanitizeBusinessDate(activity.activityDate);
    return Boolean(date) && date >= windowStart && date <= today;
  });
  if (!recent.length) return undefined;

  return opportunities
    .filter((opportunity) => opportunity.status === 'Active' && opportunity.id !== excludeOpportunityId)
    .map((opportunity) => {
      const accountKey = normalizeEntityName(opportunity.accountName || '');
      const opportunityKey = normalizeEntityName(opportunity.opportunityName || '');
      const touches = recent.filter((activity) => {
        if (activity.linkedOpportunityId && activity.linkedOpportunityId === opportunity.id) return true;
        if (!accountKey || !opportunityKey) return false;
        return normalizeEntityName(activity.accountName || '') === accountKey
          && normalizeEntityName(activity.opportunityName || '') === opportunityKey;
      });
      const signals = touches.flatMap((activity) => activity.buyingSignals || []);
      const lastTouch = touches
        .map((activity) => sanitizeBusinessDate(activity.activityDate))
        .filter(Boolean)
        .sort()
        .pop() || '';
      return { opportunity, touches: touches.length, signals, lastTouch, base: opportunityBaseAmount(opportunity) };
    })
    .filter((entry) => entry.touches > 0)
    // A recorded buying signal beats a bare touch; then the bigger deal.
    .sort((left, right) => (right.signals.length ? 1 : 0) - (left.signals.length ? 1 : 0) || right.base - left.base)[0];
}

function shiftDays(date: string, days: number) {
  const parsed = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed)) return date;
  return new Date(parsed + days * 86_400_000).toISOString().slice(0, 10);
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
  const moneyAccount = normalizeEntityName(moneyItem?.accountName || '');
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
      return Boolean(moneyAccount) && normalizeEntityName(nudge.accountName || '') === moneyAccount;
    })
    : undefined;

  // Most overdue first, so the one deal this card opens is the worst one.
  const lateFollowUps = opportunities
    .filter((opportunity) => (
      opportunity.status === 'Active' && isBusinessDateOverdue(opportunity.nextActionDate, today)
    ))
    .sort((left, right) => (left.nextActionDate || '').localeCompare(right.nextActionDate || ''));
  const stalledInitiative = nudges.find((nudge) => nudge.source === 'initiative');
  const lateMoney = moneyItem && isLateMoney(moneyItem) ? moneyItem : undefined;
  const nearestClose = lateMoney ? undefined : closestToSigning(opportunities);
  const hottest = hottestDeal(
    opportunities,
    input.activities || [],
    today,
    lateMoney ? moneyDealId : nearestClose?.opportunity.id,
  );

  // Every urgent answer routes to the exact record that raised it (the quote,
  // the deal, the initiative) - a page top is only the fallback for calm tiles.
  return [
    {
      id: 'money',
      subject: 'Money',
      question: 'What moves money today?',
      // Money that is already late leads, because acting on it today is what
      // makes it move. Everything else is a question about position, and the
      // answer is the biggest deal closest to a signature - not whichever row
      // the risk feed happened to put first.
      answer: lateMoney
        ? `${lateMoney.risk}: ${lateMoney.accountName || 'Needs confirmation'}${typeof lateMoney.amount === 'number' && lateMoney.currency ? ` (${formatCompactCurrencyAmount(lateMoney.amount, lateMoney.currency)})` : ''}`
        : nearestClose
          ? `${nearestClose.opportunity.accountName || 'Needs confirmation'} / ${nearestClose.opportunity.opportunityName || 'Needs confirmation'}${nearestClose.base > 0 ? ` (${formatCompactCurrencyAmount(nearestClose.opportunity.estimatedValue ?? 0, nearestClose.opportunity.currency)})` : ''}`
          : 'No money action is waiting on you.',
      detail: lateMoney
        ? lateMoney.reason
        : nearestClose
          ? `Furthest along at ${nearestClose.opportunity.stage}. ${nearestClose.opportunity.nextAction || 'No next step is recorded on it.'}`
          : undefined,
      href: lateMoney?.href
        || (nearestClose ? `/app/opportunities?opportunityId=${encodeURIComponent(nearestClose.opportunity.id)}` : '/app/revenue'),
      // A big deal sitting where it should be is not an alarm.
      urgent: Boolean(lateMoney),
      opportunityId: lateMoney ? moneyDealId : nearestClose?.opportunity.id,
      nudgeId: lateMoney ? moneyNudge?.id : undefined,
      accountName: lateMoney ? lateMoney.accountName : nearestClose?.opportunity.accountName,
      actionable: Boolean(lateMoney || nearestClose),
    },
    {
      id: 'deals',
      subject: 'Deals',
      question: 'Which deals are hot?',
      // Hot means it moved. Answering from the alarm feed made this card reply
      // "Deal going silent: ..." - the opposite of the question - about
      // whichever record happened to be shouting loudest.
      answer: hottest
        ? `${hottest.opportunity.accountName || 'Needs confirmation'} / ${hottest.opportunity.opportunityName || 'Needs confirmation'}`
        : `No deal has moved in the last ${HOT_WINDOW_DAYS} days.`,
      detail: hottest
        ? `${hottest.signals.length ? `${hottest.signals[0]}. ` : ''}Last touch ${formatSafeBusinessDate(hottest.lastTouch)}, ${hottest.touches} ${hottest.touches === 1 ? 'touch' : 'touches'} in ${HOT_WINDOW_DAYS} days.`
        : 'Capture a touch and the deal that is moving will show up here.',
      href: hottest
        ? `/app/opportunities?opportunityId=${encodeURIComponent(hottest.opportunity.id)}`
        : '/app/opportunities',
      // Movement is good news, never an alarm.
      urgent: false,
      opportunityId: hottest?.opportunity.id,
      accountName: hottest?.opportunity.accountName,
      actionable: Boolean(hottest),
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
      href: input.captureInboxCount > 0
        ? input.captureInboxHref || '/app/timeline?view=history'
        : '/app/capture?mode=quick',
      // Deliberately not urgent: unconfirmed captures are work waiting, not an
      // alarm, and colouring them amber next to an overdue payment would say
      // they were the same thing.
      urgent: false,
      actionable: input.captureInboxCount > 0,
    },
  ];
}
