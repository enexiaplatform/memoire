import {useEffect,useState} from 'react';
import {incidentCandidates,type CommercialIncident} from '../../domain/commercialKernel/commercialIncident.ts';
import {openCommercialIncident,updateCommercialIncident} from '../../domain/commercialKernel/incidentCommands.ts';
import {loadCommercialIncidents,loadCommercialIncidentsForWorkspace,INCIDENT_UPDATED_EVENT} from '../../services/commercialKernel/incidentStore.ts';
import {kernelId} from '../../services/commercialKernel/kernelRepository.ts';
import type {PolicyCheck} from '../../domain/commercialKernel/commercialPolicy.ts';
import type {RequirementReading} from '../../domain/commercialKernel/outcomeRequirement.ts';
import type {CrmLiteOpportunity} from '../../services/opportunityStore.ts';
import type {CommercialScope} from '../../domain/commercialKernel/types.ts';
import {IncidentReadings} from './IncidentReadings.tsx';
type Draft={id:string;policyId:string;policyVersion:number;summary:string;materialImpact:string;coordinator:string;responseNote:string;expectedUpdatedAt:string|null;disposition:CommercialIncident['disposition']};
const inputClass='mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink';
export function CommercialIncidentSection({checks,opportunity,scope,readings}:{checks:PolicyCheck[];opportunity:CrmLiteOpportunity;scope:CommercialScope;readings:RequirementReading[]}){
 const [incidents,setIncidents]=useState<CommercialIncident[]>([]),[error,setError]=useState(''),[message,setMessage]=useState('');
 const [draft,setDraft]=useState<Draft|null>(null),[confirmed,setConfirmed]=useState(false);
 useEffect(()=>{
  let active=true;const refresh=()=>{try{const rows=loadCommercialIncidents().filter(row=>row.userId===scope.userId&&Boolean(row.isSample)===scope.sampleDataActive&&row.opportunityId===opportunity.id);
   if(active)setIncidents(rows);}catch(reason){if(active)setError(reason instanceof Error?reason.message:'Incident records unavailable.');}};
  setError('');refresh();void loadCommercialIncidentsForWorkspace(scope.userId,scope.sampleDataActive).then(()=>{if(active)refresh();})
   .catch(reason=>{if(active)setError(`Incident records may be incomplete. ${reason instanceof Error?reason.message:''}`);});
  window.addEventListener(INCIDENT_UPDATED_EVENT,refresh);window.addEventListener('storage',refresh);
  return()=>{active=false;window.removeEventListener(INCIDENT_UPDATED_EVENT,refresh);window.removeEventListener('storage',refresh);};
 },[scope.userId,scope.sampleDataActive,opportunity.id]);
 const candidates=incidentCandidates(checks,incidents),open=incidents.filter(row=>row.status==='open'),closed=incidents.filter(row=>row.status==='closed');
 if(!candidates.length&&!incidents.length&&!error)return null;
 const begin=(check:PolicyCheck)=>{setConfirmed(false);setMessage('');setDraft({id:kernelId('incident'),policyId:check.policy.id,policyVersion:check.policy.version,
  summary:'',materialImpact:'',coordinator:'',responseNote:'',expectedUpdatedAt:null,disposition:null});};
 const edit=(row:CommercialIncident)=>{setConfirmed(false);setMessage('');setDraft({id:row.id,policyId:row.policyId,policyVersion:row.basisSnapshot.policy.version,
  summary:row.summary,materialImpact:row.materialImpact,coordinator:row.coordinator,responseNote:row.responseNote,expectedUpdatedAt:row.updatedAt,disposition:null});};
 const save=()=>{
  if(!draft)return;
  const result=draft.expectedUpdatedAt?updateCommercialIncident(scope,{...draft,expectedUpdatedAt:draft.expectedUpdatedAt,confirmed,opportunity,readings})
   :openCommercialIncident(scope,{...draft,confirmed,opportunity,readings});
  setMessage(result.ok?'Incident response saved in this browser. Account sync runs when connected.':result.error);
  if(result.ok){setDraft(null);setConfirmed(false);}
 };
 return <section aria-label="Commercial incidents" className="mt-4 rounded-lg border border-line p-3">
  <h4 className="text-sm font-semibold text-ink">Commercial incidents</h4>
  <p className="mt-1 text-xs text-muted">Escalate a material deviation when people need to coordinate a response. Opening an incident does not create or assign a task.</p>
  {error&&<p role="alert" className="mt-2 text-sm text-amber-800">{error}</p>}
  {candidates.map(check=><div key={check.policy.id} className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm"><span>Unmet rule: {check.policy.title}</span>
   <button type="button" className="font-semibold text-brand-blue" onClick={()=>begin(check)}>Escalate deviation</button></div>)}
  <IncidentReadings incidents={open} checks={checks}/>
  {open.map(row=><button key={row.id} type="button" className="mt-2 block text-sm font-semibold text-brand-blue" onClick={()=>edit(row)}>Update response: {row.summary}</button>)}
  {closed.length>0&&<details className="mt-3 text-sm"><summary className="cursor-pointer text-muted">Closed incidents ({closed.length})</summary><IncidentReadings incidents={closed} checks={checks}/></details>}
  {draft&&<div className="mt-3 space-y-3 rounded-lg border border-line p-3">
   <p className="text-sm font-semibold">{draft.expectedUpdatedAt?'Record the coordinated response':'Escalate this deviation'}</p>
   {!draft.expectedUpdatedAt&&<><label className="block text-sm">Material deviation<input className={inputClass} maxLength={500} value={draft.summary} onChange={e=>setDraft({...draft,summary:e.target.value})}/></label>
    <label className="block text-sm">Why does this require coordination?<textarea className={inputClass} maxLength={2000} value={draft.materialImpact} onChange={e=>setDraft({...draft,materialImpact:e.target.value})}/></label></>}
   <label className="block text-sm">Who coordinates the response?<input className={inputClass} maxLength={200} value={draft.coordinator} onChange={e=>setDraft({...draft,coordinator:e.target.value})}/></label>
   {draft.expectedUpdatedAt&&<><label className="block text-sm">Response note<textarea className={inputClass} maxLength={4000} value={draft.responseNote} onChange={e=>setDraft({...draft,responseNote:e.target.value})}/></label>
    <label className="block text-sm">Disposition<select aria-label="Disposition" className={inputClass} value={draft.disposition||'open'} onChange={e=>setDraft({...draft,disposition:e.target.value==='open'?null:e.target.value as 'addressed'|'dismissed'})}>
     <option value="open">Keep open</option><option value="addressed">Close — current rule is met or does not apply</option><option value="dismissed">Dismiss — record why coordination is no longer needed</option></select></label></>}
   <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>I confirm this incident and response.</label>
   <div className="flex gap-3"><button type="button" disabled={!confirmed||!draft.coordinator.trim()||!draft.summary.trim()||!draft.materialImpact.trim()} className="rounded-full bg-brand-blue px-3 py-2 text-sm font-semibold text-white disabled:opacity-40" onClick={save}>Save incident response</button>
    <button type="button" className="text-sm text-muted" onClick={()=>setDraft(null)}>Cancel incident edit</button></div>
  </div>}
  {message&&<p role="status" className="mt-2 text-sm text-ink">{message}</p>}
 </section>;
}
