import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity as ActivityIcon,
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Link2Off,
  Plus,
  Radar,
  Search,
  X,
} from 'lucide-react';
import { useAuthContext } from '../../auth/authContext';
import { hasLocalSampleData } from '../../utils/dataMode';
import { getCachedSalesWorkspaceData, loadSalesWorkspaceData } from '../../services/workspaceData';
import { loadAccounts, type AccountMemoryRecord } from '../../services/accountStore';
import { loadPlanItemsForWorkspace, PLAN_ITEMS_UPDATED_EVENT } from '../../services/planItemStore';
import { loadSupplierCommitmentsForWorkspace } from '../../services/supplierCommitmentStore';
import type { CrmLiteOpportunity } from '../../services/opportunityStore';
import type { SalesActivityRecord } from '../../services/salesActivityStore';
import type { QuoteRecord } from '../../services/quoteStore';
import type { ExpenseRecord } from '../../services/expenseStore';
import type { AccountMergeRecord } from '../../services/accountMergeStore';
import type { PlanRecord } from '../../utils/weeklyPlan';
import { buildAccountAliasIndex } from '../../utils/accountAliases';
import { buildOwnObligations } from '../../utils/ownObligations';
import { supplierCommitmentsAsOwnObligations, type SupplierCommitmentRecord } from '../../utils/supplierCommitments';
import {
  buildActivityLedger,
  relationTypeLabel,
  type ActivityEntry,
  type ActivityRelationType,
} from '../../utils/activityLedger';
import {
  activitySubjectKey,
  buildActivityAnalytics,
  domainBarColor,
  relationColor,
  type SubjectRow,
} from '../../utils/activityAnalytics';
import { buildActivityPivot, keyOf, type ActivityDimension } from '../../utils/activityPivot';
import { businessDomains, type BusinessDomain } from '../../utils/businessDomain';
import { formatSafeBusinessDate, todayDateKey } from '../../utils/safeDate.ts';
import { MiniBarChart } from '../../components/charts/MiniBarChart';
import { SegmentBar } from '../../components/charts/SegmentBar';
import { FunnelBars } from '../../components/charts/FunnelBars';
import { SkeletonCard, SkeletonScreen } from '../../components/common/Skeleton';
import { ActivityHeatmap } from './ActivityHeatmap';
import { ActivityPivotTable } from './ActivityPivotTable';
import { ActivityStream, SubjectChip } from './ActivityStream';
import { ActivityTable } from './ActivityTable';
import { ActivityDetailDrawer } from './ActivityDetailDrawer';

/**
 * Activity: the calendar, read as a business.
 *
 * Timeline answers "when". This answers "for whom, and did it add up to
 * anything" - and those turn out to be different products built on the same
 * rows. The structure is Salesforce's, because Salesforce got the hard part
 * right twenty years ago: an activity is not a diary entry, it is a record
 * pointing at exactly one other record, and the moment you make that pointer
 * typed you can pivot a year of work by what it served.
 *
 * See `src/utils/activityLedger.ts` for the mapping. Three properties of this
 * page matter more than any chart on it:
 *
 *   - Nothing here is stored. Every number is derived from records other
 *     surfaces own, so this page cannot drift from the money spine, and it
 *     cannot be "wrong" in isolation.
 *   - Every number opens. Cells, bars and chips all filter the ledger below,
 *     because a figure an operator cannot interrogate is a figure they stop
 *     believing the first time it surprises them.
 *   - The empty and the unlinked are drawn as loudly as the busy. A deal with
 *     no activity, and a customer name attached to nothing, are the two most
 *     expensive things in a week, and both are invisible on a calendar.
 */

type PeriodId = 'week' | 'month' | 'd30' | 'd90';

/**
 * Two shapes over one set of rows. Stream groups by state then by day, which is
 * how a week reads; List is a sortable record list, which is how you look one
 * thing up. Neither is a different query - both render `visibleEntries`.
 */
type LedgerView = 'stream' | 'list';

const periods: { id: PeriodId; label: string; days: number; hint: string }[] = [
  { id: 'week', label: 'This week', days: 7, hint: 'Monday to Sunday.' },
  { id: 'month', label: 'This month', days: 0, hint: 'The calendar month so far.' },
  { id: 'd30', label: 'Last 30 days', days: 30, hint: 'A rolling month, ending today.' },
  { id: 'd90', label: 'Last 90 days', days: 90, hint: 'A rolling quarter - enough to see a trend.' },
];

/** A pivot cell or a chart bar, held as "show me the rows behind this". */
type LedgerFocus =
  | { kind: 'pivot'; rowDimension: ActivityDimension; rowKey: string; columnDimension: ActivityDimension; columnKey: string; label: string }
  | { kind: 'subject'; subjectKey: string; label: string }
  | { kind: 'day'; date: string; label: string }
  | null;

export function ActivityPage() {
  const { user } = useAuthContext();
  const sampleDataActive = hasLocalSampleData();
  const dataUserId = sampleDataActive ? undefined : user?.id;

  const [activities, setActivities] = useState<SalesActivityRecord[]>([]);
  const [opportunities, setOpportunities] = useState<CrmLiteOpportunity[]>([]);
  const [accounts, setAccounts] = useState<AccountMemoryRecord[]>([]);
  const [quotes, setQuotes] = useState<QuoteRecord[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [accountMerges, setAccountMerges] = useState<AccountMergeRecord[]>([]);
  const [supplierCommitments, setSupplierCommitments] = useState<SupplierCommitmentRecord[]>([]);
  const [planRecords, setPlanRecords] = useState<PlanRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [period, setPeriod] = useState<PeriodId>('d30');
  const [rowDimension, setRowDimension] = useState<ActivityDimension>('relatedTo');
  const [columnDimension, setColumnDimension] = useState<ActivityDimension>('week');
  const [focus, setFocus] = useState<LedgerFocus>(null);
  const [relationFilter, setRelationFilter] = useState<ActivityRelationType | 'all'>('all');
  const [domainFilter, setDomainFilter] = useState<BusinessDomain | 'all'>('all');
  const [search, setSearch] = useState('');
  const [ledgerView, setLedgerView] = useState<LedgerView>('stream');
  const [selectedEntry, setSelectedEntry] = useState<ActivityEntry | null>(null);

  const refresh = useCallback(async () => {
    const cached = getCachedSalesWorkspaceData(dataUserId);
    if (cached) {
      setActivities(cached.activities);
      setOpportunities(cached.opportunities);
      setQuotes(cached.quotes);
      setExpenses(cached.expenses);
      setAccountMerges(cached.accountMerges);
      setLoading(false);
    } else {
      setLoading(true);
      const workspace = await loadSalesWorkspaceData(dataUserId);
      setActivities(workspace.activities);
      setOpportunities(workspace.opportunities);
      setQuotes(workspace.quotes);
      setExpenses(workspace.expenses);
      setAccountMerges(workspace.accountMerges);
      setLoading(false);
    }

    setAccounts(await loadAccounts(dataUserId));
    setPlanRecords(await loadPlanItemsForWorkspace(dataUserId, sampleDataActive));
    setSupplierCommitments(await loadSupplierCommitmentsForWorkspace(dataUserId, sampleDataActive));
  }, [dataUserId, sampleDataActive]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Ticking a box on Today or the plan board changes what this page says about
  // follow-through, so it listens rather than going stale until a reload.
  useEffect(() => {
    const onPlanItems = () => {
      void loadPlanItemsForWorkspace(dataUserId, sampleDataActive).then(setPlanRecords);
    };
    window.addEventListener(PLAN_ITEMS_UPDATED_EVENT, onPlanItems);
    return () => window.removeEventListener(PLAN_ITEMS_UPDATED_EVENT, onPlanItems);
  }, [dataUserId, sampleDataActive]);

  const today = todayDateKey();
  const range = useMemo(() => rangeFor(period, today), [period, today]);
  const previousRange = useMemo(() => previousRangeFor(range), [range]);
  const accountAliases = useMemo(() => buildAccountAliasIndex(accountMerges), [accountMerges]);

  const obligations = useMemo(
    () => buildOwnObligations({
      expenses,
      quotes,
      supplierObligations: supplierCommitmentsAsOwnObligations({ records: supplierCommitments }),
    }).obligations,
    [expenses, quotes, supplierCommitments],
  );

  const ledgerInput = useMemo(() => ({
    activities,
    planRecords,
    opportunities,
    accounts,
    obligations,
    accountAliases,
    today,
  }), [accountAliases, accounts, activities, obligations, opportunities, planRecords, today]);

  const entries = useMemo(
    () => buildActivityLedger({ ...ledgerInput, range }),
    [ledgerInput, range],
  );
  const previousEntries = useMemo(
    () => buildActivityLedger({ ...ledgerInput, range: previousRange }),
    [ledgerInput, previousRange],
  );
  // Recency questions need every record ever, not the window - a customer last
  // touched in March looks identical to one never touched if you only look at July.
  //
  // "Every record ever" was written as 2000-01-01 to 2100-12-31, which is not
  // free: the ledger walks the plan board a month at a time, so a century-wide
  // range built twelve years of calendar (its own guard rail) whether or not a
  // single record fell in it. The range is now the span the records actually
  // occupy, which is the same answer over far less empty calendar.
  const allTimeRange = useMemo(() => {
    const dates = [
      ...activities.map((activity) => activity.activityDate),
      ...planRecords.map((record) => record.date),
      ...opportunities.map((opportunity) => opportunity.nextActionDate),
      ...obligations.map((obligation) => obligation.dueDate),
    ].filter((date) => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date));

    if (dates.length === 0) return { start: today, end: today };
    const sorted = [...dates].sort();
    // Today is always inside it: "nothing at all this period" is measured
    // against now, not against the last record somebody happened to enter.
    return {
      start: sorted[0] < today ? sorted[0] : today,
      end: sorted[sorted.length - 1] > today ? sorted[sorted.length - 1] : today,
    };
  }, [activities, obligations, opportunities, planRecords, today]);

  const allEntries = useMemo(
    () => buildActivityLedger({ ...ledgerInput, range: allTimeRange }),
    [allTimeRange, ledgerInput],
  );

  const analytics = useMemo(
    () => buildActivityAnalytics({
      entries,
      previousEntries,
      allEntries,
      range,
      opportunities,
      accounts,
      accountAliases,
      today,
    }),
    [accountAliases, accounts, allEntries, entries, opportunities, previousEntries, range, today],
  );

  const pivot = useMemo(
    () => buildActivityPivot(entries, rowDimension, columnDimension),
    [columnDimension, entries, rowDimension],
  );

  // The stream reflects the filters and whatever was last clicked, so the
  // numbers above it are always openable rather than decorative.
  const visibleEntries = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return entries.filter((entry) => {
      if (relationFilter !== 'all' && entry.relatedTo.type !== relationFilter) return false;
      if (domainFilter !== 'all' && entry.domain !== domainFilter) return false;
      if (needle && !`${entry.subject} ${entry.relatedTo.name} ${entry.who} ${entry.type}`.toLowerCase().includes(needle)) return false;
      if (!focus) return true;
      if (focus.kind === 'day') return entry.date === focus.date;
      if (focus.kind === 'subject') return activitySubjectKey(entry) === focus.subjectKey;
      return keyOf(entry, focus.rowDimension) === focus.rowKey
        && keyOf(entry, focus.columnDimension) === focus.columnKey;
    });
  }, [domainFilter, entries, focus, relationFilter, search]);

  if (loading) {
    return (
      <SkeletonScreen label="Reading your activity">
        <div className="w-full space-y-4 px-4 py-5 sm:px-5 lg:px-6">
          <SkeletonCard />
          <SkeletonCard lines={5} />
        </div>
      </SkeletonScreen>
    );
  }

  // Nothing has ever been dated in this workspace - not in this period, in any
  // of them. Everything below computes correctly on an empty set and draws a
  // wall of zeros, em-dashes and "0% attached", which reads as a verdict on the
  // operator rather than as an empty room. One sentence and one way in instead.
  if (allEntries.length === 0) {
    return <ActivityEmptyState />;
  }

  const activePeriod = periods.find((option) => option.id === period);
  const filtersActive = relationFilter !== 'all' || domainFilter !== 'all' || Boolean(search.trim()) || Boolean(focus);
  // Both ledger shapes say the same thing when they have nothing to show, so
  // the wording lives in one place rather than drifting between them.
  const ledgerEmptyMessage = entries.length === 0
    ? 'Nothing dated in this period. Capture a touch, or plan a day on Plan, and it appears here attached to whoever it was for.'
    : 'No rows match these filters.';

  return (
    <div className="flex w-full flex-col gap-4 px-4 py-5 sm:px-5 lg:px-6">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ActivityIcon className="h-5 w-5 text-brand-blue" />
            <h1 className="text-2xl font-bold tracking-tight text-navy">Activity</h1>
          </div>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-600">
            Every dated thing in the workspace, each one resolved to the single customer, deal, line or domain it was
            for. The calendar says when; this says who it was for and whether it added up.
          </p>
        </div>
        <Link
          to="/app/capture?mode=quick"
          className="inline-flex items-center gap-1.5 self-start rounded-full bg-navy px-4 py-2 text-sm font-bold text-white hover:bg-navy/90"
        >
          <Plus className="h-4 w-4" />
          Capture
        </Link>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-full border border-gray-200 bg-gray-50 p-1" role="tablist" aria-label="Period">
          {periods.map((option) => (
            <button
              key={option.id}
              type="button"
              role="tab"
              aria-selected={period === option.id}
              onClick={() => { setPeriod(option.id); setFocus(null); }}
              className={`rounded-full px-3.5 py-1.5 text-sm font-bold transition ${
                period === option.id ? 'bg-navy text-white' : 'text-gray-600 hover:bg-white'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-500">
          {formatSafeBusinessDate(range.start)} – {formatSafeBusinessDate(range.end)}
          {activePeriod ? ` · ${activePeriod.hint}` : ''}
        </span>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <p className="text-sm leading-6 text-gray-700">{analytics.headline}</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Tile label="Dated items">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-navy">{analytics.total}</span>
              <MomentumBadge
                direction={analytics.momentum.direction}
                deltaPct={analytics.momentum.deltaPct}
              />
            </div>
            <p className="mt-0.5 text-[11px] text-gray-500">
              {analytics.touches} captured {analytics.touches === 1 ? 'touch' : 'touches'} · {analytics.tasks} dated work
              {analytics.perActiveDay !== null ? ` · ${analytics.perActiveDay}/active day` : ''}
            </p>
          </Tile>

          <Tile label="Attached to something">
            {analytics.attachment.rate === null ? (
              <>
                <span className="text-2xl font-bold text-gray-400">—</span>
                <p className="mt-0.5 text-[11px] text-gray-500">Nothing in this period named a customer or a line.</p>
              </>
            ) : (
              <>
                <div className="flex items-baseline gap-2">
                  <span className={`text-2xl font-black ${analytics.attachment.rate >= 0.7 ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {Math.round(analytics.attachment.rate * 100)}%
                  </span>
                  <span className="text-xs font-semibold text-gray-500">
                    {analytics.attachment.attached}/{analytics.attachment.attached + analytics.attachment.unresolved}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-gray-500">
                  of the work that named someone reaches a real record.
                  {analytics.attachment.internal > 0 ? ` ${analytics.attachment.internal} internal excluded.` : ''}
                </p>
              </>
            )}
          </Tile>

          <Tile label="Follow-through">
            {analytics.followThrough.rate === null ? (
              <>
                <span className="text-2xl font-bold text-gray-400">—</span>
                <p className="mt-0.5 text-[11px] text-gray-500">
                  {analytics.followThrough.ahead > 0
                    ? `${analytics.followThrough.ahead} dated ${analytics.followThrough.ahead === 1 ? 'item' : 'items'} ahead of their day.`
                    : 'No dated work has come due in this period.'}
                </p>
              </>
            ) : (
              <>
                <div className="flex items-baseline gap-2">
                  <span className={`text-2xl font-black ${analytics.followThrough.rate >= 0.6 ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {Math.round(analytics.followThrough.rate * 100)}%
                  </span>
                  <span className="text-xs font-semibold text-gray-500">
                    {analytics.followThrough.done}/{analytics.followThrough.settled} due
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-gray-500">
                  closed of what came due
                  {analytics.followThrough.overdue > 0 ? ` · ${analytics.followThrough.overdue} overdue` : ''}
                  {analytics.followThrough.ahead > 0 ? ` · ${analytics.followThrough.ahead} ahead` : ''}
                </p>
              </>
            )}
          </Tile>

          <Tile label="Concentration">
            {analytics.concentration === null ? (
              <>
                <span className="text-2xl font-bold text-gray-400">—</span>
                <p className="mt-0.5 text-[11px] text-gray-500">Too few items to call a pattern.</p>
              </>
            ) : (
              <>
                <span className="text-2xl font-black text-navy">{Math.round(analytics.concentration * 100)}%</span>
                <p className="mt-0.5 text-[11px] text-gray-500">
                  of the period went to its three biggest subjects
                  {analytics.subjects.length > 0 ? ` (${analytics.subjects.slice(0, 3).map((subject) => subject.name).join(', ')})` : ''}
                </p>
              </>
            )}
          </Tile>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-3">
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm xl:col-span-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-bold text-navy">Rhythm</h2>
            <span className="text-xs text-gray-500">
              {analytics.activeDays} active {analytics.activeDays === 1 ? 'day' : 'days'}
              {analytics.busiestDay ? ` · busiest ${formatSafeBusinessDate(analytics.busiestDay.date)}` : ''}
              {' · click a day to filter'}
            </span>
          </div>
          <div className="mt-3">
            <ActivityHeatmap
              days={analytics.heatmap}
              selectedDate={focus?.kind === 'day' ? focus.date : ''}
              onSelectDay={(date) => setFocus(
                date ? { kind: 'day', date, label: formatSafeBusinessDate(date) } : null,
              )}
            />
          </div>

          {analytics.weekTrend.length > 1 && (
            <div className="mt-5 border-t border-gray-100 pt-4">
              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Per week, done in solid</p>
              <div className="mt-2">
                <MiniBarChart
                  ariaLabel="Activity per week"
                  height={96}
                  items={analytics.weekTrend.map((week) => ({
                    label: formatSafeBusinessDate(week.weekStart).slice(0, 6),
                    value: week.done,
                    secondaryValue: week.count,
                    valueText: `${week.done} done`,
                    secondaryText: `${week.count} total`,
                  }))}
                />
              </div>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-navy">Who it was for</h2>
          <p className="mt-1 text-xs text-gray-500">
            Salesforce calls this the related record. Here it is the difference between work that reaches the business
            and work that does not.
          </p>
          <div className="mt-3">
            <SegmentBar
              ariaLabel="Activity by subject type"
              segments={analytics.relationMix.map((row) => ({
                label: row.label,
                value: row.count,
                color: relationColor(row.key as ActivityRelationType),
                detail: `${Math.round(row.share * 100)}%`,
              }))}
            />
          </div>

          <div className="mt-5 border-t border-gray-100 pt-4">
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Business domain</p>
            <div className="mt-2">
              <SegmentBar
                ariaLabel="Activity by business domain"
                segments={analytics.domainMix.map((row) => ({
                  label: row.label,
                  value: row.count,
                  color: domainBarColor(row.key as BusinessDomain),
                  detail: `${Math.round(row.share * 100)}%`,
                }))}
              />
            </div>
          </div>

          <div className="mt-5 border-t border-gray-100 pt-4">
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Shape of the week</p>
            <div className="mt-2">
              <MiniBarChart
                ariaLabel="Activity by weekday"
                height={72}
                items={[1, 2, 3, 4, 5, 6, 0].map((weekday) => {
                  const row = analytics.weekdayShape.find((entry) => entry.weekday === weekday);
                  // Full weekday names, not initials: "T" and "S" each name two
                  // days, and MiniBarChart keys its bars by label.
                  return { label: row?.label || String(weekday), value: row?.count || 0, valueText: `${row?.count || 0}` };
                })}
              />
            </div>
          </div>
        </section>
      </div>

      <ActivityPivotTable
        pivot={pivot}
        onChangeRows={(dimension) => { setRowDimension(dimension); setFocus(null); }}
        onChangeColumns={(dimension) => { setColumnDimension(dimension); setFocus(null); }}
        selected={focus?.kind === 'pivot' ? { rowKey: focus.rowKey, columnKey: focus.columnKey } : null}
        onSelectCell={({ rowKey, columnKey }) => {
          const isSame = focus?.kind === 'pivot' && focus.rowKey === rowKey && focus.columnKey === columnKey;
          if (isSame) {
            setFocus(null);
            return;
          }
          const rowLabel = pivot.rows.find((row) => row.key === rowKey)?.label || rowKey;
          const columnLabel = pivot.columns.find((column) => column.key === columnKey)?.label || columnKey;
          setFocus({
            kind: 'pivot',
            rowDimension,
            rowKey,
            columnDimension,
            columnKey,
            label: `${rowLabel} × ${columnLabel}`,
          });
        }}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <SubjectLeaderboard
          subjects={analytics.subjects}
          selectedKey={focus?.kind === 'subject' ? focus.subjectKey : ''}
          onSelect={(subject) => setFocus(
            focus?.kind === 'subject' && focus.subjectKey === subject.key
              ? null
              : { kind: 'subject', subjectKey: subject.key, label: subject.name },
          )}
        />

        <div className="flex flex-col gap-4">
          <UnresolvedPanel subjects={analytics.unresolvedSubjects} />
          <GapsPanel
            silent={analytics.silentSubjects}
            gaps={analytics.coverageGaps}
            periodLabel={activePeriod?.label.toLowerCase() || 'this period'}
          />
          {analytics.typeMix.length > 1 && (
            <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold text-navy">What kind of work</h2>
              <p className="mt-1 text-xs text-gray-500">Captured touch types and the four things that put work on a day.</p>
              <div className="mt-3">
                <FunnelBars
                  ariaLabel="Activity by type"
                  rows={analytics.typeMix.slice(0, 8).map((row) => ({
                    label: row.label,
                    value: row.count,
                    valueText: String(row.count),
                    countText: `${Math.round(row.share * 100)}%`,
                  }))}
                />
              </div>
            </section>
          )}
        </div>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-navy">The ledger</h2>
            <p className="mt-1 text-sm text-gray-600">
              {visibleEntries.length === entries.length
                ? `All ${entries.length} dated ${entries.length === 1 ? 'item' : 'items'} in this period.`
                : `${visibleEntries.length} of ${entries.length} shown.`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Two shapes over the same rows. Stream is grouped by state and
                then by day, which is how you read a week; List is a sortable
                record list, which is how you look one thing up. */}
            <div className="inline-flex rounded-lg border border-gray-200 p-0.5" role="group" aria-label="Ledger view">
              {(['stream', 'list'] as LedgerView[]).map((view) => (
                <button
                  key={view}
                  type="button"
                  onClick={() => setLedgerView(view)}
                  aria-pressed={ledgerView === view}
                  className={`rounded-md px-3 py-1.5 text-xs font-bold capitalize ${
                    ledgerView === view ? 'bg-navy text-white' : 'text-gray-600 hover:text-navy'
                  }`}
                >
                  {view}
                </button>
              ))}
            </div>
            <label className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search subject, customer, person"
                className="w-64 rounded-lg border border-gray-200 py-2 pl-8 pr-3 text-sm focus:border-brand-blue focus:outline-none"
              />
            </label>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <FilterChip active={relationFilter === 'all'} onClick={() => setRelationFilter('all')}>
            All subjects
          </FilterChip>
          {(['opportunity', 'account', 'brand', 'internal', 'unresolved'] as ActivityRelationType[])
            .filter((type) => analytics.relationMix.some((row) => row.key === type))
            .map((type) => (
              <FilterChip key={type} active={relationFilter === type} onClick={() => setRelationFilter(type)}>
                {relationTypeLabel(type)}
              </FilterChip>
            ))}

          <span className="mx-1 h-4 w-px bg-gray-200" />

          <FilterChip active={domainFilter === 'all'} onClick={() => setDomainFilter('all')}>
            All domains
          </FilterChip>
          {businessDomains
            .filter((domain) => analytics.domainMix.some((row) => row.key === domain))
            .map((domain) => (
              <FilterChip key={domain} active={domainFilter === domain} onClick={() => setDomainFilter(domain)}>
                {domain}
              </FilterChip>
            ))}
        </div>

        {filtersActive && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2 text-xs font-semibold text-brand-blue">
            {focus && <span>Focused on {focus.label}</span>}
            {!focus && <span>Filtered</span>}
            <button
              type="button"
              onClick={() => { setFocus(null); setRelationFilter('all'); setDomainFilter('all'); setSearch(''); }}
              className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 font-bold text-gray-600 hover:text-navy"
            >
              <X className="h-3 w-3" />
              Clear
            </button>
          </div>
        )}

        <div className="mt-4">
          {ledgerView === 'stream' ? (
            <ActivityStream entries={visibleEntries} emptyMessage={ledgerEmptyMessage} onSelect={setSelectedEntry} />
          ) : (
            <ActivityTable entries={visibleEntries} emptyMessage={ledgerEmptyMessage} onSelect={setSelectedEntry} />
          )}
        </div>
      </section>

      {selectedEntry && (
        <ActivityDetailDrawer entry={selectedEntry} onClose={() => setSelectedEntry(null)} />
      )}
    </div>
  );
}

function SubjectLeaderboard({
  subjects,
  selectedKey,
  onSelect,
}: {
  subjects: SubjectRow[];
  selectedKey: string;
  onSelect: (subject: SubjectRow) => void;
}) {
  const rows = subjects.slice(0, 10);
  const max = Math.max(...rows.map((row) => row.count), 1);

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold text-navy">Where the period went</h2>
      <p className="mt-1 text-xs text-gray-500">
        Ranked by items. The bar splits done from still-open, so a big bar that is mostly hollow is a subject you keep
        planning for and never reach.
      </p>

      {rows.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
          Nothing to rank yet.
        </p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {rows.map((subject) => (
            <li key={subject.key}>
              <button
                type="button"
                onClick={() => onSelect(subject)}
                className={`w-full rounded-lg border px-2.5 py-2 text-left transition ${
                  selectedKey === subject.key ? 'border-navy bg-blue-50/50' : 'border-transparent hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <SubjectChip relation={{ type: subject.type, name: subject.name, href: subject.href }} />
                    <span className="truncate text-[11px] text-gray-400">
                      last {subject.daysSinceLast === 0 ? 'today' : `${subject.daysSinceLast}d ago`}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-bold text-navy">
                    {subject.count}
                    <span className="ml-1.5 text-[11px] font-semibold text-gray-400">
                      · {Math.round(subject.share * 100)}%
                    </span>
                  </span>
                </div>
                <div className="mt-1.5 flex h-2 w-full overflow-hidden rounded-full bg-gray-100">
                  <span
                    className="bg-emerald-500"
                    style={{ width: `${(subject.done / max) * 100}%` }}
                    title={`${subject.done} done`}
                  />
                  <span
                    className="bg-amber-400"
                    style={{ width: `${(subject.open / max) * 100}%` }}
                    title={`${subject.open} open`}
                  />
                  <span
                    className="bg-red-400"
                    style={{ width: `${(subject.overdue / max) * 100}%` }}
                    title={`${subject.overdue} overdue`}
                  />
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * The panel this page was worth building for.
 *
 * These are names the operator wrote on a day - so they are real work, for real
 * people - that resolve to nothing in the workspace. None of it reaches a deal,
 * a quote, a forecast or the money spine, and on a calendar it is completely
 * indistinguishable from work that does.
 */
function UnresolvedPanel({ subjects }: { subjects: SubjectRow[] }) {
  if (subjects.length === 0) {
    return (
      <section className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-5">
        <div className="flex items-center gap-2">
          <Link2Off className="h-4 w-4 text-emerald-600" />
          <h2 className="text-sm font-bold text-emerald-900">Everything is attached</h2>
        </div>
        <p className="mt-1 text-xs text-emerald-800">
          Every named subject in this period points at an account, a deal or a line you carry.
        </p>
      </section>
    );
  }

  const total = subjects.reduce((sum, subject) => sum + subject.count, 0);

  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-5">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <h2 className="text-sm font-bold text-amber-900">
          {subjects.length} {subjects.length === 1 ? 'name' : 'names'} the workspace does not know ({total} items)
        </h2>
      </div>
      <p className="mt-1 text-xs leading-5 text-amber-800">
        You are working these already. None of it reaches a deal, a quote or the money spine, and none of it will show up
        in a forecast. Make one an account and its whole history joins the business.
      </p>
      <ul className="mt-3 space-y-1">
        {subjects.slice(0, 8).map((subject) => (
          <li key={subject.key} className="flex items-center justify-between gap-2 rounded-lg bg-white/70 px-2.5 py-1.5">
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold text-navy">{subject.name}</span>
              <span className="text-[11px] text-gray-500">
                {subject.count} {subject.count === 1 ? 'item' : 'items'} · last {formatSafeBusinessDate(subject.lastDate)}
              </span>
            </span>
            {/* Timeline > Upcoming already owns the one-click "create this account
                and link its whole week" flow, so this points there rather than
                growing a second way to create an account. */}
            <Link
              to="/app/timeline?view=upcoming"
              title={`Create an account for ${subject.name} on the plan board`}
              className="shrink-0 rounded-full bg-navy px-2.5 py-1 text-[11px] font-bold text-white hover:bg-navy/90"
            >
              Make an account
            </Link>
          </li>
        ))}
      </ul>
      {subjects.length > 8 && (
        <p className="mt-2 text-[11px] font-semibold text-amber-800">and {subjects.length - 8} more</p>
      )}
    </section>
  );
}

/**
 * The reverse of a calendar: what the period did not touch. An open deal with no
 * activity is the most expensive row on this page, and it is the one row that is
 * structurally invisible on a week view - because absence has no date.
 */
function GapsPanel({
  silent,
  gaps,
  periodLabel,
}: {
  silent: { name: string; type: ActivityRelationType; href: string; daysSinceLast: number }[];
  gaps: { name: string; href: string; reason: 'open deal' | 'account' }[];
  periodLabel: string;
}) {
  if (silent.length === 0 && gaps.length === 0) return null;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <Radar className="h-4 w-4 text-brand-blue" />
        <h2 className="text-lg font-bold text-navy">What went untouched</h2>
      </div>

      {silent.length > 0 && (
        <div className="mt-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Worked, then went quiet</p>
          <ul className="mt-1.5 space-y-1">
            {silent.map((subject) => (
              <li key={`${subject.type}-${subject.name}`} className="flex items-center justify-between gap-2 text-sm">
                <SubjectChip relation={{ type: subject.type, name: subject.name, href: subject.href }} />
                <span className="shrink-0 text-xs font-bold text-amber-700">{subject.daysSinceLast}d silent</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {gaps.length > 0 && (
        <div className="mt-4 border-t border-gray-100 pt-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
            Nothing at all {periodLabel}
          </p>
          <ul className="mt-1.5 space-y-1">
            {gaps.map((gap) => (
              <li key={gap.href} className="flex items-center justify-between gap-2 text-sm">
                <Link to={gap.href} className="min-w-0 truncate font-semibold text-gray-800 hover:text-brand-blue hover:underline">
                  {gap.name}
                </Link>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  gap.reason === 'open deal' ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  {gap.reason}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function ActivityEmptyState() {
  return (
    <div className="flex w-full flex-col gap-4 px-4 py-5 sm:px-5 lg:px-6">
      <header className="flex items-center gap-2">
        <ActivityIcon className="h-5 w-5 text-brand-blue" />
        <h1 className="text-2xl font-bold tracking-tight text-navy">Activity</h1>
      </header>
      <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center">
        <p className="text-base font-bold text-navy">Nothing dated yet.</p>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-gray-500">
          This page does not ask you to fill it in - it reads every dated thing you already have and works out who it
          was for. Capture one thing that happened with a customer and the first row appears here.
        </p>
        <Link
          to="/app/capture?mode=quick"
          className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-navy px-4 py-2 text-sm font-bold text-white hover:bg-navy/90"
        >
          <Plus className="h-4 w-4" />
          Capture something
        </Link>
      </div>
    </div>
  );
}

function MomentumBadge({ direction, deltaPct }: { direction: 'up' | 'down' | 'flat'; deltaPct: number | null }) {
  const Icon = direction === 'up' ? ArrowUpRight : direction === 'down' ? ArrowDownRight : ArrowRight;
  const tone = direction === 'up' ? 'text-emerald-600' : direction === 'down' ? 'text-red-600' : 'text-gray-500';
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-bold ${tone}`}>
      <Icon className="h-3.5 w-3.5" />
      {deltaPct === null ? 'new' : direction === 'flat' ? 'level' : `${Math.abs(deltaPct)}%`}
    </span>
  );
}

function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{label}</p>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-[11px] font-bold transition ${
        active ? 'border-navy bg-navy text-white' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
      }`}
    >
      {children}
    </button>
  );
}

function rangeFor(period: PeriodId, today: string) {
  const base = Date.parse(`${today}T00:00:00Z`);
  const dayMs = 86_400_000;

  if (period === 'week') {
    const weekday = new Date(base).getUTCDay();
    const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
    const start = new Date(base + mondayOffset * dayMs);
    return {
      start: start.toISOString().slice(0, 10),
      end: new Date(start.getTime() + 6 * dayMs).toISOString().slice(0, 10),
    };
  }

  if (period === 'month') {
    const now = new Date(base);
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
  }

  const days = period === 'd30' ? 30 : 90;
  return {
    start: new Date(base - (days - 1) * dayMs).toISOString().slice(0, 10),
    end: today,
  };
}

/**
 * The same number of days immediately before the range. Comparing a part-finished
 * week against a whole one is how a dashboard reports a collapse in effort every
 * Tuesday morning, so the previous window is measured to the same length rather
 * than to the same calendar boundary.
 */
function previousRangeFor(range: { start: string; end: string }) {
  const dayMs = 86_400_000;
  const start = Date.parse(`${range.start}T00:00:00Z`);
  const end = Date.parse(`${range.end}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return range;
  const length = Math.round((end - start) / dayMs) + 1;
  return {
    start: new Date(start - length * dayMs).toISOString().slice(0, 10),
    end: new Date(start - dayMs).toISOString().slice(0, 10),
  };
}
