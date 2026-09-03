import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarCheck, Check } from 'lucide-react';
import type { CrmLiteOpportunity } from '../../services/opportunityStore';
import type { QuoteRecord } from '../../services/quoteStore';
import type { ExpenseRecord } from '../../services/expenseStore';
import { saveSalesActivity, type SalesActivityRecord } from '../../services/salesActivityStore';
import { getCachedSalesWorkspaceData, loadSalesWorkspaceData } from '../../services/workspaceData';
import {
  loadPlanItemsForWorkspace,
  savePlanItem,
  PLAN_ITEMS_UPDATED_EVENT,
} from '../../services/planItemStore';
import { buildOwnObligations } from '../../utils/ownObligations';
import {
  buildPlanBoard,
  createPlanItemToggleRecord,
  getPlanItemWriteTarget,
  planWorkTone,
  type PlanItem,
  type PlanRecord,
} from '../../utils/weeklyPlan';
import { todayDateKey } from '../../utils/safeDate.ts';
import { trackProductEvent } from '../../utils/productAnalytics';
import { buildPlanCompletionActivity, planCompletionLogMessage } from '../../utils/planCompletionLog';
import { LogToActivityBox, type LogToActivityDraft } from '../../components/common/LogToActivityBox';
import { normalizeActivityChannel, type ActivityChannel } from '../../utils/activityChannel';
import { TodayTaskDrawer } from './TodayTaskDrawer';

type StripWorkspace = {
  opportunities: CrmLiteOpportunity[];
  quotes: QuoteRecord[];
  expenses: ExpenseRecord[];
  activities: SalesActivityRecord[];
};

/**
 * Today and the plan are the same data at two altitudes. This strip shows the
 * plan's own column for today - the deals, obligations and captured next actions
 * dated for right now - and lets each one be ticked. The tick writes to the very
 * same store the Plan board uses, so checking a box here checks it there, and a
 * box checked on the board arrives here live. Nothing is a second copy; the
 * seller runs the day from Today without ever re-recording what the plan holds.
 *
 * It is deliberately not the whole of Today: undated alarms (a deal gone quiet,
 * a missing champion) stay in the watch-list, because they are warnings, not
 * commitments with a day attached.
 *
 * Two things the strip deliberately does NOT do:
 *
 *   1. It does not navigate. The label used to be a link, so working through a
 *      six-item day meant six trips off Today and six trips back. It now asks
 *      the page to open the item in place; only the drawer's explicit "Open the
 *      record" leaves.
 *   2. It does not log work by itself. Ticking a box records that the plan was
 *      kept, and that is all it records. What actually happened - who you spoke
 *      to, what they said - is a touch, and a touch is only ever written when
 *      the operator asks for it, in the box that appears under a completed item.
 *      That box is off by default on purpose: a workspace that logs a touch for
 *      every ticked checkbox fills its own history with rows that say nothing,
 *      and worse, quietly tells the going-silent watch that the customer was
 *      contacted when nobody contacted them.
 */
export function TodayCommitmentStrip({
  userId,
  sampleDataActive,
  onOpenDeal,
  onActivityLogged,
}: {
  userId?: string;
  sampleDataActive: boolean;
  /**
   * A task that belongs to a deal opens the deal quick look Today already owns -
   * it says strictly more than a task drawer could. Everything else opens in the
   * task drawer below.
   */
  onOpenDeal?: (opportunityId: string) => void;
  /** A touch was written from here, so Today can re-read the workspace. */
  onActivityLogged?: () => void;
}) {
  const [workspace, setWorkspace] = useState<StripWorkspace | null>(null);
  const [records, setRecords] = useState<PlanRecord[]>([]);
  const [openItemId, setOpenItemId] = useState('');
  const [logDraft, setLogDraft] = useState<LogToActivityDraft | null>(null);
  const [logState, setLogState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [logMessage, setLogMessage] = useState('');
  const today = useMemo(() => todayDateKey(), []);

  useEffect(() => {
    let active = true;
    const cached = getCachedSalesWorkspaceData(userId);
    if (cached) {
      setWorkspace(pickWorkspace(cached));
    } else {
      void loadSalesWorkspaceData(userId).then((data) => {
        if (active) setWorkspace(pickWorkspace(data));
      });
    }
    return () => { active = false; };
  }, [userId]);

  // Subscribe to the plan store so a box ticked on the board - or on Capture -
  // updates this strip live, and vice versa, from one shared source.
  useEffect(() => {
    let active = true;
    void loadPlanItemsForWorkspace(userId, sampleDataActive).then((loaded) => {
      if (active) setRecords(loaded);
    });
    const onUpdate = (event: Event) => {
      const detail = (event as CustomEvent<PlanRecord[]>).detail;
      if (Array.isArray(detail)) setRecords(detail);
    };
    window.addEventListener(PLAN_ITEMS_UPDATED_EVENT, onUpdate);
    return () => { active = false; window.removeEventListener(PLAN_ITEMS_UPDATED_EVENT, onUpdate); };
  }, [userId, sampleDataActive]);

  const obligations = useMemo(
    () => (workspace ? buildOwnObligations({ expenses: workspace.expenses, quotes: workspace.quotes }).obligations : []),
    [workspace],
  );

  const board = useMemo(() => buildPlanBoard({
    periodType: 'week',
    opportunities: workspace?.opportunities || [],
    obligations,
    activities: workspace?.activities || [],
    records,
    today,
  }), [workspace, obligations, records, today]);

  const items = useMemo(
    () => board.days.find((day) => day.date === today)?.items || [],
    [board, today],
  );

  const dismissLog = useCallback(() => {
    setLogDraft(null);
    setLogState('idle');
    setLogMessage('');
  }, []);

  const toggleItem = useCallback((item: PlanItem) => {
    const nextDone = !item.done;
    const record = createPlanItemToggleRecord(item, nextDone, records, {
      source: sampleDataActive ? 'demo' : 'user',
      isSample: sampleDataActive,
    });
    if (!record) return;
    savePlanItem(record);
    trackProductEvent('commitment_completed');

    // Finishing something is the one moment the operator remembers what
    // happened, so the offer to write it down belongs here and nowhere else.
    // Unticking withdraws the offer rather than leaving an orphan form open.
    if (nextDone) {
      // Seeded from what the line was planned as, so an item written as an
      // on-site visit arrives here already saying so.
      setLogDraft({ item, note: '', enabled: false, channel: normalizeActivityChannel(item.channel) });
      setLogState('idle');
      setLogMessage('');
    } else if (logDraft?.item.id === item.id) {
      dismissLog();
    }
  }, [records, sampleDataActive, logDraft, dismissLog]);

  /**
   * Opening a task never leaves Today. A task that belongs to a deal - a deal's
   * own next action, or an item the operator linked to one - opens the deal
   * quick look; everything else opens the task drawer. The only navigation left
   * is the explicit "Open the record" inside either drawer.
   */
  const openItem = useCallback((item: PlanItem) => {
    const opportunityId = readItemOpportunityId(item);
    if (opportunityId && onOpenDeal) {
      onOpenDeal(opportunityId);
      return;
    }
    setOpenItemId(item.id);
  }, [onOpenDeal]);

  const saveLog = useCallback(async () => {
    if (!logDraft || logState === 'saving') return;
    const { item, note } = logDraft;
    const text = note.trim();
    if (!text) return;

    setLogState('saving');
    setLogMessage('');
    try {
      // Shared with the Plan board, so the same box ticked on either surface
      // produces the same record. See utils/planCompletionLog.ts.
      const log = buildPlanCompletionActivity({
        item,
        note: text,
        opportunities: workspace?.opportunities || [],
        activityDate: today,
        channel: logDraft.channel,
      });
      if (!log) return;

      const result = await saveSalesActivity(log.activity, userId, {
        source: sampleDataActive ? 'demo' : 'user',
        isSample: sampleDataActive,
      });

      setLogState('saved');
      setLogMessage(result.warning || planCompletionLogMessage(log.accountName, log.activity.activityChannel));
      onActivityLogged?.();
    } catch {
      setLogState('idle');
      setLogMessage('Could not log it. Your note is still here - try again.');
    }
  }, [logDraft, logState, workspace, today, userId, sampleDataActive, onActivityLogged]);

  // Nothing dated for today is not a gap to fill with a prompt - the plan simply
  // has nothing for this day, and the strip stays out of the way.
  if (items.length === 0) return null;

  const doneCount = items.filter((item) => item.done).length;
  const allDone = doneCount === items.length;
  // Read back out of the live board rather than held in state, so a tick made
  // in the drawer redraws it instead of leaving a stale copy on screen.
  const openTask = items.find((item) => item.id === openItemId) || null;
  const openTaskActivity = openTask ? findCaptureActivity(openTask, workspace?.activities || []) : undefined;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm" aria-label="On your plan today">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CalendarCheck className="h-4 w-4 text-brand-blue" />
          <h2 className="text-sm font-bold text-navy">On your plan today ({doneCount}/{items.length})</h2>
        </div>
        <Link to="/app/timeline?view=upcoming" data-quick-look-exempt="true" className="text-xs font-bold text-brand-blue hover:underline">
          Open the week
        </Link>
      </div>
      <p className="mt-0.5 text-xs text-gray-500">
        Dated for today on your plan. Tick here or on the board — it is the same box.
      </p>

      <ul className="mt-3 space-y-1.5 text-xs leading-5">
        {items.map((item) => (
          <li key={item.id}>
            {/* The row is a label so the whole strip stays one big tick target,
                and the title inside it is a button rather than a link: it opens
                the task here instead of throwing the operator onto another tab
                mid-checklist. `stopPropagation` keeps opening from also
                toggling the box the label wraps. */}
            <label className={`flex cursor-pointer items-start gap-2 rounded-lg px-3 py-2 ${item.done ? 'bg-emerald-50' : 'bg-gray-50'}`}>
              <input
                type="checkbox"
                checked={item.done}
                onChange={() => toggleItem(item)}
                className="mt-0.5 h-4 w-4 shrink-0"
                aria-label={`Mark "${item.label}" ${item.done ? 'not done' : 'done'}`}
              />
              <span className="min-w-0 flex-1">
                {/* Keeps its colour once ticked, for the same reason as the
                    plan board: the sentence is what got done, the chip is who
                    it was for, and greying the customer out is what made a
                    finished day read as a day of cancelled customers. */}
                {item.tag && (
                  <span className={`mr-1.5 rounded px-1 py-0.5 text-[10px] font-bold ${planWorkTone(item)}`}>
                    {item.tag}
                  </span>
                )}
                <button
                  type="button"
                  onClick={(event) => { event.preventDefault(); event.stopPropagation(); openItem(item); }}
                  className={`text-left font-bold hover:underline ${item.done ? 'text-gray-400 line-through' : 'text-gray-900'}`}
                >
                  {item.label}
                </button>
                {item.overdue && !item.done && (
                  <span className="ml-1 rounded bg-red-50 px-1 py-0.5 text-[10px] font-bold text-red-700">Overdue</span>
                )}
              </span>
            </label>

            {logDraft?.item.id === item.id && (
              <LogToActivityBox
                draft={logDraft}
                state={logState}
                message={logMessage}
                onToggleEnabled={(enabled) => setLogDraft((current) => (current ? { ...current, enabled } : current))}
                onChangeNote={(note) => setLogDraft((current) => (current ? { ...current, note } : current))}
                onChangeChannel={(channel: ActivityChannel | '') => setLogDraft((current) => (current ? { ...current, channel } : current))}
                onSave={() => { void saveLog(); }}
                onDismiss={dismissLog}
              />
            )}
          </li>
        ))}
      </ul>

      {allDone && (
        <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700">
          <Check className="h-3.5 w-3.5" />
          Everything your plan asked for today is done.
        </p>
      )}

      {openTask && (
        <TodayTaskDrawer
          item={openTask}
          activity={openTaskActivity}
          onToggleDone={() => {
            toggleItem(openTask);
            // Close on the tick so the "log what you did" box under the row is
            // not left hidden behind the drawer that produced it.
            setOpenItemId('');
          }}
          onClose={() => setOpenItemId('')}
        />
      )}
    </section>
  );
}

/**
 * The offer to turn a ticked box into a record of what happened.
 *
 * Unchecked by default, and it writes nothing until there is a sentence to
 * write. The operator asked for exactly this shape: they want to be able to look
 * back at the day and the week, without the workspace filling up with rows that
 * only say "a checkbox was ticked".
 */
/**
 * The deal a task belongs to, if any: the deal item's own opportunity, or the
 * one a typed item was linked to when it was written.
 */
function readItemOpportunityId(item: PlanItem): string {
  const target = getPlanItemWriteTarget(item);
  if (target.kind === 'deal') return target.opportunityId;
  const match = /opportunityId=([^&]+)/.exec(item.href || '');
  return match ? decodeURIComponent(match[1]) : '';
}

/** The captured touch a capture item was derived from, while it still exists. */
function findCaptureActivity(item: PlanItem, activities: SalesActivityRecord[]) {
  const target = getPlanItemWriteTarget(item);
  if (target.kind !== 'capture') return undefined;
  return activities.find((activity) => activity.id === target.activityId);
}

function pickWorkspace(data: {
  opportunities: CrmLiteOpportunity[];
  quotes: QuoteRecord[];
  expenses: ExpenseRecord[];
  activities: SalesActivityRecord[];
}): StripWorkspace {
  return {
    opportunities: data.opportunities,
    quotes: data.quotes,
    expenses: data.expenses,
    activities: data.activities,
  };
}
