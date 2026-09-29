import {PolicyCheckList} from './PolicyCheckList.tsx';
import {useEffect,useState} from 'react';
import {evaluateCommercialPolicies,type CommercialPolicy} from '../../domain/commercialKernel/commercialPolicy.ts';
import {publishCommercialPolicy} from '../../domain/commercialKernel/policyCommands.ts';
import {loadCommercialPolicies,loadCommercialPoliciesForWorkspace,POLICY_UPDATED_EVENT} from '../../services/commercialKernel/policyStore.ts';
import {kernelId} from '../../services/commercialKernel/kernelRepository.ts';
import type {CrmLiteOpportunity} from '../../services/opportunityStore.ts';
import type {OutcomeRequirement,RequirementReading} from '../../domain/commercialKernel/outcomeRequirement.ts';
import type {CommercialScope} from '../../domain/commercialKernel/types.ts';

const inputClass='mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink';
type Draft={id:string;version:number;title:string;rationale:string;requirementId:string;appliesWhen:CommercialPolicy['appliesWhen'];amount:string;currency:string;lifecycle:CommercialPolicy['lifecycle']};
export function CommercialPolicySection({opportunity,scope,requirements,readings}:{opportunity:CrmLiteOpportunity;scope:CommercialScope;requirements:OutcomeRequirement[];readings:RequirementReading[]}){
  const [policies,setPolicies]=useState<CommercialPolicy[]>([]),[error,setError]=useState(''),[message,setMessage]=useState('');
  const [draft,setDraft]=useState<Draft|null>(null),[confirmed,setConfirmed]=useState(false);
  useEffect(()=>{
    let active=true;
    const refresh=()=>{try{const rows=loadCommercialPolicies().filter(p=>p.userId===scope.userId&&Boolean(p.isSample)===scope.sampleDataActive&&p.opportunityId===opportunity.id);
      if(active)setPolicies(rows);}catch(reason){if(active)setError(reason instanceof Error?reason.message:'Policies are unreadable.');}};
    setError('');refresh();
    void loadCommercialPoliciesForWorkspace(scope.userId,scope.sampleDataActive).then(()=>{if(active)refresh();})
      .catch(reason=>{if(active)setError(`Account policy checks may be incomplete. ${reason instanceof Error?reason.message:''}`);});
    window.addEventListener(POLICY_UPDATED_EVENT,refresh);window.addEventListener('storage',refresh);
    return()=>{active=false;window.removeEventListener(POLICY_UPDATED_EVENT,refresh);window.removeEventListener('storage',refresh);};
  },[scope.userId,scope.sampleDataActive,opportunity.id]);
  const choices=requirements.filter(r=>r.opportunityId===opportunity.id&&r.userId===scope.userId&&Boolean(r.isSample)===scope.sampleDataActive);
  const checks=evaluateCommercialPolicies(policies,opportunity,readings);
  const begin=(policy?:CommercialPolicy)=>{setConfirmed(false);setMessage('');setDraft(policy?{...policy,amount:policy.amount===null?'':String(policy.amount),currency:policy.currency||opportunity.currency||'VND'}:
    {id:kernelId('policy'),version:0,title:'',rationale:'',requirementId:'',appliesWhen:'always',amount:'',currency:opportunity.currency||'VND',lifecycle:'active'});};
  const publish=()=>{
    if(!draft)return;
    const result=publishCommercialPolicy(scope,{...draft,expectedVersion:draft.version,confirmed,opportunity,
      amount:draft.appliesWhen==='value_above'&&draft.amount.trim()?Number(draft.amount):null,currency:draft.appliesWhen==='value_above'?draft.currency:null},choices);
    setMessage(result.ok?`Policy version ${result.value.version} saved in this browser. Account sync runs when connected.`:result.error);
    if(result.ok){setDraft(null);setConfirmed(false);}
  };
  return <section aria-label="Commercial policies" className="mb-5 border-b border-line pb-5">
    <div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-semibold text-ink">Commercial policies</h3>
      <p className="mt-1 text-xs text-muted">Explicit rules you publish for this Opportunity. Checks inform your review; approval remains a human decision.</p></div>
      <button type="button" className="shrink-0 text-sm font-semibold text-brand-blue" onClick={()=>begin()}>Add rule</button></div>
    {error&&<p role="alert" className="mt-2 text-sm text-amber-800">{error}</p>}
    {!policies.length&&!error&&<p className="mt-2 text-sm text-muted">No rule has been published for this Opportunity.</p>}
    <PolicyCheckList checks={checks}/>
    {policies.map(policy=><div key={policy.id} className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
      <span>{policy.title} · Version {policy.version} · {policy.lifecycle}</span><button type="button" className="font-semibold text-brand-blue" onClick={()=>begin(policy)}>Revise {policy.title}</button></div>)}
    {policies.length>0&&<p className="mt-2 text-xs text-muted">Earlier published versions remain available in Opportunity history.</p>}
    {draft&&<div className="mt-3 space-y-3 rounded-lg border border-line p-3">
      <p className="text-sm font-semibold">Publish version {draft.version+1}</p>
      <label className="block text-sm">Rule name<input className={inputClass} maxLength={300} value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/></label>
      <label className="block text-sm">Required outcome<select className={inputClass} value={draft.requirementId} onChange={e=>setDraft({...draft,requirementId:e.target.value})}>
        <option value="">Choose a Requirement</option>{choices.map(r=><option key={r.id} value={r.id}>{r.expectedOutcome}{r.lifecycle==='retired'?' (retired)':''}</option>)}</select></label>
      {!choices.length&&<p className="text-xs text-muted">Record the required outcome in Requirements below first.</p>}
      <label className="block text-sm">Applies<select aria-label="Applies" className={inputClass} value={draft.appliesWhen} onChange={e=>setDraft({...draft,appliesWhen:e.target.value as CommercialPolicy['appliesWhen']})}>
        <option value="always">Throughout this Opportunity</option><option value="value_above">When Opportunity value exceeds an amount</option></select></label>
      {draft.appliesWhen==='value_above'&&<div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">Amount threshold<input type="number" min="0" step="any" className={inputClass} value={draft.amount} onChange={e=>setDraft({...draft,amount:e.target.value})}/></label>
        <label className="block text-sm">Rule currency<input className={inputClass} maxLength={3} value={draft.currency} onChange={e=>setDraft({...draft,currency:e.target.value.toUpperCase()})}/></label></div>}
      <label className="block text-sm">Reason for this version<textarea className={inputClass} maxLength={2000} value={draft.rationale} onChange={e=>setDraft({...draft,rationale:e.target.value})}/></label>
      {draft.version>0&&<label className="block text-sm">Rule status<select className={inputClass} value={draft.lifecycle} onChange={e=>setDraft({...draft,lifecycle:e.target.value as CommercialPolicy['lifecycle']})}><option value="active">Active</option><option value="retired">Retired</option></select></label>}
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>I confirm this explicit rule and its reason.</label>
      <div className="flex gap-3"><button type="button" className="rounded-lg bg-brand-blue px-3 py-2 text-sm font-semibold text-white disabled:opacity-40" disabled={!confirmed||!draft.title.trim()||!draft.requirementId||!draft.rationale.trim()} onClick={publish}>Publish policy version</button>
        <button type="button" className="text-sm text-muted" onClick={()=>setDraft(null)}>Cancel</button></div>
    </div>}
    {message&&<p role="status" className="mt-2 text-sm text-ink">{message}</p>}
  </section>;
}
