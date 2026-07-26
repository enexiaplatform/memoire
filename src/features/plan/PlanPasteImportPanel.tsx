import { useMemo, useState } from 'react';
import { ClipboardPaste, X } from 'lucide-react';
import type { PlanDay, PlanRecord } from '../../utils/weeklyPlan';
import { parsePlanPaste } from '../../utils/planPasteImport';

const PLACEHOLDER = `Monday
[Internal] Weekly meeting
[FKV] Connect Ms. Yen & Ms. Mai

Tuesday
[Cobetter] Presentation`;

/**
 * A week drafted elsewhere, dropped in whole.
 *
 * The board could only take one line at a time, so an operator arriving with a
 * written week faced twenty-odd Add boxes - the exact retyping this product
 * exists to remove. Nothing is written until the preview has been read: the
 * count is stated, lines already on the board are shown as such rather than
 * duplicated, and anything that could not be placed on a day is shown too,
 * because silently dropping a line someone wrote is worse than refusing it.
 */
export function PlanPasteImportPanel({
  days,
  records,
  onImport,
}: {
  days: PlanDay[];
  records: PlanRecord[];
  onImport: (lines: { date: string; tag: string; label: string }[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');

  const parsed = useMemo(
    () => (text.trim() ? parsePlanPaste({ text, days, existing: records }) : null),
    [text, days, records],
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-700 hover:border-gray-300 hover:bg-gray-50"
      >
        <ClipboardPaste className="h-3.5 w-3.5" />
        Paste a week
      </button>
    );
  }

  const newLines = parsed?.lines.filter((line) => !line.duplicate) || [];

  return (
    <section className="mt-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-navy">Paste a week</h2>
          <p className="mt-0.5 text-xs text-gray-500">
            A day on its own line, then its items. <span className="font-semibold">[Account] the task</span> keeps the
            account, and bullets or numbering are fine.
          </p>
        </div>
        <button
          type="button"
          aria-label="Close paste"
          onClick={() => { setOpen(false); setText(''); }}
          className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={8}
        autoFocus
        placeholder={PLACEHOLDER}
        aria-label="Paste your week"
        className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs leading-5 text-navy outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
      />

      {parsed && (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-bold text-navy">
            {parsed.newCount === 0
              ? 'Nothing new to add from this.'
              : `${parsed.newCount} ${parsed.newCount === 1 ? 'item' : 'items'} will be added.`}
            {parsed.duplicateCount > 0 && (
              <span className="ml-1 font-medium text-gray-500">
                {parsed.duplicateCount} already on this week, left alone.
              </span>
            )}
          </p>

          {newLines.length > 0 && (
            <ul className="max-h-40 space-y-0.5 overflow-y-auto rounded-lg bg-gray-50 p-2">
              {newLines.map((line, index) => (
                <li key={`${line.date}-${index}`} className="flex items-baseline gap-2 text-[11px] leading-5">
                  <span className="w-16 shrink-0 font-bold text-gray-500">{line.dayLabel.slice(0, 3)}</span>
                  {line.tag && (
                    <span className="rounded bg-white px-1 py-0.5 text-[10px] font-bold text-brand-blue">{line.tag}</span>
                  )}
                  <span className="min-w-0 truncate text-gray-800">{line.label}</span>
                </li>
              ))}
            </ul>
          )}

          {(parsed.unassigned.length > 0 || parsed.unknownDays.length > 0) && (
            // Shown rather than dropped: a line someone wrote and cannot see
            // again is worse than a line that was refused out loud.
            <div className="rounded-lg border border-amber-100 bg-amber-50 p-2">
              <p className="text-[11px] font-bold text-amber-900">
                Not added — these need a day from this week above them:
              </p>
              <ul className="mt-1 space-y-0.5">
                {parsed.unknownDays.map((day) => (
                  <li key={`unknown-${day}`} className="truncate text-[11px] text-amber-800">
                    {day} — not a day in {days[0]?.dayLabel} – {days[days.length - 1]?.dayLabel}
                  </li>
                ))}
                {parsed.unassigned.slice(0, 6).map((line, index) => (
                  <li key={`unassigned-${index}`} className="truncate text-[11px] text-amber-800">{line}</li>
                ))}
                {parsed.unassigned.length > 6 && (
                  <li className="text-[11px] text-amber-700">and {parsed.unassigned.length - 6} more</li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!parsed || parsed.newCount === 0}
          onClick={() => {
            if (!parsed) return;
            onImport(newLines.map((line) => ({ date: line.date, tag: line.tag, label: line.label })));
            setOpen(false);
            setText('');
          }}
          className="rounded-full bg-brand-blue px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {parsed && parsed.newCount > 0 ? `Add ${parsed.newCount} to this week` : 'Add to this week'}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setText(''); }}
          className="rounded-full border border-gray-200 px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </section>
  );
}
