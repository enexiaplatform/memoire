import {useEffect,useState} from 'react';
import type {CommercialScope,CommercialEvent} from '../../domain/commercialKernel/types';
import {normalizeExternalObservation,observationSourceKinds,type ExternalObservation} from '../../domain/commercialKernel/externalObservation';
import {receiveExternalObservation} from '../../domain/commercialKernel/externalObservationCommands';
import {loadEvents,EVENTS_UPDATED_EVENT} from '../../services/commercialKernel/eventStore';
import {ConnectorExportIntake} from './ConnectorExportIntake';
export function ExternalObservationIntake({scope}:{scope:CommercialScope}){
 const [draft,setDraft]=useState({sourceKind:'email' as ExternalObservation['sourceKind'],sourceNamespace:'',sourceEventId:'',sourceVersion:'',observedAt:'',summary:'',rawText:''}),[message,setMessage]=useState(''),[receipts,setReceipts]=useState<CommercialEvent[]>([]),[busy,setBusy]=useState(false);
 useEffect(()=>{const refresh=()=>setReceipts(loadEvents().filter(e=>e.eventType==='external_observation_received'&&e.userId===scope.userId&&Boolean(e.isSample)===scope.sampleDataActive));refresh();window.addEventListener(EVENTS_UPDATED_EVENT,refresh);return()=>window.removeEventListener(EVENTS_UPDATED_EVENT,refresh);},[scope.userId,scope.sampleDataActive]);
 const receive=async()=>{setBusy(true);try{const result=await receiveExternalObservation(scope,{...draft,schemaVersion:1,observedAt:draft.observedAt?new Date(draft.observedAt).toISOString():null});setMessage(result.duplicate?'This source version was already received. No duplicate was created.':'Observation received in this browser. No commercial fact was accepted. Account synchronization runs when connected.');}catch(error){setMessage(error instanceof Error?error.message:'Observation could not be received.');}finally{setBusy(false);}};
 return <details className="rounded-panel border border-line bg-white p-4"><summary className="cursor-pointer text-sm font-semibold text-ink">External source observations</summary><section aria-label="External source observations" className="mt-3 space-y-3">
  <p className="text-sm text-muted">Receive a normalized source observation for review. Source content is unverified input; receiving it changes no Opportunity, Evidence, promise or payment.</p>
  <label className="block text-sm">Source kind<select aria-label="Source kind" className="mt-1 w-full rounded-lg border border-line p-2" value={draft.sourceKind} onChange={e=>setDraft({...draft,sourceKind:e.target.value as ExternalObservation['sourceKind']})}>{observationSourceKinds.map(kind=><option key={kind} value={kind}>{kind.replaceAll('_',' ')}</option>)}</select></label>
  {(['sourceNamespace','sourceEventId','sourceVersion','observedAt','summary'] as const).map(key=><label className="block text-sm" key={key}>{{sourceNamespace:'Source system or mailbox',sourceEventId:'Source record reference',sourceVersion:'Source version',observedAt:'Source reported time (your local time, optional)',summary:'Source summary'}[key]}
   <input className="mt-1 w-full rounded-lg border border-line p-2" type={key==='observedAt'?'datetime-local':'text'} maxLength={key==='summary'?500:key==='sourceVersion'?100:200} value={draft[key]} onChange={e=>setDraft({...draft,[key]:e.target.value})}/></label>)}
  <label className="block text-sm">Original source text<textarea aria-label="Original source text" rows={5} maxLength={20000} className="mt-1 w-full rounded-lg border border-line p-3 text-sm" value={draft.rawText} onChange={e=>setDraft({...draft,rawText:e.target.value})}/></label>
  <button type="button" disabled={busy||!draft.rawText.trim()} onClick={()=>{void receive();}} className="rounded-lg bg-brand-blue px-3 py-2 text-sm text-white disabled:opacity-40">Receive observation</button>
  {message&&<p role="status" className="text-sm">{message}</p>}
  <ConnectorExportIntake scope={scope}/>
  <p className="text-xs text-muted">{receipts.length} receipts in this browser · most recent 20 shown</p>
  {receipts.slice(0,20).map(receipt=>{const source=normalizeExternalObservation(receipt.structuredPayload);return <details key={receipt.id} className="rounded-lg border border-line p-3 text-sm"><summary className="cursor-pointer">{source.summary} · unaccepted observation</summary>
   <p className="mt-2 text-xs text-muted">{source.sourceNamespace} · {source.sourceEventId} · source version {source.sourceVersion}</p><p className="text-xs text-muted">Received {receipt.recordedAt}; source-reported time {source.observedAt||'not supplied'}</p><pre className="mt-2 whitespace-pre-wrap break-words text-xs">{source.rawText}</pre>
   <p className="mt-2 text-xs text-muted">Review the source before recording any commercial interpretation through Capture.</p></details>;})}
 </section></details>;
}
