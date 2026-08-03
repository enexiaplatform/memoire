import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ChevronLeft, ChevronRight, Loader2, Pencil, Plus, RotateCcw, X } from 'lucide-react';
import { useAuthContext } from '../../auth/authContext';
import { DataModePill } from '../../components/common/DataModePill';
import { hasLocalSampleData } from '../../utils/dataMode';
import { isSupabaseConfigured } from '../../lib/demoMode';
import {
  canUseSalesActivityCloudStore,
  updateSalesActivitySchedule,
  type SalesActivityRecord,
} from '../../services/salesActivityStore';
import { opportunityToFormInput, updateOpportunity } from '../../services/opportunityStore';
import { getCachedSalesWorkspaceData, loadSalesWorkspaceData } from '../../services/workspaceData';
import { type CrmLiteOpportunity } from '../../services/opportunityStore';
import { type QuoteRecord } from '../../services/quoteStore';
import { type ExpenseRecord } from '../../services/expenseStore';
import { buildOwnObligations } from '../../utils/ownObligations';
import { loadSupplierCommitmentsForWorkspace } from '../../services/supplierCommitmentStore';
import {
  supplierCommitmentsAsOwnObligations,
  SUPPLIER_OBLIGATION_MARKER,
  type SupplierCommitmentRecord,
} from '../../utils/supplierCommitments';
import { buildPlanSuggestions, type PlanSuggestion } from '../../utils/planSuggestions';
import { useCommercialThreads } from '../threads/useCommercialThreads';
import { todayDateKey } from '../../utils/safeDate';
import { PlanSuggestionsPanel } from './PlanSuggestionsPanel';
import { PlanTagAccountsPanel } from './PlanTagAccountsPanel';
import { PlanPasteImportPanel } from './PlanPasteImportPanel';
import { buildPlanTagAccountCandidates, planRecordsForCandidate, type PlanTagAccountCandidate } from '../../utils/planTagAccounts';
import { createAccount, emptyAccountInput, loadAccounts, type AccountMemoryRecord } from '../../services/accountStore';
import {
  buildCaptureDerivedKey,
  buildDealDerivedKey,
  buildPlanBoard,
  buildPlanLinkOptions,
  createDerivedCompletionRecord,
  createDismissedSuggestionRecord,
  createPersonalPlanRecord,
  formatPlanRangeLabel,
  getPlanItemWriteTarget,
  shiftPlanAnchor,
  splitBracketTag,
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
import { buildActivityLedgerContext, resolvePlanItemSubject } from '../../utils/activityLedger';
import { buildAccountAliasIndex } from '../../utils/accountAliases';
import type { AccountMergeRecord } from '../../services/accountMergeStore';
import { SubjectChip } from '../../components/common/SubjectChip';
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
 *
 * This is Timeline > Upcoming. `embedded` drops the page chrome so Timeline can
 * own one heading for both halves of the ledger; the board itself is unchanged,
 * which is why the old /app/plan URL can keep working as a deep link.
 */
export function WeeklyPlanPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { user, loading: authLoading, isAuthenticated } = useAuthContext();
  // The same recommendations Today and Pipeline Defense show. The plan reads
  // them rather than recomputing, so a risk cannot say one thing on one page
  // and something else on another.
  const { recommendations } = useCommercialThreads();
  const [periodType, setPeriodType] = useState<PlanPeriod>('week');
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [activities, setActivities] = useState<SalesActivityRecord[]>([]);
  const [opportunities, setOpportunities] = useState<CrmLiteOpportunity[]>([]);
  const [quotes, setQuotes] = useState<QuoteRecord[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [records, setRecords] = useState<PlanRecord[]>([]);
  const [supplierCommitments, setSupplierCommitments] = useState<SupplierCommitmentRecord[]>([]);
  const [commitment, setCommitment] = useState<WeeklyCommitmentSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<AccountMemoryRecord[]>([]);
  const [accountMerges, setAccountMerges] = useState<AccountMergeRecord[]>([]);
  const [creatingAccount, setCreatingAccount] = useState('');
  const [dismissedTagKeys, setDismissedTagKeys] = useState<string[]>([]);
  const [accountMessage, setAccountMessage] = useState('');
  const [composerDate, setComposerDate] = useState('');
  const [draft, setDraft] = useState('');
  const [draftLink, setDraftLink] = useState<PlanLinkOption | null>(null);
  const [dragItem, setDragItem] = useState<PlanItem | null>(null);
  const [dragOverDate, setDragOverDate] = useState('');
  const [editingId, setEditingId] = useState('');
  const [editDraft, setEditDraft] = useState('');
  const [boardMessage, setBoardMessage] = useState('');
  const sampleDataActive = hasLocalSampleData();
  const dataUserId = sampleDataActive ? undefined : user?.id;

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
      const workspaceData = await loadSalesWorkspaceData(dataUserId);
      setActivities(workspaceData.activities);
      setOpportunities(workspaceData.opportunities);
      setQuotes(workspaceData.quotes);
      setExpenses(workspaceData.expenses);
      setAccountMerges(workspaceData.accountMerges);
      setLoading(false);
    }

    setAccounts(await loadAccounts(dataUserId));
    setRecords(await loadPlanItemsForWorkspace(dataUserId, sampleDataActive));
    setSupplierCommitments(await loadSupplierCommitmentsForWorkspace(dataUserId, sampleDataActive));
    const snapshots = await loadWeeklyCommitmentsForWorkspace(dataUserId, sampleDataActive);
    setCommitment(getWeeklyCommitmentForWeek(getCurrentPipelineReviewWeekId(), snapshots));
  }, [dataUserId, sampleDataActive]);

  useEffect(() => { void refresh(); }, [refresh]);

  const obligations = useMemo(
    () => buildOwnObligations({
      expenses,
      quotes,
      // A forecast owed to a principal is a dated promise like any other, so it
      // belongs on the week rather than in a second place to remember.
      supplierObligations: supplierCommitmentsAsOwnObligations({ records: supplierCommitments }),
    }).obligations,
    [expenses, quotes, supplierCommitments],
  );

  // The lines this workspace carries. A plan line tagged with one of them is
  // work for that principal, not unattached admin.
  const knownBrands = useMemo(() => Array.from(new Set(
    opportunities.map((opportunity) => (opportunity.brand || '').trim()).filter(Boolean),
  )).sort((a, b) => a.localeCompare(b)), [opportunities]);

  /**
   * What each line on the board is actually about, resolved with the same
   * function the Activity ledger counts with.
   *
   * The board has always drawn the bracket tag the operator typed. That says who
   * they think the work is for; it cannot say whether the workspace agrees. A tag
   * reading "Tenamyd" looked identical whether Tenamyd was a live deal or a name
   * that exists nowhere but this one line - and the second case is work that will
   * never reach a quote, a forecast or an invoice. The chip now carries the
   * operator's own wording and the resolution behind it, so the difference is
   * visible on the calendar rather than only on Activity.
   */
  const subjectContext = useMemo(
    () => buildActivityLedgerContext({ opportunities, accounts }),
    [accounts, opportunities],
  );
  const accountAliases = useMemo(() => buildAccountAliasIndex(accountMerges), [accountMerges]);

  const board = useMemo(() => buildPlanBoard({
    periodType,
    anchorDate,
    opportunities,
    obligations,
    activities,
    records,
    brands: knownBrands,
  }), [activities, anchorDate, knownBrands, obligations, opportunities, periodType, records]);

  // Every account name the workspace already knows, so a typed plan item can
  // link to the entity it belongs to instead of living as loose text.
  const knownAccountNames = useMemo(() => [
    ...opportunities.map((item) => item.accountName),
    ...activities.map((item) => item.linkedAccountName || item.accountName),
    ...quotes.map((item) => item.accountName),
  ], [activities, opportunities, quotes]);
  const draftLinkOptions = useMemo(() => (
    draftLink ? [] : buildPlanLinkOptions({ draft, opportunities, accountNames: knownAccountNames, brands: knownBrands })
  ), [draft, draftLink, knownAccountNames, knownBrands, opportunities]);

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
    trackProductEvent('commitment_completed');
  }, [records, sampleDataActive]);

  /**
   * Rewrites the completion stub for a derived item whose date is changing, so
   * a tick made on Tuesday is still a tick after the item moves to Thursday.
   */
  const carryCompletionStub = useCallback((item: PlanItem, nextDerivedKey: string, nextDate: string) => {
    const stub = records.find((record) => record.derivedKey === item.derivedKey);
    if (!stub) return;
    setRecords(savePlanItem({ ...stub, date: nextDate, derivedKey: nextDerivedKey, updatedAt: new Date().toISOString() }));
  }, [records]);

  /**
   * Dragging an item onto another day writes the new date into the record that
   * owns the commitment: the plan record, the deal's next-action date, or the
   * captured touch's due date. The board stays a mirror, never a second copy.
   */
  const moveItem = useCallback(async (item: PlanItem, targetDate: string) => {
    if (item.date === targetDate) return;
    setBoardMessage('');
    const target = getPlanItemWriteTarget(item);

    try {
      if (target.kind === 'personal') {
        const existing = records.find((record) => record.id === target.recordId);
        if (!existing) return;
        setRecords(savePlanItem({ ...existing, date: targetDate, updatedAt: new Date().toISOString() }));
        return;
      }

      if (target.kind === 'deal') {
        const opportunity = opportunities.find((candidate) => candidate.id === target.opportunityId);
        if (!opportunity) return;
        const result = await updateOpportunity(
          opportunity,
          { ...opportunityToFormInput(opportunity), nextActionDate: targetDate },
          dataUserId,
        );
        carryCompletionStub(item, buildDealDerivedKey(opportunity.id, targetDate), targetDate);
        setOpportunities((current) => current.map((candidate) => (candidate.id === opportunity.id ? result.opportunity : candidate)));
        if (result.warning) setBoardMessage(result.warning);
        return;
      }

      if (target.kind === 'capture') {
        const activity = activities.find((candidate) => candidate.id === target.activityId);
        if (!activity) return;
        // The headline action and its structured copy describe one commitment,
        // so both move; a structured-only slot moves alone.
        const changes = target.slot === 'main'
          ? {
            dueDate: targetDate,
            nextActions: (activity.nextActions || []).map((action) => (
              action.dueDate === item.date && (action.title || '').trim() === (activity.nextAction || '').trim()
                ? { ...action, dueDate: targetDate }
                : action
            )),
          }
          : {
            nextActions: (activity.nextActions || []).map((action, index) => (
              `n${index}` === target.slot ? { ...action, dueDate: targetDate } : action
            )),
          };
        const updated = await updateSalesActivitySchedule(activity, changes, dataUserId);
        carryCompletionStub(item, buildCaptureDerivedKey(activity.id, targetDate, target.slot), targetDate);
        setActivities((current) => current.map((candidate) => (candidate.id === activity.id ? updated : candidate)));
        return;
      }

      // Three kinds of record can raise an obligation, and the message has to
      // name the right one or it sends the operator to the wrong screen.
      setBoardMessage(
        item.id.includes(SUPPLIER_OBLIGATION_MARKER)
          ? `Change the date with the principal on Orders - "${item.tag}" is holding this one.`
          : 'Payments and deliveries you owe move when the quote or expense behind them changes date.',
      );
    } catch {
      setBoardMessage('Could not move that item. Nothing was changed.');
    }
  }, [activities, carryCompletionStub, dataUserId, opportunities, records]);

  const startEdit = useCallback((item: PlanItem) => {
    setEditingId(item.id);
    setEditDraft(item.tag && item.kind === 'personal' ? `[${item.tag}] ${item.label}` : item.label);
  }, []);

  /**
   * Editing a label in place rewrites the wording where it lives: the plan
   * record, the deal's next action, or the captured touch's next action.
   */
  const saveEdit = useCallback(async (item: PlanItem) => {
    const raw = editDraft.trim();
    setEditingId('');
    setEditDraft('');
    if (!raw) return;
    setBoardMessage('');
    const target = getPlanItemWriteTarget(item);

    try {
      if (target.kind === 'personal') {
        const existing = records.find((record) => record.id === target.recordId);
        if (!existing) return;
        const { tag, label } = splitBracketTag(raw);
        if (label === existing.label && (!tag || tag === existing.tag)) return;
        setRecords(savePlanItem({ ...existing, label, tag: tag || existing.tag, updatedAt: new Date().toISOString() }));
        return;
      }

      if (target.kind === 'deal') {
        if (raw === item.label) return;
        const opportunity = opportunities.find((candidate) => candidate.id === target.opportunityId);
        if (!opportunity) return;
        const result = await updateOpportunity(
          opportunity,
          { ...opportunityToFormInput(opportunity), nextAction: raw },
          dataUserId,
        );
        setOpportunities((current) => current.map((candidate) => (candidate.id === opportunity.id ? result.opportunity : candidate)));
        if (result.warning) setBoardMessage(result.warning);
        return;
      }

      if (target.kind === 'capture') {
        if (raw === item.label) return;
        const activity = activities.find((candidate) => candidate.id === target.activityId);
        if (!activity) return;
        const changes = target.slot === 'main'
          ? {
            nextAction: raw,
            nextActions: (activity.nextActions || []).map((action) => (
              action.dueDate === item.date && (action.title || '').trim() === (activity.nextAction || '').trim()
                ? { ...action, title: raw }
                : action
            )),
          }
          : {
            nextActions: (activity.nextActions || []).map((action, index) => (
              `n${index}` === target.slot ? { ...action, title: raw } : action
            )),
          };
        const updated = await updateSalesActivitySchedule(activity, changes, dataUserId);
        setActivities((current) => current.map((candidate) => (candidate.id === activity.id ? updated : candidate)));
      }
    } catch {
      setBoardMessage('Could not save that edit. The original wording stands.');
    }
  }, [activities, dataUserId, editDraft, opportunities, records]);

  const addPersonalItem = useCallback((date: string) => {
    const label = draft.trim();
    if (!label) return;
    setRecords(savePlanItem(createPersonalPlanRecord({
      date,
      label,
      linkedOpportunityId: draftLink?.opportunityId,
      linkedAccountName: draftLink?.accountName,
      linkedBrand: draftLink?.brand,
      source: sampleDataActive ? 'demo' : 'user',
      isSample: sampleDataActive,
    })));
    setDraft('');
    setDraftLink(null);
    trackProductEvent('commitment_created');
  }, [draft, draftLink, sampleDataActive]);

  const importPastedWeek = useCallback((lines: { date: string; tag: string; label: string }[]) => {
    let nextRecords = records;
    lines.forEach((line) => {
      nextRecords = savePlanItem(createPersonalPlanRecord({
        date: line.date,
        label: line.label,
        tag: line.tag,
        source: sampleDataActive ? 'demo' : 'user',
        isSample: sampleDataActive,
      }));
    });
    setRecords(nextRecords);
    setAccountMessage(
      `${lines.length} ${lines.length === 1 ? 'item' : 'items'} added to this week. Tag an account and it can become a real customer below.`,
    );
    trackProductEvent('commitment_created');
  }, [records, sampleDataActive]);

  const removePersonalItem = useCallback((itemId: string) => {
    setRecords(deletePlanItem(itemId));
  }, []);

  // Suggestions only look at the week being planned, so paging to another week
  // asks the same question of that week's ledger rather than replaying this one.
  //
  // `recommendations` is the same policy-engine output Today and Pipeline
  // Defense render. Passing it here is what stops the operator having to read a
  // risk on one page and retype it as a plan item on another.
  const suggestions = useMemo(() => (
    periodType === 'week'
      ? buildPlanSuggestions({
        activities,
        opportunities,
        records,
        recommendations,
        rangeStart: board.rangeStart,
        rangeEnd: board.rangeEnd,
        today: todayDateKey(),
      })
      : []
  ), [activities, board.rangeEnd, board.rangeStart, opportunities, periodType, recommendations, records]);

  // The customers this week's hand-written lines are about, that the workspace
  // does not know yet. Refused tags stay refused for the session.
  const tagAccountCandidates = useMemo(() => buildPlanTagAccountCandidates({
    records,
    accounts,
    opportunities,
    rangeStart: board.rangeStart,
    rangeEnd: board.rangeEnd,
  }).filter((candidate) => !dismissedTagKeys.includes(candidate.name)), [
    accounts, board.rangeEnd, board.rangeStart, dismissedTagKeys, opportunities, records,
  ]);

  const createAccountFromTag = useCallback(async (candidate: PlanTagAccountCandidate) => {
    setCreatingAccount(candidate.name);
    setAccountMessage('');
    try {
      const result = await createAccount({ ...emptyAccountInput, accountName: candidate.name }, dataUserId);

      // Every spelling the candidate folded together points at the new account,
      // so "[DP Lab]" and "[DPLab]" both become one customer's work rather than
      // leaving half the week still loose.
      const now = new Date().toISOString();
      let nextRecords = records;
      planRecordsForCandidate(records, candidate).forEach((record) => {
        nextRecords = savePlanItem({
          ...record,
          tag: candidate.name,
          linkedAccountName: result.account.accountName,
          updatedAt: now,
        });
      });
      setRecords(nextRecords);
      setAccounts(await loadAccounts(dataUserId));
      setAccountMessage(
        result.warning
        || `${result.account.accountName} is an account now — ${candidate.itemCount} plan ${candidate.itemCount === 1 ? 'item is' : 'items are'} linked to it.`,
      );
    } catch {
      setAccountMessage(`Could not create ${candidate.name}. Your plan is unchanged.`);
    } finally {
      setCreatingAccount('');
    }
  }, [dataUserId, records]);

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
  }, [sampleDataActive]);

  if (loading) {
    return (
      <SkeletonScreen label="Loading what is coming up">
        <div className={embedded ? '' : 'mx-auto max-w-[1600px] px-4 py-6 sm:px-6'}>
          <SkeletonCard />
        </div>
      </SkeletonScreen>
    );
  }

  const visibleDays = periodType === 'week'
    ? board.days.filter((day) => !day.isWeekend || day.items.length > 0)
    : board.days;

  return (
    <div className={embedded ? '' : 'mx-auto max-w-[1600px] px-4 py-6 sm:px-6'}>
      <header className={`flex flex-col gap-3 sm:flex-row sm:items-start ${embedded ? 'sm:justify-end' : 'sm:justify-between'}`}>
        {!embedded && (
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
        )}

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

      {/* Who the week is for. The line above it answers where each item came
          from; this one answers who it serves, which is the question a
          distributor's week could never be asked before - every line without a
          customer used to read as the same undifferentiated admin. */}
      {board.totalCount > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
          <span className="font-bold uppercase tracking-wide text-gray-400">This week serves</span>
          {board.workSplit.customer > 0 && (
            <span className="rounded-full bg-blue-50 px-2.5 py-1 font-bold text-brand-blue">
              {board.workSplit.customer} customer
            </span>
          )}
          {board.workSplit.principal > 0 && (
            <span className="rounded-full bg-violet-50 px-2.5 py-1 font-bold text-violet-700">
              {board.workSplit.principal} principal
            </span>
          )}
          {board.workSplit.internal > 0 && (
            <span className="rounded-full bg-gray-100 px-2.5 py-1 font-bold text-gray-600">
              {board.workSplit.internal} internal
              {/* The domain breakdown only earns its place when it says
                  something the count did not. A week whose internal work is all
                  admin would otherwise read "3 internal - 3 internal". */}
              {describeInternalDomains(board.workSplit.internalByDomain)}
            </span>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-600">
        <span className="font-bold text-navy">{board.doneCount} / {board.totalCount} done</span>
        {board.derivedCount - board.captureCount > 0 && (
          <span>{board.derivedCount - board.captureCount} from your pipeline and obligations</span>
        )}
        {board.captureCount > 0 && (
          <span className="inline-flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            {board.captureCount} pulled in from your captures
          </span>
        )}
        {board.personalCount > 0 && <span>{board.personalCount} added by you</span>}
        {commitment && (
          <Link to="/app/reviews" className="ml-auto font-bold text-brand-blue hover:underline">
            {commitment.items.length} commitments confirmed for this week
          </Link>
        )}
      </div>

      <PlanPasteImportPanel days={board.days} records={records} onImport={importPastedWeek} />

      <PlanTagAccountsPanel
        candidates={tagAccountCandidates}
        creating={creatingAccount}
        onCreate={createAccountFromTag}
        onDismiss={(candidate) => setDismissedTagKeys((current) => [...current, candidate.name])}
      />

      {accountMessage && (
        <p className="mt-3 rounded-lg bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-100">
          {accountMessage}
        </p>
      )}

      {boardMessage && (
        <p className="mt-3 rounded-lg bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800 ring-1 ring-amber-100">
          {boardMessage}
        </p>
      )}

      <PlanSuggestionsPanel
        suggestions={suggestions}
        days={board.days}
        onAccept={acceptSuggestion}
        onDismiss={dismissSuggestion}
      />

      {board.totalCount === 0 && suggestions.length === 0 && (
        <div className="mt-6 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center">
          <p className="text-sm font-bold text-navy">Nothing dated in this period yet.</p>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-gray-500">
            Capture a touch with a due date and it lands here on its own — nothing to re-type. Deals and payments you owe
            fill in too, and you can always add your own items to a day below.
          </p>
          <Link
            to="/app/capture?mode=quick"
            className="mt-4 inline-flex rounded-full bg-navy px-4 py-2 text-sm font-bold text-white hover:bg-navy/90"
          >
            Capture activity
          </Link>
        </div>
      )}

      <div className={`mt-4 grid gap-3 ${
        periodType === 'week'
          ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5'
          : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7'
      }`}>
        {visibleDays.map((day) => (
          <section
            key={day.date}
            onDragOver={(event) => {
              if (!dragItem) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
              if (dragOverDate !== day.date) setDragOverDate(day.date);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDragOverDate('');
              if (dragItem) void moveItem(dragItem, day.date);
              setDragItem(null);
            }}
            className={`flex flex-col rounded-lg border ${day.isToday ? 'border-brand-blue' : 'border-gray-100'} bg-white ${
              dragItem && dragOverDate === day.date && dragItem.date !== day.date ? 'ring-2 ring-brand-blue/40' : ''
            }`}
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
              {day.items.map((item) => {
                const editable = item.kind !== 'obligation';
                const isEditing = editingId === item.id;
                return (
                <div
                  key={item.id}
                  // Obligations can be picked up even though they will not
                  // move. Refusing the drag outright taught the operator
                  // nothing - the item simply did not respond - whereas
                  // catching it lets the board say which record holds the date.
                  // The grab cursor stays off them, so nothing invites the try.
                  draggable={!isEditing}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/plain', item.id);
                    setDragItem(item);
                  }}
                  onDragEnd={() => { setDragItem(null); setDragOverDate(''); }}
                  className={`group flex items-start gap-2 rounded-md px-1.5 py-1 hover:bg-gray-50 ${
                    editable && !isEditing ? 'cursor-grab active:cursor-grabbing' : ''
                  } ${dragItem?.id === item.id ? 'opacity-40' : ''}`}
                >
                  {/* A label, not a bare checkbox: padding is ignored on a
                      checkbox's own box, so the way to give a 14px control a
                      24px target is to make the label the target. It is also
                      the right markup - tapping anywhere in it toggles the
                      item - and the negative margin keeps the day column as
                      tight as it was. */}
                  <label className="-my-[5px] -ml-[5px] flex shrink-0 cursor-pointer items-start p-[5px]">
                    <input
                      type="checkbox"
                      checked={item.done}
                      onChange={() => toggleItem(item)}
                      aria-label={`Mark "${item.label}" ${item.done ? 'not done' : 'done'}`}
                      className="mt-[3px] h-3.5 w-3.5"
                    />
                  </label>
                  <div className="min-w-0 flex-1">
                    {isEditing ? (
                      <input
                        type="text"
                        value={editDraft}
                        autoFocus
                        onChange={(event) => setEditDraft(event.target.value)}
                        onBlur={() => void saveEdit(item)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') { event.preventDefault(); void saveEdit(item); }
                          if (event.key === 'Escape') { setEditingId(''); setEditDraft(''); }
                        }}
                        aria-label={`Edit "${item.label}"`}
                        className="w-full rounded border border-brand-blue/60 px-1.5 py-0.5 text-xs outline-none focus:ring-2 focus:ring-brand-blue/20"
                      />
                    ) : (
                    <p className={`text-xs leading-5 ${item.done ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                      {item.tag && (
                        item.done ? (
                          // A finished line does not need to argue about
                          // attachment any more; greying it keeps the column
                          // quiet so live work reads first.
                          <span className="mr-1 rounded bg-gray-100 px-1 py-0.5 text-[10px] font-bold text-gray-400">
                            {item.tag}
                          </span>
                        ) : (
                          <SubjectChip
                            relation={resolvePlanItemSubject(item, subjectContext, accountAliases)}
                            label={item.tag}
                            size="compact"
                            className="mr-1"
                          />
                        )
                      )}
                      {item.href && !item.done ? (
                        <Link to={item.href} className="font-medium hover:text-brand-blue hover:underline">{item.label}</Link>
                      ) : editable ? (
                        <button
                          type="button"
                          onClick={() => startEdit(item)}
                          className="text-left font-medium hover:text-brand-blue"
                          title="Edit"
                        >
                          {item.label}
                        </button>
                      ) : (
                        <span className="font-medium">{item.label}</span>
                      )}
                      {item.overdue && !item.done && (
                        <span className="ml-1 rounded bg-red-50 px-1 py-0.5 text-[10px] font-bold text-red-700">Overdue</span>
                      )}
                    </p>
                    )}
                  </div>
                  {editable && !isEditing && (
                    <button
                      type="button"
                      aria-label={`Edit ${item.label}`}
                      onClick={() => startEdit(item)}
                      className="relative shrink-0 rounded p-0.5 text-gray-300 opacity-0 transition after:absolute after:-inset-1.5 after:content-[''] hover:bg-gray-200 hover:text-gray-700 group-hover:opacity-100"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                  )}
                  {item.kind === 'personal' && !isEditing && (
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
                );
              })}

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
                          <span className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-bold uppercase ${
                            option.kind === 'deal'
                              ? 'bg-blue-50 text-brand-blue'
                              : option.kind === 'brand'
                                ? 'bg-violet-50 text-violet-700'
                                : 'bg-gray-100 text-gray-500'
                          }`}>
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
        Items in green were pulled in from a capture - you wrote them once, they landed here on their own. Drag any item
        to another day to reschedule it, or use the pencil to rewrite it - both write straight into the deal or touch it
        came from. Checking an item records that you did your plan; it does not change the deal, so capture the touch
        when it happens and the rest of Memoire stays in step.
      </p>
    </div>
  );
}

function describeInternalDomains(domains: { domain: string; count: number }[]) {
  const informative = domains.length > 1 || (domains.length === 1 && domains[0].domain !== 'Internal');
  if (!informative) return '';
  return ` · ${domains.map((entry) => `${entry.count} ${entry.domain.toLowerCase()}`).join(', ')}`;
}

export function WeeklyPlanPageFallback() {
  return (
    <div className="flex h-64 items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-brand-blue" />
    </div>
  );
}
