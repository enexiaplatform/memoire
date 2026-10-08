import type { ClassifiedSalesActivity } from './salesActivityClassifier.ts';
import type { ReviewableChangeSet } from '../domain/commercialKernel/capturedFacts.ts';

/** The scalar editor owns the first action; additional reviewed actions stay intact. */
export function editCaptureDraft<Key extends keyof ClassifiedSalesActivity>(draft:ClassifiedSalesActivity,key:Key,value:ClassifiedSalesActivity[Key]):ClassifiedSalesActivity{
 const next={...draft,[key]:value};
 if(key==='nextAction'||key==='dueDate'){
  const [first,...rest]=draft.nextActions||[];
  next.nextActions=next.nextAction.trim()?[{...first,title:next.nextAction,dueDate:next.dueDate||undefined},...rest]:rest;
  if(!next.nextAction.trim()&&rest.length){next.nextAction=rest[0].title;next.dueDate=rest[0].dueDate||'';}
 }
 return next;
}

/** Carry only an unambiguous operator correction into the proposed promise.
 * Raw evidence stays verbatim; other promises and customer commitments stay separate. */
export function applyCaptureActionCorrection(set:ReviewableChangeSet,original:ClassifiedSalesActivity|undefined,reviewed:ClassifiedSalesActivity):ReviewableChangeSet{
 if(!original||(original.nextAction===reviewed.nextAction&&original.dueDate===reviewed.dueDate))return set;
 const fold=(text:string)=>text.trim().replace(/[.。]+$/,'').toLocaleLowerCase();
 const matches=set.facts.filter(fact=>fact.kind==='commitment'&&fact.party!=='customer'&&fold(fact.text)===fold(original.nextAction));
 if(matches.length!==1)return set;
 const removedFirst=Boolean(original.nextActions?.[1]&&reviewed.nextAction===original.nextActions[1].title
  &&reviewed.nextActions?.length===original.nextActions.length-1);
 return {...set,facts:set.facts.map(fact=>fact===matches[0]&&fact.kind==='commitment'
  ?{...fact,text:removedFirst?fact.text:reviewed.nextAction||fact.text,dueDate:removedFirst?fact.dueDate:reviewed.dueDate,status:reviewed.nextAction&&!removedFirst?'proposed':'ignored',duplicateOf:undefined}:fact)};
}
