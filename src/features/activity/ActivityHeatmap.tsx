import { formatSafeBusinessDate } from '../../utils/safeDate.ts';
import { weekStartOf } from '../../utils/activityLedger.ts';

const WEEKDAY_ROWS = [1, 2, 3, 4, 5, 6, 0];
const WEEKDAY_LABELS: Record<number, string> = { 1: 'M', 2: 'T', 3: 'W', 4: 'T', 5: 'F', 6: 'S', 0: 'S' };

/**
 * The period as a grid of weeks: one column per week, one cell per day.
 *
 * A calendar shows what is on Thursday. This shows something a calendar
 * structurally cannot - the rhythm. Two heavy days and three empty ones is a
 * different business from five even ones, and the operator recognises their own
 * pattern here in about a second. The empty cells are drawn, never dropped:
 * removing them would turn a picture of rhythm into a bar chart of totals.
 */
export function ActivityHeatmap({
  days,
  onSelectDay,
  selectedDate,
}: {
  days: { date: string; count: number }[];
  onSelectDay?: (date: string) => void;
  selectedDate?: string;
}) {
  if (days.length === 0) return null;

  const max = Math.max(...days.map((day) => day.count), 1);
  const byDate = new Map(days.map((day) => [day.date, day.count]));
  const weeks: string[] = [];
  days.forEach((day) => {
    const weekStart = weekStartOf(day.date);
    if (!weeks.includes(weekStart)) weeks.push(weekStart);
  });

  // A long range is a lot of columns; labelling every one turns the axis into a
  // grey smear, so only every other label is drawn once it gets busy.
  const labelEvery = weeks.length > 9 ? 2 : 1;

  return (
    <div className="overflow-x-auto">
      <div className="inline-flex gap-1">
        <div className="flex flex-col gap-1 pr-1 pt-[18px]">
          {WEEKDAY_ROWS.map((weekday) => (
            <span key={weekday} className="flex h-4 w-3 items-center justify-center text-[9px] font-bold text-gray-300">
              {WEEKDAY_LABELS[weekday]}
            </span>
          ))}
        </div>

        {weeks.map((weekStart, columnIndex) => (
          <div key={weekStart} className="flex flex-col gap-1">
            <span className="h-[14px] text-[9px] font-bold text-gray-400">
              {columnIndex % labelEvery === 0 ? formatSafeBusinessDate(weekStart).slice(0, 6) : ''}
            </span>
            {WEEKDAY_ROWS.map((weekday) => {
              const date = dateForCell(weekStart, weekday);
              const inRange = byDate.has(date);
              const count = byDate.get(date) || 0;
              const selected = selectedDate === date;
              if (!inRange) {
                return <span key={weekday} className="h-4 w-4 rounded-sm bg-transparent" />;
              }
              return (
                <button
                  key={weekday}
                  type="button"
                  onClick={() => onSelectDay?.(selected ? '' : date)}
                  title={`${formatSafeBusinessDate(date)} · ${count} ${count === 1 ? 'item' : 'items'}`}
                  aria-label={`${formatSafeBusinessDate(date)}, ${count} items`}
                  // A year of weeks only fits at 16px, so the square stays 16px
                  // and the thumb gets 24px: `after:-inset-1` is an invisible
                  // hit area around it. Inflating the square instead would cost
                  // the density that makes the pattern readable at all.
                  className={`relative h-4 w-4 rounded-sm transition after:absolute after:-inset-1 after:content-[''] ${selected ? 'ring-2 ring-navy ring-offset-1' : ''} ${
                    count === 0 ? 'bg-gray-100 hover:bg-gray-200' : 'hover:opacity-80'
                  }`}
                  style={count === 0 ? undefined : { backgroundColor: shade(count, max) }}
                />
              );
            })}
          </div>
        ))}
      </div>

      <div className="mt-2 flex items-center gap-1.5 text-[10px] font-semibold text-gray-400">
        quiet
        <span className="h-3 w-3 rounded-sm bg-gray-100" />
        {[0.25, 0.5, 0.75, 1].map((step) => (
          <span key={step} className="h-3 w-3 rounded-sm" style={{ backgroundColor: shade(step * max, max) }} />
        ))}
        busy
        <span className="ml-2 font-normal text-gray-400">peak {max} in a day</span>
      </div>
    </div>
  );
}

/**
 * Four steps rather than a continuous ramp. A smooth gradient looks better and
 * reads worse: nobody can tell 40% blue from 55% blue, so the eye gives up and
 * the grid becomes decoration.
 */
function shade(count: number, max: number) {
  const ratio = count / max;
  if (ratio <= 0.25) return '#BBDEFB';
  if (ratio <= 0.5) return '#64B5F6';
  if (ratio <= 0.75) return '#1E88E5';
  return '#0D47A1';
}

function dateForCell(weekStart: string, weekday: number) {
  const base = Date.parse(`${weekStart}T00:00:00Z`);
  if (Number.isNaN(base)) return '';
  // Monday-first columns, so Sunday belongs to the week that started six days
  // earlier rather than opening a new one.
  const offset = weekday === 0 ? 6 : weekday - 1;
  return new Date(base + offset * 86_400_000).toISOString().slice(0, 10);
}
