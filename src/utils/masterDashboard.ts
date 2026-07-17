import type { CrmLiteOpportunity, ForecastEvidenceCategory, OpportunityStage } from '../services/opportunityStore.ts';
import { forecastEvidenceCategories, opportunityStages } from '../services/opportunityStore.ts';
import type { OpportunityOutcomeRecord } from '../services/opportunityOutcomeStore.ts';
import type { QuoteRecord } from '../services/quoteStore.ts';
import type { SalesActivityRecord } from '../services/salesActivityStore.ts';
import { buildMoneyFlow } from './moneyFlow.ts';
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
  stageMix: StageMixRow[];
  evidenceMix: EvidenceMixRow[];
  weeklyActivity: WeeklyActivityPoint[];
  outcomes: {
    won: { count: number; totalBase: number };
    lost: { count: number; totalBase: number };
  };
};

type MasterDashboardInput = {
  opportunities: CrmLiteOpportunity[];
  activities: SalesActivityRecord[];
  quotes: QuoteRecord[];
  opportunityOutcomes: OpportunityOutcomeRecord[];
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

  const todayDate = new Date(`${todayKey}T00:00:00`);
  const thirtyDaysAgo = new Date(todayDate.getTime() - 30 * DAY_MS);
  const activitiesLast30 = input.activities.filter((activity) => {
    const date = parseBusinessDate(activity.activityDate);
    return date !== null && date >= thirtyDaysAgo && date <= todayDate;
  }).length;

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
    stageMix,
    evidenceMix,
    weeklyActivity: buildWeeklyActivity(input.activities, todayDate),
    outcomes,
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
