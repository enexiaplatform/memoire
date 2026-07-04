import type { CrmLiteOpportunity } from '../services/opportunityStore';
import { opportunityStages } from '../services/opportunityStore';
import type { SalesActivityRecord } from '../services/salesActivityStore';
import { sumMoneyInBase } from './money';
import { classifyOpportunitySilence } from './proactiveNudges';
import { isValidBusinessDate, toLocalDateKey } from './safeDate';

export interface PipelineHealthSummary {
  activeCount: number;
  activeValueBase: number;
  buckets: {
    healthy: { count: number; valueBase: number };
    atRisk: { count: number; valueBase: number };
    silent: { count: number; valueBase: number };
  };
  quietValueBase: number;
  concentration: {
    topAccountName: string;
    topAccountShare: number;
  } | null;
}

const isActive = (opportunity: CrmLiteOpportunity) => opportunity.status === 'Active';

function opportunityMoney(opportunity: CrmLiteOpportunity) {
  return { amount: opportunity.estimatedValue ?? 0, currency: opportunity.currency };
}

export function buildPipelineHealthSummary(
  opportunities: CrmLiteOpportunity[],
  activities: SalesActivityRecord[],
): PipelineHealthSummary {
  const active = opportunities.filter(isActive);
  const grouped: Record<'healthy' | 'atRisk' | 'silent', CrmLiteOpportunity[]> = {
    healthy: [],
    atRisk: [],
    silent: [],
  };

  for (const opportunity of active) {
    const silence = classifyOpportunitySilence(opportunity, activities);
    if (silence.status === 'silent') grouped.silent.push(opportunity);
    else if (silence.status === 'at-risk') grouped.atRisk.push(opportunity);
    else grouped.healthy.push(opportunity);
  }

  const valueOf = (list: CrmLiteOpportunity[]) => sumMoneyInBase(list.map(opportunityMoney));

  const accountTotals = new Map<string, number>();
  for (const opportunity of active) {
    const key = (opportunity.accountName || 'No account').trim() || 'No account';
    accountTotals.set(key, (accountTotals.get(key) || 0) + sumMoneyInBase([opportunityMoney(opportunity)]));
  }
  const activeValueBase = valueOf(active);
  let concentration: PipelineHealthSummary['concentration'] = null;
  if (activeValueBase > 0 && accountTotals.size > 0) {
    const [topAccountName, topValue] = [...accountTotals.entries()].sort((a, b) => b[1] - a[1])[0];
    concentration = { topAccountName, topAccountShare: Math.round((topValue / activeValueBase) * 100) };
  }

  const atRiskValue = valueOf(grouped.atRisk);
  const silentValue = valueOf(grouped.silent);

  return {
    activeCount: active.length,
    activeValueBase,
    buckets: {
      healthy: { count: grouped.healthy.length, valueBase: valueOf(grouped.healthy) },
      atRisk: { count: grouped.atRisk.length, valueBase: atRiskValue },
      silent: { count: grouped.silent.length, valueBase: silentValue },
    },
    quietValueBase: atRiskValue + silentValue,
    concentration,
  };
}

export interface RevenueHorizonBucket {
  label: string;
  rawValueBase: number;
  weightedValueBase: number;
  count: number;
}

const HORIZON_ORDER = ['This month', 'Next month', 'This quarter', 'Next quarter', 'Later', 'No close period'] as const;

function normalizeHorizon(period: string): (typeof HORIZON_ORDER)[number] {
  const value = period.trim().toLowerCase();
  if (!value) return 'No close period';
  if (value.includes('this month') || value === 'now' || value.includes('this week')) return 'This month';
  if (value.includes('next month')) return 'Next month';
  if (value.includes('this quarter')) return 'This quarter';
  if (value.includes('next quarter')) return 'Next quarter';
  return 'Later';
}

export function buildRevenueHorizon(opportunities: CrmLiteOpportunity[]): RevenueHorizonBucket[] {
  const buckets = new Map<string, { raw: number; weighted: number; count: number }>();
  for (const opportunity of opportunities.filter(isActive)) {
    const label = normalizeHorizon(opportunity.expectedClosePeriod || '');
    const raw = sumMoneyInBase([opportunityMoney(opportunity)]);
    const probability = typeof opportunity.pipelineProbability === 'number'
      ? Math.min(100, Math.max(0, opportunity.pipelineProbability))
      : 50;
    const entry = buckets.get(label) || { raw: 0, weighted: 0, count: 0 };
    entry.raw += raw;
    entry.weighted += raw * (probability / 100);
    entry.count += 1;
    buckets.set(label, entry);
  }
  return HORIZON_ORDER
    .filter((label) => buckets.has(label))
    .map((label) => {
      const entry = buckets.get(label)!;
      return {
        label,
        rawValueBase: Math.round(entry.raw),
        weightedValueBase: Math.round(entry.weighted),
        count: entry.count,
      };
    });
}

export interface StageFunnelRow {
  stage: string;
  count: number;
  valueBase: number;
}

export function buildStageFunnel(opportunities: CrmLiteOpportunity[]): StageFunnelRow[] {
  const active = opportunities.filter(isActive);
  return opportunityStages
    .filter((stage) => stage !== 'Won' && stage !== 'Lost' && stage !== 'On hold')
    .map((stage) => {
      const inStage = active.filter((opportunity) => opportunity.stage === stage);
      return {
        stage,
        count: inStage.length,
        valueBase: sumMoneyInBase(inStage.map(opportunityMoney)),
      };
    })
    .filter((row) => row.count > 0);
}

export interface WeeklyTouchPoint {
  weekLabel: string;
  count: number;
}

export function buildWeeklyTouchSeries(activities: SalesActivityRecord[], weeks = 8, today = new Date()): WeeklyTouchPoint[] {
  const monday = new Date(today);
  monday.setHours(0, 0, 0, 0);
  const day = monday.getDay();
  monday.setDate(monday.getDate() - ((day + 6) % 7));

  const points: WeeklyTouchPoint[] = [];
  for (let index = weeks - 1; index >= 0; index -= 1) {
    const start = new Date(monday);
    start.setDate(start.getDate() - index * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const startKey = toLocalDateKey(start);
    const endKey = toLocalDateKey(end);
    const count = activities.filter((activity) => {
      const date = activity.activityDate;
      return isValidBusinessDate(date) && date >= startKey && date < endKey;
    }).length;
    points.push({
      weekLabel: `${start.getDate()}/${start.getMonth() + 1}`,
      count,
    });
  }
  return points;
}

export interface WinLossQuarter {
  label: string;
  won: number;
  lost: number;
}

export function buildWinLossByQuarter(opportunities: CrmLiteOpportunity[], quarters = 4, today = new Date()): WinLossQuarter[] {
  const results: WinLossQuarter[] = [];
  for (let index = quarters - 1; index >= 0; index -= 1) {
    const reference = new Date(today.getFullYear(), today.getMonth() - index * 3, 1);
    const quarter = Math.floor(reference.getMonth() / 3);
    const start = new Date(reference.getFullYear(), quarter * 3, 1);
    const end = new Date(reference.getFullYear(), quarter * 3 + 3, 1);
    const startKey = toLocalDateKey(start);
    const endKey = toLocalDateKey(end);
    const inQuarter = opportunities.filter((opportunity) => {
      if (opportunity.status !== 'Won' && opportunity.status !== 'Lost') return false;
      const closedAt = (opportunity.updatedAt || opportunity.createdAt || '').slice(0, 10);
      return closedAt >= startKey && closedAt < endKey;
    });
    const label = `Q${quarter + 1} '${String(start.getFullYear()).slice(2)}`;
    results.push({
      label,
      won: inQuarter.filter((opportunity) => opportunity.status === 'Won').length,
      lost: inQuarter.filter((opportunity) => opportunity.status === 'Lost').length,
    });
  }
  return results;
}
