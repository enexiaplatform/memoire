import {test,beforeEach} from 'node:test';import assert from 'node:assert/strict';import {registerHooks} from 'node:module';
class Storage{data=new Map();fail='';get length(){return this.data.size;}key(index){return [...this.data.keys()][index]??null;}getItem(key){return this.data.get(key)??null;}setItem(key,value){if(key===this.fail)throw new Error('Storage unavailable');this.data.set(key,String(value));}removeItem(key){this.data.delete(key);}}
const storage=new Storage();globalThis.window={localStorage:storage,dispatchEvent(){}};globalThis.localStorage=storage;globalThis.CustomEvent=class{};
registerHooks({load(url,context,next){if(url.endsWith('/lib/supabaseClient.ts'))return {format:'module',shortCircuit:true,source:'export const supabaseClient=null;export const isPipelineSupabaseConfigured=false;'};return next(url,context);}});
const {configureCommercialWorkspace}=await import('../../src/domain/commercialKernel/commercialWorkspaceCommands.ts');
const {commercialWorkspaceCodec}=await import('../../src/services/commercialKernel/commercialWorkspaceStore.ts');
const {buildRestorePlan}=await import('../../src/utils/workspaceBackup.ts');
const {HISTORICAL_REVISIONS_KEY,readLocalHistoryAt}=await import('../../src/services/historicalIntegrity.ts');
const {decodeHistoricalStorage}=await import('../../src/services/historicalStorageCodec.ts');
const input={name:'Team review',members:[{actorId:'22222222-2222-4222-8222-222222222222',role:'reader'}],commitmentIds:[],revisionReason:'Explicit initial sharing',lifecycle:'active',confirmed:true},scope={userId:'owner',sampleDataActive:false};
beforeEach(()=>{storage.data.clear();storage.fail='';});
test('workspace configuration requires explicit confirmation and rejects foreign or sample promises',()=>{
 assert.throws(()=>configureCommercialWorkspace(scope,{...input,confirmed:false},[]),/Confirm/);
 for(const commitment of [{id:'c',userId:'other'},{id:'c',userId:'owner',isSample:true}])assert.throws(()=>configureCommercialWorkspace(scope,{...input,commitmentIds:['c']},[commitment]),/Only promises/);
 assert.equal(storage.length,0);
});
test('owned versioned configuration creates required revisions and refuses stale or foreign changes',()=>{
 const first=configureCommercialWorkspace(scope,input,[]);const second=configureCommercialWorkspace(scope,{...input,id:first.id,expectedVersion:1,name:'Revised team'},[]);assert.equal(second.version,2);
 assert.throws(()=>configureCommercialWorkspace(scope,{...input,id:first.id,expectedVersion:1},[]),/changed/);assert.throws(()=>configureCommercialWorkspace({userId:'other'}, {...input,id:first.id,expectedVersion:2},[]),/scope/);
 const revisions=JSON.parse(decodeHistoricalStorage(storage.getItem(HISTORICAL_REVISIONS_KEY)));const earliest=revisions.find(row=>row.entityType==='commercial_workspaces');assert.equal(readLocalHistoryAt('commercial_workspaces',first.id,'owner',earliest.recordedAt,storage).revision.state.name,'Team review');
});
test('a required history failure cannot leave workspace sharing configuration accepted',()=>{
 storage.fail=HISTORICAL_REVISIONS_KEY;assert.throws(()=>configureCommercialWorkspace(scope,input,[]));assert.equal(storage.getItem(commercialWorkspaceCodec.storageKey),null);
});
test('configuration survives codec and backup while runtime access epoch is never imported as authority',()=>{
 const first=configureCommercialWorkspace(scope,input,[]),row=commercialWorkspaceCodec.toRow(first,'owner');assert.equal('access_epoch' in row,false);assert.deepEqual(commercialWorkspaceCodec.fromRow({...row,access_epoch:'untrusted-runtime-epoch'}),first);
 const plan=buildRestorePlan({formatVersion:15,exportedAt:new Date().toISOString(),localBrowserData:Object.fromEntries([...storage.data].map(([key,value])=>[key,key===HISTORICAL_REVISIONS_KEY?JSON.parse(decodeHistoricalStorage(value)):JSON.parse(value)]))});assert.ok(plan.writes.some(write=>write.key===commercialWorkspaceCodec.storageKey));assert.equal(JSON.stringify(plan).includes('untrusted-runtime-epoch'),false);
});
