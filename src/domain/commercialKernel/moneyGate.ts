import {isValidBusinessDate} from '../../utils/safeDate.ts';
import type {SourceMetadata} from './types.ts';
import type {OutcomeRequirement} from './outcomeRequirement.ts';
import type {CrmLiteOpportunity} from '../../services/opportunityStore.ts';
import type {QuoteRecord} from '../../services/quoteStore.ts';

export const moneySourceTypes=['opportunity_value','quote_value'] as const;
export type MoneySourceType=typeof moneySourceTypes[number];
export const moneyGateBasisKinds=['customer_process','contractual_requirement','operator_confirmed_structure'] as const;
export type MoneyGateBasisKind=typeof moneyGateBasisKinds[number];

/** A bounded, operator-confirmed structural link. Amount and currency always
 * remain on the referenced canonical source. */
export type CommercialMoneyGate=SourceMetadata&{
  id:string;userId:string|null;opportunityId:string;moneySourceType:MoneySourceType;moneySourceId:string;
  requirementId:string;basisKind:MoneyGateBasisKind;basis:string;lifecycle:'active'|'retired';
  createdAt:string;updatedAt:string;isSample?:boolean;
};
const text=(value:unknown):value is string=>typeof value==='string'&&value.trim().length>0;
const instant=(value:unknown):value is string=>text(value)&&/^\d{4}-\d{2}-\d{2}T/.test(value)
  &&isValidBusinessDate(value.slice(0,10))&&Number.isFinite(Date.parse(value));
export function isCommercialMoneyGate(value:unknown):value is CommercialMoneyGate{
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const row=value as CommercialMoneyGate;
  return text(row.id)&&row.id.length<=200&&(row.userId===null||text(row.userId))&&text(row.opportunityId)
    &&moneySourceTypes.includes(row.moneySourceType)&&text(row.moneySourceId)&&text(row.requirementId)
    &&moneyGateBasisKinds.includes(row.basisKind)&&text(row.basis)&&row.basis.length<=1000
    &&['active','retired'].includes(row.lifecycle)&&row.sourceType==='manual'
    &&(row.sourceId==null||typeof row.sourceId==='string')&&(row.sourceUrl==null||typeof row.sourceUrl==='string')
    &&(row.sourceUpdatedAt==null||instant(row.sourceUpdatedAt))&&instant(row.createdAt)&&instant(row.updatedAt)
    &&Date.parse(row.updatedAt)>=Date.parse(row.createdAt);
}
export type MoneyGateReferences={opportunities:CrmLiteOpportunity[];quotes:QuoteRecord[];requirements:OutcomeRequirement[]};
export function validateMoneyGates(gates:CommercialMoneyGate[],refs:MoneyGateReferences):void{
  const opportunities=new Map(refs.opportunities.map(row=>[row.id,row]));
  const quotes=new Map(refs.quotes.map(row=>[row.id,row]));
  const requirements=new Map(refs.requirements.map(row=>[row.id,row]));
  const ids=new Set<string>(),active=new Set<string>();
  for(const gate of gates){
    if(!isCommercialMoneyGate(gate))throw new Error('Invalid Money Gate.');
    if(ids.has(gate.id))throw new Error('Duplicate Money Gate identity.');ids.add(gate.id);
    const opportunity=opportunities.get(gate.opportunityId),requirement=requirements.get(gate.requirementId);
    if(!opportunity||!requirement||(opportunity.userId??null)!==gate.userId||requirement.userId!==gate.userId
      ||requirement.opportunityId!==gate.opportunityId||Boolean(opportunity.isSample)!==Boolean(gate.isSample)
      ||Boolean(requirement.isSample)!==Boolean(gate.isSample))throw new Error('Money Gate endpoints must belong to one Opportunity and workspace.');
    if(gate.moneySourceType==='opportunity_value'&&gate.moneySourceId!==opportunity.id)
      throw new Error('Opportunity value Gate must reference its Opportunity.');
    if(gate.moneySourceType==='quote_value'){
      const quote=quotes.get(gate.moneySourceId);
      if(!quote||quote.opportunityId!==gate.opportunityId||Boolean(quote.isSample)!==Boolean(gate.isSample))
        throw new Error('Quote value Gate must reference a Quote on this Opportunity.');
    }
    if(gate.lifecycle!=='active')continue;
    if(requirement.lifecycle!=='active')throw new Error('Only an active Requirement can receive a Money Gate.');
    const key=`${gate.userId}:${gate.moneySourceType}:${gate.moneySourceId}`;
    if(active.has(key))throw new Error('This money source already has an active Money Gate.');active.add(key);
  }
}
