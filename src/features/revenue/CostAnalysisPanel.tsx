import { useEffect, useMemo, useState } from 'react';
import { Coins, Pencil, Search } from 'lucide-react';
import type { CrmLiteOpportunity } from '../../services/opportunityStore';
import type { QuoteRecord } from '../../services/quoteStore';
import { deleteOrderCost, loadOrderCostsForWorkspace, saveOrderCost } from '../../services/orderCostStore';
import { buildOrderBook, COMMIT_PROBABILITY_THRESHOLD, type CommittedOrder } from '../../utils/orderToCash';
import {
  buildOrderMargins,
  marginTone,
  rollupOrderMargins,
  type MarginGroup,
  type OrderCostRecord,
  type OrderMargin,
  type OrderMarginSummary,
} from '../../utils/orderMargin';
import {
  formatBaseCurrencyAmount,
  formatCompactBaseAmount,
  formatCurrencyAmount,
  SUPPORTED_CURRENCIES,
} from '../../utils/money';

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
 * What it is *not* is the accounting profit-and-loss statement in utils/pnl.ts.
 * That one is cash-basis over a period - money collected against money paid,
 * with expense categories - and it sits behind an off-by-default flag because
 * Memoire is not a bookkeeping product. This asks a commercial question about
 * orders the operator is already looking at: what did these goods cost me, what
 * did I keep, and which customers and which lines am I actually making money on.
 * It needs no expense ledger and no accounting period, which is exactly why it
 * can be on by default while the other one is not.
 *
 * Three rules hold it honest, and each maps to a way the number could lie:
 *
 *   1. Nothing is counted twice, and nothing is counted half. Only orders with
 *      both a value and a purchase cost enter the totals, and the coverage is
 *      stated everywhere a total appears.
 *   2. It reads and never writes back. The order value stays whatever the quote
 *      or the deal says; cost is a separate record that cannot touch it.
 *   3. It does not open itself. Until a first purchase cost exists the whole
 *      module is one line offering to start - because plenty of operators never
 *      see purchase price, and an empty analysis reads as a broken product.
 */
export function CostAnalysisPanel({
  opportunities,
  quotes,
  dataUserId,
  sampleDataActive,
}: {
  opportunities: CrmLiteOpportunity[];
  quotes: QuoteRecord[];
  dataUserId?: string;
  sampleDataActive: boolean;
}) {
  const [costRecords, setCostRecords] = useState<OrderCostRecord[]>([]);
  const [search, setSearch] = useState('');
  const [showOnlyMissing, setShowOnlyMissing] = useState(false);
  const [groupBy, setGroupBy] = useState<'customer' | 'brand'>('customer');
  const [editingId, setEditingId] = useState('');
  const [entryOpen, setEntryOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadOrderCostsForWorkspace(dataUserId, sampleDataActive).then((records) => {
      if (!cancelled) setCostRecords(records);
    });
    return () => { cancelled = true; };
  }, [dataUserId, sampleDataActive]);

  // The same committed orders the order book shows, from the same function.
  //
  // Milestone ticks are deliberately not loaded here: they decide where an order
  // is stuck, not which orders exist or what they are worth, so margin computed
  // without them is identical to margin computed with them. The order-margin
  // contract asserts that equality rather than leaving it as a comment, and this
  // saves a second cloud read of a collection the panel above already holds.
  const orders = useMemo(
    () => buildOrderBook({ opportunities, quotes, milestoneRecords: [] }).orders,
    [opportunities, quotes],
  );

  const margins = useMemo(() => buildOrderMargins({ orders, costRecords }), [orders, costRecords]);

  const brandByOrder = useMemo(() => new Map(
    opportunities.map((opportunity) => [opportunity.id, (opportunity.brand || '').trim()]),
  ), [opportunities]);

  const groups = useMemo(() => rollupOrderMargins({
    margins,
    entries: orders.map((order) => {
      const brand = brandByOrder.get(order.opportunityId) || '';
      return groupBy === 'customer'
        ? { opportunityId: order.opportunityId, key: order.accountName || 'Unknown account', label: order.accountName || 'Unknown account' }
        : { opportunityId: order.opportunityId, key: brand || 'No line recorded', label: brand || 'No line recorded' };
    }),
  }), [orders, margins, groupBy, brandByOrder]);

  const visibleOrders = useMemo(() => {
    const query = search.trim().toLowerCase();
    return orders
      .filter((order) => !showOnlyMissing || !margins.byOrder.get(order.opportunityId)?.hasCost)
      .filter((order) => !query || [order.accountName, order.orderName, order.orderRef]
        .join(' ').toLowerCase().includes(query))
      // Orders without a cost first - they are the work this module is asking
      // for - then the thinnest margins, which are the ones worth arguing about.
      .sort((left, right) => {
        const leftMargin = margins.byOrder.get(left.opportunityId);
        const rightMargin = margins.byOrder.get(right.opportunityId);
        return Number(leftMargin?.hasCost) - Number(rightMargin?.hasCost)
          || (leftMargin?.marginPct ?? 999) - (rightMargin?.marginPct ?? 999)
          || right.amountBase - left.amountBase;
      });
  }, [orders, margins, search, showOnlyMissing]);

  const writeCost = (order: CommittedOrder, amount: number | null, currency: string, supplier: string) => {
    setCostRecords(saveOrderCost({
      opportunityId: order.opportunityId,
      amount,
      currency,
      supplier,
      source: sampleDataActive ? 'demo' : 'user',
      isSample: sampleDataActive,
    }));
    setEditingId('');
  };

  const clearCost = (order: CommittedOrder) => {
    setCostRecords(deleteOrderCost(order.opportunityId));
    setEditingId('');
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
            One purchase cost per committed order, and the margin it leaves. Record the cost on the orders you know;
            leave the rest blank and they stay out of every figure here.
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
          <HeadlineFigures margins={margins} />
          <MarginByGroup groups={groups} groupBy={groupBy} onGroupByChange={setGroupBy} />
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
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowOnlyMissing(!showOnlyMissing)}
                aria-pressed={showOnlyMissing}
                className={`rounded-full px-3 py-1 text-xs font-bold ${
                  showOnlyMissing ? 'bg-navy text-white' : 'border border-gray-200 bg-white text-gray-600'
                }`}
              >
                Missing a cost ({margins.totalCount - margins.coveredCount})
              </button>
              <p className="text-xs font-semibold text-gray-500">{visibleOrders.length} of {orders.length}</p>
            </div>
          </div>

          {/* Same `relative` + `overflow-x-auto` pair as the order book above:
              without it this table's width grows the whole document and every
              page on a phone scrolls sideways. */}
          <div className="relative max-w-full overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-left text-sm">
              <thead className="bg-gray-50 text-[11px] font-bold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="border-y border-gray-200 px-4 py-2">Order</th>
                  <th className="border-y border-gray-200 px-3 py-2 text-right">Sold for</th>
                  <th className="border-y border-gray-200 px-3 py-2 text-right">Cost</th>
                  <th className="border-y border-gray-200 px-3 py-2">Supplier</th>
                  <th className="border-y border-gray-200 px-3 py-2 text-right">Gross margin</th>
                  <th className="border-y border-gray-200 px-3 py-2 text-right">Kept</th>
                  <th className="border-y border-gray-200 px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visibleOrders.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-sm text-gray-500">
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
                        <p className="max-w-[260px] truncate font-bold text-navy" title={`${order.accountName} / ${order.orderName}`}>
                          {order.accountName}
                        </p>
                        <p className="max-w-[260px] truncate text-xs text-gray-500">
                          <span className="font-mono font-bold text-brand-blue">{order.orderRef}</span>
                          {' · '}
                          {order.orderName}
                        </p>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-bold text-gray-800">
                        {typeof order.amount === 'number' ? formatCurrencyAmount(order.amount, order.currency) : 'Not valued'}
                      </td>

                      {editing ? (
                        <td colSpan={5} className="px-3 py-2">
                          <CostFields
                            order={order}
                            margin={margin}
                            onSave={(amount, currency, supplier) => writeCost(order, amount, currency, supplier)}
                            onClear={() => clearCost(order)}
                            onCancel={() => setEditingId('')}
                          />
                        </td>
                      ) : (
                        <>
                          <td className="whitespace-nowrap px-3 py-2 text-right">
                            {margin?.hasCost ? (
                              <span className="font-semibold text-gray-800">
                                {formatCurrencyAmount(margin.costAmount, margin.costCurrency)}
                              </span>
                            ) : (
                              <span className="text-xs font-semibold text-gray-400">Not recorded</span>
                            )}
                          </td>
                          <td className="max-w-[160px] truncate px-3 py-2 text-xs text-gray-600" title={margin?.supplier}>
                            {margin?.supplier || '—'}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-right">
                            <MarginAmount margin={margin} />
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-right">
                            <MarginPercent margin={margin} />
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
              operator cannot tell a thin order from a shifting definition. Two
              fixed lines, written down: below cost is red, under 10% kept is
              amber. A distributor knows what thin looks like in their own
              trade, so this is stated rather than learned. */}
          <p className="border-t border-gray-100 px-5 py-3 text-xs leading-5 text-gray-500">
            <span className="font-bold text-red-700">Red</span> is an order sold below what it cost.{' '}
            <span className="font-bold text-amber-700">Amber</span> is under 10% kept. Both lines are fixed, not
            learned from your data. Leave the cost blank on orders you do not know or do not care about — those are
            left out of every figure here, on both sides, rather than counted as free.
          </p>
        </>
      )}
    </section>
  );
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
        there is nothing to work a margin out from yet. Record what one order cost you and this fills in: margin per
        order, per customer, and per line you carry.
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

/** Sold, cost, kept - and the denominator, stated before anything else is read. */
function HeadlineFigures({ margins }: { margins: OrderMarginSummary }) {
  const tone = marginTone(margins.marginPct);
  return (
    <div className="mt-4 border-y border-gray-200 bg-violet-50/40 px-5 py-3">
      <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2">
        <Figure label="Sold for" value={formatBaseCurrencyAmount(margins.revenueBase, true)} />
        <Figure label="Cost" value={formatBaseCurrencyAmount(margins.costBase, true)} />
        <Figure label="Gross margin" value={formatBaseCurrencyAmount(margins.grossMarginBase, true)} tone={tone} />
        {margins.marginPct !== null && <Figure label="Kept" value={`${margins.marginPct}%`} tone={tone} />}
        {/* Only once there is more than one costed order. With exactly one, the
            thinnest order and the whole book are the same number printed twice,
            which reads as two findings where there is none. */}
        {margins.coveredCount > 1 && margins.thinnest && margins.thinnest.marginPct !== null && (
          <Figure
            label="Thinnest order"
            value={`${margins.thinnest.marginPct}%`}
            tone={marginTone(margins.thinnest.marginPct)}
          />
        )}
      </div>
      <p className="mt-1.5 text-[11px] leading-4 text-gray-500">
        Across the {margins.coveredCount} of {margins.totalCount} committed order
        {margins.totalCount === 1 ? '' : 's'} that carry a purchase cost.
        {margins.totalCount > margins.coveredCount && (
          <>
            {' '}The other {margins.totalCount - margins.coveredCount}{' '}
            {margins.totalCount - margins.coveredCount === 1 ? 'is' : 'are'} counted on neither side.
          </>
        )}
      </p>
    </div>
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

/**
 * Where the margin actually comes from.
 *
 * A per-order figure tells you about a transaction; this tells you about a
 * relationship. Two switches rather than two tables, because customer and line
 * are the same question asked of a different column and an operator comparing
 * them wants them in the same place on screen.
 */
function MarginByGroup({
  groups,
  groupBy,
  onGroupByChange,
}: {
  groups: MarginGroup[];
  groupBy: 'customer' | 'brand';
  onGroupByChange: (next: 'customer' | 'brand') => void;
}) {
  const readable = groups.filter((group) => !group.unknown);
  const unknownCount = groups.length - readable.length;
  const best = readable.reduce<number>((max, group) => Math.max(max, Math.abs(group.grossMarginBase)), 0);

  return (
    <div className="border-b border-gray-200 px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-navy">Where the margin comes from</h3>
        <div className="flex items-center gap-1 rounded-full bg-gray-100 p-0.5 text-xs font-bold">
          {(['customer', 'brand'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onGroupByChange(option)}
              aria-pressed={groupBy === option}
              className={`rounded-full px-3 py-1 ${groupBy === option ? 'bg-white text-navy shadow-sm' : 'text-gray-500'}`}
            >
              {option === 'customer' ? 'By customer' : 'By line'}
            </button>
          ))}
        </div>
      </div>

      {readable.length === 0 ? (
        <p className="mt-2 text-xs text-gray-500">
          No {groupBy === 'customer' ? 'customer' : 'line'} has a costed order yet.
        </p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {readable.slice(0, 8).map((group) => (
            <li key={group.key} className="flex items-center gap-3">
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
              <span className={`w-28 shrink-0 text-right text-xs font-bold ${toneClass(marginTone(group.marginPct))}`}>
                {formatCompactBaseAmount(group.grossMarginBase)}
              </span>
              <span className={`w-12 shrink-0 text-right text-xs font-bold ${toneClass(marginTone(group.marginPct))}`}>
                {group.marginPct === null ? '—' : `${group.marginPct}%`}
              </span>
              <span className="w-20 shrink-0 text-right text-[11px] text-gray-400">
                {group.coveredCount}/{group.orderCount} costed
              </span>
            </li>
          ))}
        </ul>
      )}

      {unknownCount > 0 && (
        <p className="mt-2 text-[11px] leading-4 text-gray-400">
          {unknownCount} {groupBy === 'customer' ? 'customer' : 'line'}{unknownCount === 1 ? '' : 's'}{' '}
          {unknownCount === 1 ? 'has' : 'have'} no costed order at all, so their margin is unknown rather than zero —
          they are left out of the bars above.
        </p>
      )}
    </div>
  );
}

function MarginAmount({ margin }: { margin?: OrderMargin }) {
  if (!margin?.hasCost) return <span className="text-xs font-semibold text-gray-400">—</span>;
  return (
    <span className={`font-bold ${toneClass(marginTone(margin.marginPct))}`}>
      {formatCompactBaseAmount(margin.marginBase)}
    </span>
  );
}

function MarginPercent({ margin }: { margin?: OrderMargin }) {
  if (!margin?.hasCost) return <span className="text-xs font-semibold text-gray-400">—</span>;
  if (margin.marginPct === null) {
    return <span className="text-xs font-semibold text-gray-400" title="This order has no value recorded">No value</span>;
  }
  return <span className={`font-bold ${toneClass(marginTone(margin.marginPct))}`}>{margin.marginPct}%</span>;
}

/** The one field only the operator can fill, opened in the row it belongs to. */
function CostFields({
  order,
  margin,
  onSave,
  onClear,
  onCancel,
}: {
  order: CommittedOrder;
  margin?: OrderMargin;
  onSave: (amount: number | null, currency: string, supplier: string) => void;
  onClear: () => void;
  onCancel: () => void;
}) {
  const [amountText, setAmountText] = useState(margin?.costAmount != null ? String(margin.costAmount) : '');
  const [currency, setCurrency] = useState(margin?.costCurrency || order.currency || 'VND');
  const [supplier, setSupplier] = useState(margin?.supplier || '');

  const parsed = amountText.trim() ? Number(amountText.replace(/[^\d.-]/g, '')) : null;
  const valid = parsed === null || Number.isFinite(parsed);

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">
        Purchase cost
        <input
          value={amountText}
          onChange={(event) => setAmountText(event.target.value)}
          inputMode="decimal"
          autoFocus
          placeholder="What the goods cost you"
          className="mt-1 block w-44 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold normal-case tracking-normal text-gray-800 outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
        />
      </label>
      <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">
        Currency
        <select
          value={currency}
          onChange={(event) => setCurrency(event.target.value)}
          className="mt-1 block rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm font-semibold tracking-normal text-gray-800 outline-none focus:border-brand-blue"
        >
          {SUPPORTED_CURRENCIES.map((code) => <option key={code} value={code}>{code}</option>)}
        </select>
      </label>
      <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">
        Supplier
        <input
          value={supplier}
          onChange={(event) => setSupplier(event.target.value)}
          placeholder="Who you bought from"
          className="mt-1 block w-52 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold normal-case tracking-normal text-gray-800 outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
        />
      </label>
      <button
        type="button"
        disabled={!valid}
        onClick={() => onSave(parsed, currency, supplier)}
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
  );
}

function toneClass(tone: ReturnType<typeof marginTone>) {
  return {
    loss: 'text-red-700',
    thin: 'text-amber-700',
    healthy: 'text-emerald-700',
    unknown: 'text-navy',
  }[tone];
}
