import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, Loader2 } from 'lucide-react';
import { useAuthContext } from '../../auth/authContext';
import { DataModePill } from '../../components/common/DataModePill';
import { SkeletonCard, SkeletonScreen } from '../../components/common/Skeleton';
import { FunnelBars } from '../../components/charts/FunnelBars';
import { MiniBarChart } from '../../components/charts/MiniBarChart';
import { SegmentBar } from '../../components/charts/SegmentBar';
import { hasLocalSampleData } from '../../utils/dataMode';
import { getCachedSalesWorkspaceData, loadSalesWorkspaceData, type SalesWorkspaceData } from '../../services/workspaceData';
import { loadPlanItemsForWorkspace } from '../../services/planItemStore';
import type { PlanRecord } from '../../utils/weeklyPlan';
import { buildMasterDashboard } from '../../utils/masterDashboard';
import { buildBusinessLens, QUIET_ACCOUNT_DAYS } from '../../utils/businessLens';
import { buildAccountAliasIndex } from '../../utils/accountAliases';
import { formatBaseCurrencyAmount, formatCompactBaseAmount } from '../../utils/money';

/**
 * The business, seen whole.
 *
 * This is a **lens**, not a seventh destination, and the distinction is load
 * bearing rather than a dodge around the navigation contract. It owns no
 * records and writes nothing: every number here is read from what Accounts,
 * Opportunities, Money and Timeline already wrote. You do not come here to
 * work - Today owns that - you come to find out what the work adds up to. That
 * is the same job Activity and the Business Vault do, and it is why it lives
 * beside them rather than in the primary rail.
 *
 * The standalone Dashboard failed the feature gate in the 2026-07-26 refactor
 * because it answered "what should I do now" worse than Today did. This does
 * not try to answer that question at all. There is not one action button on
 * this page, on purpose.
 *
 * Charts are chosen by the job the data has, not by variety. Ranked magnitude
 * is a bar; composition is one stacked bar; change over time is a column
 * series. Where a number says it better than a picture, it is a number.
 */

/**
 * Severity ramp for forecast evidence, ordered good to unsupported.
 *
 * Not the palette Review's export uses: that one puts amber next to red at a
 * separation of ΔE 14.4, which is under the legibility floor even for full
 * colour vision. These four clear every check in the validator, and the legend
 * labels each one anyway so the ordering never rests on hue.
 */
const EVIDENCE_COLORS: Record<string, string> = {
  Defensible: '#047857',
  'Weak but recoverable': '#CA8A04',
  'Hope-based': '#DC2626',
  Unsupported: '#6D28D9',
};

export function BusinessLensPage() {
  const { user, loading: authLoading, isAuthenticated } = useAuthContext();
  const sampleDataActive = hasLocalSampleData();
  const dataUserId = sampleDataActive ? undefined : user?.id;

  const [workspace, setWorkspace] = useState<SalesWorkspaceData | null>(() => getCachedSalesWorkspaceData(dataUserId));
  const [planRecords, setPlanRecords] = useState<PlanRecord[]>([]);
  const [loading, setLoading] = useState(() => !getCachedSalesWorkspaceData(dataUserId));

  useEffect(() => {
    let active = true;
    void loadSalesWorkspaceData(dataUserId)
      .then((data) => { if (active) setWorkspace(data); })
      .catch(() => undefined)
      .finally(() => { if (active) setLoading(false); });
    void loadPlanItemsForWorkspace(dataUserId)
      .then((records) => { if (active) setPlanRecords(records); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [dataUserId, sampleDataActive]);

  const model = useMemo(
    () => (workspace ? buildMasterDashboard({ ...workspace, planRecords }) : null),
    [planRecords, workspace],
  );

  const lens = useMemo(() => (workspace
    ? buildBusinessLens({
      accounts: workspace.accounts,
      opportunities: workspace.opportunities,
      activities: workspace.activities,
      aliases: buildAccountAliasIndex(workspace.accountMerges),
    })
    : null), [workspace]);

  if (authLoading || (loading && !model)) {
    return (
      <SkeletonScreen label="Reading how the business is doing">
        <div className="flex w-full max-w-none flex-col gap-5 px-4 py-5 sm:px-5 lg:px-6">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </SkeletonScreen>
    );
  }
  if (!isAuthenticated) return null;

  if (!model || !lens) {
    return (
      <div className="flex w-full max-w-none flex-col gap-5 px-4 py-5 sm:px-5 lg:px-6">
        <Header />
        <p className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          <Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin" />
          Reading your workspace.
        </p>
      </div>
    );
  }

  const hasAnything = model.kpis.openDeals > 0 || model.kpis.activitiesLast30 > 0 || lens.accounts.total > 0;

  return (
    <div className="flex w-full max-w-none flex-col gap-5 px-4 py-5 sm:px-5 lg:px-6">
      <Header />

      {!hasAnything ? (
        <EmptyState />
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Open pipeline" value={formatBaseCurrencyAmount(model.kpis.openPipelineBase, true)} detail={`${model.kpis.openDeals} active ${model.kpis.openDeals === 1 ? 'deal' : 'deals'}`} />
            <Stat label="Customers" value={lens.accounts.total.toLocaleString()} detail={`${lens.accounts.active} touched in ${QUIET_ACCOUNT_DAYS} days`} />
            <Stat label="Touches, last 30 days" value={model.kpis.activitiesLast30.toLocaleString()} detail={`${model.kpis.openQuotes} open ${model.kpis.openQuotes === 1 ? 'quote' : 'quotes'}`} />
            <Stat label="Realized profit" value={formatBaseCurrencyAmount(model.money.realizedProfitBase, true)} detail="Collected, less paid costs" tone={model.money.realizedProfitBase < 0 ? 'red' : 'green'} />
          </section>

          {/* Who the business actually is. The sharpest question on the page,
              so it goes first and it is a sentence before it is a chart. */}
          <Card title="Customer concentration" subtitle={lens.concentration.headline}>
            {lens.concentration.rows.length > 0 ? (
              <>
                <FunnelBars
                  ariaLabel="Open pipeline by customer, largest first"
                  // Scaled to total pipeline, so the bar and the percent beside
                  // it are measuring the same thing.
                  scaleTo={lens.concentration.totalOpenBase}
                  labelWidth="sm:w-56"
                  rows={lens.concentration.rows.map((row) => ({
                    label: row.accountName,
                    value: row.openPipelineBase,
                    valueText: formatCompactBaseAmount(row.openPipelineBase),
                    countText: `${Math.round(row.share * 100)}%`,
                  }))}
                />
                {lens.accounts.quiet > 0 && (
                  <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-900">
                    {formatBaseCurrencyAmount(lens.accounts.quietPipelineBase, true)} of open pipeline sits with{' '}
                    {lens.accounts.quiet} {lens.accounts.quiet === 1 ? 'customer' : 'customers'} nobody has touched in{' '}
                    {QUIET_ACCOUNT_DAYS} days.{' '}
                    <Link to="/app/today" className="underline">See what is going silent</Link>.
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-gray-500">No open pipeline to spread across customers yet.</p>
            )}
          </Card>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <Card title="Pipeline by stage" subtitle={`Active deals, valued in ${model.reportingCurrency}`}>
              {model.stageMix.length > 0 ? (
                <FunnelBars
                  ariaLabel="Open pipeline value by stage"
                  rows={model.stageMix.map((row) => ({
                    label: row.stage,
                    value: row.totalBase,
                    valueText: formatCompactBaseAmount(row.totalBase),
                    countText: `${row.count}`,
                  }))}
                />
              ) : (
                <p className="text-sm text-gray-500">No active deals yet.</p>
              )}
            </Card>

            <Card
              title="Is the pipeline believable?"
              subtitle="Active deals by the evidence behind them, not by how they feel"
            >
              {model.evidenceMix.some((row) => row.count > 0) ? (
                <SegmentBar
                  ariaLabel="Active deals by forecast evidence category"
                  segments={model.evidenceMix.map((row) => ({
                    label: row.category,
                    value: row.count,
                    color: EVIDENCE_COLORS[row.category] || '#6D28D9',
                  }))}
                />
              ) : (
                <p className="text-sm text-gray-500">No active deals to judge yet.</p>
              )}
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <Card title="Touches per week" subtitle="The last eight weeks of recorded customer contact">
              {model.weeklyActivity.some((point) => point.count > 0) ? (
                <MiniBarChart
                  ariaLabel="Recorded customer touches per week over the last eight weeks"
                  height={130}
                  items={model.weeklyActivity.map((point) => ({
                    label: point.label,
                    value: point.count,
                    valueText: `${point.count}`,
                  }))}
                />
              ) : (
                <p className="text-sm text-gray-500">Nothing captured in the last eight weeks.</p>
              )}
            </Card>

            <Card title="What closed" subtitle="Recorded outcomes, won against lost">
              <div className="grid grid-cols-2 gap-3">
                <Stat
                  label="Won"
                  value={model.outcomes.won.count.toLocaleString()}
                  detail={formatBaseCurrencyAmount(model.outcomes.won.totalBase, true)}
                  tone="green"
                />
                <Stat
                  label="Lost"
                  value={model.outcomes.lost.count.toLocaleString()}
                  detail={formatBaseCurrencyAmount(model.outcomes.lost.totalBase, true)}
                  tone="red"
                />
              </div>
              <p className="mt-3 text-xs leading-5 text-gray-500">
                Why each one ended that way lives in the deal's retro.{' '}
                <Link to="/app/reviews" className="font-bold text-brand-blue underline">
                  Review holds the win/loss learning and your forecast calibration
                </Link>.
              </p>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function Header() {
  return (
    <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">
          <BarChart3 className="h-3.5 w-3.5" />
          Dashboard
        </p>
        <h1 className="mt-2 text-2xl font-bold text-navy">How the business is doing</h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-600">
          Everything here is read from what your accounts, deals, touches and money already say. Nothing on this
          page changes a record - it is a way of seeing the six destinations, not a seventh place to work.
        </p>
      </div>
      <DataModePill />
    </header>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm">
      <p className="text-base font-bold text-navy">Nothing to show yet.</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-gray-500">
        This page reads your workspace rather than asking you to fill it in. Capture a customer interaction and add
        a deal, and the picture builds itself.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Link to="/app/capture" className="rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">Capture something</Link>
        <Link to="/app/opportunities" className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700">Add a deal</Link>
      </div>
    </div>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-bold text-navy">{title}</h2>
      {subtitle && <p className="mt-1 text-sm leading-6 text-gray-600">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
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
  detail?: string;
  tone?: 'default' | 'green' | 'red';
}) {
  const valueTone = tone === 'green' ? 'text-emerald-700' : tone === 'red' ? 'text-red-700' : 'text-navy';
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`mt-1 text-xl font-bold ${valueTone}`}>{value}</p>
      {detail && <p className="mt-0.5 text-xs text-gray-500">{detail}</p>}
    </div>
  );
}
