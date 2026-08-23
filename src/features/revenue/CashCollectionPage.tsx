import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Banknote, ChevronDown, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useAuthContext } from '../../auth/authContext';
import { DataModePill } from '../../components/common/DataModePill';
import { PageContainer, PageHeader } from '../../components/layout/PageFrame';
import { SkeletonCard, SkeletonScreen } from '../../components/common/Skeleton';
import type { CrmLiteOpportunity } from '../../services/opportunityStore';
import type { QuoteRecord } from '../../services/quoteStore';
import type { OpportunityOutcomeRecord } from '../../services/opportunityOutcomeStore';
import { getCachedSalesWorkspaceData, loadSalesWorkspaceData } from '../../services/workspaceData';
import {
  loadOrderReceivablesForWorkspace,
  recordPaymentReceipt,
  removePaymentReceipt,
  saveOrderReceivableTerms,
} from '../../services/orderReceivableStore';
import { hasLocalSampleData } from '../../utils/dataMode';
import { loadOrderCostsForWorkspace } from '../../services/orderCostStore';
import type { OrderCostRecord } from '../../utils/orderMargin';
import { buildOrderBook, type OrderMilestoneRecord } from '../../utils/orderToCash';
import { loadOrderMilestonesForWorkspace } from '../../services/orderMilestoneStore';
import {
  agingBucketLabels,
  buildReceivables,
  createPaymentReceipt,
  type OrderReceivable,
  type OrderReceivableRecord,
} from '../../utils/receivables';
import { describeInstallment, parsePaymentTerm } from '../../utils/paymentTerms';
import { formatBaseCurrencyAmount, formatCompactBaseAmount, getReportingCurrency } from '../../utils/money';
import { formatSafeBusinessDate, todayDateKey } from '../../utils/safeDate';
import { pluralizeCount } from '../../utils/numberFormat';

/**
 * Cash collection - công nợ, and the calls it implies.
 *
 * Orders answers where an order is: confirmed, delivered, invoiced. This answers
 * the question that comes after and that the order book could only ever tick:
 * how much money is still out, whose it is, how late it is, and what arrived.
 *
 * The founder asked for these as two destinations rather than one page, and
 * their reasoning is the right one: an order is a thing you fulfil, and a
 * receivable is a thing you chase. They move on different clocks, they are read
 * by the same person in different moods, and a delivery that is on time can sit
 * behind money that is ninety days late.
 *
 * Nothing here is entered twice. Every due date is derived from the payment
 * terms already written on the quote, so a workspace has a receivables ledger
 * the moment this page opens. The only thing an operator records is the part no
 * document in the product could prove - that the money actually landed.
 */
export function CashCollectionPage() {
  const { user, loading: authLoading } = useAuthContext();
  const sampleDataActive = hasLocalSampleData();
  const dataUserId = sampleDataActive ? undefined : user?.id;

  const cached = getCachedSalesWorkspaceData(dataUserId);
  const [opportunities, setOpportunities] = useState<CrmLiteOpportunity[]>(cached?.opportunities || []);
  const [quotes, setQuotes] = useState<QuoteRecord[]>(cached?.quotes || []);
  // The day each deal closed, which is the day its order was placed. Without
  // it every order in an imported book is dated at the import and nothing in
  // the collection schedule can ever read as late.
  const [outcomes, setOutcomes] = useState<OpportunityOutcomeRecord[]>(cached?.opportunityOutcomes || []);
  const [records, setRecords] = useState<OrderReceivableRecord[]>([]);
  const [costRecords, setCostRecords] = useState<OrderCostRecord[]>([]);
  const [milestoneRecords, setMilestoneRecords] = useState<OrderMilestoneRecord[]>([]);
  const [loading, setLoading] = useState(!cached);
  const [syncing, setSyncing] = useState(false);
  const [filter, setFilter] = useState<'open' | 'overdue' | 'all'>('open');
  const [searchParams, setSearchParams] = useSearchParams();
  const [expandedId, setExpandedId] = useState(searchParams.get('orderId') || '');

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    setLoading(!getCachedSalesWorkspaceData(dataUserId));
    void Promise.all([
      loadSalesWorkspaceData(dataUserId),
      loadOrderReceivablesForWorkspace(dataUserId, sampleDataActive),
      // Terms recorded at quoting time live on the cost record when no quote
      // has been raised yet. Without them this page shows a schedule it
      // invented for an order whose terms the operator had already typed.
      loadOrderCostsForWorkspace(dataUserId, sampleDataActive),
      // The ticked road to cash. Needed for the order's *date*: a deposit falls
      // due on order, and without the Contract / PO tick the order book dates
      // the order from the record's last edit, so opening a deal moved money
      // out of overdue.
      loadOrderMilestonesForWorkspace(dataUserId, sampleDataActive),
    ]).then(([workspace, receivableRecords, costs, milestones]) => {
      if (cancelled) return;
      setOpportunities(workspace.opportunities);
      setQuotes(workspace.quotes);
      setOutcomes(workspace.opportunityOutcomes);
      setRecords(receivableRecords);
      setCostRecords(costs);
      setMilestoneRecords(milestones);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [authLoading, dataUserId, sampleDataActive]);

  // A deep link from Today or a digest opens that order's detail and then drops
  // the parameter, so a refresh does not keep re-opening a row the operator has
  // since closed.
  useEffect(() => {
    if (!searchParams.get('orderId')) return;
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  const today = todayDateKey();
  const summary = useMemo(() => {
    const book = buildOrderBook({ opportunities, quotes, milestoneRecords, costRecords, outcomes, today });
    return buildReceivables({ orders: book.orders, records, today });
  }, [costRecords, milestoneRecords, opportunities, outcomes, quotes, records, today]);

  const reload = async () => {
    setSyncing(true);
    try {
      const [workspace, receivableRecords] = await Promise.all([
        loadSalesWorkspaceData(dataUserId, { force: true }),
        loadOrderReceivablesForWorkspace(dataUserId, sampleDataActive),
      ]);
      setOpportunities(workspace.opportunities);
      setQuotes(workspace.quotes);
      setOutcomes(workspace.opportunityOutcomes);
      setRecords(receivableRecords);
    } finally {
      setSyncing(false);
    }
  };

  const visible = summary.orders.filter((order) => {
    if (filter === 'all') return true;
    if (filter === 'overdue') return order.overdueBase > 0;
    return !order.settled;
  });

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Records"
        title="Cash collection"
        description="What customers still owe you, when each part fell due, and what has arrived. Orders follows the goods; this follows the money. Yours only — recording a payment here never reaches the customer."
        actions={
          <>
            <DataModePill />
            <button
              type="button"
              onClick={() => void reload()}
              disabled={syncing}
              className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-navy hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing...' : 'Refresh'}
            </button>
          </>
        }
      />

      {loading ? (
        <SkeletonScreen label="Loading cash collection">
          <SkeletonCard lines={4} />
        </SkeletonScreen>
      ) : summary.orders.length === 0 ? (
        <EmptyCollection />
      ) : (
        <div className="space-y-6">
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat
              label="Still owed"
              value={formatCompactBaseAmount(summary.totalOutstandingBase)}
              detail={`${summary.openCount} ${summary.openCount === 1 ? 'order' : 'orders'} open`}
            />
            <Stat
              label="Past due"
              value={formatCompactBaseAmount(summary.totalOverdueBase)}
              tone={summary.totalOverdueBase > 0 ? 'red' : 'default'}
              detail={summary.totalOverdueBase > 0 ? 'Money you agreed would be here' : 'Nothing late'}
            />
            <Stat
              label="Due in 30 days"
              value={formatCompactBaseAmount(summary.expectedNext30Base)}
              detail="Including anything already late"
            />
            <Stat
              label="Average wait"
              value={summary.averageDaysOutstanding === null ? '—' : pluralizeCount(summary.averageDaysOutstanding, 'day')}
              detail="Past the date you agreed, weighted by money"
            />
          </section>

          {summary.worstOverdue && (
            <section className="rounded-xl border border-red-200 bg-red-50/60 p-5">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-700" />
                <div>
                  <p className="text-sm font-bold text-navy">Chase this one first</p>
                  {/* Biggest, then oldest. A small invoice 200 days late is a
                      bookkeeping problem; a large one 20 days late is a business
                      problem, and sorting by age alone puts the wrong call at
                      the top of the list. */}
                  <p className="mt-1 text-sm leading-6 text-gray-700">
                    <span className="font-bold">{summary.worstOverdue.accountName}</span>
                    {' — '}
                    {formatBaseCurrencyAmount(summary.worstOverdue.overdueBase)} past due
                    {summary.worstOverdue.daysOverdue !== null ? ` by ${pluralizeCount(summary.worstOverdue.daysOverdue, 'day')}` : ''}
                    {' on '}
                    {summary.worstOverdue.orderRef}.
                  </p>
                </div>
              </div>
            </section>
          )}

          <AgingBand summary={summary} />

          <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 p-4">
              <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">Orders and what they owe</h2>
              <div className="flex flex-wrap gap-1.5">
                {(['open', 'overdue', 'all'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setFilter(option)}
                    className={`rounded-full px-3 py-1.5 text-xs font-bold capitalize ${
                      filter === option ? 'bg-navy text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            {visible.length === 0 ? (
              <p className="p-6 text-sm text-gray-500">
                {filter === 'overdue'
                  ? 'Nothing is past its due date. That is the whole goal of this page.'
                  : 'Every order here has been collected in full.'}
              </p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {visible.map((order) => (
                  <ReceivableRow
                    key={order.opportunityId}
                    order={order}
                    expanded={expandedId === order.opportunityId}
                    onToggle={() => setExpandedId(expandedId === order.opportunityId ? '' : order.opportunityId)}
                    records={records}
                    onRecordsChanged={setRecords}
                    sampleDataActive={sampleDataActive}
                  />
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </PageContainer>
  );
}

function AgingBand({ summary }: { summary: ReturnType<typeof buildReceivables> }) {
  const withMoney = summary.aging.filter((entry) => entry.amountBase > 0);
  if (withMoney.length === 0) return null;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">How late the money is</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {summary.aging.map((entry) => (
          <div
            key={entry.bucket}
            className={`rounded-lg border p-3 ${
              entry.amountBase > 0 && entry.bucket !== 'current' && entry.bucket !== 'due-soon'
                ? 'border-red-100 bg-red-50/50'
                : 'border-gray-100 bg-gray-50/60'
            }`}
          >
            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">{agingBucketLabels[entry.bucket]}</p>
            <p className="mt-1 text-lg font-bold text-navy">{formatCompactBaseAmount(entry.amountBase)}</p>
            <p className="text-xs text-gray-500">{entry.count} {entry.count === 1 ? 'order' : 'orders'}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * What is actually due on the next date, when that is less than the order.
 *
 * Stays silent on a single-instalment order: "250M VND / 250M due Sep 29" says
 * the same thing twice.
 */
function nextSliceLabel(order: OrderReceivable): string {
  const partial = order.nextDueBase > 0 && order.nextDueBase < order.outstandingBase - 0.005;
  return partial ? formatCompactBaseAmount(order.nextDueBase) : 'All';
}

function ReceivableRow({
  order,
  expanded,
  onToggle,
  records,
  onRecordsChanged,
  sampleDataActive,
}: {
  order: OrderReceivable;
  expanded: boolean;
  onToggle: () => void;
  records: OrderReceivableRecord[];
  onRecordsChanged: (records: OrderReceivableRecord[]) => void;
  sampleDataActive: boolean;
}) {
  const record = records.find((entry) => entry.opportunityId === order.opportunityId);
  const [amount, setAmount] = useState('');
  const [receivedOn, setReceivedOn] = useState(todayDateKey());
  const [method, setMethod] = useState('');
  const [deliveredOn, setDeliveredOn] = useState(record?.deliveredOn || '');

  const bank = () => {
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed === 0) return;
    const next = recordPaymentReceipt({
      opportunityId: order.opportunityId,
      receipt: createPaymentReceipt({ amount: parsed, currency: order.currency, receivedOn, method }),
      source: sampleDataActive ? 'demo' : 'user',
      isSample: sampleDataActive,
    });
    onRecordsChanged(next);
    setAmount('');
    setMethod('');
  };

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 p-4 text-left hover:bg-gray-50"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-navy">{order.accountName}</p>
          <p className="truncate text-xs text-gray-500">
            {order.orderRef} · {order.orderName}
            {order.paymentTerm ? ` · ${order.paymentTerm}` : ''}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className={`text-sm font-bold ${order.overdueBase > 0 ? 'text-red-700' : 'text-navy'}`}>
            {formatCompactBaseAmount(order.outstandingBase)}
          </p>
          {/* The amount above is everything still owed on the order; the date
              belongs to the next slice of it. Printing them as one line read
              "250M VND, due Aug 15" on terms where only 75M was due that day.
              So the slice is named with its own amount whenever it is not the
              whole of what is outstanding. */}
          <p className="text-xs text-gray-500">
            {/* Never "Collected" for an order nobody could value: outstanding is
                zero because the currency has no rate, not because the money
                arrived. */}
            {order.valueUnavailable
              ? `Not valued · ${order.currency}`
              : order.settled
              ? 'Collected'
              : order.daysOverdue !== null
                ? `${pluralizeCount(order.daysOverdue, 'day')} late`
                : order.nextDueDate
                  ? `${nextSliceLabel(order)} due ${formatSafeBusinessDate(order.nextDueDate)}`
                  : 'No date'}
          </p>
        </div>
        <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-gray-100 bg-gray-50/50 p-4">
          {/* Where the schedule came from. A due date this product inferred and
              one the customer agreed to are different kinds of fact, and a
              collection call made on the wrong one costs a relationship. */}
          <TermProvenance order={order} />

          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="text-[11px] font-bold uppercase tracking-wide text-gray-400">
                <tr>
                  <th className="pb-2 pr-3">Instalment</th>
                  <th className="pb-2 pr-3">Due</th>
                  <th className="pb-2 pr-3 text-right">Amount</th>
                  <th className="pb-2 pr-3 text-right">Received</th>
                  <th className="pb-2 text-right">Outstanding</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {order.installments.map((installment) => (
                  <tr key={installment.id} className={installment.overdue ? 'bg-red-50/60' : ''}>
                    <td className="py-2 pr-3 font-semibold text-navy">{installment.label}</td>
                    <td className="py-2 pr-3 text-gray-600">
                      {installment.dueDate ? formatSafeBusinessDate(installment.dueDate) : '—'}
                      {installment.overdue && (
                        <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                          {installment.daysOverdue}d late
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right text-gray-700">{formatCompactBaseAmount(installment.dueBase)}</td>
                    <td className="py-2 pr-3 text-right text-emerald-700">{formatCompactBaseAmount(installment.receivedBase)}</td>
                    <td className="py-2 text-right font-bold text-navy">{formatCompactBaseAmount(installment.outstandingBase)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {order.overpaidBase > 0 && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
              {formatBaseCurrencyAmount(order.overpaidBase)} more has been received than this order is worth. Check
              whether it belongs to another order before treating it as settled.
            </p>
          )}

          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Record money that arrived</p>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <label className="flex flex-col text-xs font-semibold text-gray-600">
                Amount ({order.currency})
                <input
                  type="number"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  className="mt-1 w-40 rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  placeholder="0"
                />
              </label>
              <label className="flex flex-col text-xs font-semibold text-gray-600">
                Received on
                <input
                  type="date"
                  value={receivedOn}
                  onChange={(event) => setReceivedOn(event.target.value)}
                  className="mt-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="flex flex-col text-xs font-semibold text-gray-600">
                How
                <input
                  type="text"
                  value={method}
                  onChange={(event) => setMethod(event.target.value)}
                  className="mt-1 w-44 rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  placeholder="Bank transfer"
                />
              </label>
              <button
                type="button"
                onClick={bank}
                disabled={!Number(amount)}
                className="inline-flex items-center gap-1.5 rounded-full bg-navy px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
              >
                <Plus className="h-4 w-4" />
                Record
              </button>
            </div>

            {(record?.receipts.length || 0) > 0 && (
              <ul className="mt-4 space-y-1.5 border-t border-gray-100 pt-3">
                {record?.receipts.map((receipt) => (
                  <li key={receipt.id} className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-gray-600">
                      <span className="font-bold text-navy">{formatBaseCurrencyAmount(receipt.amount)}</span>
                      {' on '}{formatSafeBusinessDate(receipt.receivedOn)}
                      {receipt.method ? ` · ${receipt.method}` : ''}
                    </span>
                    <button
                      type="button"
                      onClick={() => onRecordsChanged(removePaymentReceipt(order.opportunityId, receipt.id))}
                      className="inline-flex items-center gap-1 text-gray-400 hover:text-red-600"
                      aria-label="Remove this payment"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-4">
            <label className="flex flex-col text-xs font-semibold text-gray-600">
              Delivered on
              <input
                type="date"
                value={deliveredOn}
                onChange={(event) => setDeliveredOn(event.target.value)}
                className="mt-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
            </label>
            <button
              type="button"
              onClick={() => onRecordsChanged(saveOrderReceivableTerms({
                opportunityId: order.opportunityId,
                deliveredOn,
                source: sampleDataActive ? 'demo' : 'user',
                isSample: sampleDataActive,
              }))}
              className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-navy hover:bg-gray-50"
            >
              Save delivery date
            </button>
            {/* Terms that wait on delivery are guesses until this is filled in.
                Once the goods have actually shipped the due date stops being a
                forecast and becomes a fact the customer would recognise. */}
            <p className="text-xs leading-5 text-gray-500">
              Instalments due after delivery are counted from this date once you set it.
            </p>
          </div>
        </div>
      )}
    </li>
  );
}

function TermProvenance({ order }: { order: OrderReceivable }) {
  const parsed = parsePaymentTerm(order.paymentTerm);

  // Said before anything about the schedule, because none of the schedule's
  // money means anything without a rate to read it in.
  if (order.valueUnavailable) {
    return (
      <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 font-semibold text-amber-900" role="status">
        This order is in {order.currency}, and no exchange rate is set for it — so Memoire cannot
        say what is owed in {getReportingCurrency()}. The order is kept open rather than counted as
        collected. <Link to="/app/settings" className="underline">Set a rate in Settings</Link> and
        the schedule below fills in.
      </p>
    );
  }

  if (order.termConfidence === 'operator') {
    return (
      <p className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800">
        Schedule set by you, not read from the quote.
      </p>
    );
  }

  if (order.termConfidence === 'assumed') {
    return (
      <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 font-semibold text-amber-900">
        {order.paymentTerm
          ? `Memoire could not read "${order.paymentTerm}" as a schedule, so it assumed one payment on delivery.`
          : 'This order has no payment terms on its quote, so one payment on delivery is assumed.'}
        {' '}Check before chasing.
      </p>
    );
  }

  return (
    <p className="text-xs leading-5 text-gray-500">
      Read from the quote{order.termConfidence === 'partial' ? ', with the remainder completed to 100%' : ''}:{' '}
      {parsed.installments.map(describeInstallment).join(', ')}.
    </p>
  );
}

function Stat({
  label,
  value,
  detail,
  tone = 'default',
}: {
  label: string;
  value: string;
  detail: string;
  tone?: 'default' | 'red';
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-1 text-xl font-bold ${tone === 'red' ? 'text-red-700' : 'text-navy'}`}>{value}</p>
      <p className="mt-1 text-xs leading-5 text-gray-500">{detail}</p>
    </div>
  );
}

function EmptyCollection() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
      <Banknote className="mx-auto h-8 w-8 text-gray-300" />
      <h2 className="mt-3 text-lg font-bold text-navy">No committed orders yet</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-gray-500">
        This page fills itself from your order book. Once a deal is won — or reaches procurement — its payment terms
        become a collection schedule here, with nothing to re-enter.
      </p>
      <Link
        to="/app/money"
        className="mt-4 inline-flex rounded-full bg-navy px-4 py-2 text-sm font-bold text-white"
      >
        Open Orders
      </Link>
    </div>
  );
}
