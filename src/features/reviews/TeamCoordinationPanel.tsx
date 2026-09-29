import {useMemo,useState} from 'react';
import {Link} from 'react-router-dom';
import type {CommercialCommitment,CommercialScope} from '../../domain/commercialKernel/types';
import type {CrmLiteOpportunity} from '../../services/opportunityStore';
import {deriveTeamCoordination,teamReviewText} from '../../domain/commercialKernel/teamCoordination';
import {recordInternalAgreement} from '../../domain/commercialKernel/teamCoordinationCommands';
import {todayDateKey} from '../../utils/safeDate';
const field='mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink';
export function TeamCoordinationPanel({scope,commitments,opportunities}:{scope:CommercialScope;commitments:CommercialCommitment[];opportunities:CrmLiteOpportunity[]}){
 const [selected,setSelected]=useState<string[]>([]),[message,setMessage]=useState(''),[composing,setComposing]=useState(false),[confirmed,setConfirmed]=useState(false);
 const [draft,setDraft]=useState({opportunityId:'',ownerLabel:'',promise:'',dueDate:'',agreementReference:''});
 const [preview,setPreview]=useState('');
 const rows=useMemo(()=>deriveTeamCoordination(scope,commitments,opportunities,todayDateKey()),[scope,commitments,opportunities]);
 const choices=opportunities.filter(o=>(o.userId??null)===scope.userId&&Boolean(o.isSample)===scope.sampleDataActive&&o.accountId);
 const save=()=>{const opportunity=choices.find(o=>o.id===draft.opportunityId);if(!opportunity){setMessage('Choose an Opportunity from this workspace.');return;}
  const result=recordInternalAgreement(scope,{...draft,opportunity,confirmed});setMessage(result.ok?'Internal promise recorded. No notification or access invitation was sent.':result.error);
  if(result.ok){setComposing(false);setConfirmed(false);setDraft({opportunityId:'',ownerLabel:'',promise:'',dueDate:'',agreementReference:''});}};
 return <details className="rounded-panel border border-line bg-white p-4"><summary className="cursor-pointer text-sm font-semibold text-ink">Team coordination · {rows.length} recorded open promises</summary>
  <section aria-label="Team coordination" className="mt-3 space-y-3">
   <p className="text-sm text-muted">Review internal promises recorded in your workspace, earliest due first. Names are recorded labels, not shared account permissions or verified recipient acceptance.</p>
   <button type="button" className="text-sm font-semibold text-brand-blue" onClick={()=>{setComposing(!composing);setConfirmed(false);}}>Record agreed internal promise</button>
   {composing&&<div className="space-y-3 rounded-lg border border-line p-3">
    <label className="block text-sm">Team Opportunity<select className={field} value={draft.opportunityId} onChange={e=>setDraft({...draft,opportunityId:e.target.value})}><option value="">Choose an Opportunity</option>{choices.map(o=><option key={o.id} value={o.id}>{o.opportunityName}</option>)}</select></label>
    {(['ownerLabel','promise','dueDate','agreementReference'] as const).map(key=><label key={key} className="block text-sm">{{ownerLabel:'Who agreed',promise:'Agreed internal promise',dueDate:'Agreed due date',agreementReference:'Agreement reference'}[key]}
     <input className={field} type={key==='dueDate'?'date':'text'} maxLength={key==='ownerLabel'?200:key==='promise'?2000:1000} value={draft[key]} onChange={e=>setDraft({...draft,[key]:e.target.value})}/></label>)}
    <label className="flex gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>I confirm this agreed promise and its reference.</label>
    <button type="button" disabled={!confirmed} onClick={save} className="rounded-lg bg-brand-blue px-3 py-2 text-sm text-white disabled:opacity-40">Record internal agreement</button>
   </div>}
   {!rows.length&&<p className="text-sm text-muted">No open internal promises are recorded in this workspace.</p>}
   <ul className="space-y-2">{rows.map(row=><li key={row.id} className="rounded-lg border border-line p-3 text-sm">
    <label className="flex items-start gap-2"><input type="checkbox" checked={selected.includes(row.id)} onChange={e=>{setSelected(ids=>e.target.checked?[...ids,row.id]:ids.filter(id=>id!==row.id));setPreview('');}}/>Include in review: {row.ownerLabel} — {row.promise}</label>
    <p className="mt-1 text-muted">{row.accountName} · {row.dueDate||'No agreed date'} · {row.timing.replaceAll('_',' ')}</p>
    {row.agreementReference&&<p className="text-xs text-muted">Agreement reference: {row.agreementReference}</p>}
    {row.opportunityId&&<Link className="text-brand-blue" to={'/app/opportunities?opportunityId='+encodeURIComponent(row.opportunityId)}>Review Opportunity</Link>}
   </li>)}</ul>
   <div className="flex flex-wrap gap-3"><Link className="text-sm text-brand-blue" to="/app/timeline?view=upcoming">Review or update commitments</Link>
    <button type="button" disabled={!rows.some(r=>selected.includes(r.id))} className="text-sm font-semibold text-brand-blue disabled:opacity-40" onClick={()=>setPreview(teamReviewText(rows,selected,new Date().toISOString()))}>Preview selected review</button></div>
   {preview&&<div className="space-y-2"><p className="text-xs text-muted">Only the text below will be copied. Review it before sharing.</p><pre className="whitespace-pre-wrap break-words rounded-lg border border-line p-3 text-xs">{preview}</pre>
    <button type="button" className="text-sm font-semibold text-brand-blue" onClick={()=>{void navigator.clipboard.writeText(preview).then(()=>setMessage('Selected review copied. Share it through your chosen channel.')).catch(()=>setMessage('Copy was unavailable. Select the visible review text to copy it manually.'));}}>Copy selected review</button></div>}
   {message&&<p role="status" className="text-sm">{message}</p>}
  </section>
 </details>;
}
