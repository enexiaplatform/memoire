import { useState } from 'react';
import { Lightbulb, Plus, X } from 'lucide-react';
import {
  planSuggestionKindLabel,
  planSuggestionKindTone,
  type PlanSuggestion,
} from '../../utils/planSuggestions';
import type { PlanDay } from '../../utils/weeklyPlan';

/**
 * Last week's ledger, proposed as this week's work. Every row carries the rule
 * that fired and the capture it came from, so accepting one is a judgement
 * rather than an act of faith - and one click is enough to make it real.
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

  return (
    <section className="mt-4 rounded-lg border border-blue-100 bg-blue-50/40 p-4">
      <div className="flex items-center gap-2">
        <Lightbulb className="h-4 w-4 text-brand-blue" />
        <h2 className="text-sm font-bold text-navy">From last week ({suggestions.length})</h2>
        <span className="text-xs text-gray-500">Nothing here is on your plan until you put it there.</span>
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
    </section>
  );
}
