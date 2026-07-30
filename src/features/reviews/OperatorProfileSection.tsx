import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownRight, ArrowUpRight, Fingerprint, Minus } from 'lucide-react';
import type { SalesWorkspaceData } from '../../services/workspaceData';
import type { PlanRecord } from '../../utils/weeklyPlan';
import { buildAccountAliasIndex } from '../../utils/accountAliases';
import { buildOperatorProfile, type ProfileTrait } from '../../utils/operatorProfile';
import { buildOperatorTrends, type MetricTrend, trendRules } from '../../utils/metricTrend';
import { formatCompactBaseAmount } from '../../utils/money';
import { Sparkline } from '../../components/charts/Sparkline';

/**
 * How you sell, and which way it is going.
 *
 * The rest of Review answers what happened in a period. This answers what is
 * normal for this person - the thing they cannot see from inside their own week
 * - and whether a number has been sliding long enough to be a fact rather than a
 * bad week.
 *
 * The section is deliberately allowed to be mostly empty. A new workspace sees
 * the list of readings it has not earned yet, with the record count each one
 * needs, because "we need three more closed deals before we can tell you your
 * sales cycle" is honest and teaches the loop, while a confident-sounding
 * paragraph derived from two deals would be neither.
 */
export function OperatorProfileSection({
  workspace,
  planRecords,
}: {
  workspace: SalesWorkspaceData;
  planRecords: PlanRecord[];
}) {
  const profile = useMemo(() => buildOperatorProfile({
    opportunities: workspace.opportunities,
    opportunityOutcomes: workspace.opportunityOutcomes,
    activities: workspace.activities,
    quotes: workspace.quotes,
    accountAliases: buildAccountAliasIndex(workspace.accountMerges),
  }), [workspace]);

  const trends = useMemo(() => buildOperatorTrends({
    activities: workspace.activities,
    opportunities: workspace.opportunities,
    opportunityOutcomes: workspace.opportunityOutcomes,
    quotes: workspace.quotes,
    planRecords,
  }), [workspace, planRecords]);

  const notable = trends.filter((trend) => trend.notable);

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm" aria-label="How you sell">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Fingerprint className="h-4 w-4 text-brand-blue" />
          <h2 className="text-lg font-bold text-navy">How you sell</h2>
        </div>
        <p className="text-[11px] font-semibold text-gray-400">
          Read back from your own records. No benchmarks, no model.
        </p>
      </div>
      <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-600">{profile.headline}</p>

      {notable.length > 0 && (
        <div className="mt-4 flex flex-col gap-2">
          {notable.map((trend) => (
            <p
              key={trend.id}
              className={`rounded-lg border px-3.5 py-2.5 text-sm font-semibold ${
                trend.sentiment === 'bad'
                  ? 'border-amber-200 bg-amber-50 text-amber-900'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-900'
              }`}
            >
              {trend.reading}
            </p>
          ))}
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {trends.map((trend) => <TrendTile key={trend.id} trend={trend} />)}
      </div>

      {profile.traits.length > 0 && (
        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {profile.traits.map((trait) => <TraitCard key={trait.id} trait={trait} />)}
        </div>
      )}

      {profile.unusuallyQuiet.length > 0 && (
        <div className="mt-5 rounded-lg border border-gray-200 bg-gray-50/60 p-4">
          <h3 className="text-sm font-bold text-navy">Quiet against their own rhythm</h3>
          <p className="mt-0.5 text-xs leading-5 text-gray-500">
            Measured against how often you normally speak to each of these customers, not against the shared silence
            threshold on Today. A customer you speak to weekly is already unusual at day ten.
          </p>
          <ul className="mt-2.5 flex flex-col gap-1.5">
            {profile.unusuallyQuiet.map((entry) => (
              <li key={entry.account} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <Link
                  to={`/app/accounts?accountName=${encodeURIComponent(entry.account)}`}
                  className="font-bold text-navy hover:text-brand-blue hover:underline"
                >
                  {entry.account}
                </Link>
                <span className="text-xs font-semibold text-gray-500">
                  normally every {entry.normalGapDays} day{entry.normalGapDays === 1 ? '' : 's'} · silent {entry.daysSinceTouch} ({Math.round(entry.ratio)}x)
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {profile.gaps.length > 0 && (
        <details className="mt-4 rounded-lg border border-dashed border-gray-300 bg-white p-4">
          <summary className="cursor-pointer text-sm font-bold text-navy">
            {profile.gaps.length} reading{profile.gaps.length === 1 ? '' : 's'} Memoire has not earned yet
          </summary>
          <ul className="mt-2.5 flex flex-col gap-2">
            {profile.gaps.map((gap) => (
              <li key={gap.id} className="text-sm leading-6 text-gray-600">
                <span className="font-bold text-navy">{gap.label}</span>
                {' — '}
                {gap.have} of {gap.need} records. Reaching {gap.need} tells you {gap.unlocks}.
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function TraitCard({ trait }: { trait: ProfileTrait }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{trait.label}</p>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
            trait.confidence === 'reliable' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'
          }`}
          title={trait.confidence === 'reliable'
            ? 'Enough records behind it to argue with'
            : 'An early read - it can still move as you record more'}
        >
          {trait.confidence === 'reliable' ? 'solid' : 'early read'} · {trait.sample}
        </span>
      </div>
      <p className="mt-1.5 text-sm font-semibold leading-6 text-navy">{trait.reading}</p>
      {trait.soWhat && <p className="mt-1 text-xs leading-5 text-gray-600">{trait.soWhat}</p>}
    </div>
  );
}

function TrendTile({ trend }: { trend: MetricTrend }) {
  const Icon = trend.direction === 'rising' ? ArrowUpRight : trend.direction === 'falling' ? ArrowDownRight : Minus;
  const tone = trend.sentiment === 'good' ? 'text-emerald-600' : trend.sentiment === 'bad' ? 'text-amber-600' : 'text-gray-400';

  const points = trend.points
    .filter((point) => point.value !== null)
    .map((point) => ({ label: '', value: point.value as number }));

  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{trend.label}</p>
        <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold ${tone}`}>
          <Icon className="h-3.5 w-3.5" />
          {phraseFor(trend)}
        </span>
      </div>
      <p className="mt-0.5 text-xl font-bold text-navy">{formatValue(trend)}</p>
      {points.length > 1 && (
        <div className="mt-1">
          <Sparkline points={points} height={28} ariaLabel={`${trend.label} over the last ${points.length} weeks`} />
        </div>
      )}
      <p className="mt-0.5 text-[10px] text-gray-400">last complete week{trend.points.some((point) => !point.complete) ? ' · this week still running' : ''}</p>
    </div>
  );
}

/**
 * The tile's own short phrasing. The engine's full sentence is used above for
 * the readings worth calling out; inside a tile there is no room for it, and
 * money would arrive as a bare number without its currency.
 */
function phraseFor(trend: MetricTrend) {
  if (trend.direction === 'unreadable') {
    const complete = trend.points.filter((point) => point.complete && point.value !== null).length;
    // Two different reasons a direction is unreadable, and they are not the same
    // message: not enough weeks yet, or enough weeks of numbers too small to
    // take a percentage of.
    return complete < trendRules.minimumPeriods ? `${complete}/${trendRules.minimumPeriods} weeks` : 'too few';
  }
  if (trend.direction === 'steady') return 'steady';
  if (trend.streak >= trendRules.streakThreshold) return `${trend.streak} weeks`;
  return `${Math.abs(Math.round((trend.changePct || 0) * 100))}%`;
}

function formatValue(trend: MetricTrend) {
  if (trend.latest === null) return '—';
  if (trend.unit === 'money') return formatCompactBaseAmount(trend.latest);
  if (trend.unit === 'percent') return `${Math.round(trend.latest * 100)}%`;
  return String(Math.round(trend.latest * 10) / 10);
}
