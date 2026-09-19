import { useMemo, useState } from 'react';
import { deriveCommercialTime } from '../../domain/commercialKernel/deriveCommercialTime';
import { createCommercialTiming, retireCommercialTiming } from '../../domain/commercialKernel/timingCommands';
import type { CommercialTimingAssertion } from '../../domain/commercialKernel/commercialTiming';
import type { CommercialCondition } from '../../domain/commercialKernel/commercialCondition';
import type { CommercialEvidence } from '../../domain/commercialKernel/commercialEvidence';
import type { CommercialDependency } from '../../domain/commercialKernel/commercialDependency';
import type { OutcomeRequirement } from '../../domain/commercialKernel/outcomeRequirement';
import type { CommercialCommitment } from '../../domain/commercialKernel/types';
import type { CrmLiteOpportunity } from '../../services/opportunityStore';
import { todayDateKey } from '../../utils/safeDate';

const field = 'mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink';
type Props = { opportunity:CrmLiteOpportunity; requirements:OutcomeRequirement[]; conditions:CommercialCondition[];
  evidence:CommercialEvidence[]; dependencies:CommercialDependency[]; commitments:CommercialCommitment[];
  assertions:CommercialTimingAssertion[]; userId?:string; sampleDataActive:boolean; onMessage:(message:string)=>void };

export function CommercialTimingSection(props:Props) {
  const {opportunity,requirements,conditions,evidence,dependencies,commitments,assertions,userId,sampleDataActive,onMessage}=props;
  const active=requirements.filter(r=>r.opportunityId===opportunity.id && r.lifecycle==='active');
  const sources=assertions.filter(r=>r.opportunityId===opportunity.id);
  const [selected,setSelected]=useState('');
  const [days,setDays]=useState('');
  const [unit,setUnit]=useState<'calendar_days'|'business_days'>('calendar_days');
  const [epistemic,setEpistemic]=useState<'supported'|'assumed'>('assumed');
  const [sourceKind,setSourceKind]=useState<'contract'|'customer_or_supplier'|'internal_sla'>('customer_or_supplier');
  const [reference,setReference]=useState('');
  const [basis,setBasis]=useState('');
  const [commitmentId,setCommitmentId]=useState('');
  const refs={opportunities:[opportunity],requirements,commitments,evidence};
  const scope={userId:userId||null,sampleDataActive};
  const date=todayDateKey();
  const projection=useMemo(()=>deriveCommercialTime({opportunity,requirements,conditions,evidence,dependencies,
    assertions,commitments,today:date,calculatedAt:new Date().toISOString()}),
    [opportunity,requirements,conditions,evidence,dependencies,assertions,commitments,date]);
  const submit=(input:Parameters<typeof createCommercialTiming>[1])=>{
    const result=createCommercialTiming(scope,input,refs);
    onMessage(result.ok?result.warning||'Timing source recorded.':result.error);
    if(result.ok){setBasis('');setReference('');setDays('');setCommitmentId('');}
  };
  const openCommitments=commitments.filter(c=>c.opportunityId===opportunity.id && c.accountId===opportunity.accountId && c.status==='open' && c.currentDueDate);
  const chosen=active.find(r=>r.id===selected);
  return <section aria-label="Commercial time" className="mb-5 border-b border-line pb-5">
    <h3 className="text-sm font-semibold text-ink">Commercial time</h3>
    <p className="mt-1 text-xs text-muted">Expected close {opportunity.expectedClosePeriod||'is unset'} is a seller target. Link one required outcome to it; durations and promises are recorded separately. Dates below are derived, never saved as a promise.</p>
    <p className="mt-3 text-sm"><strong>Timing: {projection.status.replaceAll('_',' ')}</strong>
      {projection.lastSafeDate&&<> · Last safe blocker date: {projection.lastSafeDate}</>}
      {projection.bufferDays!==null&&<> · Promised buffer: {projection.bufferDays} calendar days</>}
      {projection.recoveryWindowDays!==null&&<> · Recovery window from today: {projection.recoveryWindowDays} calendar days</>}
      {projection.assumptionsUsed&&<> · Includes assumptions</>}
    </p>
    {projection.status==='target_no_longer_supported'&&<p className="mt-1 text-sm text-rose-700">The current target is no longer supported by the recorded timing. Review the blocker, promise or target explicitly.</p>}
    {projection.unknownTimingSegments.map(text=><p key={text} className="mt-1 text-xs text-muted">Unknown: {text}</p>)}
    {projection.conflictingTimingSegments.map(text=><p key={text} className="mt-1 text-xs text-rose-700">Conflict: {text}</p>)}
    {projection.blockers.map(blocker=><div key={blocker.requirementId} className="mt-2 rounded-lg border border-line p-2 text-sm">
      <strong>{blocker.expectedOutcome}</strong> · Last safe {blocker.lastSafeDate||'unknown'}
      {blocker.commitmentDueDate&&<> · Linked promise {blocker.commitmentDueDate}</>}
      {blocker.bufferDays!==null&&<> · Buffer {blocker.bufferDays} days</>}
      <p className="mt-1 text-xs text-muted">Constraining chain: {blocker.pathRequirementIds.map(id=>active.find(r=>r.id===id)?.expectedOutcome||id).join(' → ')}</p>
      <p className="mt-1 text-xs text-muted">Target: {projection.targetDate||'unknown'} · Durations: {projection.timingSources.filter(source=>blocker.pathRequirementIds.includes(source.requirementId)).map(source=>`${active.find(r=>r.id===source.requirementId)?.expectedOutcome||source.requirementId}: ${source.durationDays} ${source.durationUnit?.replaceAll('_',' ')} (${source.epistemic}, ${source.sourceKind?.replaceAll('_',' ')}, ${source.sourceReference||source.basis})`).join('; ')||'none recorded'} · Calculated {projection.calculatedAt.slice(0,16)} UTC</p>
    </div>)}
    {sources.map(row=><div key={row.id} className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line p-2 text-xs">
      <span><strong>{row.kind.replaceAll('_',' ')}</strong> · {active.find(r=>r.id===row.requirementId)?.expectedOutcome||row.requirementId}
        {row.kind==='duration'&&<> · {row.durationDays} {row.durationUnit?.replaceAll('_',' ')} · {row.epistemic} · {row.sourceKind?.replaceAll('_',' ')}{row.sourceReference?` · ${row.sourceReference}`:''}</>}
        {row.kind==='commitment_link'&&<> · Commitment {row.commitmentId}</>} · {row.basis} · {row.lifecycle}</span>
      {row.lifecycle==='active'&&<button type="button" className="text-brand-blue" onClick={()=>{const result=retireCommercialTiming(scope,row.id,row.updatedAt,refs);onMessage(result.ok?result.warning||'Timing source retired.':result.error);}}>Retire</button>}
    </div>)}
    <div className="mt-3 grid gap-2 sm:grid-cols-2">
      <label className="text-sm">Outcome<select className={field} value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Choose an active outcome</option>{active.map(r=><option key={r.id} value={r.id}>{r.expectedOutcome}</option>)}</select></label>
      <label className="text-sm">Reason for this timing assertion<input className={field} maxLength={1000} value={basis} onChange={e=>setBasis(e.target.value)} /></label>
    </div>
    {chosen&&<div className="mt-2 space-y-2">
      {chosen.role==='required_now'&&<button type="button" className="text-sm font-semibold text-brand-blue disabled:opacity-40" disabled={!basis.trim()||!!sources.find(r=>r.kind==='target_anchor'&&r.lifecycle==='active')} onClick={()=>submit({kind:'target_anchor',opportunityId:opportunity.id,requirementId:chosen.id,basis})}>Link outcome to close target</button>}
      <div className="grid gap-2 sm:grid-cols-3"><label className="text-sm">Resolution duration<input type="number" min="0" max="3650" step="1" className={field} value={days} onChange={e=>setDays(e.target.value)} /></label>
        <label className="text-sm">Unit<select className={field} value={unit} onChange={e=>setUnit(e.target.value as typeof unit)}><option value="calendar_days">Calendar days</option><option value="business_days">Business days (no calendar yet)</option></select></label>
        <label className="text-sm">Basis of duration<select className={field} value={epistemic} onChange={e=>setEpistemic(e.target.value as typeof epistemic)}><option value="assumed">Planning assumption</option><option value="supported">Supported source</option></select></label></div>
      {epistemic==='supported'&&<div className="grid gap-2 sm:grid-cols-2"><label className="text-sm">Source type<select className={field} value={sourceKind} onChange={e=>setSourceKind(e.target.value as typeof sourceKind)}><option value="contract">Contract</option><option value="customer_or_supplier">Customer or supplier</option><option value="internal_sla">Internal SLA</option></select></label><label className="text-sm">Specific source reference<input className={field} value={reference} onChange={e=>setReference(e.target.value)} /></label></div>}
      <button type="button" className="text-sm font-semibold text-brand-blue disabled:opacity-40" disabled={!basis.trim()||days===''||!Number.isInteger(Number(days))||Number(days)<0||Number(days)>3650||(epistemic==='supported'&&!reference.trim())} onClick={()=>submit({kind:'duration',opportunityId:opportunity.id,requirementId:chosen.id,basis,durationDays:Number(days),durationUnit:unit,epistemic,sourceKind:epistemic==='assumed'?'planning_assumption':sourceKind,sourceReference:epistemic==='supported'?reference:null})}>Record duration</button>
      <div className="grid gap-2 sm:grid-cols-2"><label className="text-sm">Existing dated promise<select className={field} value={commitmentId} onChange={e=>setCommitmentId(e.target.value)}><option value="">Choose an open Commitment</option>{openCommitments.map(c=><option key={c.id} value={c.id}>{c.commitmentText} · {c.currentDueDate}</option>)}</select></label>
        <button type="button" className="self-end text-left text-sm font-semibold text-brand-blue disabled:opacity-40" disabled={!basis.trim()||!commitmentId} onClick={()=>submit({kind:'commitment_link',opportunityId:opportunity.id,requirementId:chosen.id,basis,commitmentId})}>Link promise to outcome</button></div>
    </div>}
  </section>;
}
