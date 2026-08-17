import type { CrmLiteOpportunity } from '../services/opportunityStore.ts';
import { normalizeEntityName } from './accountIdentity.ts';
import { resolveProbability } from './stageProbability.ts';
import { opportunityStages } from '../services/opportunityStore.ts';
import type { SalesActivityRecord } from '../services/salesActivityStore.ts';
import { sumMoneyInBase } from './money.ts';
import { classifyOpportunitySilence } from './proactiveNudges.ts';
import { isValidBusinessDate, toLocalDateKey } from './safeDate.ts';

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

  /**
   * Keyed canonically, displayed as typed.
   *
   * The key used to be the raw trimmed name, so "CÔNG TY X" and "Cong ty X" -
   * and even "VNVC" and "vnvc" - were two accounts. This total feeds the
   * concentration figure, which is a *risk* number: splitting one customer's
   * pipeline across two keys makes the top account's share look smaller than it
   * is, and the whole point of the number is to warn that too much of the
   * quarter rests on one relationship.
   */
  const accountTotals = new Map<string, { name: string; total: number }>();
  for (const opportunity of active) {
    const name = (opportunity.accountName || '').trim() || 'No account';
    const key = normalizeEntityName(name) || 'no account';
    const current = accountTotals.get(key) || { name, total: 0 };
    current.total += sumMoneyInBase([opportunityMoney(opportunity)]);
    accountTotals.set(key, current);
  }
  const activeValueBase = valueOf(active);
  let concentration: PipelineHealthSummary['concentration'] = null;
  if (activeValueBase > 0 && accountTotals.size > 0) {
    const top = [...accountTotals.values()].sort((a, b) => b.total - a.total)[0];
    concentration = {
      topAccountName: top.name,
      topAccountShare: Math.round((top.total / activeValueBase) * 100),
    };
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
    /**
     * The stage ladder, not a flat 50.
     *
     * A deal with no declared probability used to be weighted at 50% whatever
     * stage it was in, while `resolveProbability` - which the rest of the
     * product uses, and which carries a reasoned table - says a Lead is 5% and
     * Discovery is 10%. This chart is "Expected revenue: when the money lands",
     * so it was over-weighting the earliest pipeline by up to ten times and
     * under-weighting Negotiation and Procurement. An On hold deal, which the
     * ladder deliberately gives no probability at all, was counted at half its
     * value as money arriving on a date.
     *
     * Unknown now contributes nothing to the weighted bar and keeps its full
     * value in the pale one, which is the contrast the chart already draws.
     */
    const probability = resolveProbability(opportunity).value ?? 0;
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
