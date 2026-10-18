import {test} from 'node:test';
import assert from 'node:assert/strict';
import '../support/reportingCurrency.mjs';
import {planReferenceContext} from '../../src/features/aiChat/planReference.ts';
import {assistantTranscript} from '../../src/features/aiChat/chatHistory.ts';
import {weeklyPlanDraft} from '../../src/features/aiChat/weeklyPlanDraft.ts';
const source={kind:'opportunity',id:'d1',key:'opportunity:d1',title:'Fictional Acme · Analyzer',detail:'Active deal'};
const context={asOf:'2026-10-18',scope:'Fictional QA',sources:[source],facts:['Local business date: 2026-10-18'],limitations:[]};
const reply={answer:'Draft for Fictional Acme · Analyzer on 2026-10-20.',draft:'',suggestedAction:'',sourceKeys:[source.key],sources:[source],actions:[],clarification:'',missingContext:[],suggestedQuestions:[]};
const original={role:'assistant',content:reply.answer,reply,context};
test('cancellation and execution receipts prevent revival of an older draft',()=>{
 for(const receipt of [{role:'assistant',content:'Đã hủy nhóm thay đổi. Chưa ghi dữ liệu.'},{role:'assistant',content:'Đã lưu trên thiết bị; chưa đồng bộ.',planReceipt:true}]) {
  assert.throws(()=>planReferenceContext('Thêm các việc trên vào Plan',[{role:'user',content:'Prepare Plan'},original,receipt]),/bản nháp|Bản nháp/);
 }
});
test('a displayed agenda that exceeds transcript capacity cannot be silently converted from its cut-off history',()=>{
 const longReply={...reply,answer:'Draft. '+ 'Task details '.repeat(450),draft:'Last task with a different date: 2026-10-23. '+ 'More task details '.repeat(60)};
 const full=assistantTranscript(longReply);
 assert.ok(full.length>6000);
 assert.throws(()=>planReferenceContext('Thêm các việc trên vào Plan',[{...original,reply:longReply,content:full.slice(0,6000)}]),/quá dài|đầy đủ/);
});
const now=new Date(2026,9,18,12);
const deal={id:'d1',userId:'u1',accountId:'a1',accountName:'Fictional Acme',opportunityName:'Analyzer',status:'Active',stage:'Proposal',nextAction:'Review demo scope',nextActionDate:'2026-10-15'};
const workspace={accounts:[],opportunities:[deal],activities:[],opportunityOutcomes:[]};
const planned={id:'p1',date:'2026-10-20',label:'Review demo scope',linkedOpportunityId:'d1',done:false,createdAt:'2026-10-18',updatedAt:'2026-10-18'};
test('weekly drafting does not propose the exact work already scheduled as a linked manual Plan item',()=>{
 const draft=weeklyPlanDraft(workspace,[planned],now,'2026-10-19','2026-10-25');
 assert.deepEqual(draft.preferredIds,[]);
 const longTask='Review criteria '.repeat(40);
 assert.deepEqual(weeklyPlanDraft({...workspace,opportunities:[{...deal,nextAction:longTask}]},[{...planned,label:longTask.slice(0,450)}],now,'2026-10-19','2026-10-25').preferredIds,[]);
});
test('Plan dedupe never merges another opportunity, different work, deleted or out-of-week records',()=>{
 for(const change of [{linkedOpportunityId:'other'},{label:'Review pricing'},{__deleted:true},{dismissed:true},{date:'2026-11-01'}]) {
  assert.deepEqual(weeklyPlanDraft(workspace,[{...planned,...change}],now,'2026-10-19','2026-10-25').preferredIds,['d1']);
 }
});


test('Vietnamese named new work is not mistaken for the English pronoun them',()=>{
 for(const question of ['Thêm Plan cho Fictional Allomed ngày 2026-10-20','Thêm việc gọi Fictional Allomed vào Plan tuần này'])
  {
  assert.equal(planReferenceContext(question,[{role:'user',content:'Prepare a draft'},original]),null);
  assert.equal(planReferenceContext(question,[original,{role:'assistant',content:'Đã hủy.'}]),null);
 }
 for(const question of ['Thêm các việc trên vào Plan','Đưa lịch này vào Plan','Thêm vào Plan tuần sau','Add them to Plan','Lưu đề xuất này vào Plan','Thêm tất cả vào Plan'])
  assert.ok(planReferenceContext(question,[original]));
});
