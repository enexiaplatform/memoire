import type { ForecastDefensibility } from './deriveForecastDefensibility.ts';

export type DecisionBasisSnapshot = {
  version: 1; capturedAt: string;
  forecast: { verdict: ForecastDefensibility['verdict']; claim: ForecastDefensibility['claim']; timingEvaluation: ForecastDefensibility['timingEvaluation']; reasonCodes: string[] };
  premises: { requirementId: string; label: string; state: string; condition: string | null;
    evidence: {id:string;summary:string;assessment:string}[]; evidenceIds: string[] }[];
  blockers: { requirementId: string; label: string; state: string; sourceRecordIds: string[];
    paths: {requirementIds:string[];dependencyIds:string[];explanations:string[]}[] }[];
  openQuestions: { text: string; sourceRecordIds: string[] }[];
  nextQuestion: ForecastDefensibility['nextQuestion'];
  timing: { status: string; targetDate:string|null; lastSafeDate:string|null; bufferDays:number|null;
    assumptionsUsed:boolean; unknownSegments: string[]; conflictingSegments:string[];
    sources: {id:string;requirementId:string;basis:string;durationDays:number|null;durationUnit:string|null;
      epistemic:string|null;sourceKind:string|null;sourceReference:string|null;evidenceId:string|null}[] } | null;
  sourceRecordIds: string[];
};
export type CommercialOption = { id: string; order: number; label: string; interventionIntent: string; expectedConsequence: string; tradeoffs: string };
export type CommercialIntervention = { id: string; intent: string; targetKind: 'requirement'|'forecast_claim'|'opportunity'; targetRequirementId: string | null; expectedChange: string };
export type DecisionExecutionLink = { kind: 'action'|'commitment'; recordId: string; linkedAt: string };
export type CommercialDecision = {
  id: string; userId: string | null; accountId: string; opportunityId: string;
  question: string; context: string; basisSnapshot: DecisionBasisSnapshot;
  options: CommercialOption[]; selectedOptionId: string; rationale: string; expectedConsequence: string;
  intervention: CommercialIntervention; executionLinks: DecisionExecutionLink[];
  supersedesDecisionId: string | null; sourceType: 'manual'; decidedAt: string; createdAt: string; updatedAt: string;
  isSample?: boolean;
};
const nonempty = (value: unknown, max: number) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const iso = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value));
export function captureDecisionBasis(view: ForecastDefensibility, capturedAt: string): DecisionBasisSnapshot {
  if(view.premises.length>100||view.blockers.length>100||view.whatWouldHaveToBeTrue.length>100||view.sourceRecordIds.length>250
    ||view.premises.some(p=>p.evidenceIds.length>30)||view.blockers.some(b=>b.sourceRecordIds.length>50||b.paths.length>50)
    ||view.whatWouldHaveToBeTrue.some(q=>q.sourceRecordIds.length>50)
    ||(view.timing&&(view.timing.timingSources.length>100||view.timing.unknownTimingSegments.length>50
      ||view.timing.conflictingTimingSegments.length>50)))
    throw new Error('Decision basis exceeds the supported snapshot size. Nothing was saved.');
  return {
    version: 1, capturedAt,
    forecast: { verdict: view.verdict, claim: view.claim ? { ...view.claim } : null, timingEvaluation: view.timingEvaluation, reasonCodes: [...view.reasonCodes] },
    premises: view.premises.map(p => ({ requirementId:p.requirementId, label:p.expectedOutcome, state:p.state,
      condition:p.conditionStatement,evidence:p.evidenceSources.map(e=>({...e})), evidenceIds:[...p.evidenceIds] })),
    blockers: view.blockers.map(b => ({ requirementId:b.requirementId,label:b.expectedOutcome,state:b.state,sourceRecordIds:[...b.sourceRecordIds],
      paths:b.paths.map(p=>({requirementIds:[...p.requirementIds],dependencyIds:[...p.dependencyIds],explanations:[...p.explanations]})) })),
    openQuestions: view.whatWouldHaveToBeTrue.map(q => ({ text:q.text, sourceRecordIds:[...q.sourceRecordIds] })),
    nextQuestion: view.nextQuestion ? { ...view.nextQuestion } : null,
    timing: view.timing ? { status:view.timing.status,targetDate:view.timing.targetDate,lastSafeDate:view.timing.lastSafeDate,
      bufferDays:view.timing.bufferDays,assumptionsUsed:view.timing.assumptionsUsed,
      unknownSegments:[...view.timing.unknownTimingSegments],conflictingSegments:[...view.timing.conflictingTimingSegments],
      sources:view.timing.timingSources.map(s=>({id:s.id,requirementId:s.requirementId,basis:s.basis,
        durationDays:s.durationDays??null,durationUnit:s.durationUnit??null,epistemic:s.epistemic??null,
        sourceKind:s.sourceKind??null,sourceReference:s.sourceReference??null,evidenceId:s.evidenceId??null})) } : null,
    sourceRecordIds:[...view.sourceRecordIds],
  };
}
export function isCommercialDecision(value: unknown): value is CommercialDecision {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const r=value as Partial<CommercialDecision>, b=r.basisSnapshot;
  if (!nonempty(r.id,200)||!nonempty(r.accountId,200)||!nonempty(r.opportunityId,200)
    ||!nonempty(r.question,500)||!nonempty(r.context,2000)||!nonempty(r.rationale,2000)
    ||!nonempty(r.expectedConsequence,1000)||!nonempty(r.selectedOptionId,200)
    ||!iso(r.decidedAt)||!iso(r.createdAt)||!iso(r.updatedAt)||r.sourceType!=='manual'
    ||!b||b.version!==1||!iso(b.capturedAt)||!b.forecast||!Array.isArray(b.premises)
    ||!Array.isArray(b.blockers)||!Array.isArray(b.openQuestions)||!Array.isArray(b.sourceRecordIds)
    ||b.premises.length>100||b.blockers.length>100||b.openQuestions.length>100||b.sourceRecordIds.length>250
    ||typeof b.forecast.verdict!=='string'||!Array.isArray(b.forecast.reasonCodes)
    ||b.premises.some(p=>!p||!nonempty(p.requirementId,200)||!nonempty(p.label,1000)||!Array.isArray(p.evidenceIds)||p.evidenceIds.length>30
      ||!Array.isArray(p.evidence)||p.evidence.length>30)
    ||b.blockers.some(p=>!p||!nonempty(p.requirementId,200)||!nonempty(p.label,1000)||!Array.isArray(p.sourceRecordIds)||p.sourceRecordIds.length>50
      ||!Array.isArray(p.paths)||p.paths.length>50)
    ||b.openQuestions.some(q=>!q||!nonempty(q.text,2000)||!Array.isArray(q.sourceRecordIds)||q.sourceRecordIds.length>50)
    ||b.timing&&(!Array.isArray(b.timing.unknownSegments)||b.timing.unknownSegments.length>50
      ||!Array.isArray(b.timing.conflictingSegments)||b.timing.conflictingSegments.length>50
      ||!Array.isArray(b.timing.sources)||b.timing.sources.length>100)) return false;
  if (!Array.isArray(r.options)||r.options.length<1||r.options.length>10) return false;
  const ids=new Set<string>();
  for (let i=0;i<r.options.length;i++) {
    const o=r.options[i];
    if (!o||!nonempty(o.id,200)||ids.has(o.id)||o.order!==i+1||!nonempty(o.label,300)
      ||!nonempty(o.interventionIntent,1000)||!nonempty(o.expectedConsequence,1000)
      ||typeof o.tradeoffs!=='string'||o.tradeoffs.length>1000) return false;
    ids.add(o.id!);
  }
  if (!ids.has(r.selectedOptionId!)) return false;
  const selected=r.options.find(o=>o.id===r.selectedOptionId)!;
  if(r.expectedConsequence!==selected.expectedConsequence) return false;
  const intervention=r.intervention;
  if (!intervention||!nonempty(intervention.id,200)||intervention.intent!==selected.interventionIntent
    ||intervention.expectedChange!==selected.expectedConsequence
    ||!['requirement','forecast_claim','opportunity'].includes(intervention.targetKind)
    ||(intervention.targetKind==='requirement'?!nonempty(intervention.targetRequirementId,200):intervention.targetRequirementId!==null)) return false;
  if (!Array.isArray(r.executionLinks)||r.executionLinks.length>100) return false;
  const linkIds=new Set<string>();
  for (const link of r.executionLinks) {
    if (!link||!['action','commitment'].includes(link.kind)||!nonempty(link.recordId,200)||!iso(link.linkedAt)) return false;
    const key=`${link.kind}:${link.recordId}`;if(linkIds.has(key)) return false;linkIds.add(key);
  }
  return r.supersedesDecisionId===null||nonempty(r.supersedesDecisionId,200);
}
