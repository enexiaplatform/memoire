import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ChevronLeft, ChevronRight, Loader2, Plus, RotateCcw, X } from 'lucide-react';
import { useAuthContext } from '../../auth/authContext';
import { DataModePill } from '../../components/common/DataModePill';
import { hasLocalSampleData } from '../../utils/dataMode';
import { isSupabaseConfigured } from '../../lib/demoMode';
import { canUseSalesActivityCloudStore, type SalesActivityRecord } from '../../services/salesActivityStore';
import { getCachedSalesWorkspaceData, loadSalesWorkspaceData } from '../../services/workspaceData';
import { type CrmLiteOpportunity } from '../../services/opportunityStore';
import { type QuoteRecord } from '../../services/quoteStore';
import { type ExpenseRecord } from '../../services/expenseStore';
import { buildOwnObligations } from '../../utils/ownObligations';
import { buildPlanSuggestions, type PlanSuggestion } from '../../utils/planSuggestions';
import { PlanSuggestionsPanel } from './PlanSuggestionsPanel';
import {
  buildPlanBoard,
  buildPlanLinkOptions,
  createDerivedCompletionRecord,
  createDismissedSuggestionRecord,
  createPersonalPlanRecord,
  formatPlanRangeLabel,
  planKindTone,
  shiftPlanAnchor,
  type PlanItem,
  type PlanLinkOption,
  type PlanPeriod,
  type PlanRecord,
} from '../../utils/weeklyPlan';
import {
  deletePlanItem,
  loadPlanItemsForWorkspace,
  savePlanItem,
} from '../../services/planItemStore';
import { getWeeklyCommitmentForWeek, loadWeeklyCommitmentsForWorkspace } from '../../services/weeklyCommitmentStore';
import { getCurrentPipelineReviewWeekId } from '../../utils/pipelineReviewHabit';
import type { WeeklyCommitmentSnapshot } from '../../utils/weeklyCommitment';
import { trackProductEvent } from '../../utils/productAnalytics';
import { SkeletonCard, SkeletonScreen } from '../../components/common/Skeleton';

const periodOptions: { value: PlanPeriod; label: string }[] = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

/**
 * The week as days. Derived commitments and the operator's own work sit in the
 * same column, because that is how the week is actually lived - but they are
 * visibly different, and checking a derived item never writes back onto the
 * deal it came from.
 */
export function WeeklyPlanPage() {
  const { user, loading: authLoading, isAuthenticated } = useAuthContext();
  const [periodType, setPeriodType] = useState<PlanPeriod>('week');
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [activities, setActivities] = useState<SalesActivityRecord[]>([]);
  const [opportunities, setOpportunities] = useState<CrmLiteOpportunity[]>([]);
  const [quotes, setQuotes] = useState<QuoteRecord[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [records, setRecords] = useState<PlanRecord[]>([]);
  const [commitment, setCommitment] = useState<WeeklyCommitmentSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [composerDate, setComposerDate] = useState('');
  const [draft, setDraft] = useState('');
  const [draftLink, setDraftLink] = useState<PlanLinkOption | null>(null);
  const sampleDataActive = hasLocalSampleData();
  const dataUserId = sampleDataActive ? undefined : user?.id;

  useEffect(() => {
    trackProductEvent('weekly_plan_opened');
  }, []);

  const refresh = useCallback(async () => {
    const cached = getCachedSalesWorkspaceData(dataUserId);
    if (cached) {
      setActivities(cached.activities);
      setOpportunities(cached.opportunities);
      setQuotes(cached.quotes);
      setExpenses(cached.expenses);
      setLoading(false);
    } else {
      setLoading(true);
      const workspaceData = await loadSalesWorkspaceData(dataUserId);
      setActivities(workspaceData.activities);
      setOpportunities(workspaceData.opportunities);
      setQuotes(workspaceData.quotes);
      setExpenses(workspaceData.expenses);
      setLoading(false);
    }

    setRecords(await loadPlanItemsForWorkspace(dataUserId, sampleDataActive));
    const snapshots = await loadWeeklyCommitmentsForWorkspace(dataUserId, sampleDataActive);
    setCommitment(getWeeklyCommitmentForWeek(getCurrentPipelineReviewWeekId(), snapshots));
  }, [dataUserId, sampleDataActive]);

  useEffect(() => { void refresh(); }, [refresh]);

  const obligations = useMemo(
    () => buildOwnObligations({ expenses, quotes }).obligations,
    [expenses, quotes],
  );

  const board = useMemo(() => buildPlanBoard({
    periodType,
    anchorDate,
    opportunities,
    obligations,
    activities,
    records,
  }), [activities, anchorDate, obligations, opportunities, periodType, records]);

  // Every account name the workspace already knows, so a typed plan item can
  // link to the entity it belongs to instead of living as loose text.
  const knownAccountNames = useMemo(() => [
    ...opportunities.map((item) => item.accountName),
    ...activities.map((item) => item.linkedAccountName || item.accountName),
    ...quotes.map((item) => item.accountName),
  ], [activities, opportunities, quotes]);
  const draftLinkOptions = useMemo(() => (
    draftLink ? [] : buildPlanLinkOptions({ draft, opportunities, accountNames: knownAccountNames })
  ), [draft, draftLink, knownAccountNames, opportunities]);

  const toggleItem = useCallback((item: PlanItem) => {
    if (item.kind === 'personal') {
      const existing = records.find((record) => record.id === item.id);
      if (!existing) return;
      setRecords(savePlanItem({
        ...existing,
        done: !existing.done,
        doneAt: existing.done ? undefined : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));
      return;
    }

    const existing = records.find((record) => record.derivedKey === item.derivedKey);
    setRecords(savePlanItem(createDerivedCompletionRecord(item, !item.done, {
      existing,
      source: sampleDataActive ? 'demo' : 'user',
      isSample: sampleDataActive,
    })));
    trackProductEvent('weekly_plan_item_checked');
  }, [records, sampleDataActive]);

  const addPersonalItem = useCallback((date: string) => {
    const label = draft.trim();
    if (!label) return;
    setRecords(savePlanItem(createPersonalPlanRecord({
      date,
      label,
      linkedOpportunityId: draftLink?.opportunityId,
      linkedAccountName: draftLink?.accountName,
      source: sampleDataActive ? 'demo' : 'user',
      isSample: sampleDataActive,
    })));
    setDraft('');
    setDraftLink(null);
    trackProductEvent('weekly_plan_item_added');
  }, [draft, draftLink, sampleDataActive]);

  const removePersonalItem = useCallback((itemId: string) => {
    setRecords(deletePlanItem(itemId));
  }, []);

  // Suggestions only look at the week being planned, so paging to another week
  // asks the same question of that week's ledger rather than replaying this one.
  const suggestions = useMemo(() => (
    periodType === 'week'
      ? buildPlanSuggestions({
        activities,
        opportunities,
        records,
        rangeStart: board.rangeStart,
        rangeEnd: board.rangeEnd,
      })
      : []
  ), [activities, board.rangeEnd, board.rangeStart, opportunities, periodType, records]);

  const acceptSuggestion = useCallback((suggestion: PlanSuggestion, date: string) => {
    setRecords(savePlanItem(createPersonalPlanRecord({
      date,
      label: suggestion.label,
      tag: suggestion.tag,
      linkedOpportunityId: suggestion.linkedOpportunityId,
      linkedAccountName: suggestion.linkedAccountName,
      suggestionKey: suggestion.key,
      source: sampleDataActive ? 'demo' : 'user',
      isSample: sampleDataActive,
    })));
    trackProductEvent('weekly_plan_suggestion_accepted');
  }, [sampleDataActive]);

  const dismissSuggestion = useCallback((suggestion: PlanSuggestion) => {
    setRecords(savePlanItem(createDismissedSuggestionRecord({
      suggestionKey: suggestion.key,
      date: suggestion.suggestedDate,
      label: suggestion.label,
      tag: suggestion.tag,
      source: sampleDataActive ? 'demo' : 'user',
      isSample: sampleDataActive,
    })));
    trackProductEvent('weekly_plan_suggestion_dismissed');
  }, [sampleDataActive]);

  if (loading) {
    return (
      <SkeletonScreen label="Loading your plan">
        <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">
          <SkeletonCard />
        </div>
      </SkeletonScreen>
    );
  }

  const visibleDays = periodType === 'week'
    ? board.days.filter((day) => !day.isWeekend || day.items.length > 0)
    : board.days;

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-brand-blue" />
            <h1 className="text-2xl font-bold text-navy">Plan</h1>
            <DataModePill
              compact
              isLoading={authLoading}
              isAuthenticated={isAuthenticated}
              isSupabaseConfigured={isSupabaseConfigured}
              cloudAvailable={canUseSalesActivityCloudStore(dataUserId)}
              hasSampleData={sampleDataActive}
            />
          </div>
          <p className="mt-1 text-sm text-gray-600">
            Your week as days. Dated commitments already in Memoire appear on their own; add anything else the week needs.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-full border border-gray-200 p-0.5">
            {periodOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setPeriodType(option.value)}
                className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                  periodType === option.value ? 'bg-brand-blue text-white' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Previous period"
              onClick={() => setAnchorDate((current) => shiftPlanAnchor(current, periodType, -1))}
              className="rounded-full border border-gray-200 p-2 text-gray-600 hover:bg-gray-50"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[150px] text-center text-sm font-bold text-navy">{formatPlanRangeLabel(board)}</span>
            <button
              type="button"
              aria-label="Next period"
              onClick={() => setAnchorDate((current) => shiftPlanAnchor(current, periodType, 1))}
              className="rounded-full border border-gray-200 p-2 text-gray-600 hover:bg-gray-50"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setAnchorDate(new Date())}
              className="ml-1 inline-flex items-center gap-1 rounded-full border border-gray-200 px-3 py-2 text-xs font-bold text-gray-600 hover:bg-gray-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Today
            </button>
          </div>
        </div>
      </header>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-gray-600">
        <span className="font-bold text-navy">{board.doneCount} / {board.totalCount} done</span>
        <span>{board.derivedCount - board.captureCount} from your pipeline and obligations</span>
        {board.captureCount > 0 && (
          <span className="inline-flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            {board.captureCount} pulled in from your captures
          </span>
        )}
        <span>{board.personalCount} added by you</span>
        {commitment && (
          <Link to="/app/weekly-brief" className="ml-auto font-bold text-brand-blue hover:underline">
            {commitment.items.length} commitments confirmed for this week
          </Link>
        )}
      </div>

      <PlanSuggestionsPanel
        suggestions={suggestions}
        days={board.days}
        onAccept={acceptSuggestion}
        onDismiss={dismissSuggestion}
      />

      {board.totalCount === 0 && suggestions.length === 0 && (
        <p className="mt-6 rounded-lg border border-gray-100 bg-gray-50 p-4 text-sm text-gray-500">
          Nothing dated in this period yet. Put dates on your deals' next actions, or add your own items to a day below.
        </p>
      )}

      <div className={`mt-4 grid gap-3 ${
        periodType === 'week'
          ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5'
          : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7'
      }`}>
        {visibleDays.map((day) => (
          <section
            key={day.date}
            className={`flex flex-col rounded-lg border ${day.isToday ? 'border-brand-blue' : 'border-gray-100'} bg-white`}
          >
            <header className={`flex items-baseline justify-between rounded-t-lg px-3 py-2 ${day.isToday ? 'bg-blue-50' : 'bg-gray-50'}`}>
              <h2 className={`text-sm font-bold ${day.isToday ? 'text-brand-blue' : 'text-navy'}`}>
                {periodType === 'week' ? day.weekdayLabel : day.dayLabel}
              </h2>
              <span className="text-[11px] text-gray-500">
                {periodType === 'week' ? day.dayLabel : day.weekdayLabel.slice(0, 3)}
              </span>
            </header>

            <div className="flex-1 space-y-1 p-2">
              {day.items.map((item) => (
                <div key={item.id} className="group flex items-start gap-2 rounded-md px-1.5 py-1 hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={item.done}
                    onChange={() => toggleItem(item)}
                    aria-label={`Mark "${item.label}" ${item.done ? 'not done' : 'done'}`}
                    className="mt-[3px] h-3.5 w-3.5 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className={`text-xs leading-5 ${item.done ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                      {item.tag && (
                        <span className={`mr-1 rounded px-1 py-0.5 text-[10px] font-bold ${item.done ? 'bg-gray-100 text-gray-400' : planKindTone(item.kind)}`}>
                          {item.tag}
                        </span>
                      )}
                      {item.href && !item.done ? (
                        <Link to={item.href} className="font-medium hover:text-brand-blue hover:underline">{item.label}</Link>
                      ) : (
                        <span className="font-medium">{item.label}</span>
                      )}
                      {item.overdue && !item.done && (
                        <span className="ml-1 rounded bg-red-50 px-1 py-0.5 text-[10px] font-bold text-red-700">Overdue</span>
                      )}
                    </p>
                  </div>
                  {item.kind === 'personal' && (
                    <button
                      type="button"
                      aria-label={`Remove ${item.label}`}
                      onClick={() => removePersonalItem(item.id)}
                      className="shrink-0 rounded p-0.5 text-gray-300 opacity-0 transition hover:bg-gray-200 hover:text-gray-700 group-hover:opacity-100"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}

              {composerDate === day.date ? (
                <div className="mt-1">
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={draft}
                      autoFocus
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') { event.preventDefault(); addPersonalItem(day.date); }
                        if (event.key === 'Escape') { setComposerDate(''); setDraft(''); setDraftLink(null); }
                      }}
                      placeholder="[Internal] Submit KPI"
                      aria-label={`Add an item to ${day.weekdayLabel}`}
                      className="min-w-0 flex-1 rounded border border-gray-200 px-2 py-1 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => addPersonalItem(day.date)}
                      className="shrink-0 rounded bg-brand-blue px-2 py-1 text-xs font-bold text-white hover:bg-blue-700"
                    >
                      Add
                    </button>
                  </div>
                  {draftLink && (
                    <span className="mt-1.5 inline-flex max-w-full items-center gap-1.5 rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-brand-blue">
                      <span className="truncate">Linked: {draftLink.display}</span>
                      <button
                        type="button"
                        aria-label="Remove link"
                        onClick={() => setDraftLink(null)}
                        className="shrink-0 text-blue-400 hover:text-blue-700"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  )}
                  {draftLinkOptions.length > 0 && (
                    <div className="mt-1.5 overflow-hidden rounded-md border border-gray-100 bg-white shadow-sm">
                      <p className="border-b border-gray-100 bg-gray-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-gray-400">
                        Link to
                      </p>
                      {draftLinkOptions.map((option) => (
                        <button
                          key={option.key}
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => setDraftLink(option)}
                          className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-[11px] font-semibold text-gray-700 hover:bg-blue-50 hover:text-brand-blue"
                        >
                          <span className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-bold uppercase ${option.kind === 'deal' ? 'bg-blue-50 text-brand-blue' : 'bg-gray-100 text-gray-500'}`}>
                            {option.kind}
                          </span>
                          <span className="truncate">{option.display}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => { setComposerDate(day.date); setDraft(''); setDraftLink(null); }}
                  className="mt-1 flex w-full items-center gap-1 rounded px-1.5 py-1 text-[11px] font-bold text-gray-400 transition hover:bg-gray-50 hover:text-brand-blue"
                >
                  <Plus className="h-3 w-3" />
                  Add
                </button>
              )}
            </div>
          </section>
        ))}
      </div>

      <p className="mt-4 text-xs leading-5 text-gray-400">
        Items in green were pulled in from a capture - you wrote them once, they landed here on their own. Checking any
        pipeline, capture, or obligation item records that you did your plan; it does not change the deal, so capture the
        touch when it happens and the rest of Memoire stays in step.
      </p>
    </div>
  );
}

export function WeeklyPlanPageFallback() {
  return (
    <div className="flex h-64 items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-brand-blue" />
    </div>
  );
}
