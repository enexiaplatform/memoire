import { useEffect, useMemo, useState } from 'react';
import type { CrmLiteOpportunity } from '../../services/opportunityStore';
import type { ForecastDefensibility } from '../../domain/commercialKernel/deriveForecastDefensibility';
import type { CommercialCommitment } from '../../domain/commercialKernel/types';
import type { PlanRecord } from '../../utils/weeklyPlan';
import { finalizeCommercialDecision, linkDecisionExecution } from '../../domain/commercialKernel/decisionCommands';
import { DECISIONS_UPDATED_EVENT, loadCommercialDecisions, loadCommercialDecisionsForOpportunity } from '../../services/commercialKernel/decisionStore';
import { loadPlanItemsForWorkspace } from '../../services/planItemStore';
import { kernelId } from '../../services/commercialKernel/kernelRepository';
import type { CommercialOption } from '../../domain/commercialKernel/commercialDecision';

const field='mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink';
const blank=():CommercialOption=>({id:kernelId('option'),order:1,label:'',interventionIntent:'',expectedConsequence:'',tradeoffs:''});
export function CommercialDecisionSection({opportunity,forecast,commitments,userId,sampleDataActive}:{
  opportunity:CrmLiteOpportunity;forecast:ForecastDefensibility;commitments:CommercialCommitment[];userId?:string;sampleDataActive:boolean;
}){
  const [decisions,setDecisions]=useState(loadCommercialDecisions());
  const [plans,setPlans]=useState<PlanRecord[]>([]);
  const [open,setOpen]=useState(false),[question,setQuestion]=useState(''),[context,setContext]=useState('');
  const [options,setOptions]=useState<CommercialOption[]>([blank()]),[selected,setSelected]=useState(''),[rationale,setRationale]=useState('');
  const [targetKind,setTargetKind]=useState<'requirement'|'forecast_claim'|'opportunity'>('opportunity');
  const [requirementId,setRequirementId]=useState(''),[supersedes,setSupersedes]=useState('');
  const [linkChoice,setLinkChoice]=useState(''),[message,setMessage]=useState('');
  const [draftId,setDraftId]=useState(()=>kernelId('decision'));
  useEffect(()=>{
    let active=true;const refresh=()=>{if(active)setDecisions(loadCommercialDecisions());};
    refresh();void loadCommercialDecisionsForOpportunity(opportunity.id,userId,sampleDataActive).then(refresh);
    void loadPlanItemsForWorkspace(userId,sampleDataActive).then(rows=>{if(active)setPlans(rows);});
    window.addEventListener(DECISIONS_UPDATED_EVENT,refresh);return()=>{active=false;window.removeEventListener(DECISIONS_UPDATED_EVENT,refresh);};
  },[opportunity.id,userId,sampleDataActive]);
  const rows=useMemo(()=>decisions.filter(d=>d.opportunityId===opportunity.id&&d.userId===(userId||null)
    &&Boolean(d.isSample)===sampleDataActive),[decisions,opportunity.id,userId,sampleDataActive]);
  const latest=rows[0];
  const update=(id:string,patch:Partial<CommercialOption>)=>setOptions(current=>current.map(o=>o.id===id?{...o,...patch}:o));
  const finalise=()=>{
    const result=finalizeCommercialDecision({userId:userId||null,sampleDataActive},{id:draftId,opportunity,forecast,question,context,
      options,selectedOptionId:selected,rationale,targetKind,targetRequirementId:requirementId||null,supersedesDecisionId:supersedes||null});
    setMessage(result.ok?result.warning||'Decision recorded. Commercial state was not changed.':result.error);
    if(result.ok){setOpen(false);setDraftId(kernelId('decision'));setQuestion('');setContext('');setOptions([blank()]);setSelected('');setRationale('');setSupersedes('');}
  };
  const executionChoices=[...plans.filter(p=>p.linkedOpportunityId===opportunity.id).map(p=>({key:`action:${p.id}`,label:`Plan · ${p.label}`})),
    ...commitments.filter(c=>c.opportunityId===opportunity.id&&c.accountId===opportunity.accountId).map(c=>({key:`commitment:${c.id}`,label:`Commitment · ${c.commitmentText||c.id}`}))];
  return <section aria-label="Commercial decisions" className="mb-5 border-b border-line pb-5">
    <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-ink">Decisions</h3>
      <button type="button" className="text-sm font-semibold text-brand-blue" onClick={()=>setOpen(!open)}>{open?'Cancel':'Record decision'}</button></div>
    <p className="mt-1 text-xs text-muted">Choose an approach yourself. Memoire records the situation and your reasoning; it does not change the forecast or create work.</p>
    {message&&<p role="status" className="mt-2 text-sm text-muted">{message}</p>}
    {latest?<div className="mt-3 rounded-lg border border-line p-3 text-sm"><p className="font-semibold">{latest.question}</p>
      <p className="mt-1">Chosen approach: {latest.options.find(o=>o.id===latest.selectedOptionId)?.label}</p>
      <p className="mt-1 text-muted">Intervention: {latest.intervention.intent}</p>
      <p className="mt-1 text-xs text-muted">Why: {latest.rationale}</p>
      <p className="mt-1 text-xs text-muted">Expected change: {latest.expectedConsequence}</p>
      <p className="mt-1 text-xs text-muted">Execution: {latest.executionLinks.length?latest.executionLinks.map(l=>`${l.kind} ${l.recordId}`).join(' · '):'None linked yet'}</p>
      <div className="mt-3 flex gap-2"><select aria-label="Existing execution" className={field} value={linkChoice} onChange={e=>setLinkChoice(e.target.value)}>
        <option value="">Link existing Plan action or Commitment</option>{executionChoices.map(c=><option key={c.key} value={c.key}>{c.label}</option>)}</select>
        <button type="button" disabled={!linkChoice} className="text-sm font-semibold text-brand-blue disabled:opacity-40" onClick={()=>{
          const separator=linkChoice.indexOf(':');const kind=linkChoice.slice(0,separator) as 'action'|'commitment';const id=linkChoice.slice(separator+1);
          const result=linkDecisionExecution({userId:userId||null,sampleDataActive},latest.id,kind,id,{plans,commitments});
          setMessage(result.ok?result.warning||'Existing execution linked.':result.error);if(result.ok)setLinkChoice('');
        }}>Link</button></div></div>:<p className="mt-2 text-sm text-muted">No decision recorded for this Opportunity.</p>}
    {rows.length>0&&<details className="mt-3 text-sm"><summary className="cursor-pointer">Decision history ({rows.length})</summary>
      {rows.map(d=><article key={d.id} className="mt-2 rounded-lg border border-line p-3">
        <p className="font-semibold">{d.question} · {d.decidedAt.slice(0,10)}</p><p className="mt-1">Situation: {d.context}</p>
        <p className="mt-1 text-xs text-muted">Basis at decision: {d.basisSnapshot.forecast.verdict}; {d.basisSnapshot.blockers.map(b=>b.label).join(', ')||'no recorded blockers'}</p>
        <div className="mt-1 text-xs text-muted">Options considered:{d.options.map(o=><p key={o.id} className="mt-1">{o.label}{o.id===d.selectedOptionId?' (chosen)':''} · Intended change: {o.expectedConsequence}{o.tradeoffs?` · Tradeoff: ${o.tradeoffs}`:''}</p>)}</div>
        <p className="mt-1 text-xs text-muted">Why: {d.rationale}</p>
        {d.supersedesDecisionId&&<p className="mt-1 text-xs text-muted">Supersedes {d.supersedesDecisionId}</p>}
      </article>)}</details>}
    {open&&<div className="mt-3 space-y-3 rounded-lg border border-line p-3 text-sm">
      <label className="block">Decision question<input className={field} maxLength={500} value={question} onChange={e=>setQuestion(e.target.value)} placeholder="What approach should we take?" /></label>
      <label className="block">Situation<textarea className={field} maxLength={2000} value={context} onChange={e=>setContext(e.target.value)} placeholder="What is happening and why is a decision needed?" /></label>
      <p className="text-xs text-muted">Current basis: {forecast.verdict} · {forecast.blockers.length} blocker(s) · {forecast.nextQuestion?.question||'No next question recorded'}</p>
      {options.map((o,i)=><div key={o.id} className="rounded-lg border border-line p-3">
        <div className="flex items-center justify-between"><strong>Option {i+1}</strong><label><input type="radio" name="selected-decision-option" checked={selected===o.id} onChange={()=>setSelected(o.id)} /> Choose</label></div>
        <label className="block">Approach<input className={field} maxLength={300} value={o.label} onChange={e=>update(o.id,{label:e.target.value})} /></label>
        <label className="block mt-2">Intervention intent<textarea className={field} maxLength={1000} value={o.interventionIntent} onChange={e=>update(o.id,{interventionIntent:e.target.value})} /></label>
        <label className="block mt-2">Expected change<textarea className={field} maxLength={1000} value={o.expectedConsequence} onChange={e=>update(o.id,{expectedConsequence:e.target.value})} /></label>
        <label className="block mt-2">Tradeoffs (optional)<textarea className={field} maxLength={1000} value={o.tradeoffs} onChange={e=>update(o.id,{tradeoffs:e.target.value})} /></label>
        {options.length>1&&<button type="button" className="mt-2 text-xs text-muted" onClick={()=>{setOptions(options.filter(x=>x.id!==o.id));if(selected===o.id)setSelected('');}}>Remove Option</button>}
      </div>)}
      {options.length<10&&<button type="button" className="text-sm font-semibold text-brand-blue" onClick={()=>setOptions([...options,{...blank(),order:options.length+1}])}>Add Option</button>}
      <label className="block">Why this Option?<textarea className={field} maxLength={2000} value={rationale} onChange={e=>setRationale(e.target.value)} /></label>
      <label className="block">Intervention target<select className={field} value={targetKind} onChange={e=>setTargetKind(e.target.value as typeof targetKind)}><option value="opportunity">Opportunity</option>
        {forecast.claim&&<option value="forecast_claim">Forecast claim</option>}{forecast.premises.length>0&&<option value="requirement">Requirement</option>}</select></label>
      {targetKind==='requirement'&&<select aria-label="Target requirement" className={field} value={requirementId} onChange={e=>setRequirementId(e.target.value)}><option value="">Choose Requirement</option>
        {forecast.premises.map(p=><option key={p.requirementId} value={p.requirementId}>{p.expectedOutcome}</option>)}</select>}
      {rows.length>0&&<label className="block">Supersedes (optional)<select className={field} value={supersedes} onChange={e=>setSupersedes(e.target.value)}><option value="">New decision without supersession</option>
        {rows.map(d=><option key={d.id} value={d.id}>{d.question} · {d.decidedAt.slice(0,10)}</option>)}</select></label>}
      <button type="button" disabled={!question.trim()||!context.trim()||!selected||!rationale.trim()||options.some(o=>!o.label.trim()||!o.interventionIntent.trim()||!o.expectedConsequence.trim())}
        className="rounded-lg bg-brand-blue px-3 py-2 text-sm font-semibold text-white disabled:opacity-40" onClick={finalise}>Finalize decision</button>
    </div>}
  </section>;
}
