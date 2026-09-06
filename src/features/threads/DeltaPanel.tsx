import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, History, Info } from 'lucide-react';
import type {
  CommercialDeltaItem,
  CommercialDeltaSubject,
} from '../../domain/commercialKernel/deriveDelta';
import type { Severity } from '../../domain/commercialKernel/policyEngine';
import { evidenceCategoryLabels } from '../../domain/commercialKernel/commercialEvidence';
import { formatSafeBusinessDate } from '../../utils/safeDate';
import { useCommercialDelta } from './useCommercialDelta';

/**
 * What changed, so what, now what - for one customer or one deal.
 *
 * The panel's shape is the argument. "What changed" holds only transitions
 * Memoire actually observed, and "Where it stands now" holds only present-tense
 * conditions; they are never merged into one list, because a reader cannot tell
 * a remembered change from a current state once they are in the same column,
 * and the previous attempt at this feature printed the second while claiming
 * the first.
 *
 * It renders nothing when there is nothing to say. A card that appears every
 * time, with "no significant changes" in it, is a card people stop reading -
 * and then stop seeing on the week that it matters.
 */

const severityDot: Record<Severity, string> = {
  critical: 'bg-red-500',
  high: 'bg-amber-500',
  medium: 'bg-gray-400',
  low: 'bg-gray-300',
};

export function DeltaPanel({
  subject,
  changeLimit = 5,
  conditionLimit = 3,
}: {
  subject: CommercialDeltaSubject | null;
  changeLimit?: number;
  conditionLimit?: number;
}) {
  const { delta, bestMove, currentEvidence } = useCommercialDelta(subject);
  const [showingCoverage, setShowingCoverage] = useState(false);
  const [showingWhy, setShowingWhy] = useState(false);

  const changes = useMemo(() => delta?.changes.slice(0, changeLimit) || [], [changeLimit, delta]);
  const conditions = useMemo(
    () => delta?.conditions.slice(0, conditionLimit) || [],
    [conditionLimit, delta],
  );

  // Nothing observed, nothing standing, nothing to advise. Stay off the screen.
  if (!delta || (changes.length === 0 && conditions.length === 0)) return null;


  const heading = changes.length > 0
    ? `${changes.length === 1 ? '1 meaningful change' : `${changes.length} meaningful changes`} in the last ${delta.period.days} days`
    : 'Where this stands now';

  return (
    <section
      className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
      aria-label={`What changed · ${delta.subject.name}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <History className="h-4 w-4 text-brand-blue" aria-hidden="true" />
        <h2 className="text-sm font-bold text-navy">{heading}</h2>
      </div>

      {changes.length > 0 && (
        <div className="mt-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">What changed</p>
          <ul className="mt-1.5 space-y-1.5">
            {changes.map((item) => (
              <li key={item.id} className="flex items-start gap-2 text-sm leading-5 text-gray-900">
                <span
                  className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${severityDot[item.significance]}`}
                  aria-hidden="true"
                />
                <span className="min-w-0">
                  {item.statement}
                  {item.groupedCount ? null : <ChangeWhen item={item} />}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {conditions.length > 0 && (
        <div className="mt-3">
          {/* Labelled separately from the changes above, and only when there is
              something above to tell it apart from. These are conditions that
              are true now - not things that happened. */}
          {changes.length > 0 && (
            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">
              Where it stands now
            </p>
          )}
          <ul className="mt-1.5 space-y-1.5">
            {conditions.map((item) => (
              <li key={item.id} className="flex items-start gap-2 text-sm leading-5 text-gray-700">
                <span
                  className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${severityDot[item.significance]}`}
                  aria-hidden="true"
                />
                <span className="min-w-0">{item.statement}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {currentEvidence.length > 0 && (
        <div className="mt-3">
          {/* What the deal is currently standing on. Three lines per finding -
              what it is, when it was seen, and the sentence it came from - and
              nothing else. An evidence viewer with filters and a history tab is
              a page nobody opens; the quote under the claim is the whole
              feature, because it is what makes the claim checkable. */}
          <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">
            {evidenceCategoryLabels[currentEvidence[0].category]}
          </p>
          <ul className="mt-1.5 space-y-1.5">
            {currentEvidence.map((record) => (
              <li key={record.id} className="min-w-0 text-sm leading-5">
                <span className="font-semibold text-gray-900">{record.summary}</span>
                <span className="text-gray-500"> · {formatSafeBusinessDate(record.observedAt)}</span>
                <p className="mt-0.5 break-words text-xs italic leading-4 text-gray-500">
                  &ldquo;{record.evidenceText}&rdquo;
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {delta.interpretation && (
        <div className="mt-3 rounded-lg bg-gray-50 px-3 py-2">
          <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">So what</p>
          <p className="mt-0.5 text-sm leading-5 text-gray-900">{delta.interpretation.statement}</p>
        </div>
      )}

      {delta.recommendation && (
        <div className="mt-3 rounded-lg border border-gray-200 px-3 py-2">
          <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Now what</p>
          {/* The kernel's own answer, ranked by the kernel. This panel does not
              score, weight or write recommendations - there is one engine, and
              the ranking is a pure ordering over what it produced. */}
          <p className="mt-0.5 text-sm leading-5 text-gray-900">
            {bestMove?.candidateAction || delta.recommendation.recommendedAction}
          </p>

          {bestMove && bestMove.rationale.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setShowingWhy((open) => !open)}
                aria-expanded={showingWhy}
                className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-gray-500 hover:text-gray-700"
              >
                <Info className="h-3 w-3" aria-hidden="true" />
                Why this
              </button>
              {showingWhy && (
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] leading-4 text-gray-600">
                  {bestMove.rationale.map((line) => <li key={line}>{line}</li>)}
                </ul>
              )}
            </>
          )}

          <Link
            to={delta.recommendation.href}
            className="mt-1 flex items-center gap-1 text-xs font-bold text-brand-blue hover:underline"
          >
            Open it
            <ArrowRight className="h-3 w-3" aria-hidden="true" />
          </Link>
        </div>
      )}

      {/* Coverage, stated quietly and only when it is not complete. The product
          must never let a short list of changes read as "nothing else happened"
          when the truth is "nothing else was recorded". */}
      {!delta.historyCoverage.complete && (
        <div className="mt-3 border-t border-gray-100 pt-2">
          <button
            type="button"
            onClick={() => setShowingCoverage((open) => !open)}
            aria-expanded={showingCoverage}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-500 hover:text-gray-700"
          >
            <Info className="h-3 w-3" aria-hidden="true" />
            {coverageLabel(delta.historyCoverage.observedFrom)}
          </button>
          {showingCoverage && (
            <p className="mt-1 text-[11px] leading-4 text-gray-500">
              Memoire lists changes it recorded as they happened, plus promises, objections and
              outcomes dated in your own records. Field changes made before it started tracking
              this workspace were never written down, so they cannot appear here.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function coverageLabel(observedFrom: string | null) {
  if (!observedFrom) return 'Changes shown from when Memoire started tracking this workspace';
  const date = new Date(observedFrom);
  if (Number.isNaN(date.getTime())) return 'Changes shown from when Memoire started tracking this workspace';
  return `Changes tracked since ${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

/** The day it happened, for a single observed change. Never shown on a group. */
function ChangeWhen({ item }: { item: CommercialDeltaItem }) {
  if (!item.occurredAt) return null;
  const date = new Date(item.occurredAt);
  if (Number.isNaN(date.getTime())) return null;
  return (
    <span className="ml-1 whitespace-nowrap text-xs text-gray-400">
      {date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
    </span>
  );
}
