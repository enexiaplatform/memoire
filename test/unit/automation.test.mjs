import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { createSupabaseCompatibleDatabase, applyMigrations, seedAuthUsers, OWNER_A, OWNER_B, setAuthenticatedOwner } from '../../scripts/release-database-harness.mjs';
import { createAutomationHandler, createAutomationWorker, executeAutomationRun, prepareAutomationWork } from '../../.memoire-server/commercial.mjs';
import { AUTOMATION_DEFAULTS, parseAutomationSettings, automationBusinessClock } from '../../shared/automation.js';
import { callHandler } from '../support/commercialApiDatabase.mjs';

let db;
const config = { ...AUTOMATION_DEFAULTS, enabled: true, timezone: 'UTC', runHour: 0, quoteFollowup: true, commitmentReminder: true };
const env = { AUTOMATION_ENABLED: 'true', CRON_SECRET: 'fictional-cron-secret', SUPABASE_SERVICE_ROLE_KEY: 'fictional-service-key' };
const date = new Date().toISOString().slice(0, 10);
const oldDate = new Date(Date.parse(`${date}T00:00:00Z`) - 10 * 86400000).toISOString().slice(0, 10);
const tables = new Set(['memoire_automation_settings', 'memoire_automation_runs', 'memoire_automation_outputs']);
const rpcs = new Set(['memoire_save_automation_settings', 'memoire_preview_automation', 'memoire_claim_automation_run', 'memoire_read_automation_run', 'memoire_finish_automation_run', 'memoire_finish_automation_cycle', 'memoire_fail_automation_run']);
async function asOwner() { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub','',false)"); }
function client(owner) {
  const scope = async () => {
    if (owner) await setAuthenticatedOwner(db, owner);
    else { await asOwner(); await db.exec('set role service_role'); }
  };
  return {
    async rpc(name, args = {}) {
      assert.ok(rpcs.has(name)); await scope();
      try {
        const entries = Object.entries(args);
        assert.ok(entries.every(([key]) => /^p_[a-z_]+$/.test(key)));
        const result = await db.query(`select public.${name}(${entries.map(([key], i) => `${key}=>$${i + 1}`).join(',')}) as result`,
          entries.map(([, value]) => value && typeof value === 'object' ? JSON.stringify(value) : value));
        return { data: result.rows[0].result, error: null };
      } catch (error) { return { data: null, error }; }
    },
    from(table) {
      assert.ok(tables.has(table)); const filters = [], values = []; let columns = '*', order = '', limit = 20, single = false;
      const query = {
        select(value) { assert.match(value, /^[a-z_,*]+$/); columns = value; return this; },
        eq(key, value) {
          assert.ok(['user_id', 'id', 'config->>enabled'].includes(key));
          filters.push(`${key === 'config->>enabled' ? "config->>'enabled'" : key}=$${values.push(value)}`); return this;
        },
        gt(key, value) { assert.equal(key, 'user_id'); filters.push(`user_id>$${values.push(value)}`); return this; },
        order(key, options) { assert.ok(['user_id', 'started_at', 'prepared_at'].includes(key)); order = `order by ${key} ${options.ascending ? 'asc' : 'desc'}`; return this; },
        limit(value) { limit = value; return this; }, maybeSingle() { single = true; return this; },
        then(resolve, reject) { return (async () => {
          await scope();
          try { const result = await db.query(`select ${columns} from public.${table} ${filters.length ? `where ${filters.join(' and ')}` : ''} ${order} limit ${limit}`, values);
            return { data: single ? result.rows[0] || null : result.rows, error: null };
          } catch (error) { return { data: null, error }; }
        })().then(resolve, reject); },
      }; return query;
    },
  };
}
function handler(options = {}) {
  return createAutomationHandler({ env, verify: async token => token === 'owner-a' ? { id: OWNER_A } : token === 'owner-b' ? { id: OWNER_B } : null,
    clientForToken: token => client(token === 'owner-a' ? OWNER_A : OWNER_B), adminClient: () => client(), rateLimit: () => ({ allowed: true }), ...options });
}
async function save(value = config, revision = 0, owner = OWNER_A) {
  const result = await client(owner).rpc('memoire_save_automation_settings', { p_config: value, p_revision: revision });
  assert.equal(result.error, null); return result.data;
}
async function claim() {
  const result = await client().rpc('memoire_claim_automation_run', { p_owner: OWNER_A, p_revision: 1, p_manual: true });
  assert.equal(result.error, null); assert.ok(result.data); return result.data;
}
async function read(job) {
  const result = await client().rpc('memoire_read_automation_run', { p_run: job.id, p_lease: job.lease_token });
  assert.equal(result.error, null); return result.data;
}
async function finish(job, snapshot, work = prepareAutomationWork(snapshot.snapshot, config, snapshot.businessDate)) {
  return client().rpc('memoire_finish_automation_run', { p_run: job.id, p_lease: job.lease_token,
    p_fingerprint: snapshot.fingerprint, p_candidates: work.candidates, p_retire_ids: work.retireIds, p_summary: {} });
}
before(async () => { db = await createSupabaseCompatibleDatabase(); await db.exec('alter role service_role bypassrls'); await applyMigrations(db); await seedAuthUsers(db); });
after(async () => db?.close());
beforeEach(async () => {
  await asOwner();
  await db.exec('delete from memoire_automation_runs; delete from memoire_automation_settings; delete from plan_items; delete from quotes;');
  for (const owner of [OWNER_A, OWNER_B]) {
    await setAuthenticatedOwner(db, owner);
    await db.query('delete from commercial_commitments where user_id=$1', [owner]);
    await db.query('insert into quotes(user_id,id,payload) values($1,$2,$3)', [owner, 'quote-1', JSON.stringify({ id: 'payload-cannot-change-id', quoteDate: oldDate, status: 'Sent', poStatus: 'Pending', title: 'Fictional analyzer', accountName: owner === OWNER_A ? 'Owner A private' : 'Owner B private', source: 'user' })]);
    await db.query("insert into commercial_commitments(user_id,id,commitment_text,account_name,owner_label,current_due_date,commitment_party,status,source_type) values($1,'promise-1','Send technical criteria','Fictional customer','Buyer',$2,'customer','open','manual')", [owner, date]);
  }
});

test('settings validation and named timezones are strict, including DST and local date boundaries', () => {
  assert.throws(() => parseAutomationSettings({ ...config, userId: OWNER_B }));
  for (const patch of [{ runHour: 24 }, { quoteDays: 0 }, { maxPlanItems: 11 }, { enabled: 'true' }, { timezone: 'not/a-zone' }]) assert.throws(() => parseAutomationSettings({ ...config, ...patch }));
  assert.deepEqual(automationBusinessClock({ ...config, timezone: 'Asia/Ho_Chi_Minh' }, new Date('2026-10-19T18:00:00Z')), { date: '2026-10-20', hour: 1 });
  assert.equal(automationBusinessClock({ ...config, timezone: 'America/New_York' }, new Date('2026-07-01T12:00:00Z')).hour, 8);
  assert.equal(automationBusinessClock({ ...config, timezone: 'America/New_York' }, new Date('2026-12-01T12:00:00Z')).hour, 7);
});
test('real RLS and RPC privileges isolate owners, configuration and worker authority', async () => {
  await save();
  const foreign = await client(OWNER_B).from('memoire_automation_settings').select('*').eq('user_id', OWNER_A).maybeSingle();
  assert.equal(foreign.data, null);
  assert.ok((await client(OWNER_B).rpc('memoire_claim_automation_run', { p_owner: OWNER_A, p_revision: 1, p_manual: true })).error);
  const stale = await client(OWNER_A).rpc('memoire_save_automation_settings', { p_config: config, p_revision: 0 }); assert.match(stale.error.message, /settings_changed/);
  await asOwner(); await db.exec('set role anon');
  await assert.rejects(db.query('select public.memoire_preview_automation()'), /permission denied/);
  await assert.rejects(db.query('select * from public.memoire_automation_runs'), /permission denied/);
});
test('preview uses owner cloud records, makes no writes and rejects forged or unsupported commands', async () => {
  const response = await callHandler(handler(), { method: 'POST', body: { command: 'preview', config } });
  assert.equal(response.code, 200); assert.equal(response.body.preview, true); assert.equal(response.body.candidates.length, 2);
  assert.ok(response.body.candidates.every(item => item.sourceId !== 'payload-cannot-change-id'));
  await asOwner(); assert.equal((await db.query('select count(*)::int n from plan_items')).rows[0].n, 0);
  assert.equal((await db.query('select count(*)::int n from memoire_automation_runs')).rows[0].n, 0);
  for (const body of [{ command: 'run', ownerId: OWNER_B }, { command: 'send-email' }, { command: 'save', config, revision: -1 }]) assert.equal((await callHandler(handler(), { method: 'POST', body })).code, 400);
  assert.equal((await callHandler(handler(), { headers: {} })).code, 401);
  assert.equal((await callHandler(handler({ env: {} }), { method: 'POST', body: { command: 'save', config, revision: 0 } })).code, 503);
});
test('scheduler executes without a browser, repeats safely and persists exact-source Plan metadata', async () => {
  await save();
  const worker = createAutomationWorker({ env, clientFactory: () => client() });
  assert.equal((await callHandler(worker, { headers: {} })).code, 401);
  const request = { method: 'POST', headers: { authorization: `Bearer ${env.CRON_SECRET}` } };
  const first = await callHandler(worker, request); assert.equal(first.code, 200); assert.equal(first.body.completed, 1);
  const second = await callHandler(worker, request); assert.equal(second.body.skipped, 1);
  await asOwner(); const plans = (await db.query('select * from plan_items order by id')).rows;
  assert.equal(plans.length, 2); assert.ok(plans.every(row => row.user_id === OWNER_A));
  assert.ok(plans.every(row => row.id === row.payload.id && row.payload.automation.runId && row.payload.source === 'user' && !row.payload.done));
  const loaded = await callHandler(handler(), {}); assert.equal(loaded.body.runs[0].status, 'completed');
  assert.equal(loaded.body.runs[0].summary.createdPlanIds.length, 2);
  assert.equal(JSON.stringify(loaded.body).includes('Owner B private'), false);
  assert.equal(loaded.body.schedulerVerified, false);
});
test('source change aborts the whole application, with bounded recoverable retry', async () => {
  const settings = await save(), job = await claim(), snapshot = await read(job);
  await setAuthenticatedOwner(db, OWNER_A); await db.query("update commercial_commitments set status='completed' where user_id=$1", [OWNER_A]);
  const result = await finish(job, snapshot); assert.equal(result.error, null); assert.equal(result.data.retryable, true);
  await asOwner(); assert.equal((await db.query('select count(*)::int n from plan_items')).rows[0].n, 0);
  const retry = await executeAutomationRun(client(), settings, true); assert.equal(retry.status, 'completed'); assert.equal(retry.summary.createdPlanIds.length, 1);
});
test('pause between preparation and application revokes pending work', async () => {
  await save(); const job = await claim(), snapshot = await read(job);
  await save({ ...config, enabled: false }, 1);
  const result = await finish(job, snapshot); assert.equal(result.data.cancelled, true);
  await asOwner(); assert.equal((await db.query('select count(*)::int n from plan_items')).rows[0].n, 0);
});
test('live leases exclude a second worker, expired leases recover and old workers cannot commit', async () => {
  await save(); const old = await claim(), snapshot = await read(old);
  const active = await client().rpc('memoire_claim_automation_run', { p_owner: OWNER_A, p_revision: 1, p_manual: true }); assert.equal(active.data, null);
  await asOwner(); await db.query("update memoire_automation_runs set lease_until=now()-interval '1 second' where id=$1", [old.id]);
  const replacement = await claim(); assert.equal(replacement.attempts, 2); assert.notEqual(old.lease_token, replacement.lease_token);
  assert.ok((await finish(old, snapshot)).error);
  assert.equal((await client().rpc('memoire_fail_automation_run', { p_run: old.id, p_lease: old.lease_token })).data, false);
});
test('uncertain acknowledgement after commit cannot downgrade or duplicate completed work', async () => {
  const settings = await save(), real = client();
  const uncertain = { ...real, async rpc(name, args) { const result = await real.rpc(name, args); return name === 'memoire_finish_automation_cycle' ? { data: null, error: new Error('lost acknowledgement') } : result; } };
  await assert.rejects(executeAutomationRun(uncertain, settings, true), /unconfirmed/);
  assert.equal((await executeAutomationRun(real, settings, true)).status, 'skipped');
  await asOwner(); assert.equal((await db.query('select count(*)::int n from plan_items')).rows[0].n, 2);
  assert.equal((await db.query('select status from memoire_automation_runs')).rows[0].status, 'completed');
});
test('closed/sample sources, derived work, handled reminders and limits prevent new duplicate work', async () => {
  const snapshot = (await client(OWNER_A).rpc('memoire_preview_automation')).data;
  snapshot.quotes.push({ id: 'sample', payload: { ...snapshot.quotes[0].payload, isSample: true } });
  snapshot.commitments.push({ ...snapshot.commitments[0], id: 'plan:derived' });
  let work = prepareAutomationWork(snapshot, { ...config, maxPlanItems: 1 }, date);
  assert.equal(work.candidates.length, 1); assert.equal(work.counts.deferred, 1);
  const candidate = work.candidates[0];
  snapshot.plans.push({ id: 'manual', payload: { id: 'manual', suggestionKey: `automation:${candidate.key}`, done: true } });
  work = prepareAutomationWork(snapshot, config, date); assert.equal(work.candidates.length, 1); assert.equal(work.counts.alreadyHandled, 1);
  snapshot.quotes[0].payload.status = 'Accepted'; snapshot.commitments[0].status = 'completed';
  assert.equal(prepareAutomationWork(snapshot, config, date).candidates.length, 0);
});
test('source retirement preserves manual edits and ignores paused reminder rules', () => {
  const snapshot = { opportunities: [], quotes: [], commitments: [], activities: [], expenses: [], plans: [
    { id: 'untouched', payload: { createdAt: 'same', updatedAt: 'same', automation: { key: 'old', rule: 'quote-followup', sourceId: 'q' } } },
    { id: 'edited', payload: { createdAt: 'before', updatedAt: 'after', automation: { key: 'old', rule: 'quote-followup', sourceId: 'q' } } },
  ] };
  assert.deepEqual(prepareAutomationWork(snapshot, config, date).retireIds, ['untouched']);
  assert.deepEqual(prepareAutomationWork(snapshot, { ...config, quoteFollowup: false }, date).retireIds, []);
});
test('applying a batch is atomic if a later candidate is invalid', async () => {
  await save(); const job = await claim(), snapshot = await read(job);
  const work = prepareAutomationWork(snapshot.snapshot, config, snapshot.businessDate);
  work.candidates[1].label = '';
  assert.ok((await finish(job, snapshot, work)).error);
  await asOwner(); assert.equal((await db.query('select count(*)::int n from plan_items')).rows[0].n, 0);
});
test('database retirement dismisses untouched reminders, keeps manually edited work and never changes the promise', async () => {
  const settings = await save(); await executeAutomationRun(client(), settings, true);
  await asOwner();
  await db.query("update memoire_automation_runs set business_date=business_date-1 where user_id=$1", [OWNER_A]);
  await db.query("update plan_items set payload=payload||jsonb_build_object('label','User moved reminder','updatedAt','2090-01-01T00:00:00Z') where user_id=$1 and payload->'automation'->>'rule'='commitment-reminder'", [OWNER_A]);
  await setAuthenticatedOwner(db, OWNER_A);
  await db.query("update quotes set payload=payload||'{\"status\":\"Accepted\"}'::jsonb where user_id=$1", [OWNER_A]);
  await db.query("update commercial_commitments set status='completed' where user_id=$1", [OWNER_A]);
  const result = await executeAutomationRun(client(), settings, true); assert.equal(result.status, 'completed'); assert.equal(result.summary.retiredPlanIds.length, 1);
  await asOwner(); const rows = (await db.query('select payload from plan_items where user_id=$1', [OWNER_A])).rows;
  assert.equal(rows.find(row => row.payload.label === 'User moved reminder').payload.dismissed, undefined);
  assert.equal(rows.filter(row => row.payload.dismissed).length, 1);
  assert.equal((await db.query('select status from commercial_commitments where user_id=$1', [OWNER_A])).rows[0].status, 'completed');
});
test('three failed attempts exhaust the day budget rather than loop indefinitely', async () => {
  await save();
  for (let i = 1; i <= 3; i++) {
    const job = await claim(); assert.equal(job.attempts, i);
    assert.equal((await client().rpc('memoire_fail_automation_run', { p_run: job.id, p_lease: job.lease_token })).data, true);
  }
  assert.equal((await client().rpc('memoire_claim_automation_run', { p_owner: OWNER_A, p_revision: 1, p_manual: true })).data, null);
});
test('deleted reminders remain refused and do not starve other work under the daily limit', async () => {
  const settings = await save({ ...config, maxPlanItems: 1 });
  const first = await executeAutomationRun(client(), settings, true); assert.equal(first.summary.createdPlanIds.length, 1);
  await asOwner();
  await db.query("update plan_items set payload=jsonb_build_object('id',id,'__deleted',true) where user_id=$1", [OWNER_A]);
  await db.query("update memoire_automation_runs set business_date=business_date-1 where user_id=$1", [OWNER_A]);
  const next = await executeAutomationRun(client(), settings, true); assert.equal(next.summary.createdPlanIds.length, 1);
  assert.notEqual(next.summary.createdPlanIds[0], first.summary.createdPlanIds[0]);
  await asOwner(); assert.equal((await db.query("select count(*)::int n from plan_items where user_id=$1 and payload->>'__deleted'='true'", [OWNER_A])).rows[0].n, 1);
});
test('scheduled claims respect the saved timezone and start hour while Run now can run early', async () => {
  const zone = ['UTC', 'Asia/Ho_Chi_Minh'].find(timezone => automationBusinessClock({ ...config, timezone }).hour < 23);
  const clock = automationBusinessClock({ ...config, timezone: zone });
  await save({ ...config, timezone: zone, runHour: clock.hour + 1 });
  assert.equal((await client().rpc('memoire_claim_automation_run', { p_owner: OWNER_A, p_revision: 1, p_manual: false })).data, null);
  assert.ok((await client().rpc('memoire_claim_automation_run', { p_owner: OWNER_A, p_revision: 1, p_manual: true })).data);
});

test('intraday cycles share one daily Plan cap and preserve completed legacy receipts', async () => {
  const settings=await save({...config,continuous:true,maxPlanItems:1});
  const first=await executeAutomationRun(client(),settings,true); assert.equal(first.status,'completed');
  assert.equal(first.summary.createdPlanIds.length,1);
  await asOwner(); await db.query("update memoire_automation_runs set run_key='previous-slot' where user_id=$1",[OWNER_A]);
  const second=await executeAutomationRun(client(),settings,true); assert.equal(second.status,'completed');
  assert.equal(second.summary.createdPlanIds.length,0); assert.equal(second.summary.dailyCreated,1); assert.equal(second.summary.dailyCapDeferred,1);
  await asOwner(); assert.equal((await db.query('select count(*)::int n from plan_items')).rows[0].n,1);
  assert.equal((await db.query('select count(*)::int n from memoire_automation_runs')).rows[0].n,2);
  assert.equal((await executeAutomationRun(client(),settings,true)).status,'skipped');
});

test('prepared outputs commit with work, isolate owners, export without restore authority and do not replay on acknowledgement', async () => {
  const settings=await save({...config,weeklyReview:true,preparedOutputs:true});
  const result=await executeAutomationRun(client(),settings,true); assert.equal(result.status,'completed');
  const loaded=await callHandler(handler(),{}); assert.equal(loaded.code,200); assert.equal(loaded.body.outputs.length,9);
  assert.ok(loaded.body.outputs.every(row=>!row.payload));
  const id=loaded.body.outputs[0].id;
  const output=await callHandler(handler(),{method:'POST',body:{command:'output',id}});
  assert.equal(output.code,200); assert.equal(output.body.output.user_id,OWNER_A);
  const foreign=await callHandler(handler(),{headers:{authorization:'Bearer owner-b'},method:'POST',body:{command:'output',id}});
  assert.equal(foreign.code,404);
  await setAuthenticatedOwner(db,OWNER_A);
  await assert.rejects(db.query("update memoire_automation_outputs set title='Forged' where user_id=$1",[OWNER_A]),/permission denied/);
  await assert.rejects(db.query("select memoire_finish_automation_cycle(null,null,'x','[]','[]','{}','[]')"),/permission denied/);
  await asOwner(); await db.exec('set role anon'); await assert.rejects(db.query('select * from memoire_automation_outputs'),/permission denied/);
});

test('invalid prepared output rolls back the entire Plan batch and an expanded-source race prevents commit', async () => {
  await save({...config,preparedOutputs:true});
  const job=await claim(), snapshot=await read(job), work=prepareAutomationWork(snapshot.snapshot,{...config,preparedOutputs:true},snapshot.businessDate);
  const bad=await client().rpc('memoire_finish_automation_cycle',{p_run:job.id,p_lease:job.lease_token,p_fingerprint:snapshot.fingerprint,
    p_candidates:work.candidates,p_retire_ids:[],p_summary:{},p_outputs:[{key:'bad',kind:'send-email',title:'Unapproved',href:'/app/today',period:date,payload:{}}]});
  assert.ok(bad.error);
  await asOwner(); assert.equal((await db.query('select count(*)::int n from plan_items')).rows[0].n,0);
  await db.query("insert into supplier_commitments(user_id,id,payload) values($1,'race',$2)",[OWNER_A,JSON.stringify({id:'race',status:'open',dueDate:date,label:'Late source insert'})]);
  const changed=await client().rpc('memoire_finish_automation_cycle',{p_run:job.id,p_lease:job.lease_token,p_fingerprint:snapshot.fingerprint,
    p_candidates:work.candidates,p_retire_ids:[],p_summary:{},p_outputs:work.outputs});
  assert.equal(changed.error,null); assert.equal(changed.data.retryable,true);
  await asOwner(); assert.equal((await db.query('select count(*)::int n from memoire_automation_outputs')).rows[0].n,0);
  await db.query("delete from supplier_commitments where user_id=$1 and id='race'",[OWNER_A]);
});

test('an opted-in supplier rule writes a source-linked Plan item through the real new RPC whitelist', async () => {
  await asOwner();await db.query('insert into supplier_commitments(user_id,id,payload) values($1,$2,$3)',[OWNER_A,'new-rule',JSON.stringify({status:'open',party:'supplier',kind:'Document',label:'Send source certificate',dueDate:date})]);
  const settings=await save({...config,quoteFollowup:false,commitmentReminder:false,supplierReminder:true});
  const run=await executeAutomationRun(client(),settings,true);assert.equal(run.status,'completed');assert.equal(run.summary.createdPlanIds.length,1);
  await asOwner();const plan=(await db.query('select payload from plan_items')).rows[0].payload;
  assert.equal(plan.automation.rule,'supplier-reminder');assert.equal(plan.automation.sourceId,'new-rule');assert.equal(plan.done,false);
  await db.query("delete from supplier_commitments where user_id=$1 and id='new-rule'",[OWNER_A]);
});

test('large imported notes and private contact fields do not consume the bounded preparation snapshot', async () => {
  await setAuthenticatedOwner(db,OWNER_A);
  const account=(await db.query("insert into accounts(user_id,name,account_name,notes,source_file) values($1,'Fictional account','Fictional account',repeat('x',3000000),'import.xlsx') returning id",[OWNER_A])).rows[0].id;
  // Imported fixture setup is privileged; the actual preview below uses owner authentication.
  await asOwner();
  const person=(await db.query("insert into stakeholders(user_id,account_id,account_name,name,email,phone,notes,source_file) values($1,$2,'Fictional account','Fictional contact','fictional@example.test','000',repeat('y',3000000),'import.xlsx') returning id",[OWNER_A,account])).rows[0].id;
  const result=await client(OWNER_A).rpc('memoire_preview_automation');assert.equal(result.error,null);
  assert.equal(result.data.accounts[0].id,account);assert.equal(result.data.stakeholders[0].id,person);
  for(const row of [...result.data.accounts,...result.data.stakeholders]){assert.equal(row.notes,undefined);assert.equal(row.email,undefined);assert.equal(row.phone,undefined);assert.equal(row.source_file,undefined);}
  assert.ok(JSON.stringify(result.data).length<100000);
  await asOwner();await db.query('delete from stakeholders where id=$1',[person]);await db.query('delete from accounts where id=$1',[account]);
});
