import { Link } from 'react-router-dom';
import type { MorningBrief } from '../../utils/morningBrief';

/**
 * The one line the day opens with, and at most two things to ask about it.
 *
 * It used to be a gradient card with an icon medallion, a heading, a bullet
 * list and three pill links - roughly the visual weight of the cockpit cards
 * directly above it, for content that is a *summary of* those cards. Two
 * headline surfaces stacked at the top of Today is most of why the page read
 * as busy: the eye has to decide which one is the page's actual first sentence,
 * and there is no right answer when both are dressed as one.
 *
 * Daylight takes that to its end: the brief is not a card at all but the
 * sentence under the greeting, with the headline in ink and the context after
 * it in the quieter grey. The questions stay as plain chips beneath.
 */
export function MorningBriefCard({ brief }: { brief: MorningBrief }) {
  return (
    <div aria-label="Morning brief">
      <p className="text-[15px] leading-[1.55] text-tint-neutral-ink [text-wrap:pretty] sm:text-[15.5px]">
        <strong className="font-semibold text-ink">{brief.headline}</strong>
      </p>
      {(brief.focus.length > 0 || brief.questions.length > 0) && (
        <details className="mt-1 text-xs text-tint-neutral-ink">
          <summary className="w-fit cursor-pointer font-semibold text-muted hover:text-ink">Context and suggested questions</summary>
          {brief.focus.length > 0 && <p className="mt-1 text-sm leading-6">{brief.focus.join(' ')}</p>}
      {brief.questions.length > 0 && (
        <p className="mt-2 flex flex-wrap items-center gap-2 text-xs leading-5">
          <span className="font-semibold text-muted">Ask:</span>
          {/* Two, not three. The third was always the generic "what should I do
              first today?", which is the question Today is already answering
              three sections down. */}
          {brief.questions.slice(0, 2).map((question) => (
            <Link
              key={question.label}
              to={question.href}
              className="rounded-full bg-chip px-3 py-1 font-semibold text-tint-neutral-ink transition hover:bg-line-strong hover:text-ink"
            >
              {question.label}
            </Link>
          ))}
        </p>
      )}
        </details>
      )}
    </div>
  );
}
