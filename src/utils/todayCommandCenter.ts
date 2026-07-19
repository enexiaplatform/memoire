import type { CrmLiteOpportunity } from '../services/opportunityStore';
import type { SalesActivityRecord } from '../services/salesActivityStore';
import type { StakeholderRecord } from '../services/stakeholderStore';
import type { ObjectionRecord } from '../services/objectionStore';
import type { AccountMemoryRecord } from '../services/accountStore';
import type { QuoteRecord } from '../services/quoteStore';
import type { ExpenseRecord } from '../services/expenseStore';
import type { OpportunityOutcomeRecord } from '../services/opportunityOutcomeStore';
import type { RevenueActionItem } from './revenueView';
import type { PipelineDefenseBrief } from './pipelineDefenseStorage';
import { buildPipelineDefenseCenter, type ManagerReadyDealBrief } from './pipelineDefenseCenter.ts';
import { formatMoneyWithBase } from './money.ts';
import { compareSafeBusinessDate, formatSafeBusinessDate, isBusinessDateOverdue, isValidBusinessDate, sanitizeBusinessDate, todayDateKey } from './safeDate.ts';
import { classifyAccountEngagement, type AccountHygienePreference } from './accountHygiene.ts';
import { analyzePersonalSalesLearning } from './personalSalesLearning.ts';
import { normalizeMeddicRole } from './meddicStakeholderMap.ts';
import { buildPostWonCustomers, type WonCustomerNudge } from './postWonCustomers.ts';
import { buildOwnObligations, type OwnObligation } from './ownObligations.ts';
import { formatCompactBaseAmount } from './money.ts';

export type TodayActionSource = 'Pipeline Defense' | 'Revenue' | 'Opportunity' | 'Capture' | 'Customer' | 'Obligation';
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
  /**
   * "Why am I seeing this?" - the rule that surfaced it plus its evidence.
   * Populated centrally by withBasis for every action that reaches Today.
   */
  basis?: string;
  /** How many deals this one card stands for, when identical work was merged. */
  mergedCount?: number;
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
  expenses?: ExpenseRecord[];
  accountPreferences?: AccountHygienePreference[];
  opportunityOutcomes?: OpportunityOutcomeRecord[];
  /**
   * Pipeline health, measured by the caller from the LIVE pipeline
   * (buildLivePipelineHealth). Today used to score it from the latest saved
   * brief - a snapshot that could be stale or absent - which is how one
   * workspace read 0% readiness on Today while Opportunities showed 119 of 122
   * deals weak. Today composes; it does not decide where health comes from.
   */
  pipelineHealth?: ReturnType<typeof buildPipelineDefenseCenter>;
  today?: string;
}) {
  const today = isValidBusinessDate(input.today) ? input.today : todayDateKey();
  const latestBrief = [...input.briefs].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
  const pipelineReadiness = input.pipelineHealth
    || buildPipelineDefenseCenter([], today, input.opportunityOutcomes || []);
  const personalLearning = analyzePersonalSalesLearning({
    outcomes: input.opportunityOutcomes || [],
    opportunities: input.opportunities,
    deals: pipelineReadiness.items.map((item) => item.deal),
  });
  const pipelineActions = pipelineReadiness.items.flatMap((item) => buildPipelineAction(item));
  const revenueActions = input.revenueActions.map(buildRevenueAction);
  const opportunityActions = buildOpportunityActions(input.opportunities, input.activities, input.stakeholders || [], input.objections || [], today);
  const postWon = buildPostWonCustomers({
    opportunities: input.opportunities,
    opportunityOutcomes: input.opportunityOutcomes || [],
    quotes: input.quotes || [],
    activities: input.activities,
    today,
  });
  const postWonActions = postWon.quietCustomers.map(buildPostWonAction);
  const obligations = buildOwnObligations({
    expenses: input.expenses || [],
    quotes: input.quotes || [],
    today,
  });
  // Payment obligations are the genuinely-missing side; delivery obligations are
  // already surfaced as Revenue "Delivery overdue", so only payments become
  // Today actions to avoid double-surfacing the same work.
  const obligationActions = obligations.obligations
    .filter((obligation) => obligation.kind === 'Payment' && (obligation.status === 'Overdue' || obligation.status === 'Due soon'))
    .map(buildObligationAction);
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
  const rankedActions = [...pipelineActions, ...revenueActions, ...opportunityActions, ...postWonActions, ...obligationActions, ...captureActions]
    .filter((action) => action.source === 'Capture' || action.source === 'Obligation' || !suppressedAccounts.has(normalize(action.accountName)))
    .sort(compareTodayActions);
  const allActions = dedupeActions(rankedActions).sort(compareTodayActions).map(withBasis);
  // Collapse identical titles into one card so a dataset where many deals share
  // the same fallback ("Confirm overdue next action") produces one prioritised
  // hygiene action, not the same sentence three times in the Top 3.
  const topActions = collapseByTitle(allActions).slice(0, 3);

  return {
    readinessScore: pipelineReadiness.readinessScore,
    defendableDeals: pipelineReadiness.defendableDeals,
    rescueDeals: pipelineReadiness.rescueDeals,
    downgradeCandidates: pipelineReadiness.downgradeCandidates,
    overdueActions: allActions.filter((action) => isBusinessDateOverdue(action.dueDate, today)).length,
    missingEvidenceGaps: pipelineReadiness.topMissingEvidenceGaps,
    topActions,
    allActions,
    pipelineReadiness,
    commercialRiskItems: input.revenueActions.slice(0, 5),
    captureInbox,
    postWonCustomers: postWon,
    ownObligations: obligations,
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
    // Deep-link to the exact deal card - the alarm's job is to land the user
    // on the handling spot, never on a page top.
    href: `/app/pipeline-defense?dealId=${encodeURIComponent(item.deal.id)}`,
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
      href: `/app/opportunities?opportunityId=${encodeURIComponent(opportunity.id)}`,
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

function buildPostWonAction(customer: WonCustomerNudge): TodayCommandAction {
  // A won customer left quiet for a quarter is a High signal; below that it is a
  // steady Medium reconnect. Ranked below overdue money but above capture chores.
  const veryQuiet = customer.daysSinceTouch >= 90;
  return {
    id: `postwon-${normalize(customer.accountName)}`,
    title: `Reconnect with ${customer.accountName}`,
    accountName: customer.accountName,
    opportunityName: 'Won customer',
    reason: `Won customer quiet for ${customer.daysSinceTouch} days — the relationship is going silent.`,
    source: 'Customer',
    urgency: veryQuiet ? 'High' : 'Medium',
    href: `/app/accounts?accountName=${encodeURIComponent(customer.accountName)}`,
    dueDate: '',
    dueDateLabel: formatSafeBusinessDate(''),
    moneyLabel: customer.wonValueBase > 0 ? formatCompactBaseAmount(customer.wonValueBase) : '',
    rank: veryQuiet ? 82 : 70,
  };
}

function buildObligationAction(obligation: OwnObligation): TodayCommandAction {
  const overdue = obligation.status === 'Overdue';
  const dueLabel = obligation.dueDate ? formatSafeBusinessDate(obligation.dueDate) : '';
  return {
    id: obligation.id,
    title: `Pay ${obligation.label}`,
    accountName: obligation.counterparty || 'Needs confirmation',
    opportunityName: 'Obligation',
    reason: overdue
      ? `Payment overdue — a missed deadline costs more than a cold deal.`
      : `Payment due ${dueLabel} — settle before it goes silent.`,
    source: 'Obligation',
    urgency: overdue ? 'Critical' : 'High',
    href: obligation.href,
    dueDate: obligation.dueDate,
    dueDateLabel: formatSafeBusinessDate(obligation.dueDate),
    moneyLabel: obligation.amountBase !== null ? formatCompactBaseAmount(obligation.amountBase) : '',
    rank: overdue ? 95 : 80,
  };
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
      // The linking UI lives in the Activity ledger's detail modal.
      href: `/app/activity?activityId=${encodeURIComponent(activity.id)}`,
      activityDateLabel: formatSafeBusinessDate(activity.activityDate),
    }));
}

function dedupeActions(actions: TodayCommandAction[]) {
  const seen = new Set<string>();
  return actions.filter((action) => {
    const entity = `${normalize(action.accountName)}|${normalize(action.opportunityName)}`;
    // Capture and Obligation actions are per-record (many can share a
    // counterparty), so they dedupe by id, not by account+opportunity.
    const key = action.source === 'Capture' || action.source === 'Obligation' ? action.id : entity;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Names the rule that surfaced an action and the money it concerns. */
function withBasis(action: TodayCommandAction): TodayCommandAction {
  const parts = [`${action.source}: ${action.reason}`];
  if (action.moneyLabel && !action.moneyLabel.startsWith('Needs')) parts.push(action.moneyLabel);
  if (action.dueDate) parts.push(`Due ${action.dueDateLabel}`);
  return { ...action, basis: parts.join(' · ') };
}

/**
 * Merges actions that carry the identical title into one card. A pipeline of
 * imported deals with no next action all produce the same fallback sentence;
 * shown one-per-deal they filled the Top 3 with the same words. Merged, the
 * seller sees "Confirm overdue next action - 12 deals, 3.2B VND" once, ranked
 * by the money it stands for, and works the biggest first.
 */
function collapseByTitle(actions: TodayCommandAction[]): TodayCommandAction[] {
  const groups = new Map<string, TodayCommandAction[]>();
  const order: string[] = [];
  actions.forEach((action) => {
    const key = normalize(action.title);
    if (!groups.has(key)) { groups.set(key, []); order.push(key); }
    groups.get(key)!.push(action);
  });

  const merged = order.map((key) => {
    const group = groups.get(key)!;
    if (group.length === 1) return group[0];
    // The strongest card is the face; it stands in for the whole group and
    // points the seller at the biggest one to start with.
    const lead = [...group].sort(compareTodayActions)[0];
    return {
      ...lead,
      reason: `${group.length} deals need this. Start with ${lead.accountName}${lead.moneyLabel && !lead.moneyLabel.startsWith('Needs') ? ` (${lead.moneyLabel})` : ''}.`,
      basis: `${lead.source}: ${group.length} deals share this action · ${lead.reason}`,
      mergedCount: group.length,
    };
  });

  return merged.sort(compareTodayActions);
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
  return formatMoneyWithBase(amount, currency);
}

function cleanOrConfirm(value: string | null | undefined) {
  return value?.trim() || 'Needs confirmation';
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
