import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Layers } from 'lucide-react';
import { useAuthContext } from '../../auth/authContext';
import { hasLocalSampleData } from '../../utils/dataMode';
import { loadSalesWorkspaceData } from '../../services/workspaceData';
import type { CrmLiteOpportunity } from '../../services/opportunityStore';
import {
  buildBrandPerformance,
  MIN_DECIDED_FOR_BRAND_RATE,
  type BrandPerformance,
} from '../../utils/brandPerformance';
import { formatBaseCurrencyAmount } from '../../utils/money';

/**
 * Which brand is carrying the number.
 *
 * Renders nothing at all until the workspace carries brands: a seller with one
 * line would otherwise get a panel that only ever says "one brand, 100%",
 * which is noise dressed as insight.
 */
export function BrandPerformancePanel() {
  const { user } = useAuthContext();
  const [opportunities, setOpportunities] = useState<CrmLiteOpportunity[]>([]);
  const sampleDataActive = hasLocalSampleData();
  const dataUserId = sampleDataActive ? undefined : user?.id;

  useEffect(() => {
    let cancelled = false;
    void loadSalesWorkspaceData(dataUserId).then((workspace) => {
      if (!cancelled) setOpportunities(workspace.opportunities);
    });
    return () => { cancelled = true; };
  }, [dataUserId]);

  const report = useMemo(() => buildBrandPerformance({ opportunities }), [opportunities]);

  if (!report.hasBrands) return null;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-brand-blue" />
            <h2 className="text-lg font-bold text-navy">Which brand is carrying the number</h2>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            Every line you distribute, by the money it has in play and the money it has closed.
            {report.leader ? ` ${report.leader.brand} is carrying the most right now.` : ''}
          </p>
        </div>
        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-brand-blue">
          Active: {formatBaseCurrencyAmount(report.totalActiveBase, true)}
        </span>
      </div>

      <div className="mt-4 space-y-2">
        {report.brands.map((row) => (
          <BrandRow key={row.brand} row={row} />
        ))}
      </div>

      {report.coverageMessage && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
          {report.coverageMessage} Set the brand on a deal and it joins its line here.
          {' '}
          <Link to="/app/opportunities" className="underline">Open deals</Link>
        </p>
      )}
    </section>
  );
}

function BrandRow({ row }: { row: BrandPerformance }) {
  const sharePercent = Math.round(row.shareOfActive * 100);

  return (
    <div className={`rounded-lg border p-3 ${row.unbranded ? 'border-dashed border-gray-200 bg-gray-50/60' : 'border-gray-100 bg-gray-50/40'}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className={`font-bold ${row.unbranded ? 'text-gray-500' : 'text-navy'}`}>{row.brand}</p>
        <p className="text-xs font-semibold text-gray-500">
          {row.activeCount} active
          {row.committedCount > 0 ? ` · ${row.committedCount} committed to order` : ''}
          {row.wonCount > 0 ? ` · ${row.wonCount} won` : ''}
          {row.lostCount > 0 ? ` · ${row.lostCount} lost` : ''}
        </p>
      </div>

      {/* The bar is share of active pipeline - the honest "how much of my
          attention does this line already own" number. */}
      <div className="mt-2 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-200">
          <div
            className={`h-full rounded-full ${row.unbranded ? 'bg-gray-400' : 'bg-brand-blue'}`}
            style={{ width: `${Math.max(row.activeValueBase > 0 ? 2 : 0, sharePercent)}%` }}
          />
        </div>
        <span className="w-10 shrink-0 text-right text-xs font-bold text-gray-600">{sharePercent}%</span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="font-bold text-navy">{formatBaseCurrencyAmount(row.activeValueBase, true)} in play</span>
        {row.committedValueBase > 0 && (
          <span className="font-semibold text-violet-700">
            {formatBaseCurrencyAmount(row.committedValueBase, true)} committed
          </span>
        )}
        {row.wonValueBase > 0 && (
          <span className="font-semibold text-emerald-700">
            {formatBaseCurrencyAmount(row.wonValueBase, true)} won
          </span>
        )}
        {row.winRate === null ? (
          <span className="font-semibold text-gray-400">
            {row.decidedCount === 0
              ? 'Nothing closed yet'
              : `${row.decidedCount} closed - win rate needs ${MIN_DECIDED_FOR_BRAND_RATE}`}
          </span>
        ) : (
          <span className={`font-black ${row.winRate >= 0.5 ? 'text-emerald-700' : 'text-amber-700'}`}>
            {Math.round(row.winRate * 100)}% win rate
          </span>
        )}
      </div>
    </div>
  );
}
