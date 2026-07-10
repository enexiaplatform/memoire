import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Banknote, ReceiptText, RefreshCw, Search } from 'lucide-react';
import { useAuthContext } from '../../auth/authContext';
import { DataModePill } from '../../components/common/DataModePill';
import { isSupabaseConfigured } from '../../lib/demoMode';
import type { CrmLiteOpportunity } from '../../services/opportunityStore';
import type { QuoteRecord } from '../../services/quoteStore';
import { loadSalesWorkspaceData } from '../../services/workspaceData';
import { hasLocalSampleData } from '../../utils/dataMode';
import { formatBaseCurrencyAmount as formatBaseMoney, formatCurrencyAmount as formatMoney } from '../../utils/money';
import { buildRevenueView, type RevenueActionItem, type RevenueRiskKind } from '../../utils/revenueView';
import { buildMoneyFlow, moneyFlowStages } from '../../utils/moneyFlow';
import { formatBaseCurrencyAmount, formatCurrencyAmount } from '../../utils/money';

type RevenueData = {
  opportunities: CrmLiteOpportunity[];
  quotes: QuoteRecord[];
};

export function RevenueViewPage() {
  const { user, loading: authLoading, isAuthenticated } = useAuthContext();
  const [data, setData] = useState<RevenueData>({ opportunities: [], quotes: [] });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState('');
  const sampleDataActive = hasLocalSampleData();
  const dataUserId = sampleDataActive ? undefined : user?.id;

  const loadRevenue = async (force = false) => {
    if (force) setSyncing(true);
    setLoading(!force);
    try {
      const workspace = await loadSalesWorkspaceData(dataUserId, { force });
      setData({
        opportunities: workspace.opportunities,
        quotes: workspace.quotes,
      });
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  };

  useEffect(() => {
    if (!authLoading) void loadRevenue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, dataUserId]);

  const revenue = useMemo(() => buildRevenueView(data), [data]);
  const moneyFlow = useMemo(() => buildMoneyFlow(data), [data]);
  const visibleActions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return revenue.actionItems;
    return revenue.actionItems.filter((item) => [
      item.accountName,
      item.label,
      item.risk,
      item.nextAction,
      item.status,
    ].join(' ').toLowerCase().includes(query));
  }, [revenue.actionItems, search]);
  const stuckRevenue = revenue.pendingPo + revenue.pendingDelivery + revenue.pendingPayment;

  return (
    <div className="flex w-full max-w-none flex-col gap-5 px-4 py-5 sm:px-5 lg:px-6">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Money</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-navy">Where the money sits, end to end.</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
            One commercial lifecycle: deal, quote, PO, delivery, payment. Inspect stuck money and follow-ups - Today owns the priority order.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/app/today" className="inline-flex items-center justify-center gap-2 rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">
            Return to Today
            <ArrowRight className="h-4 w-4" />
          </Link>
          <button
            type="button"
            onClick={() => loadRevenue(true)}
            disabled={syncing}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
            title="Reload revenue view"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
            Cloud sync
          </button>
          <DataModePill
            compact
            isLoading={authLoading || loading}
            isAuthenticated={isAuthenticated}
            isSupabaseConfigured={isSupabaseConfigured}
            cloudAvailable={isSupabaseConfigured}
            hasSampleData={sampleDataActive}
          />
        </div>
      </header>

      {loading ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm font-semibold text-gray-500 shadow-sm">
          Loading revenue view...
        </div>
      ) : !data.opportunities.length && !data.quotes.length ? (
        <RevenueEmptyState />
      ) : (
        <>
          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-navy">Money flow</h2>
                <p className="mt-1 text-sm text-gray-500">Deal, quote, PO, delivery, payment - every thread in one lifecycle.</p>
              </div>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-brand-blue">
                In motion: {formatBaseCurrencyAmount(moneyFlow.totalInMotionBase, true)}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
              {moneyFlowStages.map((stage) => {
                const lane = moneyFlow.lanes.find((item) => item.stage === stage);
                return (
                  <div key={stage} className={`rounded-lg border p-3 ${lane && lane.stuckThreads > 0 ? 'border-red-200 bg-red-50/50' : 'border-gray-100 bg-gray-50'}`}>
                    <p className="text-xs font-bold uppercase tracking-wide text-gray-500">{stage}</p>
                    <p className="mt-1 text-lg font-bold text-navy">{lane?.threads || 0}</p>
                    <p className="text-xs font-semibold text-gray-600">{formatBaseCurrencyAmount(lane?.totalBase || 0, true)}</p>
                    {lane && lane.stuckThreads > 0 && (
                      <p className="mt-1 text-xs font-bold text-red-700">{lane.stuckThreads} stuck</p>
                    )}
                  </div>
                );
              })}
            </div>
            {moneyFlow.stuckThreads.length > 0 && (
              <div className="mt-4 space-y-1.5">
                <p className="text-xs font-bold uppercase tracking-wide text-red-700">Stuck money first</p>
                {moneyFlow.stuckThreads.slice(0, 5).map((thread) => (
                  <div key={thread.id} className="flex flex-col gap-1 rounded-lg border border-red-100 bg-red-50/40 px-3 py-2 text-xs sm:flex-row sm:items-center sm:justify-between">
                    <p className="font-bold text-gray-900">
                      {thread.accountName} / {thread.label}
                      {typeof thread.amount === 'number' && thread.currency ? ` - ${formatCurrencyAmount(thread.amount, thread.currency)}` : ''}
                    </p>
                    <p className="font-semibold text-red-800">{thread.stuckReason}. {thread.nextAction}</p>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-blue-100 bg-blue-50/70 p-5 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Banknote className="h-4 w-4 text-brand-blue" />
                  <h2 className="text-lg font-bold text-navy">Commercial risk detail</h2>
                </div>
                <p className="mt-1 text-sm text-blue-900/75">
                  {revenue.topAction
                    ? `${revenue.topAction.accountName}: ${revenue.topAction.nextAction}`
                    : 'No commercial risk is blocking today.'}
                </p>
                {revenue.topAction && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Badge label={revenue.topAction.risk} tone={riskTone(revenue.topAction.risk)} />
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-blue-900">
                      {formatMoney(revenue.topAction.amount, revenue.topAction.currency)}
                    </span>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Link to={revenue.topAction?.href || '/app/quotes'} className="rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">
                  {revenue.topAction ? 'Open action' : 'Create quote'}
                </Link>
                <Link to="/app/opportunities" className="rounded-full border border-blue-100 bg-white px-4 py-2 text-sm font-bold text-brand-blue">Review pipeline</Link>
              </div>
            </div>
          </section>

          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <RevenueMetric label="Active pipeline" value={formatBaseMoney(revenue.activePipeline)} tone="blue" />
            <RevenueMetric label="Stuck money" value={formatBaseMoney(stuckRevenue)} tone={stuckRevenue ? 'amber' : 'green'} />
            <RevenueMetric label="At risk" value={formatBaseMoney(revenue.atRiskRevenue)} tone={revenue.atRiskRevenue ? 'red' : 'green'} />
            <RevenueMetric label="Overdue" value={revenue.overdueFollowUps} tone={revenue.overdueFollowUps ? 'red' : 'green'} />
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-base font-bold text-navy">Commercial risk list</h2>
                <p className="mt-1 text-xs text-gray-500">{visibleActions.length} items need review</p>
              </div>
              <label className="relative w-full lg:w-[340px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search account, quote, risk..."
                  className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
                />
              </label>
            </div>
            <RevenueActionTable items={visibleActions} />
          </section>

          <details className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <summary className="cursor-pointer text-sm font-bold text-navy">More money signals</summary>
            <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-7">
              <RevenueMetric label="Won" value={formatBaseMoney(revenue.won)} tone={revenue.won ? 'green' : 'blue'} />
              <RevenueMetric label="Quoted" value={formatBaseMoney(revenue.quoted)} tone={revenue.quoted ? 'blue' : 'green'} />
              <RevenueMetric label="Pending PO" value={formatBaseMoney(revenue.pendingPo)} tone={revenue.pendingPo ? 'amber' : 'green'} />
              <RevenueMetric label="Pending delivery" value={formatBaseMoney(revenue.pendingDelivery)} tone={revenue.pendingDelivery ? 'amber' : 'green'} />
              <RevenueMetric label="Pending payment" value={formatBaseMoney(revenue.pendingPayment)} tone={revenue.pendingPayment ? 'amber' : 'green'} />
              <RevenueMetric label="Paid" value={formatBaseMoney(revenue.paid)} tone="green" />
              <RevenueMetric label="Expiring quotes" value={revenue.expiringQuotes} tone={revenue.expiringQuotes ? 'amber' : 'green'} />
            </div>
          </details>
        </>
      )}
    </div>
  );
}

function RevenueActionTable({ items }: { items: RevenueActionItem[] }) {
  if (items.length === 0) {
    return (
      <div className="mt-4 rounded-lg border border-dashed border-gray-200 bg-gray-50 p-6 text-center">
        <p className="text-sm font-bold text-navy">No commercial risk found.</p>
        <p className="mt-1 text-sm text-gray-500">Create quotes or update pipeline next actions to keep this view current.</p>
      </div>
    );
  }

  return (
    <div className="mt-4 max-w-full overflow-x-auto">
      <table className="w-full min-w-[920px] border-collapse text-left text-sm">
        <thead className="bg-gray-50 text-[11px] font-bold uppercase tracking-wide text-gray-500">
          <tr>
            <th className="border-b border-gray-200 px-3 py-3">Account</th>
            <th className="border-b border-gray-200 px-3 py-3">Item</th>
            <th className="border-b border-gray-200 px-3 py-3">Money</th>
            <th className="border-b border-gray-200 px-3 py-3">Risk</th>
            <th className="border-b border-gray-200 px-3 py-3">Next action</th>
            <th className="border-b border-gray-200 px-3 py-3 text-right">Open</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {items.map((item) => (
            <tr key={item.id} className="hover:bg-blue-50/60">
              <td className="px-3 py-3 font-bold text-navy">{item.accountName}</td>
              <td className="px-3 py-3">
                <p className="max-w-[240px] truncate font-semibold text-gray-800" title={item.label}>{item.label}</p>
                <p className="mt-1 text-xs font-semibold text-gray-400">{item.source} / {item.status}</p>
              </td>
              <td className="whitespace-nowrap px-3 py-3 font-bold text-gray-800">{formatMoney(item.amount, item.currency)}</td>
              <td className="px-3 py-3"><Badge label={item.risk} tone={riskTone(item.risk)} /></td>
              <td className="px-3 py-3">
                <p className="max-w-[260px] truncate text-gray-700" title={item.nextAction}>{item.nextAction}</p>
              </td>
              <td className="px-3 py-3 text-right">
                <Link to={item.href} className="inline-flex rounded-full bg-navy px-3 py-1.5 text-xs font-bold text-white">Open</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RevenueEmptyState() {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-brand-blue">
        <ReceiptText className="h-6 w-6" />
      </div>
      <h2 className="mt-4 text-xl font-bold text-navy">Create a quote or update pipeline.</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-gray-500">
        Revenue View needs opportunities or quotes to show stuck money and risk.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Link to="/app/quotes" className="rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">Create quote</Link>
        <Link to="/app/opportunities" className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700">Review pipeline</Link>
      </div>
    </section>
  );
}

function RevenueMetric({ label, value, tone }: { label: string; value: string | number; tone: 'blue' | 'green' | 'amber' | 'red' }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-white p-3 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-base font-black ${toneClass(tone)}`}>{value}</p>
    </div>
  );
}

function Badge({ label, tone = 'blue' }: { label: string; tone?: 'blue' | 'green' | 'amber' | 'red' | 'gray' }) {
  const classes = {
    blue: 'border-blue-100 bg-blue-50 text-brand-blue',
    green: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-100 bg-amber-50 text-amber-700',
    red: 'border-red-100 bg-red-50 text-red-700',
    gray: 'border-gray-200 bg-gray-50 text-gray-600',
  }[tone];
  return <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${classes}`}>{label}</span>;
}

function riskTone(risk: RevenueRiskKind): 'blue' | 'green' | 'amber' | 'red' | 'gray' {
  if (risk === 'Quote expired' || risk === 'Payment term missing' || risk === 'Delivery overdue' || risk === 'Payment overdue') return 'red';
  if (risk === 'Quote expiring' || risk === 'Waiting on PO' || risk === 'Waiting on delivery' || risk === 'Waiting on payment') return 'amber';
  if (risk === 'Weak pipeline') return 'blue';
  return 'gray';
}

function toneClass(tone: 'blue' | 'green' | 'amber' | 'red') {
  return {
    blue: 'bg-blue-50 text-brand-blue',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-700',
  }[tone];
}
