import type { CommercialCommitment } from './types.ts';
import type { ResolvedThread } from './deriveThreads.ts';
import type { CoverageReport } from './forecast.ts';
import { isThreadClosed } from './types.ts';
import type { QuoteRecord } from '../../services/quoteStore';
import type { CrmLiteOpportunity } from '../../services/opportunityStore';

/**
 * The deterministic policy engine.
 *
 * Every recommendation Memoire makes is produced here, by a pure function, from
 * records the user can see, with the evidence attached. There is no model, no
 * external call, and nothing that cannot be explained in one sentence to the
 * person it is shown to - because a recommendation a seller cannot check is a
 * recommendation they will stop trusting the first time it is wrong.
 *
 * Two hard rules:
 *
 *   1. Rules never mutate anything. They read; the user decides. Nothing here
 *      may silently change an opportunity stage, a quote state, or a commitment.
 *   2. Every recommendation carries `reasonCode`, `reasonText`,
 *      `sourceRecordIds`, `threshold`, `severity`, `recommendedAction` and
 *      `calculatedAt`. A recommendation that cannot say which record produced
 *      it, and against which threshold, does not ship.
 */

export const reasonCodes = [
  'CUSTOMER_COMMITMENT_OVERDUE',
  'SELF_COMMITMENT_OVERDUE',
  'COMMITMENT_REPEATEDLY_RESCHEDULED',
  'COMMITMENT_WITHOUT_OWNER',
  'COMMITMENT_WITHOUT_DUE_DATE',
  'THREAD_SILENT',
  'THREAD_WITHOUT_NEXT_COMMITMENT',
  'OPPORTUNITY_WITHOUT_STAGE_EVIDENCE',
  'OPPORTUNITY_WITHOUT_FUTURE_ACTION',
  'QUOTE_EXPIRING',
  'MONEY_CHECKPOINT_STUCK',
  'PERIOD_COVERAGE_LOW',
  'FORECAST_NOT_SUPPORTED',
] as const;
export type ReasonCode = (typeof reasonCodes)[number];

export const severities = ['critical', 'high', 'medium', 'low'] as const;
export type Severity = (typeof severities)[number];

export type Recommendation = {
  id: string;
  reasonCode: ReasonCode;
  /** One sentence naming the evidence, the threshold, and the gap. */
  reasonText: string;
  sourceRecordIds: string[];
  /** The rule's numeric boundary, so the user can see what it is measured against. */
  threshold: number;
  severity: Severity;
  recommendedAction: string;
  calculatedAt: string;
  accountName: string;
  threadId?: string | null;
  opportunityId?: string | null;
  commitmentId?: string | null;
  /** Where to go to act on it. */
  href: string;
};

/**
 * Thresholds live here, in one place, and are exported so the interface can
 * show the number it judged against. Personalisation will eventually override
 * these per account and per thread type from the user's own history; until
 * there is enough history to learn from, everyone gets the same defaults, and
 * every threshold stays inspectable and resettable.
 */
export const policyThresholds = {
  /** Days a thread may go quiet before it counts as silent. */
  threadSilenceDays: 10,
  /** Days a *waiting-on-customer* thread may go quiet. Shorter: the ball is not yours. */
  waitingThreadSilenceDays: 5,
  /** Days past due before an overdue commitment is critical rather than high. */
  overdueCriticalDays: 3,
  /** How many reschedules make a promise a pattern rather than an accident. */
  rescheduleLimit: 2,
  /** Days before a quote's validity ends that it needs attention. */
  quoteExpiryWarningDays: 7,
  /** Days a money checkpoint may sit unchanged before it is stuck. */
  moneyCheckpointStuckDays: 14,
  /**
   * Coverage below which the current quarter is in trouble. 1.0 would be
   * "exactly on plan and nothing may slip", which is not how a quarter ever
   * runs; 0.8 leaves room to react while there is still a quarter left to
   * react in.
   */
  minimumCoverage: 0.8,
  /**
   * Days left in the quarter below which a coverage shortfall stops being
   * something to fix and becomes something to report. Raising it earlier is
   * pointless noise; raising it later is a warning that arrives after the
   * quarter is already decided.
   */
  coverageWarningDaysLeft: 60,
} as const;

export type PolicyThresholds = typeof policyThresholds;

export type PolicyInput = {
  threads: ResolvedThread[];
  commitments: CommercialCommitment[];
  opportunities: CrmLiteOpportunity[];
  quotes: QuoteRecord[];
  today?: Date;
  thresholds?: Partial<PolicyThresholds>;
  /**
   * Whether sample records may produce recommendations.
   *
   * False everywhere except the demo workspace. In a real workspace a demo
   * record must never generate a real risk - that is how a seller ends up
   * chasing a fictional customer. In the demo, the sample data *is* the
   * workspace, and suppressing it left the showcase saying "nothing is going
   * silent" over a pipeline full of overdue payments.
   */
  includeSampleRecords?: boolean;
  /**
   * Quarterly coverage, when the workspace has targets. Optional: a seller who
   * has not set a number gets no coverage nagging, which is right - a rule that
   * fires on data the user never entered is a rule they will learn to ignore.
   */
  coverage?: CoverageReport;
};

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export function evaluateCommercialPolicies(input: PolicyInput): Recommendation[] {
  const today = input.today || new Date();
  const calculatedAt = today.toISOString();
  const thresholds = { ...policyThresholds, ...(input.thresholds || {}) };
  const todayKey = toDateKey(today);

  const includeSamples = input.includeSampleRecords === true;
  const isVisible = (record: { isSample?: boolean }) => includeSamples || record.isSample !== true;

  const recommendations: Recommendation[] = [
    ...commitmentRules(input.commitments.filter(isVisible), todayKey, thresholds, calculatedAt),
    ...threadRules(input.threads, thresholds, calculatedAt),
    ...opportunityRules(input.opportunities.filter(isVisible), todayKey, calculatedAt),
    ...quoteRules(input.quotes.filter(isVisible), todayKey, thresholds, calculatedAt),
    ...coverageRules(input.coverage, thresholds, calculatedAt),
  ];

  return dropDuplicateNextStepWarnings(recommendations).sort((left, right) => {
    const bySeverity = SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity];
    return bySeverity !== 0 ? bySeverity : left.accountName.localeCompare(right.accountName);
  });
}

/**
 * One gap, said once.
 *
 * A thread with no open commitment and the opportunity behind it with no dated
 * next action are the same sentence about the same deal, written from two
 * record types: "nothing is scheduled to move this". Both fired, both reached
 * the week's plan, and both proposed a row the operator would satisfy with a
 * single edit. On a workspace with one deal that was two of the four suggested
 * items; on a real book it is the reason a suggestion list stops being read.
 *
 * The opportunity-level warning is the one kept: it names the deal, it carries
 * the date that is missing, and its link opens the field that clears it.
 */
function dropDuplicateNextStepWarnings(recommendations: Recommendation[]): Recommendation[] {
  const opportunitiesAlreadyWarned = new Set(
    recommendations
      .filter((item) => item.reasonCode === 'OPPORTUNITY_WITHOUT_FUTURE_ACTION' && item.opportunityId)
      .map((item) => item.opportunityId as string),
  );
  if (opportunitiesAlreadyWarned.size === 0) return recommendations;

  return recommendations.filter((item) => !(
    item.reasonCode === 'THREAD_WITHOUT_NEXT_COMMITMENT'
    && item.opportunityId
    && opportunitiesAlreadyWarned.has(item.opportunityId)
  ));
}

// ------------------------------------------------------------ commitments

function commitmentRules(
  commitments: CommercialCommitment[],
  todayKey: string,
  thresholds: PolicyThresholds,
  calculatedAt: string,
): Recommendation[] {
  const out: Recommendation[] = [];

  for (const commitment of commitments) {
    if (commitment.status !== 'open') continue;

    const due = commitment.currentDueDate;
    const daysOverdue = due ? daysBetween(due, todayKey) : null;

    if (due && daysOverdue !== null && daysOverdue > 0) {
      const isCustomer = commitment.commitmentParty === 'customer';
      const moved = commitment.dueDateHistory.length;
      out.push({
        id: `${commitment.id}:overdue`,
        reasonCode: isCustomer ? 'CUSTOMER_COMMITMENT_OVERDUE' : 'SELF_COMMITMENT_OVERDUE',
        reasonText: isCustomer
          ? `${commitment.ownerLabel} committed to "${commitment.commitmentText}" by ${formatDate(commitment.originalDueDate || due)}. It is ${plural(daysOverdue, 'day')} overdue${moved ? ` after ${plural(moved, 'reschedule')}` : ''}.`
          : `You committed to "${commitment.commitmentText}" by ${formatDate(commitment.originalDueDate || due)}. It is ${plural(daysOverdue, 'day')} overdue${moved ? ` after ${plural(moved, 'reschedule')}` : ''}.`,
        sourceRecordIds: [commitment.id],
        threshold: 0,
        severity: daysOverdue >= thresholds.overdueCriticalDays ? 'critical' : 'high',
        recommendedAction: isCustomer
          ? 'Send a confirmation follow-up.'
          : 'Complete it, or reschedule it with a date you can keep.',
        calculatedAt,
        accountName: commitment.accountName,
        threadId: commitment.threadId || null,
        opportunityId: commitment.opportunityId || null,
        commitmentId: commitment.id,
        href: commitmentHref(commitment),
      });
    }

    if (commitment.dueDateHistory.length >= thresholds.rescheduleLimit) {
      out.push({
        id: `${commitment.id}:rescheduled`,
        reasonCode: 'COMMITMENT_REPEATEDLY_RESCHEDULED',
        reasonText: `"${commitment.commitmentText}" has moved ${plural(commitment.dueDateHistory.length, 'time')} since it was first promised for ${formatDate(commitment.originalDueDate)}.`,
        sourceRecordIds: [commitment.id],
        threshold: thresholds.rescheduleLimit,
        severity: 'medium',
        recommendedAction: 'Find out what is really blocking it, or drop it honestly.',
        calculatedAt,
        accountName: commitment.accountName,
        threadId: commitment.threadId || null,
        opportunityId: commitment.opportunityId || null,
        commitmentId: commitment.id,
        href: commitmentHref(commitment),
      });
    }

    if (!due) {
      out.push({
        id: `${commitment.id}:no-date`,
        reasonCode: 'COMMITMENT_WITHOUT_DUE_DATE',
        reasonText: `"${commitment.commitmentText}" has no date, so nothing can ever tell you it is late.`,
        sourceRecordIds: [commitment.id],
        threshold: 0,
        severity: 'medium',
        recommendedAction: 'Give it a date.',
        calculatedAt,
        accountName: commitment.accountName,
        threadId: commitment.threadId || null,
        opportunityId: commitment.opportunityId || null,
        commitmentId: commitment.id,
        href: commitmentHref(commitment),
      });
    }

    if (!commitment.ownerLabel.trim()) {
      out.push({
        id: `${commitment.id}:no-owner`,
        reasonCode: 'COMMITMENT_WITHOUT_OWNER',
        reasonText: `"${commitment.commitmentText}" does not say who owes it.`,
        sourceRecordIds: [commitment.id],
        threshold: 0,
        severity: 'low',
        recommendedAction: 'Name the person who owes it.',
        calculatedAt,
        accountName: commitment.accountName,
        threadId: commitment.threadId || null,
        opportunityId: commitment.opportunityId || null,
        commitmentId: commitment.id,
        href: commitmentHref(commitment),
      });
    }
  }

  return out;
}

// ---------------------------------------------------------------- threads

function threadRules(
  threads: ResolvedThread[],
  thresholds: PolicyThresholds,
  calculatedAt: string,
): Recommendation[] {
  const out: Recommendation[] = [];

  for (const thread of threads) {
    if (isThreadClosed(thread.status)) continue;

    const waitingOnCustomer = thread.currentWaitingParty === 'customer';
    const limit = waitingOnCustomer ? thresholds.waitingThreadSilenceDays : thresholds.threadSilenceDays;

    if (thread.daysSinceActivity !== null && thread.daysSinceActivity >= limit) {
      out.push({
        id: `${thread.id}:silent`,
        reasonCode: 'THREAD_SILENT',
        reasonText: waitingOnCustomer
          ? `${thread.title} has been waiting on ${thread.accountName} for ${plural(thread.daysSinceActivity, 'day')}, past the ${plural(limit, 'day')} you allow a customer.`
          : `Nothing has happened on ${thread.title} for ${plural(thread.daysSinceActivity, 'day')}, past the ${plural(limit, 'day')} silence threshold.`,
        sourceRecordIds: [thread.id],
        threshold: limit,
        severity: thread.daysSinceActivity >= limit * 2 ? 'high' : 'medium',
        recommendedAction: waitingOnCustomer
          ? 'Chase the customer for the answer you are waiting on.'
          : 'Make contact, or record why this thread is parked.',
        calculatedAt,
        accountName: thread.accountName,
        threadId: thread.id,
        opportunityId: thread.opportunityId || null,
        href: threadHref(thread),
      });
    }

    if (thread.openCommitmentCount === 0) {
      out.push({
        id: `${thread.id}:no-next`,
        reasonCode: 'THREAD_WITHOUT_NEXT_COMMITMENT',
        reasonText: `${thread.title} has no open commitment, so nothing is scheduled to move it.`,
        sourceRecordIds: [thread.id],
        threshold: 1,
        severity: 'medium',
        recommendedAction: 'Set the next commitment: what happens, by whom, by when.',
        calculatedAt,
        accountName: thread.accountName,
        threadId: thread.id,
        opportunityId: thread.opportunityId || null,
        href: threadHref(thread),
      });
    }

    // Money that has stopped moving. A thread waiting on payment for a
    // fortnight is a collection problem, not a sales one.
    const moneyInMotion = thread.currentMoneyState !== 'none' && thread.currentMoneyState !== 'paid';
    if (moneyInMotion && thread.daysSinceActivity !== null
      && thread.daysSinceActivity >= thresholds.moneyCheckpointStuckDays) {
      out.push({
        id: `${thread.id}:money-stuck`,
        reasonCode: 'MONEY_CHECKPOINT_STUCK',
        reasonText: `${thread.title} has sat at "${humanMoneyState(thread.currentMoneyState)}" for ${plural(thread.daysSinceActivity, 'day')}.`,
        sourceRecordIds: [thread.id],
        threshold: thresholds.moneyCheckpointStuckDays,
        severity: 'high',
        recommendedAction: `Move it on from ${humanMoneyState(thread.currentMoneyState)}, or record what is holding it.`,
        calculatedAt,
        accountName: thread.accountName,
        threadId: thread.id,
        opportunityId: thread.opportunityId || null,
        href: '/app/revenue',
      });
    }
  }

  return out;
}

// ---------------------------------------------------------- opportunities

function opportunityRules(
  opportunities: CrmLiteOpportunity[],
  todayKey: string,
  calculatedAt: string,
): Recommendation[] {
  const out: Recommendation[] = [];

  for (const opportunity of opportunities) {
    if (opportunity.status !== 'Active') continue;

    if (!opportunity.evidence?.trim()) {
      out.push({
        id: `${opportunity.id}:no-evidence`,
        reasonCode: 'OPPORTUNITY_WITHOUT_STAGE_EVIDENCE',
        reasonText: `${opportunity.opportunityName} is at "${opportunity.stage}" with nothing recorded that supports that stage.`,
        sourceRecordIds: [opportunity.id],
        threshold: 1,
        severity: 'medium',
        recommendedAction: 'Record what the customer actually did that puts it at this stage.',
        calculatedAt,
        accountName: opportunity.accountName,
        opportunityId: opportunity.id,
        href: `/app/opportunities?opportunityId=${encodeURIComponent(opportunity.id)}`,
      });
    }

    // The date is what decides this, not the wording beside it. Requiring both
    // meant a deal dated three days out - which Plan and Today were already
    // showing - was reported as having "no dated next action", directly under a
    // card in the same drawer reading "Next action - Aug 21, 2026". A rule that
    // contradicts the record it is describing teaches people to ignore it.
    const nextActionDate = opportunity.nextActionDate?.trim();
    const hasFutureAction = Boolean(nextActionDate) && nextActionDate >= todayKey;

    if (!hasFutureAction) {
      out.push({
        id: `${opportunity.id}:no-future-action`,
        reasonCode: 'OPPORTUNITY_WITHOUT_FUTURE_ACTION',
        reasonText: nextActionDate && nextActionDate < todayKey
          ? `${opportunity.opportunityName}'s next action was dated ${formatDate(nextActionDate)} and has passed.`
          : `${opportunity.opportunityName} has no dated next action.`,
        sourceRecordIds: [opportunity.id],
        threshold: 1,
        severity: 'medium',
        recommendedAction: 'Set a dated next action, or close the opportunity honestly.',
        calculatedAt,
        accountName: opportunity.accountName,
        opportunityId: opportunity.id,
        href: `/app/opportunities?opportunityId=${encodeURIComponent(opportunity.id)}`,
      });
    }
  }

  return out;
}

// ----------------------------------------------------------------- quotes

function quoteRules(
  quotes: QuoteRecord[],
  todayKey: string,
  thresholds: PolicyThresholds,
  calculatedAt: string,
): Recommendation[] {
  const out: Recommendation[] = [];

  for (const quote of quotes) {
    if (quote.status !== 'Sent' && quote.status !== 'Revised') continue;
    if (!quote.validUntil) continue;

    const daysLeft = daysBetween(todayKey, quote.validUntil);
    if (daysLeft === null || daysLeft > thresholds.quoteExpiryWarningDays) continue;

    out.push({
      id: `${quote.id}:expiring`,
      reasonCode: 'QUOTE_EXPIRING',
      reasonText: daysLeft < 0
        ? `Quote ${quote.quoteId} for ${quote.accountName} expired ${plural(Math.abs(daysLeft), 'day')} ago.`
        : `Quote ${quote.quoteId} for ${quote.accountName} is valid for ${plural(daysLeft, 'more day')}.`,
      sourceRecordIds: [quote.id],
      threshold: thresholds.quoteExpiryWarningDays,
      severity: daysLeft < 0 ? 'high' : 'medium',
      recommendedAction: daysLeft < 0
        ? 'Extend the validity or reissue it before you chase.'
        : 'Chase the decision, or extend the validity.',
      calculatedAt,
      accountName: quote.accountName,
      opportunityId: quote.opportunityId || null,
      href: '/app/quotes',
    });
  }

  return out;
}

// --------------------------------------------------------------- coverage

/**
 * The quarter as a whole, not deal by deal.
 *
 * Everything else in this engine watches one record. These two watch the
 * number the seller is measured on - the question a control tower exists to
 * answer, and the one Memoire was previously blind to. Both are deliberately
 * timed: a shortfall raised with two months left is something to fix, the same
 * shortfall raised in the final fortnight is only something to explain.
 */
function coverageRules(
  coverage: CoverageReport | undefined,
  thresholds: PolicyThresholds,
  calculatedAt: string,
): Recommendation[] {
  if (!coverage || !coverage.hasTargets) return [];

  const out: Recommendation[] = [];
  const current = coverage.quarters.find((quarter) => quarter.isCurrent);

  if (current && current.target > 0 && current.coverage !== null) {
    const daysLeft = current.daysLeft ?? 0;
    const shortfall = Math.max(0, current.gap);

    if (current.coverage < thresholds.minimumCoverage && shortfall > 0) {
      const stillTime = daysLeft >= 14;
      out.push({
        id: `coverage:${current.quarter}`,
        reasonCode: 'PERIOD_COVERAGE_LOW',
        reasonText: `${current.quarter} is ${Math.round(current.coverage * 100)}% covered with ${plural(daysLeft, 'day')} left. Won plus evidence-backed pipeline is ${formatMoney(current.committed + current.weightedSupported)} against a ${formatMoney(current.target)} target - short by ${formatMoney(shortfall)}.`,
        sourceRecordIds: [`target:${current.quarter}`],
        threshold: thresholds.minimumCoverage,
        severity: daysLeft <= 30 ? 'critical' : 'high',
        recommendedAction: stillTime
          ? 'Add pipeline, or pull a later deal forward - there is still time to change the number.'
          : 'Too late to close the gap with new pipeline. Decide what you are telling the business.',
        calculatedAt,
        accountName: '',
        href: '/app/revenue',
      });
    }
  }

  // The declared forecast against what the evidence supports. This is the
  // number that gets challenged in a review, so it is worth seeing first.
  if (coverage.unsupportedValue > 0 && coverage.unsupportedDeals.length > 0) {
    const worst = coverage.unsupportedDeals[0];
    out.push({
      id: 'coverage:unsupported',
      reasonCode: 'FORECAST_NOT_SUPPORTED',
      reasonText: `${formatMoney(coverage.unsupportedValue)} of weighted forecast is not supported by evidence, across ${plural(coverage.unsupportedDeals.length, 'deal')}. The largest is ${worst.accountName} - declared ${worst.declared}%, evidence supports ${worst.supported}%.`,
      sourceRecordIds: coverage.unsupportedDeals.map((deal) => deal.opportunityId),
      threshold: 0,
      severity: 'medium',
      recommendedAction: 'Refresh the evidence on these deals, or mark the forecast down before someone else does.',
      calculatedAt,
      accountName: worst.accountName,
      opportunityId: worst.opportunityId,
      href: '/app/revenue',
    });
  }

  return out;
}

// ----------------------------------------------------------------- helpers

function commitmentHref(commitment: CommercialCommitment) {
  if (commitment.opportunityId) {
    return `/app/opportunities?opportunityId=${encodeURIComponent(commitment.opportunityId)}`;
  }
  return '/app/timeline?view=upcoming';
}

function threadHref(thread: ResolvedThread) {
  if (thread.opportunityId) {
    return `/app/opportunities?opportunityId=${encodeURIComponent(thread.opportunityId)}`;
  }
  return `/app/accounts?accountName=${encodeURIComponent(thread.accountName)}`;
}

function humanMoneyState(state: string) {
  return state.replace(/_/g, ' ');
}

/** Whole days from `from` to `to`. Null when either date is unusable. */
function daysBetween(from: string, to: string): number | null {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return Math.round((end - start) / 86_400_000);
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatDate(value: string) {
  if (!value) return 'no date';
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });
}

function plural(count: number, noun: string) {
  return `${count} ${noun}${Math.abs(count) === 1 ? '' : 's'}`;
}

/** Compact money for a sentence: 1.2M rather than 1,234,567. */
function formatMoney(value: number) {
  const rounded = Math.round(value);
  if (Math.abs(rounded) >= 1_000_000_000) return `${(rounded / 1_000_000_000).toFixed(1)}B`;
  if (Math.abs(rounded) >= 1_000_000) return `${(rounded / 1_000_000).toFixed(1)}M`;
  if (Math.abs(rounded) >= 1_000) return `${(rounded / 1_000).toFixed(0)}K`;
  return String(rounded);
}
