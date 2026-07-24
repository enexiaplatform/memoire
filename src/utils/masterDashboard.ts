import type { CrmLiteOpportunity, ForecastEvidenceCategory, OpportunityStage } from '../services/opportunityStore.ts';
import { forecastEvidenceCategories, opportunityStages } from '../services/opportunityStore.ts';
import type { OpportunityOutcomeRecord } from '../services/opportunityOutcomeStore.ts';
import type { QuoteRecord } from '../services/quoteStore.ts';
import type { SalesActivityRecord } from '../services/salesActivityStore.ts';
import type { ExpenseRecord } from '../services/expenseStore.ts';
import { buildMoneyFlow } from './moneyFlow.ts';
import { buildCashPosition, getOpeningCashBalance, type CategorySpendRow } from './cashPosition.ts';
import { buildOwnObligations } from './ownObligations.ts';
import { buildPlanBoard, buildCaptureDerivedKey, getDatedCaptureActions, type PlanRecord } from './weeklyPlan.ts';
import { getReportingCurrency, sumMoney, type SupportedCurrency } from './money.ts';
import { sanitizeBusinessDate, todayDateKey } from './safeDate.ts';

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
  weeklyActivity: WeeklyActivityPoint[];
  outcomes: {
    won: { count: number; totalBase: number };
    lost: { count: number; totalBase: number };
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

  const outcomes = { won: bucketOutcomes(input.opportunityOutcomes, 'Won'), lost: bucketOutcomes(input.opportunityOutcomes, 'Lost') };
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

function bucketOutcomes(records: OpportunityOutcomeRecord[], outcome: 'Won' | 'Lost') {
  const matching = records.filter((record) => record.outcome === outcome);
  return {
    count: matching.length,
    totalBase: sumMoney(matching.map((record) => ({ amount: record.finalAmount, currency: record.currency }))),
  };
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
