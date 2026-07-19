import type { NudgeRecord } from '../services/nudgeStore.ts';
import type { CrmLiteOpportunity } from '../services/opportunityStore.ts';
import type { RevenueActionItem } from './revenueView.ts';
import { formatCompactCurrencyAmount } from './money.ts';
import { isBusinessDateOverdue, sanitizeBusinessDate, todayDateKey } from './safeDate.ts';

export type BusinessCockpitAnswer = {
  id: 'money' | 'deals' | 'follow-ups' | 'initiatives' | 'capture';
  question: string;
  answer: string;
  href: string;
  urgent: boolean;
};

type BusinessCockpitInput = {
  commercialRiskItems: RevenueActionItem[];
  nudges: NudgeRecord[];
  opportunities: CrmLiteOpportunity[];
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

export function buildBusinessCockpit(input: BusinessCockpitInput): BusinessCockpitAnswer[] {
  const today = sanitizeBusinessDate(input.today) || todayDateKey();
  const nudges = input.nudges || [];

  const moneyItem = input.commercialRiskItems[0];
  const hotDealNudge = nudges.find((nudge) => nudge.source === 'opportunity' || nudge.source === 'revenue');
  const lateFollowUps = input.opportunities.filter((opportunity) => (
    opportunity.status === 'Active' && isBusinessDateOverdue(opportunity.nextActionDate, today)
  ));
  const stalledInitiative = nudges.find((nudge) => nudge.source === 'initiative');

  // Every urgent answer routes to the exact record that raised it (the quote,
  // the deal, the initiative) - a page top is only the fallback for calm tiles.
  return [
    {
      id: 'money',
      question: 'What moves money today?',
      answer: moneyItem
        ? `${moneyItem.risk}: ${moneyItem.accountName || 'Needs confirmation'}${typeof moneyItem.amount === 'number' && moneyItem.currency ? ` (${formatCompactCurrencyAmount(moneyItem.amount, moneyItem.currency)})` : ''}`
        : 'No money action is waiting on you.',
      href: moneyItem?.href || '/app/revenue',
      urgent: Boolean(moneyItem),
    },
    {
      id: 'deals',
      question: 'Which deals are hot?',
      answer: hotDealNudge
        ? `${hotDealNudge.title}: ${[hotDealNudge.accountName, hotDealNudge.opportunityName].filter(Boolean).join(' / ')}`
        : 'No deal is flashing right now.',
      href: nudgeEntityHref(hotDealNudge) || '/app/opportunities',
      urgent: Boolean(hotDealNudge && (hotDealNudge.urgency === 'critical' || hotDealNudge.urgency === 'high')),
    },
    {
      id: 'follow-ups',
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
    },
    {
      id: 'initiatives',
      question: 'Which initiative is stuck?',
      answer: stalledInitiative
        ? `${stalledInitiative.title}: ${stalledInitiative.opportunityName}`
        : 'No initiative looks stalled.',
      href: stalledInitiative?.entityId
        ? `/app/operating-system?contextId=${encodeURIComponent(stalledInitiative.entityId)}`
        : '/app/operating-system',
      urgent: Boolean(stalledInitiative),
    },
    {
      id: 'capture',
      question: 'What needs capturing?',
      answer: input.captureInboxCount > 0
        ? `${input.captureInboxCount} captured ${input.captureInboxCount === 1 ? 'item needs' : 'items need'} confirmation.`
        : 'Inbox clear. Capture the next touch right after it happens.',
      href: input.captureInboxCount > 0 ? '/app/capture' : '/app/capture?mode=quick',
      urgent: false,
    },
  ];
}
