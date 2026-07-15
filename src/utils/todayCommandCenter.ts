import type { CrmLiteOpportunity } from '../services/opportunityStore';
import type { SalesActivityRecord } from '../services/salesActivityStore';
import type { StakeholderRecord } from '../services/stakeholderStore';
import type { ObjectionRecord } from '../services/objectionStore';
import type { AccountMemoryRecord } from '../services/accountStore';
import type { QuoteRecord } from '../services/quoteStore';
import type { OpportunityOutcomeRecord } from '../services/opportunityOutcomeStore';
import type { RevenueActionItem } from './revenueView';
import type { PipelineDefenseBrief } from './pipelineDefenseStorage';
import { buildPipelineDefenseCenter, type ManagerReadyDealBrief } from './pipelineDefenseCenter.ts';
import { convertMoney, formatBaseCurrencyAmount, formatCurrencyAmount } from './money.ts';
import { compareSafeBusinessDate, formatSafeBusinessDate, isBusinessDateOverdue, isValidBusinessDate, sanitizeBusinessDate, todayDateKey } from './safeDate.ts';
import { classifyAccountEngagement, type AccountHygienePreference } from './accountHygiene.ts';
import { analyzePersonalSalesLearning } from './personalSalesLearning.ts';
import { normalizeMeddicRole } from './meddicStakeholderMap.ts';

export type TodayActionSource = 'Pipeline Defense' | 'Revenue' | 'Opportunity' | 'Capture';
export type TodayActionUrgency = 'Critical' | 'High' | 'Medium' | 'Low';

export type TodayCommandAction = {
  id: string;
  title: string;
  accountName: string;
  opportunityName: string;
  reason: string;
  source: TodayActionSource;
  urgency: TodayActionUrgency;
  href: string;
  dueDate: string;
  dueDateLabel: string;
  moneyLabel: string;
  rank: number;
};

export type TodayCaptureInboxItem = {
  id: string;
  summary: string;
  accountName: string;
  opportunityName: string;
  reason: string;
  href: string;
  activityDateLabel: string;
};

export function buildUnifiedTodayCommandCenter(input: {
  briefs: PipelineDefenseBrief[];
  revenueActions: RevenueActionItem[];
  opportunities: CrmLiteOpportunity[];
  activities: SalesActivityRecord[];
  stakeholders?: StakeholderRecord[];
  objections?: ObjectionRecord[];
  accounts?: AccountMemoryRecord[];
  quotes?: QuoteRecord[];
  accountPreferences?: AccountHygienePreference[];
  opportunityOutcomes?: OpportunityOutcomeRecord[];
  today?: string;
}) {
  const today = isValidBusinessDate(input.today) ? input.today : todayDateKey();
  const latestBrief = [...input.briefs].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
  const pipelineReadiness = buildPipelineDefenseCenter(latestBrief?.deals || [], today, input.opportunityOutcomes || []);
  const personalLearning = analyzePersonalSalesLearning({
    outcomes: input.opportunityOutcomes || [],
    opportunities: input.opportunities,
    deals: latestBrief?.deals || [],
  });
  const pipelineActions = pipelineReadiness.items.flatMap((item) => buildPipelineAction(item));
  const revenueActions = input.revenueActions.map(buildRevenueAction);
  const opportunityActions = buildOpportunityActions(input.opportunities, input.activities, input.stakeholders || [], input.objections || [], today);
  const captureInbox = buildCaptureInbox(input.activities);
  const accountClassifications = (input.accounts || []).map((account) => ({
    account,
    classification: classifyAccountEngagement({
      account,
      opportunities: input.opportunities,
      activities: input.activities,
      objections: input.objections || [],
      quotes: input.quotes || [],
      preference: input.accountPreferences?.find((item) => item.accountId === account.id),
      today,
    }),
  }));
  const importedAccountsHidden = accountClassifications.filter((item) => item.classification.status === 'Imported only').length;
  const suppressedAccounts = new Set(accountClassifications
    .filter((item) => item.classification.status === 'Imported only' || item.classification.status === 'Archived')
    .map((item) => normalize(item.account.accountName)));
  const captureActions = captureInbox.map((item, index): TodayCommandAction => ({
    id: `capture-${item.id}`,
    title: item.reason,
    accountName: item.accountName,
    opportunityName: item.opportunityName,
    reason: item.summary,
    source: 'Capture',
    urgency: index === 0 ? 'High' : 'Medium',
    href: item.href,
    dueDate: '',
    dueDateLabel: formatSafeBusinessDate(''),
    moneyLabel: '',
    rank: 72 - index,
  }));
  const rankedActions = [...pipelineActions, ...revenueActions, ...opportunityActions, ...captureActions]
    .filter((action) => action.source === 'Capture' || !suppressedAccounts.has(normalize(action.accountName)))
    .sort(compareTodayActions);
  const allActions = dedupeActions(rankedActions).sort(compareTodayActions);

  return {
    readinessScore: pipelineReadiness.readinessScore,
    defendableDeals: pipelineReadiness.defendableDeals,
    rescueDeals: pipelineReadiness.rescueDeals,
    downgradeCandidates: pipelineReadiness.downgradeCandidates,
    overdueActions: allActions.filter((action) => isBusinessDateOverdue(action.dueDate, today)).length,
    missingEvidenceGaps: pipelineReadiness.topMissingEvidenceGaps,
    topActions: allActions.slice(0, 3),
    allActions,
    pipelineReadiness,
    commercialRiskItems: input.revenueActions.slice(0, 5),
    captureInbox,
    importedAccountsHidden,
    learningNudge: personalLearning.todayNudge,
    learningLowDataMessage: personalLearning.hasEnoughData ? '' : personalLearning.lowDataMessage,
    // The starter sample brief is a template, not the user's work - it must
    // not count as real data, or a brand-new workspace never sees Start here.
    hasMeaningfulData: Boolean(
      (latestBrief && !latestBrief.isSample && latestBrief.deals.length)
      || input.opportunities.some((opportunity) => opportunity.status === 'Active')
      || input.revenueActions.length
      || input.activities.length
    ),
  };
}

function buildPipelineAction(item: ManagerReadyDealBrief): TodayCommandAction[] {
  if (item.category === 'Defend now') return [];
  const urgency: TodayActionUrgency = item.category === 'Downgrade / de-risk' ? 'Critical' : item.category === 'Rescue before review' ? 'High' : 'Medium';
  const rank = item.category === 'Downgrade / de-risk' ? 98 : item.category === 'Rescue before review' ? 94 : item.category === 'Missing evidence' ? 88 : 78;
  return [{
    id: `defense-${item.deal.id}`,
    title: item.category === 'Downgrade / de-risk'
      ? `De-risk ${item.opportunity}`
      : item.category === 'Rescue before review'
        ? item.nextAction
        : `Close evidence gap for ${item.opportunity}`,
    accountName: item.account,
    opportunityName: item.opportunity,
    reason: item.missingContext[0]
      ? `${item.category}: ${item.missingContext[0]} is still unresolved.`
      : `${item.category}: the forecast position needs review.` ,
    source: 'Pipeline Defense',
    urgency,
    href: '/app/pipeline-defense',
    dueDate: sanitizeBusinessDate(item.deal.nextActionDate),
    dueDateLabel: item.dueDateLabel,
    moneyLabel: item.moneyLabel,
    rank,
  }];
}

function buildRevenueAction(item: RevenueActionItem): TodayCommandAction {
  const critical = /overdue|expired/i.test(item.risk);
  const dueDate = sanitizeBusinessDate(item.dueDate);
  return {
    id: `revenue-${item.id}`,
    title: item.nextAction || `Review ${item.risk.toLowerCase()}`,
    accountName: cleanOrConfirm(item.accountName),
    opportunityName: cleanOrConfirm(item.label),
    reason: `${item.risk}: ${item.status || 'commercial status needs confirmation'}.`,
    source: 'Revenue',
    urgency: critical ? 'Critical' : 'High',
    href: item.href,
    dueDate,
    dueDateLabel: formatSafeBusinessDate(dueDate),
    moneyLabel: formatMoney(item.amount, item.currency),
    rank: critical ? 100 : 90,
  };
}

function buildOpportunityActions(
  opportunities: CrmLiteOpportunity[],
  activities: SalesActivityRecord[],
  stakeholders: StakeholderRecord[],
  objections: ObjectionRecord[],
  today: string,
) {
  return opportunities.filter((opportunity) => opportunity.status === 'Active').flatMap<TodayCommandAction>((opportunity) => {
    const latestSignal = latestOpportunitySignal(opportunity, activities);
    const openObjection = objections.find((item) => item.status === 'Open' && matchesOpportunity(item, opportunity));
    const hasChampion = stakeholders.some((item) => normalizeMeddicRole(item.stakeholderRole) === 'Champion' && matchesOpportunity(item, opportunity));
    const dueDate = sanitizeBusinessDate(opportunity.nextActionDate);
    const common = {
      accountName: cleanOrConfirm(opportunity.accountName),
      opportunityName: cleanOrConfirm(opportunity.opportunityName),
      href: '/app/opportunities',
      dueDate,
      dueDateLabel: formatSafeBusinessDate(opportunity.nextActionDate),
      moneyLabel: formatMoney(opportunity.estimatedValue, opportunity.currency),
      source: 'Opportunity' as const,
    };
    if (isBusinessDateOverdue(dueDate, today)) return [{
      ...common, id: `opportunity-overdue-${opportunity.id}`, title: opportunity.nextAction.trim() || 'Confirm overdue next action',
      reason: 'The customer next action is overdue.', urgency: 'Critical' as const, rank: 97,
    }];
    if (openObjection) return [{
      ...common, id: `opportunity-objection-${opportunity.id}`, title: openObjection.responsePlan.trim() || openObjection.requiredProof.trim() || 'Resolve open objection',
      reason: `${openObjection.impact} impact objection remains open.`, urgency: openObjection.impact === 'High' ? 'Critical' as const : 'High' as const, rank: openObjection.impact === 'High' ? 96 : 86,
    }];
    if (opportunity.forecastEvidenceCategory === 'Unsupported' || !opportunity.evidence.trim()) return [{
      ...common, id: `opportunity-evidence-${opportunity.id}`, title: 'Capture customer evidence',
      reason: 'The opportunity has weak or missing forecast evidence.', urgency: 'High' as const, rank: 84,
    }];
    if (!hasChampion) return [{
      ...common, id: `opportunity-champion-${opportunity.id}`, title: 'Confirm a customer champion',
      reason: 'No champion is linked to this active opportunity.', urgency: 'Medium' as const, rank: 76,
    }];
    if (!isRecent(latestSignal, today)) return [{
      ...common, id: `opportunity-signal-${opportunity.id}`, title: opportunity.nextAction.trim() || 'Re-establish customer signal',
      reason: 'No recent customer signal is captured.', urgency: 'Medium' as const, rank: 74,
    }];
    return [];
  });
}

function buildCaptureInbox(activities: SalesActivityRecord[]): TodayCaptureInboxItem[] {
  return [...activities]
    .filter((activity) => activity.linkStatus === 'Unlinked' || activity.linkStatus === 'Suggested' || !activity.accountName.trim() || !activity.opportunityName.trim())
    .sort((left, right) => compareSafeBusinessDate(right.activityDate, left.activityDate) || right.createdAt.localeCompare(left.createdAt))
    .slice(0, 8)
    .map((activity) => ({
      id: activity.id,
      summary: activity.summary.trim() || 'Needs confirmation — capture summary is missing',
      accountName: cleanOrConfirm(activity.accountName),
      opportunityName: cleanOrConfirm(activity.opportunityName),
      reason: activity.linkStatus === 'Suggested'
        ? 'Review suggested opportunity link'
        : activity.linkStatus === 'Unlinked'
          ? 'Link capture to an opportunity'
          : 'Needs confirmation',
      href: '/app/capture',
      activityDateLabel: formatSafeBusinessDate(activity.activityDate),
    }));
}

function dedupeActions(actions: TodayCommandAction[]) {
  const seen = new Set<string>();
  return actions.filter((action) => {
    const entity = `${normalize(action.accountName)}|${normalize(action.opportunityName)}`;
    const key = action.source === 'Capture' ? action.id : entity;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function compareTodayActions(left: TodayCommandAction, right: TodayCommandAction) {
  return right.rank - left.rank || compareSafeBusinessDate(left.dueDate, right.dueDate) || left.title.localeCompare(right.title);
}

function latestOpportunitySignal(opportunity: CrmLiteOpportunity, activities: SalesActivityRecord[]) {
  return activities
    .filter((activity) => activity.linkedOpportunityId === opportunity.id || (
      normalize(activity.accountName) === normalize(opportunity.accountName)
      && normalize(activity.opportunityName) === normalize(opportunity.opportunityName)
    ))
    .map((activity) => sanitizeBusinessDate(activity.activityDate))
    .filter(Boolean)
    .sort((left, right) => compareSafeBusinessDate(right, left))[0] || '';
}

function matchesOpportunity(item: { opportunityId: string; opportunityName: string; accountName: string }, opportunity: CrmLiteOpportunity) {
  return item.opportunityId === opportunity.id || (
    normalize(item.accountName) === normalize(opportunity.accountName)
    && normalize(item.opportunityName) === normalize(opportunity.opportunityName)
  );
}

function isRecent(date: string, today: string) {
  if (!isValidBusinessDate(date) || !isValidBusinessDate(today)) return false;
  const age = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000;
  return age >= 0 && age <= 30;
}

function formatMoney(amount: number | null | undefined, currency: string | null | undefined) {
  if (amount === null || amount === undefined || !currency?.trim()) return 'Needs confirmation';
  const converted = convertMoney(amount, currency);
  if (converted === null) return `${formatCurrencyAmount(amount, currency)} · Needs confirmation`;
  return `${formatCurrencyAmount(amount, currency)} · ${formatBaseCurrencyAmount(converted)}`;
}

function cleanOrConfirm(value: string | null | undefined) {
  return value?.trim() || 'Needs confirmation';
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
