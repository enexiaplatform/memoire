import {useEffect,useState} from 'react';
import {ContractObligationReadings} from './ContractObligationReadings';
import {readContractObligation,type ContractObligation,type ContractReferences} from '../../domain/commercialKernel/contractObligation';
import {publishContractObligation} from '../../domain/commercialKernel/contractObligationCommands';
import {loadContractObligations,loadContractObligationsForWorkspace,CONTRACT_OBLIGATION_UPDATED_EVENT} from '../../services/commercialKernel/contractObligationStore';
import {kernelId} from '../../services/commercialKernel/kernelRepository';
import type {CommercialScope} from '../../domain/commercialKernel/types';
import type {RequirementReading} from '../../domain/commercialKernel/outcomeRequirement';
import type {CommercialTimingAssertion} from '../../domain/commercialKernel/commercialTiming';
import type {CommercialMoneyGate} from '../../domain/commercialKernel/moneyGate';
import type {CrmLiteOpportunity} from '../../services/opportunityStore';
type Draft=Pick<ContractObligation,'id'|'version'|'contractReference'|'contractVersion'|'acceptedOn'|'acceptanceReference'|'clause'|'requirementId'|'commitmentId'|'revisionReason'|'lifecycle'>;
const field='mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink';
export function ContractObligationSection({opportunity,scope,refs,readings,timing,gates}:{opportunity:CrmLiteOpportunity;scope:CommercialScope;refs:ContractReferences;readings:RequirementReading[];timing:CommercialTimingAssertion[];gates:CommercialMoneyGate[]}){
 const [rows,setRows]=useState<ContractObligation[]>([]),[error,setError]=useState(''),[message,setMessage]=useState('');
 const [draft,setDraft]=useState<Draft|null>(null),[confirmed,setConfirmed]=useState(false);
 useEffect(()=>{let active=true;const refresh=()=>{try{if(active)setRows(loadContractObligations().filter(r=>r.opportunityId===opportunity.id&&r.userId===scope.userId&&Boolean(r.isSample)===scope.sampleDataActive));}
  catch(e){if(active)setError(e instanceof Error?e.message:'Contract obligations are unreadable.');}};refresh();
  void loadContractObligationsForWorkspace(scope.userId,scope.sampleDataActive).then(refresh).catch(()=>{if(active)setError('Account contract obligations could not be loaded. This reading may be incomplete.');});
  window.addEventListener(CONTRACT_OBLIGATION_UPDATED_EVENT,refresh);window.addEventListener('storage',refresh);
  return()=>{active=false;window.removeEventListener(CONTRACT_OBLIGATION_UPDATED_EVENT,refresh);window.removeEventListener('storage',refresh);};
 },[scope.userId,scope.sampleDataActive,opportunity.id]);
 const begin=(row?:ContractObligation)=>{setConfirmed(false);setMessage('');setDraft(row||{id:kernelId('obligation'),version:0,contractReference:'',contractVersion:'',acceptedOn:'',acceptanceReference:'',clause:'',requirementId:'',commitmentId:'',revisionReason:'',lifecycle:'active'});};
 const save=()=>{if(!draft)return;const {version,...fields}=draft;
  const result=publishContractObligation(scope,{...fields,opportunityId:opportunity.id,expectedVersion:version,confirmed},refs);
  setMessage(result.ok?'Contract obligation saved in this browser. Account sync runs when connected.':result.error);if(result.ok)setDraft(null);};
 return <section aria-label="Contract obligations" className="mb-5 border-b border-line pb-5">
  <div className="flex flex-wrap justify-between gap-2"><h3 className="text-sm font-semibold text-ink">Contract obligations</h3><button className="text-sm font-semibold text-brand-blue" type="button" onClick={()=>begin()}>Link accepted clause</button></div>
  <p className="mt-1 text-xs text-muted">Record your confirmed operational interpretation of an accepted contract. Refer to existing outcomes and promises; Memoire does not interpret legal terms.</p>
  {error&&<p role="alert" className="mt-2 text-sm text-amber-800">{error}</p>}
  <ContractObligationReadings readings={rows.map(r=>readContractObligation(r,readings,refs.commitments,timing,gates))}/>
  {rows.map(row=><button key={row.id} type="button" className="mt-2 block text-sm text-brand-blue" onClick={()=>begin(row)}>Revise mapping: {row.contractReference}</button>)}
  {draft&&<div className="mt-3 space-y-3 rounded-lg border border-line p-3">
   <p className="text-sm font-semibold">Mapping version {draft.version+1}</p>
   {(['contractReference','contractVersion','acceptedOn','acceptanceReference','clause','revisionReason'] as const).map(key=><label key={key} className="block text-sm">{{contractReference:'Contract reference',contractVersion:'Accepted contract version',acceptedOn:'Accepted on',acceptanceReference:'Acceptance evidence reference',clause:'Operational clause',revisionReason:'Reason for this mapping'}[key]}
    <input className={field} type={key==='acceptedOn'?'date':'text'} maxLength={key==='clause'||key==='revisionReason'?2000:key==='acceptanceReference'?1000:key==='contractReference'?500:200}
     disabled={draft.version>0&&['contractReference','contractVersion','acceptedOn','acceptanceReference'].includes(key)} value={draft[key]} onChange={e=>setDraft({...draft,[key]:e.target.value})}/></label>)}
   <label className="block text-sm">Contractual required outcome<select className={field} value={draft.requirementId} onChange={e=>setDraft({...draft,requirementId:e.target.value})}><option value="">Choose a Requirement</option>{refs.requirements.map(r=><option key={r.id} value={r.id}>{r.expectedOutcome} · {r.lifecycle}</option>)}</select></label>
   <label className="block text-sm">Operational promise<select className={field} value={draft.commitmentId} onChange={e=>setDraft({...draft,commitmentId:e.target.value})}><option value="">Choose a Commitment</option>{refs.commitments.map(r=><option key={r.id} value={r.id}>{r.commitmentText} · {r.status}</option>)}</select></label>
   {(!refs.requirements.length||!refs.commitments.length)&&<p className="text-xs text-muted">Record the required outcome and a Commitment on this Opportunity before linking the clause.</p>}
   {draft.version>0&&<label className="block text-sm">Mapping status<select className={field} value={draft.lifecycle} onChange={e=>setDraft({...draft,lifecycle:e.target.value as Draft['lifecycle']})}><option value="active">Active</option><option value="retired">Retired</option></select></label>}
   <label className="flex gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>I confirm this contract was accepted and this clause mapping is my operational interpretation.</label>
   <div className="flex gap-3"><button type="button" disabled={!confirmed} className="rounded-full bg-brand-blue px-3 py-2 text-sm text-white disabled:opacity-40" onClick={save}>Save contract obligation</button><button type="button" className="text-sm text-muted" onClick={()=>setDraft(null)}>Cancel</button></div>
  </div>}
  {message&&<p role="status" className="mt-2 text-sm">{message}</p>}
 </section>;
}
