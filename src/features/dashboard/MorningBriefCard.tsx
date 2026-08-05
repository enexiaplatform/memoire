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
 * So the cards keep the chrome, because they are the things you click, and the
 * brief becomes typography: a sentence, the context under it, and the questions
 * as plain links. Nothing was removed except the decoration.
 */
export function MorningBriefCard({ brief }: { brief: MorningBrief }) {
  return (
    <section aria-label="Morning brief" className="px-1">
      <p className="text-sm font-semibold leading-6 text-navy">{brief.headline}</p>
      {brief.focus.length > 0 && (
        <p className="mt-0.5 text-xs leading-5 text-gray-500">{brief.focus.join(' ')}</p>
      )}
      {brief.questions.length > 0 && (
        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-5">
          <span className="font-semibold text-gray-400">Ask:</span>
          {/* Two, not three. The third was always the generic "what should I do
              first today?", which is the question Today is already answering
              three sections down. */}
          {brief.questions.slice(0, 2).map((question) => (
            <Link
              key={question.label}
              to={question.href}
              className="font-semibold text-brand-blue hover:underline"
            >
              {question.label}
            </Link>
          ))}
        </p>
      )}
    </section>
  );
}
