import { createHash } from 'node:crypto';

// Fictional business, October 2025 through September 2026. Never customer data.
const uuid = key => { const h = createHash('sha256').update(`northstar-qc-v1:${key}`).digest('hex'); return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`; };
const stamp = day => `${day}T09:00:00.000Z`;
const rates = { USD: 1, EUR: 30/26, SGD: 20/26 };
export function buildGlobalB2BYear(months = 12) {
  const accounts=[], opportunities=[], quotes=[], receivables=[], activities=[], portfolio=[],costs=[];
  const monthly=[];
  for(let m=0;m<months;m++) {
    const date=new Date(Date.UTC(2025,9+m,1)), period=date.toISOString().slice(0,7);
    const d=n=>`${period}-${String(n).padStart(2,'0')}`;
    const env={source:'user',isSample:false,createdAt:stamp(d(1)),updatedAt:stamp(d(25))};
    for(let j=0;j<8;j++) {
      const k=m*8+j, accountId=uuid(`account-${k%24}`), currency=['USD','EUR','SGD','USD','EUR','SGD','USD','USD'][j];
      const accountName=`[SIMULATED] ${['US','EU','SG'][k%3]} Buyer ${String(k%24+1).padStart(2,'0')}`;
      if(!accounts.some(a=>a.id===accountId)) accounts.push({...env,id:accountId,accountName,segment:'Industrial',industry:'Manufacturing',location:['United States','Germany','Singapore'][k%3],accountPotential:'High',relationshipStatus:'Developing',keyStakeholders:['Procurement director'],notes:'Fictional QC business. No real customer.',tags:['qc-simulated'],accountCode:`ACC-${String(k%24+1).padStart(4,'0')}`,storageMode:'local'});
      const id=uuid(`deal-${k}`), status=j<4?'Won':j<6?'Lost':'Active', stage=j===7?'Lead':status==='Active'?'Proposal':status;
      const amount=10000+m*1000+j*500;
      const opp={...env,id,accountId,accountName,opportunityName:`[SIMULATED] ${period} Equipment ${j+1}`,stage,status,estimatedValue:amount,currency,closedOn:status==='Active'?'':d(15),expectedClosePeriod:period,productOrSolution:'Pump and monitoring bundle',brand:j%2?'FlowWorks':'SenseWorks',decisionMaker:'Plant director',budgetOwner:'Finance director',procurementPath:'RFQ then PO',technicalCriteria:'Factory acceptance test',evidence:'Fictional evaluation, agreed price and PO',missingContext:j===6?'Buyer approval pending':'',objectionDebt:j===4?'Competitor won on price':'',nextAction:status==='Active'?'Confirm next evaluation':'Review renewal',nextActionDate:d(28),forecastEvidenceCategory:'Defensible',decisionRecommendation:'Monitor',channel:'Direct',storageMode:'local'};
      opportunities.push(opp);
      for(let a=0;a<4;a++) activities.push({...env,id:uuid(`touch-${k}-${a}`),activityDate:d(2+a*5),activityType:['Call','Meeting','Email','Call'][a],activityChannel:'Email',accountName,opportunityName:opp.opportunityName,rawNote:`[SIMULATED] ${period}: RFQ, evaluation, negotiation and follow-up ${a+1}`,summary:`Fictional commercial event ${a+1}`,contactName:'Procurement director',stakeholderName:'',stakeholderRole:'',competitors:[],buyingSignals:[],risks:[],timelineSignals:[],nextActions:[],nextAction:'Confirm buyer next step',dueDate:d(28),tags:['qc-simulated'],linkedOpportunityId:id,linkedOpportunityName:opp.opportunityName,linkedAccountName:accountName,linkStatus:'Linked',storageMode:'local'});
      if(j<4) {
        costs.push({...env,id:uuid(`cost-${k}`),opportunityId:id,amount:amount*.6,currency,freightAmount:amount*.05,dutyAmount:amount*.02,otherAmount:0,extrasCurrency:currency,supplier:'[SIMULATED] Northstar Principal',paymentTerm:'100% on order',deliveryLagDays:3,note:'Fictional landed cost: 60% goods, 5% freight, 2% duty.'});
        for(let rev=0;rev<2;rev++) quotes.push({...env,id:uuid(`quote-${k}-${rev}`),quoteId:`SIM-${period}-${j+1}-R${rev+1}`,opportunityId:id,accountName,opportunityName:opp.opportunityName,title:'[SIMULATED] Equipment PO',amount:rev?amount:amount*1.1,currency,quoteDate:d(rev?15:5),validUntil:d(28),paymentTerm:'100% on order',status:rev?'Accepted':'Rejected',poStatus:rev?'Received':'Not received',deliveryStatus:rev?'Delivered':'Not started',paymentStatus:'Due',paymentDueDate:d(20),expectedDeliveryDate:d(18),nextAction:'Collect payment',notes:'Fictional QC revision; latest accepted quote controls value.'});
        const factor=[1,.3,1.05,0][j];
        const receipts=factor?[.4,.6].map((part,i)=>({id:uuid(`receipt-${k}-${i}`),amount:amount*factor*part,currency,receivedOn:d(i?24:17),method:'Transfer',note:'[SIMULATED] Bank receipt'})):[];
        receivables.push({...env,id:uuid(`receivable-${k}`),opportunityId:id,installments:[],receipts,deliveredOn:d(18),invoicedOn:d(19),note:'Fictional cash record. Not accounting evidence.'});
      }
    }
    monthly.push({period,scenario:['First RFQs and qualification','Repeat orders','Lost deals and revised quotes','Overdue collections','EU partial payments','SG overpayments','Delivery follow-ups','Portfolio classification','Renewal discussions','Quarterly cash review','Duplicate and missing-data probes','Year-end reporting'][m]});
  }
  const at=stamp('2025-10-01'), envelope={schemaVersion:1,version:1,source:'user',isSample:false,createdAt:at,updatedAt:at,history:[]};
  for(const brand of ['FlowWorks','SenseWorks']) portfolio.push({...envelope,id:uuid(brand),kind:'brand',name:`[SIMULATED] ${brand}`,code:brand,description:'Fictional catalog',status:'active',parentId:null,brandId:null,groupId:null,aliases:[]});
  for(const o of opportunities) portfolio.push({...envelope,id:uuid(`map-${o.id}`),kind:'assignment',opportunityId:o.id,businessUnitId:null,brandId:uuid(o.brand),groupId:null,productId:null,originalBrand:o.brand,originalProduct:o.productOrSolution});
  // Independent expected figures use the scenario's declared rates, not Memoire calculators.
  const cv=o=>o.estimatedValue*rates[o.currency];
  const won=opportunities.filter(o=>o.status==='Won'), active=opportunities.filter(o=>o.status==='Active'&&o.stage!=='Lead');
  const cash=won.map((o,i)=>({value:cv(o),paid:cv(o)*[1,.3,1.05,0][i%4]}));
  const oracle={qualified:months*7,leads:months,wonCount:months*4,lostCount:months*2,pipeline:active.reduce((s,o)=>s+cv(o),0),won:won.reduce((s,o)=>s+cv(o),0),orderCount:cash.length,orderValue:cash.reduce((s,o)=>s+o.value,0),received:cash.reduce((s,o)=>s+o.paid,0),outstanding:cash.reduce((s,o)=>s+Math.max(0,o.value-o.paid),0),overpaid:cash.reduce((s,o)=>s+Math.max(0,o.paid-o.value),0),winRate:2/3};
  oracle.landedCost=oracle.orderValue*.67;oracle.grossMargin=oracle.orderValue*.33;oracle.marginPct=33;
  return {business:'Northstar Industrial Supply',fictional:true,period:'2025-10 to 2026-09',monthly,accounts,opportunities,quotes,receivables,activities,portfolio,costs,oracle};
}
