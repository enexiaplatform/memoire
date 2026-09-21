import {performance} from 'node:perf_hooks';
import {deriveMoneyConsequences} from '../src/domain/commercialKernel/deriveMoneyConsequences.ts';
import {activateLocalHistoricalIntegrity} from '../src/services/historicalIntegrity.ts';
import {getLocalHistoricalSourcesAt} from '../src/services/historicalQuery.ts';
import {composeCommercialStateAsOf} from '../src/services/commercialTimeMachine.ts';
class Storage{data=new Map();getItem(key){return this.data.get(key)??null;}setItem(key,value){this.data.set(key,String(value));}removeItem(key){this.data.delete(key);}}
const at='2026-09-20T00:00:00.000Z',opportunities=[],requirements=[],dependencies=[],gates=[];
for(let i=0;i<300;i++){
  const opportunityId=`o-${i}`;
  opportunities.push({id:opportunityId,userId:'u',accountId:`a-${i}`,accountName:`Account ${i}`,opportunityName:`Opportunity ${i}`,
    stage:'Proposal',status:'Active',estimatedValue:1_000_000+i,currency:i%2?'VND':'USD',expectedClosePeriod:'2026-10-30',
    forecastEvidenceCategory:'Defensible',createdAt:at,updatedAt:at});
  for(let j=0;j<3;j++)requirements.push({id:`r-${i}-${j}`,userId:'u',accountId:`a-${i}`,opportunityId,expectedOutcome:`Requirement ${j}`,
    question:`Confirm ${j}`,conditionId:null,role:j===0?'required_now':'context',lifecycle:'active',sourceType:'manual',createdAt:at,updatedAt:at});
  dependencies.push({id:`d-${i}-0`,userId:'u',opportunityId,dependentRequirementId:`r-${i}-0`,prerequisiteRequirementId:`r-${i}-1`,
    basis:'Buyer prerequisite',lifecycle:'active',sourceType:'manual',createdAt:at,updatedAt:at});
  gates.push({id:`g-${i}`,userId:'u',opportunityId,moneySourceType:'opportunity_value',moneySourceId:opportunityId,
    requirementId:`r-${i}-0`,basisKind:'customer_process',basis:'Buyer process',lifecycle:'active',sourceType:'manual',sourceId:null,
    sourceUrl:null,sourceUpdatedAt:null,createdAt:at,updatedAt:at});
}
const input={opportunities,quotes:[],gates,requirements,conditions:[],evidence:[],dependencies,timingAssertions:[],commitments:[],
  today:'2026-09-20',calculatedAt:at};
for(let i=0;i<3;i++)deriveMoneyConsequences(input);
let start=performance.now();const portfolio=deriveMoneyConsequences(input);const portfolioMs=performance.now()-start;
start=performance.now();deriveMoneyConsequences({...input,opportunities:[opportunities[0]],gates:[gates[0]],requirements:requirements.slice(0,3),dependencies:[dependencies[0]]});
const opportunityMs=performance.now()-start;
const storage=new Storage();
storage.setItem('memoire.opportunities.v1',JSON.stringify(opportunities));storage.setItem('memoire.outcomeRequirements.v1',JSON.stringify(requirements));
storage.setItem('memoire.commercialDependencies.v1',JSON.stringify(dependencies));storage.setItem('memoire.commercialMoneyGates.v1',JSON.stringify(gates));
activateLocalHistoricalIntegrity('u',storage,()=>at);
start=performance.now();const sources=getLocalHistoricalSourcesAt('u','2026-09-21T00:00:00Z',storage);
const historical=composeCommercialStateAsOf({sources,scope:'u',opportunityId:'o-0',cutoff:'2026-09-21T00:00:00Z',timeZone:'UTC'});
const historicalMs=performance.now()-start;
const payloadBytes=Buffer.byteLength(JSON.stringify({opportunities,requirements,dependencies,gates}));
console.log(JSON.stringify({opportunities:300,requirements:requirements.length,dependencies:dependencies.length,gates:gates.length,
  consequenceRows:portfolio.consequences.length,payloadBytes,opportunityMs:Number(opportunityMs.toFixed(1)),portfolioMs:Number(portfolioMs.toFixed(1)),
  historicalMs:Number(historicalMs.toFixed(1)),historicalRows:historical.moneyConsequences?.consequences.length||0}));
