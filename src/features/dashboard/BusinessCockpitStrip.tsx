import { Link } from 'react-router-dom';
import { ArrowRight, Check } from 'lucide-react';
import type { BusinessCockpitAnswer } from '../../utils/businessCockpit';

/**
 * The ten-second picture.
 *
 * Two things were wrong with it before 2026-08-04, and both were the same
 * mistake in different clothes - the strip asked a question and then refused to
 * finish the conversation.
 *
 * It showed all five questions whether or not they had anything to say, so a
 * clean workspace spent two of five slots on "No initiative looks stalled" and
 * "Inbox clear". A card is the most expensive thing on a page; spending one to
 * report the absence of a problem is how a control tower turns into a report.
 * Answers with nothing in them now collapse into a single line underneath.
 *
 * And every card was a link off Today. Measured on the demo workspace: five
 * cards, zero of which opened the quick look - clicking "what moves money
 * today" threw you onto the Quotes page to answer the question Today had just
 * asked you. Where an answer is about a deal, the card opens that deal here,
 * and the operator can act and carry on down the page.
 */
export function BusinessCockpitStrip({
  answers,
  onOpenDeal,
}: {
  answers: BusinessCockpitAnswer[];
  onOpenDeal?: (opportunityId: string) => void;
}) {
  const live = answers.filter((answer) => answer.actionable);
  const clear = answers.filter((answer) => !answer.actionable);

  // Nothing needs attention at all. One line says that better than five cards
  // arranged to look like a dashboard.
  if (live.length === 0) {
    return (
      <section
        aria-label="Business cockpit"
        className="flex items-center gap-2.5 rounded-xl border border-emerald-100 bg-emerald-50/50 px-4 py-3"
      >
        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <Check className="h-3.5 w-3.5" />
        </span>
        <p className="text-sm font-semibold text-emerald-900">
          Nothing is waiting on you. Money, deals, follow-ups, initiatives and the capture inbox are all clear.
        </p>
      </section>
    );
  }

  return (
    <section aria-label="Business cockpit" className="flex flex-col gap-2">
      {/* Up to four live answers, so a row never drops a card to 1/5 of a
          laptop's width and truncates the customer's name to fit. */}
      <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${live.length >= 4 ? 'xl:grid-cols-4' : 'xl:grid-cols-3'}`}>
        {live.map((answer) => (
          <CockpitCard key={answer.id} answer={answer} onOpenDeal={onOpenDeal} />
        ))}
      </div>
      {clear.length > 0 && (
        <p className="px-1 text-xs leading-5 text-gray-400">
          <span className="font-bold text-emerald-600">Clear:</span>{' '}
          {clear.map((answer) => answer.subject.toLowerCase()).join(' · ')}
        </p>
      )}
    </section>
  );
}

function CockpitCard({
  answer,
  onOpenDeal,
}: {
  answer: BusinessCockpitAnswer;
  onOpenDeal?: (opportunityId: string) => void;
}) {
  const tone = answer.urgent
    ? 'border-amber-200 bg-amber-50/60 hover:border-amber-300'
    : 'border-gray-200 bg-white hover:border-brand-blue/40';
  const className = `group flex w-full flex-col rounded-xl border p-3 text-left shadow-sm transition hover:shadow ${tone}`;

  const body = (
    <>
      <p className="text-xs font-bold uppercase tracking-wide text-gray-500">{answer.question}</p>
      <p className={`mt-1.5 text-sm font-semibold leading-5 ${answer.urgent ? 'text-amber-900' : 'text-gray-700'}`}>
        {answer.answer}
      </p>
      {/* Says what the click does before it is clicked. The old card carried no
          affordance at all, so a tile that opened a drawer and one that left the
          page looked identical. */}
      <span
        className={`mt-2 inline-flex items-center gap-1 text-[11px] font-bold ${
          answer.urgent ? 'text-amber-700' : 'text-brand-blue'
        }`}
      >
        {answer.opportunityId ? 'Open the deal' : 'Go there'}
        <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
      </span>
    </>
  );

  if (answer.opportunityId && onOpenDeal) {
    const opportunityId = answer.opportunityId;
    return (
      <button type="button" onClick={() => onOpenDeal(opportunityId)} className={className}>
        {body}
      </button>
    );
  }

  return (
    <Link to={answer.href} className={className}>
      {body}
    </Link>
  );
}
