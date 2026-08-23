import { useState } from 'react';
import { Lightbulb, Plus, X } from 'lucide-react';
import {
  planSuggestionKindLabel,
  planSuggestionKindTone,
  type PlanSuggestion,
} from '../../utils/planSuggestions';
import type { PlanDay } from '../../utils/weeklyPlan';

/**
 * The week the workspace would propose, if asked.
 *
 * Two sources sit in one list: the policy engine's live warnings (overdue
 * promises, silent threads, expiring quotes, deals with no next action) and the
 * softer half of the activity ledger. Every row carries the rule that fired and
 * the evidence behind it, so accepting one is a judgement rather than an act of
 * faith.
 *
 * "Add all" exists because the alternative is retyping a risk list by hand,
 * which is the thing this panel was built to stop. It is still an accept, not a
 * default: nothing reaches the board until the operator says so.
 */
export function PlanSuggestionsPanel({
  suggestions,
  days,
  onAccept,
  onDismiss,
}: {
  suggestions: PlanSuggestion[];
  days: PlanDay[];
  onAccept: (suggestion: PlanSuggestion, date: string) => void;
  onDismiss: (suggestion: PlanSuggestion) => void;
}) {
  const [dateOverrides, setDateOverrides] = useState<Record<string, string>>({});

  if (suggestions.length === 0) return null;

  const alertCount = suggestions.filter((suggestion) => suggestion.kind === 'alert').length;

  return (
    // Folded, and closed by default. These are proposals about a week the
    // operator has already planned - worth offering, not worth reading past
    // every time the page opens. The summary carries the only two things that
    // decide whether to open it: how many, and how many are risks.
    <details className="mt-4 rounded-lg border border-blue-100 bg-blue-50/40">
      <summary className="cursor-pointer list-none p-4">
        <span className="flex flex-wrap items-center gap-2">
          <Lightbulb className="h-4 w-4 text-brand-blue" />
          <span className="text-sm font-bold text-navy">Suggested for this week ({suggestions.length})</span>
          <span className="text-xs text-gray-500">
            {alertCount > 0
              ? `${alertCount} of those come from what is at risk right now. Nothing is on your plan until you put it there.`
              : 'Nothing here is on your plan until you put it there.'}
          </span>
        </span>
      </summary>

      <div className="border-t border-blue-100 p-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => suggestions.forEach((suggestion) => (
            onAccept(suggestion, dateOverrides[suggestion.key] || suggestion.suggestedDate)
          ))}
          className="inline-flex items-center gap-1 rounded-full border border-brand-blue px-3 py-1 text-xs font-bold text-brand-blue hover:bg-blue-50"
        >
          <Plus className="h-3 w-3" />
          Add all {suggestions.length}
        </button>
      </div>

      <ul className="mt-3 space-y-1.5">
        {suggestions.map((suggestion) => {
          const chosenDate = dateOverrides[suggestion.key] || suggestion.suggestedDate;
          return (
            <li
              key={suggestion.key}
              className="flex flex-col gap-2 rounded-lg bg-white px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="text-xs leading-5">
                  <span className={`mr-1 rounded px-1 py-0.5 text-[10px] font-bold ${planSuggestionKindTone(suggestion.kind)}`}>
                    {planSuggestionKindLabel(suggestion.kind)}
                  </span>
                  {/* Says why this customer beat the other nine hundred. A
                      ranking the operator cannot see reads as a random pick. */}
                  {suggestion.isKeyAccount && (
                    <span className="mr-1 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-bold uppercase text-amber-800" title="Marked as a key account">
                      KA
                    </span>
                  )}
                  <span className="font-bold text-gray-900">{suggestion.tag}</span>
                  <span className="text-gray-700"> - {suggestion.label}</span>
                </p>
                <p className="mt-0.5 text-[11px] leading-4 text-gray-500">
                  {suggestion.reason} {suggestion.evidence}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                <label className="sr-only" htmlFor={`day-${suggestion.key}`}>
                  Day for {suggestion.label}
                </label>
                <select
                  id={`day-${suggestion.key}`}
                  value={chosenDate}
                  onChange={(event) => setDateOverrides((current) => ({ ...current, [suggestion.key]: event.target.value }))}
                  className="rounded border border-gray-200 px-2 py-1 text-xs"
                >
                  {days.map((day) => (
                    <option key={day.date} value={day.date}>
                      {day.weekdayLabel.slice(0, 3)} {day.dayLabel}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => onAccept(suggestion, chosenDate)}
                  className="inline-flex items-center gap-1 rounded-full bg-brand-blue px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700"
                >
                  <Plus className="h-3 w-3" />
                  Add
                </button>
                <button
                  type="button"
                  aria-label={`Dismiss ${suggestion.label}`}
                  onClick={() => onDismiss(suggestion)}
                  className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      </div>
    </details>
  );
}
