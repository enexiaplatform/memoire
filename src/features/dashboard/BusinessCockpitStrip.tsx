import { Link } from 'react-router-dom';
import { ArrowRight, Check } from 'lucide-react';
import type { BusinessCockpitAnswer } from '../../utils/businessCockpit';
import { Panel } from '../../components/ui/daylight';
import { delay } from '../../components/ui/daylightStyles';

/**
 * The cockpit's five questions, answered.
 *
 * Two things were wrong with it before 2026-08-04, and both were the same
 * mistake in different clothes - the strip asked a question and then refused to
 * finish the conversation.
 *
 * It showed all five questions whether or not they had anything to say, so a
 * clean workspace spent two of five slots on "No initiative looks stalled" and
 * "Inbox clear". Answers with nothing in them still collapse into a single line
 * underneath.
 *
 * And every card was a link off Today. Where an answer is about a deal, the row
 * opens that deal here, and the operator can act and carry on down the page.
 *
 * Daylight (2026-09-15) moved it beside the moves. The page now opens on four
 * numbers, and these answers are the record-level pointers behind them - the
 * deal closest to signing, the one that moved, the follow-ups that slipped - so
 * they read as the context a move is decided in rather than as a second row of
 * headline cards competing with the figures above.
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

  return (
    <Panel aria-label="Business cockpit" className="animate-rise px-[22px] py-5" style={delay(270)}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-base font-bold text-ink">Five questions</h2>
        <span className="rounded-full bg-tint-green-pill px-[11px] py-1 font-display text-xs font-bold text-tint-green-solid">
          {clear.length} / {answers.length} clear
        </span>
      </div>

      {live.length === 0 ? (
        // Nothing needs attention at all. One line says that better than five
        // rows arranged to look like a dashboard.
        <p className="mt-3.5 flex items-start gap-2.5 rounded-2xl bg-tint-green-bg px-3.5 py-3 text-[13px] font-semibold leading-5 text-tint-green-ink">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-tint-green-solid" />
          Nothing is waiting on you. Money, deals, follow-ups, initiatives and the capture inbox are all clear.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-1">
          {live.map((answer) => (
            <li key={answer.id}>
              <CockpitRow answer={answer} onOpenDeal={onOpenDeal} />
            </li>
          ))}
        </ul>
      )}

      {live.length > 0 && clear.length > 0 && (
        <p className="mt-2 px-3 text-xs leading-5 text-muted">
          <span className="font-bold text-tint-green-solid">Clear:</span>{' '}
          {clear.map((answer) => answer.subject.toLowerCase()).join(' · ')}
        </p>
      )}
    </Panel>
  );
}

function CockpitRow({
  answer,
  onOpenDeal,
}: {
  answer: BusinessCockpitAnswer;
  onOpenDeal?: (opportunityId: string) => void;
}) {
  const className = 'group -mx-1 flex w-full items-start gap-[11px] rounded-xl px-3 py-2.5 text-left transition hover:bg-canvas';

  const body = (
    <>
      <span
        aria-hidden="true"
        className={`mt-[5px] h-2 w-2 shrink-0 rounded-full ${answer.urgent ? 'bg-[#E8891A]' : 'bg-brand-blue'}`}
      />
      <span className="min-w-0 flex-1">
        <span className="block text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">{answer.question}</span>
        <span className={`mt-0.5 block text-[13px] font-semibold leading-5 ${answer.urgent ? 'text-tint-amber-ink' : 'text-ink'}`}>
          {answer.answer}
        </span>
        {/* The condition behind the flag, named as the field that holds it. A
            risk label alone ("Weak pipeline") sends people editing whatever looks
            related, and the flag survives every one of those edits. */}
        {answer.detail && (
          <span className="mt-0.5 line-clamp-2 block text-xs leading-5 text-muted" title={answer.detail}>{answer.detail}</span>
        )}
        {/* Says what the click does before it is clicked, so a row that opens a
            drawer and one that leaves the page never look identical. */}
        <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-brand-blue-dark">
          {answer.opportunityId ? 'Open the deal' : 'Go there'}
          <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
        </span>
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
