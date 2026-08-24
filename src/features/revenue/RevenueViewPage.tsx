import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Plus, ReceiptText, RefreshCw, Search, Trash2, Wallet } from 'lucide-react';
import { ProfitAndLossStatement } from './ProfitAndLossStatement';
import { BUSINESS_ACCOUNTING_ENABLED } from '../../config/featureFlags';
import { ThreadsSection } from '../threads/ThreadsSection';
import { CoveragePanel } from './CoveragePanel';
import { TargetPlanPanel } from './TargetPlanPanel';
import { OrderBookPanel } from './OrderBookPanel';
import { loadOrderCostsForWorkspace } from '../../services/orderCostStore';
import type { OrderTermRecord } from '../../utils/orderToCash';
import { SupplierCommitmentsPanel } from './SupplierCommitmentsPanel';
import { useAuthContext } from '../../auth/authContext';
import { DataModePill } from '../../components/common/DataModePill';
import { isSupabaseConfigured } from '../../lib/demoMode';
import type { AccountMergeRecord } from '../../services/accountMergeStore';
import type { CrmLiteOpportunity } from '../../services/opportunityStore';
import type { OpportunityOutcomeRecord } from '../../services/opportunityOutcomeStore';
import type { QuoteRecord } from '../../services/quoteStore';
import type { SalesActivityRecord } from '../../services/salesActivityStore';
import { getCachedSalesWorkspaceData, loadSalesWorkspaceData, type SalesWorkspaceData } from '../../services/workspaceData';
import { useWorkspaceRefresh } from '../../hooks/useWorkspaceRefresh';
import { hasLocalSampleData } from '../../utils/dataMode';
import { formatBaseCurrencyAmount as formatBaseMoney, formatCurrencyAmount as formatMoney } from '../../utils/money';
import { formatCount } from '../../utils/numberFormat';
import { buildRevenueView, type RevenueActionItem, type RevenueRiskKind } from '../../utils/revenueView';
import { buildMoneyFlow, moneyFlowStages } from '../../utils/moneyFlow';
import { formatBaseCurrencyAmount, formatCurrencyAmount, listSelectableCurrencies } from '../../utils/money';
import { buildRouteHealth, type RouteHealthReport } from '../../utils/routeHealth';
import { buildOwnObligations } from '../../utils/ownObligations';
import { PageContainer, PageHeader } from '../../components/layout/PageFrame';
import {
  createExpense,
  deleteExpense,
  emptyExpenseInput,
  expenseCategories,
  loadExpenses,
  markExpensePaid,
  type ExpenseRecord,
} from '../../services/expenseStore';
import { matchesSearchQuery } from '../../utils/textSearch';

type RevenueData = {
  opportunities: CrmLiteOpportunity[];
  quotes: QuoteRecord[];
  // Only the target plan reads these two, and only to work out the seller's own
  // win rate, deal size and cycle. They come from the same cached workspace
  // load, so carrying them costs nothing the page was not already paying.
  activities: SalesActivityRecord[];
  opportunityOutcomes: OpportunityOutcomeRecord[];
  accountMerges: AccountMergeRecord[];
};

const emptyRevenueData: RevenueData = {
  opportunities: [], quotes: [], activities: [], opportunityOutcomes: [], accountMerges: [],
};

function revenueDataFrom(workspace: SalesWorkspaceData | null): RevenueData | null {
  if (!workspace) return null;
  return {
    opportunities: workspace.opportunities,
    quotes: workspace.quotes,
    activities: workspace.activities,
    opportunityOutcomes: workspace.opportunityOutcomes,
    accountMerges: workspace.accountMerges,
  };
}

export function RevenueViewPage() {
  const { user, loading: authLoading, isAuthenticated } = useAuthContext();
  // Paint from the workspace already in memory rather than flashing a skeleton
  // on every arrival. Money is the surface sellers bounce in and out of most,
  // and the load below still runs - it just no longer holds the screen blank
  // while it does.
  const initialRevenueData = revenueDataFrom(
    getCachedSalesWorkspaceData(hasLocalSampleData() ? undefined : user?.id),
  );
  const [data, setData] = useState<RevenueData>(initialRevenueData || emptyRevenueData);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>(() => loadExpenses());
  const [loading, setLoading] = useState(!initialRevenueData);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState('');
  // The terms recorded against each order, loaded here and handed to the order
  // book. They live on the cost record because that is where an operator works
  // them out - usually before any quote exists - and the order book must not
  // import that module itself (verify-order-margin, case 1b). Without them a
  // deal won on a handshake showed "No payment term" and carried a Deposit step
  // its Net 30 terms never owed.
  const [termRecords, setTermRecords] = useState<OrderTermRecord[]>([]);
  const sampleDataActive = hasLocalSampleData();
  const dataUserId = sampleDataActive ? undefined : user?.id;

  useEffect(() => {
    let cancelled = false;
    void loadOrderCostsForWorkspace(dataUserId, sampleDataActive).then((records) => {
      if (!cancelled) setTermRecords(records);
    });
    return () => { cancelled = true; };
  }, [dataUserId, sampleDataActive]);

  // Expenses are local, but they feed both the P&L headline and the money-out
  // panel below it, so they live on the page and both surfaces read one copy.
  const reloadExpenses = useCallback(() => setExpenses(loadExpenses()), []);

  const loadRevenue = async (force = false) => {
    if (force) setSyncing(true);
    // A cache hit has already painted the page. Raising the skeleton again for
    // the load that confirms it is the flicker this page was showing.
    setLoading(!force && !getCachedSalesWorkspaceData(dataUserId));
    try {
      const workspace = await loadSalesWorkspaceData(dataUserId, { force });
      setData(revenueDataFrom(workspace) || emptyRevenueData);
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  };

  useEffect(() => {
    if (!authLoading) void loadRevenue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, dataUserId]);

  // Drawn from the browser copy at first paint; take the cloud answer when it lands.
  useWorkspaceRefresh(() => { void loadRevenue(); });

  const revenue = useMemo(() => buildRevenueView(data), [data]);
  const moneyFlow = useMemo(() => buildMoneyFlow(data), [data]);
  // How many money threads have reached a quote. This is the whole difference
  // between "In motion" and "Active pipeline", and until it is above nought
  // the two tiles print the same figure.
  const quotedThreadCount = useMemo(
    () => moneyFlow.threads.filter((thread) => thread.stage !== 'Opportunity').length,
    [moneyFlow.threads],
  );
  const routeHealth = useMemo(() => buildRouteHealth({ opportunities: data.opportunities }), [data.opportunities]);
  const visibleActions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return revenue.actionItems;
    return revenue.actionItems.filter((item) => matchesSearchQuery([
      item.accountName,
      item.label,
      item.risk,
      item.nextAction,
      item.status,
    ].join(' '), query));
  }, [revenue.actionItems, search]);

  return (
    <PageContainer>
      {/* The second sentence is load bearing, not decoration: this page ranks
          orders by where money is stuck, and Today owns the priority order for
          the day. Two surfaces claiming to say what to do first is how an
          operator stops trusting either. */}
      <PageHeader
        eyebrow="Records"
        title="Orders"
        description="Committed orders, followed from contract to money in the bank. Today owns the priority order."
        actions={
          <>
            <Link to="/app/today" className="inline-flex items-center justify-center gap-1.5 rounded-full bg-navy px-3.5 py-1.5 text-sm font-bold text-white">
              Today
              <ArrowRight className="h-4 w-4" />
            </Link>
            <button
              type="button"
              onClick={() => loadRevenue(true)}
              disabled={syncing}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
              title="Reload orders from cloud"
            >
              <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
            </button>
            <DataModePill
              compact
              isLoading={authLoading || loading}
              isAuthenticated={isAuthenticated}
              isSupabaseConfigured={isSupabaseConfigured}
              cloudAvailable={isSupabaseConfigured}
              hasSampleData={sampleDataActive}
            />
          </>
        }
      />

      {loading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm font-semibold text-gray-500 shadow-sm">
          Loading revenue view...
        </div>
      ) : !data.opportunities.length && !data.quotes.length ? (
        <RevenueEmptyState />
      ) : (
        <>
          {/* Accounting-style reporting is outside the beta proposition. See
              src/config/featureFlags.ts - the expense records themselves are
              untouched, still synced, and still exported. */}
          {BUSINESS_ACCOUNTING_ENABLED && (
            <ProfitAndLossStatement quotes={data.quotes} expenses={expenses} />
          )}

          {/* The page is the order book.
              Everything under it answers a different question - will I make
              the number, what is the principal owed, which threads are quiet -
              and each of those was a full-height panel between the operator
              and the orders they came to chase. They are still here, folded,
              in the order somebody actually reaches for them. */}
          <OrderBookPanel
            opportunities={data.opportunities}
            quotes={data.quotes}
            termRecords={termRecords}
            outcomes={data.opportunityOutcomes}
            dataUserId={dataUserId}
            sampleDataActive={sampleDataActive}
          />

          {/* Compact amounts on purpose: at full precision "4,920,000,000 VND
              (Base: VND)" wrapped to two lines inside its own card and turned a
              four-number strip into a paragraph. */}
          <section className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {/* These two are the same number until the operator writes their
                first quote, because "in motion" is unquoted active deals plus
                live quotes and "active pipeline" is every active deal. Two
                identical figures side by side, with nothing saying why, read
                as one of them being broken. Each now says what it counts, and
                In motion says how much of the pipeline has reached a quote -
                which is the only thing that makes them differ. */}
            <RevenueMetric
              label="In motion"
              value={formatBaseCurrencyAmount(moneyFlow.totalInMotionBase, true)}
              tone="blue"
              detail={quotedThreadCount > 0
                ? `${formatCount(quotedThreadCount)} quoted of ${formatCount(moneyFlow.threads.length)}`
                : 'Nothing quoted yet'}
            />
            <RevenueMetric
              label="Active pipeline"
              value={formatBaseMoney(revenue.activePipeline, true)}
              tone="blue"
              detail="Every open deal"
            />
            <RevenueMetric label="At risk" value={formatBaseMoney(revenue.atRiskRevenue, true)} tone={revenue.atRiskRevenue ? 'red' : 'green'} />
            <RevenueMetric label="Overdue follow-ups" value={revenue.overdueFollowUps} tone={revenue.overdueFollowUps ? 'red' : 'green'} />
          </section>

          {/* A control tower has to say whether you are going to make the
              number, and whether there is still time to change it. */}
          <CoveragePanel />

          {/* The second half of Coverage's sentence: the shortfall turned into
              deals, quotes and a weekly rate, at the seller's own conversion.
              Renders nothing until a target exists, so it never repeats the
              invitation the panel above already makes. */}
          <TargetPlanPanel
            opportunities={data.opportunities}
            quotes={data.quotes}
            activities={data.activities}
            opportunityOutcomes={data.opportunityOutcomes}
            accountMerges={data.accountMerges}
          />

          {/* The supply side of the same orders. An order stuck on a price the
              principal has not confirmed is stuck for a reason no amount of
              chasing the customer will fix, so it stays on this page - but
              below the orders it explains, not above them. */}
          <SupplierCommitmentsPanel opportunities={data.opportunities} />

          <FoldedSection
            title="Commercial risk list"
            summary={`${visibleActions.length} item${visibleActions.length === 1 ? '' : 's'} to review`}
          >
            <label className="relative block w-full lg:w-[340px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search account, quote, risk..."
                className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
              />
            </label>
            <RevenueActionTable items={visibleActions} />
          </FoldedSection>

          <FoldedSection
            title="Money flow"
            summary={`Every thread in one lifecycle · in motion ${formatBaseCurrencyAmount(moneyFlow.totalInMotionBase, true)}`}
          >
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
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
          </FoldedSection>

          {/* Where the value is sitting, thread by thread: the same component
              Today and Accounts use, narrowed to money that has left the
              starting line and has not arrived. */}
          <FoldedSection title="Value in motion" summary="Threads carrying money, quietest first">
            <ThreadsSection
              title="Value in motion"
              description="Quietest first"
              filter={{ moneyInMotionOnly: true }}
              emptyMessage="No commercial value is in motion. Send a quote and the thread appears here with its money position."
            />
          </FoldedSection>

          {BUSINESS_ACCOUNTING_ENABLED && (
            <MoneyOutSection quotes={data.quotes} expenses={expenses} onExpensesChanged={reloadExpenses} />
          )}

          <RouteHealthSection report={routeHealth} />
        </>
      )}
    </PageContainer>
  );
}

/**
 * A panel you open when you have the question, not one you scroll past on the
 * way to the orders. Same visual weight as the sections that stay open, so the
 * page reads as one stack rather than as a page plus an appendix.
 */
function FoldedSection({
  title,
  summary,
  children,
}: {
  title: string;
  summary: string;
  children: React.ReactNode;
}) {
  return (
    <details className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <summary className="cursor-pointer list-none px-5 py-3">
        <span className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-base font-bold text-navy">{title}</span>
          <span className="text-xs font-semibold text-gray-500">{summary}</span>
        </span>
      </summary>
      <div className="border-t border-gray-100 p-5">{children}</div>
    </details>
  );
}

/**
 * Route intelligence is something you study now and then, not every morning -
 * so it folds away by default and the daily money spine above it stays short.
 */
function RouteHealthSection({ report }: { report: RouteHealthReport }) {
  return (
    <details className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <summary className="cursor-pointer list-none">
        <span className="flex flex-col gap-1 md:flex-row md:items-baseline md:justify-between">
          <span>
            <span className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Route intelligence</span>
            <span className="ml-2 text-base font-bold text-navy">Which routes make money.</span>
          </span>
          <span className="text-xs text-gray-500">
            {report.routes.length} route{report.routes.length === 1 ? '' : 's'} · win rate and money at stake
          </span>
        </span>
      </summary>

      <div className="mt-3 flex justify-end">
        <Link to="/app/opportunities" className="shrink-0 rounded-full border border-blue-100 bg-blue-50 px-4 py-2 text-sm font-bold text-brand-blue">
          Open deals
        </Link>
      </div>

      {!report.hasEnoughData && (
        <p className="mt-4 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
          {report.lowDataMessage}
        </p>
      )}

      {report.routes.length === 0 ? (
        <p className="mt-4 rounded-lg bg-gray-50 px-3 py-3 text-sm text-gray-500">No deals yet - add opportunities to see which routes convert.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="text-xs font-bold uppercase tracking-wide text-gray-400">
                <th className="pb-2">Route</th>
                <th className="pb-2 text-right">Active</th>
                <th className="pb-2 text-right">Money at stake</th>
                <th className="pb-2 text-right">Win rate</th>
                <th className="pb-2 text-right">Won / Lost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {report.routes.map((route) => (
                <tr key={route.route}>
                  <td className="py-2.5 font-bold text-navy">{route.route}</td>
                  <td className="py-2.5 text-right font-semibold text-gray-700">{route.activeCount}</td>
                  <td className="py-2.5 text-right font-semibold text-gray-700">{formatBaseMoney(route.activeValueBase)}</td>
                  <td className="py-2.5 text-right">
                    {route.winRate === null ? (
                      <span className="text-xs font-semibold text-gray-400">Too few closed</span>
                    ) : (
                      <span className={`font-black ${route.winRate >= 0.5 ? 'text-emerald-700' : 'text-amber-700'}`}>{Math.round(route.winRate * 100)}%</span>
                    )}
                  </td>
                  <td className="py-2.5 text-right text-xs font-semibold text-gray-500">{route.wonCount} / {route.lostCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </details>
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
                <p className="max-w-[clamp(240px,18vw,460px)] truncate font-semibold text-gray-800" title={item.label}>{item.label}</p>
                <p className="mt-1 text-xs font-semibold text-gray-400">{item.source} / {item.status}</p>
              </td>
              <td className="whitespace-nowrap px-3 py-3 font-bold text-gray-800">{formatMoney(item.amount, item.currency)}</td>
              <td className="px-3 py-3">
                <Badge label={item.risk} tone={riskTone(item.risk)} />
                {/* The condition, not just the label. "Weak pipeline" is raised
                    by four unrelated field states and named none of them, so a
                    seller who edited the wrong one saw the flag survive a save
                    that was, from their side, exactly the fix. */}
                {item.reason && (
                  <p className="mt-1.5 max-w-[280px] text-xs leading-5 text-gray-500">{item.reason}</p>
                )}
              </td>
              <td className="px-3 py-3">
                <p className="max-w-[clamp(260px,19vw,480px)] truncate text-gray-700" title={item.nextAction}>{item.nextAction}</p>
                {item.clearedBy && (
                  <p className="mt-1 max-w-[280px] text-xs leading-5 text-brand-blue">{item.clearedBy}</p>
                )}
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

function MoneyOutSection({
  quotes,
  expenses,
  onExpensesChanged,
}: {
  quotes: QuoteRecord[];
  expenses: ExpenseRecord[];
  onExpensesChanged: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(() => ({ ...emptyExpenseInput }));

  const obligations = useMemo(() => buildOwnObligations({ quotes, expenses }), [quotes, expenses]);

  const handleAdd = () => {
    if (!form.label.trim() || form.amount === null) return;
    createExpense({ ...form, source: 'user', isSample: false });
    setForm({ ...emptyExpenseInput });
    setShowForm(false);
    onExpensesChanged();
  };

  const recent = [...expenses].sort((a, b) => (b.expenseDate || '').localeCompare(a.expenseDate || '')).slice(0, 6);

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-amber-600" />
            <h2 className="text-lg font-bold text-navy">Costs &amp; what you owe</h2>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            Log costs and track the payments you owe. Every settled cost flows straight into the P&amp;L above.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((open) => !open)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-navy px-3 py-2 text-sm font-bold text-white hover:bg-navy/90"
        >
          <Plus className="h-4 w-4" />
          Log expense
        </button>
      </div>

      {showForm && (
        <div className="mt-4 grid gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 md:grid-cols-2 xl:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wide text-gray-500">
            What
            <input
              value={form.label}
              onChange={(event) => setForm((prev) => ({ ...prev, label: event.target.value }))}
              placeholder="e.g. Reagent restock"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-navy outline-none focus:border-brand-blue"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wide text-gray-500">
              Amount
              <input
                inputMode="numeric"
                value={form.amount ?? ''}
                onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value === '' ? null : Number(event.target.value.replace(/,/g, '')) }))}
                placeholder="0"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-navy outline-none focus:border-brand-blue"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wide text-gray-500">
              Currency
              <select
                value={form.currency}
                onChange={(event) => setForm((prev) => ({ ...prev, currency: event.target.value }))}
                className="rounded-lg border border-gray-300 px-2 py-2 text-sm font-medium text-navy outline-none focus:border-brand-blue"
              >
                {listSelectableCurrencies().map(({ code }) => <option key={code} value={code}>{code}</option>)}
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wide text-gray-500">
            Category
            <select
              value={form.category}
              onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value as ExpenseRecord['category'] }))}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-navy outline-none focus:border-brand-blue"
            >
              {expenseCategories.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wide text-gray-500">
              Status
              <select
                value={form.status}
                onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value as ExpenseRecord['status'] }))}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-navy outline-none focus:border-brand-blue"
              >
                <option value="Paid">Paid</option>
                <option value="Upcoming">Upcoming</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wide text-gray-500">
              {form.status === 'Upcoming' ? 'Due date' : 'Date'}
              <input
                type="date"
                value={form.status === 'Upcoming' ? form.dueDate : form.expenseDate}
                onChange={(event) => setForm((prev) => (prev.status === 'Upcoming'
                  ? { ...prev, dueDate: event.target.value }
                  : { ...prev, expenseDate: event.target.value }))}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-navy outline-none focus:border-brand-blue"
              />
            </label>
          </div>
          <div className="flex items-end gap-2">
            <button type="button" onClick={handleAdd} className="rounded-lg bg-navy px-4 py-2 text-sm font-bold text-white hover:bg-navy/90 disabled:opacity-50" disabled={!form.label.trim() || form.amount === null}>
              Save expense
            </button>
            <button type="button" onClick={() => { setShowForm(false); setForm({ ...emptyExpenseInput }); }} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>
      )}

      {obligations.obligations.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wide text-amber-700">Obligations you owe</p>
            {obligations.overdue.length > 0 && (
              <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-700">{obligations.overdue.length} overdue</span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-gray-400">Payments and deliveries you committed to — silence here costs more than a cold deal.</p>
          <div className="mt-2 space-y-1.5">
            {obligations.obligations.slice(0, 8).map((obligation) => {
              const expenseId = obligation.kind === 'Payment' ? obligation.id.replace('obligation-pay-', '') : '';
              const expense = expenseId ? expenses.find((item) => item.id === expenseId) : undefined;
              const tone = obligation.status === 'Overdue'
                ? 'border-red-200 bg-red-50/60'
                : obligation.status === 'Due soon'
                  ? 'border-amber-100 bg-amber-50/50'
                  : 'border-gray-100 bg-gray-50';
              return (
                <div key={obligation.id} className={`flex flex-col gap-1 rounded-lg border ${tone} px-3 py-2 text-xs sm:flex-row sm:items-center sm:justify-between`}>
                  <div>
                    <p className="font-bold text-gray-900">
                      <span className="mr-1.5 rounded bg-white/70 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-500">{obligation.kind}</span>
                      {obligation.label}
                    </p>
                    <p className="mt-0.5 font-semibold text-gray-600">
                      {obligation.counterparty}
                      {typeof obligation.amount === 'number' ? ` · ${formatCurrencyAmount(obligation.amount, obligation.currency)}` : ''}
                      {obligation.dueDate ? ` · due ${obligation.dueDate}` : ' · no due date'}
                      {obligation.status === 'Overdue' && obligation.daysUntilDue !== null ? ` · ${Math.abs(obligation.daysUntilDue)}d overdue` : ''}
                    </p>
                  </div>
                  {expense && (
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => { markExpensePaid(expense); onExpensesChanged(); }} className="rounded-full bg-white px-3 py-1 font-bold text-emerald-700 ring-1 ring-emerald-100 hover:bg-emerald-50">Mark paid</button>
                      <button type="button" onClick={() => { deleteExpense(expense.id); onExpensesChanged(); }} className="rounded-full p-1 text-gray-400 hover:bg-white hover:text-red-600" title="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {recent.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-center text-sm text-gray-500">
          No expenses logged yet. Log one cost and the profit line becomes real.
        </p>
      ) : (
        // The cost log is a receipt, not a decision - what you owe stays open
        // above it, the ledger folds away.
        <details className="mt-4">
          <summary className="cursor-pointer text-xs font-bold uppercase tracking-wide text-gray-500">
            Recent expenses ({recent.length})
          </summary>
          <div className="mt-2 max-w-full overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="text-[11px] font-bold uppercase tracking-wide text-gray-400">
              <tr>
                <th className="pb-2">Expense</th>
                <th className="pb-2">Category</th>
                <th className="pb-2 text-right">Amount</th>
                <th className="pb-2">Status</th>
                <th className="pb-2 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {recent.map((expense) => (
                <tr key={expense.id}>
                  <td className="py-2.5 font-semibold text-navy">{expense.label}</td>
                  <td className="py-2.5 text-gray-600">{expense.category}</td>
                  <td className="py-2.5 text-right font-bold text-gray-800">{formatCurrencyAmount(expense.amount, expense.currency)}</td>
                  <td className="py-2.5"><Badge label={expense.status} tone={expense.status === 'Paid' ? 'green' : 'amber'} /></td>
                  <td className="py-2.5 text-right">
                    <button type="button" onClick={() => { deleteExpense(expense.id); onExpensesChanged(); }} className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-red-600" title="Delete"><Trash2 className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </details>
      )}
    </section>
  );
}

/**
 * The empty room, described as the room it is.
 *
 * It used to say "Create a quote or update pipeline" and send people to
 * /app/quotes - a title in the voice of the old Revenue View, offering two
 * doors and explaining neither. This page is the order book now: it follows
 * what happens to a deal after it is won, and the thing that fills it is a won
 * deal, so that is what it says and where it points.
 */
function RevenueEmptyState() {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-brand-blue">
        <ReceiptText className="h-6 w-6" />
      </div>
      <h2 className="mt-4 text-xl font-bold text-navy">No orders yet.</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-gray-500">
        An order appears here the moment a deal is won, and stays until the money is in - confirmation, deposit,
        delivery, invoice, payment. Nothing to set up: mark a deal Won on Opportunities and it arrives.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Link to="/app/opportunities" className="rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">Open opportunities</Link>
        <Link to="/app/quotes" className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700">Write a quote instead</Link>
      </div>
    </section>
  );
}

function RevenueMetric({ label, value, tone, detail }: {
  label: string;
  value: string | number;
  tone: 'blue' | 'green' | 'amber' | 'red';
  /** One line saying what the figure counts, for tiles that can read alike. */
  detail?: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm">
      <p className="truncate text-[10px] font-bold uppercase tracking-wide text-gray-400" title={label}>{label}</p>
      <p className={`text-lg font-bold leading-tight ${textToneClass(tone)}`}>{value}</p>
      {detail && <p className="mt-0.5 text-[10px] leading-tight text-gray-500">{detail}</p>}
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

function textToneClass(tone: 'blue' | 'green' | 'amber' | 'red') {
  return {
    blue: 'text-navy',
    green: 'text-emerald-700',
    amber: 'text-amber-700',
    red: 'text-red-700',
  }[tone];
}
