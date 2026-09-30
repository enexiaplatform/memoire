import {test,before,after} from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';
import {createSupabaseCompatibleDatabase,applyMigrations,productionMigrations,seedAuthUsers,setAuthenticatedOwner,OWNER_A,OWNER_B} from '../../scripts/release-database-harness.mjs';
import {webhookSignature,verifyWebhookSignature,publicIPv4,readWebhookTargets,postSignedWebhook,createWebhookWorker} from '../../api/_webhooks.js';
import {callHandler} from '../support/commercialApiDatabase.mjs';
import {buildRestorePlan} from '../../src/utils/workspaceBackup.ts';
const secret='test-only-32-character-signing-secret',timestamp='1790000000',body='{"id":"change-1"}';
let db;const targetHash='a'.repeat(64);
const service=async()=>{await db.exec('RESET ROLE; SET ROLE service_role');};
const claim=async(owner=OWNER_A,endpoint='test',hash=targetHash)=>{await service();return (await db.query('SELECT * FROM claim_commercial_webhook_batch($1,$2,$3,$4)',[owner,endpoint,hash,'2026-01-01T00:00:00Z'])).rows;};
const finish=async(job,status)=>{await service();return (await db.query('SELECT finish_commercial_webhook_attempt($1,$2,$3) ok',[job.id,job.lease_token,status])).rows[0].ok;};
before(async()=>{db=await createSupabaseCompatibleDatabase();await applyMigrations(db);await seedAuthUsers(db);for(const owner of [OWNER_A,OWNER_B]){await setAuthenticatedOwner(db,owner);await db.query("INSERT INTO commercial_commitments(id,user_id,commitment_text,source_type) VALUES('promise',$1,'Private promise','manual')",[owner]);}});
after(async()=>db?.close());
test('signature binds raw bytes and timestamp and rejects stale, altered or malformed requests',()=>{
 const signature=webhookSignature(secret,timestamp,body);assert.equal(verifyWebhookSignature({secret,timestamp,body,signature,now:Number(timestamp)}),true);
 for(const patch of [{body:body+' '},{timestamp:'1790000001'},{signature:'v1='+'0'.repeat(64)},{now:Number(timestamp)+301},{secret:'short'}])assert.equal(verifyWebhookSignature({secret,timestamp,body,signature,now:Number(timestamp),...patch}),false);
});
test('outbound transport blocks private addresses, pins public DNS and never follows redirects',async()=>{
 for(const address of ['127.0.0.1','10.1.1.1','172.16.1.1','192.168.1.1','169.254.169.254','100.64.0.1','0.0.0.0','::1','224.1.1.1'])assert.equal(publicIPv4(address),false);
 assert.equal(publicIPv4('8.8.8.8'),true);let sent=0;
 await assert.rejects(postSignedWebhook('https://example.test',body,{}, {resolve:async()=>[{address:'127.0.0.1'}],send:()=>{sent++;}}));assert.equal(sent,0);
 const result=await postSignedWebhook('https://example.test/path',body,{}, {resolve:async()=>[{address:'8.8.8.8'}],send:(url,options,callback)=>{sent++;assert.equal(options.servername,'example.test');options.lookup('example.test',{all:true},(error,addresses)=>assert.deepEqual(addresses,[{address:'8.8.8.8',family:4}]));const outbound=new EventEmitter();outbound.end=()=>{callback({statusCode:302,destroy(){}});outbound.emit('close');};return outbound;}});assert.equal(result,302);assert.equal(sent,1);
});
test('delivery claims are idempotent, private state is omitted and changed recipients are refused',async()=>{
 const jobs=await claim();assert.equal(jobs.length,1);const job=jobs[0];assert.equal(job.status,'delivering');assert.equal(job.attempts,1);assert.equal(job.notification.subject.kind,'commitment');assert.equal(JSON.stringify(job.notification).includes('Private promise'),false);assert.equal('state' in job.notification,false);
 assert.equal((await claim()).length,0);await assert.rejects(claim(OWNER_A,'test','b'.repeat(64)),/target changed/);
 assert.equal(await finish({...job,lease_token:'00000000-0000-0000-0000-000000000000'},200),false);
 assert.equal(await finish(job,503),true);await setAuthenticatedOwner(db,OWNER_A);const retry=(await db.query("SELECT * FROM commercial_webhook_deliveries WHERE endpoint_id='test'")).rows[0];assert.equal(retry.status,'pending');assert.equal(retry.last_status,503);assert.ok(new Date(retry.next_attempt_at)>new Date(retry.updated_at));
 await db.exec('RESET ROLE');await db.exec("UPDATE commercial_webhook_deliveries SET next_attempt_at=now()-interval '1 second' WHERE endpoint_id='test'");const [again]=await claim();assert.equal(again.attempts,2);assert.deepEqual(again.notification,job.notification);assert.equal(await finish(again,204),true);assert.equal((await claim()).length,0);
});
test('two-owner RLS, anonymous denial and scheduler-only mutations protect delivery state',async()=>{
 await claim(OWNER_B);await setAuthenticatedOwner(db,OWNER_A);assert.ok((await db.query('SELECT * FROM commercial_webhook_deliveries')).rows.every(row=>row.user_id===OWNER_A));
 await assert.rejects(db.query('SELECT * FROM claim_commercial_webhook_batch($1,$2,$3,now())',[OWNER_A,'x',targetHash]),/permission denied/);await assert.rejects(db.exec("UPDATE commercial_webhook_deliveries SET status='delivered'"),/permission denied/);
 await db.exec('SET ROLE anon');await assert.rejects(db.query('SELECT * FROM commercial_webhook_deliveries'),/permission denied/);
});
test('expired leases retry, terminal responses stop and final crashed attempts cannot remain leased forever',async()=>{
 const [job]=await claim(OWNER_A,'leases');await db.exec('RESET ROLE');await db.query("UPDATE commercial_webhook_deliveries SET lease_until=now()-interval '1 second' WHERE id=$1",[job.id]);const [retry]=await claim(OWNER_A,'leases');assert.equal(retry.attempts,2);assert.notEqual(retry.lease_token,job.lease_token);assert.equal(await finish(job,200),false);assert.equal(await finish(retry,400),true);assert.equal((await claim(OWNER_A,'leases')).length,0);
 const [crash]=await claim(OWNER_A,'crash');await db.exec('RESET ROLE');await db.query("UPDATE commercial_webhook_deliveries SET attempts=8,lease_until=now()-interval '1 second' WHERE id=$1",[crash.id]);assert.equal((await claim(OWNER_A,'crash')).length,0);await setAuthenticatedOwner(db,OWNER_A);assert.equal((await db.query('SELECT status FROM commercial_webhook_deliveries WHERE id=$1',[crash.id])).rows[0].status,'failed');
});
test('delivery export is retained as an archive without restoring executable queue state',async()=>{
 await setAuthenticatedOwner(db,OWNER_A);const rows=(await db.query('SELECT * FROM commercial_webhook_deliveries')).rows;
 const backup={localBrowserData:{},formatVersion:14,exportedAt:new Date().toISOString(),cloudData:{user_id:OWNER_A,data:{commercial_webhook_deliveries:rows}}};const plan=buildRestorePlan(backup);const archive=JSON.parse(plan.writes.find(row=>row.key==='memoire.backup.cloudArchive.v1').value);assert.equal(archive.data.commercial_webhook_deliveries.length,rows.length);assert.equal(plan.writes.length,1);
 assert.throws(()=>buildRestorePlan({...backup,cloudData:{...backup.cloudData,user_id:OWNER_B}}),/ownership/);
});
test('configured scheduler signs real queued notifications and records outcomes without contacting external systems',async()=>{
 const env={CRON_SECRET:'test-scheduler-secret',COMMERCIAL_WEBHOOK_SECRET_TEST:secret,COMMERCIAL_WEBHOOK_TARGETS:JSON.stringify([{id:'worker',ownerId:OWNER_A,url:'https://example.test/hook',since:'2026-01-01T00:00:00Z',secretEnv:'COMMERCIAL_WEBHOOK_SECRET_TEST'}])};
 assert.equal(readWebhookTargets(env).length,1);assert.throws(()=>readWebhookTargets({...env,COMMERCIAL_WEBHOOK_SECRET_TEST:'short'}));let delivered=0;
 const worker=createWebhookWorker({env,clientFactory:()=>({rpc:async(name,args)=>{await service();try{const values=Object.values(args),result=await db.query(`SELECT ${name==='claim_commercial_webhook_batch'?'* FROM ':''}${name}(${values.map((_,i)=>'$'+(i+1)).join(',')})`,values);return {data:name==='claim_commercial_webhook_batch'?result.rows:result.rows[0].finish_commercial_webhook_attempt,error:null};}catch(error){return {error};}}}),deliver:async(url,raw,headers)=>{delivered++;assert.equal(url,'https://example.test/hook');assert.equal(verifyWebhookSignature({secret,body:raw,timestamp:headers['Memoire-Timestamp'],signature:headers['Memoire-Signature']}),true);return 200;}});
 assert.equal((await callHandler(worker,{method:'POST',headers:{}})).code,401);assert.equal(delivered,0);const response=await callHandler(worker,{method:'POST',headers:{authorization:'Bearer '+env.CRON_SECRET}});assert.equal(response.code,200);assert.equal(response.body.acknowledged,1);assert.equal(delivered,1);
});
test('populated upgrade retains original commercial history and queues only notifications',async()=>{
 const target=await createSupabaseCompatibleDatabase();try{const files=productionMigrations();await applyMigrations(target,files.slice(0,files.indexOf('20260930054843_commercial_webhook_deliveries.sql')));await seedAuthUsers(target);await setAuthenticatedOwner(target,OWNER_A);
  await target.query("INSERT INTO commercial_commitments(id,user_id,commitment_text,source_type) VALUES('existing',$1,'Keep existing truth','manual')",[OWNER_A]);const before=(await target.query('SELECT * FROM commercial_state_revisions')).rows;
  await target.exec('RESET ROLE');await applyMigrations(target,['20260930054843_commercial_webhook_deliveries.sql']);await target.exec('SET ROLE service_role');const jobs=(await target.query('SELECT * FROM claim_commercial_webhook_batch($1,$2,$3,$4)',[OWNER_A,'upgrade',targetHash,'2026-01-01T00:00:00Z'])).rows;assert.equal(jobs.length,1);
  await setAuthenticatedOwner(target,OWNER_A);assert.deepEqual((await target.query('SELECT * FROM commercial_state_revisions')).rows,before);
 }finally{await target.close();}
});
