import type { CrmLiteOpportunity, ForecastEvidenceCategory, OpportunityStage } from '../services/opportunityStore.ts';
import { forecastEvidenceCategories, opportunityStages } from '../services/opportunityStore.ts';
import {
  getOpportunityOutcomesForOpportunity,
  type OpportunityOutcomeRecord,
} from '../services/opportunityOutcomeStore.ts';
import type { QuoteRecord } from '../services/quoteStore.ts';
import type { SalesActivityRecord } from '../services/salesActivityStore.ts';
import type { ExpenseRecord } from '../services/expenseStore.ts';
import { buildMoneyFlow } from './moneyFlow.ts';
import { buildCashPosition, getOpeningCashBalance, type CategorySpendRow } from './cashPosition.ts';
import { buildOwnObligations } from './ownObligations.ts';
import { buildPlanBoard, buildCaptureDerivedKey, getDatedCaptureActions, type PlanRecord } from './weeklyPlan.ts';
import { getReportingCurrency, sumMoney, type SupportedCurrency } from './money.ts';
import { isValidBusinessDate, sanitizeBusinessDate, todayDateKey } from './safeDate.ts';
import { normalizeEntityName } from './accountIdentity.ts';

export type StageMixRow = {
  stage: OpportunityStage;
  count: number;
  totalBase: number;
};

export type EvidenceMixRow = {
  category: ForecastEvidenceCategory;
  count: number;
};

export type WeeklyActivityPoint = {
  weekStart: string;
  label: string;
  count: number;
};

export type MasterDashboardModel = {
  reportingCurrency: SupportedCurrency;
  kpis: {
    openDeals: number;
    openPipelineBase: number;
    stuckThreads: number;
    inMotionBase: number;
    activitiesLast30: number;
    openQuotes: number;
  };
  money: {
    collectedRevenueBase: number;
    paidExpensesBase: number;
    realizedProfitBase: number;
    projectedDeltaBase: number;
    cashOnHandBase: number | null;
    categorySpend: CategorySpendRow[];
  };
  stageMix: StageMixRow[];
  evidenceMix: EvidenceMixRow[];
  /**
   * What the records say about the pipeline, next to what the operator has said
   * about it.
   *
   * `evidenceMix` counts `forecastEvidenceCategory`, which is a field somebody
   * has to grade by hand. Nobody has graded an imported book, so every deal
   * carries the same imported default - and the card asking "is the pipeline
   * believable?" drew one full-width bar reading "Weak but recoverable: 18",
   * which is the whole pipeline in one colour and answers nothing. Worse, that
   * card's own subtitle promises evidence "not how they feel", and the field it
   * reads is exactly how they feel.
   *
   * These four are derived from the records themselves, so the card has a true
   * answer to fall back on when nobody has graded anything.
   */
  evidence: {
    /** True once the operator has actually graded: more than one category in play. */
    graded: boolean;
    activeDeals: number;
    noDecisionMaker: number;
    noTouch: number;
    noNextStep: number;
  };
  weeklyActivity: WeeklyActivityPoint[];
  outcomes: {
    /** `missingRetro`: closed deals still valued at their forecast, not a signed figure. */
    won: { count: number; totalBase: number; missingRetro: number };
    lost: { count: number; totalBase: number; missingRetro: number };
  };
  /**
   * How the operating loop is actually being run this week, and the proof that
   * a thing recorded once flows all the way through: captured, on the plan
   * without re-entry, and completed.
   */
  execution: {
    weekStart: string;
    weekEnd: string;
    planned: number;
    done: number;
    adherenceRate: number | null;
    fromCaptures: number;
    fromPipeline: number;
    personal: number;
    // Record-once funnel over the recent activity window.
    capturedNextActions: number;
    onPlan: number;
    completedNextActions: number;
    /** Of the captured actions, those whose day has arrived (done or overdue). */
    dueNextActions: number;
  };
};

type MasterDashboardInput = {
  opportunities: CrmLiteOpportunity[];
  activities: SalesActivityRecord[];
  quotes: QuoteRecord[];
  expenses: ExpenseRecord[];
  opportunityOutcomes: OpportunityOutcomeRecord[];
  /** The plan's records, so adherence and follow-through can be measured. */
  planRecords?: PlanRecord[];
  today?: string;
};

const WEEKS_SHOWN = 8;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * One derived model for the master Dashboard: Today owns "what do I do now",
 * this owns "how is the business doing" - charts and totals only, no actions.
 * Derived, never stored, and always reported in the reporting currency.
 */
export function buildMasterDashboard(input: MasterDashboardInput): MasterDashboardModel {
  const todayKey = sanitizeBusinessDate(input.today) || todayDateKey();
  const reportingCurrency = getReportingCurrency();
  const activeOpportunities = input.opportunities.filter((opportunity) => opportunity.status === 'Active');

  const stageMix: StageMixRow[] = opportunityStages
    .map((stage) => {
      const inStage = activeOpportunities.filter((opportunity) => opportunity.stage === stage);
      return {
        stage,
        count: inStage.length,
        totalBase: sumMoney(inStage.map((opportunity) => ({
          amount: opportunity.estimatedValue ?? opportunity.fy26Value ?? null,
          currency: opportunity.currency,
        }))),
      };
    })
    .filter((row) => row.count > 0);

  const evidenceMix: EvidenceMixRow[] = forecastEvidenceCategories
    .map((category) => ({
      category,
      count: activeOpportunities.filter((opportunity) => opportunity.forecastEvidenceCategory === category).length,
    }))
    .filter((row) => row.count > 0);

  const touchedDealKeys = new Set(
    input.activities
      .filter((activity) => isValidBusinessDate(activity.activityDate))
      .flatMap((activity) => {
        const keys: string[] = [];
        if (activity.linkedOpportunityId) keys.push(`id:${activity.linkedOpportunityId}`);
        const account = normalizeEntityName(activity.linkedAccountName || activity.accountName || '');
        const opportunity = normalizeEntityName(activity.opportunityName || '');
        if (account && opportunity) keys.push(`name:${account}|${opportunity}`);
        return keys;
      }),
  );
  const hasTouch = (opportunity: CrmLiteOpportunity) => (
    touchedDealKeys.has(`id:${opportunity.id}`)
    || touchedDealKeys.has(`name:${normalizeEntityName(opportunity.accountName || '')}|${normalizeEntityName(opportunity.opportunityName || '')}`)
  );
  const evidence = {
    graded: evidenceMix.length > 1,
    activeDeals: activeOpportunities.length,
    noDecisionMaker: activeOpportunities.filter((opportunity) => !(opportunity.decisionMaker || '').trim()).length,
    noTouch: activeOpportunities.filter((opportunity) => !hasTouch(opportunity)).length,
    noNextStep: activeOpportunities.filter((opportunity) => !isValidBusinessDate(opportunity.nextActionDate)).length,
  };

  const outcomes = {
    won: bucketClosedDeals(input.opportunities, input.opportunityOutcomes, 'Won'),
    lost: bucketClosedDeals(input.opportunities, input.opportunityOutcomes, 'Lost'),
  };
  const moneyFlow = buildMoneyFlow({ opportunities: input.opportunities, quotes: input.quotes, today: todayKey });
  const cash = buildCashPosition({
    quotes: input.quotes,
    expenses: input.expenses,
    openingBalanceBase: getOpeningCashBalance(),
    today: todayKey,
  });

  const todayDate = new Date(`${todayKey}T00:00:00`);
  const thirtyDaysAgo = new Date(todayDate.getTime() - 30 * DAY_MS);
  const activitiesLast30 = input.activities.filter((activity) => {
    const date = parseBusinessDate(activity.activityDate);
    return date !== null && date >= thirtyDaysAgo && date <= todayDate;
  }).length;

  const execution = buildExecution({
    opportunities: input.opportunities,
    activities: input.activities,
    quotes: input.quotes,
    expenses: input.expenses,
    planRecords: input.planRecords || [],
    todayKey,
    todayDate,
    thirtyDaysAgo,
  });

  return {
    reportingCurrency,
    kpis: {
      openDeals: activeOpportunities.length,
      openPipelineBase: stageMix.reduce((total, row) => total + row.totalBase, 0),
      stuckThreads: moneyFlow.stuckThreads.length,
      inMotionBase: moneyFlow.totalInMotionBase,
      activitiesLast30,
      openQuotes: input.quotes.filter((quote) => !quote.__deleted
        && (quote.status === 'Draft' || quote.status === 'Sent' || quote.status === 'Revised')).length,
    },
    money: {
      collectedRevenueBase: cash.collectedRevenueBase,
      paidExpensesBase: cash.paidExpensesBase,
      realizedProfitBase: cash.realizedProfitBase,
      projectedDeltaBase: cash.projectedDeltaBase,
      cashOnHandBase: cash.cashOnHandBase,
      categorySpend: cash.categorySpend,
    },
    stageMix,
    evidenceMix,
    evidence,
    weeklyActivity: buildWeeklyActivity(input.activities, todayDate),
    outcomes,
    execution,
  };
}

/**
 * This week's plan adherence plus the record-once funnel. Everything the plan
 * board already derives is reused here rather than recomputed, so the Dashboard
 * can never disagree with Plan about what "done" means.
 */
function buildExecution(input: {
  opportunities: CrmLiteOpportunity[];
  activities: SalesActivityRecord[];
  quotes: QuoteRecord[];
  expenses: ExpenseRecord[];
  planRecords: PlanRecord[];
  todayKey: string;
  todayDate: Date;
  thirtyDaysAgo: Date;
}): MasterDashboardModel['execution'] {
  const obligations = buildOwnObligations({ expenses: input.expenses, quotes: input.quotes, today: input.todayKey }).obligations;
  const board = buildPlanBoard({
    periodType: 'week',
    anchorDate: input.todayDate,
    opportunities: input.opportunities,
    obligations,
    activities: input.activities,
    records: input.planRecords,
    today: input.todayKey,
  });

  const doneKeys = new Set(
    input.planRecords
      .filter((record) => record.__deleted !== true && record.derivedKey && record.done)
      .map((record) => record.derivedKey as string),
  );

  const recentActivities = input.activities.filter((activity) => {
    const date = parseBusinessDate(activity.activityDate);
    return date !== null && date >= input.thirtyDaysAgo && date <= input.todayDate;
  });

  let capturedNextActions = 0;
  let completedNextActions = 0;
  // Actions still ahead of their due date are not counted as due: a week spent
  // capturing future commitments must not read as a week of misses.
  let dueNextActions = 0;
  recentActivities.forEach((activity) => {
    getDatedCaptureActions(activity).forEach((candidate) => {
      capturedNextActions += 1;
      const isDone = doneKeys.has(buildCaptureDerivedKey(activity.id, candidate.dueDate, candidate.slot));
      if (isDone) completedNextActions += 1;
      if (isDone || candidate.dueDate < input.todayKey) dueNextActions += 1;
    });
  });

  return {
    weekStart: board.rangeStart,
    weekEnd: board.rangeEnd,
    planned: board.totalCount,
    done: board.doneCount,
    adherenceRate: board.totalCount === 0 ? null : board.doneCount / board.totalCount,
    fromCaptures: board.captureCount,
    fromPipeline: board.derivedCount - board.captureCount,
    personal: board.personalCount,
    // Every dated captured action derives onto the plan, so "on plan" equals
    // "captured" by construction - that is the point being shown: nothing is
    // re-entered between capturing it and planning it.
    capturedNextActions,
    onPlan: capturedNextActions,
    completedNextActions,
    dueNextActions,
  };
}

/**
 * What actually closed, counted from the deals rather than from the retros.
 *
 * This read the retro records alone, which made "Won" mean two different things
 * in two rooms: Opportunities showed deals marked Won, and this card showed 0
 * SGD beside them. Both were "correct" - the card was counting outcome records,
 * and a deal can reach Won without one (imported that way, or already closed
 * before the retro was ever asked for). Correct is not the bar. A dashboard
 * that reports zero revenue to an operator looking at their own won deals is
 * simply wrong about the business, and it is the kind of wrong that ends
 * trust in every other number on the page.
 *
 * So the deal is the source of truth for *what closed*, and the retro is the
 * better source for *how much* - `finalAmount` is the figure actually signed,
 * where `estimatedValue` was only ever a forecast. Retro first, deal value as
 * the fallback, and `missingRetro` counts the ones that can still only be
 * answered by the forecast, so the card can say so instead of implying a
 * precision it does not have.
 */
function bucketClosedDeals(
  opportunities: CrmLiteOpportunity[],
  records: OpportunityOutcomeRecord[],
  outcome: 'Won' | 'Lost',
) {
  const closed = opportunities.filter((opportunity) => opportunity.status === outcome);
  let missingRetro = 0;

  const amounts = closed.map((opportunity) => {
    const retro = getOpportunityOutcomesForOpportunity(records, opportunity)
      .find((record) => record.outcome === outcome);
    if (retro && typeof retro.finalAmount === 'number') {
      return { amount: retro.finalAmount, currency: retro.currency || opportunity.currency };
    }
    missingRetro += 1;
    return { amount: opportunity.estimatedValue ?? opportunity.fy26Value ?? null, currency: opportunity.currency };
  });

  return { count: closed.length, totalBase: sumMoney(amounts), missingRetro };
}

function buildWeeklyActivity(activities: SalesActivityRecord[], today: Date): WeeklyActivityPoint[] {
  // Weeks start on Monday; the last bucket is the current (possibly partial) week.
  const currentWeekStart = startOfWeek(today);
  const weeks: WeeklyActivityPoint[] = [];

  for (let index = WEEKS_SHOWN - 1; index >= 0; index -= 1) {
    const weekStart = new Date(currentWeekStart.getTime() - index * 7 * DAY_MS);
    const weekEnd = new Date(weekStart.getTime() + 7 * DAY_MS);
    const count = activities.filter((activity) => {
      const date = parseBusinessDate(activity.activityDate);
      return date !== null && date >= weekStart && date < weekEnd;
    }).length;
    weeks.push({
      weekStart: toDateKey(weekStart),
      label: `${weekStart.getDate()}/${weekStart.getMonth() + 1}`,
      count,
    });
  }

  return weeks;
}

function startOfWeek(date: Date) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = result.getDay();
  const daysSinceMonday = (day + 6) % 7;
  result.setDate(result.getDate() - daysSinceMonday);
  return result;
}

function parseBusinessDate(value?: string | null): Date | null {
  const sanitized = sanitizeBusinessDate(value);
  if (!sanitized) return null;
  const parsed = new Date(`${sanitized}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toDateKey(date: Date) {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}
