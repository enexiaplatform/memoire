import {useState} from 'react';
import type {CommercialScope} from '../../domain/commercialKernel/types';
import {receiveExternalObservation} from '../../domain/commercialKernel/externalObservationCommands';
import {CONNECTOR_EXPORT_MAX_BYTES,previewConnectorExport,type ConnectorPreview} from '../../services/commercialKernel/connectorAdapters';

export function ConnectorExportIntake({scope}:{scope:CommercialScope}){
 const [preview,setPreview]=useState<ConnectorPreview|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const read=async(file:File|undefined)=>{setPreview(null);setMessage('');if(!file)return;setBusy(true);try{
  if(file.size>CONNECTOR_EXPORT_MAX_BYTES)throw new Error('Source export is too large. Use at most 128 KB and 50 records.');
  setPreview(previewConnectorExport(await file.text()));
 }catch(error){setMessage(error instanceof Error?error.message:'Source export could not be read.');}finally{setBusy(false);}};
 const receive=async()=>{if(!preview)return;setBusy(true);let saved=0,duplicates=0;try{
  for(const observation of preview.observations){const receipt=await receiveExternalObservation(scope,observation);if(receipt.duplicate)duplicates++;else saved++;}
  setMessage(`${saved} new receipts saved in this browser; ${duplicates} already received. No commercial facts were accepted. Account synchronization runs when connected.`);
 }catch(error){setMessage(`${saved} new receipts saved; ${duplicates} already received. Import stopped: ${error instanceof Error?error.message:'receipt could not be stored'}. Correct the source and retry; existing receipts are retained.`);}finally{setBusy(false);}};
 return <details className="rounded-lg border border-line p-3"><summary className="cursor-pointer text-sm font-semibold">Review a connector export</summary><section aria-label="Connector export review" className="mt-3 space-y-3">
  <p className="text-sm text-muted">Review an export prepared by a CRM, email, calendar, ERP or finance adapter. This does not connect to a live service or accept its claims as commercial truth.</p>
  <label className="block text-sm">Source export<input aria-label="Source export" type="file" accept=".json,application/json" disabled={busy} onChange={event=>{void read(event.target.files?.[0]);}} className="mt-1 block w-full text-sm"/></label>
  {preview&&<><p className="text-sm">{preview.kind} · {preview.namespace} · {preview.observations.length} observations to review</p>
   {preview.observations.map(observation=><details key={JSON.stringify([observation.sourceEventId,observation.sourceVersion])} className="rounded border border-line p-2 text-sm"><summary>{observation.summary}</summary><p className="text-xs text-muted">{observation.sourceEventId} · version {observation.sourceVersion} · source-reported {observation.observedAt||'time not supplied'}</p><pre className="whitespace-pre-wrap break-words text-xs">{observation.rawText}</pre></details>)}
   <button type="button" disabled={busy} onClick={()=>{void receive();}} className="rounded-lg bg-brand-blue px-3 py-2 text-sm text-white disabled:opacity-40">Receive reviewed observations</button></>}
  {message&&<p role="status" className="text-sm">{message}</p>}
 </section></details>;
}
