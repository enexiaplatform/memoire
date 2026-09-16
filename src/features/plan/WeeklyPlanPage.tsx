import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ChevronLeft, ChevronRight, Loader2, Pencil, Plus, RotateCcw, X } from 'lucide-react';
import { useAuthContext } from '../../auth/authContext';
import { DataModePill } from '../../components/common/DataModePill';
import { hasLocalSampleData } from '../../utils/dataMode';
import { isSupabaseConfigured } from '../../lib/demoMode';
import {
  canUseSalesActivityCloudStore,
  saveSalesActivity,
  updateSalesActivityDetails,
  type SalesActivityRecord,
} from '../../services/salesActivityStore';
import { opportunityToFormInput, updateOpportunity } from '../../services/opportunityStore';
import { getCachedSalesWorkspaceData, loadSalesWorkspaceData } from '../../services/workspaceData';
import { useWorkspaceRefresh } from '../../hooks/useWorkspaceRefresh';
import { type CrmLiteOpportunity } from '../../services/opportunityStore';
import { type QuoteRecord } from '../../services/quoteStore';
import { type ExpenseRecord } from '../../services/expenseStore';
import { buildOwnObligations } from '../../utils/ownObligations';
import { loadSupplierCommitmentsForWorkspace } from '../../services/supplierCommitmentStore';
import {
  supplierCommitmentsAsOwnObligations,
  type SupplierCommitmentRecord,
} from '../../utils/supplierCommitments';
import { buildPlanSuggestions, type PlanSuggestion } from '../../utils/planSuggestions';
import { useCommercialThreads } from '../threads/useCommercialThreads';
import { todayDateKey, formatSafeBusinessDate, isMoreRecentBusinessDate } from '../../utils/safeDate';
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
  createPlanItemToggleRecord,
  createDismissedSuggestionRecord,
  createPersonalPlanRecord,
  formatPlanRangeLabel,
  getPlanItemWriteTarget,
  planDateKeyToDate,
  planLinkKindLabel,
  shiftPlanAnchor,
  splitBracketTag,
  stripPlanLinkFromDraft,
  type PlanDay,
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
import {
  applyPersonalPlanEdit,
  buildCaptureEditChanges,
  buildPlanItemEditDraft,
  planItemEditDate,
  planItemEditPolicy,
  planObligationOwnerMessage,
  type PlanItemEditDraft,
} from '../../utils/planItemEdit';
import { PlanItemDetailDrawer, type PlanContactOption } from './PlanItemDetailDrawer';
import { markDemoJourneyStepComplete } from '../../utils/demoJourney';
import type { PlanBoardWindow } from '../../domain/commercialKernel/derivePlanCommitments';
import type { StakeholderRecord } from '../../services/stakeholderStore';
import { buildActivityLedgerContext, resolvePlanItemSubject } from '../../utils/activityLedger';
import { accountKey, normalizeEntityName } from '../../utils/accountIdentity';
import { normalizeSearchText } from '../../utils/textSearch';
import { buildAccountAliasIndex } from '../../utils/accountAliases';
import type { AccountMergeRecord } from '../../services/accountMergeStore';
import { SubjectChip } from '../../components/common/SubjectChip';
import { getWeeklyCommitmentForWeek, loadWeeklyCommitmentsForWorkspace } from '../../services/weeklyCommitmentStore';
import { getCurrentPipelineReviewWeekId } from '../../utils/pipelineReviewHabit';
import type { WeeklyCommitmentSnapshot } from '../../utils/weeklyCommitment';
import { trackProductEvent } from '../../utils/productAnalytics';
import {
  buildPlanCompletionActivity,
  findPlanCompletionActivity,
  planCompletionLogMessage,
  planCompletionActivityDate,
  planItemAccountName,
  planItemOpportunity,
} from '../../utils/planCompletionLog';
import {
  RecordPlanActivityDrawer,
  type RecordPlanActivityValues,
} from '../../components/common/RecordPlanActivityDrawer';
import {
  createStakeholder,
  emptyStakeholderInput,
  stakeholderToFormInput,
  updateStakeholder,
} from '../../services/stakeholderStore';
import {
  ACTIVITY_CHANNELS,
  type ActivityChannel,
} from '../../utils/activityChannel';
import { SkeletonCard, SkeletonScreen } from '../../components/common/Skeleton';
import { MicroLabel, MicroPill, Panel, Segmented } from '../../components/ui/daylight';
import { delay, ghostPillClass } from '../../components/ui/daylightStyles';
import {
  formatPlanPeriodEyebrow,
  NOT_STATED_CHANNEL,
  summarisePlanBoard,
  type PlanBoardSummary,
} from '../../utils/planBoardSummary';

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
/** DOM id of the plan board, so a commitment can point at where it is ticked. */
export const PLAN_BOARD_ANCHOR_ID = 'plan-board';

/** What the board tells the page header about the period on screen. */
export type PlanBoardHeading = {
  eyebrow: string;
  done: number;
  total: number;
};

export function WeeklyPlanPage({
  embedded = false,
  onRangeChange,
  onHeadingChange,
  focusRequest = null,
  beforeBoard = null,
}: {
  embedded?: boolean;
  /**
   * Rendered between the week's ranked moves and the days themselves.
   *
   * Plan owns the calendar; it does not own the commitment ledger, and the
   * ledger has to sit between the two because that is the order the week is
   * decided in - what matters, what I already promised, then which day it
   * lands on. A slot keeps that ordering decision in the destination that
   * makes it rather than importing the ledger into the board.
   */
  beforeBoard?: ReactNode;
  /** Fired with the days now on screen, so a surface above can stop repeating them. */
  onRangeChange?: (range: PlanBoardWindow) => void;
  /** Fired with the period's name and how much of it is done, for the page headline. */
  onHeadingChange?: (heading: PlanBoardHeading) => void;
  /**
   * A day to page the board to, so a promise listed elsewhere can be brought
   * into view. The sequence number is what lets the same day be asked for
   * twice - see the comment where it is raised.
   */
  focusRequest?: { date: string; seq: number } | null;
} = {}) {
  const { user, loading: authLoading, isAuthenticated } = useAuthContext();
  // The same recommendations Today and Pipeline Defense show. The plan reads
  // them rather than recomputing, so a risk cannot say one thing on one page
  // and something else on another.
  const { recommendations } = useCommercialThreads();
  const [periodType, setPeriodType] = useState<PlanPeriod>('week');
  const [showWeekend, setShowWeekend] = useState(false);
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
  const [draftChannel, setDraftChannel] = useState<ActivityChannel | ''>('');
  /**
   * The line being recorded. Ticking an open item opens its record rather than
   * marking it done: the line is done when what happened, and who it was with,
   * has been written to Activity.
   */
  const [recordingItem, setRecordingItem] = useState<PlanItem | null>(null);
  const [recordSaving, setRecordSaving] = useState(false);
  const [recordError, setRecordError] = useState('');
  const [dragItem, setDragItem] = useState<PlanItem | null>(null);
  const [dragOverDate, setDragOverDate] = useState('');
  const [editingId, setEditingId] = useState('');
  const [editDraft, setEditDraft] = useState('');
  const [boardMessage, setBoardMessage] = useState('');
  const [stakeholders, setStakeholders] = useState<StakeholderRecord[]>([]);
  // The line opened for a full edit, and the draft being made of it. Held here
  // rather than in the drawer so a save can be applied against the same records
  // the board is drawn from.
  const [detailItem, setDetailItem] = useState<PlanItem | null>(null);
  const [detailDraft, setDetailDraft] = useState<PlanItemEditDraft | null>(null);
  const [detailSaving, setDetailSaving] = useState(false);
  const [detailError, setDetailError] = useState('');
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
      setStakeholders(cached.stakeholders);
      setLoading(false);
    } else {
      setLoading(true);
      const workspaceData = await loadSalesWorkspaceData(dataUserId);
      setActivities(workspaceData.activities);
      setOpportunities(workspaceData.opportunities);
      setQuotes(workspaceData.quotes);
      setExpenses(workspaceData.expenses);
      setAccountMerges(workspaceData.accountMerges);
      // Who the workspace already knows at each customer, so "who is it with"
      // offers the people on the record instead of asking the operator to
      // retype a name the book already holds.
      setStakeholders(workspaceData.stakeholders);
      setLoading(false);
    }

    setAccounts(await loadAccounts(dataUserId));
    setRecords(await loadPlanItemsForWorkspace(dataUserId, sampleDataActive));
    setSupplierCommitments(await loadSupplierCommitmentsForWorkspace(dataUserId, sampleDataActive));
    const snapshots = await loadWeeklyCommitmentsForWorkspace(dataUserId, sampleDataActive);
    setCommitment(getWeeklyCommitmentForWeek(getCurrentPipelineReviewWeekId(), snapshots));
  }, [dataUserId, sampleDataActive]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Drawn from the browser copy at first paint; take the cloud answer when it lands.
  useWorkspaceRefresh(() => { void refresh(); });

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

  /**
   * Tells the surface above which days are on screen.
   *
   * The commitment panel sits directly above this board and used to re-list
   * every promise the board was already drawing. It can only stop doing that if
   * it knows what the board is showing - and paging to another week has to move
   * that answer with it, or the panel would fold promises that are no longer
   * visible anywhere.
   */
  useEffect(() => {
    onRangeChange?.({ start: board.rangeStart, end: board.rangeEnd, today: todayDateKey() });
  }, [board.rangeEnd, board.rangeStart, onRangeChange]);

  /**
   * The same board one period back, for the strip's "against last week".
   * Built from the records already in memory - paging back is a second read of
   * the same arrays, not a second load.
   */
  const previousBoard = useMemo(() => buildPlanBoard({
    periodType,
    anchorDate: shiftPlanAnchor(anchorDate, periodType, -1),
    opportunities,
    obligations,
    activities,
    records,
    brands: knownBrands,
  }), [activities, anchorDate, knownBrands, obligations, opportunities, periodType, records]);
  const summary = useMemo(() => summarisePlanBoard(board, previousBoard), [board, previousBoard]);

  useEffect(() => {
    onHeadingChange?.({ eyebrow: formatPlanPeriodEyebrow(board), done: summary.done, total: summary.total });
  }, [board, onHeadingChange, summary.done, summary.total]);

  // Asked for from outside - a promise listed above the board because its day
  // is not on screen. Paging to it is what makes that row's one action true.
  useEffect(() => {
    if (!focusRequest?.date) return;
    setAnchorDate(planDateKeyToDate(focusRequest.date));
  }, [focusRequest]);

  // Every account name the workspace already knows, so a typed plan item can
  // link to the entity it belongs to instead of living as loose text.
  // The account *records* come first, and they were missing entirely: this list
  // was assembled only from names that happened to appear on a deal, a touch or
  // a quote, so a customer the operator had filed but not yet worked could not
  // be linked to at all - which is exactly the customer a "restart the thread"
  // item is about.
  const knownAccountNames = useMemo(() => [
    ...accounts.map((item) => item.accountName),
    ...opportunities.map((item) => item.accountName),
    ...activities.map((item) => item.linkedAccountName || item.accountName),
    ...quotes.map((item) => item.accountName),
  ], [accounts, activities, opportunities, quotes]);
  // The customers marked KA on the account record. With a book this size the
  // silence rule fires on hundreds at once, and this is the only signal that
  // says which of them the operator actually wants proposed.
  const keyAccountNames = useMemo(
    () => accounts.filter((account) => account.kaFlag === true).map((account) => account.accountName),
    [accounts],
  );
  /**
   * Every person the workspace can name, and the customer they belong to.
   *
   * Stakeholder records first, then the people captures were recorded against -
   * a name written on a touch and never filed as a stakeholder is still the
   * person the next visit is with, and asking the operator to retype it is the
   * duplicate work this product exists to remove.
   */
  const contactOptions = useMemo<PlanContactOption[]>(() => {
    const seen = new Map<string, PlanContactOption>();
    const add = (name: string, roleTitle: string, accountName: string) => {
      const trimmed = (name || '').trim();
      if (!trimmed) return;
      // Keyed the way every other surface keys a customer. A raw lowercase
      // would file "CÔNG TY DƯỢC PHẨM CỬU LONG" and "Cong ty Duoc Pham Cuu
      // Long" as two different companies and offer the same person twice.
      const key = `${normalizeEntityName(trimmed)}|${accountKey(accountName || '')}`;
      if (seen.has(key)) return;
      seen.set(key, { name: trimmed, roleTitle: (roleTitle || '').trim(), accountName: (accountName || '').trim() });
    };
    stakeholders.forEach((person) => add(person.name, person.roleTitle, person.accountName));
    activities.forEach((activity) => add(
      activity.stakeholderName || activity.contactName || '',
      activity.stakeholderRole || '',
      activity.linkedAccountName || activity.accountName || '',
    ));
    opportunities.forEach((opportunity) => add(opportunity.decisionMaker, 'Decision maker', opportunity.accountName));
    return [...seen.values()];
  }, [activities, opportunities, stakeholders]);
  const draftLinkOptions = useMemo(() => (
    draftLink ? [] : buildPlanLinkOptions({ draft, opportunities, accountNames: knownAccountNames, brands: knownBrands })
  ), [draft, draftLink, knownAccountNames, knownBrands, opportunities]);

  const closeRecord = useCallback(() => {
    setRecordingItem(null);
    setRecordSaving(false);
    setRecordError('');
  }, []);

  const toggleItem = useCallback((item: PlanItem) => {
    /*
     * Finishing a line is recording it.
     *
     * Until 2026-09-03 a box ticked here saved a completion mark and stopped;
     * after that it offered, unchecked, to write the work to Activity - and the
     * live ledger held five activities from a plan tick in total. An operator
     * who plans and works from Plan produced a full calendar and an empty
     * Activity, which is the exact failure this product exists to prevent.
     *
     * So an open box opens the record, and the line is marked done by the save
     * in `recordCompletion`. Unticking a finished line only withdraws the mark:
     * the activity it produced is a record of something that happened, and it
     * stays on Activity until the operator deletes it there.
     */
    if (!item.done) {
      setRecordingItem(item);
      setRecordError('');
      return;
    }
    const record = createPlanItemToggleRecord(item, false, records, {
      source: sampleDataActive ? 'demo' : 'user',
      isSample: sampleDataActive,
    });
    if (!record) return;
    setRecords(savePlanItem(record));
    if (findPlanCompletionActivity(item, activities)) {
      setBoardMessage(`"${item.label}" is open again. The activity recorded for it stays on Activity - delete it there if it did not happen.`);
    }
  }, [activities, records, sampleDataActive]);

  const recordCompletion = useCallback(async (values: RecordPlanActivityValues) => {
    const item = recordingItem;
    if (!item || recordSaving) return;
    const workspaceTag = { source: sampleDataActive ? 'demo' as const : 'user' as const, isSample: sampleDataActive };
    // The day the item sat on, or today when it was finished ahead of its day.
    const activityDate = planCompletionActivityDate(item, todayDateKey());
    const log = buildPlanCompletionActivity({
      item,
      note: values.note,
      person: values.person,
      opportunities,
      activityDate,
      channel: values.channel,
    });
    if (!log) { setRecordError('Write what happened, and who it was with, before saving.'); return; }

    setRecordSaving(true);
    setRecordError('');
    try {
      const accountName = planItemAccountName(item, opportunities);
      const personName = log.activity.stakeholderName || '';
      // The link to a stakeholder is real, not a name in a sentence: somebody
      // new is filed under the customer, and somebody already on record has
      // their last interaction moved to this day when it is newer.
      if (personName && values.personIsNew) {
        const deal = planItemOpportunity(item, opportunities);
        const created = await createStakeholder({
          ...emptyStakeholderInput,
          accountName,
          opportunityId: deal?.id || '',
          opportunityName: deal?.opportunityName || '',
          name: personName,
          roleTitle: values.person?.roleTitle || '',
          relationshipStrength: 'Developing',
          notes: `Added when recording "${item.label}" on the plan.`,
          tags: ['from-plan'],
          lastInteractionDate: activityDate,
        }, dataUserId, workspaceTag);
        setStakeholders((current) => [created.stakeholder, ...current]);
      } else if (personName) {
        const existing = stakeholders.find((person) => (
          normalizeEntityName(person.name) === normalizeEntityName(personName)
          && accountKey(person.accountName) === accountKey(accountName)
        ));
        if (existing && isMoreRecentBusinessDate(activityDate, existing.lastInteractionDate)) {
          const updated = await updateStakeholder(existing, { ...stakeholderToFormInput(existing), lastInteractionDate: activityDate }, dataUserId);
          setStakeholders((current) => current.map((person) => (person.id === existing.id ? updated.stakeholder : person)));
        }
      }

      const result = await saveSalesActivity(log.activity, dataUserId, {
        source: workspaceTag.source,
        isSample: sampleDataActive,
      });
      setActivities((current) => [result.record, ...current]);

      if (!item.done) {
        const record = createPlanItemToggleRecord(item, true, records, workspaceTag);
        if (record) {
          setRecords(savePlanItem(record));
          // Fires for typed items too. It used to return early for them, so a
          // week spent on the operator's own work counted as zero kept.
          trackProductEvent('commitment_completed');
        }
      }
      // Step 3 of the demo path: the promise was kept and the conversation
      // behind it is on the record. Nothing happens outside the sandbox.
      if (sampleDataActive) markDemoJourneyStepComplete('record-the-week', 'Recorded a finished promise on the plan');
      setBoardMessage(result.warning || planCompletionLogMessage(log.accountName, log.activity.activityChannel, personName));
      closeRecord();
    } catch {
      setRecordSaving(false);
      setRecordError('Could not save it. What you wrote is still here - try again.');
    }
  }, [closeRecord, dataUserId, opportunities, recordSaving, recordingItem, records, sampleDataActive, stakeholders]);

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
        const updated = await updateSalesActivityDetails(activity, changes, dataUserId);
        carryCompletionStub(item, buildCaptureDerivedKey(activity.id, targetDate, target.slot), targetDate);
        setActivities((current) => current.map((candidate) => (candidate.id === activity.id ? updated : candidate)));
        return;
      }

      // Three kinds of record can raise an obligation, and the message has to
      // name the right one or it sends the operator to the wrong screen. The
      // detail drawer answers the same question, from the same sentence.
      setBoardMessage(planObligationOwnerMessage(item));
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
        const updated = await updateSalesActivityDetails(activity, changes, dataUserId);
        setActivities((current) => current.map((candidate) => (candidate.id === activity.id ? updated : candidate)));
      }
    } catch {
      setBoardMessage('Could not save that edit. The original wording stands.');
    }
  }, [activities, dataUserId, editDraft, opportunities, records]);

  /**
   * Opens one line in full, with the draft read from the record that owns it
   * rather than from the card - the card's wording is condensed to fit a day
   * column, and editing that would silently truncate the operator's sentence.
   */
  const openDetail = useCallback((item: PlanItem) => {
    setEditingId('');
    setDetailError('');
    setDetailItem(item);
    setDetailDraft(buildPlanItemEditDraft(item, { records, opportunities, activities }));
  }, [activities, opportunities, records]);

  const closeDetail = useCallback(() => {
    setDetailItem(null);
    setDetailDraft(null);
    setDetailError('');
    setDetailSaving(false);
  }, []);

  /**
   * Saves the whole draft in one write per record.
   *
   * One write, not one per field: a day change followed by a customer change
   * would read the second from state the first had not landed in yet, and the
   * later write would put the older value back.
   */
  const saveDetail = useCallback(async () => {
    if (!detailItem || !detailDraft) return;
    const policy = planItemEditPolicy(detailItem);
    const target = getPlanItemWriteTarget(detailItem);
    setDetailSaving(true);
    setDetailError('');
    setBoardMessage('');

    try {
      if (target.kind === 'personal') {
        const existing = records.find((record) => record.id === target.recordId);
        if (!existing) throw new Error('missing record');
        setRecords(savePlanItem(applyPersonalPlanEdit(existing, detailDraft)));
        closeDetail();
        return;
      }

      if (target.kind === 'deal') {
        const opportunity = opportunities.find((candidate) => candidate.id === target.opportunityId);
        if (!opportunity) throw new Error('missing deal');
        // Only the two fields this board is allowed to touch. The customer and
        // the decision maker are the deal's own, and the drawer shows them
        // locked with a link rather than pretending otherwise.
        const result = await updateOpportunity(
          opportunity,
          {
            ...opportunityToFormInput(opportunity),
            nextAction: detailDraft.label.trim() || opportunity.nextAction,
            nextActionDate: detailDraft.date || opportunity.nextActionDate,
          },
          dataUserId,
        );
        carryCompletionStub(detailItem, buildDealDerivedKey(opportunity.id, result.opportunity.nextActionDate), result.opportunity.nextActionDate);
        setOpportunities((current) => current.map((candidate) => (candidate.id === opportunity.id ? result.opportunity : candidate)));
        if (result.warning) setBoardMessage(result.warning);
        closeDetail();
        return;
      }

      if (target.kind === 'capture') {
        const activity = activities.find((candidate) => candidate.id === target.activityId);
        if (!activity) throw new Error('missing touch');
        const changes = buildCaptureEditChanges({ activity, item: detailItem, slot: target.slot, draft: detailDraft });
        const updated = await updateSalesActivityDetails(activity, changes, dataUserId);
        const nextDate = planItemEditDate(detailItem, detailDraft);
        carryCompletionStub(detailItem, buildCaptureDerivedKey(activity.id, nextDate, target.slot), nextDate);
        setActivities((current) => current.map((candidate) => (candidate.id === activity.id ? updated : candidate)));
        closeDetail();
        return;
      }

      setDetailError(policy.lockedReason);
      setDetailSaving(false);
    } catch {
      setDetailError('Could not save that. Nothing was changed — the record still says what it said.');
      setDetailSaving(false);
    }
  }, [activities, carryCompletionStub, closeDetail, dataUserId, detailDraft, detailItem, opportunities, records]);

  const addPersonalItem = useCallback((date: string) => {
    const label = draft.trim();
    if (!label) return;
    setRecords(savePlanItem(createPersonalPlanRecord({
      date,
      label,
      linkedOpportunityId: draftLink?.opportunityId,
      linkedAccountName: draftLink?.accountName,
      linkedBrand: draftLink?.brand,
      channel: draftChannel,
      source: sampleDataActive ? 'demo' : 'user',
      isSample: sampleDataActive,
    })));
    setDraft('');
    setDraftLink(null);
    setDraftChannel('');
    trackProductEvent('commitment_created');
  }, [draft, draftChannel, draftLink, sampleDataActive]);

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
        keyAccountNames,
      })
      : []
  ), [activities, board.rangeEnd, board.rangeStart, keyAccountNames, opportunities, periodType, recommendations, records]);

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

  // Empty weekend days stay hidden - most weeks do not use them and two dead
  // columns cost a third of the board. But hidden and unreachable are different
  // things: with Saturday and Sunday both empty there was no way to plan
  // anything onto them, while the suggestion list below happily offered
  // "Sun Aug 16" as a date. The toggle is the missing half.
  const hiddenWeekendDays = periodType === 'week'
    ? board.days.filter((day) => day.isWeekend && day.items.length === 0).length
    : 0;
  const visibleDays = periodType === 'week' && !showWeekend
    ? board.days.filter((day) => !day.isWeekend || day.items.length > 0)
    : board.days;
  const today = todayDateKey();

  return (
    /* The anchor the commitment panel above scrolls to. Its "On your Plan"
       chip pointed at `/app/timeline?view=upcoming` - the page it was already
       on - so the one route from a promise to the place it can be ticked was a
       link that did nothing. */
    <div id={PLAN_BOARD_ANCHOR_ID} className={embedded ? 'flex flex-col gap-4' : 'mx-auto flex max-w-[1600px] flex-col gap-4 px-4 py-6 sm:px-6'}>
      {/* The week's ranked moves, then what is already promised, then the days.
          The importers stay below the board.

          These suggestions sat under the calendar until 2026-09-09, on the
          reasoning that the calendar is what the operator came to read and
          advice above it is something to scroll past. That was right about the
          importers and wrong about this panel: the board is execution
          machinery, and putting the only judgement on the page beneath five
          screens of grid made the week look like a scheduling exercise rather
          than a set of commercial choices. The panel proposes at most a handful
          of items and every one of them is refusable, so it costs a few lines
          above the fold and answers the question the board cannot: of all the
          days in front of me, which of these matter. */}
      <PlanSuggestionsPanel
        suggestions={suggestions}
        days={board.days}
        onAccept={acceptSuggestion}
        onDismiss={dismissSuggestion}
      />

      {beforeBoard}

      <header className={`flex flex-col gap-3 sm:flex-row sm:items-center ${embedded ? 'sm:justify-between' : 'sm:justify-between'}`}>
        {!embedded && (
          <div>
            <div className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-brand-blue" />
              <h1 className="font-display text-2xl font-bold text-ink">Plan</h1>
              <DataModePill
                compact
                isLoading={authLoading}
                isAuthenticated={isAuthenticated}
                isSupabaseConfigured={isSupabaseConfigured}
                cloudAvailable={canUseSalesActivityCloudStore(dataUserId)}
                hasSampleData={sampleDataActive}
              />
            </div>
            <p className="mt-1 text-sm text-tint-neutral-ink">
              Your week as days. Dated commitments already in Memoire appear on their own; add anything else the week needs.
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            aria-label="Previous period"
            onClick={() => setAnchorDate((current) => shiftPlanAnchor(current, periodType, -1))}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-line bg-white text-tint-neutral-ink transition hover:text-ink"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[150px] text-center font-display text-sm font-bold text-ink">{formatPlanRangeLabel(board)}</span>
          <button
            type="button"
            aria-label="Next period"
            onClick={() => setAnchorDate((current) => shiftPlanAnchor(current, periodType, 1))}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-line bg-white text-tint-neutral-ink transition hover:text-ink"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setAnchorDate(new Date())}
            className={`${ghostPillClass} ml-1 !px-3.5 !py-1.5`}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Today
          </button>
        </div>

        <Segmented
          label="Board period"
          value={periodType}
          onChange={setPeriodType}
          options={periodOptions}
        />
      </header>

      <WeekSummaryStrip summary={summary} periodType={periodType} />

      {/* Who the week is for, and where its lines came from. The strip above
          answers how much of it is done; this line answers who it serves, which
          is the question a distributor's week could never be asked before -
          every line without a customer used to read as the same
          undifferentiated admin. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-tint-neutral-ink">
        {board.totalCount > 0 && (
          <>
            {/* Label first, count second - the same shape as the filter chips on
                Accounts and Opportunities. Written the other way round these read
                "2 customer", which is a count looking for a plural it never gets:
                the word is the kind of work, not the thing being counted. */}
            <MicroLabel>This week serves</MicroLabel>
            {board.workSplit.customer > 0 && (
              <MicroPill tone="blue" className="!normal-case !tracking-normal !text-[11.5px]">Customer {board.workSplit.customer}</MicroPill>
            )}
            {board.workSplit.principal > 0 && (
              <MicroPill tone="violet" className="!normal-case !tracking-normal !text-[11.5px]">Principal {board.workSplit.principal}</MicroPill>
            )}
            {board.workSplit.internal > 0 && (
              <MicroPill tone="neutral" className="!normal-case !tracking-normal !text-[11.5px]">
                Internal {board.workSplit.internal}
                {/* The domain breakdown only earns its place when it says
                    something the count did not. A week whose internal work is all
                    admin would otherwise read "3 internal - 3 internal". */}
                {describeInternalDomains(board.workSplit.internalByDomain)}
              </MicroPill>
            )}
          </>
        )}
        {board.captureCount > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-tint-green-solid" />
            {board.captureCount} pulled in from your captures
          </span>
        )}
        {periodType === 'week' && (hiddenWeekendDays > 0 || showWeekend) && (
          <button
            type="button"
            onClick={() => setShowWeekend((value) => !value)}
            className="font-semibold text-brand-blue underline-offset-2 hover:underline"
          >
            {showWeekend ? 'Hide the empty weekend' : 'Show the weekend'}
          </button>
        )}
        {commitment && (
          <Link to="/app/reviews" className="font-bold text-brand-blue hover:underline sm:ml-auto">
            {commitment.items.length} commitments confirmed for this week
          </Link>
        )}
      </div>

      {accountMessage && (
        <p className="rounded-[13px] bg-tint-green-bg px-4 py-2.5 text-sm font-semibold text-tint-green-ink">
          {accountMessage}
        </p>
      )}

      {boardMessage && (
        <p className="rounded-[13px] bg-tint-amber-bg px-4 py-2.5 text-sm font-semibold text-tint-amber-ink">
          {boardMessage}
        </p>
      )}

      {board.totalCount === 0 && suggestions.length === 0 && (
        <Panel className="px-6 py-7 text-center">
          <p className="font-display text-sm font-bold text-ink">Nothing dated in this period yet.</p>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-tint-neutral-ink">
            Capture a touch with a due date and it lands here on its own — nothing to re-type. Deals and payments you owe
            fill in too, and you can always add your own items to a day below.
          </p>
          <Link
            to="/app/capture?mode=quick"
            className="mt-4 inline-flex rounded-full bg-brand-blue px-4 py-2 font-display text-sm font-semibold text-white shadow-btn-blue hover:bg-brand-blue-dark"
          >
            Capture activity
          </Link>
        </Panel>
      )}

      <div className={`grid gap-3.5 ${
        periodType === 'week'
          ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5'
          : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7'
      }`}>
        {visibleDays.map((day, dayIndex) => (
          <section
            key={day.date}
            aria-label={`${day.weekdayLabel} ${day.dayLabel}${day.isToday ? ', today' : ''}`}
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
            style={periodType === 'week' ? delay(100 + dayIndex * 40) : undefined}
            className={`flex min-w-0 flex-col overflow-hidden rounded-tile bg-white ${periodType === 'week' ? 'animate-rise' : ''} ${
              day.isToday ? 'shadow-today outline outline-2 -outline-offset-2 outline-brand-blue' : 'shadow-panel'
            } ${
              dragItem && dragOverDate === day.date && dragItem.date !== day.date ? 'ring-2 ring-brand-blue/40' : ''
            }`}
          >
            <header className={`flex items-baseline justify-between gap-2 px-[15px] py-[13px] ${day.isToday ? 'bg-brand-blue' : 'border-b border-line'}`}>
              <h2 className={`font-display text-[13.5px] font-bold ${day.isToday ? 'text-white' : 'text-ink'}`}>
                {periodType === 'week' ? day.weekdayLabel.slice(0, 3) : day.dayLabel}{' '}
                <span className={`font-mono text-[11.5px] font-normal ${day.isToday ? 'text-white/85' : 'text-muted'}`}>
                  {periodType === 'week' ? day.date.slice(8, 10) : day.weekdayLabel.slice(0, 3)}
                </span>
              </h2>
              <DayCountPill day={day} today={today} />
            </header>

            <div className="flex flex-1 flex-col gap-2 p-[11px]">
              {day.items.map((item) => {
                const editable = item.kind !== 'obligation';
                const isEditing = editingId === item.id;
                const state = item.done ? 'done' : item.overdue ? 'late' : 'open';
                const chip = {
                  done: { ground: 'bg-tint-green-bg', text: 'text-tint-green-ink', meta: 'text-tint-green-solid' },
                  late: { ground: 'bg-tint-red-bg', text: 'font-semibold text-tint-red-ink', meta: 'text-tint-red-solid' },
                  open: { ground: 'bg-tint-neutral-bg', text: 'text-ink', meta: 'text-tint-neutral-ink' },
                }[state];
                // A finished line says whether it reached Activity, and with
                // whom - the record is the point of finishing it.
                const recorded = item.done ? findPlanCompletionActivity(item, activities) : undefined;
                const meta = [
                  item.channel,
                  state === 'done'
                    ? (recorded ? `done${recorded.stakeholderName ? ` · with ${recorded.stakeholderName}` : ' · recorded'}` : 'done · not recorded')
                    : state === 'late'
                      /* A carried promise says the day it was actually owed.
                         "Overdue" alone, on a card sitting under today's
                         column, reads as "late this morning" - and the ones
                         this board was dropping were five months late. */
                      ? (item.carriedFrom ? `Was due ${formatSafeBusinessDate(item.carriedFrom)}` : 'Overdue')
                      : planItemSourceLabel(item),
                ].filter(Boolean).join(' · ');
                return (
                <Fragment key={item.id}>
                <div
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
                  className={`group flex items-start gap-2 rounded-[11px] px-[11px] py-[10px] transition-transform ${chip.ground} ${
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
                      className={`mt-[2px] h-3.5 w-3.5 ${item.done ? 'accent-tint-green-solid' : ''}`}
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
                        className="w-full rounded-md border border-brand-blue/60 bg-white px-1.5 py-0.5 text-xs outline-none focus:ring-2 focus:ring-brand-blue/20"
                      />
                    ) : (
                    <p className={`text-[11.5px] leading-[1.45] ${chip.text}`}>
                      {/* The strike lives on the sentence, never on the row.
                          Ticking an item used to grey the customer's chip and
                          put a line through it along with the words - a
                          finished column read as a list of cancelled
                          customers, and *who the work was for* is the one thing
                          an operator scans a done week to find. Keeping
                          `line-through` off this wrapper is what guarantees it:
                          the chip cannot inherit a decoration its container
                          does not carry, so the fix does not rest on how a
                          given engine treats atomic inlines. */}
                      {item.tag && (
                        <SubjectChip
                          relation={resolvePlanItemSubject(item, subjectContext, accountAliases)}
                          label={item.tag}
                          size="compact"
                          className="mr-1"
                        />
                      )}
                      {item.href && !item.done ? (
                        <Link to={item.href} className="hover:text-brand-blue hover:underline">{item.label}</Link>
                      ) : editable ? (
                        <button
                          type="button"
                          onClick={() => startEdit(item)}
                          className={`text-left hover:text-brand-blue ${item.done ? 'line-through' : ''}`}
                          title="Edit"
                        >
                          {item.label}
                        </button>
                      ) : (
                        <span className={item.done ? 'line-through' : ''}>{item.label}</span>
                      )}
                      {/* Who it is with, when the record names somebody the
                          sentence does not. An edit whose result never shows on
                          the board is an edit the operator reads as lost, so
                          the contact they just set has to be visible here - and
                          repeating a name already written into the line would
                          be noise, which is what the second test rules out. */}
                      {item.contactName && !labelNamesContact(item.label, item.contactName) && (
                        <span className="ml-1 whitespace-nowrap text-[11px] font-semibold opacity-80">
                          · {item.contactName}
                        </span>
                      )}
                    </p>
                    )}
                    {/* What kind of day this line asks for, and where it stands.
                        The channel shows only when the operator said - the board
                        never guesses one, so a channel here always means
                        somebody chose it. */}
                    {!isEditing && meta && (
                      <p className={`mt-1 text-[10px] font-bold uppercase tracking-[0.06em] ${chip.meta}`}>{meta}</p>
                    )}
                    {/* Done before recording was part of finishing - or ticked
                        on another device - so the record can still be written. */}
                    {!isEditing && item.done && !recorded && (
                      <button
                        type="button"
                        onClick={() => { setRecordingItem(item); setRecordError(''); }}
                        className="mt-1 text-[11px] font-bold text-brand-blue-dark underline-offset-2 hover:underline"
                      >
                        Record what happened
                      </button>
                    )}
                  </div>
                  {/* The pencil opens the line in full - day, customer,
                      contact, wording - rather than repeating the click on the
                      sentence, which already starts an inline edit. It is
                      offered on obligations too: a line that cannot be changed
                      here still owes the operator an answer to "why not, and
                      where do I change it", and refusing to open said nothing. */}
                  {!isEditing && (
                    <button
                      type="button"
                      aria-label={`Edit details of ${item.label}`}
                      title="Edit details"
                      onClick={() => openDetail(item)}
                      className="row-action relative shrink-0 rounded p-0.5 text-tint-neutral-ink opacity-0 transition after:absolute after:-inset-1.5 after:content-[''] hover:bg-white hover:text-ink group-hover:opacity-100"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                  )}
                  {item.kind === 'personal' && !isEditing && (
                    <button
                      type="button"
                      aria-label={`Remove ${item.label}`}
                      onClick={() => removePersonalItem(item.id)}
                      className="row-action shrink-0 rounded p-0.5 text-tint-neutral-ink opacity-0 transition hover:bg-white hover:text-ink group-hover:opacity-100"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
                </Fragment>
                );
              })}

              {composerDate === day.date ? (
                <div className="rounded-[11px] bg-white p-2 ring-1 ring-line">
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={draft}
                      autoFocus
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') { event.preventDefault(); addPersonalItem(day.date); }
                        if (event.key === 'Escape') { setComposerDate(''); setDraft(''); setDraftLink(null); setDraftChannel(''); }
                      }}
                      placeholder="[Internal] Submit KPI"
                      aria-label={`Add an item to ${day.weekdayLabel}`}
                      className="min-w-0 flex-1 rounded-md border border-line px-2 py-1 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => addPersonalItem(day.date)}
                      className="shrink-0 rounded-md bg-brand-blue px-2 py-1 text-xs font-bold text-white hover:bg-brand-blue-dark"
                    >
                      Add
                    </button>
                  </div>
                  {/* What kind of day this line is asking for. Optional, and
                      blank by default - most lines do not need it. Two that do:
                      a visit, because the week has to show which days leave the
                      office, and "Out of office", because a public holiday is
                      something you write onto next week's calendar and there is
                      no touch to hang it on. The tick that completes the line
                      carries this onto the activity. */}
                  <select
                    value={draftChannel}
                    onChange={(event) => setDraftChannel((event.target.value || '') as ActivityChannel | '')}
                    aria-label={`How this ${day.weekdayLabel} item will happen`}
                    className="mt-1 w-full rounded-md border border-line bg-white px-1.5 py-1 text-[11px] font-semibold text-tint-neutral-ink"
                  >
                    <option value="">How? (optional)</option>
                    {ACTIVITY_CHANNELS.map((spec) => (
                      <option key={spec.channel} value={spec.channel}>{spec.channel}</option>
                    ))}
                  </select>
                  {draftLink && (
                    <span className="mt-1.5 inline-flex max-w-full items-center gap-1.5 rounded-full bg-tint-blue-bg px-2 py-0.5 text-[11px] font-bold text-tint-blue-ink">
                      <span className="truncate">Linked: {draftLink.display}</span>
                      <button
                        type="button"
                        aria-label="Remove link"
                        onClick={() => setDraftLink(null)}
                        className="shrink-0 opacity-70 hover:opacity-100"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  )}
                  {draftLink && !draft.trim() && (
                    <p className="mt-1 text-[11px] font-semibold text-tint-neutral-ink">
                      Linked. Now type what you will do — “Send price + CoA”.
                    </p>
                  )}
                  {draftLinkOptions.length > 0 && (
                    <div className="mt-1.5 overflow-hidden rounded-lg border border-line bg-white shadow-seg">
                      <p className="border-b border-line bg-canvas px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-muted">
                        Link to
                      </p>
                      {draftLinkOptions.map((option) => (
                        <button
                          key={option.key}
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            setDraftLink(option);
                            // The name is now the chip. Leaving it in the box
                            // too is how a line ends up saying "Samil" beside a
                            // Samil tag.
                            // Only the customer's own name, never the deal
                            // title: "3-Manifold" is what the work is about and
                            // has to survive in the text.
                            setDraft((current) => stripPlanLinkFromDraft(current, option.accountName || option.brand || option.display));
                          }}
                          title={option.display}
                          className="flex w-full items-start gap-1.5 px-2 py-1.5 text-left text-[11px] font-semibold text-gray-700 hover:bg-tint-blue-bg hover:text-tint-blue-ink"
                        >
                          <span className={`mt-px shrink-0 rounded px-1 py-0.5 text-[9px] font-bold uppercase ${
                            option.kind === 'deal'
                              ? 'bg-tint-blue-bg text-tint-blue-ink'
                              : option.kind === 'brand'
                                ? 'bg-tint-violet-bg text-tint-violet-ink'
                                : 'bg-tint-cyan-bg text-tint-cyan-ink'
                          }`}>
                            {planLinkKindLabel(option.kind)}
                          </span>
                          {/* Wraps rather than truncates. The tail of one of
                              these rows is the part that tells two deals on the
                              same customer apart - "Samil / Air Sampler" from
                              "Samil / 3-Manifold" - so an ellipsis on a narrow
                              day column hid the only distinguishing text. */}
                          <span className="min-w-0 flex-1 whitespace-normal break-words leading-4">{option.display}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => { setComposerDate(day.date); setDraft(''); setDraftLink(null); }}
                  className="mt-auto flex w-full items-center gap-[7px] rounded-[11px] bg-chip px-[11px] py-[9px] text-[11.5px] font-semibold text-tint-neutral-ink transition hover:text-brand-blue"
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={2.2} />
                  Add a plan item
                </button>
              )}
            </div>
          </section>
        ))}
      </div>

      <PlanTagAccountsPanel
        candidates={tagAccountCandidates}
        creating={creatingAccount}
        onCreate={createAccountFromTag}
        onDismiss={(candidate) => setDismissedTagKeys((current) => [...current, candidate.name])}
      />

      <PlanPasteImportPanel days={board.days} records={records} onImport={importPastedWeek} />

      <p className="text-xs leading-5 text-muted">
        Items in green were pulled in from a capture - you wrote them once, they landed here on their own. Drag any item
        to another day to reschedule it, or open the pencil to change the day, the customer, the person you are seeing
        and the wording together - all of it writes straight into the deal or touch it came from. Checking an item
        opens its record: how it happened, who at the customer it was with, and what was said. It is done when that
        is saved, and it lands on Activity, on the customer&apos;s history and on the stakeholder&apos;s record. The
        record still moves no deal, so a stage change is still yours to make.
      </p>

      {recordingItem && (
        <RecordPlanActivityDrawer
          item={recordingItem}
          opportunities={opportunities}
          people={contactOptions}
          saving={recordSaving}
          error={recordError}
          onSave={(values) => { void recordCompletion(values); }}
          onClose={closeRecord}
        />
      )}

      {detailItem && detailDraft && (
        <PlanItemDetailDrawer
          item={detailItem}
          draft={detailDraft}
          onDraftChange={setDetailDraft}
          opportunities={opportunities}
          activities={activities}
          accountNames={knownAccountNames}
          brands={knownBrands}
          contacts={contactOptions}
          saving={detailSaving}
          error={detailError}
          onSave={() => void saveDetail()}
          onDelete={detailItem.kind === 'personal'
            ? () => { removePersonalItem(detailItem.id); closeDetail(); }
            : undefined}
          onClose={closeDetail}
        />
      )}
    </div>
  );
}

/**
 * Where an open line came from, when it did not come from the operator's hand.
 * A done or late line says its state instead; a line typed onto the day says
 * nothing, because the operator knows they wrote it.
 */
function planItemSourceLabel(item: PlanItem) {
  if (item.kind === 'deal') return 'Deal next step';
  if (item.kind === 'capture') return 'From a capture';
  if (item.kind === 'obligation') return 'You owe';
  return '';
}

/**
 * The count at the top of a day, coloured by how that day went.
 *
 * All done reads green. A day already past with work still open reads amber -
 * not red, because the lines themselves carry the red and a column header
 * shouting as well is the same alarm twice. A day still ahead with nothing done
 * is simply open.
 */
function DayCountPill({ day, today }: { day: PlanDay; today: string }) {
  const total = day.items.length;
  const done = day.doneCount;
  if (day.isToday) {
    return (
      <span className="rounded-full bg-white px-2 py-[3px] text-[10px] font-bold uppercase tracking-[0.07em] text-brand-blue">
        {total > 0 ? `Today ${done}/${total}` : 'Today'}
      </span>
    );
  }
  if (total === 0) return null;
  if (done === total) return <MicroPill tone="green">{done}/{total}</MicroPill>;
  if (day.date < today) return <MicroPill tone="amber">{done}/{total}</MicroPill>;
  if (done === 0) return <MicroPill tone="neutral">Open {total}</MicroPill>;
  return <MicroPill tone="neutral">{done}/{total}</MicroPill>;
}

/** One colour per kind of day, in the ACTIVITY_CHANNELS order, unstated last and quiet. */
const CHANNEL_COLOUR: Record<string, string> = {
  'On-site visit': '#1976D2',
  'Hosted visit': '#43A047',
  'Online meeting': '#00ACC1',
  'Phone call': '#7B1FA2',
  'Cold outreach': '#C2185B',
  'Email / message': '#3949AB',
  Event: '#0E7490',
  'Desk work': '#E8891A',
  'Out of office': '#90A4AE',
  [NOT_STATED_CHANNEL]: '#D5DBE3',
};

/**
 * The week in one line: how much is done against the week before, how the work
 * happens, and how much of it arrived from the records rather than by hand.
 *
 * "Not stated" is a slice, not a gap. Most lines carry no channel - a deal's
 * next step does not say whether it is a call - and a bar that quietly dropped
 * them would describe a week made only of the few lines somebody labelled.
 */
function WeekSummaryStrip({ summary, periodType }: { summary: PlanBoardSummary; periodType: PlanPeriod }) {
  const percentTone = summary.donePercent === null
    ? 'text-muted'
    : summary.donePercent >= 70 ? 'text-tint-green-solid' : summary.donePercent >= 40 ? 'text-tint-amber-solid' : 'text-tint-red-solid';
  const deltaTone = summary.deltaPoints === null || summary.deltaPoints === 0
    ? 'text-muted'
    : summary.deltaPoints > 0 ? 'text-tint-green-solid' : 'text-tint-red-solid';
  const previousName = periodType === 'week' ? 'last week' : 'last month';

  return (
    <Panel className="flex animate-rise flex-col gap-4 px-[22px] py-[18px] lg:flex-row lg:items-center lg:gap-7" style={delay(60)} aria-label="This period at a glance">
      <div className="shrink-0">
        <MicroLabel>Done</MicroLabel>
        <span className="mt-1.5 flex items-baseline gap-[7px]">
          <span className={`font-display text-[30px] font-extrabold leading-none tracking-[-0.03em] ${percentTone}`}>
            {summary.donePercent === null ? '—' : `${summary.donePercent}%`}
          </span>
          {summary.deltaPoints !== null && (
            <span className={`text-xs font-semibold ${deltaTone}`} title={`Against ${previousName}`}>
              {summary.deltaPoints > 0 ? '+' : summary.deltaPoints < 0 ? '−' : '±'}{Math.abs(summary.deltaPoints)} pts
            </span>
          )}
        </span>
        <span className="mt-1 block text-[11px] text-muted">
          {summary.total === 0 ? 'Nothing on the board' : `${summary.done} of ${summary.total}${summary.deltaPoints !== null ? ` · vs ${previousName}` : ''}`}
        </span>
      </div>

      <div aria-hidden="true" className="hidden w-px self-stretch bg-line lg:block" />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[11.5px] text-tint-neutral-ink">How the work happens</span>
          <span className="text-[11px] text-muted">{summary.total} {summary.total === 1 ? 'item' : 'items'}</span>
        </div>
        <div
          role="img"
          aria-label={summary.channelMix.map((slice) => `${slice.channel} ${slice.count}`).join(', ') || 'No items'}
          className="mt-2 flex h-3 overflow-hidden rounded-full bg-track"
        >
          {summary.channelMix.map((slice, index) => (
            <span
              key={slice.channel}
              className="h-full origin-left animate-grow-h"
              style={{
                width: `${(slice.count / summary.total) * 100}%`,
                background: CHANNEL_COLOUR[slice.channel] || CHANNEL_COLOUR[NOT_STATED_CHANNEL],
                animationDelay: `${250 + index * 70}ms`,
              }}
            />
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-[18px] gap-y-1">
          {summary.channelMix.map((slice) => (
            <span key={slice.channel} className="inline-flex items-center gap-1.5 text-[11.5px] text-tint-neutral-ink">
              <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: CHANNEL_COLOUR[slice.channel] || CHANNEL_COLOUR[NOT_STATED_CHANNEL] }} />
              {slice.channel} {slice.count}
            </span>
          ))}
        </div>
      </div>

      <div aria-hidden="true" className="hidden w-px self-stretch bg-line lg:block" />

      <div className="shrink-0 lg:text-right">
        <MicroLabel>From records / by hand</MicroLabel>
        <span className="mt-1.5 block font-mono text-[22px] font-bold text-ink">
          {summary.fromRecords} / {summary.addedByHand}
        </span>
      </div>
    </Panel>
  );
}

/**
 * Whether the line already says the contact's name.
 *
 * "Follow up Mr. Phuoc" with Mr. Phuoc as the contact does not need "· Mr.
 * Phuoc" after it. Matched on the surname-ish last word as well as the whole
 * string, because the sentence is usually written with less of the name than
 * the record holds.
 */
function labelNamesContact(label: string, contactName: string) {
  // Both sides folded the same way, so "Nguyễn Văn Đức" written into the line
  // and "Nguyen Van Duc" on the record are recognised as one person rather than
  // printed twice on the same card.
  const haystack = normalizeSearchText(label);
  const name = normalizeSearchText(contactName);
  if (!name) return true;
  if (haystack.includes(name)) return true;
  const parts = name.split(' ').filter((part) => part.length >= 3);
  const distinctive = parts[parts.length - 1];
  return Boolean(distinctive && haystack.includes(distinctive));
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
