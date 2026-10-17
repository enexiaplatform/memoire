import {test} from 'node:test';
import assert from 'node:assert/strict';
import {planReferenceContext,assertPlanReferenceTargets} from '../../src/features/aiChat/planReference.ts';
import {parseChatReply} from '../../api/_aiChat.js';
const swab={kind:'opportunity',id:'swab',key:'opportunity:swab',title:'Fictional Samil · Swab / PMM',detail:'Qualification'};
const endotoxin={kind:'opportunity',id:'endo',key:'opportunity:endo',title:'Fictional Allomed · Endotoxin / BOKANG',detail:'Proposal'};
const context={asOf:'2026-10-17',scope:'All workspace',sources:[swab,endotoxin],facts:['Local business date: 2026-10-17'],limitations:[]};
const reply={answer:'Five draft tasks for Fictional Samil · Swab / PMM.',sourceKeys:[swab.key],sources:[swab],actions:[],draft:'',suggestedAction:'',suggestedQuestions:[],missingContext:[]};
const messages=[{role:'user',content:'Plan next week for me'},{role:'assistant',content:reply.answer,reply,context}];
const plan=(targetKey)=>({kind:'create_plan',targetKey,label:'Review urgency objection',date:'2026-10-22',channel:'Phone call',changes:[]});
test('add-it-to-Plan locks to cited Swab rather than reranking to Endotoxin',()=>{
  for(const question of ['add it into the Plan for next week','add into Plan with details information','Thêm lịch này vào Plan','Đưa lịch này vào Plan']) {
    const locked=planReferenceContext(question,messages);
    assert.deepEqual(locked.sources,[swab]);
    assert.equal(locked.asOf,context.asOf);
    assert.doesNotThrow(()=>assertPlanReferenceTargets([plan(swab.key)],locked));
    assert.throws(()=>assertPlanReferenceTargets([plan(endotoxin.key)],locked),/không khớp/);
    assert.throws(()=>assertPlanReferenceTargets([plan('')],locked),/không khớp/);
    assert.throws(()=>parseChatReply({...reply,actions:[plan(endotoxin.key)],sourceKeys:[swab.key]},locked.sources));
  }
  assert.equal(context.sources.length,2);
});
test('an entire multi-opportunity draft cannot collapse every task onto one opportunity',()=>{
  const previous={...messages[1],reply:{...reply,sourceKeys:[swab.key,endotoxin.key]}};
  const locked=planReferenceContext('add these into Plan',[messages[0],previous]);
  assert.throws(()=>assertPlanReferenceTargets([plan(swab.key),{...plan(swab.key),date:'2026-10-23'}],locked));
  assert.doesNotThrow(()=>assertPlanReferenceTargets([plan(swab.key),plan(endotoxin.key)],locked));
});
test('new named work is retrieved independently; unrecorded history cannot become a reference',()=>{
  assert.equal(planReferenceContext('add Plan for Fictional Allomed on 2026-10-20',messages),null);
  assert.equal(planReferenceContext('Plan next week',messages),null);
  assert.equal(planReferenceContext('add it into Plan',[]),null);
  assert.equal(planReferenceContext('add it into Plan',[{role:'assistant',content:'draft with no evidence'}]),null);
  assert.deepEqual(planReferenceContext('add it into Plan',[...messages,{role:'assistant',content:'Canceled; nothing saved.'}]).sources,[swab]);
});
test('personal drafts keep unlinked work personal; conversion does not update opportunities',()=>{
  const locked={...context,sources:[]};
  assert.doesNotThrow(()=>assertPlanReferenceTargets([plan('')],locked));
  assert.throws(()=>assertPlanReferenceTargets([plan(swab.key)],locked));
  assert.throws(()=>assertPlanReferenceTargets([{...plan(swab.key),kind:'update_opportunity'}],context));
});
test('weekly-analysis-only citations recover the exact full opportunity named in the draft',()=>{
  const previous={...messages[1],content:'Draft for "Fictional Samil – Swab / PMM".\n2026-10-20: Call.',reply:{...reply,sourceKeys:[]}};
  const locked=planReferenceContext('add it into the Plan for next week',[messages[0],previous]);
  assert.deepEqual(locked.sources,[swab]);
  assert.throws(()=>assertPlanReferenceTargets([plan(endotoxin.key)],locked));
  assert.doesNotThrow(()=>assertPlanReferenceTargets([plan(swab.key)],locked));
});
test('identity recovery refuses product fragments and longer lookalike names',()=>{
  for(const content of ['Draft for Swab / PMM.','Draft for "Fictional Samil · Swab / PMM Pro".']) {
    const locked=planReferenceContext('add it into Plan',[{...messages[1],content,reply:{...reply,sourceKeys:[]}}]);
    assert.deepEqual(locked.sources,[]);
  }
});


test('saving a long agenda reserves its history without dropping locked targets or calculated facts',()=>{
  const content='Dated draft for Fictional Samil · Swab / PMM. '+ 'Recorded task details. '.repeat(180);
  const previous={...messages[1],content,context:{...context,sources:[{...swab,detail:'Long evidence '.repeat(500)}]}};
  const locked=planReferenceContext('Thêm các việc trên vào Plan',[messages[0],previous]);
  assert.deepEqual(locked.sources.map(source=>source.key),[swab.key]);
  assert.ok(locked.facts.includes(context.facts[0]));
  assert.ok(Buffer.byteLength(JSON.stringify(locked)+content+messages[0].content+'Thêm các việc trên vào Plan')<8000);
  assert.ok(locked.sources[0].detail.length<previous.context.sources[0].detail.length);
});
