import type { CrmLiteOpportunity } from '../services/opportunityStore.ts';
import type { SalesActivityRecord } from '../services/salesActivityStore.ts';
import type { MoneyFlow, MoneyFlowLane, MoneyFlowThread } from './moneyFlow.ts';
import type { ReceivablesSummary } from './receivables.ts';
import type { PlanBoard } from './weeklyPlan.ts';
import {
  classifyOpportunitySilence,
  commitmentCoverFor,
  SILENCE_CRITICAL_DAYS,
  SILENCE_WARNING_DAYS,
  type PlannedCommitmentSignal,
} from './proactiveNudges.ts';
import { convertMoney } from './money.ts';
import { summarisePlanBoard } from './planBoardSummary.ts';

/**
 * Today's picture: four numbers about the state of the business, each read from
 * the engine that already owns it.
 *
 * The Daylight redesign opens Today on four metric cards - open pipeline, deals
 * going silent, overdue cash, promises kept. None of those is a new rule. Each
 * one is somebody else's number, restated at the top of the day, and the point of
 * this file is that it can never be a *different* number from the one on the
 * surface that owns it:
 *
 *  - going silent is `classifyOpportunitySilence`, the same classifier and the
 *    same thresholds as the watch-list, including its rule that a promise dated
 *    on the account makes a deal a risk rather than an alarm;
 *  - overdue cash is `buildReceivables`, which is what Money > Collections draws;
 *  - promises kept is the week's plan board, which is what Plan's headline counts;
 *  - money in motion is `buildMoneyFlow`, which is what Money > Orders draws.
 *
 * What is deliberately absent is any history. The mock drew a pipeline sparkline
 * and "+14% vs last month", and the workspace keeps no snapshot of last month's
 * pipeline - a line reconstructed from creation and close dates would assert a
 * trend nobody observed. The pipeline card shows where the value sits instead.
 */

export function greetingFor(now: Date, personalName?: string | null): string {
  const hour = now.getHours();
  const part = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
  // The whole name as given, not a guessed first name: the first word of a
  // Vietnamese name is the family name, and "Good morning, Nguyen." is wrong in
  // the exact way a greeting cannot afford to be.
  const name = (personalName || '').trim();
  return name ? `Good ${part}, ${name}.` : `Good ${part}.`;
}

/* ------------------------------------------------------------------------- */
/* Open pipeline                                                              */
/* ------------------------------------------------------------------------- */

export type PipelineStageSlice = { stage: string; count: number; base: number };

export type TodayPipelinePicture = {
  dealCount: number;
  openBase: number;
  /**
   * Active deals carrying an amount in a currency nobody has priced. Counted as
   * deals, left out of the total - and said, because a total that silently
   * drops them reads as smaller than the book.
   */
  unpricedCount: number;
  /** Stages holding at least one active deal, in pipeline order. */
  stages: PipelineStageSlice[];
  /** Value at Proposal or later: quoted, negotiated, or being bought. */
  advancedBase: number;
};

const ADVANCED_STAGES = new Set(['Proposal', 'Negotiation', 'Procurement']);

function dealAmount(opportunity: CrmLiteOpportunity): number {
  // The same fallback the revenue view sums with, so the two totals agree.
  const amount = opportunity.estimatedValue || opportunity.fy26Value || 0;
  return typeof amount === 'number' && Number.isFinite(amount) ? amount : 0;
}

export function summariseOpenPipeline(
  opportunities: CrmLiteOpportunity[],
  stageOrder: readonly string[],
): TodayPipelinePicture {
  const active = opportunities.filter((opportunity) => opportunity.status === 'Active');
  const byStage = new Map<string, PipelineStageSlice>();
  let openBase = 0;
  let advancedBase = 0;
  let unpricedCount = 0;

  active.forEach((opportunity) => {
    const amount = dealAmount(opportunity);
    const converted = amount > 0 ? convertMoney(amount, opportunity.currency) : 0;
    if (converted === null) unpricedCount += 1;
    const base = converted ?? 0;
    openBase += base;
    if (ADVANCED_STAGES.has(opportunity.stage)) advancedBase += base;

    const stage = opportunity.stage || 'Not stated';
    const slice = byStage.get(stage) || { stage, count: 0, base: 0 };
    slice.count += 1;
    slice.base += base;
    byStage.set(stage, slice);
  });

  const rank = (stage: string) => {
    const index = stageOrder.indexOf(stage);
    return index === -1 ? stageOrder.length : index;
  };

  return {
    dealCount: active.length,
    openBase,
    unpricedCount,
    stages: [...byStage.values()].sort((left, right) => rank(left.stage) - rank(right.stage)),
    advancedBase,
  };
}

/* ------------------------------------------------------------------------- */
/* Going silent                                                               */
/* ------------------------------------------------------------------------- */

export type SilenceBucket = {
  label: string;
  fromDays: number;
  /** Exclusive. Null for the open-ended last bucket. */
  toDays: number | null;
  count: number;
  /** Past the alarm threshold, as opposed to only at risk. */
  alarm: boolean;
};

export type TodaySilencePicture = {
  /** Quiet past the alarm threshold, with nothing dated on the deal or its account. */
  silentCount: number;
  /** Quiet past the warning threshold, or past the alarm with a promise on the account. */
  atRiskCount: number;
  /** The value of the silent deals - the ones the watch-list calls "going silent". */
  atStakeBase: number;
  warningDays: number;
  alarmDays: number;
  buckets: SilenceBucket[];
  /** The longest-quiet silent deal, for the card to open. */
  quietestOpportunityId?: string;
};

export function summariseSilence(input: {
  opportunities: CrmLiteOpportunity[];
  activities: SalesActivityRecord[];
  commitments?: PlannedCommitmentSignal[];
  today: string;
}): TodaySilencePicture {
  const edges = [SILENCE_WARNING_DAYS, SILENCE_CRITICAL_DAYS, 21, 30, 60];
  const buckets: SilenceBucket[] = edges.map((fromDays, index) => {
    const toDays = edges[index + 1] ?? null;
    return {
      label: toDays === null ? `${fromDays}+ days` : `${fromDays}-${toDays - 1} days`,
      fromDays,
      toDays,
      count: 0,
      alarm: fromDays >= SILENCE_CRITICAL_DAYS,
    };
  });

  let silentCount = 0;
  let atRiskCount = 0;
  let atStakeBase = 0;
  let quietest: { id: string; days: number; base: number } | null = null;

  input.opportunities.forEach((opportunity) => {
    const state = classifyOpportunitySilence(opportunity, input.activities, input.today, input.commitments || []);
    if ((state.status !== 'silent' && state.status !== 'at-risk') || state.daysQuiet === null) return;
    const days = state.daysQuiet;

    const bucket = buckets.find((candidate) => (
      days >= candidate.fromDays && (candidate.toDays === null || days < candidate.toDays)
    ));
    if (bucket) bucket.count += 1;

    // The watch-list's own distinction: a promise dated on the customer, just
    // not on this deal, turns "going silent" into "silence risk".
    const alarm = state.status === 'silent' && commitmentCoverFor(opportunity, input.commitments || []) !== 'account';
    if (!alarm) {
      atRiskCount += 1;
      return;
    }
    silentCount += 1;
    const base = convertMoney(dealAmount(opportunity), opportunity.currency) ?? 0;
    atStakeBase += base;
    if (!quietest || days > quietest.days || (days === quietest.days && base > quietest.base)) {
      quietest = { id: opportunity.id, days, base };
    }
  });

  return {
    silentCount,
    atRiskCount,
    atStakeBase,
    warningDays: SILENCE_WARNING_DAYS,
    alarmDays: SILENCE_CRITICAL_DAYS,
    buckets,
    quietestOpportunityId: (quietest as { id: string } | null)?.id,
  };
}

/* ------------------------------------------------------------------------- */
/* Overdue cash                                                               */
/* ------------------------------------------------------------------------- */

export type CashSegment = { key: 'not-due' | '1-30' | '31-60' | '61+'; label: string; base: number };

export type TodayCashPicture = {
  overdueBase: number;
  outstandingBase: number;
  overdueOrderCount: number;
  oldestDaysOverdue: number | null;
  /** Outstanding money by lateness, drawn left (not yet due) to right (oldest). */
  segments: CashSegment[];
  worst: { opportunityId: string; accountName: string; daysOverdue: number | null; overdueBase: number } | null;
};

export function summariseOverdueCash(receivables: ReceivablesSummary): TodayCashPicture {
  const amount = (...keys: string[]) => receivables.aging
    .filter((bucket) => keys.includes(bucket.bucket))
    .reduce((sum, bucket) => sum + bucket.amountBase, 0);

  const overdueOrders = receivables.orders.filter((order) => !order.settled && order.overdueBase > 0);
  const oldest = overdueOrders.reduce<number | null>((max, order) => (
    order.daysOverdue === null ? max : Math.max(max ?? 0, order.daysOverdue)
  ), null);

  return {
    overdueBase: receivables.totalOverdueBase,
    outstandingBase: receivables.totalOutstandingBase,
    overdueOrderCount: overdueOrders.length,
    oldestDaysOverdue: oldest,
    segments: [
      { key: 'not-due', label: 'Not yet due', base: amount('due-soon', 'current') },
      { key: '1-30', label: '1-30 days late', base: amount('1-30') },
      { key: '31-60', label: '31-60 days late', base: amount('31-60') },
      { key: '61+', label: 'Over 60 days late', base: amount('61-90', '90+') },
    ],
    worst: receivables.worstOverdue
      ? {
        opportunityId: receivables.worstOverdue.opportunityId,
        accountName: receivables.worstOverdue.accountName,
        daysOverdue: receivables.worstOverdue.daysOverdue,
        overdueBase: receivables.worstOverdue.overdueBase,
      }
      : null,
  };
}

/* ------------------------------------------------------------------------- */
/* Promises kept                                                              */
/* ------------------------------------------------------------------------- */

export type TodayPromisesPicture = {
  done: number;
  total: number;
  percent: number | null;
  /** Open items whose day has already passed. */
  overdueOpen: number;
};

export function summariseWeekPromises(board: PlanBoard): TodayPromisesPicture {
  const summary = summarisePlanBoard(board);
  const overdueOpen = board.days.flatMap((day) => day.items).filter((item) => item.overdue && !item.done).length;
  return { done: summary.done, total: summary.total, percent: summary.donePercent, overdueOpen };
}

/* ------------------------------------------------------------------------- */
/* Money in motion                                                            */
/* ------------------------------------------------------------------------- */

export type TodayMoneyInMotion = {
  /** Quoted through Paid. The deal lane is the pipeline card's job. */
  lanes: MoneyFlowLane[];
  /** The widest lane, so every bar is drawn against the same scale. */
  maxBase: number;
  /** The first stuck quote-side thread, in the order Money > Orders lists them. */
  worstStuck: MoneyFlowThread | null;
  hasAny: boolean;
};

export function summariseMoneyInMotion(flow: MoneyFlow): TodayMoneyInMotion {
  const lanes = flow.lanes.filter((lane) => lane.stage !== 'Opportunity');
  return {
    lanes,
    maxBase: lanes.reduce((max, lane) => Math.max(max, lane.totalBase), 0),
    worstStuck: flow.stuckThreads.find((thread) => thread.stage !== 'Opportunity') || null,
    hasAny: lanes.some((lane) => lane.threads > 0),
  };
}
