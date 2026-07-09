import type { CrmLiteOpportunity } from '../services/opportunityStore.ts';
import type { OpportunityOutcomeRecord } from '../services/opportunityOutcomeStore.ts';
import type { SalesActivityRecord } from '../services/salesActivityStore.ts';
import { sumMoneyInBase } from './money.ts';
import {
  compareSafeBusinessDate,
  isValidBusinessDate,
  sanitizeBusinessDate,
  timestampToLocalDateKey,
  todayDateKey,
} from './safeDate.ts';

export const FOLLOW_UP_IMPACT_WINDOW_DAYS = 30;
export const FOLLOW_UP_QUIET_THRESHOLD_DAYS = 7;

export type FollowUpImpactStatus = 'won' | 'revived' | 'protected' | 'waiting';

export type FollowUpImpactEvent = {
  opportunityId: string;
  accountName: string;
  opportunityName: string;
  followUpDate: string;
  daysQuietBefore: number | null;
  status: FollowUpImpactStatus;
  evidence: string;
  amount: number | null;
  currency: string;
};

export type FollowUpImpactSummary = {
  windowDays: number;
  followUpsSent: number;
  quietDealsContacted: number;
  dealsRevived: number;
  dealsWon: number;
  dealsProtected: number;
  dealsWaiting: number;
  valueBackInMotionBase: number;
  events: FollowUpImpactEvent[];
};

type FollowUpImpactInput = {
  activities: SalesActivityRecord[];
  opportunities: CrmLiteOpportunity[];
  opportunityOutcomes?: OpportunityOutcomeRecord[];
  today?: string;
  windowDays?: number;
  eventLimit?: number;
};

/**
 * Measures whether logged follow-ups actually brought quiet deals back:
 * for every follow-up touch in the window, was the deal quiet beforehand,
 * and did the customer conversation continue afterwards? This is the
 * evidence side of "Catch deals before they go silent" - detection and
 * drafting live elsewhere; this proves the loop pays for itself.
 */
export function buildFollowUpImpact(input: FollowUpImpactInput): FollowUpImpactSummary {
  const today = sanitizeBusinessDate(input.today) || todayDateKey();
  const windowDays = input.windowDays ?? FOLLOW_UP_IMPACT_WINDOW_DAYS;
  const windowStart = addDays(today, -windowDays);
  const eventLimit = input.eventLimit ?? 4;
  const outcomes = input.opportunityOutcomes || [];

  const opportunityById = new Map(input.opportunities.map((opportunity) => [opportunity.id, opportunity]));
  const opportunitiesByAccount = new Map<string, CrmLiteOpportunity[]>();
  input.opportunities.forEach((opportunity) => {
    const key = normalize(opportunity.accountName);
    if (!key) return;
    opportunitiesByAccount.set(key, [...(opportunitiesByAccount.get(key) || []), opportunity]);
  });

  const followUps = input.activities
    .filter((activity) => isFollowUpTouch(activity))
    .filter((activity) => isValidBusinessDate(activity.activityDate)
      && compareSafeBusinessDate(activity.activityDate, windowStart) >= 0
      && compareSafeBusinessDate(activity.activityDate, today) <= 0);

  const events: FollowUpImpactEvent[] = [];
  const seenOpportunities = new Set<string>();
  let followUpsSent = 0;
  let quietDealsContacted = 0;

  followUps
    .sort((a, b) => compareSafeBusinessDate(b.activityDate, a.activityDate))
    .forEach((followUp) => {
      followUpsSent += 1;
      const opportunity = resolveOpportunity(followUp, opportunityById, opportunitiesByAccount);
      if (!opportunity || seenOpportunities.has(opportunity.id)) return;
      seenOpportunities.add(opportunity.id);

      const daysQuietBefore = quietDaysBefore(followUp, opportunity, input.activities);
      const wasQuiet = daysQuietBefore !== null && daysQuietBefore >= FOLLOW_UP_QUIET_THRESHOLD_DAYS;
      if (wasQuiet) quietDealsContacted += 1;

      const { status, evidence } = classifyAfterFollowUp(followUp, opportunity, input.activities, outcomes, today);
      events.push({
        opportunityId: opportunity.id,
        accountName: opportunity.accountName || followUp.accountName || 'Needs confirmation',
        opportunityName: opportunity.opportunityName || followUp.opportunityName || 'Needs confirmation',
        followUpDate: followUp.activityDate,
        daysQuietBefore,
        status,
        evidence,
        amount: opportunity.estimatedValue ?? opportunity.fy26Value ?? null,
        currency: opportunity.currency || '',
      });
    });

  const backInMotion = events.filter((event) => event.status !== 'waiting');
  return {
    windowDays,
    followUpsSent,
    quietDealsContacted,
    dealsRevived: events.filter((event) => event.status === 'revived').length,
    dealsWon: events.filter((event) => event.status === 'won').length,
    dealsProtected: events.filter((event) => event.status === 'protected').length,
    dealsWaiting: events.filter((event) => event.status === 'waiting').length,
    valueBackInMotionBase: sumMoneyInBase(backInMotion.map((event) => ({ amount: event.amount || 0, currency: event.currency }))),
    events: events.slice(0, eventLimit),
  };
}

export function followUpImpactStatusLabel(status: FollowUpImpactStatus) {
  if (status === 'won') return 'Won after follow-up';
  if (status === 'revived') return 'Conversation revived';
  if (status === 'protected') return 'Next touch booked';
  return 'Waiting on reply';
}

function isFollowUpTouch(activity: SalesActivityRecord) {
  return activity.activityType === 'Follow-up'
    || (Array.isArray(activity.tags) && activity.tags.includes('follow-up'));
}

function resolveOpportunity(
  activity: SalesActivityRecord,
  byId: Map<string, CrmLiteOpportunity>,
  byAccount: Map<string, CrmLiteOpportunity[]>,
) {
  if (activity.linkedOpportunityId && byId.has(activity.linkedOpportunityId)) {
    return byId.get(activity.linkedOpportunityId) || null;
  }
  const accountKey = normalize(activity.accountName) || normalize(activity.linkedAccountName);
  if (!accountKey) return null;
  const candidates = byAccount.get(accountKey) || [];
  const nameKey = normalize(activity.opportunityName) || normalize(activity.linkedOpportunityName);
  if (nameKey) {
    const named = candidates.find((opportunity) => normalize(opportunity.opportunityName) === nameKey);
    if (named) return named;
  }
  // A single-deal account is unambiguous even without an explicit link.
  return candidates.length === 1 ? candidates[0] : null;
}

function quietDaysBefore(
  followUp: SalesActivityRecord,
  opportunity: CrmLiteOpportunity,
  activities: SalesActivityRecord[],
) {
  const previousTouch = touchesForOpportunity(opportunity, activities)
    .filter((activity) => activity.id !== followUp.id
      && compareSafeBusinessDate(activity.activityDate, followUp.activityDate) < 0)
    .map((activity) => activity.activityDate)
    .sort(compareSafeBusinessDate)
    .at(-1);
  const quietSince = previousTouch || sanitizeBusinessDate(timestampToLocalDateKey(opportunity.createdAt));
  return daysBetween(quietSince, followUp.activityDate);
}

function classifyAfterFollowUp(
  followUp: SalesActivityRecord,
  opportunity: CrmLiteOpportunity,
  activities: SalesActivityRecord[],
  outcomes: OpportunityOutcomeRecord[],
  today: string,
): { status: FollowUpImpactStatus; evidence: string } {
  const wonOutcome = outcomes.find((outcome) => outcome.opportunityId === opportunity.id
    && outcome.outcome === 'Won'
    && compareSafeBusinessDate(outcome.outcomeDate, followUp.activityDate) >= 0);
  if (wonOutcome || opportunity.status === 'Won') {
    return { status: 'won', evidence: wonOutcome ? `Marked won on ${wonOutcome.outcomeDate}.` : 'Deal marked won.' };
  }

  const laterTouch = touchesForOpportunity(opportunity, activities)
    .filter((activity) => activity.id !== followUp.id && !isFollowUpTouch(activity)
      && compareSafeBusinessDate(activity.activityDate, followUp.activityDate) > 0)
    .sort((a, b) => compareSafeBusinessDate(a.activityDate, b.activityDate))
    .at(0);
  if (laterTouch) {
    return { status: 'revived', evidence: `New customer touch on ${laterTouch.activityDate}.` };
  }

  if (isValidBusinessDate(opportunity.nextActionDate)
    && compareSafeBusinessDate(opportunity.nextActionDate, today) >= 0) {
    return { status: 'protected', evidence: `Next touch booked for ${opportunity.nextActionDate}.` };
  }

  return { status: 'waiting', evidence: 'No customer touch since the follow-up yet.' };
}

function touchesForOpportunity(opportunity: CrmLiteOpportunity, activities: SalesActivityRecord[]) {
  const accountKey = normalize(opportunity.accountName);
  return activities.filter((activity) => isValidBusinessDate(activity.activityDate)
    && (activity.linkedOpportunityId === opportunity.id
      || (accountKey !== ''
        && (normalize(activity.accountName) === accountKey || normalize(activity.linkedAccountName) === accountKey))));
}

function daysBetween(start: string, end: string) {
  if (!isValidBusinessDate(start) || !isValidBusinessDate(end)) return null;
  const elapsed = Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`);
  return Math.floor(elapsed / 86_400_000);
}

function addDays(dateKey: string, days: number) {
  const parsed = Date.parse(`${dateKey}T00:00:00Z`);
  const shifted = new Date(parsed + days * 86_400_000);
  return shifted.toISOString().slice(0, 10);
}

function normalize(value?: string) {
  return (value || '').trim().toLowerCase();
}
