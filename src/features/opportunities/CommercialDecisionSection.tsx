import { useEffect, useMemo, useState } from 'react';
import {Link} from 'react-router-dom';
import type { CrmLiteOpportunity } from '../../services/opportunityStore';
import type { ForecastDefensibility } from '../../domain/commercialKernel/deriveForecastDefensibility';
import type { CommercialCommitment } from '../../domain/commercialKernel/types';
import type { PlanRecord } from '../../utils/weeklyPlan';
import { finalizeCommercialDecision, linkDecisionExecution } from '../../domain/commercialKernel/decisionCommands';
import { DECISIONS_UPDATED_EVENT, loadCommercialDecisions, loadCommercialDecisionsForWorkspace } from '../../services/commercialKernel/decisionStore';
import { loadPlanItemsForWorkspace } from '../../services/planItemStore';
import { kernelId } from '../../services/commercialKernel/kernelRepository';
import {captureDecisionBasis,type CommercialDecision,type CommercialOption} from '../../domain/commercialKernel/commercialDecision';
import {DECISION_OBSERVATIONS_UPDATED_EVENT,loadDecisionObservations,loadDecisionObservationsForWorkspace} from '../../services/commercialKernel/decisionObservationStore.ts';
import {finalizeDecisionObservation} from '../../domain/commercialKernel/decisionObservationCommands.ts';
import {retrieveComparableCases,summarizeObservedCases} from '../../domain/commercialKernel/decisionLearning.ts';
import {getCloudHistoricalSourcesAt,getLocalHistoricalSourcesAt} from '../../services/historicalQuery.ts';
import {composeCommercialStateAsOf} from '../../services/commercialTimeMachine.ts';

const field='mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink';
const blank=():CommercialOption=>({id:kernelId('option'),order:1,label:'',interventionIntent:'',expectedConsequence:'',tradeoffs:''});
const localCutoff=(iso:string)=>{const d=new Date(iso),pad=(n:number)=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;};
export function CommercialDecisionSection({opportunity,forecast,commitments,userId,sampleDataActive}:{
  opportunity:CrmLiteOpportunity;forecast:ForecastDefensibility;commitments:CommercialCommitment[];userId?:string;sampleDataActive:boolean;
}){
  const [decisions,setDecisions]=useState(loadCommercialDecisions());
  const [observations,setObservations]=useState(loadDecisionObservations());
  const [plans,setPlans]=useState<PlanRecord[]>([]);
  const [open,setOpen]=useState(false),[question,setQuestion]=useState(''),[context,setContext]=useState('');
  const [options,setOptions]=useState<CommercialOption[]>([blank()]),[selected,setSelected]=useState(''),[rationale,setRationale]=useState('');
  const [targetKind,setTargetKind]=useState<'requirement'|'forecast_claim'|'opportunity'>('opportunity');
  const [requirementId,setRequirementId]=useState(''),[supersedes,setSupersedes]=useState('');
  const [linkChoice,setLinkChoice]=useState(''),[message,setMessage]=useState('');
  const [draftId,setDraftId]=useState(()=>kernelId('decision'));
  const [reviewDecisionId,setReviewDecisionId]=useState(''),[reviewCutoff,setReviewCutoff]=useState(()=>localCutoff(new Date().toISOString()));
  const [reviewNote,setReviewNote]=useState(''),[reviewing,setReviewing]=useState(false),[caseHorizon,setCaseHorizon]=useState(14);
  useEffect(()=>{
    let active=true;const refresh=()=>{if(active)setDecisions(loadCommercialDecisions());};
    refresh();void loadCommercialDecisionsForWorkspace(userId,sampleDataActive).then(rows=>{if(active)setDecisions(rows);});
    void loadPlanItemsForWorkspace(userId,sampleDataActive).then(rows=>{if(active)setPlans(rows);});
    window.addEventListener(DECISIONS_UPDATED_EVENT,refresh);return()=>{active=false;window.removeEventListener(DECISIONS_UPDATED_EVENT,refresh);};
  },[opportunity.id,userId,sampleDataActive]);
  useEffect(()=>{let active=true;const refresh=()=>{if(active)setObservations(loadDecisionObservations());};refresh();
    void loadDecisionObservationsForWorkspace(userId,sampleDataActive).then(rows=>{if(active)setObservations(rows);});
    window.addEventListener(DECISION_OBSERVATIONS_UPDATED_EVENT,refresh);return()=>{active=false;window.removeEventListener(DECISION_OBSERVATIONS_UPDATED_EVENT,refresh);};
  },[userId,sampleDataActive]);
  const rows=useMemo(()=>decisions.filter(d=>d.opportunityId===opportunity.id&&d.userId===(userId||null)
    &&Boolean(d.isSample)===sampleDataActive),[decisions,opportunity.id,userId,sampleDataActive]);
  const latest=rows[0];
  const scopedObservations=useMemo(()=>observations.filter(row=>row.opportunityId===opportunity.id&&row.userId===(userId||null)
    &&Boolean(row.isSample)===sampleDataActive),[observations,opportunity.id,userId,sampleDataActive]);
  const comparable=useMemo(()=>latest?retrieveComparableCases({query:latest,decisions,observations,horizonDays:caseHorizon,limit:8}):[],[latest,decisions,observations,caseHorizon]);
  const summary=useMemo(()=>summarizeObservedCases(comparable,caseHorizon),[comparable,caseHorizon]);
  const draftComparable=useMemo(()=>{
    if(!open)return [];
    const picked=options.find(option=>option.id===selected)||options[0];if(!picked)return [];
    const draftAt=forecast.calculatedAt||opportunity.updatedAt;
    const query={id:draftId,userId:userId||null,accountId:opportunity.accountId||'',opportunityId:opportunity.id,
      question:question||'Decision in progress',context:context||'Decision in progress',basisSnapshot:captureDecisionBasis(forecast,draftAt),
      options:[picked],selectedOptionId:picked.id,rationale:rationale||'Decision in progress',expectedConsequence:picked.expectedConsequence||'Decision in progress',
      intervention:{id:'draft-intervention',intent:picked.interventionIntent||'Decision in progress',targetKind,
        targetRequirementId:targetKind==='requirement'?requirementId||null:null,expectedChange:picked.expectedConsequence||'Decision in progress'},
      executionLinks:[],supersedesDecisionId:null,sourceType:'manual',decidedAt:draftAt,createdAt:draftAt,
      updatedAt:draftAt,...(sampleDataActive?{isSample:true}:{})} satisfies CommercialDecision;
    return retrieveComparableCases({query,decisions,observations,horizonDays:caseHorizon,limit:3});
  },[open,options,selected,draftId,userId,opportunity,question,context,forecast,rationale,targetKind,requirementId,sampleDataActive,decisions,observations,caseHorizon]);
  const update=(id:string,patch:Partial<CommercialOption>)=>setOptions(current=>current.map(o=>o.id===id?{...o,...patch}:o));
  const finalise=()=>{
    const result=finalizeCommercialDecision({userId:userId||null,sampleDataActive},{id:draftId,opportunity,forecast,question,context,
      options,selectedOptionId:selected,rationale,targetKind,targetRequirementId:requirementId||null,supersedesDecisionId:supersedes||null});
    setMessage(result.ok?result.warning||'Decision recorded. Commercial state was not changed.':result.error);
    if(result.ok){setOpen(false);setDraftId(kernelId('decision'));setQuestion('');setContext('');setOptions([blank()]);setSelected('');setRationale('');setSupersedes('');}
  };
  const executionChoices=[...plans.filter(p=>p.linkedOpportunityId===opportunity.id).map(p=>({key:`action:${p.id}`,label:`Plan · ${p.label}`})),
    ...commitments.filter(c=>c.opportunityId===opportunity.id&&c.accountId===opportunity.accountId).map(c=>({key:`commitment:${c.id}`,label:`Commitment · ${c.commitmentText||c.id}`}))];
  const recordObservation=async()=>{const decision=rows.find(row=>row.id===reviewDecisionId);if(!decision)return;
    const instant=Date.parse(reviewCutoff);if(!Number.isFinite(instant)){setMessage('Choose a valid observation cutoff.');return;}
    setReviewing(true);try{const cutoff=new Date(instant).toISOString(),scope=userId||'guest';
      const sources=userId?await getCloudHistoricalSourcesAt(scope,cutoff):getLocalHistoricalSourcesAt(scope,cutoff,window.localStorage);
      const asOf=composeCommercialStateAsOf({sources,scope,opportunityId:opportunity.id,cutoff,
        timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone,decisions});
      const result=finalizeDecisionObservation({userId:userId||null,sampleDataActive},{id:kernelId('observation'),decision,asOf,plans,operatorNote:reviewNote});
      setMessage(result.ok?result.warning||'Observed state recorded. It does not claim the Decision caused the outcome.':result.error);
      if(result.ok){setReviewDecisionId('');setReviewNote('');}
    }catch(error){setMessage(error instanceof Error?error.message:'Observed state could not be composed.');}finally{setReviewing(false);}};
  return <section aria-label="Commercial decisions" className="mb-5 border-b border-line pb-5">
    <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-ink">Decisions</h3>
      <button type="button" className="text-sm font-semibold text-brand-blue" onClick={()=>setOpen(!open)}>{open?'Cancel':'Record decision'}</button></div>
    <p className="mt-1 text-xs text-muted">Choose an approach yourself. Memoire records the situation and your reasoning; it does not change the forecast or create work.</p>
    {message&&<p role="status" className="mt-2 text-sm text-muted">{message}</p>}
    {latest?<div className="mt-3 rounded-lg border border-line p-3 text-sm"><p className="font-semibold">{latest.question}</p>
      <p className="mt-1">Chosen approach: {latest.options.find(o=>o.id===latest.selectedOptionId)?.label}</p>
      <p className="mt-1 text-muted">Intervention: {latest.intervention.intent}</p>
      <p className="mt-1 text-xs text-muted">Why: {latest.rationale}</p>
      <Link className="mt-2 inline-block text-xs font-semibold text-brand-blue underline" to={`/app/opportunities?opportunityId=${encodeURIComponent(opportunity.id)}&asOf=${encodeURIComponent(latest.decidedAt)}`}>
        View commercial state as understood when this Decision was recorded
      </Link>
      <p className="mt-1 text-xs text-muted">Expected change: {latest.expectedConsequence}</p>
      <p className="mt-1 text-xs text-muted">Execution: {latest.executionLinks.length?latest.executionLinks.map(l=>`${l.kind} ${l.recordId}`).join(' · '):'None linked yet'}</p>
      <div className="mt-3 flex gap-2"><select aria-label="Existing execution" className={field} value={linkChoice} onChange={e=>setLinkChoice(e.target.value)}>
        <option value="">Link existing Plan action or Commitment</option>{executionChoices.map(c=><option key={c.key} value={c.key}>{c.label}</option>)}</select>
        <button type="button" disabled={!linkChoice} className="text-sm font-semibold text-brand-blue disabled:opacity-40" onClick={()=>{
          const separator=linkChoice.indexOf(':');const kind=linkChoice.slice(0,separator) as 'action'|'commitment';const id=linkChoice.slice(separator+1);
          const result=linkDecisionExecution({userId:userId||null,sampleDataActive},latest.id,kind,id,{plans,commitments});
          setMessage(result.ok?result.warning||'Existing execution linked.':result.error);if(result.ok)setLinkChoice('');
        }}>Link</button></div></div>:<p className="mt-2 text-sm text-muted">No decision recorded for this Opportunity.</p>}
    {rows.length>0&&<div className="mt-3 rounded-lg border border-line p-3 text-sm"><div className="flex items-center justify-between gap-2"><strong>Review observed outcome</strong>
      <span className="text-xs text-muted">Immutable review</span></div><p className="mt-1 text-xs text-muted">Choose the exact system-time cutoff. Memoire reconstructs only what was recorded by then.</p>
      <select aria-label="Decision to review" className={field} value={reviewDecisionId} onChange={e=>setReviewDecisionId(e.target.value)}><option value="">Choose Decision</option>
        {rows.map(d=><option key={d.id} value={d.id}>{d.question} · {d.decidedAt.slice(0,10)}</option>)}</select>
      <input aria-label="Observation cutoff" type="datetime-local" className={field} value={reviewCutoff} onChange={e=>setReviewCutoff(e.target.value)} />
      <textarea aria-label="Observation note" className={field} maxLength={2000} value={reviewNote} onChange={e=>setReviewNote(e.target.value)} placeholder="Optional factual note" />
      <button type="button" disabled={!reviewDecisionId||reviewing||sampleDataActive} onClick={()=>void recordObservation()}
        className="mt-2 rounded-full bg-brand-blue px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">{reviewing?'Reconstructing…':'Finalize observation'}</button>
      {sampleDataActive&&<p className="mt-2 text-xs text-muted">Sample Decisions stay isolated and are not added to real learning.</p>}</div>}
    {scopedObservations.length>0&&<details className="mt-3 text-sm"><summary className="cursor-pointer">Observed outcome reviews ({scopedObservations.length})</summary>
      {scopedObservations.map(o=><article key={o.id} className="mt-2 rounded-lg border border-line p-3"><p className="font-semibold">{o.elapsedDays}-day observation · {o.observationCutoff.slice(0,10)}</p>
        <p className="mt-1">Target state: {o.snapshot.target.state}. Forecast observed: {o.snapshot.forecast?.verdict||'unavailable'}.</p>
        <p className="mt-1">Execution: {o.snapshot.execution.length?o.snapshot.execution.map(e=>`${e.kind} ${e.state}`).join(' · '):'No execution link recorded.'}</p>
        {o.operatorNote&&<p className="mt-1 text-xs text-muted">Review note: {o.operatorNote}</p>}
        <p className="mt-1 text-xs text-muted">Observed association only; this review does not attribute the later state to the Intervention.</p></article>)}</details>}
    {latest&&<details className="mt-3 text-sm"><summary className="cursor-pointer">Comparable reviewed Decisions</summary>
      <div className="mt-2 rounded-lg border border-line p-3"><label className="text-xs font-semibold">Observation horizon (days)<input aria-label="Case horizon days" className={field} type="number" min="0" max="3650" value={caseHorizon} onChange={e=>setCaseHorizon(Math.max(0,Number(e.target.value)||0))} /></label>
        {comparable.length?<ul className="mt-3 space-y-2">{comparable.map(c=><li key={c.decision.id} className="border-t border-line pt-2"><strong>{c.decision.question}</strong> · observed at {c.observation.elapsedDays} days
          <p>Chosen: {c.decision.options.find(o=>o.id===c.decision.selectedOptionId)?.label}. Target later: {c.observation.snapshot.target.state}.</p>
          <p className="text-xs text-muted">{c.matchReasons.join(' · ')||'Same target type'}{c.differences.length?` · ${c.differences.join(' · ')}`:''}</p></li>)}</ul>:<p className="mt-2 text-muted">No comparable reviewed cases in your own history.</p>}
        {summary.sufficientSample?<p className="mt-3">At exactly {caseHorizon} days, {summary.targetStates.resolved} of {summary.eligibleDecisionCount} eligible Decisions had the target recorded as resolved; {summary.targetStates.unresolved} remained unresolved; {summary.targetStates.conflicted} were conflicted.</p>
          :<p className="mt-3 text-xs text-muted">Aggregate withheld: {summary.eligibleDecisionCount} of {summary.minimumSample} distinct eligible Decisions at exactly {caseHorizon} days.</p>}
        <p className="mt-2 text-xs text-muted">{summary.disclosure} Free-text Intervention intent is shown for context and is not classified as an Intervention type.</p></div></details>}
    {rows.length>0&&<details className="mt-3 text-sm"><summary className="cursor-pointer">Decision history ({rows.length})</summary>
      {rows.map(d=><article key={d.id} className="mt-2 rounded-lg border border-line p-3">
        <p className="font-semibold">{d.question} · {d.decidedAt.slice(0,10)}</p><p className="mt-1">Situation: {d.context}</p>
        <p className="mt-1 text-xs text-muted">Basis at decision: {d.basisSnapshot.forecast.verdict}; {d.basisSnapshot.blockers.map(b=>b.label).join(', ')||'no recorded blockers'}</p>
        <div className="mt-1 text-xs text-muted">Options considered:{d.options.map(o=><p key={o.id} className="mt-1">{o.label}{o.id===d.selectedOptionId?' (chosen)':''} · Intended change: {o.expectedConsequence}{o.tradeoffs?` · Tradeoff: ${o.tradeoffs}`:''}</p>)}</div>
        <p className="mt-1 text-xs text-muted">Why: {d.rationale}</p>
        <Link className="mt-2 inline-block text-xs font-semibold text-brand-blue underline" to={`/app/opportunities?opportunityId=${encodeURIComponent(opportunity.id)}&asOf=${encodeURIComponent(d.decidedAt)}`}>
          View state at this Decision
        </Link>
        {d.supersedesDecisionId&&<p className="mt-1 text-xs text-muted">Supersedes {d.supersedesDecisionId}</p>}
      </article>)}</details>}
    {open&&<div className="mt-3 space-y-3 rounded-lg border border-line p-3 text-sm">
      <label className="block">Decision question<input className={field} maxLength={500} value={question} onChange={e=>setQuestion(e.target.value)} placeholder="What approach should we take?" /></label>
      <label className="block">Situation<textarea className={field} maxLength={2000} value={context} onChange={e=>setContext(e.target.value)} placeholder="What is happening and why is a decision needed?" /></label>
      <p className="text-xs text-muted">Current basis: {forecast.verdict} · {forecast.blockers.length} blocker(s) · {forecast.nextQuestion?.question||'No next question recorded'}</p>
      {draftComparable.length>0&&<div className="rounded-lg border border-blue-100 bg-blue-50/40 p-3"><strong>Relevant reviewed cases from your history</strong>
        {draftComparable.map(item=><p key={item.decision.id} className="mt-1 text-xs">{item.decision.question} · chosen {item.decision.options.find(o=>o.id===item.decision.selectedOptionId)?.label} · target later {item.observation.snapshot.target.state} at {item.observation.elapsedDays} days. <span className="text-muted">{item.matchReasons.join(' · ')}</span></p>)}
        <p className="mt-2 text-xs text-muted">These are structural precedents, not recommendations or evidence that the earlier Intervention caused the later state.</p></div>}
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
        className="rounded-full bg-brand-blue px-3 py-2 text-sm font-semibold text-white disabled:opacity-40" onClick={finalise}>Finalize decision</button>
    </div>}
  </section>;
}
