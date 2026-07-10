import type { ObjectionRecord } from '../services/objectionStore.ts';
import type { CrmLiteOpportunity } from '../services/opportunityStore.ts';
import type { QuoteRecord } from '../services/quoteStore.ts';
import type { SalesActivityRecord } from '../services/salesActivityStore.ts';
import { buildMoneyFlow } from './moneyFlow.ts';
import { classifyOpportunitySilence } from './proactiveNudges.ts';
import { compareSafeBusinessDate, formatSafeBusinessDate, isValidBusinessDate, sanitizeBusinessDate, todayDateKey } from './safeDate.ts';

export type CommercialJourneySnapshot = {
  position: string;
  positionSource: 'money-flow' | 'stage';
  lastTouch: { date: string; summary: string } | null;
  daysQuiet: number | null;
  evidence: string;
  blocker: string;
  nextCommitment: { action: string; date: string } | null;
  moneyStatus: string;
  riskStatus: string;
};

type JourneyInput = {
  opportunity: CrmLiteOpportunity;
  quotes: QuoteRecord[];
  activities: SalesActivityRecord[];
  objections: ObjectionRecord[];
  today?: string;
};

/**
 * The journey read-model (Commercial OS direction 7.3): where a deal sits
 * and why, derived entirely from existing state - stage, quote lifecycle,
 * captured touches, objections, commitments. No rigid pipeline is stored;
 * once a quote exists the money flow speaks for the journey tail
 * (Quoted -> PO -> Delivery -> Payment), otherwise the sales stage speaks
 * for the head. Renders the same for B2B and solo journeys because both
 * are just states over activities.
 */
export function buildCommercialJourneySnapshot(input: JourneyInput): CommercialJourneySnapshot {
  const today = sanitizeBusinessDate(input.today) || todayDateKey();
  const { opportunity } = input;

  const flow = buildMoneyFlow({ opportunities: [opportunity], quotes: input.quotes, today });
  const accountKey = normalize(opportunity.accountName);
  const moneyThread = flow.threads.find((thread) => thread.id !== `opp-${opportunity.id}`
    && normalize(thread.accountName) === accountKey) || null;

  const silence = classifyOpportunitySilence(opportunity, input.activities, today);
  const lastTouchActivity = input.activities
    .filter((activity) => isValidBusinessDate(activity.activityDate)
      && (activity.linkedOpportunityId === opportunity.id
        || (accountKey !== ''
          && (normalize(activity.accountName) === accountKey || normalize(activity.linkedAccountName) === accountKey))))
    .sort((a, b) => compareSafeBusinessDate(b.activityDate, a.activityDate))[0] || null;

  const openObjection = input.objections
    .filter((objection) => objection.status === 'Open'
      && (objection.opportunityId === opportunity.id || normalize(objection.accountName) === accountKey))
    .sort((a, b) => (a.impact === 'High' ? -1 : 1) - (b.impact === 'High' ? -1 : 1))[0] || null;

  return {
    position: moneyThread ? moneyThread.stage : opportunity.stage,
    positionSource: moneyThread ? 'money-flow' : 'stage',
    lastTouch: lastTouchActivity
      ? { date: lastTouchActivity.activityDate, summary: lastTouchActivity.summary }
      : null,
    daysQuiet: silence.daysQuiet,
    evidence: opportunity.evidence || '',
    blocker: openObjection?.objectionText || opportunity.objectionDebt || '',
    nextCommitment: opportunity.nextAction || isValidBusinessDate(opportunity.nextActionDate)
      ? { action: opportunity.nextAction || 'Next action', date: opportunity.nextActionDate }
      : null,
    moneyStatus: moneyThread
      ? `${moneyThread.stage}${moneyThread.stuck ? ` - stuck: ${moneyThread.stuckReason}` : ''}`
      : 'No quote yet',
    riskStatus: buildRiskStatus(silence.status, silence.daysQuiet, opportunity),
  };
}

function buildRiskStatus(
  silenceStatus: ReturnType<typeof classifyOpportunitySilence>['status'],
  daysQuiet: number | null,
  opportunity: CrmLiteOpportunity,
) {
  const parts: string[] = [];
  if (silenceStatus === 'silent') parts.push(`Going silent (quiet ${daysQuiet}d)`);
  else if (silenceStatus === 'at-risk') parts.push(`Silence risk (quiet ${daysQuiet}d)`);
  if (opportunity.forecastEvidenceCategory === 'Hope-based' || opportunity.forecastEvidenceCategory === 'Unsupported') {
    parts.push(`${opportunity.forecastEvidenceCategory} forecast`);
  }
  return parts.join('; ') || 'No active risk signal';
}

export function formatJourneyCommitment(commitment: CommercialJourneySnapshot['nextCommitment']) {
  if (!commitment) return 'No next commitment';
  return commitment.date ? `${commitment.action} - ${formatSafeBusinessDate(commitment.date)}` : commitment.action;
}

function normalize(value?: string) {
  return (value || '').trim().toLowerCase();
}
