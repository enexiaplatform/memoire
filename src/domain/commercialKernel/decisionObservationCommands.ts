import type {CommercialDecision} from './commercialDecision.ts';
import {captureDecisionObservationSnapshot,elapsedObservationDays,type DecisionObservation} from './decisionLearning.ts';
import type {CommercialAsOfResult} from '../../services/commercialTimeMachine.ts';
import type {PlanRecord} from '../../utils/weeklyPlan.ts';
import {saveDecisionObservation} from '../../services/commercialKernel/decisionObservationStore.ts';

export function finalizeDecisionObservation(scope:{userId:string|null;sampleDataActive:boolean},input:{id:string;decision:CommercialDecision;
  asOf:CommercialAsOfResult;plans?:PlanRecord[];operatorNote?:string;finalizedAt?:string}){
  try{
    const finalizedAt=input.finalizedAt||new Date().toISOString(),cutoff=input.asOf.cutoff;
    if(input.decision.userId!==scope.userId||Boolean(input.decision.isSample)!==scope.sampleDataActive)throw new Error('Decision workspace does not match.');
    if(Date.parse(cutoff)>Date.parse(finalizedAt)+1000)throw new Error('Observation cutoff cannot be later than finalization.');
    const elapsedDays=elapsedObservationDays(input.decision.decidedAt,cutoff);
    if(elapsedDays<0)throw new Error('Observation cutoff must be at or after the Decision.');
    const note=(input.operatorNote||'').trim();if(note.length>2000)throw new Error('Observation note is too long.');
    const snapshot=captureDecisionObservationSnapshot({decision:input.decision,asOf:input.asOf,plans:input.plans});
    const record:DecisionObservation={id:input.id,userId:scope.userId,accountId:input.decision.accountId,opportunityId:input.decision.opportunityId,
      decisionId:input.decision.id,observationCutoff:cutoff,elapsedDays,snapshot,operatorNote:note,sourceType:'manual',finalizedAt,createdAt:finalizedAt,
      ...(scope.sampleDataActive?{isSample:true}:{})};
    saveDecisionObservation(record);return {ok:true as const,record,warning:scope.sampleDataActive?'Sample observation recorded. It is excluded from real learning.':''};
  }catch(error){return {ok:false as const,error:error instanceof Error?error.message:'Decision Observation could not be saved.'};}
}
