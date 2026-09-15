import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { DealQualification, QualificationElementScore } from '../../utils/dealQualificationScore';
import { FORECAST_GATE } from '../../utils/dealQualificationScore';
import type { MeddicLiteStatus } from '../../utils/meddicLite';

/**
 * MEDDIC on every deal, scored from the records.
 *
 * The score has existed since 2026-09-03 - nine elements, weighted, out of 32,
 * with Champion and Economic Buyer blocking at zero - and it was only visible
 * inside an open deal, as one pill in the drawer's head and a grid of ticks with
 * no words beside them. A pipeline where you have to open each deal to learn
 * whether anyone inside the account is carrying it is a pipeline nobody reads
 * that way. So the list carries the score on every row, and the drawer says for
 * each letter what the records show, what is missing and what to ask.
 *
 * Nothing here scores anything. The numbers come from `scoreDealQualification`,
 * which reads the stakeholder map, the objection ledger, the touches and the
 * quotes, and has no override - the way to raise a score is to record the thing.
 */

const cellInk: Record<MeddicLiteStatus, string> = {
  Strong: 'bg-tint-green-solid',
  Partial: 'bg-[#E8891A]',
  Missing: 'bg-chip',
};

function verdict(qualification: DealQualification): { text: string; tone: string; title: string } {
  const percent = Math.round(qualification.percentOfMax * 100);
  if (qualification.blockers.length > 0) {
    const names = qualification.blockers.map((blocker) => blocker.label);
    return {
      text: `No ${names.map((name) => name.toLowerCase()).join(' · no ')}`,
      tone: 'text-tint-red-solid',
      title: `${names.join(' and ')} scored zero. Those two block a deal from backing a forecast whatever the total.`,
    };
  }
  if (qualification.backsForecast) {
    return { text: 'Backs a forecast', tone: 'text-tint-green-solid', title: `${percent}% clears the ${Math.round(FORECAST_GATE * 100)}% forecast gate with no blocker.` };
  }
  return {
    text: `Below the ${Math.round(FORECAST_GATE * 100)}% gate`,
    tone: 'text-tint-amber-solid',
    title: `${percent}% of the maximum. A deal needs ${Math.round(FORECAST_GATE * 100)}% and no blocker to back a forecast.`,
  };
}

/** Nine cells, one per element in ladder order, lit by how well each is evidenced. */
export function MeddicMeter({ elements, size = 'row' }: { elements: QualificationElementScore[]; size?: 'row' | 'panel' }) {
  return (
    <span
      role="img"
      aria-label={elements.map((element) => `${element.label}: ${element.status}`).join('; ')}
      className="inline-flex gap-[3px]"
    >
      {elements.map((element) => (
        <span
          key={element.key}
          title={`${element.label}: ${element.status}${element.blocking && element.points === 0 ? ' (blocks the forecast)' : ''}`}
          className={`rounded-full ${size === 'row' ? 'h-[5px] w-[9px]' : 'h-1.5 w-5'} ${cellInk[element.status]} ${
            element.blocking && element.points === 0 ? 'ring-1 ring-tint-red-solid ring-offset-1' : ''
          }`}
        />
      ))}
    </span>
  );
}

/** The list cell: score, the nine-letter meter, and whether it can back a forecast. */
export function MeddicScoreCell({ qualification }: { qualification: DealQualification }) {
  const percent = Math.round(qualification.percentOfMax * 100);
  const summary = verdict(qualification);
  return (
    <div className="min-w-[128px]">
      <p className="whitespace-nowrap font-display text-[15px] font-extrabold leading-none tracking-[-0.02em] text-ink">
        {qualification.weighted}
        <span className="font-body text-[11px] font-semibold tracking-normal text-muted">/{qualification.max}</span>
        <span className={`ml-1.5 font-body text-[11px] font-bold tracking-normal ${summary.tone}`}>{percent}%</span>
      </p>
      <div className="mt-1.5">
        <MeddicMeter elements={qualification.elements} />
      </div>
      <p className={`mt-1 max-w-[170px] truncate text-[11px] font-semibold ${summary.tone}`} title={summary.title}>
        {summary.text}
      </p>
    </div>
  );
}

const statusPill: Record<MeddicLiteStatus, string> = {
  Strong: 'bg-tint-green-pill text-tint-green-solid',
  Partial: 'bg-tint-amber-pill text-tint-amber-solid',
  Missing: 'bg-tint-red-bg text-tint-red-solid',
};

/**
 * The drawer's evidence section: the score, then each letter with the one line
 * worth reading - what the records show when it is strong, what is missing when
 * it is not - and the evidence, gaps and questions one click further.
 */
export function MeddicInsightPanel({
  qualification,
  openObjections,
}: {
  qualification: DealQualification;
  openObjections: number;
}) {
  const percent = Math.round(qualification.percentOfMax * 100);
  const summary = verdict(qualification);
  const [open, setOpen] = useState<string>('');

  return (
    <section aria-label="MEDDIC qualification" className="mt-2 rounded-panel bg-white p-4 shadow-panel">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted">MEDDIC score</p>
          <p className="mt-1 font-display text-[30px] font-extrabold leading-none tracking-[-0.03em] text-ink">
            {qualification.weighted}
            <span className="text-base font-bold text-muted">/{qualification.max}</span>
            <span className={`ml-2 text-base font-bold ${summary.tone}`}>{percent}%</span>
          </p>
          <p className={`mt-1 text-xs font-semibold ${summary.tone}`} title={summary.title}>{summary.text}</p>
        </div>
        <div className="text-right">
          <MeddicMeter elements={qualification.elements} size="panel" />
          <p className="mt-1.5 text-xs text-muted">
            Evidence supports <strong className="text-ink">{qualification.evidenceStage}</strong>
            {qualification.claimedStage !== qualification.evidenceStage && (
              <> · you have it at <strong className="text-ink">{qualification.claimedStage}</strong></>
            )}
          </p>
        </div>
      </div>

      <ul className="mt-4 flex flex-col divide-y divide-line-soft">
        {qualification.elements.map((element) => {
          const line = element.status === 'Strong'
            ? element.evidence[0] || 'Recorded.'
            : element.gaps[0] || element.evidence[0] || 'Nothing recorded yet.';
          const expanded = open === element.key;
          const hasMore = element.evidence.length + element.gaps.length + element.questions.length > 1;
          return (
            <li key={element.key} className="py-2.5 first:pt-0 last:pb-0">
              <button
                type="button"
                onClick={() => setOpen(expanded ? '' : element.key)}
                aria-expanded={expanded}
                disabled={!hasMore}
                className="flex w-full items-start gap-3 text-left disabled:cursor-default"
              >
                <span className={`mt-0.5 inline-flex w-[64px] shrink-0 justify-center rounded-full px-2 py-[3px] text-[10px] font-bold uppercase tracking-[0.07em] ${statusPill[element.status]}`}>
                  {element.status}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-sm font-semibold text-ink">{element.label}</span>
                    <span className="font-mono text-[11px] text-muted">{element.weightedPoints}/{element.weight * 2}</span>
                    {element.blocking && element.points === 0 && (
                      <span className="text-[10px] font-bold uppercase tracking-[0.07em] text-tint-red-solid">Blocks forecast</span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-xs leading-5 text-tint-neutral-ink">{line}</span>
                </span>
                {hasMore && (
                  <ChevronDown className={`mt-1 h-4 w-4 shrink-0 text-muted transition ${expanded ? 'rotate-180' : ''}`} />
                )}
              </button>
              {expanded && (
                <div className="ml-[76px] mt-2 space-y-2 text-xs leading-5">
                  {element.evidence.length > 0 && (
                    <div>
                      <p className="font-bold text-tint-green-solid">What the records show</p>
                      <ul className="mt-0.5 space-y-0.5 text-tint-neutral-ink">
                        {element.evidence.map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    </div>
                  )}
                  {element.gaps.length > 0 && (
                    <div>
                      <p className="font-bold text-tint-amber-solid">Still missing</p>
                      <ul className="mt-0.5 space-y-0.5 text-tint-neutral-ink">
                        {element.gaps.map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    </div>
                  )}
                  {element.status !== 'Strong' && element.questions.length > 0 && (
                    <div>
                      <p className="font-bold text-brand-blue-dark">Ask next</p>
                      <ul className="mt-0.5 space-y-0.5 text-tint-neutral-ink">
                        {element.questions.slice(0, 3).map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {qualification.blockers.length > 0 && (
        <p className="mt-3 rounded-xl bg-tint-red-bg px-3 py-2 text-xs leading-5 text-tint-red-ink">
          <span className="font-bold">Nothing recorded on: </span>
          {qualification.blockers.map((element) => element.label).join(', ')}. These are the two the deal does not
          survive without, so the evidence cannot back a forecast until one of them is answered.
        </p>
      )}

      {openObjections > 0 && (
        <p className="mt-2 text-xs leading-5 text-muted">
          {openObjections} open {openObjections === 1 ? 'objection' : 'objections'} on this customer, listed in the full
          analysis below.
        </p>
      )}
    </section>
  );
}
