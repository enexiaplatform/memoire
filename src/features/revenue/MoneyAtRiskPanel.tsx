import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import type { CrmLiteOpportunity } from '../../services/opportunityStore';
import type { QuoteRecord } from '../../services/quoteStore';
import { loadOrderMilestonesForWorkspace } from '../../services/orderMilestoneStore';
import { loadOrderReceivablesForWorkspace } from '../../services/orderReceivableStore';
import { loadOrderCostsForWorkspace } from '../../services/orderCostStore';
import { getCachedSalesWorkspaceData, loadSalesWorkspaceData } from '../../services/workspaceData';
import type { CommercialCommitment } from '../../domain/commercialKernel/types';
import { buildOrderBook, type OrderMilestoneRecord, type OrderOutcomeRecord } from '../../utils/orderToCash';
import { buildReceivables, type OrderReceivableRecord } from '../../utils/receivables';
import { buildOrderMargins, type OrderCostRecord } from '../../utils/orderMargin';
import { getTargetMarginPct } from '../../utils/pricingAssumptions';
import { buildMoneyAtRisk, moneyRiskKinds, moneyRiskLabels, type MoneyRiskItem } from '../../utils/moneyAtRisk';
import { formatCompactBaseAmount } from '../../utils/money';
import { formatCount } from '../../utils/numberFormat';
import { MicroPill, Panel } from '../../components/ui/daylight';
import { tintSurface } from '../../components/ui/daylightStyles';

/** How many exceptions the panel shows before folding the rest. */
const VISIBLE_ITEMS = 5;

/**
 * Money at risk, at the top of Orders.
 *
 * Exceptions only. An order moving normally is not on this list, and an empty
 * list says so in one line rather than drawing six zeros. Every item says what
 * happened (with the date or figure that proves it), why it matters in money,
 * and what to do - and "what this is based on" names the engine it came from,
 * because each of these is another engine's answer read as a warning, not a
 * rule this panel made up.
 */
export function MoneyAtRiskPanel({
  opportunities,
  quotes,
  outcomes,
  dataUserId,
  sampleDataActive,
}: {
  opportunities: CrmLiteOpportunity[];
  quotes: QuoteRecord[];
  outcomes: OrderOutcomeRecord[];
  dataUserId?: string;
  sampleDataActive: boolean;
}) {
  const [milestones, setMilestones] = useState<OrderMilestoneRecord[]>([]);
  const [receivableRecords, setReceivableRecords] = useState<OrderReceivableRecord[]>([]);
  const [costRecords, setCostRecords] = useState<OrderCostRecord[]>([]);
  const [commitments, setCommitments] = useState<CommercialCommitment[]>(
    () => getCachedSalesWorkspaceData(dataUserId)?.commitments || [],
  );
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      loadOrderMilestonesForWorkspace(dataUserId, sampleDataActive).catch(() => [] as OrderMilestoneRecord[]),
      loadOrderReceivablesForWorkspace(dataUserId, sampleDataActive).catch(() => [] as OrderReceivableRecord[]),
      loadOrderCostsForWorkspace(dataUserId, sampleDataActive).catch(() => [] as OrderCostRecord[]),
      loadSalesWorkspaceData(dataUserId).then((workspace) => workspace.commitments).catch(() => [] as CommercialCommitment[]),
    ]).then(([nextMilestones, nextReceivables, nextCosts, nextCommitments]) => {
      if (cancelled) return;
      setMilestones(nextMilestones);
      setReceivableRecords(nextReceivables);
      setCostRecords(nextCosts);
      setCommitments(nextCommitments);
    });
    return () => { cancelled = true; };
  }, [dataUserId, sampleDataActive]);

  const risk = useMemo(() => {
    const book = buildOrderBook({ opportunities, quotes, milestoneRecords: milestones, costRecords, outcomes });
    return buildMoneyAtRisk({
      orders: book.orders,
      receivables: buildReceivables({ orders: book.orders, records: receivableRecords }),
      margins: buildOrderMargins({ orders: book.orders, costRecords, targetPct: getTargetMarginPct() }),
      commitments: commitments.filter((commitment) => sampleDataActive || commitment.isSample !== true),
    });
  }, [commitments, costRecords, milestones, opportunities, outcomes, quotes, receivableRecords, sampleDataActive]);

  const visible = expanded ? risk.items : risk.items.slice(0, VISIBLE_ITEMS);

  return (
    <Panel aria-labelledby="money-at-risk" className="px-5 py-5 sm:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-tint-red-solid" aria-hidden="true" />
          <h2 id="money-at-risk" className="font-display text-[19px] font-bold tracking-[-0.015em] text-ink">
            Money at risk
          </h2>
        </div>
        {risk.items.length > 0 && (
          <span className="text-xs font-semibold text-muted">
            {formatCount(risk.items.length)} {risk.items.length === 1 ? 'exception' : 'exceptions'}
            {risk.exposureBase > 0 ? ` · ${formatCompactBaseAmount(risk.exposureBase)} exposed` : ''}
          </span>
        )}
      </div>

      {risk.items.length === 0 ? (
        <p className="mt-3 rounded-2xl bg-tint-green-bg px-4 py-3 text-sm font-semibold text-tint-green-ink">
          Nothing on the road to cash is late, missing or stuck.
        </p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Exceptions by kind">
            {moneyRiskKinds.filter((kind) => risk.counts[kind] > 0).map((kind) => (
              <MicroPill key={kind} tone="neutral" className="!normal-case !tracking-normal !text-[11.5px]">
                {moneyRiskLabels[kind]} · {formatCount(risk.counts[kind])}
              </MicroPill>
            ))}
          </div>
          <ul className="mt-3 flex flex-col gap-2">
            {visible.map((item) => <MoneyRiskRow key={item.id} item={item} />)}
          </ul>
          {risk.items.length > VISIBLE_ITEMS && (
            <button
              type="button"
              onClick={() => setExpanded((open) => !open)}
              aria-expanded={expanded}
              className="mt-3 text-[12.5px] font-semibold text-brand-blue-dark hover:underline"
            >
              {expanded ? 'Show fewer' : `Show all ${formatCount(risk.items.length)}`}
            </button>
          )}
          {risk.unpricedCount > 0 && (
            <p className="mt-2 text-[11.5px] text-muted">
              {risk.unpricedCount} {risk.unpricedCount === 1 ? 'order is' : 'orders are'} in a currency without a rate - listed, but not in the exposure.
            </p>
          )}
        </>
      )}
    </Panel>
  );
}

function MoneyRiskRow({ item }: { item: MoneyRiskItem }) {
  const tone = item.severity === 'critical' ? 'red' : item.severity === 'high' ? 'amber' : 'neutral';
  const surface = tintSurface[tone];
  return (
    <li className={`rounded-2xl px-4 py-3 ${surface.ground}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-[14.5px] font-bold text-ink">{item.accountName}</span>
            <MicroPill tone={tone === 'neutral' ? 'neutral' : tone} solid={tone !== 'neutral'}>{item.label}</MicroPill>
            {item.orderRef && <span className="font-mono text-[11px] text-tint-neutral-ink">{item.orderRef}</span>}
          </div>
          <p className="mt-1 text-sm font-semibold leading-5 text-ink">{item.action}</p>
          <p className={`mt-0.5 text-[13px] leading-5 ${surface.ink}`}>
            <span className="font-bold">What happened: </span>{item.what}{' '}
            <span className="font-bold">Why it matters: </span>{item.why}
          </p>
          <details className="mt-1">
            <summary className="cursor-pointer text-xs font-semibold text-tint-neutral-ink hover:text-ink">What this is based on</summary>
            <p className="mt-1 text-xs leading-5 text-tint-neutral-ink">{item.basis}</p>
          </details>
        </div>
        <div className="flex shrink-0 items-center justify-between gap-3 sm:flex-col sm:items-end">
          {item.exposureLabel && (
            <span className="font-display text-[16px] font-extrabold tracking-[-0.02em] text-ink">{item.exposureLabel}</span>
          )}
          <Link to={item.href} className="text-[12.5px] font-semibold text-brand-blue-dark hover:underline">
            Open
          </Link>
        </div>
      </div>
    </li>
  );
}
