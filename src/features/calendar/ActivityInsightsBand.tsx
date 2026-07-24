import { Link } from 'react-router-dom';
import { ArrowDownRight, ArrowRight, ArrowUpRight, Sparkles } from 'lucide-react';
import type { BusinessDomain } from '../../utils/businessDomain';
import type { ActivityInsights } from '../../utils/activityInsights';
import { formatSafeBusinessDate } from '../../utils/safeDate.ts';

// Stronger fills than the pale filter chips, so the effort bar reads at a glance.
const domainBarColor: Record<BusinessDomain, string> = {
  Sales: 'bg-blue-500',
  Money: 'bg-emerald-500',
  Delivery: 'bg-violet-500',
  Marketing: 'bg-pink-500',
  Product: 'bg-indigo-500',
  Learning: 'bg-amber-500',
  Internal: 'bg-gray-400',
};

/**
 * The ledger, read back as analysis. It never re-records anything - it derives
 * cadence, effort mix, and follow-through from the same touches the timeline
 * shows, so a capture pays off as understanding, not just storage. Follow-through
 * is the seam with Plan: it counts the dated next actions that were actually
 * ticked done, which is only possible because Capture, Plan and this page all
 * read one spine.
 */
export function ActivityInsightsBand({ insights }: { insights: ActivityInsights }) {
  if (insights.total === 0) return null;

  const { momentum, followThrough } = insights;
  const TrendIcon = momentum.direction === 'up' ? ArrowUpRight : momentum.direction === 'down' ? ArrowDownRight : ArrowRight;
  const trendTone = momentum.direction === 'up' ? 'text-emerald-600' : momentum.direction === 'down' ? 'text-red-600' : 'text-gray-500';
  const ratePct = followThrough.rate === null ? null : Math.round(followThrough.rate * 100);

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-brand-blue" />
        <h2 className="text-lg font-bold text-navy">What this period tells you</h2>
      </div>
      <p className="mt-1 text-sm leading-6 text-gray-600">{insights.headline}</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <InsightTile label="Cadence">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-navy">{momentum.current}</span>
            <span className={`inline-flex items-center gap-0.5 text-xs font-bold ${trendTone}`}>
              <TrendIcon className="h-3.5 w-3.5" />
              {momentum.deltaPct === null ? 'new' : momentum.direction === 'flat' ? 'level' : `${Math.abs(momentum.deltaPct)}%`}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-gray-500">
            touches on {insights.activeDays} active {insights.activeDays === 1 ? 'day' : 'days'}
            {insights.busiestDay ? ` · busiest ${formatSafeBusinessDate(insights.busiestDay.date)}` : ''}
          </p>
        </InsightTile>

        <InsightTile label="Follow-through">
          {followThrough.committed === 0 ? (
            <>
              <span className="text-2xl font-bold text-gray-400">—</span>
              <p className="mt-0.5 text-[11px] text-gray-500">No dated next actions captured yet.</p>
            </>
          ) : ratePct === null ? (
            <>
              {/* Captured and dated, but nothing has reached its day - a rate
                  here would read as failure for work that is simply not due. */}
              <span className="text-2xl font-bold text-gray-400">—</span>
              <p className="mt-0.5 text-[11px] text-gray-500">
                {followThrough.notYetDue} captured {followThrough.notYetDue === 1 ? 'action' : 'actions'} on the plan, none due yet.
              </p>
            </>
          ) : (
            <>
              <div className="flex items-baseline gap-2">
                <span className={`text-2xl font-bold ${ratePct >= 60 ? 'text-emerald-700' : 'text-amber-700'}`}>{ratePct}%</span>
                <span className="text-xs font-semibold text-gray-500">{followThrough.done}/{followThrough.settled} due</span>
              </div>
              <p className="mt-0.5 text-[11px] text-gray-500">
                closed of what came due
                {followThrough.openOverdue > 0 ? ` · ${followThrough.openOverdue} overdue` : ''}
                {followThrough.notYetDue > 0 ? ` · ${followThrough.notYetDue} ahead` : ''}
              </p>
            </>
          )}
        </InsightTile>

        <InsightTile label="Where the effort went">
          {insights.effortMix.length === 0 ? (
            <span className="text-sm text-gray-400">—</span>
          ) : (
            <>
              <div className="flex h-2 w-full overflow-hidden rounded-full bg-gray-100">
                {insights.effortMix.slice(0, 5).map((row) => (
                  <span
                    key={row.domain}
                    className={domainBarColor[row.domain] || 'bg-gray-300'}
                    style={{ width: `${Math.max(row.share * 100, 4)}%` }}
                    title={`${row.domain}: ${row.count}`}
                  />
                ))}
              </div>
              <p className="mt-1 text-[11px] text-gray-500">
                {insights.effortMix.slice(0, 2).map((row) => `${row.domain} ${Math.round(row.share * 100)}%`).join(' · ')}
                {insights.topActivityType ? ` · top type: ${insights.topActivityType.type}` : ''}
              </p>
            </>
          )}
        </InsightTile>

        <InsightTile label="Going quiet">
          {insights.quietAccounts.length === 0 ? (
            <>
              <span className="text-sm font-bold text-emerald-700">Nothing silent</span>
              <p className="mt-0.5 text-[11px] text-gray-500">Every recent account has a fresh touch.</p>
            </>
          ) : (
            <ul className="space-y-1">
              {insights.quietAccounts.slice(0, 3).map((account) => (
                <li key={account.account} className="flex items-center justify-between gap-2 text-[11px]">
                  <Link
                    to={`/app/accounts?accountName=${encodeURIComponent(account.account)}`}
                    className="truncate font-bold text-gray-800 hover:text-brand-blue hover:underline"
                  >
                    {account.account}
                  </Link>
                  <span className="shrink-0 text-gray-500">{account.daysSinceTouch}d</span>
                </li>
              ))}
            </ul>
          )}
        </InsightTile>
      </div>

      {/* The counts worth keeping at a glance - the rest fold away below. */}
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-gray-100 pt-3 text-[11px] text-gray-500">
        <Coverage label="accounts touched" value={insights.coverage.accountsTouched} />
        <Coverage label="opportunities" value={insights.coverage.opportunitiesTouched} />
        <Coverage label="follow-ups" value={insights.coverage.followUps} />
        <Coverage label="objections" value={insights.coverage.objections} tone={insights.coverage.objections > 0 ? 'amber' : 'default'} />
      </div>
    </section>
  );
}

function Coverage({ label, value, tone = 'default' }: { label: string; value: number; tone?: 'default' | 'amber' }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className={`font-bold ${tone === 'amber' ? 'text-amber-700' : 'text-navy'}`}>{value}</span>
      {label}
    </span>
  );
}

function InsightTile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{label}</p>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
