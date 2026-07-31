/**
 * What you said, against what happened.
 *
 * A bar chart would answer "what is my win rate per band", which is a report.
 * The question here is narrower and harder: *was the number right*. So the mark
 * is the gap itself - two points on one 0-100% track with the distance between
 * them drawn - and the row reads as a single claim rather than as two
 * quantities the reader has to subtract in their head.
 *
 * Both points carry their number in text and the verdict carries a word, so
 * nothing here is conveyed by colour alone. The two hues are the app's series
 * blue and amber-700, which clear the CVD separation floor against each other
 * and the 3:1 contrast floor against the surface.
 */

const CLAIMED_COLOR = '#B45309';
const ACTUAL_COLOR = '#1976D2';

export type CalibrationGapRow = {
  id: string;
  label: string;
  /** What the seller declared, 0-100. */
  claimed: number;
  /** What actually closed, 0-100. Null when there is not enough history. */
  actual: number | null;
  /** Words for the same thing the colour says. */
  verdict: string;
  verdictTone: 'optimistic' | 'pessimistic' | 'calibrated' | 'unrated';
  detail: string;
};

const VERDICT_TONE: Record<CalibrationGapRow['verdictTone'], string> = {
  optimistic: 'bg-amber-50 text-amber-800',
  pessimistic: 'bg-emerald-50 text-emerald-700',
  calibrated: 'bg-blue-50 text-brand-blue',
  unrated: 'bg-gray-100 text-gray-500',
};

export function CalibrationGapChart({ rows, ariaLabel }: { rows: CalibrationGapRow[]; ariaLabel: string }) {
  if (rows.length === 0) return null;

  return (
    <div>
      {/* Two series, so a legend is always present - identity never rests on
          the colour alone. */}
      <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold text-gray-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: CLAIMED_COLOR }} />
          You said
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: ACTUAL_COLOR }} />
          Actually won
        </span>
      </div>

      <div role="img" aria-label={ariaLabel} className="mt-3 space-y-3">
        {rows.map((row) => {
          const actual = row.actual;
          const low = actual === null ? row.claimed : Math.min(row.claimed, actual);
          const high = actual === null ? row.claimed : Math.max(row.claimed, actual);

          return (
            <div key={row.id}>
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="w-24 shrink-0 text-xs font-semibold text-gray-600">{row.label}</span>
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${VERDICT_TONE[row.verdictTone]}`}>
                  {row.verdict}
                </span>
                <span className="text-[11px] text-gray-500">{row.detail}</span>
              </div>

              {/* The plot is inset so a point at 0% or 100% - and the label
                  centred under it - has somewhere to sit. Without this the
                  extreme bands, which are exactly the interesting ones, were
                  clipped in half by the container edge.
                  The height is what it is because a label above, a 10px point,
                  and a label below do not fit in less: at 24px the numbers sat
                  on top of the points they belonged to. */}
              <div className="relative mt-1.5 h-10 px-6">
                <div className="relative h-full">
                  {/* Recessive track: the 0-100% scale, not a data mark. */}
                  <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-gray-200" />

                  {actual !== null && (
                    <div
                      className="absolute top-1/2 h-0.5 -translate-y-1/2 rounded"
                      style={{
                        left: `${low}%`,
                        width: `${Math.max(high - low, 0)}%`,
                        backgroundColor: actual < row.claimed ? CLAIMED_COLOR : ACTUAL_COLOR,
                        opacity: 0.35,
                      }}
                    />
                  )}

                  <Point value={row.claimed} color={CLAIMED_COLOR} title={`You said ${row.claimed}%`} />
                  {actual !== null && (
                    <Point value={actual} color={ACTUAL_COLOR} title={`Actually won ${Math.round(actual)}%`} />
                  )}

                  {/* Direct labels, because two points is few enough to name
                      them all and a reader should never have to hover to get a
                      number. Claimed sits above the track and actual below, so
                      they never collide when the gap is small. */}
                  <span
                    className="absolute top-0 -translate-x-1/2 whitespace-nowrap text-[10px] font-bold text-gray-500"
                    style={{ left: `${row.claimed}%` }}
                  >
                    {row.claimed}%
                  </span>
                  {actual !== null && (
                    <span
                      className="absolute bottom-0 -translate-x-1/2 whitespace-nowrap text-[10px] font-bold text-navy"
                      style={{ left: `${actual}%` }}
                    >
                      {Math.round(actual)}%
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** A 2px surface ring keeps the two points readable where they overlap. */
function Point({ value, color, title }: { value: number; color: string; title: string }) {
  return (
    <span
      title={title}
      className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white"
      style={{ left: `${Math.min(100, Math.max(0, value))}%`, backgroundColor: color }}
    />
  );
}
