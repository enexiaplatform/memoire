import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createSupabaseCompatibleDatabase,applyMigrations,setAuthenticatedOwner} from '../../scripts/release-database-harness.mjs';
let db;
before(async()=>{db=await createSupabaseCompatibleDatabase();await applyMigrations(db);});
after(async()=>db?.close());
const tables=['opportunities','commercial_conditions','commercial_evidence','commercial_outcome_requirements','commercial_dependencies','commercial_timing_assertions','commercial_commitments','commercial_money_gates'];
async function fixture(type='quote_value'){
  const owner=randomUUID(),account=randomUUID(),opp=randomUUID();
  await db.exec('RESET ROLE');
  await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)',[owner,`${owner}@example.test`]);
  await setAuthenticatedOwner(db,owner);
  await db.query("INSERT INTO accounts(id,user_id,name,account_name) VALUES($1,$2,'Recovery','Recovery')",[account,owner]);
  await db.query("INSERT INTO opportunities(id,user_id,account_id,title,opportunity_name,stage,status,estimated_value) VALUES($1,$2,$3,'Recovery','Recovery','Proposal','Active',1000)",[opp,owner,account]);
  await db.query("INSERT INTO commercial_outcome_requirements(id,user_id,account_id,opportunity_id,expected_outcome,role,lifecycle,source_type,created_at,updated_at) VALUES('r',$1,$2,$3,'Approval','required_now','active','manual',now(),now())",[owner,account,opp]);
  await db.query("INSERT INTO quotes(user_id,id,payload) VALUES($1,'q',$2::jsonb)",[owner,JSON.stringify({id:'q',opportunityId:opp,amount:1000,status:'Sent',paymentStatus:'Not due'})]);
  await db.query("INSERT INTO commercial_money_gates(id,user_id,opportunity_id,money_source_type,money_source_id,requirement_id,basis_kind,basis,lifecycle,source_type,created_at,updated_at) VALUES('g',$1,$2,$3,$4,'r','customer_process','Approval before value','active','manual',now(),now())",[owner,opp,type,type==='quote_value'?'q':opp]);
  return {owner,account,opp};
}
async function recoveryPayload(f){
  const sources={};for(const table of tables)sources[table]=(await db.query(`SELECT * FROM ${table}`)).rows;
  const payload={user_id:f.owner,format_version:11,exported_at:new Date().toISOString(),sources,
    parents:(await db.query('SELECT * FROM accounts')).rows,quote_parents:(await db.query('SELECT * FROM quotes')).rows,
    coverage:(await db.query('SELECT * FROM commercial_history_coverage')).rows[0],revisions:(await db.query('SELECT * FROM commercial_state_revisions')).rows};
  // A fresh identity namespace models an empty recovery target without deleting live fixture history.
  const replacements=[[f.owner,randomUUID()],[f.account,randomUUID()],[f.opp,randomUUID()]];
  let text=JSON.stringify(payload);for(const [old,next] of replacements)text=text.replaceAll(old,next);
  for(const id of ['r','g','q'])text=text.replaceAll(JSON.stringify(id),JSON.stringify(`${id}-${randomUUID()}`));
  const result=JSON.parse(text);result.coverage.lineage_id=randomUUID();
  for(const revision of result.revisions){revision.id=randomUUID();revision.mutation_id=randomUUID();}
  await db.exec('RESET ROLE');await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)',[result.user_id,`${result.user_id}@example.test`]);
  await setAuthenticatedOwner(db,result.user_id);return result;
}
const restore=async p=>(await db.query('SELECT restore_commercial_history($1::jsonb) AS result',[JSON.stringify(p)])).rows[0].result;
test('a gate can be retired after its Opportunity closes',async()=>{
  const f=await fixture('opportunity_value');
  await db.query("UPDATE opportunities SET status='Won' WHERE id=$1",[f.opp]);
  await db.query("UPDATE commercial_money_gates SET lifecycle='retired',updated_at=clock_timestamp() WHERE id='g'");
  assert.equal((await db.query("SELECT lifecycle FROM commercial_money_gates WHERE id='g'")).rows[0].lifecycle,'retired');
});
test('restore keeps a paid Quote and its original gate history together without new revisions',async()=>{
  const f=await fixture();
  await db.query("UPDATE quotes SET payload=jsonb_set(payload,'{paymentStatus}','\"Paid\"') WHERE id='q'");
  const payload=await recoveryPayload(f);
  assert.equal((await restore(payload)).status,'restored');
  assert.equal((await db.query('SELECT payload FROM quotes')).rows[0].payload.paymentStatus,'Paid');
  assert.equal((await db.query('SELECT count(*)::int n FROM commercial_state_revisions')).rows[0].n,payload.revisions.length);
  assert.equal((await restore(payload)).status,'no_op');
});
test('missing Quote parent fails atomically and cannot create history coverage',async()=>{
  const payload=await recoveryPayload(await fixture());payload.quote_parents=[];
  await assert.rejects(restore(payload),/source|Quote/i);
  assert.equal((await db.query('SELECT count(*)::int n FROM opportunities')).rows[0].n,0);
  assert.equal((await db.query('SELECT count(*)::int n FROM commercial_history_coverage')).rows[0].n,0);
});
test('a new gate still requires an eligible source, and clients cannot forge restore context',async()=>{
  const f=await fixture();
  await db.query("UPDATE quotes SET payload=jsonb_set(payload,'{paymentStatus}','\"Paid\"') WHERE id='q'");
  await db.query("UPDATE commercial_money_gates SET lifecycle='retired',updated_at=clock_timestamp() WHERE id='g'");
  await assert.rejects(db.query("INSERT INTO commercial_money_gates SELECT 'new',user_id,opportunity_id,money_source_type,money_source_id,requirement_id,basis_kind,basis,'active',created_at,updated_at,source_type,source_id,source_url,source_updated_at FROM commercial_money_gates WHERE id='g'"),/source/i);
  await assert.rejects(db.query('INSERT INTO commercial_history_restore_context(transaction_id,user_id) VALUES(txid_current(),$1)',[f.owner]),/permission denied/i);
  assert.equal((await db.query('SELECT is_commercial_history_restore($1) AS active',[f.owner])).rows[0].active,false);
});
test('a restored gate may retain a retired Requirement without reactivating it',async()=>{
  const f=await fixture();
  await db.query("UPDATE commercial_outcome_requirements SET lifecycle='retired',updated_at=clock_timestamp() WHERE id='r'");
  const payload=await recoveryPayload(f);
  assert.equal((await restore(payload)).status,'restored');
  assert.equal((await db.query('SELECT lifecycle FROM commercial_outcome_requirements')).rows[0].lifecycle,'retired');
});
test('divergent Quote parents are preserved and cross-owner parents are rejected',async()=>{
  const payload=await recoveryPayload(await fixture());
  const parent=payload.quote_parents[0];
  await db.query('INSERT INTO quotes(user_id,id,payload) VALUES($1,$2,$3)',[payload.user_id,parent.id,{...parent.payload,amount:999}]);
  await assert.rejects(restore(payload),/diverged/i);
  assert.equal((await db.query('SELECT payload FROM quotes')).rows[0].payload.amount,999);
  assert.equal((await db.query('SELECT count(*)::int n FROM commercial_history_coverage')).rows[0].n,0);
  parent.user_id=randomUUID();await assert.rejects(restore(payload),/scope|identity/i);
});
