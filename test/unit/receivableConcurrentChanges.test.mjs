import {test} from 'node:test';
import assert from 'node:assert/strict';
import '../support/reportingCurrency.mjs';
import {applyReceivableChanges,commitReceivableChanges,sameReceivableValue,receivableCloudPayload,resolvePendingReceivableTerms} from '../../src/utils/receivableChanges.ts';
import {createOrderReceivableRecord,createPaymentReceipt,buildReceivables} from '../../src/utils/receivables.ts';
import {validatePaymentSchedule} from '../../src/utils/paymentTerms.ts';
import {recordPaymentReceipt,removePaymentReceipt,saveOrderReceivableTerms,loadOrderReceivables,ORDER_RECEIVABLE_STORAGE_KEY} from '../../src/services/orderReceivableStore.ts';
import {buildRestorePlan} from '../../src/utils/workspaceBackup.ts';
import {canonicalContracts} from '../../src/services/canonicalDurability.ts';
const base=()=>createOrderReceivableRecord({opportunityId:'order'});
const receipt=(id,amount=100)=>createPaymentReceipt({id,amount,currency:'USD',receivedOn:'2026-09-28'});
const pending=(initial,changes)=>({...initial,syncBase:structuredClone(initial),pendingChanges:changes});
const add=(id,amount=100)=>({id:`command-${id}`,kind:'add',receipt:receipt(id,amount)});
function memoryAdapter(initial=base()){
 let row=initial?{payload:structuredClone(initial),updatedAt:'initial'}:null, revision=0;
 return{read:async()=>structuredClone(row),compareAndSet:async(id,expected,next)=>{
  if(!sameReceivableValue(expected,row))return false;
  row={payload:structuredClone(next),updatedAt:String(++revision)};return true;
 },row:()=>structuredClone(row)};
}
test('two concurrent device commands commit both receipts using atomic conditional writes',async()=>{
 const initial=base(),adapter=memoryAdapter(initial);
 await Promise.all([commitReceivableChanges(adapter,pending(initial,[add('a',111)])),commitReceivableChanges(adapter,pending(initial,[add('b',222)]))]);
 assert.deepEqual(adapter.row().payload.receipts.map(r=>r.id).sort(),['a','b']);assert.equal(adapter.row().payload.receipts.reduce((s,r)=>s+r.amount,0),333);
});
test('concurrent first writes create one collection without losing either receipt',async()=>{
 const initial=base(),adapter=memoryAdapter(null);await Promise.all(['a','b'].map(id=>commitReceivableChanges(adapter,pending(initial,[add(id)]))));assert.equal(adapter.row().payload.receipts.length,2);
});
test('a lost server response retries the same receipt identity once',async()=>{
 const initial=base(),db=memoryAdapter(initial);let lose=true;
 const adapter={read:db.read,compareAndSet:async(...args)=>{const result=await db.compareAndSet(...args);if(lose){lose=false;throw new Error('Response lost');}return result;}};
 const local=pending(initial,[add('a')]);await assert.rejects(commitReceivableChanges(adapter,local),/Response lost/);await commitReceivableChanges(adapter,local);assert.equal(db.row().payload.receipts.length,1);
});
test('offline add rebases on a newer device payment independent of local timestamps',()=>{
 const initial=base(),local=pending(initial,[add('offline',333)]),cloud={...initial,updatedAt:'2099-01-01',receipts:[receipt('online',444)]};
 assert.equal(applyReceivableChanges(cloud,local).receipts.reduce((s,r)=>s+r.amount,0),777);assert.equal(local.pendingChanges.length,1);
});
test('a stale add never resurrects a receipt deleted by another device',()=>{
 const initial={...base(),receipts:[receipt('removed')]},local=pending(initial,[add('new')]);
 assert.deepEqual(applyReceivableChanges({...initial,receipts:[]},local).receipts.map(r=>r.id),['new']);
});
test('receipt removal preserves a concurrent unrelated receipt and is idempotent',()=>{
 const removed=receipt('removed'),initial={...base(),receipts:[removed]},local=pending(initial,[{id:'remove',kind:'remove',receipt:removed}]);
 const cloud={...initial,receipts:[removed,receipt('new')]};const once=applyReceivableChanges(cloud,local);assert.deepEqual(once.receipts.map(r=>r.id),['new']);assert.deepEqual(applyReceivableChanges(once,local).receipts,once.receipts);
});
test('removal refuses a receipt edited remotely rather than discarding the edit',()=>{
 const old=receipt('edited'),initial={...base(),receipts:[old]},local=pending(initial,[{id:'remove',kind:'remove',receipt:old}]);
 assert.throws(()=>applyReceivableChanges({...initial,receipts:[{...old,amount:900}]},local),/edited on another device/);assert.equal(local.pendingChanges.length,1);
});
test('saving delivery while another device records cash preserves both facts',()=>{
 const initial=base(),local=pending(initial,[{id:'delivery',kind:'terms',before:{deliveredOn:''},after:{deliveredOn:'2026-09-30'}}]);
 const result=applyReceivableChanges({...initial,receipts:[receipt('banked')]},local);assert.equal(result.deliveredOn,'2026-09-30');assert.equal(result.receipts.length,1);
});
test('conflicting delivery edits are refused with commands retained',()=>{
 const initial=base(),local=pending(initial,[{id:'delivery',kind:'terms',before:{deliveredOn:''},after:{deliveredOn:'2026-09-30'}}]);
 assert.throws(()=>applyReceivableChanges({...initial,deliveredOn:'2026-09-29'},local),/deliveredOn changed/);assert.equal(local.pendingChanges.length,1);
});
test('explicit terms conflict choices retain every pending payment',()=>{
 const initial=base(),local=pending(initial,[add('offline'),{id:'delivery',kind:'terms',before:{deliveredOn:''},after:{deliveredOn:'2026-09-30'}}]),remote={...initial,deliveredOn:'2026-09-29',receipts:[receipt('online')]};
 for(const keepDevice of [false,true]){const result=resolvePendingReceivableTerms(remote,local,keepDevice);assert.deepEqual(result.receipts.map(r=>r.id).sort(),['offline','online']);assert.equal(result.deliveredOn,keepDevice?'2026-09-30':'2026-09-29');assert.ok(result.pendingChanges.some(c=>c.kind==='add'));assert.equal(result.pendingChanges.some(c=>c.kind==='terms'),keepDevice);}
});
test('deleting after an offline add recognizes its own preceding command',()=>{
 const initial=base(),before={...initial,receipts:[receipt('offline')]},local=pending(initial,[add('offline'),{id:'delete',kind:'delete',before}]);assert.equal(applyReceivableChanges(initial,local).__deleted,true);
});
test('deleting an order collection refuses newer facts and stale adds cannot revive a deleted collection',()=>{
 const initial=base();assert.throws(()=>applyReceivableChanges({...initial,receipts:[receipt('new')]},pending(initial,[{id:'delete',kind:'delete',before:initial}])),/newer changes/);
 assert.throws(()=>applyReceivableChanges({...initial,__deleted:true},pending(initial,[add('stale')])),/deleted on another device/);
});
test('bounded contention returns a recovery error without consuming the local command',async()=>{
 const initial=base(),local=pending(initial,[add('a')]);let reads=0;await assert.rejects(commitReceivableChanges({read:async()=>{reads++;return{payload:initial,updatedAt:'v'};},compareAndSet:async()=>false},local),/retained/);assert.equal(reads,8);assert.equal(local.pendingChanges.length,1);
});
test('the real store saves a durable add and removal with its original state',()=>{
 globalThis.window={localStorage};localStorage.setItem(ORDER_RECEIVABLE_STORAGE_KEY,JSON.stringify([base()]));
 try{recordPaymentReceipt({opportunityId:'order',receipt:receipt('a')});removePaymentReceipt('order','a');const stored=loadOrderReceivables()[0];assert.deepEqual(stored.pendingChanges.map(c=>c.kind),['add','remove']);assert.deepEqual(stored.syncBase.receipts,[]);assert.equal(stored.receipts.length,0);}finally{localStorage.removeItem(ORDER_RECEIVABLE_STORAGE_KEY);delete globalThis.window;}
});
test('the store normalizes its durable command exactly as its displayed receipt',()=>{
 globalThis.window={localStorage};localStorage.setItem(ORDER_RECEIVABLE_STORAGE_KEY,JSON.stringify([base()]));
 try{recordPaymentReceipt({opportunityId:'order',receipt:{...receipt('a'),currency:'usd',method:' Transfer '}});const stored=loadOrderReceivables()[0];assert.deepEqual(stored.pendingChanges[0].receipt,stored.receipts[0]);assert.equal(stored.receipts[0].currency,'USD');assert.throws(()=>recordPaymentReceipt({opportunityId:'order',receipt:{...receipt('b'),id:''}}),/stable identity/);}finally{localStorage.removeItem(ORDER_RECEIVABLE_STORAGE_KEY);delete globalThis.window;}
});
test('a refused device write throws before claiming that the payment was saved',()=>{
 globalThis.window={localStorage:{getItem:key=>key===ORDER_RECEIVABLE_STORAGE_KEY?JSON.stringify([base()]):null,setItem:()=>{throw new Error('QuotaExceededError');}}};
 try{assert.throws(()=>recordPaymentReceipt({opportunityId:'order',receipt:receipt('a')}),/saved|storage|Quota|Could not|browser/i);}finally{delete globalThis.window;}
});
test('a complete backup preserves a pending receipt over a newer cloud copy and strips commands from cloud encoding',()=>{
 const initial=base(),local={...pending(initial,[add('offline')]),receipts:[receipt('offline')],updatedAt:'2026-09-01T00:00:00Z'},cloud={...initial,receipts:[receipt('online')],updatedAt:'2026-10-04T00:00:00Z'};
 const plan=buildRestorePlan({exportedAt:'2026-10-04T00:00:00Z',localBrowserData:{[ORDER_RECEIVABLE_STORAGE_KEY]:[local]},cloudData:{user_id:'owner',data:{order_receivables:[{user_id:'owner',id:initial.id,payload:cloud}]}}});
 const restored=JSON.parse(plan.writes.find(w=>w.key===ORDER_RECEIVABLE_STORAGE_KEY).value)[0];assert.deepEqual(restored.receipts.map(r=>r.id).sort(),['offline','online']);assert.equal(restored.pendingChanges.length,1);
 const payload=canonicalContracts.find(c=>c.table==='order_receivables').encode(restored,'owner').payload;assert.equal(payload.pendingChanges,undefined);assert.equal(payload.syncBase,undefined);assert.equal(receivableCloudPayload(restored).syncError,undefined);
});
const slice=(percent,amount=null)=>({id:crypto.randomUUID(),label:'Payment',percent,amount,trigger:'order',offsetDays:0});
test('percentage, fixed and mixed schedules cannot exceed the original contract',()=>{
 assert.throws(()=>validatePaymentSchedule([slice(200)],10000),/exceeds/);
 assert.throws(()=>validatePaymentSchedule([slice(100),slice(100)],10000),/exceeds/);
 assert.throws(()=>validatePaymentSchedule([slice(null,7000),slice(null,4000)],10000),/exceeds/);
 assert.throws(()=>validatePaymentSchedule([slice(70),slice(null,4000)],10000),/exceeds/);
 assert.doesNotThrow(()=>validatePaymentSchedule([slice(70),slice(null,3000)],10000));assert.doesNotThrow(()=>validatePaymentSchedule([slice(50)],10000));
});
test('backup cross-checks fixed schedules against the accepted contract, including encoded numbers',()=>{
 const opportunity={id:'order',accountName:'Account',opportunityName:'Order',stage:'Won',status:'Won',estimatedValue:10000,currency:'USD',createdAt:'2026-09-01T00:00:00Z',updatedAt:'2026-09-01T00:00:00Z'};
 const envelope=(amount)=>({exportedAt:'2026-10-04T00:00:00Z',localBrowserData:{'memoire.opportunities.v1':[opportunity],[ORDER_RECEIVABLE_STORAGE_KEY]:[{...base(),installments:[slice(null,amount)]}]}});
 assert.throws(()=>buildRestorePlan(envelope(11000)),/exceeds/);assert.throws(()=>buildRestorePlan(envelope('11000')),/exceeds/);assert.doesNotThrow(()=>buildRestorePlan(envelope(10000)));
});
test('a backup cannot hide an invalid future payment or schedule inside pending commands',()=>{
 const initial=base();const badPayment=pending(initial,[{...add('future'),receipt:{...receipt('future'),receivedOn:'2099-01-01'}}]);
 const badTerms=pending(initial,[{id:'bad-terms',kind:'terms',before:{installments:[]},after:{installments:[slice(100),slice(100)]}}]);
 for(const record of [badPayment,badTerms])assert.throws(()=>buildRestorePlan({exportedAt:'2026-10-04T00:00:00Z',localBrowserData:{[ORDER_RECEIVABLE_STORAGE_KEY]:[record]}}),/future|exceeds/);
});
test('the real schedule writer refuses excess before changing local data',()=>{
 globalThis.window={localStorage};const original=JSON.stringify([base()]);localStorage.setItem(ORDER_RECEIVABLE_STORAGE_KEY,original);
 try{assert.throws(()=>saveOrderReceivableTerms({opportunityId:'order',installments:[slice(100),slice(100)]}),/exceeds/);assert.throws(()=>saveOrderReceivableTerms({opportunityId:'order',installments:[slice(null,11000)],orderAmount:10000}),/exceeds/);assert.throws(()=>saveOrderReceivableTerms({opportunityId:'order',installments:[slice(null,1)]}),/order value/i);assert.equal(localStorage.getItem(ORDER_RECEIVABLE_STORAGE_KEY),original);}finally{localStorage.removeItem(ORDER_RECEIVABLE_STORAGE_KEY);delete globalThis.window;}
});
test('backup validation refuses excess percentages before restoring any record',()=>{
 assert.throws(()=>buildRestorePlan({exportedAt:'2026-10-04T00:00:00Z',localBrowserData:{[ORDER_RECEIVABLE_STORAGE_KEY]:[{...base(),installments:[slice(100),slice(100)]}]}}),/exceeds/);
});
test('rounding of a valid tiny contract is not a second debt',()=>{
 localStorage.setItem('memoire_reporting_currency','USD');const order={opportunityId:'order',amount:0.01,amountBase:0.01,currency:'USD',paymentTerm:'50% deposit, 50% on delivery',orderDate:'2026-09-01'};
 const result=buildReceivables({orders:[order],records:[{...base(),receipts:[receipt('paid',.01)]}],today:'2026-10-04'}).orders[0];assert.equal(result.outstandingBase,0);assert.equal(result.settled,true);assert.equal(result.installments.reduce((s,i)=>s+i.dueBase,0),.01);
});
