import type { AccountMemoryRecord } from '../services/accountStore';
import type { CrmLiteOpportunity } from '../services/opportunityStore';
import type { OperatingContextRecord } from '../services/operatingContextStore';
import type { SalesActivityRecord } from '../services/salesActivityStore';
import { formatCompactCurrencyAmount } from './money.ts';
import type { DailyExecutionDecision } from './dailyExecution';
import type { PipelineDefenseBrief } from './pipelineDefenseStorage';
import type { RevenueActionItem, RevenueRiskKind } from './revenueView';
import { buildOpportunitySalesFlowGuidance } from './salesFlowGuidance.ts';
import { compareSafeBusinessDate, isBusinessDateInRange, isBusinessDateOverdue, isValidBusinessDate, todayDateKey, toLocalDateKey } from './safeDate.ts';

export type CommandPriority = 'Critical' | 'High' | 'Medium' | 'Low';
export type CommandActionSource = 'Activity' | 'Opportunity' | 'Operating System' | 'Sales Flow' | 'Pipeline Defense' | 'Quote';

export type CommandActionItem = {
  id: string;
  title: string;
  accountName: string;
  opportunityName?: string;
  source: CommandActionSource;
  dueDate?: string;
  priority: CommandPriority;
  reason: string;
  href: string;
  executionStatus?: 'Deferred';
};

export type DailyTimeblockItem = {
  id: string;
  startTime: string;
  endTime: string;
  title: string;
  focus: string;
  reason: string;
  priority: CommandPriority;
  href: string;
  actions: CommandActionItem[];
};

export type AtRiskOpportunityItem = {
  id: string;
  accountName: string;
  opportunityName: string;
  forecastEvidenceCategory: string;
  decisionRecommendation: string;
  missingContext: string;
  objectionDebt: string;
  nextAction: string;
  reason: string;
  href: string;
};

export type AccountTouchItem = {
  id: string;
  accountName: string;
  reason: string;
  lastActivityDate: string;
  activeOpportunityCount: number;
  href: string;
};

export type RecentActivityItem = {
  id: string;
  date: string;
  type: string;
  accountName: string;
  summary: string;
  linkedOpportunityName: string;
};

export type CommandExecutionDecisionItem = {
  action: CommandActionItem;
  status: DailyExecutionDecision['status'];
  updatedAt: string;
};

export type CommandExecutionSummary = {
  doneCount: number;
  deferredCount: number;
  items: CommandExecutionDecisionItem[];
};

export type CommandCenter = {
  todayActions: CommandActionItem[];
  overdueActions: CommandActionItem[];
  priorityActions: CommandActionItem[];
  operatingActions: CommandActionItem[];
  dailyTimeblocks: DailyTimeblockItem[];
  atRiskOpportunities: AtRiskOpportunityItem[];
  accountsNeedingTouch: AccountTouchItem[];
  recentActivities: RecentActivityItem[];
  dailyExecution: CommandExecutionSummary;
  thisWeekSummary: {
    activitiesThisWeek: number;
    accountsTouchedThisWeek: number;
    opportunitiesWithMovement: number;
    openNextActions: number;
    objectionsCaptured: number;
    pipelineDefenseBriefsCreated: number;
  };
  hasAnyData: boolean;
};

export function buildTodayCommandCenter({
  activities,
  opportunities,
  accounts,
  briefs,
  commercialActions = [],
  operatingContext = [],
  executionDecisions = [],
}: {
  activities: SalesActivityRecord[];
  opportunities: CrmLiteOpportunity[];
  accounts: AccountMemoryRecord[];
  briefs: PipelineDefenseBrief[];
  commercialActions?: RevenueActionItem[];
  operatingContext?: OperatingContextRecord[];
  executionDecisions?: DailyExecutionDecision[];
}): CommandCenter {
  const rawTodayActions = getTodayActions(opportunities, activities);
  const rawOverdueActions = getOverdueActions(opportunities, activities);
  const atRiskOpportunities = getAtRiskOpportunities(opportunities);
  const accountsNeedingTouch = getAccountsNeedingTouch(accounts, activities, opportunities);
  const recentActivities = getRecentActivitySummary(activities);
  const pipelineReadiness = getPipelineReviewReadiness(opportunities, briefs);
  const rawRiskActions = atRiskOpportunities.slice(0, 8).map(riskToAction);
  const rawSalesFlowActions = buildSalesFlowCommandActions(opportunities);
  const rawOperatingActions = buildOperatingContextCommandActions(operatingContext);
  const rawCommercialActions = buildCommercialCommandActions(commercialActions);
  const rawAccountTouchActions = accountsNeedingTouch.map(accountTouchToAction);
  const decisionMap = new Map(executionDecisions.map((decision) => [decision.actionId, decision.status]));
  const isActive = (action: CommandActionItem) => !decisionMap.has(action.id);
  const activeActions = (actions: CommandActionItem[]) => actions.filter(isActive);
  const todayActions = activeActions(rawTodayActions);
  const overdueActions = activeActions(rawOverdueActions);
  const riskActions = activeActions(rawRiskActions);
  const salesFlowActions = activeActions(rawSalesFlowActions);
  const operatingActions = activeActions(rawOperatingActions);
  const commercialCommandActions = activeActions(rawCommercialActions);
  const accountTouchActions = activeActions(rawAccountTouchActions).slice(0, 3);
  const rawCommandActions = dedupeActions([
    ...rawCommercialActions,
    ...rawOverdueActions,
    ...rawTodayActions,
    ...rawSalesFlowActions,
    ...rawOperatingActions,
    ...rawRiskActions,
    ...rawAccountTouchActions,
  ]);
  const deferredActions = rawCommandActions
    .filter((action) => decisionMap.get(action.id) === 'Deferred')
    .map((action): CommandActionItem => ({ ...action, executionStatus: 'Deferred' }));
  const executionItems = executionDecisions
    .flatMap((decision): CommandExecutionDecisionItem[] => {
      const action = rawCommandActions.find((candidate) => candidate.id === decision.actionId);
      if (!action) return [];
      return [{
        action: decision.status === 'Deferred' ? { ...action, executionStatus: 'Deferred' } : action,
        status: decision.status,
        updatedAt: decision.updatedAt,
      }];
    })
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const priorityActions = sortActions(dedupeActions([
    ...overdueActions,
    ...todayActions,
    ...riskActions,
    ...operatingActions,
    ...salesFlowActions,
    ...commercialCommandActions,
  ])).slice(0, 16);

  return {
    todayActions,
    overdueActions,
    priorityActions,
    operatingActions,
    dailyTimeblocks: buildDailyTimeblocks({
      todayActions,
      overdueActions,
      priorityActions,
      riskActions,
      operatingActions,
      salesFlowActions,
      commercialActions: commercialCommandActions,
      deferredActions,
      atRiskOpportunities,
      accountTouchActions,
    }),
    atRiskOpportunities,
    accountsNeedingTouch,
    recentActivities,
    dailyExecution: {
      doneCount: executionItems.filter((item) => item.status === 'Done').length,
      deferredCount: executionItems.filter((item) => item.status === 'Deferred').length,
      items: executionItems,
    },
    thisWeekSummary: {
      activitiesThisWeek: getActivitiesThisWeek(activities).length,
      accountsTouchedThisWeek: countAccountsTouchedThisWeek(activities),
      opportunitiesWithMovement: countOpportunitiesWithMovement(opportunities, activities),
      openNextActions: countOpenNextActions(opportunities, activities),
      objectionsCaptured: countObjections(opportunities, activities),
      pipelineDefenseBriefsCreated: pipelineReadiness.briefsCreatedThisWeek,
    },
    hasAnyData: activities.length > 0 || opportunities.length > 0 || accounts.length > 0 || operatingContext.length > 0 || rawCommercialActions.length > 0 || briefs.some(isUserCreatedBrief),
  };
}

function buildDailyTimeblocks({
  todayActions,
  overdueActions,
  priorityActions,
  riskActions,
  operatingActions,
  salesFlowActions,
  commercialActions,
  deferredActions,
  atRiskOpportunities,
  accountTouchActions,
}: {
  todayActions: CommandActionItem[];
  overdueActions: CommandActionItem[];
  priorityActions: CommandActionItem[];
  riskActions: CommandActionItem[];
  operatingActions: CommandActionItem[];
  salesFlowActions: CommandActionItem[];
  commercialActions: CommandActionItem[];
  deferredActions: CommandActionItem[];
  atRiskOpportunities: AtRiskOpportunityItem[];
  accountTouchActions: CommandActionItem[];
}): DailyTimeblockItem[] {
  const criticalCommercialActions = commercialActions.filter((action) => action.priority === 'Critical');
  const executionActions = sortActions(dedupeActions([
    ...criticalCommercialActions,
    ...overdueActions,
    ...todayActions,
    ...operatingActions,
    ...salesFlowActions,
  ])).slice(0, 5);
  const defenseActions = sortActions(dedupeActions([
    ...riskActions,
    ...salesFlowActions,
  ])).slice(0, 4);
  const customerExecutionActions = sortActions(dedupeActions([
    ...overdueActions,
    ...todayActions,
    ...salesFlowActions,
    ...operatingActions,
    ...commercialActions,
  ])).slice(0, 5);
  const triageActions = executionActions.length ? executionActions : priorityActions.slice(0, 3);
  const closeoutActions = dedupeActions([...deferredActions, ...priorityActions]).slice(0, 3);
  const topDeferredAction = deferredActions[0];

  return [
    {
      id: 'morning-triage',
      startTime: '08:30',
      endTime: '09:00',
      title: 'Triage today',
      focus: triageActions[0]?.title || 'Choose the one priority that must move today.',
      reason: triageActions[0]?.reason || 'No due action is blocking the day, so start with the highest-leverage initiative or deal.',
      priority: triageActions[0]?.priority || (overdueActions.length ? 'Critical' : todayActions.length ? 'High' : 'Medium'),
      href: triageActions[0]?.href || '/app/opportunities',
      actions: triageActions,
    },
    {
      id: 'pipeline-defense',
      startTime: '09:00',
      endTime: '10:30',
      title: 'Pipeline Defense',
      focus: defenseActions[0]?.source === 'Sales Flow'
        ? defenseActions[0].title
        : atRiskOpportunities[0]
        ? `Defend or rescue ${atRiskOpportunities[0].opportunityName}`
        : 'Prepare the next manager-ready pipeline answer.',
      reason: defenseActions[0]?.source === 'Sales Flow'
        ? defenseActions[0].reason
        : atRiskOpportunities.length
        ? `${atRiskOpportunities.length} active opportunit${atRiskOpportunities.length === 1 ? 'y has' : 'ies have'} weak evidence, missing context, or rescue/downgrade signals.`
        : 'Pipeline risk is quiet; keep review evidence current before the next manager conversation.',
      priority: defenseActions[0]?.priority || (atRiskOpportunities.length ? 'High' : 'Low'),
      href: defenseActions[0]?.href || '/app/pipeline-defense',
      actions: defenseActions,
    },
    {
      id: 'customer-execution',
      startTime: '13:30',
      endTime: '15:30',
      title: 'Customer execution',
      focus: customerExecutionActions[0]?.source === 'Sales Flow'
        ? customerExecutionActions[0].title
        : customerExecutionActions[0]?.source === 'Operating System'
        ? customerExecutionActions[0].title
        : customerExecutionActions[0]?.source === 'Quote'
        ? customerExecutionActions[0].title
        : customerExecutionActions[0]?.accountName
        ? `Move ${customerExecutionActions[0].accountName}`
        : accountTouchActions[0]?.title || 'Create one customer touch that creates evidence.',
      reason: customerExecutionActions[0]?.source === 'Sales Flow'
        ? customerExecutionActions[0].reason
        : customerExecutionActions[0]?.source === 'Operating System'
        ? customerExecutionActions[0].reason
        : customerExecutionActions[0]?.source === 'Quote'
        ? customerExecutionActions[0].reason
        : customerExecutionActions.length
        ? 'Use this block for calls, emails, proof follow-up, procurement clarification, or next-step confirmation.'
        : 'No dated action is queued, so use the block to prevent quiet accounts from drifting.',
      priority: customerExecutionActions[0]?.priority || 'Medium',
      href: customerExecutionActions[0]?.href || accountTouchActions[0]?.href || '/app/accounts',
      actions: customerExecutionActions.length ? customerExecutionActions.slice(0, 4) : accountTouchActions,
    },
    {
      id: 'capture-closeout',
      startTime: '16:30',
      endTime: '17:00',
      title: 'Capture closeout',
      focus: topDeferredAction?.title || 'Write what changed and update tomorrow\'s next action.',
      reason: topDeferredAction
        ? 'Deferred earlier. Finish it now or move the source record to a new date.'
        : 'Memoire becomes useful when the day ends with clean activity memory, next action dates, and review evidence.',
      priority: topDeferredAction?.priority || 'Medium',
      href: topDeferredAction?.href || '/app/capture?mode=quick',
      actions: closeoutActions,
    },
  ];
}

export function buildSalesFlowCommandActions(opportunities: CrmLiteOpportunity[]): CommandActionItem[] {
  return opportunities
    .filter((opportunity) => opportunity.status === 'Active')
    .map((opportunity): CommandActionItem => {
      const guidance = buildOpportunitySalesFlowGuidance(opportunity);
      const priority: CommandPriority = guidance.missingCheckpoints.length >= 3
        || opportunity.forecastEvidenceCategory === 'Unsupported'
        ? 'High'
        : guidance.missingCheckpoints.length > 0
        ? 'Medium'
        : 'Low';

      return {
        id: `sales-flow-${opportunity.id}-${guidance.step.id}`,
        title: guidance.suggestedAction,
        accountName: opportunity.accountName,
        opportunityName: opportunity.opportunityName,
        source: 'Sales Flow',
        priority,
        reason: `${guidance.step.label} checkpoint: ${guidance.reason}`,
        href: `/app/opportunities?opportunityId=${encodeURIComponent(opportunity.id)}`,
      };
    })
    .sort((left, right) => priorityRank(right.priority) - priorityRank(left.priority));
}

export function buildOperatingContextCommandActions(records: OperatingContextRecord[]): CommandActionItem[] {
  const today = todayKey();
  return records
    .filter((record) => !isOperatingContextClosed(record))
    .map((record): CommandActionItem => {
      const overdue = isBusinessDateOverdue(record.nextDate, today);
      const dueToday = isValidBusinessDate(record.nextDate) && record.nextDate === today;
      const missingAction = !record.nextAction.trim();
      const blocked = /block|risk|late|stuck/i.test(record.status);
      const priority: CommandPriority = overdue
        ? 'Critical'
        : dueToday || missingAction || blocked
        ? 'High'
        : record.contextType === 'initiative'
        ? 'Medium'
        : 'Low';

      return {
        id: `operating-${record.id}`,
        title: record.nextAction || `Define the next milestone for ${record.title}`,
        accountName: record.title,
        source: 'Operating System',
        dueDate: record.nextDate || undefined,
        priority,
        reason: `${record.contextType === 'initiative' ? 'Must-win initiative' : 'Account play'}${record.period ? ` / ${record.period}` : ''}${record.status ? ` / ${record.status}` : ''}.`,
        href: `/app/operating-system?contextId=${encodeURIComponent(record.id)}`,
      };
    })
    .sort((left, right) => priorityRank(right.priority) - priorityRank(left.priority) || compareSafeBusinessDate(left.dueDate, right.dueDate));
}

function isOperatingContextClosed(record: OperatingContextRecord) {
  return /complete|completed|done|closed|cancel|lost/i.test(record.status);
}

function accountTouchToAction(account: AccountTouchItem): CommandActionItem {
  return {
    id: `touch-${account.id}`,
    title: `Touch ${account.accountName}`,
    accountName: account.accountName,
    source: 'Activity',
    priority: account.activeOpportunityCount > 0 ? 'High' : 'Medium',
    reason: account.reason,
    href: account.href,
  };
}

export function buildCommercialCommandActions(actions: RevenueActionItem[]): CommandActionItem[] {
  return actions
    .filter((action) => action.source === 'Quote')
    .map((action): CommandActionItem => ({
      id: `commercial-${action.id}`,
      title: action.nextAction || `Review ${action.label}`,
      accountName: action.accountName,
      opportunityName: action.label,
      source: 'Quote',
      priority: commercialRiskPriority(action.risk),
      reason: `${action.risk}: ${formatCompactCurrencyAmount(action.amount, action.currency)} on ${action.label} needs a commercial decision.`,
      href: action.href,
    }));
}

export function commercialRiskPriority(risk: RevenueRiskKind): CommandPriority {
  if (risk === 'Payment overdue' || risk === 'Delivery overdue' || risk === 'Quote expired') return 'Critical';
  if (risk === 'Quote expiring' || risk === 'Payment term missing') return 'High';
  if (risk === 'Waiting on PO' || risk === 'Waiting on delivery' || risk === 'Waiting on payment') return 'Medium';
  return 'Low';
}

export function getTodayActions(opportunities: CrmLiteOpportunity[], activities: SalesActivityRecord[]) {
  const today = todayKey();
  const opportunityActions = opportunities
    .filter((opportunity) => opportunity.status === 'Active' && opportunity.nextAction && isValidBusinessDate(opportunity.nextActionDate) && opportunity.nextActionDate === today)
    .map((opportunity): CommandActionItem => ({
      id: `today-opportunity-${opportunity.id}`,
      title: opportunity.nextAction,
      accountName: opportunity.accountName,
      opportunityName: opportunity.opportunityName,
      source: 'Opportunity',
      dueDate: opportunity.nextActionDate,
      priority: getOpportunityPriority(opportunity),
      reason: 'Opportunity next action is due today.',
      href: '/app/opportunities',
    }));

  const activityActions = activities
    .filter((activity) => activity.nextAction && isValidBusinessDate(activity.dueDate) && activity.dueDate === today)
    .map((activity): CommandActionItem => ({
      id: `today-activity-${activity.id}`,
      title: activity.nextAction,
      accountName: activity.linkedAccountName || activity.accountName || 'Unlinked account',
      opportunityName: activity.linkedOpportunityName || activity.opportunityName,
      source: 'Activity',
      dueDate: activity.dueDate,
      priority: activity.activityType === 'Objection handling' ? 'High' : 'Medium',
      reason: 'Captured activity next action is due today.',
      href: '/app/calendar',
    }));

  return sortActions([...opportunityActions, ...activityActions]);
}

export function getOverdueActions(opportunities: CrmLiteOpportunity[], activities: SalesActivityRecord[]) {
  const today = todayKey();
  const opportunityActions = opportunities
    .filter((opportunity) => opportunity.status === 'Active' && opportunity.nextAction && isBusinessDateOverdue(opportunity.nextActionDate, today))
    .map((opportunity): CommandActionItem => ({
      id: `overdue-opportunity-${opportunity.id}`,
      title: opportunity.nextAction,
      accountName: opportunity.accountName,
      opportunityName: opportunity.opportunityName,
      source: 'Opportunity',
      dueDate: opportunity.nextActionDate,
      priority: getOpportunityPriority(opportunity, true),
      reason: 'Opportunity next action is overdue.',
      href: '/app/opportunities',
    }));

  const activityActions = activities
    .filter((activity) => activity.nextAction && isBusinessDateOverdue(activity.dueDate, today))
    .map((activity): CommandActionItem => ({
      id: `overdue-activity-${activity.id}`,
      title: activity.nextAction,
      accountName: activity.linkedAccountName || activity.accountName || 'Unlinked account',
      opportunityName: activity.linkedOpportunityName || activity.opportunityName,
      source: 'Activity',
      dueDate: activity.dueDate,
      priority: 'High',
      reason: 'Captured activity next action is overdue.',
      href: '/app/calendar',
    }));

  return sortActions([...opportunityActions, ...activityActions]);
}

export function getAtRiskOpportunities(opportunities: CrmLiteOpportunity[]): AtRiskOpportunityItem[] {
  return opportunities
    .filter((opportunity) => opportunity.status === 'Active')
    .map((opportunity) => {
      const reasons = getOpportunityRiskReasons(opportunity);
      return { opportunity, reasons };
    })
    .filter(({ reasons }) => reasons.length > 0)
    .map(({ opportunity, reasons }) => ({
      id: opportunity.id,
      accountName: opportunity.accountName || 'No account',
      opportunityName: opportunity.opportunityName || 'Untitled opportunity',
      forecastEvidenceCategory: opportunity.forecastEvidenceCategory,
      decisionRecommendation: opportunity.decisionRecommendation,
      missingContext: opportunity.missingContext || 'No missing context captured',
      objectionDebt: opportunity.objectionDebt || 'No objection debt captured',
      nextAction: opportunity.nextAction || 'No next action captured',
      reason: reasons.slice(0, 3).join('; '),
      href: '/app/opportunities',
    }))
    .sort((a, b) => riskRank(b) - riskRank(a));
}

export function getAccountsNeedingTouch(
  accounts: AccountMemoryRecord[],
  activities: SalesActivityRecord[],
  opportunities: CrmLiteOpportunity[],
): AccountTouchItem[] {
  const accountNames = new Set<string>();
  accounts.forEach((account) => accountNames.add(normalizeName(account.accountName)));
  opportunities.filter((opportunity) => opportunity.status === 'Active').forEach((opportunity) => accountNames.add(normalizeName(opportunity.accountName)));

  return Array.from(accountNames)
    .map((normalizedName) => {
      const account = accounts.find((item) => normalizeName(item.accountName) === normalizedName);
      const displayName = account?.accountName || opportunities.find((item) => normalizeName(item.accountName) === normalizedName)?.accountName || normalizedName;
      const relatedOpportunities = opportunities.filter((opportunity) =>
        opportunity.status === 'Active' && normalizeName(opportunity.accountName) === normalizedName
      );
      const relatedActivities = activities.filter((activity) => normalizeName(activity.linkedAccountName || activity.accountName) === normalizedName);
      const lastActivityDate = relatedActivities.map((activity) => activity.activityDate).filter(isValidBusinessDate).sort(compareSafeBusinessDate).at(-1) || '';
      const reasons: string[] = [];

      if (relatedOpportunities.length > 0 && (!lastActivityDate || daysSince(lastActivityDate) > 14)) {
        reasons.push('Active opportunity with no activity in the last 14 days.');
      }
      if (account?.relationshipStatus === 'Dormant' || account?.relationshipStatus === 'At risk') {
        reasons.push(`Relationship status is ${account.relationshipStatus}.`);
      }
      if (account?.accountPotential === 'High' && relatedActivities.filter((activity) => daysSince(activity.activityDate) <= 14).length === 0) {
        reasons.push('High-potential account has low recent activity.');
      }

      if (reasons.length === 0) return null;

      return {
        id: account?.id || normalizedName,
        accountName: displayName,
        reason: reasons.join(' '),
        lastActivityDate: lastActivityDate || 'No activity captured',
        activeOpportunityCount: relatedOpportunities.length,
        href: `/app/accounts?accountName=${encodeURIComponent(displayName)}`,
      };
    })
    .filter((item): item is AccountTouchItem => Boolean(item))
    .sort((a, b) => b.activeOpportunityCount - a.activeOpportunityCount);
}

export function getRecentActivitySummary(activities: SalesActivityRecord[]): RecentActivityItem[] {
  return [...activities]
    .sort((a, b) => compareSafeBusinessDate(b.activityDate, a.activityDate) || b.createdAt.localeCompare(a.createdAt))
    .slice(0, 10)
    .map((activity) => ({
      id: activity.id,
      date: activity.activityDate,
      type: activity.activityType,
      accountName: activity.linkedAccountName || activity.accountName || 'Unlinked account',
      summary: activity.summary,
      linkedOpportunityName: activity.linkedOpportunityName || activity.opportunityName || '',
    }));
}

export function getPipelineReviewReadiness(opportunities: CrmLiteOpportunity[], briefs: PipelineDefenseBrief[]) {
  const week = currentWeekRange();
  const activeAtRisk = getAtRiskOpportunities(opportunities).length;
  const briefsCreatedThisWeek = briefs.filter((brief) => brief.createdAt.slice(0, 10) >= week.start && brief.createdAt.slice(0, 10) <= week.end).length;

  return {
    activeAtRisk,
    briefsCreatedThisWeek,
    status: activeAtRisk === 0 ? 'Ready' : briefsCreatedThisWeek > 0 ? 'Defense started' : 'Needs defense review',
  };
}

function riskToAction(item: AtRiskOpportunityItem): CommandActionItem {
  const critical = item.forecastEvidenceCategory === 'Unsupported' || item.decisionRecommendation === 'Downgrade';
  return {
    id: `risk-${item.id}`,
    title: item.nextAction === 'No next action captured' ? `Define next action for ${item.opportunityName}` : item.nextAction,
    accountName: item.accountName,
    opportunityName: item.opportunityName,
    source: 'Pipeline Defense',
    priority: critical ? 'Critical' : 'High',
    reason: item.reason,
    href: '/app/opportunities',
  };
}

function getOpportunityRiskReasons(opportunity: CrmLiteOpportunity) {
  const reasons: string[] = [];
  if (opportunity.forecastEvidenceCategory === 'Unsupported') reasons.push('Unsupported forecast evidence');
  if (opportunity.forecastEvidenceCategory === 'Hope-based') reasons.push('Hope-based forecast');
  if (['Rescue', 'Downgrade', 'Deprioritize'].includes(opportunity.decisionRecommendation)) reasons.push(`${opportunity.decisionRecommendation} recommended`);
  if (opportunity.objectionDebt.trim()) reasons.push('Unresolved objection debt');
  if (opportunity.missingContext.trim()) reasons.push('Missing decision context');
  if (!opportunity.nextAction.trim()) reasons.push('No next action');
  return reasons;
}

function countAccountsTouchedThisWeek(activities: SalesActivityRecord[]) {
  const weekActivities = getActivitiesThisWeek(activities);
  return new Set(weekActivities.map((activity) => normalizeName(activity.linkedAccountName || activity.accountName)).filter(Boolean)).size;
}

function countOpportunitiesWithMovement(opportunities: CrmLiteOpportunity[], activities: SalesActivityRecord[]) {
  const week = currentWeekRange();
  const movedIds = new Set<string>();

  opportunities.forEach((opportunity) => {
    const updatedDate = opportunity.updatedAt.slice(0, 10);
    if (updatedDate >= week.start && updatedDate <= week.end) movedIds.add(opportunity.id);
  });

  activities.forEach((activity) => {
    if (isBusinessDateInRange(activity.activityDate, week.start, week.end) && activity.linkedOpportunityId) {
      movedIds.add(activity.linkedOpportunityId);
    }
  });

  return movedIds.size;
}

function countOpenNextActions(opportunities: CrmLiteOpportunity[], activities: SalesActivityRecord[]) {
  return opportunities.filter((opportunity) => opportunity.status === 'Active' && opportunity.nextAction.trim()).length
    + activities.filter((activity) => activity.nextAction.trim()).length;
}

function countObjections(opportunities: CrmLiteOpportunity[], activities: SalesActivityRecord[]) {
  return opportunities.filter((opportunity) => opportunity.status === 'Active' && opportunity.objectionDebt.trim()).length
    + activities.filter((activity) => activity.activityType === 'Objection handling').length;
}

function getActivitiesThisWeek(activities: SalesActivityRecord[]) {
  const week = currentWeekRange();
  return activities.filter((activity) => isBusinessDateInRange(activity.activityDate, week.start, week.end));
}

function getOpportunityPriority(opportunity: CrmLiteOpportunity, overdue = false): CommandPriority {
  if (opportunity.forecastEvidenceCategory === 'Unsupported' || opportunity.decisionRecommendation === 'Downgrade') return 'Critical';
  if (overdue || opportunity.decisionRecommendation === 'Rescue' || opportunity.objectionDebt) return 'High';
  if (opportunity.forecastEvidenceCategory === 'Hope-based') return 'High';
  if (opportunity.forecastEvidenceCategory === 'Weak but recoverable') return 'Medium';
  return 'Low';
}

function sortActions(actions: CommandActionItem[]) {
  return actions.sort((a, b) => priorityRank(b.priority) - priorityRank(a.priority) || compareSafeBusinessDate(a.dueDate, b.dueDate));
}

function dedupeActions(actions: CommandActionItem[]) {
  const seen = new Set<string>();
  return actions.filter((action) => {
    const key = `${action.source}-${action.accountName}-${action.opportunityName || ''}-${action.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function riskRank(item: AtRiskOpportunityItem) {
  let rank = 0;
  if (item.forecastEvidenceCategory === 'Unsupported') rank += 5;
  if (item.forecastEvidenceCategory === 'Hope-based') rank += 3;
  if (item.decisionRecommendation === 'Downgrade') rank += 5;
  if (item.decisionRecommendation === 'Rescue') rank += 4;
  if (item.objectionDebt !== 'No objection debt captured') rank += 2;
  return rank;
}

function priorityRank(priority: CommandPriority) {
  return {
    Critical: 4,
    High: 3,
    Medium: 2,
    Low: 1,
  }[priority];
}

function normalizeName(value: string) {
  return value.trim().toLowerCase();
}

function daysSince(dateKey: string) {
  if (!dateKey) return Number.POSITIVE_INFINITY;
  const date = new Date(`${dateKey}T00:00:00`);
  const today = new Date(`${todayKey()}T00:00:00`);
  return Math.floor((today.getTime() - date.getTime()) / 86_400_000);
}

function todayKey() {
  return todayDateKey();
}

function currentWeekRange() {
  const now = new Date();
  const start = new Date(now);
  const day = start.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diffToMonday);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  return {
    start: toLocalDateKey(start),
    end: toLocalDateKey(end),
  };
}

function isUserCreatedBrief(brief: PipelineDefenseBrief) {
  return !brief.title.toLowerCase().includes('sample pipeline defense brief');
}
