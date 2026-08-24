import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronDown, PackageCheck, Search } from 'lucide-react';
import type { CrmLiteOpportunity } from '../../services/opportunityStore';
import type { QuoteRecord } from '../../services/quoteStore';
import {
  loadOrderMilestonesForWorkspace,
  toggleOrderMilestone,
} from '../../services/orderMilestoneStore';
import {
  buildOrderBook,
  COMMIT_PROBABILITY_THRESHOLD,
  ORDER_STALLED_AFTER_DAYS,
  orderStages,
  type CommittedOrder,
  type OrderMilestoneRecord,
  type OrderMilestoneState,
  type OrderStage,
  type OrderTermRecord,
  type OrderOutcomeRecord,
} from '../../utils/orderToCash';
import { formatBaseCurrencyAmount, formatCompactBaseAmount, formatCurrencyAmount } from '../../utils/money';
import { formatSafeBusinessDate } from '../../utils/safeDate';
import { matchesSearchQuery } from '../../utils/textSearch';

/**
 * The order book, read the way an ERP reads one.
 *
 * The founder's note was that following an order after it is placed is still
 * not clear here, and that ERPs have solved this. What those systems actually
 * do is not prettier chips - it is four things this panel was missing:
 *
 *   1. Every order has a *status* derived from its documents, so the whole book
 *      can be counted and filtered by where orders are stuck. A progress bar
 *      per card cannot be counted.
 *   2. Every order has a *reference and a date*. You chase an order by its
 *      number, and "when was this ordered" is the first question anyone asks.
 *   3. Every order shows *aging*. An order that has not moved in sixty days
 *      looked identical to one confirmed this morning.
 *   4. It is a *list*, not a stack of cards: one row per order, sortable by the
 *      thing that matters, with the detail one click down rather than always on.
 *
 * The milestone ticks are unchanged and still live in the row's detail: they
 * are how an operator with no ERP records a deposit that no document proves.
 */
export function OrderBookPanel({
  opportunities,
  quotes,
  termRecords,
  outcomes,
  dataUserId,
  sampleDataActive,
}: {
  opportunities: CrmLiteOpportunity[];
  quotes: QuoteRecord[];
  /**
   * When each closed deal closed. Without it the engine falls back to the
   * record's last edit, which dates an imported book at the import.
   */
  outcomes: OrderOutcomeRecord[];
  /**
   * The payment terms recorded against each order, for the ordinary case of a
   * deal won without a quote. Handed down rather than read here, because this
   * panel answers "where is my money" and must not reach into the module that
   * answers "was it worth it" - see verify-order-margin, case 1b.
   */
  termRecords: OrderTermRecord[];
  dataUserId?: string;
  sampleDataActive: boolean;
}) {
  const [milestoneRecords, setMilestoneRecords] = useState<OrderMilestoneRecord[]>([]);
  const [stageFilter, setStageFilter] = useState<OrderStage | 'all' | 'overdue'>('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState('');

  useEffect(() => {
    let cancelled = false;
    void loadOrderMilestonesForWorkspace(dataUserId, sampleDataActive).then((records) => {
      if (!cancelled) setMilestoneRecords(records);
    });
    return () => { cancelled = true; };
  }, [dataUserId, sampleDataActive]);

  const book = useMemo(
    // `termRecords` is what stops a Net 30 order keeping a Deposit step it never
    // owed. The engine has always honoured it; this caller used to omit it, so
    // the order book printed "No payment term" for terms that were saved and
    // built the road to cash from that blank.
    () => buildOrderBook({ opportunities, quotes, milestoneRecords, costRecords: termRecords, outcomes }),
    [termRecords, milestoneRecords, opportunities, quotes, outcomes],
  );

  const visibleOrders = useMemo(() => {
    const query = search.trim().toLowerCase();
    return book.orders.filter((order) => {
      if (stageFilter === 'overdue' && !order.overdue) return false;
      if (stageFilter !== 'all' && stageFilter !== 'overdue' && order.orderStage !== stageFilter) return false;
      if (!query) return true;
      return matchesSearchQuery([order.accountName, order.orderName, order.orderRef, order.paymentTerm].join(' '), query);
    });
  }, [book.orders, search, stageFilter]);

  const toggle = (order: CommittedOrder, milestone: OrderMilestoneState) => {
    // A quote-proven milestone is not arguable from here - it changes when the
    // quote changes. Only the hand-made ticks toggle.
    if (milestone.evidence === 'quote') return;
    setMilestoneRecords(toggleOrderMilestone({
      opportunityId: order.opportunityId,
      milestone: milestone.key,
      done: !milestone.done,
      source: sampleDataActive ? 'demo' : 'user',
      isSample: sampleDataActive,
    }));
  };

  return (
    // `min-w-0` is not decoration: without it the 980px order table grows the
    // whole document's scroll width, and every page on a phone scrolls sideways
    // by 590px. The table's own overflow-x container clips the paint but not
    // the layout, which is why the two other master tables in this app carry
    // the same pair.
    <section className="min-w-0 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
        <div>
          <div className="flex items-center gap-2">
            <PackageCheck className="h-4 w-4 text-brand-blue" />
            <h2 className="text-lg font-bold text-navy">Order book</h2>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            Deals the customer has committed to ({COMMIT_PROBABILITY_THRESHOLD}%+, procurement, or won), each one
            followed from contract to cash. Status comes from what the records already prove; tick the steps no
            document will ever prove.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
          <span className="rounded-full bg-blue-50 px-3 py-1 text-brand-blue">
            Awaiting: {formatBaseCurrencyAmount(book.awaitingBase, true)}
          </span>
          {book.overdueCount > 0 && (
            <span className="rounded-full bg-red-50 px-3 py-1 text-red-700">{book.overdueCount} overdue</span>
          )}
          {/* An order is only ever "overdue" against a date, and a step's date
              comes from a quote's payment terms - so an order won on a
              handshake can sit for ever without one. This book showed five
              orders, one of them at "To confirm" since March, and reported
              nothing late. Time nobody accounted for is its own signal. */}
          {book.stalledCount > 0 && (
            <span
              className="rounded-full bg-amber-50 px-3 py-1 text-amber-700"
              title={`No date was set on the next step and nothing has moved in ${ORDER_STALLED_AFTER_DAYS} days or more.`}
            >
              {book.stalledCount} stalled
            </span>
          )}
          {book.collectedCount > 0 && (
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">{book.collectedCount} collected</span>
          )}
        </div>
      </div>

      {book.orders.length === 0 ? (
        <p className="m-5 rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-5 text-sm text-gray-500">
          No committed orders yet. When a deal reaches {COMMIT_PROBABILITY_THRESHOLD}% probability, enters procurement,
          or is won, it lands here with its road to cash laid out.
        </p>
      ) : (
        <>
          {/* The pipeline of the order book itself. Each counter is a filter,
              because seeing that three orders are waiting to be invoiced and
              not being able to list them is worse than not knowing. */}
          <div className="mt-4 grid grid-cols-2 gap-px border-y border-gray-200 bg-gray-200 sm:grid-cols-4 lg:grid-cols-7">
            <StageCell
              label="All orders"
              count={book.totalCount}
              valueBase={book.orders.reduce((sum, order) => sum + order.amountBase, 0)}
              active={stageFilter === 'all'}
              onClick={() => setStageFilter('all')}
            />
            {orderStages.map((stage) => {
              const summary = book.stages.find((item) => item.stage === stage);
              return (
                <StageCell
                  key={stage}
                  label={stage}
                  count={summary?.count || 0}
                  valueBase={summary?.valueBase || 0}
                  overdueCount={summary?.overdueCount || 0}
                  active={stageFilter === stage}
                  onClick={() => setStageFilter(stage)}
                />
              );
            })}
          </div>

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
              {book.overdueCount > 0 && (
                <button
                  type="button"
                  onClick={() => setStageFilter(stageFilter === 'overdue' ? 'all' : 'overdue')}
                  className={`rounded-full px-3 py-1 text-xs font-bold ${
                    stageFilter === 'overdue' ? 'bg-red-600 text-white' : 'border border-red-200 bg-red-50 text-red-700'
                  }`}
                >
                  Late only ({book.overdueCount})
                </button>
              )}
              <p className="text-xs font-semibold text-gray-500">{visibleOrders.length} of {book.totalCount}</p>
            </div>
          </div>

          {/* `relative` is load bearing. The screen-reader spans inside the
              rows are absolutely positioned, so their containing block is the
              nearest positioned ancestor - which used to be the app's <main>,
              not this scroller. They escaped the clip, sat at x=981 inside the
              wide table, and made every phone page scroll sideways. */}
          <div className="relative max-w-full overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-left text-sm">
              <thead className="bg-gray-50 text-[11px] font-bold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="border-y border-gray-200 px-4 py-2">Order</th>
                  <th className="border-y border-gray-200 px-3 py-2">Ordered</th>
                  <th className="border-y border-gray-200 px-3 py-2 text-right">Value</th>
                  <th className="border-y border-gray-200 px-3 py-2">Status</th>
                  <th className="border-y border-gray-200 px-3 py-2">Next step</th>
                  <th className="border-y border-gray-200 px-3 py-2">Waiting</th>
                  <th className="border-y border-gray-200 px-3 py-2 text-right">Steps</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visibleOrders.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-sm text-gray-500">
                      No orders at this step.
                    </td>
                  </tr>
                )}
                {visibleOrders.map((order) => {
                  const expanded = expandedId === order.opportunityId;
                  return (
                    <Fragment key={order.opportunityId}>
                      <tr
                        onClick={() => setExpandedId(expanded ? '' : order.opportunityId)}
                        className={`cursor-pointer align-top transition hover:bg-blue-50/50 ${
                          order.fullyCollected ? 'bg-emerald-50/30' : order.overdue ? 'bg-red-50/30' : 'bg-white'
                        }`}
                      >
                        <td className="px-4 py-2">
                          <p className="max-w-[clamp(280px,21vw,540px)] truncate font-bold text-navy" title={`${order.accountName} / ${order.orderName}`}>
                            {order.accountName}
                          </p>
                          <p className="max-w-[clamp(280px,21vw,540px)] line-clamp-2 text-xs text-gray-500">
                            <span className="font-mono font-bold text-brand-blue">{order.orderRef}</span>
                            {' · '}
                            {order.orderName}
                          </p>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-xs font-semibold text-gray-600">
                          {order.orderDate ? formatSafeBusinessDate(order.orderDate) : 'Not dated'}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right">
                          <p className="font-bold text-gray-800">
                            {typeof order.amount === 'number' ? formatCurrencyAmount(order.amount, order.currency) : 'Not valued'}
                          </p>
                          <p className="truncate text-xs text-gray-500" title={order.paymentTerm}>
                            {order.paymentTerm || 'No payment term'}
                          </p>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">
                          <StageBadge order={order} />
                        </td>
                        <td className="px-3 py-2">
                          {order.fullyCollected ? (
                            <p className="text-xs font-semibold text-emerald-700">Money in the bank</p>
                          ) : (
                            <>
                              <p className="max-w-[clamp(190px,14vw,360px)] line-clamp-2 font-semibold text-gray-800">
                                {order.nextMilestone?.label}
                              </p>
                              <p className={`text-xs font-semibold ${order.overdue ? 'text-red-700' : 'text-gray-500'}`}>
                                {order.nextDueDate
                                  ? `${order.daysUntilDue !== null && order.daysUntilDue < 0 ? 'Late since' : 'Expected'} ${formatSafeBusinessDate(order.nextDueDate)}`
                                  : 'No date on the record'}
                              </p>
                            </>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">
                          <p className={`font-bold ${agingTone(order)}`}>
                            {order.daysInStage === null ? '—' : `${order.daysInStage}d`}
                          </p>
                          {/* "171d since it moved" was already on the row and
                              said nothing about whether that was acceptable.
                              The word is what turns an age into a verdict. */}
                          <p className={`text-xs ${order.stalled ? 'font-semibold text-amber-700' : 'text-gray-500'}`}>
                            {order.stalled ? 'stalled · no date set' : 'since it moved'}
                          </p>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-end gap-1.5">
                            <StepDots order={order} />
                            <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition ${expanded ? 'rotate-180' : ''}`} />
                          </div>
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="bg-gray-50/70">
                          <td colSpan={7} className="px-4 py-3">
                            <div className="flex flex-wrap items-center gap-1.5">
                              {order.milestones.map((milestone, index) => (
                                <div key={milestone.key} className="flex items-center gap-1.5">
                                  {index > 0 && <span className={`h-px w-3 ${milestone.done ? 'bg-emerald-300' : 'bg-gray-200'}`} />}
                                  <button
                                    type="button"
                                    onClick={(event) => { event.stopPropagation(); toggle(order, milestone); }}
                                    disabled={milestone.evidence === 'quote'}
                                    title={
                                      milestone.evidence === 'quote'
                                        ? 'Proven by the linked quote - it changes when the quote changes.'
                                        : milestone.done
                                          ? 'Ticked by you. Click to untick.'
                                          : `Mark "${milestone.label}" done${milestone.dueDate ? ` (expected ${milestone.dueDate})` : ''}`
                                    }
                                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold transition ${
                                      milestone.done
                                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                        : milestone.overdue
                                          ? 'border-red-200 bg-white text-red-700 hover:bg-red-50'
                                          : 'border-gray-200 bg-white text-gray-500 hover:border-brand-blue/50 hover:text-brand-blue'
                                    } ${milestone.evidence === 'quote' ? 'cursor-default' : ''}`}
                                  >
                                    {milestone.done && <Check className="h-3 w-3" />}
                                    {milestone.label}
                                    {milestone.overdue && !milestone.done && <span className="font-black">!</span>}
                                  </button>
                                </div>
                              ))}
                            </div>
                            <p className="mt-2 text-xs leading-5 text-gray-500">
                              {order.status === 'Won' ? 'Won' : `${order.stage}${order.probability !== null ? ` · ${order.probability}%` : ''}`}
                              {order.quoteCount > 0
                                ? ` · ${order.quoteCount} linked quote${order.quoteCount === 1 ? '' : 's'} filling in the steps below`
                                : ' · no quote linked, so every step here is yours to tick'}
                              {order.lastMovedAt ? ` · last movement ${formatSafeBusinessDate(order.lastMovedAt)}` : ''}
                              {'. '}
                              <Link to={order.href} className="font-bold text-brand-blue hover:underline">Open the deal</Link>
                            </p>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function StageCell({
  label,
  count,
  valueBase,
  overdueCount = 0,
  active,
  onClick,
}: {
  label: string;
  count: number;
  valueBase: number;
  overdueCount?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`px-3 py-2 text-left transition ${
        active ? 'bg-navy text-white' : count === 0 ? 'bg-gray-50 text-gray-400 hover:bg-white' : 'bg-white text-navy hover:bg-blue-50/60'
      }`}
    >
      <p className={`truncate text-[10px] font-bold uppercase tracking-wide ${active ? 'text-white/70' : 'text-gray-400'}`} title={label}>
        {label}
      </p>
      <p className="text-lg font-bold leading-tight">{count}</p>
      <p className={`truncate text-[11px] font-semibold ${active ? 'text-white/70' : 'text-gray-500'}`}>
        {valueBase > 0 ? formatCompactBaseAmount(valueBase) : '—'}
        {overdueCount > 0 && <span className={active ? '' : ' text-red-600'}> · {overdueCount} late</span>}
      </p>
    </button>
  );
}

function StageBadge({ order }: { order: CommittedOrder }) {
  const tone = order.fullyCollected
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : order.overdue
      ? 'border-red-200 bg-red-50 text-red-700'
      : 'border-blue-100 bg-blue-50 text-brand-blue';
  return <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${tone}`}>{order.orderStage}</span>;
}

/** Five dots, one per step. The row's shape at a glance, without a legend. */
function StepDots({ order }: { order: CommittedOrder }) {
  return (
    <span className="flex items-center gap-1" title={`${order.doneCount} of ${order.milestones.length} steps done`}>
      {order.milestones.map((milestone) => (
        <span
          key={milestone.key}
          aria-hidden
          className={`h-2 w-2 rounded-full ${
            milestone.done ? 'bg-emerald-500' : milestone.overdue ? 'bg-red-500' : 'bg-gray-200'
          }`}
        />
      ))}
      <span className="sr-only">{order.doneCount} of {order.milestones.length} steps done</span>
    </span>
  );
}

/**
 * Aging colour. Two weeks without movement on a committed order is the point at
 * which a distributor's customer starts assuming it is not coming.
 */
function agingTone(order: CommittedOrder): string {
  if (order.fullyCollected) return 'text-emerald-700';
  if (order.daysInStage === null) return 'text-gray-400';
  if (order.daysInStage >= 30) return 'text-red-700';
  if (order.daysInStage >= 14) return 'text-amber-700';
  return 'text-gray-700';
}
