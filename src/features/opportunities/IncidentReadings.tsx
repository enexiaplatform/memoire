import type {CommercialIncident} from '../../domain/commercialKernel/commercialIncident.ts';
import type {PolicyCheck} from '../../domain/commercialKernel/commercialPolicy.ts';
export function IncidentReadings({incidents,checks}:{incidents:CommercialIncident[];checks:PolicyCheck[]}){
 return <ul className="mt-3 space-y-3">{incidents.map(incident=>{
  const check=checks.find(row=>row.policy.id===incident.policyId);
  return <li key={incident.id} className="rounded-lg border border-line p-3 text-sm">
   <p><strong>{incident.summary}</strong> · {incident.status==='open'?'Open':`Closed · ${incident.disposition}`} · Version {incident.version}</p>
   <p className="mt-1">Material impact: {incident.materialImpact}</p><p className="mt-1">Response coordinator: {incident.coordinator}</p>
   {incident.responseNote&&<p className="mt-1">Response: {incident.responseNote}</p>}
   <p className="mt-1 text-xs text-muted">Rule check at this view: {check?({breached:'unmet',satisfied:'requirement met',unknown:'cannot determine',not_applicable:'does not apply'}[check.status]):'not active or unavailable'}.</p>
   <details className="mt-2 text-xs text-muted"><summary className="cursor-pointer">Opening basis</summary>
    <p>{incident.basisSnapshot.policy.title} · Policy version {incident.basisSnapshot.policy.version}</p><p>{incident.basisSnapshot.reason}</p>
    <p>Reviewed {new Date(incident.basisSnapshot.capturedAt).toLocaleString()}</p><p className="break-words">Source references: {incident.basisSnapshot.sourceRecordIds.join(' · ')}</p></details>
  </li>;
 })}</ul>;
}
