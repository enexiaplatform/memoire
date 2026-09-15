import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { WeeklyPlanPage, type PlanBoardHeading } from '../plan/WeeklyPlanPage';
import { SalesActivityCalendarPage } from '../calendar/SalesActivityCalendarPage';
import { CommitmentLedgerPanel } from '../commitments/CommitmentLedgerPanel';
import { CommittedWeekStrip } from '../dashboard/CommittedWeekStrip';
import { useAuthContext } from '../../auth/authContext';
import { hasLocalSampleData } from '../../utils/dataMode';
import { PageContainer, PageHeader } from '../../components/layout/PageFrame';
import { Segmented } from '../../components/ui/daylight';
import type { PlanBoardWindow } from '../../domain/commercialKernel/derivePlanCommitments';
import { getPlanRange } from '../../utils/weeklyPlan';
import { todayDateKey } from '../../utils/safeDate';
import { formatCount } from '../../utils/numberFormat';

export type TimelineView = 'upcoming' | 'history';

const views: { value: TimelineView; label: string }[] = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'history', label: 'History' },
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
   * What the board says about the period on screen - which week, and how much
   * of it is done. The headline is that sentence, so the page opens on the
   * state of the week rather than on the name of the tab.
   */
  const [heading, setHeading] = useState<PlanBoardHeading | null>(null);
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

  const upcomingTitle = !heading
    ? 'Plan'
    : heading.total === 0
      ? 'Nothing planned yet'
      : `${formatCount(heading.done)} of ${formatCount(heading.total)} planned ${heading.total === 1 ? 'item' : 'items'} done`;

  return (
    <PageContainer>
      <PageHeader
        eyebrow={view === 'upcoming' ? heading?.eyebrow || 'Plan' : 'Plan · History'}
        title={view === 'upcoming' ? upcomingTitle : 'What already happened'}
        documentTitle="Plan"
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
        actions={(
          <Segmented label="Timeline view" value={view} onChange={selectView} options={views} />
        )}
      />

      <div className="flex flex-col gap-4">
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
              onHeadingChange={setHeading}
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
