import { ArrowRight, UserPlus, XCircle } from 'lucide-react';
import type { CrmLiteOpportunity } from '../../services/opportunityStore';
import type { DealQualification } from '../../utils/dealQualificationScore';
import type { OpportunitySilenceState } from '../../utils/proactiveNudges';
import { formatCurrencyAmount } from '../../utils/money';
import { formatSafeBusinessDate, isBusinessDateOverdue, timestampToLocalDateKey } from '../../utils/safeDate';
import { Monogram, Panel } from '../../components/ui/daylight';
import { ghostPillClass, primaryPillClass } from '../../components/ui/daylightStyles';
import { MeddicScoreCell } from './MeddicInsight';

export type LeadRow = {
  opportunity: CrmLiteOpportunity;
  lastActivityDate: string;
  decisionMakerName: string;
  silence: OpportunitySilenceState;
  qualification: DealQualification;
};

/**
 * Leads: the deals at the Lead stage, kept apart from the pipeline.
 *
 * A lead is somebody worth a conversation who has not yet shown a real need,
 * and the live book had a dozen of them sitting in the same list as deals at
 * Proposal - counted in the same pipeline, sorted into the same quarters. The
 * question a lead asks is different ("is this worth qualifying?"), so it gets
 * its own list, and the two things you do with a lead are the two buttons on
 * its row: qualify it into Discovery, or say why it is out.
 *
 * Nothing here is a new record type. A lead is an opportunity at the Lead
 * stage; qualifying it changes the stage and nothing else, so its touches,
 * people and MEDDIC evidence come with it.
 */
export function LeadsTable({
  rows,
  busyId,
  onOpen,
  onQualify,
  onDisqualify,
}: {
  rows: LeadRow[];
  /** The lead a qualify is being saved for. */
  busyId: string;
  onOpen: (opportunity: CrmLiteOpportunity) => void;
  onQualify: (opportunity: CrmLiteOpportunity) => void;
  onDisqualify: (opportunity: CrmLiteOpportunity) => void;
}) {
  return (
    <Panel className="min-w-0 overflow-hidden" aria-label="Leads">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-5 py-4">
        <div>
          <h2 className="font-display text-[17px] font-bold text-ink">Leads to qualify</h2>
          <p className="mt-0.5 text-xs text-muted">
            Qualify moves a lead to Discovery and into the pipeline. Disqualify closes it with the reason, so the book learns why.
          </p>
        </div>
        <span className="font-mono text-xs text-tint-neutral-ink">{rows.length} {rows.length === 1 ? 'lead' : 'leads'}</span>
      </div>
      <div className="record-table-scroller">
        <table className="w-full min-w-[980px] border-collapse text-left text-sm">
          <thead className="sticky top-0 z-10 bg-bar text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted">
            <tr>
              <th className="border-b border-line px-5 py-2.5">Lead</th>
              <th className="border-b border-line px-3 py-2.5">Source</th>
              <th className="border-b border-line px-3 py-2.5">Added</th>
              <th className="border-b border-line px-3 py-2.5">Last touch</th>
              <th className="border-b border-line px-3 py-2.5">Next step</th>
              <th className="border-b border-line px-3 py-2.5">MEDDIC</th>
              <th className="border-b border-line px-3 py-2.5 text-right">Value</th>
              <th className="border-b border-line px-5 py-2.5 text-right"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {rows.map((row) => {
              const { opportunity } = row;
              const closed = opportunity.status !== 'Active';
              const added = timestampToLocalDateKey(opportunity.createdAt);
              const source = [opportunity.channel, opportunity.opportunityType, opportunity.sourceSystem]
                .map((value) => (value || '').trim())
                .find(Boolean);
              const quiet = row.silence.status === 'silent' || row.silence.status === 'at-risk';
              return (
                <tr
                  key={opportunity.id}
                  onClick={() => onOpen(opportunity)}
                  className="group cursor-pointer align-top transition hover:bg-canvas"
                >
                  <td className="px-5 py-3">
                    <div className="flex items-start gap-3">
                      <Monogram name={opportunity.accountName || opportunity.opportunityName || '?'} size={32} />
                      <div className="min-w-0">
                        <p className="max-w-[260px] truncate font-bold text-ink" title={opportunity.accountName}>
                          {opportunity.accountName || 'No account'}
                        </p>
                        <p className="max-w-[260px] truncate text-xs text-tint-neutral-ink" title={opportunity.opportunityName}>
                          {opportunity.opportunityName || 'Untitled'}
                        </p>
                        <p className={`text-[11px] ${row.decisionMakerName ? 'text-muted' : 'font-semibold text-tint-amber-solid'}`}>
                          {row.decisionMakerName || 'Nobody named yet'}
                        </p>
                        {closed && (
                          <p className="text-[11px] font-semibold text-muted">{opportunity.status}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    {source
                      ? <span className="rounded-full bg-chip px-2 py-[3px] text-[11px] font-semibold text-tint-neutral-ink">{source}</span>
                      : <span className="text-xs italic text-muted">Not recorded</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-xs text-tint-neutral-ink">
                    {added ? formatSafeBusinessDate(added) : '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">
                    <p className={`text-xs font-semibold ${row.lastActivityDate ? 'text-ink' : 'text-tint-amber-solid'}`}>
                      {row.lastActivityDate ? formatSafeBusinessDate(row.lastActivityDate) : 'No touch yet'}
                    </p>
                    {quiet && row.silence.daysQuiet !== null && (
                      <p className={`text-[11px] font-bold ${row.silence.status === 'silent' ? 'text-tint-red-solid' : 'text-tint-amber-solid'}`}>
                        Quiet {row.silence.daysQuiet}d
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <p className={`max-w-[220px] line-clamp-2 text-xs font-semibold ${opportunity.nextAction ? 'text-ink' : 'text-tint-amber-solid'}`} title={opportunity.nextAction}>
                      {opportunity.nextAction || 'No next step'}
                    </p>
                    {opportunity.nextAction && opportunity.nextActionDate && (
                      <p className={`text-[11px] ${isBusinessDateOverdue(opportunity.nextActionDate) ? 'font-bold text-tint-red-solid' : 'text-muted'}`}>
                        {formatSafeBusinessDate(opportunity.nextActionDate)}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <MeddicScoreCell qualification={row.qualification} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right font-mono text-xs font-bold text-ink">
                    {opportunity.estimatedValue ? formatCurrencyAmount(opportunity.estimatedValue, opportunity.currency) : '—'}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {!closed && (
                      <div className="flex justify-end gap-2" onClick={(event) => event.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => onQualify(opportunity)}
                          disabled={busyId === opportunity.id}
                          className={`${primaryPillClass} px-3.5 py-1.5 text-xs`}
                          title="Move to Discovery - it joins the pipeline with everything recorded on it"
                        >
                          {busyId === opportunity.id ? 'Moving…' : 'Qualify'}
                          <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDisqualify(opportunity)}
                          className={`${ghostPillClass} px-3 py-1.5 text-xs`}
                          title="Close it as Lost, with the reason"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Disqualify
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

/** The leads view when there are none. */
export function LeadsEmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <Panel className="p-8 text-center">
      <p className="font-display text-lg font-bold text-ink">No leads waiting.</p>
      <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-tint-neutral-ink">
        A lead is somebody worth a conversation who has not shown a real need yet. Add one here, and qualify it into the
        pipeline once they have.
      </p>
      <button type="button" onClick={onAdd} className={`mt-4 ${primaryPillClass}`}>
        <UserPlus className="h-4 w-4" />
        Add a lead
      </button>
    </Panel>
  );
}
