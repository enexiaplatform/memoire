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
export function buildBusinessCockpit(input: BusinessCockpitInput): BusinessCockpitAnswer[] {
  const today = sanitizeBusinessDate(input.today) || todayDateKey();
  const nudges = input.nudges || [];

  const moneyItem = input.commercialRiskItems[0];
  const hotDealNudge = nudges.find((nudge) => nudge.source === 'opportunity' || nudge.source === 'revenue');
  const lateFollowUps = input.opportunities.filter((opportunity) => (
    opportunity.status === 'Active' && isBusinessDateOverdue(opportunity.nextActionDate, today)
  ));
  const stalledInitiative = nudges.find((nudge) => nudge.source === 'initiative');

  return [
    {
      id: 'money',
      question: 'What moves money today?',
      answer: moneyItem
        ? `${moneyItem.risk}: ${moneyItem.accountName || 'Needs confirmation'}${typeof moneyItem.amount === 'number' && moneyItem.currency ? ` (${formatCompactCurrencyAmount(moneyItem.amount, moneyItem.currency)})` : ''}`
        : 'No money action is waiting on you.',
      href: '/app/revenue',
      urgent: Boolean(moneyItem),
    },
    {
      id: 'deals',
      question: 'Which deals are hot?',
      answer: hotDealNudge
        ? `${hotDealNudge.title}: ${[hotDealNudge.accountName, hotDealNudge.opportunityName].filter(Boolean).join(' / ')}`
        : 'No deal is flashing right now.',
      href: '/app/opportunities',
      urgent: Boolean(hotDealNudge && (hotDealNudge.urgency === 'critical' || hotDealNudge.urgency === 'high')),
    },
    {
      id: 'follow-ups',
      question: 'Which follow-ups are late?',
      answer: lateFollowUps.length > 0
        ? `${lateFollowUps.length} overdue: ${lateFollowUps.slice(0, 2).map((item) => item.accountName).filter(Boolean).join(', ')}${lateFollowUps.length > 2 ? '...' : ''}`
        : 'Nothing overdue. Keep it that way.',
      href: '/app/opportunities',
      urgent: lateFollowUps.length > 0,
    },
    {
      id: 'initiatives',
      question: 'Which initiative is stuck?',
      answer: stalledInitiative
        ? `${stalledInitiative.title}: ${stalledInitiative.opportunityName}`
        : 'No initiative looks stalled.',
      href: '/app/operating-system',
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
