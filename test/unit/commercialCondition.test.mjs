import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectCommercialConditions, conditionStateFor, isCommercialCondition } from '../../src/domain/commercialKernel/commercialCondition.ts';
import { conditionReferenceIndex, validateConditionReferences } from '../../src/domain/commercialKernel/conditionReferences.ts';
const at = '2026-09-01T12:00:00.000Z';
const c = { id:'c',userId:'u',accountId:'a',opportunityId:'o',statement:'Budget is approved.',conditionCategory:'financial',intent:'hypothesis',lifecycle:'active',sourceType:'manual',createdAt:at,updatedAt:at,evidenceLinks:[] };
const e = { id:'support',userId:'u',accountId:'a',opportunityId:'o',category:'technical_outcome',direction:'positive',summary:'Approved',evidenceText:'Commercial contact says budget approved.',observedAt:'2026-08-01',recordedAt:at,createdAt:at,updatedAt:at,sourceType:'email',sourceId:'contact' };
const conflict = { ...e,id:'conflict',sourceId:'finance',evidenceText:'Finance says approval is still pending.',observedAt:'2026-09-01' };
const link = (id, assessment='supports', supersedesEvidenceId=null) => ({evidenceId:id,assessment,recordedAt:at,supersedesEvidenceId});
const reading = (condition, evidence=[e,conflict]) => projectCommercialConditions([condition],evidence).get(condition.id);

test('absence derives unknown, while unproven persisted intent stays explicit', () => {
  assert.equal(conditionStateFor(new Map(),'absent'),'unknown');
  assert.equal(reading(c).state,'hypothesis');
  assert.equal(reading({...c,intent:'assumed'}).state,'assumed');
  assert.equal(isCommercialCondition({...c,intent:'unknown'}),false);
});
test('one explicit current supporting assessment derives supported; global evidence direction does not decide', () => {
  assert.equal(reading({...c,evidenceLinks:[link('support')]},[{...e,direction:'negative'}]).state,'supported');
});
test('independent sources contradict even when one is newer; input order never decides authority', () => {
  const condition = {...c,evidenceLinks:[link('support'),link('conflict','contradicts')]};
  for (const records of [[e,conflict],[conflict,e]]) {
    const r = reading(condition, records);
    assert.equal(r.state,'contradicted'); assert.equal(r.supporting[0].id,'support'); assert.equal(r.conflicting[0].id,'conflict');
  }
});
test('conflicting evidence alone contradicts an assumption', () => {
  assert.equal(reading({...c,intent:'assumed',evidenceLinks:[link('conflict','contradicts')]}).state,'contradicted');
});
test('explicit replacement excludes earlier evidence but preserves it and its dates', () => {
  const condition = {...c,evidenceLinks:[link('support'),link('conflict','contradicts','support')]};
  assert.equal(isCommercialCondition(condition),true);
  const r = reading(condition); assert.equal(r.supporting.length,0); assert.deepEqual(r.historical,[e]); assert.equal(r.state,'contradicted');
  const recovery = {...e,id:'signed',sourceId:'signed-contract',evidenceText:'Signed approval received.'};
  const recovered = reading({...condition,evidenceLinks:[...condition.evidenceLinks,link('signed','supports','conflict')]},[e,conflict,recovery]);
  assert.equal(recovered.state,'supported'); assert.equal(recovered.historical.length,2);
});
test('many-to-many assessments can give different readings without mutating evidence', () => {
  const p = projectCommercialConditions([{...c,evidenceLinks:[link('support')]},{...c,id:'other',evidenceLinks:[link('support','contradicts')]}],[e]);
  assert.equal(p.get('c').state,'supported'); assert.equal(p.get('other').state,'contradicted'); assert.equal(e.direction,'positive');
});
test('malformed links, cycles, duplicate and branched replacements are rejected', () => {
  for (const links of [[link('support'),link('support')],[link('support','maybe')],[{...link('support'),evidenceText:'copied assertion'}],[link('support','supports','missing')],[link('support'),link('conflict','contradicts','support'),link('third','supports','support')]]) assert.equal(isCommercialCondition({...c,evidenceLinks:links}),false);
  for (const patch of [{statement:''},{validFrom:'2026-02-30'},{createdAt:'2026-02-30T12:00:00.000Z'},{sourceType:'unknown'},{createdAt:''},{conditionCategory:'MEDDIC'},{sourceUrl:42}]) assert.equal(isCommercialCondition({...c,...patch}),false);
});
test('missing, foreign and wrong-account evidence never supports; reference preflight refuses it', () => {
  const condition = {...c,evidenceLinks:[link('support')]};
  for (const evidence of [[],[{...e,userId:'other'}],[{...e,accountId:'other'}],[{...e,isSample:true}]]) {
    const r = reading(condition,evidence); assert.equal(r.state,'hypothesis'); assert.deepEqual(r.unresolvedEvidenceIds,['support']);
    assert.throws(() => validateConditionReferences(condition,conditionReferenceIndex([{id:'a',userId:'u'}],[{id:'o',userId:'u'}],evidence)));
  }
});
test('account-level scope is valid; opportunity evidence cannot establish an account-wide claim', () => {
  const condition = {...c,opportunityId:null,evidenceLinks:[link('support')]};
  assert.equal(reading(condition,[e]).supporting.length,0);
  assert.equal(reading(condition,[{...e,opportunityId:null}]).state,'supported');
});
test('retirement is independent of epistemic state and missing business time is not invented', () => {
  const r = reading({...c,lifecycle:'retired',evidenceLinks:[link('support')]}); assert.equal(r.state,'supported'); assert.equal(r.condition.lifecycle,'retired'); assert.equal(r.condition.validFrom,undefined);
});
test('300 opportunities × 8 conditions × 3 links project without repeated full evidence scans', () => {
  const conditions=[], evidence=[];
  for (let i=0;i<300;i++) for (let j=0;j<8;j++) {
    const id=`${i}-${j}`; const links=[];
    for(let k=0;k<3;k++) { const eid=`e-${id}-${k}`; evidence.push({...e,id:eid,opportunityId:`o-${i}`}); links.push(link(eid,k===2?'contradicts':'supports')); }
    conditions.push({...c,id,opportunityId:`o-${i}`,evidenceLinks:links});
  }
  let lookups=0; const originals = evidence.map(e => ({...e}));
  const observed = evidence.map(e => new Proxy(e,{get(target,key){if(key==='id') lookups++;return target[key];}}));
  const start=performance.now(); const result=projectCommercialConditions(conditions,observed); const elapsed=performance.now()-start;
  assert.equal(result.size,2400); assert.ok([...result.values()].every(r=>r.state==='contradicted'));
  assert.ok(lookups<=evidence.length*10,`linear evidence reads: ${lookups}`); assert.ok(elapsed<2000,`projection took ${elapsed}ms`);
  assert.deepEqual(evidence,originals);
});

test('same-source supersession uses existing Evidence ordering but never inherits an unassessed replacement', () => {
  const earlier = {...e,sourceUpdatedAt:at};
  const latest = {...earlier,id:'revision',observedAt:'2026-09-02',sourceUpdatedAt:'2026-09-02T12:00:00.000Z'};
  const r = reading({...c,evidenceLinks:[link('support')]},[earlier,latest]);
  assert.equal(r.state,'hypothesis'); assert.equal(r.historical[0].id,'support');
  const linked = reading({...c,evidenceLinks:[link('support'),link('revision','contradicts')]},[latest,earlier]);
  assert.equal(linked.state,'contradicted'); assert.equal(linked.supporting.length,0);
});
test('legacy Capture evidence with a canonical opportunity ID can be explicitly assessed without linking by name', () => {
  assert.equal(reading({...c,evidenceLinks:[link('support')]},[{...e,accountId:''}]).state,'supported');
  assert.equal(reading({...c,opportunityId:null,evidenceLinks:[link('support')]},[{...e,accountId:'',opportunityId:null}]).state,'hypothesis');
});
