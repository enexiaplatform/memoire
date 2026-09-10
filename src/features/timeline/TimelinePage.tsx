import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarDays } from 'lucide-react';
import { WeeklyPlanPage } from '../plan/WeeklyPlanPage';
import { SalesActivityCalendarPage } from '../calendar/SalesActivityCalendarPage';
import { CommitmentLedgerPanel } from '../commitments/CommitmentLedgerPanel';
import { CommittedWeekStrip } from '../dashboard/CommittedWeekStrip';
import { useAuthContext } from '../../auth/authContext';
import { hasLocalSampleData } from '../../utils/dataMode';
import { PageContainer, PageHeader } from '../../components/layout/PageFrame';
import type { PlanBoardWindow } from '../../domain/commercialKernel/derivePlanCommitments';
import { getPlanRange } from '../../utils/weeklyPlan';
import { todayDateKey } from '../../utils/safeDate';

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
  const { user } = useAuthContext();
  const sampleDataActive = hasLocalSampleData();
  const [searchParams, setSearchParams] = useSearchParams();
  const view = readView(searchParams.get('view'));
  // Seeded with the week the board opens on, so the panel above it is already
  // right on the first paint rather than briefly listing what is about to be
  // drawn underneath it.
  const [boardWindow, setBoardWindow] = useState<PlanBoardWindow>(() => {
    const range = getPlanRange('week');
    return { start: range.start, end: range.end, today: todayDateKey() };
  });
  /**
   * The day the panel last asked the board to show.
   *
   * Carries a sequence number rather than being a bare date, because asking
   * twice for the same day is a real case: page the board back by hand and the
   * row reappears above it. Without the counter the second click would set
   * state to the value it already held, no effect would run, and the link would
   * do nothing.
   */
  const [focusRequest, setFocusRequest] = useState<{ date: string; seq: number } | null>(null);

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
        icon={<CalendarDays className="h-5 w-5" />}
        title="Plan"
        description={activeHint}
        /*
         * No capture control here.
         *
         * There was one, renamed "Quick capture" so it would not read as a
         * second copy of the permanent Capture pill sitting 57px above it in
         * the app header. The rename made the two buttons distinguishable
         * without making the second one necessary: the global control opens the
         * same composer, from every page, and a per-page duplicate of a global
         * action is the thing that made "which of these two do I press" a
         * question at all.
         */
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
            {/* The week in the order it is decided.

                1. What this week is for - the promise frozen at confirm time,
                   which is the only thing on the page that says what "a good
                   week" would even mean.
                2. The ranked moves, and 3. the open commitments: both inside
                   the board component below, because the ledger has to sit
                   between the moves and the days and the board owns that
                   sequence once it is handed the panel.
                4. The days.

                The calendar was the whole of this view and therefore the whole
                of the week's meaning. It is execution machinery: useful,
                unchanged, and no longer the first thing the eye lands on. */}
            <CommittedWeekStrip userId={sampleDataActive ? undefined : user?.id} sampleDataActive={sampleDataActive} />
            <WeeklyPlanPage
              embedded
              onRangeChange={setBoardWindow}
              focusRequest={focusRequest}
              beforeBoard={(
                /* Handed the days the board is drawing, so it stops re-listing
                   the promises that board is about to show and counts them on
                   one line instead. What survives the fold is what the board
                   cannot show: undated promises, promises somebody else owes,
                   and anything dated beyond the days on screen. */
                <CommitmentLedgerPanel
                  title="Commitments"
                  boardWindow={boardWindow}
                  onShowOnBoard={(date) => setFocusRequest((current) => ({ date, seq: (current?.seq ?? 0) + 1 }))}
                />
              )}
            />
          </>
        ) : (
          <SalesActivityCalendarPage embedded />
        )}
      </div>
    </PageContainer>
  );
}
