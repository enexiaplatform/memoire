import type { OperatingContextRecord } from '../services/operatingContextStore.ts';
import type { OpportunityOutcomeRecord } from '../services/opportunityOutcomeStore.ts';
import type { CrmLiteOpportunity } from '../services/opportunityStore.ts';
import type { QuoteRecord } from '../services/quoteStore.ts';
import type { SalesActivityRecord } from '../services/salesActivityStore.ts';
import { buildMoneyFlow, type MoneyFlow } from './moneyFlow.ts';
import { classifyInitiativeHealth, type InitiativeHealth } from './proactiveNudges.ts';
import { formatBaseCurrencyAmount, sumMoneyInBase } from './money.ts';
import { compareSafeBusinessDate, formatSafeBusinessDate, isBusinessDateInRange, isBusinessDateOverdue, isValidBusinessDate, sanitizeBusinessDate, todayDateKey } from './safeDate.ts';

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

export type SignalDigestItem = {
  text: string;
  accountName: string;
  date: string;
};

export type SignalDigest = {
  buying: SignalDigestItem[];
  risks: SignalDigestItem[];
  timeline: SignalDigestItem[];
  competitors: SignalDigestItem[];
  total: number;
};

export type CommitmentStatus = 'kept' | 'missed' | 'upcoming';

export type CommitmentItem = {
  id: string;
  accountName: string;
  opportunityName: string;
  action: string;
  date: string;
  status: CommitmentStatus;
  evidence: string;
};

export type WeeklyBusinessReview = {
  moneyFlow: MoneyFlow;
  wins: OpportunityOutcomeRecord[];
  losses: OpportunityOutcomeRecord[];
  otherOutcomes: OpportunityOutcomeRecord[];
  wonValueLabel: string;
  stalledInitiatives: StalledInitiativeItem[];
  commitments: CommitmentItem[];
  signals: SignalDigest;
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

  const commitments = buildCommitmentLedger(input, today);
  const signals = buildSignalDigest(input);

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
    commitments,
    signals,
    nextWeekPriorities: buildNextWeekPriorities(input, moneyFlow, stalledInitiatives, today),
  };
}

/**
 * Customer-signal digest: the buying signals, risks, timeline signals, and
 * competitor mentions that capture already extracted per activity, rolled up
 * for the review period. Pure read-model - nothing here is inferred beyond
 * what the seller captured.
 */
function buildSignalDigest(input: WeeklyBusinessReviewInput): SignalDigest {
  const periodActivities = input.activities.filter((activity) => (
    isBusinessDateInRange(activity.activityDate, input.period.start, input.period.end)
  ));

  const collect = (getSignals: (activity: SalesActivityRecord) => string[] | undefined) => {
    const seen = new Set<string>();
    const items: SignalDigestItem[] = [];
    [...periodActivities]
      .sort((a, b) => compareSafeBusinessDate(b.activityDate, a.activityDate))
      .forEach((activity) => {
        (getSignals(activity) || []).forEach((text) => {
          const cleaned = text.trim();
          const key = cleaned.toLowerCase();
          if (!cleaned || seen.has(key)) return;
          seen.add(key);
          items.push({
            text: cleaned,
            accountName: activity.accountName || activity.linkedAccountName || '',
            date: activity.activityDate,
          });
        });
      });
    return items.slice(0, 5);
  };

  const buying = collect((activity) => activity.buyingSignals);
  const risks = collect((activity) => activity.risks);
  const timeline = collect((activity) => activity.timelineSignals);
  const competitors = collect((activity) => activity.competitors);

  return {
    buying,
    risks,
    timeline,
    competitors,
    total: buying.length + risks.length + timeline.length + competitors.length,
  };
}

/**
 * The commitments ledger: promised next actions (dated inside the review
 * period or already overdue) against what actually happened. Kept = a
 * captured touch on that deal on or after the promised date; missed = the
 * date passed with no such touch; upcoming = still ahead inside the period.
 * Only the current promise is stored on an opportunity, so this is honest
 * for the live period - past periods cannot be reconstructed and are not
 * pretended.
 */
/**
 * The commitments read-model: every dated next action on an active deal is
 * a promise, checked against the activity ledger. Exported for reuse - the
 * Weekly Business Review renders it, and Ask Memoire answers "did I keep my
 * promises" from the same rules. Current promises only; past periods are
 * not reconstructed because only the current promise is stored.
 */
export function buildCommitmentLedger(
  input: Pick<WeeklyBusinessReviewInput, 'opportunities' | 'activities' | 'period'>,
  today: string,
): CommitmentItem[] {
  const items: CommitmentItem[] = [];

  input.opportunities
    .filter((opportunity) => opportunity.status === 'Active' && isValidBusinessDate(opportunity.nextActionDate))
    .filter((opportunity) => compareSafeBusinessDate(opportunity.nextActionDate, input.period.end) <= 0)
    .forEach((opportunity) => {
      const promiseDate = opportunity.nextActionDate;
      const touchOnOrAfter = input.activities
        .filter((activity) => isValidBusinessDate(activity.activityDate)
          && (activity.linkedOpportunityId === opportunity.id
            || (normalizeName(activity.accountName) !== ''
              && (normalizeName(activity.accountName) === normalizeName(opportunity.accountName)
                || normalizeName(activity.linkedAccountName) === normalizeName(opportunity.accountName)))))
        .filter((activity) => compareSafeBusinessDate(activity.activityDate, promiseDate) >= 0)
        .map((activity) => activity.activityDate)
        .sort(compareSafeBusinessDate)
        .at(0) || '';

      let status: CommitmentStatus;
      let evidence: string;
      if (touchOnOrAfter) {
        status = 'kept';
        evidence = `Touch captured on ${formatSafeBusinessDate(touchOnOrAfter)}.`;
      } else if (compareSafeBusinessDate(promiseDate, today) < 0) {
        status = 'missed';
        evidence = 'No captured touch since the promised date.';
      } else {
        status = 'upcoming';
        evidence = `Due ${formatSafeBusinessDate(promiseDate)}.`;
      }

      items.push({
        id: `commitment-${opportunity.id}`,
        accountName: opportunity.accountName || 'Needs confirmation',
        opportunityName: opportunity.opportunityName || 'Needs confirmation',
        action: opportunity.nextAction || 'Next action',
        date: promiseDate,
        status,
        evidence,
      });
    });

  const statusRank = { missed: 0, upcoming: 1, kept: 2 };
  return items.sort((a, b) => statusRank[a.status] - statusRank[b.status] || compareSafeBusinessDate(a.date, b.date));
}

function normalizeName(value?: string) {
  return (value || '').trim().toLowerCase();
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
