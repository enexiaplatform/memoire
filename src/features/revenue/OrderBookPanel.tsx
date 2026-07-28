import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, PackageCheck } from 'lucide-react';
import type { CrmLiteOpportunity } from '../../services/opportunityStore';
import type { QuoteRecord } from '../../services/quoteStore';
import {
  loadOrderMilestonesForWorkspace,
  toggleOrderMilestone,
} from '../../services/orderMilestoneStore';
import {
  buildOrderBook,
  COMMIT_PROBABILITY_THRESHOLD,
  type CommittedOrder,
  type OrderMilestoneRecord,
  type OrderMilestoneState,
} from '../../utils/orderToCash';
import { formatBaseCurrencyAmount, formatCurrencyAmount } from '../../utils/money';

/**
 * The head of the Money page: the orders the customer has already committed to,
 * walked step by step from contract to cash. Everything colder than the
 * founder's 90% line stays on Opportunities; from here on the only question is
 * where the money is - signed, deposited, delivered, invoiced, collected.
 */
export function OrderBookPanel({
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
  const [milestoneRecords, setMilestoneRecords] = useState<OrderMilestoneRecord[]>([]);

  useEffect(() => {
    let cancelled = false;
    void loadOrderMilestonesForWorkspace(dataUserId, sampleDataActive).then((records) => {
      if (!cancelled) setMilestoneRecords(records);
    });
    return () => { cancelled = true; };
  }, [dataUserId, sampleDataActive]);

  const book = useMemo(
    () => buildOrderBook({ opportunities, quotes, milestoneRecords }),
    [milestoneRecords, opportunities, quotes],
  );

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
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <PackageCheck className="h-4 w-4 text-brand-blue" />
            <h2 className="text-lg font-bold text-navy">Committed orders</h2>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            Deals the customer has committed to ({COMMIT_PROBABILITY_THRESHOLD}%+, procurement, or won) - tracked from
            contract and deposit to delivery and cash. Tick what happened; quote records fill in the rest on their own.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-bold">
          <span className="rounded-full bg-blue-50 px-3 py-1 text-brand-blue">
            Awaiting: {formatBaseCurrencyAmount(book.awaitingBase, true)}
          </span>
          {book.overdueCount > 0 && (
            <span className="rounded-full bg-red-50 px-3 py-1 text-red-700">{book.overdueCount} overdue</span>
          )}
          {book.collectedCount > 0 && (
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">{book.collectedCount} collected</span>
          )}
        </div>
      </div>

      {book.orders.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-5 text-sm text-gray-500">
          No committed orders yet. When a deal reaches {COMMIT_PROBABILITY_THRESHOLD}% probability, enters procurement,
          or is won, it lands here with its road to cash laid out.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {book.orders.map((order) => (
            <div
              key={order.opportunityId}
              className={`rounded-lg border p-3.5 ${
                order.fullyCollected
                  ? 'border-emerald-100 bg-emerald-50/40'
                  : order.overdue
                    ? 'border-red-200 bg-red-50/30'
                    : 'border-gray-100 bg-gray-50/60'
              }`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <Link to={order.href} className="font-bold text-navy hover:text-brand-blue hover:underline">
                    {order.accountName}
                    <span className="font-semibold text-gray-500"> / {order.orderName}</span>
                  </Link>
                  <p className="mt-0.5 text-xs font-semibold text-gray-500">
                    {order.status === 'Won' ? 'Won' : `${order.stage}${order.probability !== null ? ` · ${order.probability}%` : ''}`}
                    {typeof order.amount === 'number' ? ` · ${formatCurrencyAmount(order.amount, order.currency)}` : ''}
                    {order.paymentTerm ? ` · Terms: ${order.paymentTerm}` : ' · No payment term on the quote yet'}
                  </p>
                </div>
                {!order.fullyCollected && order.nextMilestone && (
                  <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-brand-blue ring-1 ring-blue-100">
                    Next: {order.nextMilestone.label}
                  </span>
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {order.milestones.map((milestone, index) => (
                  <div key={milestone.key} className="flex items-center gap-1.5">
                    {index > 0 && <span className={`h-px w-3 ${milestone.done ? 'bg-emerald-300' : 'bg-gray-200'}`} />}
                    <button
                      type="button"
                      onClick={() => toggle(order, milestone)}
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
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
