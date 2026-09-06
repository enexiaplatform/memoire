import { useState } from 'react';
import { BookOpen, ChevronDown } from 'lucide-react';
import {
  evidenceStrengthLabels,
  isAtLeast,
} from '../../domain/commercialLearning/learningPatterns';
import type {
  PersonalLearningEvidence,
  PersonalLearningResult,
} from '../../domain/commercialLearning/derivePersonalLearning';

/**
 * What this seller's own closed deals are starting to show.
 *
 * The design problem here is not how to present a finding. It is how to present
 * *not having one* without either hiding the feature or filling a page with six
 * empty cards - because on a young book "nothing has enough history yet" is the
 * true answer for months, and it is worth saying once, plainly.
 *
 * So: at most three patterns that have something to report, and one line saying
 * how many are still being measured. A pattern with a real difference behind it
 * leads with the raw counts, because "6 won / 2 lost against 4 won / 6 lost" is
 * something a seller can argue with and "1.7x more likely" is not.
 */

const MAX_SHOWN = 3;

export function PersonalLearningPanel({ learning }: { learning: PersonalLearningResult }) {
  const reportable = learning.patterns
    .filter((pattern) => isAtLeast(pattern.strength, 'early') && pattern.direction !== 'none')
    .sort((left, right) => (
      Math.abs(right.effectPoints || 0) - Math.abs(left.effectPoints || 0)
      || right.sample - left.sample
    ))
    .slice(0, MAX_SHOWN);

  const stillMeasuring = learning.patterns.length - reportable.length;

  // The one case where the whole section stays off screen: a workspace with no
  // closed deals at all has not started, and telling someone their history is
  // thin before they have any is noise.
  if (learning.closedDealsConsidered === 0 && reportable.length === 0) return null;

  return (
    <section
      className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
      aria-label="What your book is starting to show"
    >
      <div className="flex flex-wrap items-center gap-2">
        <BookOpen className="h-4 w-4 text-brand-blue" aria-hidden="true" />
        <h2 className="text-sm font-bold text-navy">What your book is starting to show</h2>
      </div>
      <p className="mt-1 text-xs leading-5 text-gray-500">
        Comparisons across your own closed deals. These describe what your records contain — not what
        caused an outcome.
      </p>

      {reportable.length > 0 && (
        <ul className="mt-3 space-y-3">
          {reportable.map((pattern) => (
            <li key={pattern.patternId}>
              <PatternCard pattern={pattern} />
            </li>
          ))}
        </ul>
      )}

      {stillMeasuring > 0 && (
        <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-xs leading-5 text-gray-600">
          {reportable.length > 0
            ? `${stillMeasuring} more ${stillMeasuring === 1 ? 'pattern is' : 'patterns are'} still being measured.`
            : `Memoire is measuring ${stillMeasuring} ${stillMeasuring === 1 ? 'pattern' : 'patterns'}. None has enough comparable history yet.`}
          {' '}
          {closedDealsLine(learning)}
        </p>
      )}
    </section>
  );
}

function closedDealsLine(learning: PersonalLearningResult) {
  const best = learning.patterns.reduce<PersonalLearningEvidence | null>(
    (winner, pattern) => (!winner || pattern.sample > winner.sample ? pattern : winner),
    null,
  );
  if (!best || best.sample === 0) {
    return `${learning.closedDealsConsidered} closed ${learning.closedDealsConsidered === 1 ? 'deal is' : 'deals are'} on file, and none of them has the recorded history these questions need yet.`;
  }
  return `The furthest along has ${best.sample} comparable ${best.sample === 1 ? 'deal' : 'deals'}.`;
}

function PatternCard({ pattern }: { pattern: PersonalLearningEvidence }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-bold text-navy">{pattern.label}</p>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-gray-600">
          {evidenceStrengthLabels[pattern.strength]}
        </span>
      </div>

      {/* Counts first. A rate is a summary of these, and the seller can check
          these against deals they remember. */}
      <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
        <div className="min-w-0 rounded-md bg-gray-50 px-2.5 py-2">
          <dt className="text-[11px] leading-4 text-gray-500">Deals {pattern.exposedLabel}</dt>
          <dd className="mt-0.5 font-bold text-gray-900">
            {pattern.exposed.won} won · {pattern.exposed.lost} lost
          </dd>
        </div>
        <div className="min-w-0 rounded-md bg-gray-50 px-2.5 py-2">
          <dt className="text-[11px] leading-4 text-gray-500">Comparable deals {pattern.comparisonLabel}</dt>
          <dd className="mt-0.5 font-bold text-gray-900">
            {pattern.comparison.won} won · {pattern.comparison.lost} lost
          </dd>
        </div>
      </dl>

      <p className="mt-2 text-sm leading-5 text-gray-900">{pattern.reading}</p>

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-brand-blue"
      >
        What this cannot tell you
        <ChevronDown className={`h-3.5 w-3.5 transition ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {open && (
        <ul className="mt-1.5 space-y-1 text-xs leading-5 text-gray-600">
          {pattern.limitations.map((limitation) => (
            <li key={limitation}>{limitation}</li>
          ))}
          <li>
            Built from {pattern.sample} comparable closed {pattern.sample === 1 ? 'deal' : 'deals'};
            {' '}
            {pattern.diagnostics.excluded} other closed {pattern.diagnostics.excluded === 1 ? 'deal was' : 'deals were'} left out
            because their history could not answer the question.
          </li>
        </ul>
      )}
    </div>
  );
}
