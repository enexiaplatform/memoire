import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {activateLocalHistoricalIntegrity,commitLocalHistoricalCollection,readLocalHistoryAt,
  HISTORICAL_REVISIONS_KEY,HISTORICAL_COVERAGE_KEY,removeSampleHistoricalIntegrity} from '../../src/services/historicalIntegrity.ts';
class Storage{data=new Map();refuse='';getItem(k){return this.data.get(k)??null;}setItem(k,v){if(k===this.refuse)throw new Error('quota');this.data.set(k,String(v));}removeItem(k){this.data.delete(k);}}
const storage=new Storage(),date=s=>()=>`${s}T00:00:00.000Z`;
beforeEach(()=>{storage.data.clear();storage.refuse='';});
const condition=(statement,extra={})=>({id:'condition',userId:'owner',accountId:'account',opportunityId:'opportunity',
  statement,intent:'hypothesis',lifecycle:'active',validFrom:'2026-09-05',createdAt:'2026-09-05T00:00:00Z',
  updatedAt:'2026-09-05T00:00:00Z',evidenceLinks:[],...extra});
test('verified baseline is idempotent and never backdates old current state',()=>{
  storage.setItem('memoire.commercialConditions.v1',JSON.stringify([condition('Budget approved')]));
  const marker=activateLocalHistoricalIntegrity('owner',storage,date('2026-09-20'));
  assert.equal(marker.historyGuaranteedFrom,'2026-09-20T00:00:00.000Z');
  assert.equal(activateLocalHistoricalIntegrity('owner',storage,date('2026-09-21')).historyGuaranteedFrom,marker.historyGuaranteedFrom);
  assert.equal(JSON.parse(storage.getItem(HISTORICAL_REVISIONS_KEY)).length,1);
  assert.equal(readLocalHistoryAt('commercial_conditions','condition','owner','2026-09-19T00:00:00Z',storage).status,'pre_coverage');
  const at=readLocalHistoryAt('commercial_conditions','condition','owner','2026-09-20T00:00:00Z',storage);
  assert.equal(at.status,'available');assert.equal(at.revision.operation,'baseline');
  assert.equal(at.revision.state.createdAt,'2026-09-05T00:00:00Z');
});
test('cutoff queries use accepted system time and never leak future state',()=>{
  storage.setItem('memoire.commercialConditions.v1',JSON.stringify([condition('Budget approved')]));
  activateLocalHistoricalIntegrity('owner',storage,date('2026-09-20'));
  commitLocalHistoricalCollection('commercial_conditions',[condition('Budget uncertain')],storage,date('2026-09-22'));
  commitLocalHistoricalCollection('commercial_conditions',[condition('Budget denied')],storage,date('2026-09-25'));
  assert.equal(readLocalHistoryAt('commercial_conditions','condition','owner','2026-09-23T00:00:00Z',storage).revision.state.statement,'Budget uncertain');
  assert.equal(readLocalHistoryAt('commercial_conditions','condition','owner','2026-09-26T00:00:00Z',storage).revision.state.statement,'Budget denied');
  assert.equal(JSON.parse(storage.getItem(HISTORICAL_REVISIONS_KEY)).length,3);
  assert.equal(readLocalHistoryAt('commercial_conditions','condition','owner','2026-09-22T07:00:00+07:00',storage).revision.state.statement,'Budget uncertain');
});
test('late-entered Evidence is absent before recordedAt despite older observedAt',()=>{
  activateLocalHistoricalIntegrity('owner',storage,date('2026-09-20'));
  const evidence={id:'late',userId:'owner',observedAt:'2026-09-18',recordedAt:'2026-09-24T00:00:00Z',
    evidenceText:'Trial passed',sourceType:'manual'};
  commitLocalHistoricalCollection('commercial_evidence',[evidence],storage,date('2026-09-24'));
  assert.equal(readLocalHistoryAt('commercial_evidence','late','owner','2026-09-20T00:00:00Z',storage).revision,null);
  const after=readLocalHistoryAt('commercial_evidence','late','owner','2026-09-25T00:00:00Z',storage);
  assert.equal(after.revision.state.observedAt,'2026-09-18');
});
test('state and revisions roll back together when either write is refused',()=>{
  storage.setItem('memoire.commercialConditions.v1',JSON.stringify([condition('Old')]));
  storage.refuse=HISTORICAL_REVISIONS_KEY;
  assert.throws(()=>activateLocalHistoricalIntegrity('owner',storage,date('2026-09-20')));
  assert.equal(storage.getItem(HISTORICAL_COVERAGE_KEY),null);
  storage.refuse='';activateLocalHistoricalIntegrity('owner',storage,date('2026-09-20'));
  const oldHistory=storage.getItem(HISTORICAL_REVISIONS_KEY);
  storage.refuse='memoire.commercialConditions.v1';
  assert.throws(()=>commitLocalHistoricalCollection('commercial_conditions',[condition('New')],storage,date('2026-09-22')));
  assert.equal(storage.getItem(HISTORICAL_REVISIONS_KEY),oldHistory);
  assert.equal(JSON.parse(storage.getItem('memoire.commercialConditions.v1'))[0].statement,'Old');
});
test('retry of an unchanged canonical state creates no duplicate revision',()=>{
  commitLocalHistoricalCollection('commercial_conditions',[condition('New')],storage,date('2026-09-20'));
  commitLocalHistoricalCollection('commercial_conditions',[condition('New',{updatedAt:'2026-09-22T00:00:00Z'})],storage,date('2026-09-22'));
  assert.equal(JSON.parse(storage.getItem(HISTORICAL_REVISIONS_KEY)).length,1);
});
test('corrupt sequence and unsupported schema return gaps, never a guessed state',()=>{
  commitLocalHistoricalCollection('commercial_conditions',[condition('New')],storage,date('2026-09-20'));
  const revisions=JSON.parse(storage.getItem(HISTORICAL_REVISIONS_KEY));
  revisions[0].revisionNo=2;storage.setItem(HISTORICAL_REVISIONS_KEY,JSON.stringify(revisions));
  assert.equal(readLocalHistoryAt('commercial_conditions','condition','owner','2026-09-21T00:00:00Z',storage).status,'sequence_gap');
  revisions[0].revisionNo=1;revisions[0].schemaVersion=999;storage.setItem(HISTORICAL_REVISIONS_KEY,JSON.stringify(revisions));
  assert.equal(readLocalHistoryAt('commercial_conditions','condition','owner','2026-09-21T00:00:00Z',storage).status,'unsupported_schema');
});
test('sample baseline and revisions are isolated and removable without touching live history',()=>{
  commitLocalHistoricalCollection('commercial_conditions',[condition('Live'),condition('Demo',{id:'demo',userId:null,isSample:true})],storage,date('2026-09-20'));
  assert.equal(JSON.parse(storage.getItem(HISTORICAL_COVERAGE_KEY)).length,2);
  removeSampleHistoricalIntegrity(storage);
  assert.equal(JSON.parse(storage.getItem(HISTORICAL_COVERAGE_KEY)).length,1);
  assert.equal(readLocalHistoryAt('commercial_conditions','demo','sample','2026-09-21T00:00:00Z',storage).status,'not_activated');
  assert.equal(readLocalHistoryAt('commercial_conditions','condition','owner','2026-09-21T00:00:00Z',storage).status,'available');
});
