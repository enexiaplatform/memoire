import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ChevronLeft, ChevronRight, ClipboardList, Plus, RotateCcw, Sparkles } from 'lucide-react';
import { readLocalMemory } from '../v31/localStore';
import {
  buildSalesActivityRecap,
  createSalesActivityFromCapture,
  createSalesActivityFromText,
  filterSalesActivitiesByRange,
  getSalesActivityRange,
  groupSalesActivitiesByDate,
  loadSalesActivities,
  shiftSalesActivityAnchor,
  upsertSalesActivity,
  type SalesActivityCategory,
  type SalesActivityPeriod,
  type SalesActivityRecord,
} from '../../utils/salesActivityCalendar';

const periodOptions: { value: SalesActivityPeriod; label: string }[] = [
  { value: 'week', label: 'Weekly' },
  { value: 'month', label: 'Monthly' },
];

const categoryTone: Record<SalesActivityCategory, string> = {
  Call: 'bg-blue-50 text-blue-700 border-blue-100',
  Meeting: 'bg-violet-50 text-violet-700 border-violet-100',
  Email: 'bg-cyan-50 text-cyan-700 border-cyan-100',
  Proposal: 'bg-indigo-50 text-indigo-700 border-indigo-100',
  'Follow-up': 'bg-emerald-50 text-emerald-700 border-emerald-100',
  Objection: 'bg-amber-50 text-amber-700 border-amber-100',
  'Customer insight': 'bg-teal-50 text-teal-700 border-teal-100',
  Admin: 'bg-slate-50 text-slate-700 border-slate-100',
  Note: 'bg-gray-50 text-gray-700 border-gray-100',
};

export function SalesActivityCalendarPage() {
  const [period, setPeriod] = useState<SalesActivityPeriod>('week');
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [manualNote, setManualNote] = useState('');
  const [message, setMessage] = useState('');
  const [storedActivities, setStoredActivities] = useState(() => loadSalesActivities());

  const allActivities = useMemo(() => {
    return mergeActivities(storedActivities, loadSalesMemoryActivities());
  }, [storedActivities]);

  const range = useMemo(() => getSalesActivityRange(period, anchorDate), [anchorDate, period]);
  const visibleActivities = useMemo(
    () => filterSalesActivitiesByRange(allActivities, range),
    [allActivities, range]
  );
  const groupedActivities = useMemo(() => groupSalesActivitiesByDate(visibleActivities), [visibleActivities]);
  const recap = useMemo(() => buildSalesActivityRecap(visibleActivities), [visibleActivities]);
  const activeCategoryCounts = Object.entries(recap.categoryCounts).filter(([, count]) => count > 0);

  const addManualActivity = () => {
    if (manualNote.trim().length < 8) {
      setMessage('Add a short sales note first.');
      return;
    }

    upsertSalesActivity(createSalesActivityFromText(manualNote));
    setManualNote('');
    setMessage('Activity added to your calendar.');
    setStoredActivities(loadSalesActivities());
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Activity Calendar</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-navy">Weekly and monthly sales memory.</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
            Capture unstructured sales activity, then review what happened by week or month. Notes are classified locally from your text and Quick Capture saves.
          </p>
        </div>
        <Link
          to="/app/today#quick-capture"
          className="inline-flex items-center gap-2 rounded-full bg-navy px-4 py-2 text-sm font-bold text-white"
        >
          <Sparkles className="h-4 w-4" />
          Open Quick Capture
        </Link>
      </header>

      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-bold text-navy">Capture a sales activity</p>
            <p className="mt-1 max-w-2xl text-sm text-gray-500">
              Drop a quick note after a call, customer reply, internal follow-up, objection, or proposal update. Memoire records it to this browser calendar.
            </p>
          </div>
          <span className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
            Local deterministic classification
          </span>
        </div>
        <textarea
          value={manualNote}
          onChange={(event) => {
            setManualNote(event.target.value);
            setMessage('');
          }}
          placeholder="Example: Called Nam at Control Union. Lead time is still a concern. Send implementation timeline by Tuesday."
          className="mt-4 min-h-[104px] w-full resize-y rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm leading-6 text-gray-900 outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={addManualActivity}
            className="inline-flex items-center gap-2 rounded-full bg-brand-blue px-4 py-2 text-sm font-bold text-white"
          >
            <Plus className="h-4 w-4" />
            Add to Calendar
          </button>
          {message && <span className="text-sm font-semibold text-gray-500">{message}</span>}
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-bold text-navy">Review period</p>
            <h2 className="mt-1 text-2xl font-bold text-navy">{range.label}</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-full border border-gray-200 bg-gray-50 p-1">
              {periodOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setPeriod(option.value)}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                    period === option.value ? 'bg-navy text-white' : 'text-gray-600 hover:bg-white'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setAnchorDate((date) => shiftSalesActivityAnchor(date, period, -1))}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
              aria-label="Previous period"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setAnchorDate(new Date())}
              className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Today
            </button>
            <button
              type="button"
              onClick={() => setAnchorDate((date) => shiftSalesActivityAnchor(date, period, 1))}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
              aria-label="Next period"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
          <MetricCard label="Activities" value={String(recap.totalActivities)} helper="Captured in this period" />
          <MetricCard label="Next actions" value={String(recap.actionItems.length)} helper="Explicit actions found" />
          <MetricCard label="Risk signals" value={String(recap.riskSignals.length)} helper="Objections or missing context" tone={recap.riskSignals.length > 0 ? 'amber' : 'green'} />
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[0.75fr_1.25fr]">
          <aside className="rounded-lg border border-blue-100 bg-blue-50/60 p-4">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-brand-blue" />
              <h3 className="text-sm font-bold text-navy">Recap</h3>
            </div>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-blue-950">
              {recap.recapLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            {recap.topAccounts.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-bold uppercase tracking-wide text-blue-700">Top accounts</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {recap.topAccounts.map((item) => (
                    <span key={item.account} className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-blue-900 ring-1 ring-blue-100">
                      {item.account} · {item.count}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {activeCategoryCounts.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-bold uppercase tracking-wide text-blue-700">Classification</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {activeCategoryCounts.map(([category, count]) => (
                    <span key={category} className={`rounded-full border px-2.5 py-1 text-xs font-bold ${categoryTone[category as SalesActivityCategory]}`}>
                      {category}: {count}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </aside>

          <div className="space-y-4">
            {visibleActivities.length === 0 ? (
              <EmptyCalendarState />
            ) : (
              Object.entries(groupedActivities).map(([dateKey, records]) => (
                <section key={dateKey} className="rounded-lg border border-gray-200 bg-white p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-gray-400" />
                    <h3 className="text-sm font-bold text-navy">
                      {new Date(`${dateKey}T00:00:00`).toLocaleDateString(undefined, {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </h3>
                  </div>
                  <div className="space-y-3">
                    {records.map((record) => (
                      <ActivityCard key={record.id} record={record} />
                    ))}
                  </div>
                </section>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function loadSalesMemoryActivities() {
  const memory = readLocalMemory();
  return memory.captures.map((capture) =>
    createSalesActivityFromCapture(capture.raw_text, capture.structured_data, {
      occurredAt: capture.created_at,
      sourceCaptureId: capture.id,
      source: 'sales-memory',
    })
  );
}

function mergeActivities(primary: SalesActivityRecord[], secondary: SalesActivityRecord[]) {
  const byKey = new Map<string, SalesActivityRecord>();
  [...secondary, ...primary].forEach((record) => {
    byKey.set(record.sourceCaptureId || record.id, record);
  });
  return Array.from(byKey.values()).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

function MetricCard({ label, value, helper, tone = 'blue' }: { label: string; value: string; helper: string; tone?: 'blue' | 'amber' | 'green' }) {
  const toneClass = {
    blue: 'bg-blue-50 text-brand-blue',
    amber: 'bg-amber-50 text-amber-700',
    green: 'bg-emerald-50 text-emerald-700',
  }[tone];

  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`mt-2 inline-flex rounded-full px-3 py-1 text-2xl font-black ${toneClass}`}>{value}</p>
      <p className="mt-2 text-sm text-gray-500">{helper}</p>
    </div>
  );
}

function ActivityCard({ record }: { record: SalesActivityRecord }) {
  return (
    <article className="rounded-lg border border-gray-100 bg-gray-50 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${categoryTone[record.category]}`}>
            {record.category}
          </span>
          <h4 className="mt-2 text-sm font-bold text-navy">{record.summary}</h4>
        </div>
        <p className="text-xs font-semibold text-gray-400">
          {new Date(record.occurredAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 text-xs leading-5 text-gray-600 sm:grid-cols-2">
        <Fact label="Account" value={record.account || 'Not captured'} />
        <Fact label="Opportunity" value={record.opportunity || 'Not captured'} />
        <Fact label="Next action" value={record.nextAction || 'No next action captured'} />
        <Fact label="Risk" value={record.riskSignal || record.objection || 'No explicit risk captured'} />
      </div>
    </article>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-white px-3 py-2">
      <span className="font-bold text-gray-400">{label}: </span>
      <span className="font-semibold text-gray-700">{value}</span>
    </div>
  );
}

function EmptyCalendarState() {
  return (
    <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center">
      <p className="text-sm font-bold text-navy">No activity captured for this period.</p>
      <p className="mt-2 text-sm leading-6 text-gray-500">
        Add a note above or use Quick Capture from Today. New captures will appear here for weekly and monthly recap.
      </p>
    </div>
  );
}
