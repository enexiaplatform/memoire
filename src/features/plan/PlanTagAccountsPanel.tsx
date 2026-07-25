import { useState } from 'react';
import { Building2, Loader2, X } from 'lucide-react';
import type { PlanTagAccountCandidate } from '../../utils/planTagAccounts';

/**
 * The customers a hand-written week is about, offered as accounts.
 *
 * A plan typed as "[Bidiphar] Asking sample from PMM" names a real customer, but
 * until that customer exists as an account the line is loose text: no deal, no
 * money, no follow-through. This turns the naming the operator already did into
 * the records the rest of Memoire runs on, one click each - which is the whole
 * point of writing something down once.
 *
 * Nothing is created until the operator says so, and a tag they refuse is
 * remembered as refused rather than asked again.
 */
export function PlanTagAccountsPanel({
  candidates,
  creating,
  onCreate,
  onDismiss,
}: {
  candidates: PlanTagAccountCandidate[];
  creating: string;
  onCreate: (candidate: PlanTagAccountCandidate) => void;
  onDismiss: (candidate: PlanTagAccountCandidate) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  if (candidates.length === 0) return null;

  const shown = expanded ? candidates : candidates.slice(0, 3);

  return (
    <section className="mt-4 rounded-lg border border-blue-100 bg-blue-50/40 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Building2 className="h-4 w-4 text-brand-blue" />
        <h2 className="text-sm font-bold text-navy">Customers on your plan, not yet accounts ({candidates.length})</h2>
        <span className="text-xs text-gray-500">
          Make one an account and its plan items join your pipeline, money, and follow-through.
        </span>
      </div>

      <ul className="mt-3 space-y-1.5">
        {shown.map((candidate) => (
          <li
            key={candidate.name}
            className="flex flex-col gap-2 rounded-lg bg-white px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="text-xs font-bold text-gray-900">
                {candidate.name}
                <span className="ml-1.5 font-medium text-gray-500">
                  · {candidate.itemCount} {candidate.itemCount === 1 ? 'item' : 'items'} this period
                </span>
              </p>
              <p className="mt-0.5 truncate text-[11px] leading-4 text-gray-500">
                {candidate.sampleLabels.join(' · ')}
              </p>
              {candidate.spellings.length > 1 && (
                // Said out loud, because silently folding two spellings into one
                // account is a judgement the operator should get to see.
                <p className="mt-0.5 text-[11px] font-semibold text-brand-blue">
                  Written as {candidate.spellings.join(' and ')} — one account, not two.
                </p>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => onCreate(candidate)}
                disabled={creating === candidate.name}
                className="inline-flex items-center gap-1.5 rounded-full bg-brand-blue px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {creating === candidate.name && <Loader2 className="h-3 w-3 animate-spin" />}
                Create account
              </button>
              <button
                type="button"
                aria-label={`Not a customer: ${candidate.name}`}
                onClick={() => onDismiss(candidate)}
                className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </li>
        ))}
      </ul>

      {candidates.length > 3 && (
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          className="mt-2 text-xs font-bold text-brand-blue hover:underline"
        >
          {expanded ? 'Show fewer' : `Show all ${candidates.length}`}
        </button>
      )}
    </section>
  );
}
