import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, Loader2 } from 'lucide-react';
import { useAuthContext } from '../../auth/authContext';
import { DataModePill } from '../../components/common/DataModePill';
import { SkeletonCard, SkeletonScreen } from '../../components/common/Skeleton';
import { PageContainer, PageHeader } from '../../components/layout/PageFrame';
import { FunnelBars } from '../../components/charts/FunnelBars';
import { SegmentBar } from '../../components/charts/SegmentBar';
import { ChartFrame } from '../../components/charts/ChartFrame';
import { TrendChart } from '../../components/charts/TrendChart';
import { hasLocalSampleData } from '../../utils/dataMode';
import { getCachedSalesWorkspaceData, loadSalesWorkspaceData, type SalesWorkspaceData } from '../../services/workspaceData';
import { loadPlanItemsForWorkspace } from '../../services/planItemStore';
import type { PlanRecord } from '../../utils/weeklyPlan';
import { buildMasterDashboard } from '../../utils/masterDashboard';
import { buildBusinessLens, QUIET_ACCOUNT_DAYS } from '../../utils/businessLens';
import { buildAccountAliasIndex } from '../../utils/accountAliases';
import { formatBaseCurrencyAmount, formatCompactBaseAmount } from '../../utils/money';
import { formatCount } from '../../utils/numberFormat';

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
/**
 * Categorical slots for trend series, validated together rather than picked to
 * taste: blue against orange separates at ΔE 24.7 under protanopia and 33.6 for
 * full colour vision, both well clear of the floor. Slots are assigned in fixed
 * order and never cycled - a ninth series folds into "Other" instead.
 */
const SERIES = {
  blue: '#2A78D6',
  orange: '#EB6834',
};

const EVIDENCE_COLORS: Record<string, string> = {
  Defensible: '#047857',
  'Weak but recoverable': '#CA8A04',
  'Hope-based': '#DC2626',
  Unsupported: '#6D28D9',
};

export function BusinessLensPage() {
  const { user, loading: authLoading } = useAuthContext();
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

  /**
   * The slope of the line above, said in words.
   *
   * Deliberately not a new metric - it reads the same eight points the chart
   * plots and reports nothing the chart does not already show. A dashboard that
   * derives its own figures beside the ones the engine produced is how one
   * pipeline came to be read four different ways; this only narrates.
   */
  const touchTrend = useMemo(() => {
    const points = model?.weeklyActivity ?? [];
    if (points.length < 4) return '';
    const half = Math.floor(points.length / 2);
    const earlier = points.slice(0, half).reduce((sum, point) => sum + point.count, 0);
    const later = points.slice(half).reduce((sum, point) => sum + point.count, 0);
    if (earlier === 0 && later === 0) return '';
    if (earlier === 0) return 'all of it in the last four weeks';
    const change = Math.round(((later - earlier) / earlier) * 100);
    if (Math.abs(change) < 10) return 'holding steady across the two halves';
    return `${Math.abs(change)}% ${change > 0 ? 'more' : 'fewer'} in the last four weeks than the four before`;
  }, [model]);

  if (authLoading || (loading && !model)) {
    return (
      <SkeletonScreen label="Reading how the business is doing">
        <PageContainer>
          <SkeletonCard />
          <SkeletonCard />
        </PageContainer>
      </SkeletonScreen>
    );
  }

  // There is deliberately no authentication check here.
  //
  // This page used to return null when `isAuthenticated` was false, which meant
  // it rendered a white page - not a skeleton, not an empty state, nothing - for
  // every session without a Supabase user: the entire public demo, and any
  // workspace running browser-only. The demo is how a prospect meets the
  // product, so one of eleven rail items was a blank screen for them.
  //
  // Nothing on this page needs an account. It reads the same local workspace
  // records every other surface reads, and `authLoading` above already covers
  // the only real concern - rendering before the session has resolved. Who may
  // reach this route at all is ProtectedRoute's decision, made once, for every
  // destination; repeating that decision per page is how it gets made wrong.

  if (!model || !lens) {
    return (
      <PageContainer>
        <Header />
        <p className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          <Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin" />
          Reading your workspace.
        </p>
      </PageContainer>
    );
  }

  const hasAnything = model.kpis.openDeals > 0 || model.kpis.activitiesLast30 > 0 || lens.accounts.total > 0;

  return (
    <PageContainer>
      <Header />

      {!hasAnything ? (
        <EmptyState />
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat
              label="Open pipeline"
              value={formatBaseCurrencyAmount(model.kpis.openPipelineBase, true)}
              detail={`${model.kpis.openDeals} active ${model.kpis.openDeals === 1 ? 'deal' : 'deals'} · ${model.kpis.openQuotes} open ${model.kpis.openQuotes === 1 ? 'quote' : 'quotes'}`}
            />
            <Stat label="Customers" value={formatCount(lens.accounts.total)} detail={`${lens.accounts.active} touched in ${QUIET_ACCOUNT_DAYS} days`} />
            {/* The detail line qualifies the number above it on every other
                tile. This one carried open quotes - a different metric, parked
                under a headline about touches because it had nowhere else to
                go. Touch coverage is the thing that number actually raises:
                three touches across eighteen live deals is a different business
                from three touches on three of them. Quotes moved up to the
                pipeline tile, where they belong. */}
            <Stat
              label="Touches, last 30 days"
              value={formatCount(model.kpis.activitiesLast30)}
              detail={model.evidence.activeDeals > 0
                ? `${formatCount(model.evidence.activeDeals - model.evidence.noTouch)} of ${formatCount(model.evidence.activeDeals)} active deals touched`
                : 'No active deals yet'}
            />
            <Stat label="Realized profit" value={formatBaseCurrencyAmount(model.money.realizedProfitBase, true)} detail="Collected, less paid costs" tone={model.money.realizedProfitBase < 0 ? 'red' : 'green'} />
          </section>

          {/* Who the business actually is. The sharpest question on the page,
              so it goes first and it is a sentence before it is a chart. */}
          <ChartFrame
            title="Customer concentration"
            subtitle={lens.concentration.headline}
            columns={[
              { key: 'customer', label: 'Customer', numeric: false },
              { key: 'pipeline', label: 'Open pipeline' },
              { key: 'share', label: 'Share' },
            ]}
            rows={lens.concentration.rows.map((row) => ({
              customer: row.accountName,
              pipeline: formatCompactBaseAmount(row.openPipelineBase),
              share: `${Math.round(row.share * 100)}%`,
            }))}
          >
            {lens.concentration.rows.length > 0 ? (
              <>
                <FunnelBars
                  ariaLabel="Open pipeline by customer, largest first"
                  // Scaled to total pipeline, so the bar and the percent beside
                  // it are measuring the same thing.
                  scaleTo={lens.concentration.totalOpenBase}
                  labelWidth="sm:w-56 lg:w-72 xl:w-[26rem]"
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
          </ChartFrame>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <ChartFrame
              title="Pipeline by stage"
              subtitle={`Active deals, valued in ${model.reportingCurrency}`}
              columns={[
                { key: 'stage', label: 'Stage', numeric: false },
                { key: 'value', label: 'Value' },
                { key: 'count', label: 'Deals' },
              ]}
              rows={model.stageMix.map((row) => ({
                stage: row.stage,
                value: formatCompactBaseAmount(row.totalBase),
                count: `${row.count}`,
              }))}
            >
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
            </ChartFrame>

            <ChartFrame
              title="Is the pipeline believable?"
              subtitle="Active deals by the evidence behind them, not by how they feel"
              columns={[
                { key: 'category', label: 'Evidence', numeric: false },
                { key: 'count', label: 'Deals' },
              ]}
              rows={model.evidenceMix.map((row) => ({ category: row.category, count: `${row.count}` }))}
            >
              {model.evidence.activeDeals === 0 ? (
                <p className="text-sm text-gray-500">No active deals to judge yet.</p>
              ) : model.evidence.graded ? (
                <SegmentBar
                  ariaLabel="Active deals by forecast evidence category"
                  segments={model.evidenceMix.map((row) => ({
                    label: row.category,
                    value: row.count,
                    color: EVIDENCE_COLORS[row.category] || '#6D28D9',
                  }))}
                />
              ) : (
                /* Every active deal carries the same grade, which means nobody
                   has graded any of them - and a full-width bar reading "Weak
                   but recoverable: 18" is the whole pipeline in one colour
                   answering nothing. This card's own subtitle promises evidence
                   rather than feeling, so when the feeling has not been recorded
                   it says so and reads the records instead. */
                <div className="space-y-2 text-sm">
                  <p className="font-bold text-navy">
                    Nothing has been graded yet.
                  </p>
                  <p className="leading-6 text-gray-600">
                    All {formatCount(model.evidence.activeDeals)} active {model.evidence.activeDeals === 1 ? 'deal carries' : 'deals carry'}
                    {' '}the same forecast category, so this is your judgement not yet given. What the records themselves say:
                  </p>
                  <ul className="space-y-1 text-gray-800">
                    <li>
                      <span className="font-bold">{formatCount(model.evidence.noTouch)}</span> of {formatCount(model.evidence.activeDeals)} have no customer touch recorded.
                    </li>
                    <li>
                      <span className="font-bold">{formatCount(model.evidence.noDecisionMaker)}</span> have nobody named as the decision maker.
                    </li>
                    <li>
                      <span className="font-bold">{formatCount(model.evidence.noNextStep)}</span> have no next step with a date on it.
                    </li>
                  </ul>
                  <Link to="/app/opportunities" className="inline-block font-bold text-brand-blue underline">
                    Grade them on Opportunities
                  </Link>
                </div>
              )}
            </ChartFrame>
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            {/* Was eight separate columns. Eight columns answer "how many that
                week" and hide the only question anybody brings to this card,
                which is whether it is going up. A line draws the slope. */}
            <ChartFrame
              title="Touches per week"
              subtitle={`The last eight weeks of recorded customer contact${touchTrend ? ` · ${touchTrend}` : ''}`}
              columns={[
                { key: 'week', label: 'Week', numeric: false },
                { key: 'touches', label: 'Touches' },
              ]}
              rows={model.weeklyActivity.map((point) => ({ week: point.label, touches: `${point.count}` }))}
            >
              {model.weeklyActivity.some((point) => point.count > 0) ? (
                <TrendChart
                  ariaLabel="Recorded customer touches per week over the last eight weeks"
                  labels={model.weeklyActivity.map((point) => point.label)}
                  series={[{
                    id: 'touches',
                    label: 'Touches',
                    color: SERIES.blue,
                    points: model.weeklyActivity.map((point) => point.count),
                    valueTexts: model.weeklyActivity.map((point) => `${point.count}`),
                  }]}
                />
              ) : (
                <p className="text-sm text-gray-500">Nothing captured in the last eight weeks.</p>
              )}
            </ChartFrame>

            <Card title="What closed" subtitle="Deals marked Won or Lost, and what they were worth">
              <div className="grid grid-cols-2 gap-3">
                <Stat
                  label="Won"
                  value={formatCount(model.outcomes.won.count)}
                  detail={formatBaseCurrencyAmount(model.outcomes.won.totalBase, true)}
                  tone="green"
                />
                <Stat
                  label="Lost"
                  value={formatCount(model.outcomes.lost.count)}
                  detail={formatBaseCurrencyAmount(model.outcomes.lost.totalBase, true)}
                  tone="red"
                />
              </div>
              {/* A figure carried from a forecast and a figure taken off a
                  signed order are different kinds of fact, and the card is the
                  only place that difference can be declared. */}
              {model.outcomes.won.missingRetro + model.outcomes.lost.missingRetro > 0 && (
                <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                  {formatCount(model.outcomes.won.missingRetro + model.outcomes.lost.missingRetro)} of these closed
                  without a retro, so they are counted at the value forecast on the deal rather than the figure
                  actually signed. Open the deal and record the outcome to correct it.
                </p>
              )}
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
    </PageContainer>
  );
}

function Header() {
  return (
    <PageHeader
      eyebrow="Run"
      icon={<BarChart3 className="h-5 w-5" />}
      title="How the business is doing"
      // Counted six when the rail held six. It holds fourteen now, and a number
      // in prose that nothing updates is a number that goes quietly wrong.
      description="Everything here is read from what your accounts, deals, touches and money already say. Nothing on this page changes a record - it is a way of seeing the destinations in the rail, not another place to work."
      actions={<DataModePill />}
    />
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
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
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
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
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`mt-1 text-xl font-bold ${valueTone}`}>{value}</p>
      {detail && <p className="mt-0.5 text-xs text-gray-500">{detail}</p>}
    </div>
  );
}
