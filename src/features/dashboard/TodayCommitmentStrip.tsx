import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarCheck, Check } from 'lucide-react';
import type { CrmLiteOpportunity } from '../../services/opportunityStore';
import type { QuoteRecord } from '../../services/quoteStore';
import type { ExpenseRecord } from '../../services/expenseStore';
import type { SalesActivityRecord } from '../../services/salesActivityStore';
import { getCachedSalesWorkspaceData, loadSalesWorkspaceData } from '../../services/workspaceData';
import {
  loadPlanItemsForWorkspace,
  savePlanItem,
  PLAN_ITEMS_UPDATED_EVENT,
} from '../../services/planItemStore';
import { buildOwnObligations } from '../../utils/ownObligations';
import {
  buildPlanBoard,
  createDerivedCompletionRecord,
  planKindTone,
  type PlanItem,
  type PlanRecord,
} from '../../utils/weeklyPlan';
import { todayDateKey } from '../../utils/safeDate.ts';
import { trackProductEvent } from '../../utils/productAnalytics';

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
 */
export function TodayCommitmentStrip({
  userId,
  sampleDataActive,
}: {
  userId?: string;
  sampleDataActive: boolean;
}) {
  const [workspace, setWorkspace] = useState<StripWorkspace | null>(null);
  const [records, setRecords] = useState<PlanRecord[]>([]);
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

  const toggleItem = useCallback((item: PlanItem) => {
    if (item.kind === 'personal') {
      const existing = records.find((record) => record.id === item.id);
      if (!existing) return;
      savePlanItem({
        ...existing,
        done: !existing.done,
        doneAt: existing.done ? undefined : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } else {
      const existing = records.find((record) => record.derivedKey === item.derivedKey);
      savePlanItem(createDerivedCompletionRecord(item, !item.done, {
        existing,
        source: sampleDataActive ? 'demo' : 'user',
        isSample: sampleDataActive,
      }));
    }
    trackProductEvent('today_plan_item_checked');
  }, [records, sampleDataActive]);

  // Nothing dated for today is not a gap to fill with a prompt - the plan simply
  // has nothing for this day, and the strip stays out of the way.
  if (items.length === 0) return null;

  const doneCount = items.filter((item) => item.done).length;
  const allDone = doneCount === items.length;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm" aria-label="On your plan today">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CalendarCheck className="h-4 w-4 text-brand-blue" />
          <h2 className="text-sm font-bold text-navy">On your plan today ({doneCount}/{items.length})</h2>
        </div>
        <Link to="/app/plan" className="text-xs font-bold text-brand-blue hover:underline">
          Open the week
        </Link>
      </div>
      <p className="mt-0.5 text-xs text-gray-500">
        Dated for today on your plan. Tick here or on the board — it is the same box.
      </p>

      <ul className="mt-3 space-y-1.5 text-xs leading-5">
        {items.map((item) => (
          <li key={item.id}>
            <label className={`flex cursor-pointer items-start gap-2 rounded-lg px-3 py-2 ${item.done ? 'bg-emerald-50' : 'bg-gray-50'}`}>
              <input
                type="checkbox"
                checked={item.done}
                onChange={() => toggleItem(item)}
                className="mt-0.5 h-3.5 w-3.5 shrink-0"
                aria-label={`Mark "${item.label}" ${item.done ? 'not done' : 'done'}`}
              />
              <span className="min-w-0 flex-1">
                {item.tag && (
                  <span className={`mr-1.5 rounded px-1 py-0.5 text-[10px] font-bold ${item.done ? 'bg-gray-100 text-gray-400' : planKindTone(item.kind)}`}>
                    {item.tag}
                  </span>
                )}
                {item.href && !item.done ? (
                  <Link to={item.href} className={`font-bold hover:underline ${item.done ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                    {item.label}
                  </Link>
                ) : (
                  <span className={`font-bold ${item.done ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                    {item.label}
                  </span>
                )}
                {item.overdue && !item.done && (
                  <span className="ml-1 rounded bg-red-50 px-1 py-0.5 text-[10px] font-bold text-red-700">Overdue</span>
                )}
              </span>
            </label>
          </li>
        ))}
      </ul>

      {allDone && (
        <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700">
          <Check className="h-3.5 w-3.5" />
          Everything your plan asked for today is done.
        </p>
      )}
    </section>
  );
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
