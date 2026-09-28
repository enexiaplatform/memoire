import {test} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
const calls=[];
globalThis.__quoteRestoreCloud={rpc:async(name,args)=>{calls.push({name,args});return {data:{status:'restored'},error:null};}};
registerHooks({load(url,context,next){if(url.endsWith('/lib/supabaseClient.ts'))return {format:'module',shortCircuit:true,
  source:'export const supabaseClient=globalThis.__quoteRestoreCloud; export const isPipelineSupabaseConfigured=true;'};return next(url,context);}});
const {restoreCloudHistoricalScope}=await import('../../src/services/historicalCloudRestore.ts');
const {historicalSources}=await import('../../src/services/historicalIntegrity.ts');
const data=Object.fromEntries(Object.keys(historicalSources).map(table=>[table,[]]));
const quote={user_id:'owner',id:'q',payload:{id:'q',opportunityId:'o'}};
const gate={id:'g',user_id:'owner',money_source_type:'quote_value',money_source_id:'q'};
const envelope={formatVersion:11,exportedAt:'2026-09-20T00:00:00Z',cloudData:{user_id:'owner',data:{...data,accounts:[],commercial_money_gates:[gate],quotes:[quote,{...quote,id:'unrelated'}]}}};
test('history RPC receives only the Quote parents its gate sources require',async()=>{
  calls.length=0;await restoreCloudHistoricalScope(envelope,{writes:[]},'owner');
  assert.equal(calls.length,1);assert.deepEqual(calls[0].args.payload.quote_parents,[quote]);
});
test('missing parent is refused before any RPC',async()=>{
  calls.length=0;
  await assert.rejects(restoreCloudHistoricalScope({...envelope,cloudData:{...envelope.cloudData,data:{...envelope.cloudData.data,quotes:[]}}},{writes:[]},'owner'),/missing a Quote/i);
  assert.equal(calls.length,0);
});
