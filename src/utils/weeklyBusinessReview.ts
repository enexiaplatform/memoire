import type { OperatingContextRecord } from '../services/operatingContextStore.ts';
import type { OpportunityOutcomeRecord } from '../services/opportunityOutcomeStore.ts';
import type { CrmLiteOpportunity } from '../services/opportunityStore.ts';
import type { QuoteRecord } from '../services/quoteStore.ts';
import type { SalesActivityRecord } from '../services/salesActivityStore.ts';
import { buildMoneyFlow, type MoneyFlow } from './moneyFlow.ts';
import { classifyInitiativeHealth, type InitiativeHealth } from './proactiveNudges.ts';
import { formatBaseCurrencyAmount, sumMoneyInBase } from './money.ts';
import { formatSafeBusinessDate, isBusinessDateInRange, isBusinessDateOverdue, sanitizeBusinessDate, todayDateKey } from './safeDate.ts';

export type StalledInitiativeItem = {
  id: string;
  title: string;
  contextType: OperatingContextRecord['contextType'];
  health: InitiativeHealth;
  reason: string;
  nextAction: string;
};

export type NextWeekPriority = {
  id: string;
  label: string;
  detail: string;
  href: string;
};

export type WeeklyBusinessReview = {
  moneyFlow: MoneyFlow;
  wins: OpportunityOutcomeRecord[];
  losses: OpportunityOutcomeRecord[];
  otherOutcomes: OpportunityOutcomeRecord[];
  wonValueLabel: string;
  stalledInitiatives: StalledInitiativeItem[];
  nextWeekPriorities: NextWeekPriority[];
};

type WeeklyBusinessReviewInput = {
  opportunities: CrmLiteOpportunity[];
  quotes: QuoteRecord[];
  operatingContexts: OperatingContextRecord[];
  activities: SalesActivityRecord[];
  opportunityOutcomes: OpportunityOutcomeRecord[];
  period: { start: string; end: string };
  today?: string;
};

/**
 * Phase 2 of the Business Activity OS pivot: the weekly review answers the
 * whole business, not just the pipeline - where the money sits, what closed,
 * which initiative stalled, and what next week's priorities are. The
 * Pipeline Defense Brief stays the manager-facing artifact; this is the
 * operator-facing wrapper around it.
 */
export function buildWeeklyBusinessReview(input: WeeklyBusinessReviewInput): WeeklyBusinessReview {
  const today = sanitizeBusinessDate(input.today) || todayDateKey();
  const moneyFlow = buildMoneyFlow({ opportunities: input.opportunities, quotes: input.quotes, today });

  const periodOutcomes = input.opportunityOutcomes.filter((outcome) => (
    isBusinessDateInRange(outcome.outcomeDate, input.period.start, input.period.end)
  ));
  const wins = periodOutcomes.filter((outcome) => outcome.outcome === 'Won');
  const losses = periodOutcomes.filter((outcome) => outcome.outcome === 'Lost');
  const otherOutcomes = periodOutcomes.filter((outcome) => outcome.outcome !== 'Won' && outcome.outcome !== 'Lost');

  const stalledInitiatives = input.operatingContexts
    .map((context) => ({ context, health: classifyInitiativeHealth(context, input.activities, today) }))
    .filter(({ health }) => health.status === 'quiet' || health.status === 'overdue-step')
    .map(({ context, health }) => ({
      id: context.id,
      title: context.title,
      contextType: context.contextType,
      health,
      reason: health.status === 'overdue-step'
        ? `Next step dated ${formatSafeBusinessDate(context.nextDate)} has passed.`
        : health.lastMention
          ? `No captured activity since ${formatSafeBusinessDate(health.lastMention)}.`
          : 'No captured activity since it was created.',
      nextAction: context.nextAction || 'Capture an update, book the next step, or close it.',
    }));

  return {
    moneyFlow,
    wins,
    losses,
    otherOutcomes,
    wonValueLabel: formatBaseCurrencyAmount(
      sumMoneyInBase(wins.map((outcome) => ({ amount: outcome.finalAmount || 0, currency: outcome.currency }))),
      true,
    ),
    stalledInitiatives,
    nextWeekPriorities: buildNextWeekPriorities(input, moneyFlow, stalledInitiatives, today),
  };
}

function buildNextWeekPriorities(
  input: WeeklyBusinessReviewInput,
  moneyFlow: MoneyFlow,
  stalledInitiatives: StalledInitiativeItem[],
  today: string,
): NextWeekPriority[] {
  const priorities: NextWeekPriority[] = [];

  const topStuckMoney = moneyFlow.stuckThreads[0];
  if (topStuckMoney) {
    priorities.push({
      id: `money-${topStuckMoney.id}`,
      label: `Unstick the money: ${topStuckMoney.accountName} / ${topStuckMoney.label}`,
      detail: `${topStuckMoney.stuckReason}. ${topStuckMoney.nextAction}`,
      href: '/app/revenue',
    });
  }

  const overdue = input.opportunities.filter((opportunity) => (
    opportunity.status === 'Active' && isBusinessDateOverdue(opportunity.nextActionDate, today)
  ));
  overdue.slice(0, 2).forEach((opportunity) => {
    priorities.push({
      id: `overdue-${opportunity.id}`,
      label: `Carry-over follow-up: ${opportunity.accountName} / ${opportunity.opportunityName}`,
      detail: opportunity.nextAction || 'Next action date has passed - do it or reschedule it.',
      href: '/app/opportunities',
    });
  });

  const dueNextWeek = input.opportunities.filter((opportunity) => (
    opportunity.status === 'Active'
      && Boolean(sanitizeBusinessDate(opportunity.nextActionDate))
      && isBusinessDateInRange(opportunity.nextActionDate, addDays(today, 1), addDays(today, 7))
  ));
  dueNextWeek.slice(0, 3).forEach((opportunity) => {
    priorities.push({
      id: `due-${opportunity.id}`,
      label: `Scheduled: ${opportunity.accountName} / ${opportunity.opportunityName}`,
      detail: `${opportunity.nextAction || 'Next action'} - ${formatSafeBusinessDate(opportunity.nextActionDate)}`,
      href: '/app/opportunities',
    });
  });

  const topStalled = stalledInitiatives[0];
  if (topStalled) {
    priorities.push({
      id: `initiative-${topStalled.id}`,
      label: `Restart the initiative: ${topStalled.title}`,
      detail: topStalled.nextAction,
      href: '/app/operating-system',
    });
  }

  return priorities.slice(0, 6);
}

function addDays(dateKey: string, days: number) {
  const parsed = Date.parse(`${dateKey}T00:00:00Z`);
  return new Date(parsed + days * 86_400_000).toISOString().slice(0, 10);
}
