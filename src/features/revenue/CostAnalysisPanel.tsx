import { useEffect, useMemo, useState } from 'react';
import { Coins, Pencil, Search, Target, TrendingDown, TrendingUp } from 'lucide-react';
import type { CrmLiteOpportunity } from '../../services/opportunityStore';
import type { QuoteRecord } from '../../services/quoteStore';
import { deleteOrderCost, loadOrderCostsForWorkspace, saveOrderCost } from '../../services/orderCostStore';
import { buildOrderBook, COMMIT_PROBABILITY_THRESHOLD, type CommittedOrder, type OrderMilestoneRecord, type OrderOutcomeRecord } from '../../utils/orderToCash';
import { loadOrderMilestonesForWorkspace } from '../../services/orderMilestoneStore';
import {
  buildOrderMargins,
  marginTone,
  rollupMarginByMonth,
  rollupOrderMargins,
  type MarginGroup,
  type MarginPeriod,
  type OrderCostRecord,
  type OrderMargin,
  type OrderMarginSummary,
} from '../../utils/orderMargin';
import { getTargetMarginPct, setTargetMarginPct } from '../../utils/pricingAssumptions';
import {
  formatBaseCurrencyAmount,
  formatCompactBaseAmount,
  formatCurrencyAmount,
  listSelectableCurrencies,
} from '../../utils/money';
import { matchesSearchQuery } from '../../utils/textSearch';

/**
 * Cost analysis: the buy side of the order book.
 *
 * Orders answers "where is my money" - which orders are committed, where each
 * one is stuck, when it will land. It deliberately says nothing about cost, and
 * it stays that way: an order book that mixes chasing with pricing is two jobs
 * on one table. This is the second job, and as of 2026-08-06 it has its own
 * destination rather than sitting under the book - see CostAnalysisPage for why
 * "it is further down the page you were already on" turned out to lose to what
 * an operator actually does when looking for a feature.
 *
 * ## The second pass, and what was thin about the first
 *
 * Version one was a purchase price per order and a percentage beside it. The
 * founder's verdict was that it was too sparse to act on. Reading it back, three
 * things were missing, and each was the difference between a report and a
 * decision:
 *
 *   - **It priced goods, not orders.** A distributor pays the principal in USD
 *     and then pays a forwarder, a customs broker and an engineer in dong. The
 *     margin on the principal's invoice alone is the number that makes a year
 *     stop adding up. The buy side is now landed cost, and the page states the
 *     points that freight, duty and other took off, because that gap is the
 *     entire reason for recording them.
 *   - **Nothing to compare against.** "You kept 14%" is trivia; "14% against the
 *     20% you aim for, and the gap is 340m" is a decision about who gets the
 *     next quote. The operator states a target once and every figure - order,
 *     customer, line, supplier, month - is read against it, including the
 *     arithmetic that says what the price or the purchase had to be.
 *   - **One photograph, no film.** A book that kept 24% last quarter and 12%
 *     this one reads as healthy in a single total. Margin is drawn by month.
 *
 * Three rules hold it honest, and each maps to a way the number could lie:
 *
 *   1. Nothing is counted twice, and nothing is counted half. Only orders with
 *      both a value and a cost enter the totals, the coverage is stated
 *      everywhere a total appears, and what the uncosted orders are *worth* is
 *      stated too - coverage as a count is easy to shrug at, coverage as money
 *      passing through a blind spot is not.
 *   2. It reads and never writes back. The order value stays whatever the quote
 *      or the deal says; cost is a separate record that cannot touch it.
 *   3. It does not open itself. Until a first purchase cost exists the whole
 *      module is one line offering to start - because plenty of operators never
 *      see purchase price, and an empty analysis reads as a broken product.
 */
export function CostAnalysisPanel({
  opportunities,
  quotes,
  outcomes,
  dataUserId,
  sampleDataActive,
}: {
  opportunities: CrmLiteOpportunity[];
  quotes: QuoteRecord[];
  /**
   * When each closed deal closed. The monthly margin trend files an order
   * under its `orderDate`, so without this an imported book bunches into the
   * month it was imported.
   */
  outcomes: OrderOutcomeRecord[];
  dataUserId?: string;
  sampleDataActive: boolean;
}) {
  const [costRecords, setCostRecords] = useState<OrderCostRecord[]>([]);
  const [search, setSearch] = useState('');
  const [showOnlyMissing, setShowOnlyMissing] = useState(false);
  const [groupBy, setGroupBy] = useState<GroupBy>('customer');
  const [groupFocus, setGroupFocus] = useState('');
  const [editingId, setEditingId] = useState('');
  const [entryOpen, setEntryOpen] = useState(false);
  const [targetPct, setTargetPct] = useState(() => getTargetMarginPct());
  const [milestoneRecords, setMilestoneRecords] = useState<OrderMilestoneRecord[]>([]);

  useEffect(() => {
    let cancelled = false;
    void loadOrderCostsForWorkspace(dataUserId, sampleDataActive).then((records) => {
      if (!cancelled) setCostRecords(records);
    });
    void loadOrderMilestonesForWorkspace(dataUserId, sampleDataActive).then((records) => {
      if (!cancelled) setMilestoneRecords(records);
    });
    return () => { cancelled = true; };
  }, [dataUserId, sampleDataActive]);

  // The same committed orders the order book shows, from the same function.
  //
  // Ticks are loaded even though they cannot move a total. They used not to be,
  // on the grounds that a tick decides where an order is stuck and not what it
  // is worth - true of every figure on this page except the one that matters
  // most here, the trend. `rollupMarginByMonth` files an order under its
  // `orderDate`, and that now reads the Contract / PO tick, so without these the
  // chart bucketed by the record's last edit: an order signed in April sat in
  // whichever month it happened to be opened. The totals are unchanged and the
  // order-margin contract still asserts that; what the ticks buy is the months
  // being the months the orders were actually placed in.
  const orders = useMemo(
    () => buildOrderBook({ opportunities, quotes, milestoneRecords, costRecords, outcomes }).orders,
    [costRecords, milestoneRecords, opportunities, quotes, outcomes],
  );

  const margins = useMemo(
    () => buildOrderMargins({ orders, costRecords, targetPct }),
    [orders, costRecords, targetPct],
  );

  const months = useMemo(() => rollupMarginByMonth({ orders, margins, monthCount: 6 }), [orders, margins]);

  const brandByOrder = useMemo(() => new Map(
    opportunities.map((opportunity) => [opportunity.id, (opportunity.brand || '').trim()]),
  ), [opportunities]);

  const groups = useMemo(() => rollupOrderMargins({
    margins,
    entries: orders.map((order) => {
      const key = groupKeyFor(groupBy, order, brandByOrder, margins);
      return { opportunityId: order.opportunityId, key, label: key };
    }),
  }), [orders, margins, groupBy, brandByOrder]);

  // Switching the grouping keeps a focus that no longer names anything, which
  // silently empties the table below. Clearing it is the only honest answer.
  useEffect(() => { setGroupFocus(''); }, [groupBy]);

  const visibleOrders = useMemo(() => {
    const query = search.trim().toLowerCase();
    return orders
      .filter((order) => !showOnlyMissing || !margins.byOrder.get(order.opportunityId)?.hasCost)
      .filter((order) => !groupFocus || groupKeyFor(groupBy, order, brandByOrder, margins) === groupFocus)
      .filter((order) => matchesSearchQuery([order.accountName, order.orderName, order.orderRef].join(' '), query))
      // Orders without a cost first - they are the work this module is asking
      // for - then the thinnest margins, which are the ones worth arguing about.
      .sort((left, right) => {
        const leftMargin = margins.byOrder.get(left.opportunityId);
        const rightMargin = margins.byOrder.get(right.opportunityId);
        return Number(leftMargin?.hasCost) - Number(rightMargin?.hasCost)
          || (leftMargin?.marginPct ?? 999) - (rightMargin?.marginPct ?? 999)
          || right.amountBase - left.amountBase;
      });
  }, [orders, margins, search, showOnlyMissing, groupFocus, groupBy, brandByOrder]);

  const writeCost = (order: CommittedOrder, draft: CostDraft) => {
    setCostRecords(saveOrderCost({
      opportunityId: order.opportunityId,
      amount: draft.amount,
      currency: draft.currency,
      freightAmount: draft.freightAmount,
      dutyAmount: draft.dutyAmount,
      otherAmount: draft.otherAmount,
      extrasCurrency: draft.extrasCurrency,
      supplier: draft.supplier,
      note: draft.note,
      source: sampleDataActive ? 'demo' : 'user',
      isSample: sampleDataActive,
    }));
    setEditingId('');
  };

  const clearCost = (order: CommittedOrder) => {
    setCostRecords(deleteOrderCost(order.opportunityId));
    setEditingId('');
  };

  const applyTarget = (next: number) => {
    setTargetPct(next);
    setTargetMarginPct(next);
  };

  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
        <div>
          <div className="flex items-center gap-2">
            <Coins className="h-4 w-4 text-violet-600" />
            <h2 className="text-lg font-bold text-navy">Cost analysis</h2>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            What each committed order landed at — goods, freight, duty and everything else — against what you sold it
            for. Record the costs on the orders you know; leave the rest blank and they stay out of every figure here.
          </p>
        </div>
        {margins.tracked && (
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
            <span className="rounded-full bg-violet-50 px-3 py-1 text-violet-700">
              Gross margin: {formatBaseCurrencyAmount(margins.grossMarginBase, true)}
            </span>
            {margins.marginPct !== null && (
              <span className="rounded-full bg-gray-100 px-3 py-1 text-gray-700">{margins.marginPct}% kept</span>
            )}
            {margins.losingCount > 0 && (
              <span className="rounded-full bg-red-50 px-3 py-1 text-red-700">{margins.losingCount} below cost</span>
            )}
          </div>
        )}
      </div>

      {orders.length === 0 ? (
        <NoCommittedOrders />
      ) : !margins.tracked ? (
        <StartHere
          open={entryOpen}
          orderCount={orders.length}
          onOpen={() => setEntryOpen(true)}
        />
      ) : (
        <>
          <TargetMarginBar targetPct={targetPct} margins={margins} onChange={applyTarget} />
          <HeadlineFigures margins={margins} />
          <BlindSpot margins={margins} onShowMissing={() => { setShowOnlyMissing(true); setGroupFocus(''); }} />
          <MarginTrend months={months} targetPct={targetPct} />
          <MarginByGroup
            groups={groups}
            groupBy={groupBy}
            focus={groupFocus}
            targetPct={targetPct}
            onGroupByChange={setGroupBy}
            onFocus={setGroupFocus}
          />
        </>
      )}

      {orders.length > 0 && (margins.tracked || entryOpen) && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
            <label className="relative w-full sm:w-[320px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search order, customer, reference..."
                className="w-full rounded-lg border border-gray-300 bg-white py-1.5 pl-9 pr-3 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
              />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {groupFocus && (
                <button
                  type="button"
                  onClick={() => setGroupFocus('')}
                  className="rounded-full bg-violet-100 px-3 py-1 text-xs font-bold text-violet-800"
                >
                  {groupFocus} ✕
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowOnlyMissing(!showOnlyMissing)}
                aria-pressed={showOnlyMissing}
                className={`rounded-full px-3 py-1 text-xs font-bold ${
                  showOnlyMissing ? 'bg-navy text-white' : 'border border-gray-200 bg-white text-gray-600'
                }`}
              >
                Missing a cost ({margins.uncoveredCount})
              </button>
              <p className="text-xs font-semibold text-gray-500">{visibleOrders.length} of {orders.length}</p>
            </div>
          </div>

          {/* Same `relative` + `overflow-x-auto` pair as the order book above:
              without it this table's width grows the whole document and every
              page on a phone scrolls sideways. */}
          <div className="relative max-w-full overflow-x-auto">
            <table className="w-full min-w-[1040px] border-collapse text-left text-sm">
              <thead className="bg-gray-50 text-[11px] font-bold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="border-y border-gray-200 px-4 py-2">Order</th>
                  <th className="border-y border-gray-200 px-3 py-2 text-right">Sold for</th>
                  <th className="border-y border-gray-200 px-3 py-2 text-right">Goods</th>
                  <th className="border-y border-gray-200 px-3 py-2 text-right" title="Freight, duty and other, converted">
                    + Landed
                  </th>
                  <th className="border-y border-gray-200 px-3 py-2">Supplier</th>
                  <th className="border-y border-gray-200 px-3 py-2 text-right">Gross margin</th>
                  <th className="border-y border-gray-200 px-3 py-2 text-right">Kept</th>
                  <th className="border-y border-gray-200 px-3 py-2 text-right" title={`Money short of the ${targetPct}% target`}>
                    vs target
                  </th>
                  <th className="border-y border-gray-200 px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visibleOrders.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-6 text-center text-sm text-gray-500">
                      {showOnlyMissing ? 'Every committed order carries a purchase cost.' : 'No order matches that search.'}
                    </td>
                  </tr>
                )}
                {visibleOrders.map((order) => {
                  const margin = margins.byOrder.get(order.opportunityId);
                  const editing = editingId === order.opportunityId;
                  return (
                    <tr key={order.opportunityId} className={margin && margin.hasCost && (margin.marginBase as number) < 0 ? 'bg-red-50/40' : 'bg-white'}>
                      <td className="px-4 py-2">
                        <p className="max-w-[clamp(260px,19vw,480px)] truncate font-bold text-navy" title={`${order.accountName} / ${order.orderName}`}>
                          {order.accountName}
                        </p>
                        <p className="max-w-[clamp(260px,19vw,480px)] truncate text-xs text-gray-500">
                          <span className="font-mono font-bold text-brand-blue">{order.orderRef}</span>
                          {' · '}
                          {order.orderName}
                        </p>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-bold text-gray-800">
                        {typeof order.amount === 'number' ? formatCurrencyAmount(order.amount, order.currency) : 'Not valued'}
                      </td>

                      {editing ? (
                        <td colSpan={7} className="px-3 py-2">
                          <CostFields
                            order={order}
                            margin={margin}
                            targetPct={targetPct}
                            existing={costRecords.find((record) => record.opportunityId === order.opportunityId)}
                            onSave={(draft) => writeCost(order, draft)}
                            onClear={() => clearCost(order)}
                            onCancel={() => setEditingId('')}
                          />
                        </td>
                      ) : (
                        <>
                          <td className="whitespace-nowrap px-3 py-2 text-right">
                            {margin?.hasCost && margin.costAmount !== null ? (
                              <span className="font-semibold text-gray-800">
                                {formatCurrencyAmount(margin.costAmount, margin.costCurrency)}
                              </span>
                            ) : (
                              <span className="text-xs font-semibold text-gray-400">Not recorded</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-right">
                            <LandedExtras margin={margin} />
                          </td>
                          <td className="max-w-[clamp(150px,11vw,300px)] truncate px-3 py-2 text-xs text-gray-600" title={margin?.supplier}>
                            {margin?.supplier || '—'}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-right">
                            <MarginAmount margin={margin} targetPct={targetPct} />
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-right">
                            <MarginPercent margin={margin} targetPct={targetPct} />
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-right">
                            <TargetGap margin={margin} />
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => setEditingId(order.opportunityId)}
                              className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-white px-2.5 py-1 text-[11px] font-bold text-violet-700 hover:bg-violet-50"
                            >
                              <Pencil className="h-3 w-3" />
                              {margin?.hasCost ? 'Edit' : 'Add cost'}
                            </button>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* The colours say what their rule is.
              An amber number nobody can argue with is a number nobody trusts,
              and a threshold that quietly moves with the data is worse - the
              operator cannot tell a thin order from a shifting definition.
              Below cost is a fact and needs no opinion. Below target is a
              judgement, and the only person who can make it is the one who
              knows what their own trade keeps - so it is a number they set, not
              one this page learns from their data. */}
          <p className="border-t border-gray-100 px-5 py-3 text-xs leading-5 text-gray-500">
            <span className="font-bold text-red-700">Red</span> is an order sold below what it cost — a fact, not a
            judgement.{' '}
            <span className="font-bold text-amber-700">Amber</span> is under the {targetPct}% you set as your target.
            Neither line is learned from your data. Leave the cost blank on orders you do not know or do not care about
            — those are left out of every figure here, on both sides, rather than counted as free.
          </p>
        </>
      )}
    </section>
  );
}

type GroupBy = 'customer' | 'brand' | 'supplier';

/** One order's group label, so the roll-up and the table filter agree exactly. */
function groupKeyFor(
  groupBy: GroupBy,
  order: CommittedOrder,
  brandByOrder: Map<string, string>,
  margins: OrderMarginSummary,
) {
  if (groupBy === 'customer') return order.accountName || 'Unknown account';
  if (groupBy === 'brand') return brandByOrder.get(order.opportunityId) || 'No line recorded';
  return margins.byOrder.get(order.opportunityId)?.supplier || 'No supplier recorded';
}

/**
 * The module before there is anything to price.
 *
 * It used to return null here, which was a real mistake and the one the founder
 * hit: a workspace with no committed order showed the order book explaining its
 * own emptiness and showed *nothing at all* where cost analysis should be. From
 * the outside that is indistinguishable from a feature that was never shipped,
 * and it sent them looking through the nav for a page that does not exist.
 *
 * A section that has nothing to say still says which section it is, and why it
 * is empty - the same courtesy the order book above it already extends.
 */
function NoCommittedOrders() {
  return (
    <div className="m-5 rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-5 text-sm leading-6 text-gray-500">
      Nothing to price yet. Cost analysis reads the committed orders from the order book — a deal at
      {' '}{COMMIT_PROBABILITY_THRESHOLD}% or more, in procurement, or already won. Once one lands there you can record
      what the goods cost you, and this works out the margin per order, per customer and per line you carry.
    </div>
  );
}

/**
 * The module before it has anything to analyse.
 *
 * One sentence and one button. The alternative - showing the full table with
 * every cost cell empty - reads as an unfinished product to the operator who
 * does not track purchase price, and that is a large fraction of them.
 */
function StartHere({ open, orderCount, onOpen }: { open: boolean; orderCount: number; onOpen: () => void }) {
  if (open) return null;
  return (
    <div className="m-5 rounded-lg border border-dashed border-violet-200 bg-violet-50/40 px-4 py-4">
      <p className="text-sm leading-6 text-gray-700">
        You have {orderCount} committed order{orderCount === 1 ? '' : 's'} and no purchase cost against any of them, so
        there is nothing to work a margin out from yet. Record what one order cost you — the goods, and the freight and
        duty if you pay them — and this fills in: margin per order, per customer, per line and per supplier, against the
        margin you aim to keep.
      </p>
      <button
        type="button"
        onClick={onOpen}
        className="mt-3 rounded-full bg-navy px-4 py-2 text-sm font-bold text-white hover:bg-navy/90"
      >
        Start recording purchase cost
      </button>
      <p className="mt-2 text-xs leading-5 text-gray-500">
        Skip this if your buy side is somebody else&apos;s job — nothing else on Orders depends on it.
      </p>
    </div>
  );
}

/**
 * The number every other figure on the page is graded against.
 *
 * Put at the top rather than in Settings on purpose: a threshold hidden on
 * another screen is one the operator forgets they set, and then argues with the
 * colours. It is theirs, it is one field, and it says out loud what it did.
 */
function TargetMarginBar({
  targetPct,
  margins,
  onChange,
}: {
  targetPct: number;
  margins: OrderMarginSummary;
  onChange: (next: number) => void;
}) {
  const [text, setText] = useState(String(targetPct));
  useEffect(() => { setText(String(targetPct)); }, [targetPct]);

  const commit = () => {
    const parsed = Number(text.replace(/[^\d.-]/g, ''));
    onChange(Number.isFinite(parsed) ? Math.min(99, Math.max(0, Math.round(parsed))) : targetPct);
  };

  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-gray-200 bg-white px-5 py-3">
      <label className="flex items-center gap-2 text-xs font-bold text-gray-600">
        <Target className="h-4 w-4 text-violet-600" />
        Margin you aim to keep
        <span className="inline-flex items-center rounded-lg border border-gray-300 bg-white pr-2 focus-within:border-brand-blue">
          <input
            value={text}
            onChange={(event) => setText(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => { if (event.key === 'Enter') { event.currentTarget.blur(); } }}
            inputMode="numeric"
            aria-label="Target gross margin percent"
            className="w-14 bg-transparent px-2 py-1 text-right text-sm font-bold text-navy outline-none"
          />
          <span className="text-sm font-bold text-gray-500">%</span>
        </span>
      </label>
      <p className="text-xs leading-5 text-gray-500">
        {margins.coveredCount === 0
          ? 'Every order, customer, line and month below is graded against this.'
          : margins.targetGapBase > 0
            ? <>
                <span className="font-bold text-amber-800">
                  {margins.belowTargetCount} of {margins.coveredCount} costed order
                  {margins.coveredCount === 1 ? '' : 's'}
                </span>{' '}
                came in under it, {formatBaseCurrencyAmount(margins.targetGapBase, true)} short in total.
              </>
            : <span className="font-bold text-emerald-700">Every costed order met it.</span>}
      </p>
    </div>
  );
}

/** Sold, landed cost, kept - and the denominator, stated before anything else is read. */
function HeadlineFigures({ margins }: { margins: OrderMarginSummary }) {
  const tone = marginTone(margins.marginPct, margins.targetPct);
  // The points freight, duty and other took off. Only worth printing when they
  // exist - a workspace that records goods alone should not be told that its
  // landed margin equals its goods margin, which is arithmetic, not a finding.
  const landedDrag = margins.goodsMarginPct !== null && margins.marginPct !== null
    ? margins.goodsMarginPct - margins.marginPct
    : 0;

  return (
    <div className="border-y border-gray-200 bg-violet-50/40 px-5 py-3">
      <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2">
        <Figure label="Sold for" value={formatBaseCurrencyAmount(margins.revenueBase, true)} />
        <Figure label="Landed cost" value={formatBaseCurrencyAmount(margins.costBase, true)} />
        <Figure label="Gross margin" value={formatBaseCurrencyAmount(margins.grossMarginBase, true)} tone={tone} />
        {margins.marginPct !== null && <Figure label="Kept" value={`${margins.marginPct}%`} tone={tone} />}
        <Figure
          label={`Against ${margins.targetPct}% target`}
          value={margins.targetGapBase > 0 ? `−${formatBaseCurrencyAmount(margins.targetGapBase, true)}` : 'Met'}
          tone={margins.targetGapBase > 0 ? 'thin' : 'healthy'}
        />
        {/* Only once there is more than one costed order. With exactly one, the
            thinnest order and the whole book are the same number printed twice,
            which reads as two findings where there is none. */}
        {margins.coveredCount > 1 && margins.thinnest && margins.thinnest.marginPct !== null && (
          <Figure
            label="Thinnest order"
            value={`${margins.thinnest.marginPct}%`}
            tone={marginTone(margins.thinnest.marginPct, margins.targetPct)}
          />
        )}
      </div>
      <p className="mt-1.5 text-[11px] leading-4 text-gray-500">
        Across the {margins.coveredCount} of {margins.totalCount} committed order
        {margins.totalCount === 1 ? '' : 's'} that carry a cost.
        {margins.totalCount > margins.coveredCount && (
          <>
            {' '}The other {margins.totalCount - margins.coveredCount}{' '}
            {margins.totalCount - margins.coveredCount === 1 ? 'is' : 'are'} counted on neither side.
          </>
        )}
        {margins.extrasBase > 0 && (
          <>
            {' '}Freight, duty and other came to {formatBaseCurrencyAmount(margins.extrasBase, true)}
            {landedDrag > 0 && <> — {landedDrag} point{landedDrag === 1 ? '' : 's'} off what the goods price alone would have shown</>}.
          </>
        )}
      </p>
    </div>
  );
}

/**
 * What is not being measured, in money.
 *
 * Every figure above is true and partial, and the size of the part it leaves out
 * decides whether any of it is worth acting on. "4 of 30 costed" is easy to read
 * past; the value flowing through the other twenty-six is not.
 */
function BlindSpot({ margins, onShowMissing }: { margins: OrderMarginSummary; onShowMissing: () => void }) {
  if (margins.uncoveredCount === 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-amber-50/60 px-5 py-2.5">
      <p className="text-xs leading-5 text-amber-900">
        <span className="font-bold">
          {margins.uncoveredCount} committed order{margins.uncoveredCount === 1 ? '' : 's'} worth{' '}
          {formatBaseCurrencyAmount(margins.uncoveredRevenueBase, true)}
        </span>{' '}
        carr{margins.uncoveredCount === 1 ? 'ies' : 'y'} no cost Memoire can read — none recorded, or
        recorded in a currency with no exchange rate — so nothing above says anything about
        {margins.uncoveredCount === 1 ? ' it' : ' them'}.
      </p>
      <button
        type="button"
        onClick={onShowMissing}
        className="shrink-0 rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-bold text-amber-800 hover:bg-amber-100"
      >
        Show them
      </button>
    </div>
  );
}

/**
 * Margin by month - the direction, which no total can show.
 *
 * Drawn as a column per month rather than a line, because a month with no costed
 * order has to read as *nothing recorded* and not as zero margin, and a line
 * chart has no way to say that without lying about the segment it draws through.
 */
function MarginTrend({ months, targetPct }: { months: MarginPeriod[]; targetPct: number }) {
  const readable = months.filter((month) => month.coveredCount > 0);
  const peak = months.reduce((max, month) => Math.max(max, month.revenueBase), 0);
  const first = readable[0];
  const last = readable[readable.length - 1];
  const drift = first && last && first.marginPct !== null && last.marginPct !== null && first.key !== last.key
    ? last.marginPct - first.marginPct
    : null;

  return (
    <div className="border-b border-gray-200 px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-navy">Which way it is going</h3>
        {drift !== null && (
          <p className={`inline-flex items-center gap-1 text-xs font-bold ${drift < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
            {drift < 0 ? <TrendingDown className="h-3.5 w-3.5" /> : <TrendingUp className="h-3.5 w-3.5" />}
            {drift > 0 ? '+' : ''}{drift} points since {first.label}
          </p>
        )}
      </div>

      {readable.length === 0 ? (
        <p className="mt-2 text-xs text-gray-500">
          No costed order falls in the last six months, so there is no trend to draw yet.
        </p>
      ) : (
        <div className="mt-3 flex items-end gap-2">
          {months.map((month) => {
            const height = peak > 0 ? Math.max(4, Math.round((month.revenueBase / peak) * 64)) : 4;
            const tone = marginTone(month.marginPct, targetPct);
            return (
              <div key={month.key} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                <span className={`text-[11px] font-bold ${toneClass(tone)}`}>
                  {month.marginPct === null ? '—' : `${month.marginPct}%`}
                </span>
                <span
                  className={`w-full rounded-t ${barToneClass(tone)}`}
                  style={{ height: `${month.coveredCount > 0 ? height : 4}px` }}
                  title={month.coveredCount > 0
                    ? `${month.label}: ${formatCompactBaseAmount(month.revenueBase)} sold, ${formatCompactBaseAmount(month.grossMarginBase)} kept, ${month.coveredCount} of ${month.orderCount} costed`
                    : `${month.label}: nothing costed`}
                />
                <span className="w-full truncate text-center text-[10px] font-semibold text-gray-400">{month.label}</span>
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-2 text-[11px] leading-4 text-gray-400">
        Column height is what you sold that month; the number above it is what you kept. A month with nothing costed
        shows a dash rather than a zero — by the date the order was committed.
      </p>
    </div>
  );
}

/**
 * Where the margin actually comes from.
 *
 * A per-order figure tells you about a transaction; this tells you about a
 * relationship. Three switches over one table, because customer, line and
 * supplier are the same question asked of a different column and an operator
 * comparing them wants them in the same place on screen. Supplier joined the
 * other two in the second pass: it is the side of the trade the operator can
 * actually renegotiate, and it was already being recorded with every cost.
 *
 * Every row opens. A group that cannot be expanded into the orders behind it is
 * a figure nobody believes the first time it surprises them.
 */
function MarginByGroup({
  groups,
  groupBy,
  focus,
  targetPct,
  onGroupByChange,
  onFocus,
}: {
  groups: MarginGroup[];
  groupBy: GroupBy;
  focus: string;
  targetPct: number;
  onGroupByChange: (next: GroupBy) => void;
  onFocus: (key: string) => void;
}) {
  const readable = groups.filter((group) => !group.unknown);
  const unknownCount = groups.length - readable.length;
  const best = readable.reduce<number>((max, group) => Math.max(max, Math.abs(group.grossMarginBase)), 0);
  const noun = groupBy === 'customer' ? 'customer' : groupBy === 'brand' ? 'line' : 'supplier';

  return (
    <div className="border-b border-gray-200 px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-navy">Where the margin comes from</h3>
        <div className="flex items-center gap-1 rounded-full bg-gray-100 p-0.5 text-xs font-bold">
          {(['customer', 'brand', 'supplier'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onGroupByChange(option)}
              aria-pressed={groupBy === option}
              className={`rounded-full px-3 py-1 ${groupBy === option ? 'bg-white text-navy shadow-sm' : 'text-gray-500'}`}
            >
              {option === 'customer' ? 'By customer' : option === 'brand' ? 'By line' : 'By supplier'}
            </button>
          ))}
        </div>
      </div>

      {readable.length === 0 ? (
        <p className="mt-2 text-xs text-gray-500">No {noun} has a costed order yet.</p>
      ) : (
        <ul className="mt-3 space-y-1">
          {readable.slice(0, 8).map((group) => {
            const active = focus === group.key;
            return (
              <li key={group.key}>
                <button
                  type="button"
                  onClick={() => onFocus(active ? '' : group.key)}
                  aria-pressed={active}
                  className={`flex w-full items-center gap-3 rounded-lg px-2 py-1 text-left ${active ? 'bg-violet-50 ring-1 ring-violet-200' : 'hover:bg-gray-50'}`}
                >
                  <span className="w-40 shrink-0 truncate text-xs font-bold text-gray-700" title={group.label}>
                    {group.label}
                  </span>
                  {/* The bar is width-by-contribution, so the customer carrying the
                      business is legible before any number is read. */}
                  <span className="h-2 min-w-[2px] flex-1 overflow-hidden rounded-full bg-gray-100">
                    <span
                      className={`block h-full rounded-full ${group.grossMarginBase < 0 ? 'bg-red-400' : 'bg-violet-400'}`}
                      style={{ width: best > 0 ? `${Math.max(2, Math.round((Math.abs(group.grossMarginBase) / best) * 100))}%` : '2%' }}
                    />
                  </span>
                  <span className={`w-28 shrink-0 text-right text-xs font-bold ${toneClass(marginTone(group.marginPct, targetPct))}`}>
                    {formatCompactBaseAmount(group.grossMarginBase)}
                  </span>
                  <span className={`w-12 shrink-0 text-right text-xs font-bold ${toneClass(marginTone(group.marginPct, targetPct))}`}>
                    {group.marginPct === null ? '—' : `${group.marginPct}%`}
                  </span>
                  <span className="w-24 shrink-0 text-right text-[11px] text-amber-700">
                    {group.targetGapBase > 0 ? `−${formatCompactBaseAmount(group.targetGapBase)}` : ''}
                  </span>
                  <span className="w-20 shrink-0 text-right text-[11px] text-gray-400">
                    {group.coveredCount}/{group.orderCount} costed
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-2 text-[11px] leading-4 text-gray-400">
        {readable.length > 0 && <>Pick a row to see only its orders in the table below. The amber figure is what that {noun} is short of your {targetPct}% target. </>}
        {unknownCount > 0 && (
          <>
            {unknownCount} {noun}{unknownCount === 1 ? '' : 's'}{' '}
            {unknownCount === 1 ? 'has' : 'have'} no costed order at all, so their margin is unknown rather than zero —
            they are left out of the bars above.
          </>
        )}
      </p>
    </div>
  );
}

/** Freight, duty and other on one order - the part a goods price hides. */
function LandedExtras({ margin }: { margin?: OrderMargin }) {
  if (!margin?.hasCost) return <span className="text-xs font-semibold text-gray-400">—</span>;
  if (!margin.hasExtras) {
    return <span className="text-xs font-semibold text-gray-400" title="No freight, duty or other cost recorded">Goods only</span>;
  }
  return (
    <span
      className="font-semibold text-gray-700"
      title={[
        margin.freightAmount !== null ? `Freight ${formatCurrencyAmount(margin.freightAmount, margin.extrasCurrency)}` : '',
        margin.dutyAmount !== null ? `Duty ${formatCurrencyAmount(margin.dutyAmount, margin.extrasCurrency)}` : '',
        margin.otherAmount !== null ? `Other ${formatCurrencyAmount(margin.otherAmount, margin.extrasCurrency)}` : '',
      ].filter(Boolean).join('\n')}
    >
      {formatCompactBaseAmount(margin.extrasBase)}
    </span>
  );
}

function Figure({ label, value, tone = 'unknown' }: { label: string; value: string; tone?: ReturnType<typeof marginTone> }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`text-sm font-bold ${toneClass(tone)}`}>{value}</p>
    </div>
  );
}

function MarginAmount({ margin, targetPct }: { margin?: OrderMargin; targetPct: number }) {
  if (!margin?.hasCost) return <span className="text-xs font-semibold text-gray-400">—</span>;
  return (
    <span className={`font-bold ${toneClass(marginTone(margin.marginPct, targetPct))}`}>
      {formatCompactBaseAmount(margin.marginBase)}
    </span>
  );
}

function MarginPercent({ margin, targetPct }: { margin?: OrderMargin; targetPct: number }) {
  if (!margin?.hasCost) return <span className="text-xs font-semibold text-gray-400">—</span>;
  if (margin.marginPct === null) {
    return <span className="text-xs font-semibold text-gray-400" title="This order has no value recorded">No value</span>;
  }
  return (
    <span className={`font-bold ${toneClass(marginTone(margin.marginPct, targetPct))}`}>
      {margin.marginPct}%
      {/* What the goods price alone would have said. Printed only where it
          differs, because that difference is the whole case for landed cost. */}
      {margin.hasExtras && margin.goodsMarginPct !== null && margin.goodsMarginPct !== margin.marginPct && (
        <span className="ml-1 text-[10px] font-semibold text-gray-400" title="On the goods price alone">
          ({margin.goodsMarginPct}% on goods)
        </span>
      )}
    </span>
  );
}

function TargetGap({ margin }: { margin?: OrderMargin }) {
  if (!margin?.hasCost || margin.marginPct === null) return <span className="text-xs font-semibold text-gray-400">—</span>;
  if (margin.targetGapBase <= 0) return <span className="text-xs font-bold text-emerald-700">Met</span>;
  return (
    <span className="text-xs font-bold text-amber-700">−{formatCompactBaseAmount(margin.targetGapBase)}</span>
  );
}

type CostDraft = {
  amount: number | null;
  currency: string;
  freightAmount: number | null;
  dutyAmount: number | null;
  otherAmount: number | null;
  extrasCurrency: string;
  supplier: string;
  note: string;
};

/**
 * The fields only the operator can fill, opened in the row they belong to.
 *
 * Goods carries its own currency and the three landed costs share a second one,
 * which is the shape of a real import: the principal invoices in USD, the
 * forwarder and the customs broker invoice in dong. One currency across the
 * whole record would have made the operator convert by hand, and a hand
 * conversion is a six-month-old rate baked into a number nobody can audit.
 *
 * The target-back arithmetic sits here rather than in the table because this is
 * the moment it is worth anything: the operator is looking at what they paid,
 * and the question in their head is what it should have been.
 */
function CostFields({
  order,
  margin,
  existing,
  targetPct,
  onSave,
  onClear,
  onCancel,
}: {
  order: CommittedOrder;
  margin?: OrderMargin;
  existing?: OrderCostRecord;
  targetPct: number;
  onSave: (draft: CostDraft) => void;
  onClear: () => void;
  onCancel: () => void;
}) {
  const [amountText, setAmountText] = useState(margin?.costAmount != null ? String(margin.costAmount) : '');
  const [currency, setCurrency] = useState(margin?.costCurrency || order.currency || 'VND');
  const [freightText, setFreightText] = useState(margin?.freightAmount != null ? String(margin.freightAmount) : '');
  const [dutyText, setDutyText] = useState(margin?.dutyAmount != null ? String(margin.dutyAmount) : '');
  const [otherText, setOtherText] = useState(margin?.otherAmount != null ? String(margin.otherAmount) : '');
  const [extrasCurrency, setExtrasCurrency] = useState(margin?.extrasCurrency || order.currency || 'VND');
  const [supplier, setSupplier] = useState(margin?.supplier || '');
  const [note, setNote] = useState(existing?.note || '');

  const amount = parseAmount(amountText);
  const freightAmount = parseAmount(freightText);
  const dutyAmount = parseAmount(dutyText);
  const otherAmount = parseAmount(otherText);
  const valid = [amountText, freightText, dutyText, otherText].every((text) => !text.trim() || parseAmount(text) !== null);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <AmountField label="Goods" value={amountText} onChange={setAmountText} placeholder="What the principal charged" autoFocus width="w-40" />
        <CurrencyField label="Currency" value={currency} onChange={setCurrency} />
        <AmountField label="Freight" value={freightText} onChange={setFreightText} placeholder="Shipping in" />
        <AmountField label="Duty / tax" value={dutyText} onChange={setDutyText} placeholder="Import duty" />
        <AmountField label="Other" value={otherText} onChange={setOtherText} placeholder="Install, warranty" />
        <CurrencyField label="Extras in" value={extrasCurrency} onChange={setExtrasCurrency} />
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">
          Supplier
          <input
            value={supplier}
            onChange={(event) => setSupplier(event.target.value)}
            placeholder="Who you bought from"
            className="mt-1 block w-52 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold normal-case tracking-normal text-gray-800 outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
          />
        </label>
        <label className="min-w-0 flex-1 text-[11px] font-bold uppercase tracking-wide text-gray-500">
          Note
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Anything this cost needs explaining by"
            className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-normal normal-case tracking-normal text-gray-800 outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
          />
        </label>
        <button
          type="button"
          disabled={!valid}
          onClick={() => onSave({ amount, currency, freightAmount, dutyAmount, otherAmount, extrasCurrency, supplier, note })}
          className="rounded-full bg-navy px-4 py-1.5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-50"
        >
          Cancel
        </button>
        {margin?.hasCost && (
          <button
            type="button"
            onClick={onClear}
            className="rounded-full px-2 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50"
          >
            Remove
          </button>
        )}
      </div>
      <TargetBackMath margin={margin} targetPct={targetPct} />
    </div>
  );
}

/**
 * What the price or the purchase had to be.
 *
 * The one piece of arithmetic an operator would otherwise do on a phone
 * calculator, and the only form in which a target is actionable: not "you missed
 * by four points" but "you needed 1.35bn out, or 980m in".
 */
function TargetBackMath({ margin, targetPct }: { margin?: OrderMargin; targetPct: number }) {
  if (!margin?.hasCost || margin.marginPct === null || margin.meetsTarget) return null;
  return (
    <p className="rounded-lg bg-violet-50 px-3 py-2 text-xs leading-5 text-violet-900">
      At {targetPct}% this order needed to sell for{' '}
      <span className="font-bold">{formatBaseCurrencyAmount(margin.priceForTargetBase ?? 0, true)}</span>, or land at{' '}
      <span className="font-bold">{formatBaseCurrencyAmount(margin.costForTargetBase ?? 0, true)}</span>. It kept{' '}
      {margin.marginPct}% — {formatBaseCurrencyAmount(margin.targetGapBase, true)} short.
    </p>
  );
}

function AmountField({
  label,
  value,
  onChange,
  placeholder,
  autoFocus = false,
  width = 'w-32',
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  autoFocus?: boolean;
  width?: string;
}) {
  return (
    <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        inputMode="decimal"
        autoFocus={autoFocus}
        placeholder={placeholder}
        className={`mt-1 block ${width} rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold normal-case tracking-normal text-gray-800 outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10`}
      />
    </label>
  );
}

function CurrencyField({ label, value, onChange }: { label: string; value: string; onChange: (next: string) => void }) {
  return (
    <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 block rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm font-semibold tracking-normal text-gray-800 outline-none focus:border-brand-blue"
      >
        {listSelectableCurrencies().map(({ code }) => <option key={code} value={code}>{code}</option>)}
      </select>
    </label>
  );
}

function parseAmount(text: string): number | null {
  if (!text.trim()) return null;
  const parsed = Number(text.replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function toneClass(tone: ReturnType<typeof marginTone>) {
  return {
    loss: 'text-red-700',
    thin: 'text-amber-700',
    healthy: 'text-emerald-700',
    unknown: 'text-navy',
  }[tone];
}

function barToneClass(tone: ReturnType<typeof marginTone>) {
  return {
    loss: 'bg-red-400',
    thin: 'bg-amber-400',
    healthy: 'bg-emerald-400',
    unknown: 'bg-gray-200',
  }[tone];
}
