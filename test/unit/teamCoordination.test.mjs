import {test,beforeEach} from 'node:test';import assert from 'node:assert/strict';import {registerHooks} from 'node:module';
class Storage{data=new Map();fail='';get length(){return this.data.size;}key(i){return [...this.data.keys()][i]??null;}getItem(k){return this.data.get(k)??null;}setItem(k,v){if(k===this.fail)throw new Error('Storage unavailable');this.data.set(k,String(v));}removeItem(k){this.data.delete(k);}}
const storage=new Storage();globalThis.window={localStorage:storage,dispatchEvent:()=>true};globalThis.localStorage=storage;globalThis.CustomEvent=class{};
registerHooks({load(url,context,next){if(url.endsWith('/lib/supabaseClient.ts'))return {format:'module',shortCircuit:true,source:'export const supabaseClient=null;export const isPipelineSupabaseConfigured=false;'};return next(url,context);}});
const {deriveTeamCoordination,teamReviewText}=await import('../../src/domain/commercialKernel/teamCoordination.ts');
const {recordInternalAgreement}=await import('../../src/domain/commercialKernel/teamCoordinationCommands.ts');
const {loadCommitments}=await import('../../src/services/commercialKernel/commitmentStore.ts');
const {decodeHistoricalStorage}=await import('../../src/services/historicalStorageCodec.ts');
const {buildRestorePlan}=await import('../../src/utils/workspaceBackup.ts');
const {getLocalHistoricalSourcesAt}=await import('../../src/services/historicalQuery.ts');
const scope={userId:'owner',sampleDataActive:false},at='2026-09-01T00:00:00.000Z';
const o={id:'o',userId:'owner',accountId:'a',accountName:'Acme',opportunityName:'Scoped deal',stage:'Proposal',status:'Active',createdAt:at,updatedAt:at};
const input={opportunity:o,ownerLabel:'Operations lead',promise:'Send agreed pack',dueDate:'2026-10-01',agreementReference:'Meeting note 42',confirmed:true};
beforeEach(()=>{storage.data.clear();storage.fail='';storage.setItem('memoire.accounts.v1',JSON.stringify([{id:'a',userId:'owner'}]));storage.setItem('memoire.opportunities.v1',JSON.stringify([o]));});
test('delegation record requires human confirmation and a scoped Opportunity',()=>{
 for(const patch of [{confirmed:false},{ownerLabel:''},{agreementReference:''},{dueDate:'2026-02-31'},{opportunity:{...o,userId:'other'}},{opportunity:{...o,isSample:true}}])assert.equal(recordInternalAgreement(scope,{...input,...patch}).ok,false);
 assert.equal(loadCommitments().length,0);const result=recordInternalAgreement(scope,input);assert.equal(result.ok,true);assert.equal(result.value.commitmentParty,'internal');assert.equal(result.value.sourceId,'Meeting note 42');assert.equal(result.value.status,'open');
});
test('team view filters exact owner, sample and internal party, retaining honest undated work',()=>{
 const row=recordInternalAgreement(scope,input).value;
 const rows=deriveTeamCoordination(scope,[row,{...row,id:'foreign',userId:'other'},{...row,id:'sample',isSample:true},{...row,id:'self',commitmentParty:'self'},{...row,id:'done',status:'completed'},{...row,id:'undated',currentDueDate:''}],[o],'2026-10-02');
 assert.deepEqual(rows.map(r=>r.id),[row.id,'undated']);assert.equal(rows[0].timing,'overdue');assert.equal(rows[1].timing,'undated');
});
test('selected review text excludes unselected promises, private notes and agreement references',()=>{
 const first=recordInternalAgreement(scope,input).value;const second={...first,id:'second',commitmentText:'Private promise',notes:'Private deal notes'};
 const rows=deriveTeamCoordination(scope,[first,second],[o],'2026-10-02'),copy=teamReviewText(rows,[first.id],at);
 assert.ok(copy.includes('Send agreed pack'));for(const privateText of ['Private promise','Private deal notes','Meeting note 42'])assert.equal(copy.includes(privateText),false);
 assert.equal(teamReviewText(rows,[],at).includes('Send agreed pack'),false);
});
test('a rejected durable write creates neither a delegated promise nor a revision',()=>{
 const before=[...storage.data];storage.fail='memoire.stateRevisions.v1';assert.equal(recordInternalAgreement(scope,input).ok,false);assert.deepEqual([...storage.data],before);
});
test('agreed team promise uses existing export and history, with sample exclusion',()=>{
 const row=recordInternalAgreement(scope,input).value;
 const local=Object.fromEntries([...storage.data].map(([k,v])=>[k,JSON.parse(k==='memoire.stateRevisions.v1'?decodeHistoricalStorage(v):v)]));
 const revisions=local['memoire.stateRevisions.v1'],revision=revisions.find(r=>r.entityType==='commercial_commitments');
 assert.equal(getLocalHistoricalSourcesAt('owner',revision.recordedAt,storage).records.commercial_commitments[0].sourceId,'Meeting note 42');
 const plan=buildRestorePlan({formatVersion:14,exportedAt:new Date().toISOString(),localBrowserData:local});assert.ok(plan.writes.some(w=>w.key==='memoire.commercialCommitments.v1'&&w.value.includes(row.id)));
 assert.equal(deriveTeamCoordination(scope,[{...row,isSample:true}],[o],'2026-10-02').length,0);
});
