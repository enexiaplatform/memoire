import {performance} from 'node:perf_hooks';
import {composeHistoricalSourcesAt} from '../src/services/historicalQuery.ts';
import {composeCommercialStateAsOf} from '../src/services/commercialTimeMachine.ts';

const scope='benchmark-owner',at='2026-09-20T00:00:00Z';
const revisions=[];
const add=(entityType,state)=>revisions.push({id:`revision-${entityType}-${state.id}`,scope,entityType,
  entityId:state.id,revisionNo:1,mutationId:`mutation-${entityType}-${state.id}`,operation:'baseline',
  recordedAt:at,schemaVersion:1,state});
add('opportunities',{id:'o',userId:scope,accountId:'a',accountName:'Account',opportunityName:'Renewal',
  stage:'Qualification',status:'Active',expectedClosePeriod:'2026-09-30',forecastEvidenceCategory:'Defensible',
  createdAt:at,updatedAt:at});
for(let index=0;index<12;index++){
  const id=String(index);
  add('commercial_evidence',{id:`e${id}`,userId:scope,accountId:'a',opportunityId:'o',
    category:'technical_outcome',direction:'positive',summary:`Evidence ${id}`,evidenceText:`Customer accepted source ${id}`,
    observedAt:'2026-09-18',recordedAt:at,sourceType:'email',createdAt:at,updatedAt:at,providedBy:'customer'});
  add('commercial_conditions',{id:`c${id}`,userId:scope,accountId:'a',opportunityId:'o',statement:`Condition ${id}`,
    conditionCategory:'technical',intent:'hypothesis',lifecycle:'active',sourceType:'manual',createdAt:at,updatedAt:at,
    evidenceLinks:[{evidenceId:`e${id}`,assessment:'supports',recordedAt:at}]});
  add('commercial_outcome_requirements',{id:`r${id}`,userId:scope,accountId:'a',opportunityId:'o',
    expectedOutcome:`Outcome ${id}`,question:`Confirm outcome ${id}?`,conditionId:`c${id}`,
    role:index===0?'required_now':'required_later',lifecycle:'active',sourceType:'manual',createdAt:at,updatedAt:at});
  if(index<11)add('commercial_dependencies',{id:`d${id}`,userId:scope,opportunityId:'o',
    dependentRequirementId:`r${id}`,prerequisiteRequirementId:`r${index+1}`,basis:'Needed first',
    lifecycle:'active',sourceType:'manual',createdAt:at,updatedAt:at});
}
const timingBase={userId:scope,opportunityId:'o',requirementId:'r0',basis:'Signed process',lifecycle:'active',
  sourceType:'manual',createdAt:at,updatedAt:at,evidenceId:null,commitmentId:null};
add('commercial_timing_assertions',{...timingBase,id:'anchor',kind:'target_anchor',durationDays:null,
  durationUnit:null,epistemic:null,sourceKind:null,sourceReference:null});
add('commercial_timing_assertions',{...timingBase,id:'duration',kind:'duration',durationDays:3,
  durationUnit:'calendar_days',epistemic:'supported',sourceKind:'contract',sourceReference:'Signed process'});
for(let index=0;index<3;index++)add('commercial_commitments',{id:`promise${index}`,userId:scope,
  threadId:'thread',accountId:'a',accountName:'Account',opportunityId:'o',commitmentParty:'customer',
  ownerLabel:'Buyer',commitmentText:`Send item ${index}`,originalDueDate:'2026-09-25',currentDueDate:'2026-09-25',
  silenceThresholdDays:3,status:'open',impactType:'none',dueDateHistory:[],createdAt:at,updatedAt:at});
const markers=[{scope,historyGuaranteedFrom:at,schemaVersion:1}];
const cutoff='2026-09-21T12:00:00Z';
const decisions=[0,1].map(index=>({id:`decision${index}`,userId:scope,accountId:'a',opportunityId:'o',
  decidedAt:at,question:`Decision ${index}`,selectedOptionId:'option',options:[{id:'option',label:'Wait'}],
  executionLinks:[],basisSnapshot:{capturedAt:at,forecast:{verdict:'conditional'}}}));
const start=performance.now();
const sources=composeHistoricalSourcesAt(revisions,markers,scope,cutoff);
const sourceMs=performance.now()-start;
const derived=composeCommercialStateAsOf({sources,scope,opportunityId:'o',cutoff,timeZone:'Asia/Ho_Chi_Minh',
  decisions,activities:[]});
const totalMs=performance.now()-start;
if(derived.status!=='available'||derived.coverage.forecastDefensibility!=='full')throw new Error('Historical composition failed');
console.log(JSON.stringify({conditions:12,evidence:12,requirements:12,dependencies:11,timingAssertions:2,
  commitments:3,decisions:2,revisions:revisions.length,
  payloadBytes:Buffer.byteLength(JSON.stringify({revisions,decisions})),
  sourceMs:Number(sourceMs.toFixed(1)),totalMs:Number(totalMs.toFixed(1)),
  cloudReadShape:'coverage + paged owner revisions + scoped Decisions; no per-entity queries'}));
