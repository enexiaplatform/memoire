import { useState } from 'react';
import { Link2, Loader2 } from 'lucide-react';
import type { CommercialDataReadiness } from '../../domain/commercialLearning/commercialDataReadiness';
import { readinessHeadline } from '../../domain/commercialLearning/commercialDataReadiness';
import type { HistoricalLinkReview } from '../../domain/commercialKernel/suggestHistoricalLinks';
import { formatSafeBusinessDate } from '../../utils/safeDate';

/**
 * Whether Memoire currently has enough connected history to reason about this
 * business - and, when it does not, the past interactions it could place.
 *
 * ## Why this is one small block and not a page
 *
 * The seller's question is "why does Memoire only compare 12 of my 130 deals",
 * and it is asked once, while looking at the learning section directly above.
 * A data-quality destination would answer it every day to somebody who is not
 * asking, and would turn a commercial product into database housekeeping.
 *
 * ## Why the suggestions are a list and not a button
 *
 * Nothing here writes on its own. A wrong link is invisible afterwards - the
 * activity sits on the deal looking exactly like a correct one - and it changes
 * what the product later tells the seller about their own business. So each
 * suggestion is applied one at a time, through the same canonical update path a
 * manual link uses, or ignored.
 */
export function CommercialLinkagePanel({
  readiness,
  review,
  applying,
  onLink,
  onIgnore,
}: {
  readiness: CommercialDataReadiness;
  review: HistoricalLinkReview;
  applying: string;
  onLink: (activityId: string, opportunityId: string) => void;
  onIgnore: (activityId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const headline = readinessHeadline(readiness);

  // Nothing measured and nothing to offer. A workspace this early is told to
  // start capturing by the screens that exist for that, not by this one.
  if (!headline && review.suggestions.length === 0) return null;

  return (
    <section
      className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
      aria-label="What Memoire can compare"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Link2 className="h-4 w-4 text-brand-blue" aria-hidden="true" />
        <h2 className="text-sm font-bold text-navy">What Memoire can compare</h2>
      </div>

      {headline && <p className="mt-2 text-sm leading-5 text-gray-700">{headline}</p>}

      <p className="mt-1 text-xs leading-5 text-gray-500">
        {readiness.patternsForming > 0
          ? `${readiness.patternsForming} of ${readiness.patternReadiness.length} patterns have enough comparable history to start forming.`
          : `None of the ${readiness.patternReadiness.length} patterns has enough comparable history yet.`}
        {' '}
        Memoire compares {readiness.closedDeals} closed {readiness.closedDeals === 1 ? 'deal' : 'deals'}.
      </p>

      {review.suggestions.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            className="mt-3 rounded-full border border-gray-200 px-3 py-1.5 text-xs font-bold text-brand-blue"
          >
            {open ? 'Close' : `Review ${review.suggestions.length} possible ${review.suggestions.length === 1 ? 'link' : 'links'}`}
          </button>

          {open && (
            <div className="mt-3">
              <p className="text-xs leading-5 text-gray-500">
                Each of these was recorded on a customer that had exactly one matching deal open on the
                day — or names the deal outright. Nothing is changed until you say so.
              </p>
              <ul className="mt-2 space-y-2">
                {review.suggestions.slice(0, 20).map((suggestion) => (
                  <li
                    key={suggestion.activityId}
                    className="rounded-lg border border-gray-200 p-2.5"
                  >
                    <p className="text-xs text-gray-500">
                      {formatSafeBusinessDate(suggestion.activityDate)} · {suggestion.accountName}
                    </p>
                    <p className="mt-0.5 break-words text-sm leading-5 text-gray-900">
                      {suggestion.activitySummary}
                    </p>
                    <p className="mt-1 text-sm text-gray-700">
                      ↳ {suggestion.opportunityName}
                      <span className="ml-1 text-xs text-gray-500">
                        ({suggestion.reason === 'named_in_note'
                          ? 'named in the note'
                          : 'the only deal open on that day'})
                      </span>
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={applying === suggestion.activityId}
                        onClick={() => onLink(suggestion.activityId, suggestion.opportunityId)}
                        className="inline-flex items-center gap-1.5 rounded-full bg-navy px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
                      >
                        {applying === suggestion.activityId && <Loader2 className="h-3 w-3 animate-spin" />}
                        Link it
                      </button>
                      <button
                        type="button"
                        disabled={applying === suggestion.activityId}
                        onClick={() => onIgnore(suggestion.activityId)}
                        className="rounded-full border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-700 disabled:opacity-60"
                      >
                        Not this one
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              {review.suggestions.length > 20 && (
                <p className="mt-2 text-xs text-gray-500">
                  Showing 20 of {review.suggestions.length}. The rest stay here until you get to them.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
