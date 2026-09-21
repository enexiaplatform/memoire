import type {CrmLiteOpportunity} from '../../services/opportunityStore.ts';
import type {QuoteRecord} from '../../services/quoteStore.ts';
import type {CommercialCondition} from './commercialCondition.ts';
import type {CommercialEvidence} from './commercialEvidence.ts';
import {deriveKnownBlockers,type CommercialDependency} from './commercialDependency.ts';
import {deriveForecastDefensibility} from './deriveForecastDefensibility.ts';
import type {CommercialTimingAssertion} from './commercialTiming.ts';
import {projectOutcomeRequirements,type OutcomeRequirement} from './outcomeRequirement.ts';
import type {CommercialCommitment} from './types.ts';
import {validateMoneyGates,type CommercialMoneyGate,type MoneySourceType} from './moneyGate.ts';

export type MoneyRealizationState='potential'|'quoted'|'ordered'|'delivered'|'receivable'|'cash_due'|'cash_received';
export type MoneyConsequenceKind='gated'|'timing_unsupported'|'timing_incomplete'|'overdue'|'realized'|'no_current_blocker';
export type MoneyBlocker={requirementId:string;label:string;state:string;paths:{requirementIds:string[];dependencyIds:string[]}[]};
export type MoneyConsequence={moneySourceId:string;moneySourceType:MoneySourceType|'receivable';opportunityId:string;
  amount:number;currency:string;realizationState:MoneyRealizationState;linkedRequirementId:string|null;
  blockers:MoneyBlocker[];timingState:'supported'|'conditional'|'unsupported'|'incomplete'|'not_applicable';
  consequenceKinds:MoneyConsequenceKind[];reasonCodes:string[];sourceRecordIds:string[];economicIdentityKey:string;
  daysOverdue:number|null;calculatedAt:string;coverage:'full'|'partial'};
export type MoneyContext={opportunityId:string;amount:number;currency:string;blockerLabels:string[];explicitlyGated:boolean};
/** A reporting-currency receivable fact supplied by the existing collections
 * model. Keeping the normalized currency beside the normalized amount avoids
 * relabelling a converted base amount with an order currency. */
export type MoneyReceivableFact={sourceId:string;opportunityId:string;outstandingAmount:number;
  overdueAmount:number;daysOverdue:number;currency:string;settled:boolean};
export type MoneyConsequenceProjection={contexts:MoneyContext[];consequences:MoneyConsequence[];coverage:'full'|'partial';
  gaps:string[];calculatedAt:string};
export type MoneyConsequenceInput={opportunities:CrmLiteOpportunity[];quotes:QuoteRecord[];gates:CommercialMoneyGate[];
  requirements:OutcomeRequirement[];conditions:CommercialCondition[];evidence:CommercialEvidence[];
  dependencies:CommercialDependency[];timingAssertions:CommercialTimingAssertion[];commitments:CommercialCommitment[];
  receivables?:MoneyReceivableFact[];today:string;calculatedAt:string;historicalQuoteCoverage?:'full'|'partial'|'unavailable'};

const quoteState=(quote:QuoteRecord):MoneyRealizationState=>quote.paymentStatus==='Paid'?'cash_received'
  :quote.paymentStatus==='Due'?'cash_due':quote.deliveryStatus==='Delivered'?'delivered'
    :quote.poStatus==='Received'?'ordered':'quoted';
const unique=<T,>(values:T[])=>[...new Set(values)];

/** One pure M9 rule set for current and historical callers. */
export function deriveMoneyConsequences(input:MoneyConsequenceInput):MoneyConsequenceProjection{
  validateMoneyGates(input.gates,{opportunities:input.opportunities,quotes:input.quotes,requirements:input.requirements});
  const opportunities=new Map(input.opportunities.map(row=>[row.id,row])),quotes=new Map(input.quotes.map(row=>[row.id,row]));
  const readings=projectOutcomeRequirements(input.requirements,input.conditions,input.evidence);
  const byOpportunity=<T extends {opportunityId?:string|null}>(rows:T[])=>{const map=new Map<string,T[]>();for(const row of rows){if(!row.opportunityId)continue;const list=map.get(row.opportunityId)||[];list.push(row);map.set(row.opportunityId,list);}return map;};
  const requirementByOpportunity=byOpportunity(input.requirements),dependencyByOpportunity=byOpportunity(input.dependencies);
  const timingByOpportunity=byOpportunity(input.timingAssertions),commitmentByOpportunity=byOpportunity(input.commitments);
  const readingByOpportunity=new Map<string,typeof readings>();
  for(const reading of readings){const key=reading.requirement.opportunityId,list=readingByOpportunity.get(key)||[];list.push(reading);readingByOpportunity.set(key,list);}
  const activeGates=input.gates.filter(gate=>gate.lifecycle==='active');
  const contexts:MoneyContext[]=input.opportunities.filter(row=>row.status==='Active'&&typeof row.estimatedValue==='number')
    .map(opportunity=>{const blockers=deriveKnownBlockers(opportunity.id,readingByOpportunity.get(opportunity.id)||[],dependencyByOpportunity.get(opportunity.id)||[]);
      return {opportunityId:opportunity.id,amount:opportunity.estimatedValue!,currency:opportunity.currency,
        blockerLabels:blockers.integrity==='valid'?blockers.blockers.map(row=>row.reading.requirement.expectedOutcome):[],
        explicitlyGated:activeGates.some(gate=>gate.moneySourceType==='opportunity_value'&&gate.moneySourceId===opportunity.id)};});
  const consequences:MoneyConsequence[]=[];
  for(const gate of activeGates){
    const opportunity=opportunities.get(gate.opportunityId)!;
    const quote=gate.moneySourceType==='quote_value'?quotes.get(gate.moneySourceId):null;
    const amount=gate.moneySourceType==='opportunity_value'?opportunity.estimatedValue:quote?.amount;
    const currency=gate.moneySourceType==='opportunity_value'?opportunity.currency:quote?.currency;
    const realization=quote?quoteState(quote):'potential';
    if(typeof amount!=='number'||!Number.isFinite(amount)||amount<0||!currency)continue;
    if(gate.moneySourceType==='opportunity_value'&&opportunity.status!=='Active')continue;
    if(quote&&!['Sent','Revised','Accepted'].includes(quote.status))continue;
    if(realization==='cash_received'){
      consequences.push({moneySourceId:gate.moneySourceId,moneySourceType:gate.moneySourceType,opportunityId:gate.opportunityId,
        amount,currency,realizationState:realization,linkedRequirementId:gate.requirementId,blockers:[],timingState:'not_applicable',
        consequenceKinds:['realized'],reasonCodes:['SOURCE_REALIZED'],sourceRecordIds:unique([gate.id,gate.moneySourceId,gate.requirementId]),
        economicIdentityKey:gate.opportunityId,daysOverdue:null,calculatedAt:input.calculatedAt,
        coverage:gate.moneySourceType==='quote_value'&&input.historicalQuoteCoverage&&input.historicalQuoteCoverage!=='full'?'partial':'full'});
      continue;
    }
    const blockers=deriveKnownBlockers(gate.opportunityId,readingByOpportunity.get(gate.opportunityId)||[],dependencyByOpportunity.get(gate.opportunityId)||[],[gate.requirementId]);
    if(blockers.integrity!=='valid')throw new Error(`Money Gate dependency graph has ${blockers.integrity}.`);
    const forecast=deriveForecastDefensibility({opportunity,requirements:requirementByOpportunity.get(gate.opportunityId)||[],
      conditions:input.conditions,evidence:input.evidence,dependencies:dependencyByOpportunity.get(gate.opportunityId)||[],
      timingAssertions:timingByOpportunity.get(gate.opportunityId)||[],commitments:commitmentByOpportunity.get(gate.opportunityId)||[],
      today:input.today,calculatedAt:input.calculatedAt});
    const timingState=forecast.timingEvaluation==='unsupported'?'unsupported':forecast.timingEvaluation==='incomplete'?'incomplete'
      :forecast.timingEvaluation==='conditional'?'conditional':forecast.timingEvaluation==='supported'?'supported':'not_applicable';
    const gateBlockers=blockers.blockers.map(item=>({requirementId:item.reading.requirement.id,
      label:item.reading.requirement.expectedOutcome,state:item.reading.resolution,
      paths:item.paths.map(path=>({requirementIds:path.requirementIds,dependencyIds:path.dependencyIds}))}));
    const kinds:MoneyConsequenceKind[]=[gateBlockers.length?'gated':'no_current_blocker'];
    if(timingState==='unsupported')kinds.push('timing_unsupported');else if(timingState==='incomplete')kinds.push('timing_incomplete');
    consequences.push({moneySourceId:gate.moneySourceId,moneySourceType:gate.moneySourceType,opportunityId:gate.opportunityId,
      amount,currency,realizationState:realization,linkedRequirementId:gate.requirementId,blockers:gateBlockers,timingState,
      consequenceKinds:kinds,reasonCodes:unique([gateBlockers.length?'EXPLICIT_GATE_BLOCKED':'EXPLICIT_GATE_CLEAR',
        ...(timingState==='unsupported'?['LINKED_TIMING_UNSUPPORTED']:timingState==='incomplete'?['LINKED_TIMING_INCOMPLETE']:[])]),
      sourceRecordIds:unique([gate.id,gate.moneySourceId,gate.requirementId,...gateBlockers.flatMap(b=>b.paths.flatMap(p=>p.dependencyIds))]),
      economicIdentityKey:gate.opportunityId,daysOverdue:null,calculatedAt:input.calculatedAt,
      coverage:gate.moneySourceType==='quote_value'&&input.historicalQuoteCoverage&&input.historicalQuoteCoverage!=='full'?'partial':'full'});
  }
  for(const receivable of input.receivables||[]){
    if(receivable.settled||receivable.outstandingAmount<=0)continue;
    const kinds:MoneyConsequenceKind[]=receivable.overdueAmount>0?['overdue']:[];
    if(!kinds.length)continue;
    consequences.push({moneySourceId:receivable.sourceId,moneySourceType:'receivable',opportunityId:receivable.opportunityId,
      amount:receivable.outstandingAmount,currency:receivable.currency,realizationState:'receivable',linkedRequirementId:null,
      blockers:[],timingState:'not_applicable',consequenceKinds:kinds,reasonCodes:['RECEIVABLE_OVERDUE'],
      sourceRecordIds:[receivable.sourceId],economicIdentityKey:receivable.opportunityId,daysOverdue:Math.max(0,receivable.daysOverdue),
      calculatedAt:input.calculatedAt,coverage:'full'});
  }
  const partial=consequences.some(row=>row.coverage==='partial');
  return {contexts,consequences,coverage:partial?'partial':'full',gaps:partial?['Mutable Quote history is not revision-covered.']:[],calculatedAt:input.calculatedAt};
}

export type MoneyAggregate={currency:string;amount:number;sourceCount:number}|{currency:string;amount:null;sourceCount:number;reason:'duplicate_or_unknown_economic_identity'};
/** Conservative totals: a repeated economic identity makes that currency unavailable instead of choosing or summing a lifecycle row. */
export function aggregateMoneyConsequences(rows:MoneyConsequence[]):MoneyAggregate[]{
  const byCurrency=new Map<string,MoneyConsequence[]>();
  for(const row of rows.filter(item=>item.consequenceKinds.includes('gated')||item.consequenceKinds.includes('overdue'))){const list=byCurrency.get(row.currency)||[];list.push(row);byCurrency.set(row.currency,list);}
  return [...byCurrency.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([currency,items])=>{
    const identities=items.map(item=>item.economicIdentityKey);
    if(new Set(identities).size!==identities.length)return {currency,amount:null,sourceCount:items.length,reason:'duplicate_or_unknown_economic_identity' as const};
    return {currency,amount:items.reduce((sum,item)=>sum+item.amount,0),sourceCount:items.length};
  });
}

/** Adds factual context to an existing recommendation without creating a new
 * priority or changing its rank. Today and Review therefore share M9 while the
 * existing attention policy remains in control. */
export function attachMoneyConsequenceContext<T extends {opportunityId?:string|null;requirementId?:string;
  reasonText:string;sourceRecordIds:string[]}>(recommendations:T[],projection:MoneyConsequenceProjection):T[]{
  return recommendations.map(recommendation=>{
    const related=projection.consequences.filter(row=>row.opportunityId===recommendation.opportunityId
      &&(recommendation.requirementId?row.blockers.some(blocker=>blocker.paths.some(path=>path.requirementIds.includes(recommendation.requirementId!))):row.timingState==='unsupported'));
    if(!related.length)return recommendation;
    const labels=unique(related.map(row=>`${row.amount.toLocaleString('en-US')} ${row.currency} ${row.moneySourceType==='quote_value'?'quote value':'commercial value'}`));
    return {...recommendation,reasonText:`${recommendation.reasonText} Linked downstream: ${labels.join('; ')}.`,
      sourceRecordIds:unique([...recommendation.sourceRecordIds,...related.flatMap(row=>row.sourceRecordIds)])};
  });
}
