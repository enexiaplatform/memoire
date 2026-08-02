import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, RotateCcw, Target as TargetIcon } from 'lucide-react';
import { useAuthContext } from '../../auth/authContext';
import { hasLocalSampleData } from '../../utils/dataMode';
import { getCachedSalesWorkspaceData, loadSalesWorkspaceData, type SalesWorkspaceData } from '../../services/workspaceData';
import {
  loadTargets,
  loadTargetsForWorkspace,
  TARGETS_UPDATED_EVENT,
  type CommercialTarget,
} from '../../services/commercialKernel/targetStore';
import {
  buildOutcomeScoreboard,
  type ScoreboardPeriodKind,
  type ScoreboardRange,
  type TargetProgress,
} from '../../utils/outcomeScoreboard';
import { formatBaseCurrencyAmount, formatCompactBaseAmount } from '../../utils/money';

/**
 * The head of Review, and the reason to open it.
 *
 * Review used to begin with the threads at risk next week - which is work, not
 * outcome, and Today already owns it. The question a review exists to answer is
 * narrower and harder: did the week (or the month) produce anything, and does
 * the quarter still add up? Everything else on this page is evidence for that
 * sentence, so it comes after it.
 *
 * The period control lives here because this is where the period is declared;
 * the recap below reads the same window rather than carrying a second one.
 */
export function ReviewScoreboardPanel({
  periodKind,
  period,
  onPeriodKindChange,
  onShiftPeriod,
  onResetPeriod,
}: {
  periodKind: ScoreboardPeriodKind;
  period: ScoreboardRange;
  onPeriodKindChange: (kind: ScoreboardPeriodKind) => void;
  onShiftPeriod: (direction: -1 | 1) => void;
  onResetPeriod: () => void;
}) {
  const { user } = useAuthContext();
  const sampleDataActive = hasLocalSampleData();
  const dataUserId = sampleDataActive ? undefined : user?.id;

  const [workspace, setWorkspace] = useState<SalesWorkspaceData | null>(() => getCachedSalesWorkspaceData(dataUserId));
  const [targets, setTargets] = useState<CommercialTarget[]>(() => loadTargets());

  useEffect(() => {
    let active = true;
    void loadSalesWorkspaceData(dataUserId)
      .then((data) => { if (active) setWorkspace(data); })
      .catch(() => undefined);
    void loadTargetsForWorkspace(dataUserId, sampleDataActive)
      .then((loaded) => { if (active) setTargets(loaded); })
      .catch(() => undefined);

    // The target editor lives on Orders. A number changed there has to change
    // the score here without a reload, or the two pages disagree about the
    // quarter and neither can be trusted.
    const onTargetsUpdated = (event: Event) => {
      const detail = (event as CustomEvent<CommercialTarget[]>).detail;
      if (Array.isArray(detail)) setTargets(detail);
    };
    window.addEventListener(TARGETS_UPDATED_EVENT, onTargetsUpdated);
    return () => { active = false; window.removeEventListener(TARGETS_UPDATED_EVENT, onTargetsUpdated); };
  }, [dataUserId, sampleDataActive]);

  const board = useMemo(() => buildOutcomeScoreboard({
    period,
    outcomes: workspace?.opportunityOutcomes || [],
    quotes: workspace?.quotes || [],
    activities: workspace?.activities || [],
    targets,
  }), [period, targets, workspace]);

  const wonDelta = board.won.valueBase - board.previousWon.valueBase;

  return (
    <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-3">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h2 className="text-base font-bold text-navy">Scoreboard</h2>
          <p className="text-sm font-semibold text-gray-500">{period.label}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-full border border-gray-200 bg-gray-50 p-0.5">
            {([['week', 'Weekly'], ['month', 'Monthly']] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => onPeriodKindChange(value)}
                aria-pressed={periodKind === value}
                className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                  periodKind === value ? 'bg-navy text-white' : 'text-gray-600 hover:text-navy'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => onShiftPeriod(-1)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
            aria-label="Previous period"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onResetPeriod}
            className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Now
          </button>
          <button
            type="button"
            onClick={() => onShiftPeriod(1)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
            aria-label="Next period"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid gap-4 p-5 lg:grid-cols-[minmax(0,340px)_1fr]">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">
            Closed this {periodKind === 'week' ? 'week' : 'month'}
          </p>
          {/* Compact and without the "(Base: VND)" tail: this is the headline
              number and the tail wrapped it onto two lines. The basis is stated
              once, under it, where it does not cost a line. */}
          <p className="mt-1 text-3xl font-black leading-none text-navy">
            {formatCompactBaseAmount(board.won.valueBase)}
          </p>
          <p className="mt-1 text-sm font-semibold text-gray-600">
            {board.won.count} won
            {board.lost.count > 0 ? ` · ${board.lost.count} lost` : ''}
            {board.winRate !== null ? ` · ${Math.round(board.winRate * 100)}% win rate` : ''}
          </p>
          <p className={`mt-1 text-xs font-bold ${wonDelta > 0 ? 'text-emerald-700' : wonDelta < 0 ? 'text-amber-700' : 'text-gray-500'}`}>
            {wonDelta === 0
              ? `Same as the ${periodKind === 'week' ? 'week' : 'month'} before`
              : `${wonDelta > 0 ? '+' : '−'}${formatCompactBaseAmount(Math.abs(wonDelta))} vs the ${periodKind === 'week' ? 'week' : 'month'} before`}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-gray-400" title="Deals closed and dated inside this window">
            {formatBaseCurrencyAmount(board.won.valueBase)}
          </p>

          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-gray-100 pt-3 text-xs">
            <Movement label="Quotes sent" value={board.movement.quotesSent} />
            <Movement label="Quotes accepted" value={board.movement.quotesAccepted} />
            <Movement label="Touches recorded" value={board.movement.touches} />
            <Movement label="Customers touched" value={board.movement.accountsTouched} />
          </dl>
        </div>

        <div className="flex flex-col gap-3">
          {board.hasTargets ? (
            <>
              {board.quarter && <TargetBar progress={board.quarter} emphasis />}
              {board.year && <TargetBar progress={board.year} />}
              <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm font-semibold leading-6 text-navy">
                {board.verdict}
              </p>
            </>
          ) : (
            <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4">
              <div className="flex items-center gap-2">
                <TargetIcon className="h-4 w-4 text-brand-blue" />
                <p className="text-sm font-bold text-navy">No target to score against yet</p>
              </div>
              <p className="mt-1 text-sm leading-6 text-gray-600">
                {board.verdict} Memoire already knows what closed and when; give it the number you are measured
                against and this becomes a scoreboard instead of a count.
              </p>
              <Link
                to="/app/revenue"
                className="mt-3 inline-flex rounded-full bg-navy px-4 py-2 text-sm font-bold text-white hover:bg-navy/90"
              >
                Set quarterly targets
              </Link>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function Movement({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="truncate text-gray-500">{label}</dt>
      <dd className="font-bold text-navy">{value.toLocaleString()}</dd>
    </div>
  );
}

/**
 * One window, one bar. The bar is filled to attainment and carries a second,
 * hollow mark at where the calendar says you should be - the comparison every
 * operator makes in their head, and the only one that turns a percentage into a
 * verdict.
 */
function TargetBar({ progress, emphasis = false }: { progress: TargetProgress; emphasis?: boolean }) {
  const percent = Math.round((progress.attainment || 0) * 100);
  const filled = Math.min(100, Math.max(0, percent));
  const expected = progress.daysElapsed + progress.daysLeft > 0
    ? Math.min(100, Math.round((progress.daysElapsed / (progress.daysElapsed + progress.daysLeft)) * 100))
    : 0;

  return (
    <div className={`rounded-lg border p-3 ${progress.onTrack ? 'border-emerald-100 bg-emerald-50/40' : 'border-amber-100 bg-amber-50/40'}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <p className={`font-bold text-navy ${emphasis ? 'text-base' : 'text-sm'}`}>{progress.label}</p>
        <p className="text-sm font-bold text-navy">
          {formatCompactBaseAmount(progress.won)} <span className="font-semibold text-gray-500">of {formatCompactBaseAmount(progress.target)}</span>
        </p>
      </div>

      <div className="relative mt-2 h-2.5 w-full overflow-hidden rounded-full bg-white ring-1 ring-inset ring-gray-200">
        <div
          className={`h-full rounded-full ${progress.onTrack ? 'bg-emerald-500' : 'bg-amber-500'}`}
          style={{ width: `${filled}%` }}
        />
        <div
          className="absolute inset-y-0 w-px bg-navy/40"
          style={{ left: `${expected}%` }}
          title={`Where the calendar says you should be: ${expected}%`}
        />
      </div>

      <p className="mt-1.5 text-xs font-semibold text-gray-600">
        {percent}% · {progress.gap > 0
          ? `short ${formatCompactBaseAmount(progress.gap)}`
          : `${formatCompactBaseAmount(-progress.gap)} clear`}
        {progress.daysLeft > 0 ? ` · ${progress.daysLeft} day${progress.daysLeft === 1 ? '' : 's'} left` : ' · window closed'}
        {progress.gap > 0 && progress.daysLeft > 0
          ? ` · needs ${formatCompactBaseAmount(progress.requiredPerWeek)}/week`
          : ''}
      </p>
    </div>
  );
}
