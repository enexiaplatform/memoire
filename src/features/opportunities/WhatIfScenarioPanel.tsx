import {useMemo,useState} from 'react';
import type {CrmLiteOpportunity} from '../../services/opportunityStore';
import type {QuoteRecord} from '../../services/quoteStore';
import type {CommercialCondition} from '../../domain/commercialKernel/commercialCondition';
import type {CommercialEvidence} from '../../domain/commercialKernel/commercialEvidence';
import type {CommercialDependency} from '../../domain/commercialKernel/commercialDependency';
import type {CommercialTimingAssertion} from '../../domain/commercialKernel/commercialTiming';
import type {CommercialMoneyGate} from '../../domain/commercialKernel/moneyGate';
import type {OutcomeRequirement} from '../../domain/commercialKernel/outcomeRequirement';
import type {CommercialCommitment} from '../../domain/commercialKernel/types';
import {captureCommercialScenarioBase,commercialScenarioSourceVersion,compareCommercialScenarios,simulateCommercialScenario,
  type CommercialScenarioAssumption,type CommercialScenarioBase,type CommercialScenarioResult,type CommercialScenarioSource} from '../../domain/commercialKernel/commercialScenario';
import {isValidBusinessDate,todayDateKey} from '../../utils/safeDate';

const inputClass='mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink';
type Draft={id:string;name:string;assumptions:CommercialScenarioAssumption[]};

export function WhatIfScenarioPanel({opportunity,requirements,conditions,evidence,dependencies,timingAssertions,commitments,moneyGates,quotes}:{
  opportunity:CrmLiteOpportunity;requirements:OutcomeRequirement[];conditions:CommercialCondition[];evidence:CommercialEvidence[];
  dependencies:CommercialDependency[];timingAssertions:CommercialTimingAssertion[];commitments:CommercialCommitment[];
  moneyGates:CommercialMoneyGate[];quotes:QuoteRecord[]}){
  const [open,setOpen]=useState(false),[base,setBase]=useState<CommercialScenarioBase|null>(null);
  const [drafts,setDrafts]=useState<Draft[]>([{id:'scenario-1',name:'Scenario 1',assumptions:[]}]),[selected,setSelected]=useState(0);
  const [kind,setKind]=useState<'requirement_resolution'|'requirement_duration'|'target_date'>('requirement_resolution');
  const [requirementId,setRequirementId]=useState(''),[reason,setReason]=useState(''),[effectiveDate,setEffectiveDate]=useState('');
  const [duration,setDuration]=useState('2'),[unit,setUnit]=useState<'calendar_days'|'business_days'>('calendar_days');
  const [targetDate,setTargetDate]=useState(isValidBusinessDate(opportunity.expectedClosePeriod)?opportunity.expectedClosePeriod:todayDateKey()),
    [evaluationDate,setEvaluationDate]=useState(todayDateKey());
  const source=useMemo<CommercialScenarioSource>(()=>{
    const userId=opportunity.userId??null,sample=Boolean(opportunity.isSample),same=(row:{userId?:string|null;isSample?:boolean})=>(row.userId??null)===userId&&Boolean(row.isSample)===sample;
    const req=requirements.filter(row=>row.opportunityId===opportunity.id&&same(row));
    const requirementIds=new Set(req.map(row=>row.id));
    return {opportunity,requirements:req,
      conditions:conditions.filter(row=>same(row)&&row.accountId===opportunity.accountId&&(!row.opportunityId||row.opportunityId===opportunity.id)),
      evidence:evidence.filter(row=>same(row)&&(row.accountId===opportunity.accountId||(!row.accountId&&row.opportunityId===opportunity.id))&&(!row.opportunityId||row.opportunityId===opportunity.id)),
      dependencies:dependencies.filter(row=>row.opportunityId===opportunity.id&&same(row)&&requirementIds.has(row.dependentRequirementId)&&requirementIds.has(row.prerequisiteRequirementId)),
      timingAssertions:timingAssertions.filter(row=>row.opportunityId===opportunity.id&&same(row)),commitments:commitments.filter(row=>row.opportunityId===opportunity.id&&same(row)),
      moneyGates:moneyGates.filter(row=>row.opportunityId===opportunity.id&&same(row)),quotes:quotes.filter(row=>row.opportunityId===opportunity.id&&Boolean(row.isSample)===sample)};
  },[opportunity,requirements,conditions,evidence,dependencies,timingAssertions,commitments,moneyGates,quotes]);
  const activeRequirements=source.requirements.filter(row=>row.lifecycle==='active');
  const evaluationTime=`${evaluationDate}T23:59:59.999Z`;
  const currentVersion=commercialScenarioSourceVersion(source);
  const simulations=useMemo(()=>base?drafts.map(draft=>simulateCommercialScenario({scenarioId:draft.id,base,assumptions:draft.assumptions,
    evaluationDate,evaluationTime,calculatedAt:base.baseCapturedAt,currentSourceVersion:currentVersion})):[],[base,drafts,evaluationDate,evaluationTime,currentVersion]);
  const results=simulations.filter((row):row is {ok:true;result:CommercialScenarioResult}=>row.ok).map(row=>row.result);
  const comparison=results.length?compareCommercialScenarios(results):[];
  const current=drafts[selected],simulation=simulations[selected];
  const start=()=>{const capturedAt=new Date().toISOString();setBase(captureCommercialScenarioBase(source,capturedAt));setOpen(true);setEvaluationDate(todayDateKey());};
  const close=()=>{setOpen(false);setBase(null);setDrafts([{id:'scenario-1',name:'Scenario 1',assumptions:[]}]);setSelected(0);setReason('');};
  const addAssumption=()=>{
    if(!current||!reason.trim()||(kind!=='target_date'&&!requirementId))return;
    const id=`${current.id}-assumption-${current.assumptions.length+1}`;
    let assumption:CommercialScenarioAssumption;
    if(kind==='requirement_resolution')assumption={id,type:kind,requirementId,resolution:'resolved',effectiveDate:effectiveDate||null,
      label:`Assume ${activeRequirements.find(row=>row.id===requirementId)?.expectedOutcome||'Requirement'} is resolved`,reason:reason.trim(),providedBy:'operator'};
    else if(kind==='requirement_duration')assumption={id,type:kind,requirementId,durationDays:Number(duration),durationUnit:unit,
      label:`Assume duration is ${duration} ${unit.replace('_',' ')}`,reason:reason.trim(),providedBy:'operator'};
    else assumption={id,type:kind,targetDate,label:`Assume close target is ${targetDate}`,reason:reason.trim(),providedBy:'operator'};
    setDrafts(rows=>rows.map((row,index)=>index===selected?{...row,assumptions:[...row.assumptions,assumption]}:row));setReason('');setEffectiveDate('');
  };
  if(!open)return <div className="mb-5 border-b border-line pb-5" aria-label="Counterfactual simulation"><div className="flex items-center justify-between gap-3">
    <div><h3 className="text-sm font-semibold text-ink">What if…</h3><p className="mt-1 text-xs text-muted">Test explicit assumptions against a captured current state. Nothing here changes the Opportunity.</p></div>
    <button type="button" className="text-sm font-semibold text-brand-blue" onClick={start}>Open simulation</button></div></div>;
  return <div className="mb-5 border-b border-line pb-5" aria-label="Counterfactual simulation">
    <div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-semibold text-ink">What if… · SCENARIO</h3>
      <p className="mt-1 text-xs text-muted">Static projection from the state captured {base?.baseCapturedAt.slice(0,19).replace('T',' ')}. Assumptions are hypothetical and never Evidence.</p></div>
      <button type="button" className="text-sm font-semibold text-brand-blue" onClick={close}>Exit and discard</button></div>
    {results.some(row=>row.baseStatus==='stale')&&<p role="status" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">Current records changed after capture. Results remain tied to the captured base; exit and reopen to rebase.</p>}
    <label className="mt-3 block text-sm">Evaluate projected state on<input type="date" className={inputClass} min={base?.baseCapturedAt.slice(0,10)} value={evaluationDate} onChange={event=>setEvaluationDate(event.target.value)}/></label>
    <div className="mt-3 flex flex-wrap gap-2">{drafts.map((draft,index)=><button key={draft.id} type="button" className={`rounded-lg border px-3 py-2 text-sm ${selected===index?'border-brand-blue text-brand-blue':'border-line text-muted'}`} onClick={()=>setSelected(index)}>{draft.name}</button>)}
      {drafts.length<3&&<button type="button" className="rounded-lg border border-line px-3 py-2 text-sm text-brand-blue" onClick={()=>{const n=drafts.length+1;setDrafts(rows=>[...rows,{id:`scenario-${n}`,name:`Scenario ${n}`,assumptions:[]}]);setSelected(drafts.length);}}>+ Compare scenario</button>}</div>
    <div className="mt-3 rounded-lg border border-line p-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted">Add explicit assumption</p>
      <label className="mt-2 block text-sm">Change<select className={inputClass} value={kind} onChange={event=>setKind(event.target.value as typeof kind)}><option value="requirement_resolution">Requirement is assumed resolved</option><option value="requirement_duration">Requirement duration</option><option value="target_date">Close target date</option></select></label>
      {kind!=='target_date'&&<label className="mt-2 block text-sm">Requirement<select className={inputClass} value={requirementId} onChange={event=>setRequirementId(event.target.value)}><option value="">Choose Requirement</option>{activeRequirements.map(row=><option key={row.id} value={row.id}>{row.expectedOutcome}</option>)}</select></label>}
      {kind==='requirement_resolution'&&<label className="mt-2 block text-sm">Assumed resolved on (optional)<input type="date" className={inputClass} value={effectiveDate} onChange={event=>setEffectiveDate(event.target.value)}/></label>}
      {kind==='requirement_duration'&&<div className="mt-2 grid gap-2 sm:grid-cols-2"><label className="block text-sm">Duration<input type="number" min="0" max="3650" className={inputClass} value={duration} onChange={event=>setDuration(event.target.value)}/></label><label className="block text-sm">Unit<select className={inputClass} value={unit} onChange={event=>setUnit(event.target.value as typeof unit)}><option value="calendar_days">Calendar days</option><option value="business_days">Business days (calendar unavailable)</option></select></label></div>}
      {kind==='target_date'&&<label className="mt-2 block text-sm">Projected close target<input type="date" className={inputClass} value={targetDate} onChange={event=>setTargetDate(event.target.value)}/></label>}
      <label className="mt-2 block text-sm">Why test this?<textarea className={inputClass} maxLength={1000} value={reason} onChange={event=>setReason(event.target.value)} /></label>
      <button type="button" className="mt-3 rounded-lg bg-brand-blue px-3 py-2 text-sm font-semibold text-white disabled:opacity-40" disabled={!reason.trim()||(kind!=='target_date'&&!requirementId)} onClick={addAssumption}>Add assumption</button>
    </div>
    {current?.assumptions.length?<ul className="mt-3 space-y-2">{current.assumptions.map(row=><li key={row.id} className="rounded-lg border border-dashed border-line p-3 text-sm"><strong>ASSUMPTION · {row.label}</strong><span className="block text-xs text-muted">Why: {row.reason}</span><button type="button" className="mt-1 text-xs text-brand-blue" onClick={()=>setDrafts(rows=>rows.map((draft,index)=>index===selected?{...draft,assumptions:draft.assumptions.filter(item=>item.id!==row.id)}:draft))}>Remove</button></li>)}</ul>:<p className="mt-3 text-sm text-muted">No assumptions. The projected state currently matches the captured base.</p>}
    {simulation&&!simulation.ok&&<ul className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm">{simulation.errors.map((error,index)=><li key={`${error.code}:${index}`}>{error.message}</li>)}</ul>}
    {simulation?.ok&&<div className="mt-4 grid gap-3 md:grid-cols-2"><ScenarioColumn title="CURRENT · captured base" blockers={simulation.result.base.blockerLabels} question={simulation.result.base.nextQuestion?.question||null} target={simulation.result.base.forecast.claim?.targetDate||null} timing={simulation.result.base.forecast.timing?.status||null} forecast={simulation.result.base.forecastPresentation}/><ScenarioColumn title="PROJECTED · under assumptions" blockers={simulation.result.projected.blockerLabels} question={simulation.result.projected.nextQuestion?.question||null} target={simulation.result.projected.forecast.claim?.targetDate||null} timing={simulation.result.projected.forecast.timing?.status||null} forecast={simulation.result.projected.forecastPresentation}/>
      <div className="md:col-span-2 rounded-lg border border-line p-3 text-sm"><p className="font-semibold">Why it changed</p><p className="mt-1 text-muted">{simulation.result.delta.changedFields.length?simulation.result.delta.changedFields.join(' · '):'No derived field changed under these assumptions.'}</p>
        <p className="mt-2 text-xs text-muted">Buyer progress: unchanged and not projected. Money amounts and realization stay canonical; only recorded gating paths may change.</p>
        {simulation.result.delta.moneyPaths.map(row=><p key={row.sourceId} className="mt-1 text-xs">{row.sourceId}: {row.from.join('; ')||'no current blocker'} → {row.to.join('; ')||'no projected blocker'}</p>)}</div></div>}
    {comparison.length>1&&<div className="mt-4 overflow-x-auto"><table className="w-full text-left text-xs"><caption className="mb-2 text-left text-sm font-semibold">Factual scenario comparison</caption><thead><tr className="border-b border-line"><th className="p-2">Scenario</th><th className="p-2">Assumptions</th><th className="p-2">Projected blockers</th><th className="p-2">Target</th><th className="p-2">Forecast basis</th></tr></thead><tbody>{comparison.map((row,index)=><tr key={row.scenarioId} className="border-b border-line"><td className="p-2">{drafts[index]?.name}</td><td className="p-2">{row.assumptionCount}</td><td className="p-2">{row.blockers.join('; ')||'None recorded'}</td><td className="p-2">{row.targetDate||'Unknown'}</td><td className="p-2">{row.forecastVerdict.replaceAll('_',' ')}</td></tr>)}</tbody></table><p className="mt-2 text-xs text-muted">Comparison does not score, rank, recommend, or select a scenario.</p></div>}
  </div>;
}

function ScenarioColumn({title,blockers,question,target,timing,forecast}:{title:string;blockers:string[];question:string|null;target:string|null;timing:string|null;forecast:string}){
  return <div className="rounded-lg border border-line p-3 text-sm"><p className="font-semibold">{title}</p><dl className="mt-2 space-y-2"><div><dt className="text-xs text-muted">Waiting for</dt><dd>{blockers.join('; ')||'No recorded blocker'}</dd></div><div><dt className="text-xs text-muted">Next unresolved question</dt><dd>{question||'None'}</dd></div><div><dt className="text-xs text-muted">Close target</dt><dd>{target||'Unknown'}</dd></div><div><dt className="text-xs text-muted">Timing</dt><dd>{timing?.replaceAll('_',' ')||'Not evaluated'}</dd></div><div><dt className="text-xs text-muted">Forecast basis</dt><dd>{forecast.replaceAll('_',' ')}</dd></div></dl></div>;
}
