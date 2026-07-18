import type { CrmLiteOpportunity } from '../services/opportunityStore';
import type { SalesActivityRecord } from '../services/salesActivityStore';
import type { SalesActivityType } from './salesActivityClassifier';
import type { PlanRecord } from './weeklyPlan.ts';
import { sameAccount } from './accountIdentity.ts';
import {
  compareSafeBusinessDate,
  formatSafeBusinessDate,
  isBusinessDateInRange,
  isValidBusinessDate,
} from './safeDate.ts';

/**
 * What last week is asking of this one.
 *
 * The activity ledger already knows a call happened, that a next action was
 * written down, or that a thread went quiet straight after a demo. None of that
 * reaches the plan board on its own, so the seller has to remember it. These
 * suggestions read the ledger and propose the follow-up - with the captured
 * evidence attached, so the operator can judge it in a second rather than
 * trusting it.
 *
 * A suggestion is never work. It becomes work only when the operator accepts
 * it, and a refusal is recorded so the same thing is not proposed twice.
 */

export type PlanSuggestionKind =
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
  sourceActivityId: string;
  linkedOpportunityId?: string;
  linkedAccountName?: string;
};

const MAX_SUGGESTIONS = 6;

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
  /** How far back to read the ledger. Defaults to the 14 days before the week. */
  lookbackDays?: number;
}): PlanSuggestion[] {
  const lookbackDays = input.lookbackDays ?? 14;
  const lookbackStart = addDays(input.rangeStart, -lookbackDays);
  const lookbackEnd = addDays(input.rangeStart, -1);

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

    if (nextAction && isValidBusinessDate(activity.dueDate)) {
      // Dated inside the week being planned: the seller already said when.
      if (isBusinessDateInRange(activity.dueDate, input.rangeStart, input.rangeEnd)) {
        suggestions.push({
          ...base,
          key: `sug:due:${activity.id}:${activity.dueDate}`,
          kind: 'due-next-action',
          label: condensePlanLabel(nextAction),
          reason: `You promised this for ${formatSafeBusinessDate(activity.dueDate)}.`,
          evidence: `Captured from your ${touchLabel}.`,
          suggestedDate: activity.dueDate,
        });
      }
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
    'due-next-action': 0,
    'undated-next-action': 1,
    'open-risk': 2,
    'quiet-after-touch': 3,
  };

  const seen = new Set<string>();
  return suggestions
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
    .slice(0, MAX_SUGGESTIONS);
}

export function planSuggestionKindLabel(kind: PlanSuggestionKind) {
  return {
    'due-next-action': 'Promised',
    'undated-next-action': 'Undated',
    'open-risk': 'Risk open',
    'quiet-after-touch': 'Gone quiet',
  }[kind];
}

export function planSuggestionKindTone(kind: PlanSuggestionKind) {
  return {
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

/**
 * A captured next action is often a paragraph. A plan item has to be readable
 * at a glance in a narrow column, so take the first sentence and cap it - the
 * full text stays on the activity, which the suggestion cites.
 */
const MAX_LABEL_LENGTH = 80;

export function condensePlanLabel(rawLabel: string) {
  const trimmed = (rawLabel || '').trim().replace(/\s+/g, ' ');
  if (!trimmed) return '';

  const firstSentence = /^(.+?[.!?])\s+\S/.exec(trimmed)?.[1] || trimmed;
  const candidate = firstSentence.replace(/[.\s]+$/, '');
  if (candidate.length <= MAX_LABEL_LENGTH) return candidate;

  const clipped = candidate.slice(0, MAX_LABEL_LENGTH);
  const lastSpace = clipped.lastIndexOf(' ');
  return `${(lastSpace > 40 ? clipped.slice(0, lastSpace) : clipped).replace(/[,;:\s]+$/, '')}...`;
}

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
