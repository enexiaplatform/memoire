import { Link, useSearchParams } from 'react-router-dom';
import { CalendarDays, Plus } from 'lucide-react';
import { WeeklyPlanPage } from '../plan/WeeklyPlanPage';
import { SalesActivityCalendarPage } from '../calendar/SalesActivityCalendarPage';
import { CommitmentLedgerPanel } from '../commitments/CommitmentLedgerPanel';
import { PageContainer, PageHeader } from '../../components/layout/PageFrame';

export type TimelineView = 'upcoming' | 'history';

const views: { value: TimelineView; label: string; hint: string }[] = [
  { value: 'upcoming', label: 'Upcoming', hint: 'Open commitments, dated work, and what you are waiting on.' },
  { value: 'history', label: 'History', hint: 'Everything that already happened, in order.' },
];

function readView(value: string | null): TimelineView {
  return value === 'history' ? 'history' : 'upcoming';
}

/**
 * Plan is one destination with two halves of the same ledger: what is coming
 * (the plan board) and what already happened (the former Activity ledger). They
 * were never two products - a plan item is a future-dated action and an
 * activity is a past commercial event - but two nav entries made them read as
 * rival calendars, and the seller had to decide which one "the week" lived in.
 *
 * It was called Timeline until 2026-08-02. The id, the route and the two tabs
 * are unchanged; the name now says the job (work out the week) rather than the
 * shape of the data (a line of dated things).
 *
 * This is a UI and information-architecture merge only. Plan items and sales
 * activities remain separate source-of-truth records with their own stores;
 * nothing is collapsed into an ambiguous shared object, and the old /app/plan
 * and /app/activity URLs still resolve here.
 */
export function TimelinePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const view = readView(searchParams.get('view'));

  // Deliberately no "timeline viewed" event. Page opens measure which rooms
  // people walk into; what matters is whether commitments get created and kept,
  // and the ledger emits those itself.

  const selectView = (next: TimelineView) => {
    const params = new URLSearchParams(searchParams);
    params.set('view', next);
    setSearchParams(params, { replace: true });
  };

  const activeHint = views.find((option) => option.value === view)?.hint || '';

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Run"
        icon={<CalendarDays className="h-5 w-5" />}
        title="Plan"
        description={activeHint}
        actions={
          <Link
            to="/app/capture?mode=quick"
            className="inline-flex items-center gap-1.5 rounded-full bg-navy px-4 py-2 text-sm font-bold text-white hover:bg-navy/90"
          >
            <Plus className="h-4 w-4" />
            Capture
          </Link>
        }
      />

      <div className="-mt-1 inline-flex rounded-full border border-gray-200 bg-gray-50 p-1" role="tablist" aria-label="Timeline view">
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

      <div className="flex flex-col gap-5">
        {view === 'upcoming' ? (
          <>
            {/* Open commitments lead: they are the promises the week is made
                of. The plan board below is the same week laid out as days. */}
            <CommitmentLedgerPanel title="Open commitments" />
            <WeeklyPlanPage embedded />
          </>
        ) : (
          <SalesActivityCalendarPage embedded />
        )}
      </div>
    </PageContainer>
  );
}
