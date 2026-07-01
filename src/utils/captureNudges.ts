import type { ActionOutcomeRecord } from '../services/actionOutcomeStore';
import type { CrmLiteOpportunity } from '../services/opportunityStore';
import { compareSafeBusinessDate, formatSafeBusinessDate, isBusinessDateOverdue, isValidBusinessDate } from './safeDate.ts';
import type { ObjectionRecord } from '../services/objectionStore';
import type { SalesActivityRecord } from '../services/salesActivityStore';
import type { StakeholderRecord } from '../services/stakeholderStore';
import { normalizeMeddicRole } from './meddicStakeholderMap.ts';

export type CaptureNudge = {
  id: string;
  title: string;
  reason: string;
  accountName: string;
  opportunityName: string;
  sourceType: 'Stale Next Action' | 'Objection' | 'Stakeholder Gap' | 'Unclear Outcome' | 'No Recent Activity';
  priority: 'High' | 'Medium' | 'Low';
  href: string;
};

export function buildCaptureNudges(input: {
  opportunities: CrmLiteOpportunity[];
  activities: SalesActivityRecord[];
  objections: ObjectionRecord[];
  stakeholders: StakeholderRecord[];
  actionOutcomes: ActionOutcomeRecord[];
  limit?: number;
}): CaptureNudge[] {
  const limit = input.limit || 5;
  const activeOpportunities = input.opportunities.filter((opportunity) => opportunity.status === 'Active');
  const today = todayKey();
  const nudges: CaptureNudge[] = [];

  input.objections
    .filter((objection) => objection.status === 'Open')
    .filter((objection) => objection.impact === 'High' || objection.impact === 'Medium')
    .slice(0, 3)
    .forEach((objection) => {
      nudges.push(makeNudge({
        id: `objection-${objection.id}`,
        title: 'Capture latest objection response',
        reason: `${objection.objectionType}: ${objection.objectionText}`,
        accountName: objection.accountName,
        opportunityName: objection.opportunityName,
        sourceType: 'Objection',
        priority: objection.impact === 'High' ? 'High' : 'Medium',
      }));
    });

  activeOpportunities
    .filter((opportunity) => isBusinessDateOverdue(opportunity.nextActionDate, today))
    .slice(0, 3)
    .forEach((opportunity) => {
      nudges.push(makeNudge({
        id: `stale-${opportunity.id}`,
        title: 'Capture what happened with the stale next action',
        reason: opportunity.nextAction || `Next action was due ${formatSafeBusinessDate(opportunity.nextActionDate)}.`,
        accountName: opportunity.accountName,
        opportunityName: opportunity.opportunityName,
        sourceType: 'Stale Next Action',
        priority: 'High',
      }));
    });

  activeOpportunities
    .filter((opportunity) => hasStakeholderGap(opportunity, input.stakeholders))
    .slice(0, 3)
    .forEach((opportunity) => {
      nudges.push(makeNudge({
        id: `stakeholder-gap-${opportunity.id}`,
        title: 'Capture stakeholder update',
        reason: 'Champion or economic buyer is not clearly mapped yet.',
        accountName: opportunity.accountName,
        opportunityName: opportunity.opportunityName,
        sourceType: 'Stakeholder Gap',
        priority: 'Medium',
      }));
    });

  input.actionOutcomes
    .filter((outcome) => outcome.outcomeType === 'Still unclear' || outcome.outcomeType === 'Worsened')
    .slice(0, 3)
    .forEach((outcome) => {
      nudges.push(makeNudge({
        id: `unclear-outcome-${outcome.id}`,
        title: 'Capture outcome follow-up',
        reason: `${outcome.actionTitle}: ${outcome.outcomeType}`,
        accountName: outcome.accountName,
        opportunityName: outcome.opportunityName,
        sourceType: 'Unclear Outcome',
        priority: outcome.outcomeType === 'Worsened' ? 'High' : 'Medium',
      }));
    });

  activeOpportunities
    .filter((opportunity) => daysSinceLastActivity(opportunity, input.activities) >= 14)
    .slice(0, 3)
    .forEach((opportunity) => {
      nudges.push(makeNudge({
        id: `quiet-${opportunity.id}`,
        title: 'Capture latest account touch',
        reason: 'No recent captured activity for this active opportunity.',
        accountName: opportunity.accountName,
        opportunityName: opportunity.opportunityName,
        sourceType: 'No Recent Activity',
        priority: 'Low',
      }));
    });

  return dedupeNudges(nudges)
    .sort((a, b) => priorityRank(b.priority) - priorityRank(a.priority))
    .slice(0, limit);
}

function makeNudge(input: Omit<CaptureNudge, 'href'>): CaptureNudge {
  return {
    ...input,
    href: `/app/capture?mode=quick&account=${encodeURIComponent(input.accountName)}&opportunity=${encodeURIComponent(input.opportunityName)}`,
  };
}

function hasStakeholderGap(opportunity: CrmLiteOpportunity, stakeholders: StakeholderRecord[]) {
  const related = stakeholders.filter((stakeholder) => (
    stakeholder.opportunityId === opportunity.id ||
    (
      normalize(stakeholder.accountName) === normalize(opportunity.accountName) &&
      (!stakeholder.opportunityName || normalize(stakeholder.opportunityName) === normalize(opportunity.opportunityName))
    )
  ));
  const hasChampion = related.some((stakeholder) => normalizeMeddicRole(stakeholder.stakeholderRole) === 'Champion');
  const hasEconomicBuyer = related.some((stakeholder) => normalizeMeddicRole(stakeholder.stakeholderRole) === 'Economic Buyer' || normalizeMeddicRole(stakeholder.stakeholderRole) === 'Decision Committee');
  return !hasChampion || !hasEconomicBuyer;
}

function daysSinceLastActivity(opportunity: CrmLiteOpportunity, activities: SalesActivityRecord[]) {
  const related = activities
    .filter((activity) => (
      activity.linkedOpportunityId === opportunity.id ||
      (
        normalize(activity.accountName || activity.linkedAccountName) === normalize(opportunity.accountName) &&
        (!activity.opportunityName || normalize(activity.opportunityName || activity.linkedOpportunityName) === normalize(opportunity.opportunityName))
      )
    ))
    .filter((activity) => isValidBusinessDate(activity.activityDate))
    .sort((a, b) => compareSafeBusinessDate(b.activityDate, a.activityDate));
  if (related.length === 0) return 999;
  const latest = new Date(`${related[0].activityDate}T00:00:00`).getTime();
  const now = new Date(`${todayKey()}T00:00:00`).getTime();
  return Math.floor((now - latest) / 86400000);
}

function dedupeNudges(nudges: CaptureNudge[]) {
  const seen = new Set<string>();
  return nudges.filter((nudge) => {
    const key = `${nudge.sourceType}-${normalize(nudge.accountName)}-${normalize(nudge.opportunityName)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function priorityRank(priority: CaptureNudge['priority']) {
  return priority === 'High' ? 3 : priority === 'Medium' ? 2 : 1;
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}
