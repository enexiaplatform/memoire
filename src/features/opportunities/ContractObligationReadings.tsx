import type {ContractObligationReading} from '../../domain/commercialKernel/contractObligation';
export function ContractObligationReadings({readings}:{readings:ContractObligationReading[]}){
 return <div className="space-y-3">{readings.map(view=><article key={view.obligation.id} className="rounded-lg border border-line p-3 text-sm text-ink">
  <p className="font-semibold">{view.obligation.contractReference} · {view.obligation.contractVersion} · Mapping version {view.obligation.version}</p>
  <p className="mt-1 text-xs text-muted">Acceptance recorded for {view.obligation.acceptedOn}: {view.obligation.acceptanceReference}</p>
  <p className="mt-2">Clause: {view.obligation.clause}</p>
  <p>Required outcome: {view.requirement?.expectedOutcome||'Unavailable'} · {view.outcome}</p>
  <p>Condition: {view.condition?.statement||'No linked condition'}</p>
  <p>Promise: {view.commitment?.commitmentText||'Unavailable'} · {view.commitment?.status||'unavailable'}</p>
  <p>Recorded due date: {view.dueDate||'Not recorded'}</p>
  <p className="text-xs text-muted">{view.timingLinks.length ? 'Requirement timing is linked to this promise.' : 'No explicit timing link connects this Requirement and promise.'}</p>
  <p className="text-xs text-muted">{view.moneyLinks.length ? 'Contractual money references: '+view.moneyLinks.map(g=>g.moneySourceId).join(', ') : 'No contractual money gate is recorded for this Requirement.'}</p>
  <p className="text-xs text-muted">Supporting outcome evidence: {view.sourceEvidenceIds.join(', ')||'None recorded'}</p>
  <p className="mt-2 text-xs text-muted">Operational reading only. A completed promise does not by itself establish fulfilment of the required outcome.</p>
 </article>)}</div>;
}
