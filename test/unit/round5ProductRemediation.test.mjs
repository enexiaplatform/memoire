import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {registerHooks} from 'node:module';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import '../support/reportingCurrency.mjs';
localStorage.setItem('memoire_reporting_currency','USD');
registerHooks({resolve(specifier,context,next){if(specifier.startsWith('.')&&!/\.[a-z]+$/i.test(specifier)){const url=new URL(specifier+'.ts',context.parentURL);if(existsSync(fileURLToPath(url)))return next(url.href,context);}return next(specifier,context);},load(url,context,next){if(url.endsWith('/lib/supabaseClient.ts'))return {format:'module',shortCircuit:true,source:'export const supabaseClient=null;export const isPipelineSupabaseConfigured=false;'};return next(url,context);}});
const {buildWeeklyBusinessReview}=await import('../../src/utils/weeklyBusinessReview.ts');
const {buildCommercialReviewBrief}=await import('../../src/utils/commercialReviewBrief.ts');
const {generateRevenueRiskBriefMarkdown}=await import('../../src/utils/revenueRiskBrief.ts');
const {buildCommercialJourneySnapshot}=await import('../../src/utils/commercialJourney.ts');
const {editCaptureDraft,applyCaptureActionCorrection}=await import('../../src/utils/captureDraftEdit.ts');
const {matchingAccountContacts}=await import('../../src/utils/stakeholderIdentity.ts');
const {buildPlanCompletionActivity,planCompletionNeedsPerson}=await import('../../src/utils/planCompletionLog.ts');
const {derivePlanCommitments,splitCommitmentsByBoard}=await import('../../src/domain/commercialKernel/derivePlanCommitments.ts');
const {createOrderReceivableRecord,createPaymentReceipt}=await import('../../src/utils/receivables.ts');
const today='2026-10-07';
const opportunity={id:'won',accountId:'a',accountName:'Orion',opportunityName:'Renewal',status:'Won',stage:'Won',currency:'USD',estimatedValue:1000,closedOn:'2026-09-01',createdAt:'2026-09-01',updatedAt:'2026-09-01'};
const quote={id:'q',quoteId:'Q',opportunityId:'won',accountName:'Orion',opportunityName:'Renewal',title:'Renewal',status:'Accepted',amount:1000,currency:'USD',quoteDate:'2026-09-01',createdAt:'2026-09-01',updatedAt:'2026-09-01',paymentTerm:'Net 30',paymentDueDate:'2026-09-30',paymentStatus:'Due',poStatus:'Pending',deliveryStatus:'Not scheduled',nextAction:'',validUntil:''};
const record=amount=>createOrderReceivableRecord({opportunityId:'won',receipts:[createPaymentReceipt({id:'paid',amount,currency:'USD',receivedOn:'2026-10-01'})]});
const reviewInput=amount=>({opportunities:[opportunity],quotes:[quote,{...quote,id:'rejected',status:'Rejected',amount:95000}],receivableRecords:[record(amount)],milestoneRecords:[],operatingContexts:[],activities:[],opportunityOutcomes:[],accounts:[],period:{start:'2026-10-05',end:'2026-10-11'},periodLabel:'Oct 5–11',today});
test('paid and overpaid orders cannot become Review collection priorities or overdue risk brief claims',()=>{
 for(const amount of [1000,1200]){
  const input=reviewInput(amount),review=buildWeeklyBusinessReview(input);
  assert.equal(review.moneyFlow.threads.length,1);assert.equal(review.moneyFlow.threads[0].stage,'Paid');assert.equal(review.moneyFlow.stuckThreads.length,0);
  assert.equal(review.moneyFlow.totalInMotionBase,0);assert(!review.nextWeekPriorities.some(priority=>priority.label.includes('Unstick the money')));
  const brief=generateRevenueRiskBriefMarkdown(input);assert(!brief.includes('Payment overdue'));assert(!brief.includes('95,000'));
  const commercial=buildCommercialReviewBrief({...input,periodLabel:'This week',executionReview:{nextWeekFocus:[]}});
  assert.equal(commercial.metrics.find(metric=>metric.label==='Pending PO').value,'0 USD');
  assert.equal(commercial.metrics.find(metric=>metric.label==='At-risk money').value,'0 USD');
 }
 const partial=buildWeeklyBusinessReview(reviewInput(400));assert.equal(partial.moneyFlow.threads[0].amount,600);assert.equal(partial.moneyFlow.totalInMotionBase,600);assert.equal(partial.moneyFlow.stuckThreads.length,1);
});
test('deal position uses canonical receipts and cannot borrow another deal on the same account',()=>{
 const input=reviewInput(1200);
 const position=buildCommercialJourneySnapshot({...input,opportunity,objections:[],quotes:[{...quote,id:'other',opportunityId:'other',amount:88000},...input.quotes]});
 assert.equal(position.position,'Paid');assert(!position.moneyStatus.includes('88000'));
});
test('editing or clearing the first capture action updates its structured copy and preserves additional actions',()=>{
 const draft={accountName:'Orion',opportunityName:'',activityType:'Follow-up',summary:'note',rawNote:'source',nextAction:'Send old pack',dueDate:'2026-10-08',nextActions:[{title:'Send old pack',dueDate:'2026-10-08'},{title:'Book meeting',dueDate:'2026-10-12'}],tags:[]};
 const edited=editCaptureDraft(draft,'nextAction','Send reviewed pack');assert.equal(edited.nextActions[0].title,'Send reviewed pack');assert.equal(edited.nextActions.length,2);assert.equal(draft.nextActions[0].title,'Send old pack');
 const dated=editCaptureDraft(edited,'dueDate','2026-10-09');assert.equal(dated.nextActions[0].dueDate,'2026-10-09');assert.equal(dated.nextActions[1].dueDate,'2026-10-12');
 const cleared=editCaptureDraft(dated,'nextAction','');assert.equal(cleared.nextAction,'Book meeting');assert.equal(cleared.dueDate,'2026-10-12');assert.equal(cleared.nextActions.length,1);
});
test('the fact review carries the confirmed action correction while preserving raw evidence and separate promises',()=>{
 const original={nextAction:'Send old pack',dueDate:'2026-10-09'},reviewed={nextAction:'Send reviewed pack',dueDate:'2026-10-12'};
 const first={id:'first',kind:'commitment',party:'self',text:'Send old pack',dueDate:'2026-10-09',evidence:'I will send old pack.',status:'proposed'};
 const other={...first,id:'other',text:'Call tomorrow'},customer={...first,id:'customer',party:'customer'};
 const set={facts:[first,other,customer],rawCapture:'Original raw note'};
 const result=applyCaptureActionCorrection(set,original,reviewed);
 assert.equal(result.facts[0].text,reviewed.nextAction);assert.equal(result.facts[0].dueDate,reviewed.dueDate);assert.equal(result.facts[0].evidence,first.evidence);
 assert.deepEqual(result.facts.slice(1),[other,customer]);assert.equal(result.rawCapture,set.rawCapture);
 assert.equal(applyCaptureActionCorrection(set,original,{...reviewed,nextAction:''}).facts[0].status,'ignored');
 assert.equal(applyCaptureActionCorrection({...set,facts:[first,{...first,id:'ambiguous'}]},original,reviewed).facts[0].text,first.text);
 const multiple={...original,nextActions:[{title:original.nextAction},{title:other.text}]};
 const removed=editCaptureDraft(multiple,'nextAction','');
 const cleared=applyCaptureActionCorrection(set,multiple,removed);assert.equal(cleared.facts[0].status,'ignored');assert.deepEqual(cleared.facts[1],other);
});
test('contact reuse is limited to one matching person in the same account, owner, title and sample scope',()=>{
 const person={id:'p',userId:'a',accountId:'customer',accountName:'Orion',name:'Casey Morgan',roleTitle:'Quality Director',stakeholderRole:'Technical Buyer'};
 const input={userId:'a',accountId:'customer',accountName:'Orion',name:'casey morgan',roleTitle:'Quality Director',isSample:false};
 assert.deepEqual(matchingAccountContacts([person,{...person,id:'foreign',userId:'b'},{...person,id:'demo',isSample:true},{...person,id:'otherAccount',accountId:'else'}],input),[person]);
 assert.equal(matchingAccountContacts([person,{...person,id:'duplicate'}],input).length,2);
 assert.equal(matchingAccountContacts([person],{...input,roleTitle:'Finance Director'}).length,0);
});
test('account-linked Desk work saves preparation without inventing a customer or person interaction',()=>{
 const item={id:'p',kind:'personal',workKind:'customer',tag:'Orion',label:'Prepare pack',date:today,channel:'Desk work',href:'/app/accounts?accountName=Orion'};
 assert.equal(planCompletionNeedsPerson(item,[]),false);
 const log=buildPlanCompletionActivity({item,note:'Prepared a fictional pack',opportunities:[],activityDate:today,person:{name:'Not actually met'}});
 assert.equal(log.accountName,'Orion');assert.equal(log.activity.stakeholderName,'');assert.equal(log.activity.contactName,'');assert.equal(log.activity.activityChannel,'Desk work');
 assert.equal(buildPlanCompletionActivity({item:{...item,channel:'Phone call'},note:'Called',opportunities:[],activityDate:today}),null);
});
test('hidden overdue backlog is never counted as already shown on the current board',()=>{
 const items=derivePlanCommitments({planItems:[{id:'p',label:'Old pack',tag:'Orion',date:'2025-10-09',done:false,kind:'personal',workKind:'customer',channel:'Desk work'}]});
 assert.equal(items.length,1);
 const range={start:'2026-10-05',end:'2026-10-11',today,includeOverdueBacklog:false};
 assert.equal(splitCommitmentsByBoard(items,range).onBoard.length,0);
 assert.equal(splitCommitmentsByBoard(items,{...range,includeOverdueBacklog:true}).onBoard.length,1);
});
test('datetime-local preserves repeated edits in UTC+7 and a DST timezone, and rejects DST gaps',()=>{
 const url=new URL('../../src/utils/localDateTime.ts',import.meta.url).href;
 const code=`import {instantToLocalInput,localInputToInstant} from ${JSON.stringify(url)};let instant=localInputToInstant('2026-07-01T18:38');for(let n=0;n<10;n++)instant=localInputToInstant(instantToLocalInput(instant));process.stdout.write(JSON.stringify({instant,local:instantToLocalInput(instant),gap:localInputToInstant('2026-03-08T02:30'),bad:localInputToInstant('2026-02-30T18:38')}));`;
 for(const [TZ,expected] of [['Asia/Ho_Chi_Minh','2026-07-01T11:38:00.000Z'],['America/New_York','2026-07-01T22:38:00.000Z']]){
  const actual=JSON.parse(execFileSync(process.execPath,['--experimental-strip-types','--input-type=module','-e',code],{env:{...process.env,TZ},encoding:'utf8'}));assert.equal(actual.instant,expected);assert.equal(actual.local,'2026-07-01T18:38');assert.equal(actual.bad,'');if(TZ==='America/New_York')assert.equal(actual.gap,'');
 }
});
