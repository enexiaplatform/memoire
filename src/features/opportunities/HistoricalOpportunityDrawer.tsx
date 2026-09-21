import {useEffect,useState} from 'react';
import {X} from 'lucide-react';
import {useModalDrawer} from '../../hooks/useModalDrawer.ts';
import {getCloudHistoricalSourcesAt,getLocalHistoricalSourcesAt} from '../../services/historicalQuery.ts';
import {composeCommercialStateAsOf,type CommercialAsOfResult} from '../../services/commercialTimeMachine.ts';
import {supabaseClient} from '../../lib/supabaseClient.ts';
import {fetchAllRows} from '../../services/supabasePaging.ts';
import {decisionCodec,loadCommercialDecisions} from '../../services/commercialKernel/decisionStore.ts';
import type {CommercialDecision} from '../../domain/commercialKernel/commercialDecision.ts';
import type {SalesActivityRecord} from '../../services/salesActivityStore.ts';
import {ForecastDefensibilitySection} from './ForecastDefensibilitySection.tsx';

const localValue=(value:string)=>{
  const date=new Date(value);if(!Number.isFinite(date.getTime()))return '';
  const pad=(number:number)=>String(number).padStart(2,'0');
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};
async function readDecisions(opportunityId:string,scope:string):Promise<CommercialDecision[]>{
  if(scope==='guest')return loadCommercialDecisions().filter(row=>row.userId===null&&row.opportunityId===opportunityId);
  if(!supabaseClient)throw new Error('Account history is unavailable.');
  const client=supabaseClient;
  const rows=await fetchAllRows<Record<string,unknown>>((from,to)=>client.from('commercial_decisions').select('*')
    .eq('user_id',scope).eq('opportunity_id',opportunityId).order('decided_at',{ascending:false}).range(from,to) as never);
  return rows.map(row=>decisionCodec.fromRow(row)).map(row=>{
    if(!row)throw new Error('A recorded Decision could not be read safely.');return row;
  });
}

/** A separate read-only surface: no current commercial source loader or mutation command is reachable here. */
export function HistoricalOpportunityDrawer({opportunityId,scope,cutoff,sampleDataActive,activities,onCutoffChange,
  onReturnToCurrent,onClose}:{opportunityId:string;scope:string;cutoff:string;sampleDataActive:boolean;
  activities:SalesActivityRecord[];onCutoffChange:(cutoff:string)=>void;onReturnToCurrent:()=>void;onClose:()=>void}){
  const {ref,dialogProps}=useModalDrawer({onClose,label:'Opportunity as understood then'});
  const [result,setResult]=useState<CommercialAsOfResult|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [picker,setPicker]=useState(()=>localValue(cutoff));
  useEffect(()=>setPicker(localValue(cutoff)),[cutoff]);
  useEffect(()=>{
    let active=true;setResult(null);setError('');setLoading(true);
    if(sampleDataActive){setError('Sample workspace has no verified historical fixture.');setLoading(false);return()=>{active=false;};}
    const instant=Date.parse(cutoff);
    if(!Number.isFinite(instant)||instant>Date.now()+1000){setError('Choose a valid date and time no later than now.');setLoading(false);return()=>{active=false;};}
    const timeZone=Intl.DateTimeFormat().resolvedOptions().timeZone;
    void (async()=>{
      const sources=scope==='guest'?getLocalHistoricalSourcesAt(scope,cutoff,window.localStorage)
        :await getCloudHistoricalSourcesAt(scope,cutoff);
      // A pre-coverage/gap answer must not depend on today's Decision table.
      const decisions=sources.status==='verified'&&sources.records.opportunities.some(row=>row.id===opportunityId)
        ?await readDecisions(opportunityId,scope):[];
      if(active)setResult(composeCommercialStateAsOf({sources,scope,opportunityId,cutoff,timeZone,decisions,activities}));
    })().catch(reason=>{if(active)setError(reason instanceof Error?reason.message:'Historical state is unavailable.');})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[opportunityId,scope,cutoff,sampleDataActive,activities]);
  const apply=()=>{
    const instant=new Date(picker).getTime();
    if(!Number.isFinite(instant)||instant>Date.now()+1000){setError('Choose a valid date and time no later than now.');return;}
    onCutoffChange(new Date(instant).toISOString());
  };
  const asOf=result?.status==='available'?result:null;
  return <>
    <button type="button" aria-label="Close opportunity history" onClick={onClose}
      className="fixed inset-y-0 left-0 right-0 top-16 z-40 bg-slate-950/25 backdrop-blur-[1px] lg:left-[220px]" />
    <aside ref={ref} {...dialogProps} className="fixed bottom-0 right-0 top-16 z-50 w-full overflow-y-auto border-l border-gray-200 bg-white p-5 shadow-2xl sm:max-w-[760px]">
      <div className="flex items-start justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">As understood then</p>
          <h2 className="mt-2 text-xl font-bold text-navy">{asOf?.opportunity?.opportunityName||'Opportunity history'}</h2>
          <p className="mt-1 text-sm text-muted">Recorded by {Number.isFinite(Date.parse(cutoff))?new Date(cutoff).toLocaleString():cutoff} · Read-only reconstruction</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-full border border-gray-200 p-2 text-gray-500 hover:bg-gray-50"><X className="h-4 w-4" /></button>
      </div>
      <div className="mt-5 rounded-panel border border-blue-100 bg-blue-50/40 p-4">
        <p className="text-sm font-semibold text-navy">Choose a recorded-state cutoff</p>
        <p className="mt-1 text-xs text-muted">Date and time use your device timezone, including seconds. The selected instant is stored exactly in the link.</p>
        <div className="mt-3 flex flex-wrap items-end gap-2"><label className="text-xs font-semibold text-ink">As understood on
          <input aria-label="Historical cutoff" type="datetime-local" step="1" value={picker} onChange={event=>setPicker(event.target.value)}
            className="mt-1 block rounded-lg border border-line bg-white px-3 py-2 text-sm" /></label>
          <button type="button" onClick={apply} className="rounded-lg bg-brand-blue px-3 py-2 text-sm font-semibold text-white">View</button>
          <button type="button" onClick={onReturnToCurrent} className="rounded-lg border border-line bg-white px-3 py-2 text-sm font-semibold text-brand-blue">Return to current</button>
        </div>
      </div>
      {loading&&<p role="status" className="mt-5 text-sm text-muted">Reconstructing verified commercial state…</p>}
      {error&&<p role="alert" className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{error} No current-state substitute was used.</p>}
      {result&&!loading&&result.status!=='available'&&<section role="status" className="mt-5 rounded-panel border border-amber-200 bg-amber-50 p-4 text-sm">
        <h3 className="font-semibold">{result.status==='pre_coverage'?'Before verified history':result.status==='verified_absent'?'Not yet recorded':'Historical state incomplete'}</h3>
        <p className="mt-1">{result.status==='verified_absent'?'This Opportunity had no accepted record at this cutoff.':result.gap}</p>
        {result.boundary&&<p className="mt-1">Verified history begins {new Date(result.boundary).toLocaleString()}.</p>}
      </section>}
      {asOf&&<div className="mt-5 space-y-4 text-sm">
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-900">{asOf.coreCoverage==='full'?'Full core historical coverage':'Core history incomplete'} · Buyer Progress {asOf.coverage.buyerProgress}.</p>
        {asOf.metadataInferred&&<p className="text-xs text-muted">Some older snapshots lack precise edit metadata; displayed commercial state and recorded revision times remain unchanged.</p>}
        <section className="rounded-panel border border-line p-4"><h3 className="font-semibold text-ink">Opportunity state then</h3>
          <p className="mt-2">{asOf.opportunity!.accountName} · {asOf.opportunity!.stage} · {asOf.opportunity!.status}</p>
          <p className="mt-1 text-muted">Close target then: {asOf.opportunity!.expectedClosePeriod||'not recorded'} · Operator forecast basis: {asOf.opportunity!.forecastEvidenceCategory}</p>
          {typeof asOf.opportunity!.estimatedValue==='number'&&<p className="mt-1 text-muted">Recorded value then: {asOf.opportunity!.estimatedValue.toLocaleString()} {asOf.opportunity!.currency||''}</p>}
          <p className="mt-1 text-xs text-muted">This is accepted source state, not a prediction of the eventual outcome.</p>
        </section>
        <section className="rounded-panel border border-line p-4"><h3 className="font-semibold text-ink">Known, assumed and conflicted then</h3>
          {[...asOf.conditions.values()].length?<ul className="mt-2 space-y-2">{[...asOf.conditions.values()].map(reading=><li key={reading.condition.id}>
            <strong>{reading.state}</strong> · {reading.condition.statement} · {reading.condition.lifecycle}
            {(reading.supporting.length+reading.conflicting.length)>0&&<details className="mt-1 text-xs text-muted"><summary className="cursor-pointer">Evidence known by this cutoff</summary>
              {[...reading.supporting,...reading.conflicting].map(item=><p key={item.id} className="mt-1">{item.summary} · Observed {item.observedAt} · Recorded {new Date(asOf.recordedAtBySource.get(`commercial_evidence:${item.id}`)||item.recordedAt).toLocaleString()}</p>)}
            </details>}
          </li>)}</ul>:<p className="mt-2 text-muted">No Condition recorded by this cutoff.</p>}
        </section>
        <section className="rounded-panel border border-line p-4"><h3 className="font-semibold text-ink">Requirements and questions then</h3>
          {asOf.requirementReadings.length?<ul className="mt-2 space-y-2">{asOf.requirementReadings.map(reading=><li key={reading.requirement.id}>
            <strong>{reading.resolution}</strong> · {reading.requirement.expectedOutcome} · {reading.requirement.role.replaceAll('_',' ')}
          </li>)}</ul>:<p className="mt-2 text-muted">No Requirement recorded by this cutoff.</p>}
          {asOf.nextQuestion&&<p className="mt-3 text-brand-blue"><strong>Question implied by the recorded state:</strong> {asOf.nextQuestion.requirement.question||asOf.nextQuestion.requirement.expectedOutcome}</p>}
          {asOf.blockers?.blockers.length?<p className="mt-2">Waiting for then: {asOf.blockers.blockers.map(blocker=>blocker.reading.requirement.expectedOutcome).join('; ')}</p>:null}
        </section>
        {asOf.forecast&&<section className="rounded-panel border border-line p-4">
          <ForecastDefensibilitySection view={asOf.forecast} historical />
          {asOf.forecast.timing&&<p>Recovery window at cutoff: {asOf.forecast.timing.recoveryWindowDays??'unknown'} days · Last safe date: {asOf.forecast.timing.lastSafeDate||'unknown'}.</p>}
        </section>}
        <section className="rounded-panel border border-line p-4"><h3 className="font-semibold text-ink">Buyer Progress · partial historical coverage</h3>
          <p className="mt-1 text-xs text-muted">Verified customer signals are shown. PO/payment Events and edited or deleted Activity history are unavailable.</p>
          {asOf.buyerProgress?.projection?.get(opportunityId)?.signals.length?<ul className="mt-2 space-y-2">{asOf.buyerProgress.projection.get(opportunityId)!.signals.map(signal=><li key={signal.id}>
            {signal.summary} · Occurred {signal.occurredAt.slice(0,10)} · Recorded {signal.recordedAt?new Date(signal.recordedAt).toLocaleString():'unknown'}
          </li>)}</ul>:<p className="mt-2 text-muted">No verified buyer signal by this cutoff.</p>}
          <p className="mt-2 text-xs text-muted">Surviving seller Activities known by cutoff: {asOf.buyerProgress?.projection?.get(opportunityId)?.recordedActivityCount??0}. Earlier versions of edited or deleted Activities cannot be reconstructed.</p>
        </section>
        <section className="rounded-panel border border-line p-4"><h3 className="font-semibold text-ink">Decisions recorded by then</h3>
          {asOf.decisions.length?<ul className="mt-2 space-y-3">{asOf.decisions.map(decision=><li key={decision.id} className="border-t border-line pt-2">
            <strong>{decision.question}</strong> · {new Date(decision.decidedAt).toLocaleString()}{decision.id===asOf.decisions[0].id?' · Latest by cutoff':''}
            <p>Chosen: {decision.options.find(option=>option.id===decision.selectedOptionId)?.label||'Unavailable'}</p>
            <p className="text-muted">Recorded basis at finalization: {decision.basisSnapshot.forecast.verdict}. Reconstructed forecast at this cutoff: {asOf.forecast?.verdict||'unavailable'}.</p>
            <p className="text-xs text-muted">These are separate records; differences are not scored or reconciled.</p>
          </li>)}</ul>:<p className="mt-2 text-muted">No Decision finalized by this cutoff.</p>}
        </section>
      </div>}
    </aside>
  </>;
}
