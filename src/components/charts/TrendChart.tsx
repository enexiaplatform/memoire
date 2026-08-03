import { useMemo, useRef, useState } from 'react';

/**
 * Change over time, drawn as a line - with a crosshair that snaps to a date and
 * one tooltip reading out every series at that date.
 *
 * The page had no trend form at all before this: eight weeks of touches were
 * eight separate columns, which answers "how many that week" and hides "is this
 * going up". A column series asks the reader to compare heights across a gap; a
 * line draws the slope for them, and slope is the entire question an operator
 * brings to a dashboard.
 *
 * Two rules this component exists to enforce, because both are easy to break by
 * accident and neither is recoverable once shipped:
 *
 *   - **One axis, always.** Two series are only ever plotted together when they
 *     are the same measure in the same unit - touches against touches, base
 *     currency against base currency. A second y-scale invents a correlation
 *     that is not in the data, and the reader has no way to see that it was
 *     invented. Callers with two units get two charts.
 *   - **The tooltip enhances, it never gates.** Every value here is also in the
 *     table twin (`ChartFrame`) and on the endpoint label, so nothing is
 *     reachable by hover alone.
 */
export type TrendSeries = {
  id: string;
  label: string;
  color: string;
  points: number[];
  /** Pre-formatted values, index-aligned with `points`. */
  valueTexts: string[];
};

const PAD_LEFT = 8;
const PAD_RIGHT = 8;
const PAD_TOP = 10;
const PLOT_HEIGHT = 132;
const AXIS_BAND = 20;

export function TrendChart({
  labels,
  series,
  ariaLabel,
}: {
  /** One label per x position, e.g. a week-commencing date. */
  labels: string[];
  series: TrendSeries[];
  ariaLabel: string;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);

  // A shared maximum across every series: that is what makes the comparison
  // honest, and it is the mechanical reason a second axis is never needed.
  const max = useMemo(
    () => Math.max(1, ...series.flatMap((line) => line.points)),
    [series],
  );

  if (labels.length === 0 || series.length === 0) return null;

  const width = 100; // viewBox units; the SVG scales to the card.
  const step = labels.length > 1 ? (width - PAD_LEFT - PAD_RIGHT) / (labels.length - 1) : 0;
  const xAt = (index: number) => PAD_LEFT + step * index;
  const yAt = (value: number) => PAD_TOP + (1 - value / max) * (PLOT_HEIGHT - PAD_TOP);

  const pointerToIndex = (clientX: number) => {
    const frame = frameRef.current;
    if (!frame) return null;
    const rect = frame.getBoundingClientRect();
    if (rect.width === 0) return null;
    const ratio = ((clientX - rect.left) / rect.width) * width;
    const raw = step === 0 ? 0 : Math.round((ratio - PAD_LEFT) / step);
    return Math.min(labels.length - 1, Math.max(0, raw));
  };

  return (
    <div>
      <div
        ref={frameRef}
        className="relative"
        onPointerMove={(event) => setActiveIndex(pointerToIndex(event.clientX))}
        onPointerLeave={() => setActiveIndex(null)}
      >
        <svg
          viewBox={`0 0 ${width} ${PLOT_HEIGHT + AXIS_BAND}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={ariaLabel}
          className="w-full"
          style={{ height: PLOT_HEIGHT + AXIS_BAND }}
        >
          {/* Solid hairlines, one shade off the surface. Dashed grid reads as a
              threshold when it is only a grid. */}
          {[0, 0.5, 1].map((fraction) => {
            const y = PAD_TOP + fraction * (PLOT_HEIGHT - PAD_TOP);
            return (
              <line
                key={fraction}
                x1={PAD_LEFT}
                x2={width - PAD_RIGHT}
                y1={y}
                y2={y}
                stroke="#EFEFEF"
                strokeWidth={0.5}
                vectorEffect="non-scaling-stroke"
              />
            );
          })}

          {activeIndex !== null && (
            <line
              x1={xAt(activeIndex)}
              x2={xAt(activeIndex)}
              y1={PAD_TOP}
              y2={PLOT_HEIGHT}
              stroke="#9CA3AF"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          )}

          {series.map((line) => {
            const path = line.points.map((value, index) => `${index === 0 ? 'M' : 'L'}${xAt(index)},${yAt(value)}`).join(' ');
            return (
              <g key={line.id}>
                {/* A single series gets a soft fill under it; two or more would
                    occlude each other, so they stay as lines. */}
                {series.length === 1 && (
                  <path
                    d={`${path} L${xAt(line.points.length - 1)},${PLOT_HEIGHT} L${xAt(0)},${PLOT_HEIGHT} Z`}
                    fill={line.color}
                    opacity={0.1}
                  />
                )}
                <path
                  d={path}
                  fill="none"
                  stroke={line.color}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
                {activeIndex !== null && (
                  <circle
                    cx={xAt(activeIndex)}
                    cy={yAt(line.points[activeIndex] ?? 0)}
                    r={3}
                    fill={line.color}
                    stroke="#FFFFFF"
                    strokeWidth={2}
                    vectorEffect="non-scaling-stroke"
                  />
                )}
              </g>
            );
          })}
        </svg>

        {/* The x labels sit outside the SVG so they are never stretched by
            preserveAspectRatio="none", and so the card's height includes them
            rather than growing a nested scrollbar. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-between text-[10px] font-semibold text-gray-400">
          <span>{labels[0]}</span>
          {labels.length > 2 && <span className="hidden sm:inline">{labels[Math.floor(labels.length / 2)]}</span>}
          <span>{labels[labels.length - 1]}</span>
        </div>

        {activeIndex !== null && (
          <div
            className="pointer-events-none absolute top-0 z-10 min-w-[132px] rounded-lg border border-gray-200 bg-white px-2.5 py-2 shadow-lg"
            style={{
              left: `${(xAt(activeIndex) / width) * 100}%`,
              transform: activeIndex > labels.length / 2 ? 'translateX(-104%)' : 'translateX(4%)',
            }}
          >
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{labels[activeIndex]}</p>
            <ul className="mt-1 space-y-0.5">
              {series.map((line) => (
                <li key={line.id} className="flex items-center gap-1.5">
                  {/* A short stroke, not a filled box: at tooltip density a
                      block of series colour is data-weight ink doing a label's
                      job. */}
                  <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ backgroundColor: line.color }} />
                  {/* Value leads, label follows - the reader already knows the
                      series and came for the number. */}
                  <span className="text-xs font-bold text-gray-900">{line.valueTexts[activeIndex]}</span>
                  <span className="truncate text-[10px] text-gray-500">{line.label}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {series.length > 1 && (
        <ul className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          {series.map((line) => (
            <li key={line.id} className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-gray-600">
              <span className="h-0.5 w-3.5 rounded-full" style={{ backgroundColor: line.color }} />
              {line.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
