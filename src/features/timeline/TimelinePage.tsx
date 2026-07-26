import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { History, Plus } from 'lucide-react';
import { WeeklyPlanPage } from '../plan/WeeklyPlanPage';
import { SalesActivityCalendarPage } from '../calendar/SalesActivityCalendarPage';
import { trackProductEvent } from '../../utils/productAnalytics';

export type TimelineView = 'upcoming' | 'history';

const views: { value: TimelineView; label: string; hint: string }[] = [
  { value: 'upcoming', label: 'Upcoming', hint: 'Open commitments, dated work, and what you are waiting on.' },
  { value: 'history', label: 'History', hint: 'Everything that already happened, in order.' },
];

function readView(value: string | null): TimelineView {
  return value === 'history' ? 'history' : 'upcoming';
}

/**
 * Timeline is one destination with two halves of the same ledger: what is
 * coming (the former Plan board) and what already happened (the former Activity
 * ledger). They were never two products - a plan item is a future-dated action
 * and an activity is a past commercial event - but two nav entries made them
 * read as rival calendars, and the seller had to decide which one "the week"
 * lived in.
 *
 * This is a UI and information-architecture merge only. Plan items and sales
 * activities remain separate source-of-truth records with their own stores;
 * nothing is collapsed into an ambiguous shared object, and the old /app/plan
 * and /app/activity URLs still resolve here.
 */
export function TimelinePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const view = readView(searchParams.get('view'));

  useEffect(() => {
    trackProductEvent(view === 'history' ? 'timeline_history_viewed' : 'timeline_upcoming_viewed');
  }, [view]);

  const selectView = (next: TimelineView) => {
    const params = new URLSearchParams(searchParams);
    params.set('view', next);
    setSearchParams(params, { replace: true });
  };

  const activeHint = views.find((option) => option.value === view)?.hint || '';

  return (
    <div className="w-full px-4 py-5 sm:px-5 lg:px-6">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-brand-blue" />
            <h1 className="text-2xl font-bold tracking-tight text-navy">Timeline</h1>
          </div>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-600">{activeHint}</p>
        </div>
        <Link
          to="/app/capture?mode=quick"
          className="inline-flex items-center gap-1.5 self-start rounded-full bg-navy px-4 py-2 text-sm font-bold text-white hover:bg-navy/90"
        >
          <Plus className="h-4 w-4" />
          Capture
        </Link>
      </header>

      <div className="mt-4 inline-flex rounded-full border border-gray-200 bg-gray-50 p-1" role="tablist" aria-label="Timeline view">
        {views.map((option) => (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={view === option.value}
            onClick={() => selectView(option.value)}
            className={`rounded-full px-4 py-1.5 text-sm font-bold transition ${
              view === option.value ? 'bg-navy text-white' : 'text-gray-600 hover:bg-white'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {view === 'upcoming' ? <WeeklyPlanPage embedded /> : <SalesActivityCalendarPage embedded />}
      </div>
    </div>
  );
}
