import type { CrmLiteOpportunity } from '../services/opportunityStore';
import type { SalesActivityRecord } from '../services/salesActivityStore';
import type { Recommendation, ReasonCode, Severity } from '../domain/commercialKernel/policyEngine';
import type { SalesActivityType } from './salesActivityClassifier';
import { condensePlanLabel, getDatedCaptureActions, type PlanRecord } from './weeklyPlan.ts';
import { sameAccount } from './accountIdentity.ts';
import {
  compareSafeBusinessDate,
  formatSafeBusinessDate,
  isBusinessDateInRange,
  isValidBusinessDate,
} from './safeDate.ts';

/**
 * What the week is asking of the operator, proposed rather than demanded.
 *
 * Two sources, because a plan built from one of them is always half a plan.
 *
 * The **policy engine** already judges the workspace: overdue promises, silent
 * threads, expiring quotes, deals with no next action, a quarter short on
 * coverage. Those warnings used to live only on Today and in Pipeline Defense,
 * where they could be read but not planned - the operator saw the risk, then
 * retyped it by hand onto the board. Now every alert can become a dated line in
 * one click, carrying its reason code and its severity with it.
 *
 * The **activity ledger** knows the softer half: the follow-ups nobody dated,
 * the risks raised in a meeting, the threads that went quiet after a demo.
 *
 * A next action that carries a due date *inside the planned period* lands on the
 * board by itself (buildCaptureItems), so it is not proposed twice. One dated
 * outside the period is still proposed here - it belongs to a week nobody is
 * looking at, which is precisely how a promise gets missed, and it was the
 * reason a week planned in advance came up empty.
 *
 * A suggestion is never work. It becomes work only when the operator accepts
 * it, and a refusal is recorded so the same thing is not proposed twice.
 */

export type PlanSuggestionKind =
  | 'alert'
  | 'due-next-action'
  | 'undated-next-action'
  | 'quiet-after-touch'
  | 'open-risk';

export type PlanSuggestion = {
  /** Stable across rebuilds, so accept/dismiss decisions stick. */
  key: string;
  kind: PlanSuggestionKind;
  tag: string;
  label: string;
  /** The rule that fired. */
  reason: string;
  /** What was actually captured, and when. Never inferred. */
  evidence: string;
  suggestedDate: string;
  /** Empty for alerts: the policy engine judged records, not one touch. */
  sourceActivityId: string;
  linkedOpportunityId?: string;
  linkedAccountName?: string;
  /** Carried from the policy engine so the board can rank and colour by it. */
  severity?: Severity;
  /** The policy rule behind an alert, so the suggestion stays explainable. */
  reasonCode?: ReasonCode;
  /** Where to go to act on it, when the alert knows. */
  href?: string;
};

/**
 * Two sources, two caps.
 *
 * A plan is a week someone can actually work, so the total is small on purpose.
 * Alerts get the larger share because they are the workspace's own judgement
 * about what is at risk; the ledger half fills whatever is left.
 */
const MAX_SUGGESTIONS = 8;
const MAX_ALERT_SUGGESTIONS = 5;
const MAX_LEDGER_SUGGESTIONS = 6;

/** How urgency becomes a day. Critical lands as early as the week allows. */
const ALERT_DAY_OFFSET: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/**
 * What the operator is being asked to do, per rule, in their own register.
 * `recommendedAction` from the policy engine is written to be read on a risk
 * list ("Confirm the delivery date with the customer"); on a plan board the
 * same thing has to read like a line someone wrote for themselves.
 */
const ALERT_LABEL: Record<ReasonCode, string> = {
  CUSTOMER_COMMITMENT_OVERDUE: 'Chase what the customer owes',
  SELF_COMMITMENT_OVERDUE: 'Deliver what you promised',
  COMMITMENT_REPEATEDLY_RESCHEDULED: 'Settle the promise that keeps moving',
  COMMITMENT_WITHOUT_OWNER: 'Decide who owns this promise',
  COMMITMENT_WITHOUT_DUE_DATE: 'Put a date on this promise',
  THREAD_SILENT: 'Restart the thread that went quiet',
  THREAD_WITHOUT_NEXT_COMMITMENT: 'Agree the next step',
  OPPORTUNITY_WITHOUT_STAGE_EVIDENCE: 'Get evidence for the stage',
  OPPORTUNITY_WITHOUT_FUTURE_ACTION: 'Set the next action',
  QUOTE_EXPIRING: 'Chase the quote before it expires',
  MONEY_CHECKPOINT_STUCK: 'Unblock the money checkpoint',
  PERIOD_COVERAGE_LOW: 'Work the coverage gap for the quarter',
  FORECAST_NOT_SUPPORTED: 'Re-test the forecast that nothing backs',
};

/**
 * How long after a touch a follow-up is worth proposing. Deliberately coarse:
 * this decides which day to propose, never whether the work matters.
 */
const FOLLOW_UP_DAYS: Partial<Record<SalesActivityType, number>> = {
  'Customer meeting': 3,
  'Demo / technical discussion': 3,
  'Objection handling': 3,
  'Quote / proposal': 7,
  'Tender / procurement': 7,
  'Follow-up': 7,
  Partnership: 7,
};

/**
 * What chasing a quiet thread is actually called, per touch. Generated wording
 * has to read like something a person would write on their own plan - "follow
 * up after the follow-up" is how a template betrays itself.
 */
const QUIET_LABEL: Partial<Record<SalesActivityType, string>> = {
  'Customer meeting': 'Follow up after the meeting',
  'Demo / technical discussion': 'Follow up after the demo',
  'Quote / proposal': 'Chase the quote',
  'Tender / procurement': 'Check where the tender stands',
  'Follow-up': 'Chase the reply',
  'Objection handling': 'Close out the objection raised',
  Partnership: 'Pick the partnership thread back up',
};

/** Touches with a customer on the other end - the only ones worth chasing. */
const CUSTOMER_FACING: SalesActivityType[] = [
  'Customer meeting',
  'Demo / technical discussion',
  'Quote / proposal',
  'Tender / procurement',
  'Follow-up',
  'Objection handling',
  'Partnership',
];

export function buildPlanSuggestions(input: {
  activities: SalesActivityRecord[];
  opportunities: CrmLiteOpportunity[];
  records: PlanRecord[];
  /** The week being planned. */
  rangeStart: string;
  rangeEnd: string;
  /**
   * The workspace's own warnings, from the policy engine. Optional so callers
   * that have not loaded the kernel still get the ledger half rather than
   * nothing.
   */
  recommendations?: Recommendation[];
  /** Today, so an alert is never proposed for a day that has already gone. */
  today?: string;
  /** How far back to read the ledger. Defaults to the 14 days before the week. */
  lookbackDays?: number;
}): PlanSuggestion[] {
  const lookbackDays = input.lookbackDays ?? 14;
  const lookbackStart = addDays(input.rangeStart, -lookbackDays);
  // Read through the end of the planned period, not just up to the day before it.
  // A touch captured earlier today, planning the rest of this same week, has to
  // be able to reach the board - otherwise the seller feels they recorded it for
  // nothing.
  const lookbackEnd = input.rangeEnd;

  const decided = new Set(
    input.records
      .filter((record) => record.__deleted !== true && record.suggestionKey)
      .map((record) => record.suggestionKey as string),
  );

  // Anything the pipeline already puts on the board this week must not be
  // proposed again - the board would show the same commitment twice.
  const alreadyOnBoard = new Set(
    input.opportunities
      .filter((opportunity) => opportunity.status === 'Active')
      .filter((opportunity) => isValidBusinessDate(opportunity.nextActionDate))
      .filter((opportunity) => isBusinessDateInRange(opportunity.nextActionDate, input.rangeStart, input.rangeEnd))
      .map((opportunity) => opportunity.id),
  );

  const recent = input.activities
    .filter((activity) => isValidBusinessDate(activity.activityDate))
    .filter((activity) => isBusinessDateInRange(activity.activityDate, lookbackStart, lookbackEnd))
    .sort((a, b) => compareSafeBusinessDate(b.activityDate, a.activityDate));

  const suggestions: PlanSuggestion[] = [];

  recent.forEach((activity) => {
    const accountName = activity.linkedAccountName || activity.accountName || '';
    const linkedOpportunityId = activity.linkedOpportunityId || undefined;
    if (linkedOpportunityId && alreadyOnBoard.has(linkedOpportunityId)) return;

    const base = {
      tag: accountName || 'Unknown account',
      sourceActivityId: activity.id,
      linkedOpportunityId,
      linkedAccountName: accountName || undefined,
    };
    const touchLabel = `${activity.activityType} on ${formatSafeBusinessDate(activity.activityDate)}`;
    const nextAction = (activity.nextAction || '').trim();

    const datedActions = getDatedCaptureActions(activity);

    // Dated inside this period, it drives straight onto the board
    // (buildCaptureItems). Proposing it here too would show the same commitment
    // twice - once as a live plan item, once as a thing to add - which is
    // exactly the "did I record this already?" doubt the plan is meant to
    // remove.
    if (datedActions.some((candidate) => isBusinessDateInRange(candidate.dueDate, input.rangeStart, input.rangeEnd))) {
      return;
    }

    // Dated *before* this period and never planned, it is a promise that has
    // already come due on a week nobody is looking at any more. It reaches no
    // board, so without this it is simply lost - and it is the reason a week
    // planned ahead of time came up empty while the ledger was full.
    //
    // Dated *after* the period is left alone deliberately: pulling August work
    // into a July week is not planning, it is just moving the pile.
    const overdue = datedActions
      .filter((candidate) => compareSafeBusinessDate(candidate.dueDate, input.rangeStart) < 0)
      .sort((a, b) => compareSafeBusinessDate(a.dueDate, b.dueDate))[0];

    if (overdue) {
      suggestions.push({
        ...base,
        key: `sug:promised:${activity.id}`,
        kind: 'due-next-action',
        label: condensePlanLabel(overdue.title),
        reason: `You promised this for ${formatSafeBusinessDate(overdue.dueDate)} and it never reached a plan.`,
        evidence: `Captured from your ${touchLabel}.`,
        suggestedDate: input.rangeStart,
      });
      return;
    }

    if (nextAction && isValidBusinessDate(activity.dueDate)) {
      // Dated, but later than this period. It belongs to the week it is due in.
      return;
    }

    if (nextAction) {
      // Written down, never dated - the commonest way a follow-up dies.
      suggestions.push({
        ...base,
        key: `sug:undated:${activity.id}`,
        kind: 'undated-next-action',
        label: condensePlanLabel(nextAction),
        reason: 'You wrote this next action down but never put a date on it.',
        evidence: `Captured from your ${touchLabel}.`,
        suggestedDate: clampToRange(
          addDays(activity.activityDate, FOLLOW_UP_DAYS[activity.activityType] ?? 5),
          input.rangeStart,
          input.rangeEnd,
        ),
      });
      return;
    }

    // No next action at all. Only chase it if nothing has happened since.
    if (!CUSTOMER_FACING.includes(activity.activityType)) return;
    if (hasLaterTouch(activity, input.activities, accountName)) return;

    const risk = firstNonEmpty(activity.risks);
    if (risk) {
      suggestions.push({
        ...base,
        key: `sug:risk:${activity.id}`,
        kind: 'open-risk',
        label: condensePlanLabel(`Address the risk raised: ${risk}`),
        reason: 'A risk was captured on this touch and nothing has been logged since.',
        evidence: `Raised during your ${touchLabel}.`,
        suggestedDate: clampToRange(
          addDays(activity.activityDate, FOLLOW_UP_DAYS[activity.activityType] ?? 5),
          input.rangeStart,
          input.rangeEnd,
        ),
      });
      return;
    }

    suggestions.push({
      ...base,
      key: `sug:quiet:${activity.id}`,
      kind: 'quiet-after-touch',
      label: QUIET_LABEL[activity.activityType] || 'Follow up on this thread',
      reason: 'No next action was captured on this touch, and nothing has been logged since.',
      evidence: `Your last touch here was the ${touchLabel}.`,
      suggestedDate: clampToRange(
        addDays(activity.activityDate, FOLLOW_UP_DAYS[activity.activityType] ?? 5),
        input.rangeStart,
        input.rangeEnd,
      ),
    });
  });

  // Rank by how explicit the commitment was, then cap. A long list of
  // suggestions describes the data, not a plan - the review page already
  // learned that lesson the hard way.
  const rank: Record<PlanSuggestionKind, number> = {
    alert: 0,
    'due-next-action': 1,
    'undated-next-action': 2,
    'open-risk': 3,
    'quiet-after-touch': 4,
  };
  const severityRank: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

  const alerts = buildAlertSuggestions({
    recommendations: input.recommendations || [],
    decided,
    alreadyOnBoard,
    rangeStart: input.rangeStart,
    rangeEnd: input.rangeEnd,
    today: input.today,
  });

  const seen = new Set<string>();
  const ledger = suggestions
    .filter((suggestion) => !decided.has(suggestion.key))
    .filter((suggestion) => {
      // One suggestion per account per kind: three quiet touches on the same
      // account is one follow-up, not three.
      const dedupeKey = `${suggestion.kind}:${suggestion.tag.toLowerCase()}`;
      if (seen.has(dedupeKey)) return false;
      seen.add(dedupeKey);
      return true;
    })
    .sort((a, b) => rank[a.kind] - rank[b.kind] || compareSafeBusinessDate(a.suggestedDate, b.suggestedDate))
    .slice(0, MAX_LEDGER_SUGGESTIONS);

  // An account already carrying an alert does not also need the softer ledger
  // nudge about the same deal: "restart the thread that went quiet" and "follow
  // up after the demo" are one piece of work described twice.
  const alertedOpportunities = new Set(alerts.map((alert) => alert.linkedOpportunityId).filter(Boolean));
  const alertedAccounts = new Set(alerts.map((alert) => alert.tag.toLowerCase()));

  return [
    ...alerts,
    ...ledger.filter((suggestion) => (
      !(suggestion.linkedOpportunityId && alertedOpportunities.has(suggestion.linkedOpportunityId))
      && !alertedAccounts.has(suggestion.tag.toLowerCase())
    )),
  ]
    .sort((a, b) => (
      rank[a.kind] - rank[b.kind]
      || severityRank[a.severity ?? 'low'] - severityRank[b.severity ?? 'low']
      || compareSafeBusinessDate(a.suggestedDate, b.suggestedDate)
    ))
    .slice(0, MAX_SUGGESTIONS);
}

/**
 * The workspace's own warnings, turned into datable lines.
 *
 * The policy engine has already done the judging: every recommendation carries
 * a reason code, the threshold it was measured against, a severity and the
 * records behind it. Nothing is re-derived here. This decides one thing the
 * engine deliberately does not - which day of the planned week the work should
 * land on - and it decides it from severity alone, because a risk list has no
 * opinion about calendars.
 */
function buildAlertSuggestions(input: {
  recommendations: Recommendation[];
  decided: Set<string>;
  alreadyOnBoard: Set<string>;
  rangeStart: string;
  rangeEnd: string;
  today?: string;
}): PlanSuggestion[] {
  const severityRank: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  const seen = new Set<string>();

  return input.recommendations
    .filter((recommendation) => !input.decided.has(alertSuggestionKey(recommendation)))
    // The deal is already planned this week. The alert is real, but adding it
    // would put the same account on the board twice in one week.
    .filter((recommendation) => !(
      recommendation.opportunityId && input.alreadyOnBoard.has(recommendation.opportunityId)
    ))
    .sort((a, b) => severityRank[a.severity] - severityRank[b.severity])
    .filter((recommendation) => {
      // One alert per account per rule. A customer with four overdue promises
      // needs one line on the board, not four.
      const dedupeKey = `${recommendation.reasonCode}:${(recommendation.accountName || '').toLowerCase()}`;
      if (seen.has(dedupeKey)) return false;
      seen.add(dedupeKey);
      return true;
    })
    .slice(0, MAX_ALERT_SUGGESTIONS)
    .map((recommendation) => ({
      key: alertSuggestionKey(recommendation),
      kind: 'alert' as const,
      tag: recommendation.accountName || 'Unknown account',
      label: ALERT_LABEL[recommendation.reasonCode] || condensePlanLabel(recommendation.recommendedAction),
      // The engine's own sentence, which names the evidence and the threshold.
      reason: recommendation.reasonText,
      evidence: recommendation.recommendedAction,
      suggestedDate: alertDate(recommendation.severity, input.rangeStart, input.rangeEnd, input.today),
      sourceActivityId: '',
      linkedOpportunityId: recommendation.opportunityId || undefined,
      linkedAccountName: recommendation.accountName || undefined,
      severity: recommendation.severity,
      reasonCode: recommendation.reasonCode,
      href: recommendation.href,
    }));
}

/**
 * Stable across rebuilds: the recommendation id is built from the record that
 * raised it, so accepting or dismissing an alert sticks even after the policy
 * engine re-runs.
 */
function alertSuggestionKey(recommendation: Recommendation) {
  return `sug:alert:${recommendation.id}`;
}

function alertDate(severity: Severity, rangeStart: string, rangeEnd: string, today?: string) {
  // Never propose a day that has already gone. Planning the current week on a
  // Thursday, a critical alert belongs on Thursday, not on Monday.
  const floor = today && compareSafeBusinessDate(today, rangeStart) > 0
    && compareSafeBusinessDate(today, rangeEnd) <= 0
    ? today
    : rangeStart;
  return clampToRange(addDays(floor, ALERT_DAY_OFFSET[severity]), floor, rangeEnd);
}

export function planSuggestionKindLabel(kind: PlanSuggestionKind) {
  return {
    alert: 'At risk',
    'due-next-action': 'Promised',
    'undated-next-action': 'Undated',
    'open-risk': 'Risk open',
    'quiet-after-touch': 'Gone quiet',
  }[kind];
}

export function planSuggestionKindTone(kind: PlanSuggestionKind) {
  return {
    alert: 'bg-red-50 text-red-700',
    'due-next-action': 'bg-blue-50 text-brand-blue',
    'undated-next-action': 'bg-amber-50 text-amber-800',
    'open-risk': 'bg-red-50 text-red-700',
    'quiet-after-touch': 'bg-gray-100 text-gray-600',
  }[kind];
}

function hasLaterTouch(
  activity: SalesActivityRecord,
  activities: SalesActivityRecord[],
  accountName: string,
) {
  if (!accountName) return false;
  return activities.some((other) => {
    if (other.id === activity.id) return false;
    if (!isValidBusinessDate(other.activityDate)) return false;
    if (compareSafeBusinessDate(other.activityDate, activity.activityDate) <= 0) return false;
    const otherAccount = other.linkedAccountName || other.accountName || '';
    return Boolean(otherAccount) && sameAccount(otherAccount, accountName);
  });
}

// condensePlanLabel now lives with the board it feeds (weeklyPlan.ts) and is
// re-exported here so existing importers keep working unchanged.
export { condensePlanLabel } from './weeklyPlan.ts';

function firstNonEmpty(values?: string[]) {
  return (values || []).map((value) => (value || '').trim()).find(Boolean) || '';
}

function clampToRange(dateKey: string, start: string, end: string) {
  if (compareSafeBusinessDate(dateKey, start) < 0) return start;
  if (compareSafeBusinessDate(dateKey, end) > 0) return end;
  return dateKey;
}

function addDays(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, (month || 1) - 1, (day || 1) + days);
  const nextYear = date.getFullYear();
  const nextMonth = String(date.getMonth() + 1).padStart(2, '0');
  const nextDay = String(date.getDate()).padStart(2, '0');
  return `${nextYear}-${nextMonth}-${nextDay}`;
}
