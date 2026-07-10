import type { AccountMemoryRecord } from '../services/accountStore.ts';
import type { NudgeRecord, NudgeSource, NudgeUrgency } from '../services/nudgeStore.ts';
import type { OperatingContextRecord } from '../services/operatingContextStore.ts';
import type { ObjectionRecord } from '../services/objectionStore.ts';
import type { CrmLiteOpportunity } from '../services/opportunityStore.ts';
import type { OpportunityOutcomeRecord } from '../services/opportunityOutcomeStore.ts';
import type { QuoteRecord } from '../services/quoteStore.ts';
import type { SalesActivityRecord } from '../services/salesActivityStore.ts';
import type { StakeholderRecord } from '../services/stakeholderStore.ts';
import type { PipelineDefenseBrief } from './pipelineDefenseStorage.ts';
import type { RevenueActionItem } from './revenueView.ts';
import { classifyAccountEngagement, type AccountHygienePreference } from './accountHygiene.ts';
import { buildMeddicStakeholderMap } from './meddicStakeholderMap.ts';
import { formatBaseCurrencyAmount, formatCurrencyAmount, convertMoney } from './money.ts';
import { analyzePersonalSalesLearning } from './personalSalesLearning.ts';
import { buildManagerReadyDealBrief } from './pipelineDefenseCenter.ts';
import { compareSafeBusinessDate, formatSafeBusinessDate, isBusinessDateOverdue, isValidBusinessDate, sanitizeBusinessDate, todayDateKey, timestampToLocalDateKey } from './safeDate.ts';

export type ProactiveNudgeInput = {
  briefs?: PipelineDefenseBrief[];
  revenueActions?: RevenueActionItem[];
  opportunities?: CrmLiteOpportunity[];
  activities?: SalesActivityRecord[];
  objections?: ObjectionRecord[];
  accounts?: AccountMemoryRecord[];
  stakeholders?: StakeholderRecord[];
  quotes?: QuoteRecord[];
  accountPreferences?: AccountHygienePreference[];
  opportunityOutcomes?: OpportunityOutcomeRecord[];
  operatingContexts?: OperatingContextRecord[];
  persistedNudges?: NudgeRecord[];
  today?: string;
  limit?: number;
};

export type ProactiveNudgeCenter = {
  allActiveNudges: NudgeRecord[];
  todayNudges: NudgeRecord[];
  topActionNudges: NudgeRecord[];
  hiddenImportedAccountCount: number;
};

export function buildProactiveNudges(input: ProactiveNudgeInput): ProactiveNudgeCenter {
  const today = sanitizeBusinessDate(input.today) || todayDateKey();
  const persistedById = new Map((input.persistedNudges || []).map((nudge) => [nudge.id, nudge]));
  const generated = [
    ...buildRevenueNudges(input.revenueActions || [], today),
    ...buildOpportunityNudges(input.opportunities || [], today),
    ...buildSilenceRiskNudges(input, today),
    ...buildMeddicStakeholderNudges(input, today),
    ...buildPipelineDefenseNudges(input.briefs || [], today),
    ...buildObjectionNudges(input.objections || []),
    ...buildCaptureNudges(input.activities || [], today),
    ...buildAccountSignalNudges(input, today),
    ...buildOutcomeLearningNudges(input, today),
    ...buildInitiativeStalledNudges(input, today),
    ...buildImportedAccountInfoNudges(input, today),
  ];
  const deduped = dedupeNudges(generated);
  const active = deduped
    .map((nudge) => applyPersistedState(nudge, persistedById.get(nudge.id)))
    .filter((nudge): nudge is NudgeRecord => Boolean(nudge))
    .filter((nudge) => isActiveForToday(nudge, today))
    .sort(compareNudges);

  const capped = capTodayNudges(active, input.limit || 5);
  return {
    allActiveNudges: active,
    todayNudges: capped,
    topActionNudges: capped.slice(0, 3),
    hiddenImportedAccountCount: countImportedOnlyAccounts(input, today),
  };
}

function buildMeddicStakeholderNudges(input: ProactiveNudgeInput, today: string) {
  const stakeholders = input.stakeholders || [];
  const objections = input.objections || [];
  const activities = input.activities || [];
  return (input.opportunities || []).flatMap((opportunity) => {
    if (opportunity.status !== 'Active') return [];
    const map = buildMeddicStakeholderMap({ opportunity, stakeholders, objections, activities, today });
    const accountName = opportunity.accountName || 'Needs confirmation';
    const opportunityName = opportunity.opportunityName || 'Needs confirmation';
    const amount = opportunity.estimatedValue ?? opportunity.fy26Value ?? undefined;
    const nudges: NudgeRecord[] = [];
    const rescueDeal = opportunity.decisionRecommendation === 'Rescue' || opportunity.forecastEvidenceCategory === 'Hope-based' || opportunity.forecastEvidenceCategory === 'Unsupported';
    const missingChampion = map.missingRoles.find((role) => role.role === 'Champion');
    const missingEconomicBuyer = map.missingRoles.find((role) => role.role === 'Economic Buyer');
    const missingProcurement = map.missingRoles.find((role) => role.role === 'Procurement');
    const blockerRisk = map.relationshipRisks.find((risk) => /blocker|resistant/i.test(risk)) || map.objectionRisks[0];
    const overdueStakeholderAction = map.stakeholderNextActions.find((action) => action.overdue);

    if (missingChampion && rescueDeal) {
      nudges.push(createNudge({
        source: 'stakeholder',
        entityType: 'opportunity',
        entityId: opportunity.id,
        accountName,
        opportunityName,
        title: 'Champion missing on rescue deal',
        reason: missingChampion.reason,
        recommendedAction: 'Identify who can support the deal internally, or mark champion as missing before review.',
        urgency: 'high',
        dueDate: opportunity.nextActionDate,
        moneyAmount: amount,
        moneyCurrency: opportunity.currency,
        today,
      }));
    }

    if (missingEconomicBuyer && (opportunity.expectedClosePeriod || opportunity.nextActionDate)) {
      nudges.push(createNudge({
        source: 'stakeholder',
        entityType: 'opportunity',
        entityId: opportunity.id,
        accountName,
        opportunityName,
        title: 'Economic buyer unknown',
        reason: missingEconomicBuyer.reason,
        recommendedAction: 'Confirm who owns budget approval before defending close timing.',
        urgency: 'high',
        dueDate: opportunity.nextActionDate,
        moneyAmount: amount,
        moneyCurrency: opportunity.currency,
        today,
      }));
    }

    if (missingProcurement) {
      nudges.push(createNudge({
        source: 'stakeholder',
        entityType: 'opportunity',
        entityId: opportunity.id,
        accountName,
        opportunityName,
        title: 'Procurement path missing',
        reason: missingProcurement.reason,
        recommendedAction: 'Name the procurement owner or capture the procurement path before review.',
        urgency: 'medium',
        dueDate: opportunity.nextActionDate,
        moneyAmount: amount,
        moneyCurrency: opportunity.currency,
        today,
      }));
    }

    if (blockerRisk) {
      nudges.push(createNudge({
        source: 'objection',
        entityType: 'opportunity',
        entityId: opportunity.id,
        accountName,
        opportunityName,
        title: 'Blocker objection unresolved',
        reason: blockerRisk,
        recommendedAction: 'Attach proof, owner, and next action for the blocker before review.',
        urgency: 'high',
        dueDate: opportunity.nextActionDate,
        moneyAmount: amount,
        moneyCurrency: opportunity.currency,
        today,
      }));
    }

    if (overdueStakeholderAction) {
      nudges.push(createNudge({
        source: 'stakeholder',
        entityType: 'opportunity',
        entityId: opportunity.id,
        accountName,
        opportunityName,
        title: 'Stakeholder next action overdue',
        reason: `${overdueStakeholderAction.stakeholderName}: ${overdueStakeholderAction.action}`,
        recommendedAction: overdueStakeholderAction.action,
        urgency: 'critical',
        dueDate: overdueStakeholderAction.dueDate,
        moneyAmount: amount,
        moneyCurrency: opportunity.currency,
        today,
      }));
    }

    return nudges;
  });
}

export function formatNudgeDueDate(nudge: Pick<NudgeRecord, 'dueDate'>) {
  return formatSafeBusinessDate(nudge.dueDate);
}

export function formatNudgeMoney(nudge: Pick<NudgeRecord, 'moneyAmount' | 'moneyCurrency'>) {
  if (typeof nudge.moneyAmount !== 'number' || !nudge.moneyCurrency) return '';
  const baseAmount = convertMoney(nudge.moneyAmount, nudge.moneyCurrency);
  if (baseAmount === null) return `${formatCurrencyAmount(nudge.moneyAmount, nudge.moneyCurrency)} · Needs confirmation`;
  return `${formatCurrencyAmount(nudge.moneyAmount, nudge.moneyCurrency)} · ${formatBaseCurrencyAmount(baseAmount, true)}`;
}

export function isNudgeActiveToday(nudge: NudgeRecord, today = todayDateKey()) {
  return isActiveForToday(nudge, today);
}

function buildRevenueNudges(actions: RevenueActionItem[], today: string) {
  return actions.flatMap((action) => {
    const urgency = revenueUrgency(action.risk);
    if (!urgency) return [];
    const title = revenueTitle(action.risk);
    const reason = `${action.risk}: ${action.accountName || 'Needs confirmation'} / ${action.label || 'Needs confirmation'}`;
    return createNudge({
      source: 'revenue',
      entityType: action.source === 'Quote' ? 'quote' : 'opportunity',
      entityId: action.id,
      accountName: action.accountName || 'Needs confirmation',
      opportunityName: action.label || 'Needs confirmation',
      title,
      reason,
      recommendedAction: action.nextAction || 'Confirm the next commercial step.',
      urgency,
      dueDate: action.dueDate,
      moneyAmount: action.amount,
      moneyCurrency: action.currency,
      today,
    });
  });
}

function buildOpportunityNudges(opportunities: CrmLiteOpportunity[], today: string) {
  return opportunities.flatMap((opportunity) => {
    if (opportunity.status !== 'Active') return [];
    const nudges: NudgeRecord[] = [];
    const accountName = opportunity.accountName || 'Needs confirmation';
    const opportunityName = opportunity.opportunityName || 'Needs confirmation';
    const amount = opportunity.estimatedValue ?? opportunity.fy26Value ?? undefined;

    if (isBusinessDateOverdue(opportunity.nextActionDate, today)) {
      nudges.push(createNudge({
        source: 'opportunity',
        entityType: 'opportunity',
        entityId: opportunity.id,
        accountName,
        opportunityName,
        title: 'Next action overdue',
        reason: `Next action date has passed for ${accountName} / ${opportunityName}.`,
        recommendedAction: opportunity.nextAction || 'Confirm the next customer-facing action.',
        urgency: 'critical',
        dueDate: opportunity.nextActionDate,
        moneyAmount: amount,
        moneyCurrency: opportunity.currency,
        today,
      }));
    }

    if (opportunity.forecastEvidenceCategory === 'Unsupported' || opportunity.forecastEvidenceCategory === 'Hope-based') {
      nudges.push(createNudge({
        source: 'pipeline-defense',
        entityType: 'opportunity',
        entityId: opportunity.id,
        accountName,
        opportunityName,
        title: 'Missing forecast evidence',
        reason: `${opportunity.forecastEvidenceCategory} forecast: evidence is not strong enough to defend in review.`,
        recommendedAction: opportunity.nextAction || 'Capture customer proof, decision path, and next step before review.',
        urgency: opportunity.forecastEvidenceCategory === 'Unsupported' ? 'high' : 'medium',
        dueDate: opportunity.nextActionDate,
        moneyAmount: amount,
        moneyCurrency: opportunity.currency,
        today,
      }));
    }

    if (opportunity.decisionRecommendation === 'Rescue' || opportunity.decisionRecommendation === 'Downgrade') {
      nudges.push(createNudge({
        source: 'pipeline-defense',
        entityType: 'opportunity',
        entityId: opportunity.id,
        accountName,
        opportunityName,
        title: `${opportunity.decisionRecommendation} before review`,
        reason: `Pipeline Defense marks this deal as ${opportunity.decisionRecommendation.toLowerCase()} before review.`,
        recommendedAction: opportunity.decisionRecommendation === 'Rescue'
          ? 'Collect missing evidence or create a rescue action before the review.'
          : 'Prepare a clean downgrade answer and de-risk the forecast.',
        urgency: opportunity.decisionRecommendation === 'Downgrade' ? 'high' : 'medium',
        dueDate: opportunity.nextActionDate,
        moneyAmount: amount,
        moneyCurrency: opportunity.currency,
        today,
      }));
    }

    const missingMeddic = [
      opportunity.decisionMaker ? '' : 'Decision maker',
      opportunity.budgetOwner ? '' : 'Budget owner',
      opportunity.procurementPath ? '' : 'Procurement path',
      opportunity.technicalCriteria ? '' : 'Technical criteria',
      opportunity.expectedClosePeriod ? '' : 'Close period',
    ].filter(Boolean);
    if (missingMeddic.length >= 2) {
      nudges.push(createNudge({
        source: 'pipeline-defense',
        entityType: 'opportunity',
        entityId: opportunity.id,
        accountName,
        opportunityName,
        title: 'Missing MEDDIC context',
        reason: `Missing ${missingMeddic.slice(0, 3).join(', ')}${missingMeddic.length > 3 ? ' and more' : ''}.`,
        recommendedAction: 'Capture the missing review context before treating the deal as defensible.',
        urgency: 'medium',
        dueDate: opportunity.nextActionDate,
        moneyAmount: amount,
        moneyCurrency: opportunity.currency,
        today,
      }));
    }

    return nudges;
  });
}

const SILENCE_WARNING_DAYS = 7;
const SILENCE_CRITICAL_DAYS = 14;

export type OpportunitySilenceState = {
  status: 'silent' | 'at-risk' | 'quiet-ok' | 'planned' | 'inactive';
  daysQuiet: number | null;
  lastTouchDate: string;
};

export function classifyOpportunitySilence(
  opportunity: CrmLiteOpportunity,
  activities: SalesActivityRecord[],
  today = todayDateKey(),
): OpportunitySilenceState {
  if (opportunity.status !== 'Active') return { status: 'inactive', daysQuiet: null, lastTouchDate: '' };
  const lastTouch = findLastTouchDate(opportunity, activities);
  if (isValidBusinessDate(opportunity.nextActionDate)) return { status: 'planned', daysQuiet: null, lastTouchDate: lastTouch };
  const quietSince = lastTouch || sanitizeBusinessDate(timestampToLocalDateKey(opportunity.createdAt));
  const daysQuiet = daysBetweenBusinessDates(quietSince, sanitizeBusinessDate(today));
  if (daysQuiet === null) return { status: 'quiet-ok', daysQuiet: null, lastTouchDate: lastTouch };
  if (daysQuiet >= SILENCE_CRITICAL_DAYS) return { status: 'silent', daysQuiet, lastTouchDate: lastTouch };
  if (daysQuiet >= SILENCE_WARNING_DAYS) return { status: 'at-risk', daysQuiet, lastTouchDate: lastTouch };
  return { status: 'quiet-ok', daysQuiet, lastTouchDate: lastTouch };
}

function buildSilenceRiskNudges(input: ProactiveNudgeInput, today: string) {
  const activities = input.activities || [];
  return (input.opportunities || []).flatMap((opportunity) => {
    const silence = classifyOpportunitySilence(opportunity, activities, today);
    if (silence.status !== 'silent' && silence.status !== 'at-risk') return [];
    const lastTouch = silence.lastTouchDate;
    const quietSince = lastTouch || sanitizeBusinessDate(timestampToLocalDateKey(opportunity.createdAt));
    const critical = silence.status === 'silent';
    const accountName = opportunity.accountName || 'Needs confirmation';
    const opportunityName = opportunity.opportunityName || 'Needs confirmation';
    const amount = opportunity.estimatedValue ?? opportunity.fy26Value ?? undefined;
    return [createNudge({
      source: 'opportunity',
      entityType: 'opportunity',
      entityId: opportunity.id,
      accountName,
      opportunityName,
      title: critical ? 'Deal going silent' : 'Silence risk',
      reason: lastTouch
        ? `No customer touch since ${formatSafeBusinessDate(lastTouch)} and no next action is scheduled for ${accountName} / ${opportunityName}.`
        : `No customer touch recorded since this opportunity was created on ${formatSafeBusinessDate(quietSince)}, and no next action is scheduled.`,
      recommendedAction: opportunity.nextAction
        ? `Put a date on the planned next action: ${opportunity.nextAction}`
        : 'Book the next customer touch or send the follow-up now, before this deal goes quiet.',
      urgency: critical ? 'critical' : 'high',
      moneyAmount: amount,
      moneyCurrency: opportunity.currency,
      today,
    })];
  });
}

function findLastTouchDate(opportunity: CrmLiteOpportunity, activities: SalesActivityRecord[]) {
  const normalize = (value?: string) => (value || '').trim().toLowerCase();
  const accountKey = normalize(opportunity.accountName);
  return activities
    .filter((activity) => activity.linkedOpportunityId === opportunity.id
      || (accountKey !== '' && (normalize(activity.accountName) === accountKey || normalize(activity.linkedAccountName) === accountKey)))
    .map((activity) => activity.activityDate)
    .filter(isValidBusinessDate)
    .sort(compareSafeBusinessDate)
    .at(-1) || '';
}

function daysBetweenBusinessDates(start: string, end: string) {
  if (!isValidBusinessDate(start) || !isValidBusinessDate(end)) return null;
  const elapsed = Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`);
  return Math.floor(elapsed / 86_400_000);
}

function buildPipelineDefenseNudges(briefs: PipelineDefenseBrief[], today: string) {
  return briefs.flatMap((brief) => (brief.deals || []).flatMap((deal) => {
    const item = buildManagerReadyDealBrief(deal, today);
    const nudges: NudgeRecord[] = [];
    const entityId = deal.sourceOpportunityId || deal.id;
    const moneyAmount = typeof deal.estimatedValue === 'number' ? deal.estimatedValue : undefined;
    if (item.decision === 'Rescue' || item.decision === 'Downgrade') {
      nudges.push(createNudge({
        source: 'pipeline-defense',
        entityType: 'opportunity',
        entityId,
        accountName: item.account,
        opportunityName: item.opportunity,
        title: `${item.decision} before review`,
        reason: item.pipelineReviewAnswer || `${item.opportunity} needs a ${item.decision.toLowerCase()} decision before review.`,
        recommendedAction: item.nextAction,
        urgency: item.decision === 'Downgrade' ? 'high' : 'medium',
        dueDate: deal.nextActionDate,
        moneyAmount,
        moneyCurrency: deal.currency,
        today,
      }));
    }
    if (item.missingContext.length > 0) {
      nudges.push(createNudge({
        source: 'pipeline-defense',
        entityType: 'opportunity',
        entityId,
        accountName: item.account,
        opportunityName: item.opportunity,
        title: 'Evidence missing from manager brief',
        reason: `Missing context: ${item.missingContext.slice(0, 3).join(', ')}${item.missingContext.length > 3 ? ' and more' : ''}.`,
        recommendedAction: 'Fill the missing evidence before copying the manager brief.',
        urgency: 'medium',
        dueDate: deal.nextActionDate,
        moneyAmount,
        moneyCurrency: deal.currency,
        today,
      }));
    }
    if (isBusinessDateOverdue(deal.nextActionDate, today)) {
      nudges.push(createNudge({
        source: 'pipeline-defense',
        entityType: 'opportunity',
        entityId,
        accountName: item.account,
        opportunityName: item.opportunity,
        title: 'Defense action overdue',
        reason: `The review action for ${item.account} / ${item.opportunity} is overdue.`,
        recommendedAction: item.nextAction,
        urgency: 'critical',
        dueDate: deal.nextActionDate,
        moneyAmount,
        moneyCurrency: deal.currency,
        today,
      }));
    }
    return nudges;
  }));
}

function buildObjectionNudges(objections: ObjectionRecord[]) {
  return objections.flatMap((objection) => {
    if (objection.status !== 'Open') return [];
    return createNudge({
      source: 'objection',
      entityType: 'objection',
      entityId: objection.id,
      accountName: objection.accountName || 'Needs confirmation',
      opportunityName: objection.opportunityName || 'Needs confirmation',
      title: 'Unresolved objection',
      reason: objection.objectionText || 'Open objection needs proof before review.',
      recommendedAction: objection.responsePlan || objection.requiredProof || 'Define response proof and owner.',
      urgency: objection.impact === 'High' ? 'high' : 'medium',
      dueDate: objection.dueDate,
      today: todayDateKey(),
    });
  });
}

function buildCaptureNudges(activities: SalesActivityRecord[], today: string) {
  return activities
    .filter((activity) => activity.linkStatus === 'Unlinked' || activity.linkStatus === 'Suggested')
    .slice(0, 6)
    .map((activity) => createNudge({
      source: 'capture',
      entityType: 'activity',
      entityId: activity.id,
      accountName: activity.accountName || activity.linkedAccountName || 'Needs confirmation',
      opportunityName: activity.opportunityName || activity.linkedOpportunityName || 'Needs confirmation',
      title: 'Capture needs confirmation',
      reason: activity.linkStatus === 'Suggested'
        ? 'Captured evidence has a suggested link that needs review.'
        : 'Captured evidence is not linked to an account or opportunity.',
      recommendedAction: 'Review the captured note and link it to the right pipeline evidence.',
      urgency: 'low',
      dueDate: activity.dueDate,
      today,
    }));
}

function buildAccountSignalNudges(input: ProactiveNudgeInput, today: string) {
  const opportunities = input.opportunities || [];
  const activities = input.activities || [];
  const objections = input.objections || [];
  const quotes = input.quotes || [];
  return (input.accounts || []).flatMap((account) => {
    const preference = (input.accountPreferences || []).find((item) => item.accountId === account.id);
    const classification = classifyAccountEngagement({ account, opportunities, activities, objections, quotes, preference, today });
    if (classification.status === 'Imported only' || classification.status === 'Archived') return [];
    if (classification.status !== 'Active' && classification.status !== 'Strategic') return [];
    if (hasRecentAccountSignal(account, activities, today)) return [];
    return createNudge({
      source: 'stakeholder',
      entityType: 'account',
      entityId: account.id,
      accountName: account.accountName || 'Needs confirmation',
      opportunityName: '',
      title: 'No recent signal on important account',
      reason: `${classification.status} account has no recent captured customer signal.`,
      recommendedAction: 'Capture a real update or confirm whether this account should stay active.',
      urgency: classification.status === 'Strategic' ? 'medium' : 'low',
      dueDate: account.nextFollowUp,
      today,
    });
  });
}

function buildOutcomeLearningNudges(input: ProactiveNudgeInput, today: string) {
  const deals = (input.briefs || []).flatMap((brief) => brief.deals || []);
  const learning = analyzePersonalSalesLearning({
    outcomes: input.opportunityOutcomes || [],
    opportunities: input.opportunities || [],
    deals,
    limit: 6,
  });
  const warning = learning.warnings[0];
  if (!warning && !learning.todayNudge) return [];
  return [createNudge({
    source: 'outcome-learning',
    entityType: warning ? 'opportunity' : 'system',
    entityId: warning?.opportunityId || 'outcome-learning',
    accountName: warning?.accountName || '',
    opportunityName: warning?.opportunityName || '',
    title: 'Outcome-learning risk pattern',
    reason: warning?.warning || learning.todayNudge,
    recommendedAction: 'Treat this as a cautious risk signal: check evidence before defending.',
    urgency: 'medium',
    today,
  })];
}

export const INITIATIVE_STALL_DAYS = 14;

export type InitiativeHealth = {
  status: 'overdue-step' | 'quiet' | 'active' | 'closed';
  daysQuiet: number | null;
  lastMention: string;
};

/**
 * Phase 2 of the Business Activity OS pivot: initiatives (projects, offers,
 * experiments) go quiet exactly like deals do. An open initiative counts as
 * stalled when its next step is overdue, or when no captured activity has
 * mentioned it for 14+ days. Shared by the nudge engine and the Weekly
 * Business Review.
 */
// Mirrors isOperatingContextClosed in operatingContextStore; kept local so the
// nudge engine stays executable outside the browser (contract scripts).
function isInitiativeClosed(context: OperatingContextRecord) {
  return /complete|completed|done|closed|cancel|lost/i.test(context.status);
}

export function classifyInitiativeHealth(
  context: OperatingContextRecord,
  activities: SalesActivityRecord[],
  today = todayDateKey(),
): InitiativeHealth {
  if (isInitiativeClosed(context) || !context.title?.trim()) {
    return { status: 'closed', daysQuiet: null, lastMention: '' };
  }
  if (isBusinessDateOverdue(context.nextDate, today)) {
    return { status: 'overdue-step', daysQuiet: null, lastMention: '' };
  }
  const lastMention = findLastInitiativeMention(context.title, activities);
  const quietSince = lastMention || sanitizeBusinessDate(timestampToLocalDateKey(context.createdAt));
  const daysQuiet = daysBetweenBusinessDates(quietSince, sanitizeBusinessDate(today));
  if (daysQuiet !== null && daysQuiet >= INITIATIVE_STALL_DAYS) {
    return { status: 'quiet', daysQuiet, lastMention };
  }
  return { status: 'active', daysQuiet, lastMention };
}

function buildInitiativeStalledNudges(input: ProactiveNudgeInput, today: string) {
  const activities = input.activities || [];
  return (input.operatingContexts || []).flatMap((context) => {
    const health = classifyInitiativeHealth(context, activities, today);
    const title = context.title?.trim() || '';

    if (health.status === 'overdue-step') {
      return [createNudge({
        source: 'initiative',
        entityType: 'initiative',
        entityId: context.id,
        accountName: '',
        opportunityName: title,
        title: 'Initiative next step overdue',
        reason: `"${title}" has a next step dated ${formatSafeBusinessDate(context.nextDate)} that has passed.`,
        recommendedAction: context.nextAction || 'Do the next step, reschedule it, or close the initiative.',
        urgency: 'high',
        dueDate: context.nextDate,
        moneyAmount: context.valueAtStake ?? undefined,
        today,
      })];
    }

    if (health.status !== 'quiet') return [];
    return [createNudge({
      source: 'initiative',
      entityType: 'initiative',
      entityId: context.id,
      accountName: '',
      opportunityName: title,
      title: 'Initiative going quiet',
      reason: health.lastMention
        ? `No captured activity has mentioned "${title}" since ${formatSafeBusinessDate(health.lastMention)}.`
        : `No captured activity has mentioned "${title}" since it was created.`,
      recommendedAction: context.nextAction || 'Capture the latest update, book the next step, or close this initiative.',
      urgency: 'medium',
      moneyAmount: context.valueAtStake ?? undefined,
      today,
    })];
  });
}

function findLastInitiativeMention(title: string, activities: SalesActivityRecord[]) {
  const tokens = normalize(title).split(' ').filter((token) => token.length >= 4);
  if (tokens.length === 0) return '';
  return activities
    .filter((activity) => {
      const text = normalize(`${activity.summary} ${activity.rawNote} ${(activity.tags || []).join(' ')}`);
      return tokens.some((token) => text.includes(token));
    })
    .map((activity) => activity.activityDate)
    .filter(isValidBusinessDate)
    .sort(compareSafeBusinessDate)
    .at(-1) || '';
}

function buildImportedAccountInfoNudges(input: ProactiveNudgeInput, today: string) {
  const hidden = countImportedOnlyAccounts(input, today);
  if (hidden === 0) return [];
  return [createNudge({
    source: 'pipeline-defense',
    entityType: 'system',
    entityId: 'imported-account-hygiene',
    accountName: '',
    opportunityName: '',
    title: 'Imported accounts hidden from active work',
    reason: `${hidden.toLocaleString()} imported accounts are searchable but are not treated as urgent work.`,
    recommendedAction: 'Search when needed, or mark a real account as strategic after there is a reason.',
    urgency: 'low',
    today,
  })];
}

function createNudge(input: {
  source: NudgeSource;
  entityType: NudgeRecord['entityType'];
  entityId?: string;
  accountName?: string;
  opportunityName?: string;
  title: string;
  reason: string;
  recommendedAction: string;
  urgency: NudgeUrgency;
  dueDate?: string;
  moneyAmount?: number;
  moneyCurrency?: string;
  today: string;
}): NudgeRecord {
  const dueDate = sanitizeBusinessDate(input.dueDate);
  const moneyCurrency = input.moneyCurrency ? input.moneyCurrency.trim().toUpperCase() : '';
  const identity = [
    input.source,
    input.entityType,
    input.entityId || input.accountName || input.opportunityName || 'system',
    input.title,
    input.reason,
    dueDate,
    typeof input.moneyAmount === 'number' ? String(input.moneyAmount) : '',
    moneyCurrency,
  ].join('|');
  const now = `${input.today}T00:00:00.000Z`;
  return {
    id: `nudge-${slugify(input.source)}-${slugify(input.entityType)}-${hashString(identity)}`,
    source: input.source,
    entityType: input.entityType,
    entityId: input.entityId || '',
    accountName: input.accountName?.trim() || '',
    opportunityName: input.opportunityName?.trim() || '',
    title: input.title.trim(),
    reason: input.reason.trim(),
    recommendedAction: input.recommendedAction.trim(),
    urgency: input.urgency,
    dueDate,
    moneyAmount: input.moneyAmount,
    moneyCurrency,
    status: 'active',
    snoozedUntil: '',
    createdAt: now,
    updatedAt: now,
    storageMode: 'local',
  };
}

function applyPersistedState(generated: NudgeRecord, persisted?: NudgeRecord) {
  if (!persisted) return generated;
  return {
    ...generated,
    userId: persisted.userId,
    status: persisted.status,
    snoozedUntil: persisted.snoozedUntil,
    createdAt: persisted.createdAt || generated.createdAt,
    updatedAt: persisted.updatedAt || generated.updatedAt,
    storageMode: persisted.storageMode || generated.storageMode,
  };
}

function isActiveForToday(nudge: NudgeRecord, today: string) {
  if (nudge.status === 'dismissed' || nudge.status === 'done') return false;
  if (nudge.status === 'snoozed' && isValidBusinessDate(nudge.snoozedUntil)) {
    return compareSafeBusinessDate(nudge.snoozedUntil, today) <= 0;
  }
  return true;
}

function capTodayNudges(nudges: NudgeRecord[], limit: number) {
  const output: NudgeRecord[] = [];
  let outcomeLearningCount = 0;
  let importedInfoCount = 0;
  nudges.forEach((nudge) => {
    if (output.length >= limit) return;
    if (nudge.source === 'outcome-learning') {
      if (outcomeLearningCount >= 1) return;
      outcomeLearningCount += 1;
    }
    if (isImportedAccountInfo(nudge)) {
      if (importedInfoCount >= 1) return;
      importedInfoCount += 1;
    }
    output.push(nudge);
  });
  return output;
}

function dedupeNudges(nudges: NudgeRecord[]) {
  const seen = new Map<string, NudgeRecord>();
  nudges.forEach((nudge) => {
    const key = [
      nudge.source,
      nudge.entityType,
      nudge.entityId || normalize(nudge.accountName || nudge.opportunityName || 'system'),
      normalize(nudge.reason),
    ].join('|');
    const existing = seen.get(key);
    if (!existing || compareNudges(nudge, existing) < 0) seen.set(key, nudge);
  });
  return Array.from(seen.values());
}

function compareNudges(left: NudgeRecord, right: NudgeRecord) {
  return urgencyRank(right.urgency) - urgencyRank(left.urgency)
    || overdueRank(right) - overdueRank(left)
    || sourceRank(right.source) - sourceRank(left.source)
    || compareSafeBusinessDate(left.dueDate, right.dueDate)
    || left.title.localeCompare(right.title);
}

function overdueRank(nudge: NudgeRecord) {
  return isBusinessDateOverdue(nudge.dueDate) ? 1 : 0;
}

function urgencyRank(urgency: NudgeUrgency) {
  return { critical: 4, high: 3, medium: 2, low: 1 }[urgency];
}

function sourceRank(source: NudgeSource) {
  return {
    revenue: 8,
    opportunity: 7,
    'pipeline-defense': 6,
    objection: 5,
    initiative: 4,
    'outcome-learning': 3,
    capture: 2,
    stakeholder: 1,
  }[source];
}

function revenueUrgency(risk: RevenueActionItem['risk']): NudgeUrgency | null {
  if (risk === 'Payment overdue' || risk === 'Delivery overdue' || risk === 'Quote expired') return 'critical';
  if (risk === 'Quote expiring' || risk === 'Payment term missing' || risk === 'Weak pipeline') return 'high';
  if (risk === 'Waiting on PO' || risk === 'Waiting on delivery' || risk === 'Waiting on payment' || risk === 'Commercial follow-up') return 'medium';
  return null;
}

function revenueTitle(risk: RevenueActionItem['risk']) {
  if (risk === 'Quote expiring') return 'Quote expiring soon';
  if (risk === 'Payment overdue') return 'Payment overdue';
  if (risk === 'Delivery overdue') return 'Delivery overdue';
  if (risk === 'Quote expired') return 'Quote expired';
  if (risk === 'Weak pipeline') return 'Weak forecast risk';
  return 'Commercial follow-up needed';
}

function countImportedOnlyAccounts(input: ProactiveNudgeInput, today: string) {
  return (input.accounts || []).filter((account) => {
    const preference = (input.accountPreferences || []).find((item) => item.accountId === account.id);
    const classification = classifyAccountEngagement({
      account,
      opportunities: input.opportunities || [],
      activities: input.activities || [],
      objections: input.objections || [],
      quotes: input.quotes || [],
      preference,
      today,
    });
    return classification.status === 'Imported only';
  }).length;
}

function hasRecentAccountSignal(account: AccountMemoryRecord, activities: SalesActivityRecord[], today: string) {
  return activities.some((activity) => {
    const accountMatches = normalize(activity.accountName) === normalize(account.accountName)
      || normalize(activity.linkedAccountName) === normalize(account.accountName);
    if (!accountMatches || !isValidBusinessDate(activity.activityDate)) return false;
    const age = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${activity.activityDate}T00:00:00Z`)) / 86_400_000;
    return age >= 0 && age <= 30;
  });
}

function isImportedAccountInfo(nudge: NudgeRecord) {
  return nudge.entityType === 'system' && nudge.entityId === 'imported-account-hygiene';
}

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function slugify(value: string) {
  return normalize(value).replace(/\s+/g, '-').slice(0, 40) || 'item';
}

function normalize(value = '') {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
