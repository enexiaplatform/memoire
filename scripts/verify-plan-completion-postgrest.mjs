import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';

const endpoint = 'http://127.0.0.1:3300';
const secret = 'local-plan-fixture-only-secret-for-ci-postgrest';
const actor = '11111111-1111-4111-8111-111111111111';
const stranger = '22222222-2222-4222-8222-222222222222';
const session = randomUUID();
const firstBook = randomUUID();
const secondBook = randomUUID();
const otherBook = randomUUID();
const activityA = randomUUID();
const activityB = randomUUID();
const privateActivity = randomUUID();
const stamp = '2026-11-17T12:00:00.000Z';

function sql(source) {
  return execFileSync('docker', ['exec', '-i', process.env.PLAN_TEST_PG_CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-qAt'], {
    input: source, encoding: 'utf8', maxBuffer: 1024 * 1024,
  }).trim();
}
const fixture = readFileSync('scripts/release-database-harness.mjs', 'utf8').split('await db.exec(`')[1].split('`);')[0];
sql(fixture + "ALTER ROLE authenticator LOGIN PASSWORD 'fixture'; GRANT anon, authenticated, service_role TO authenticator; CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid NOT NULL,not_after timestamptz);");
for (const migration of readdirSync('supabase/migrations').filter(name => name.endsWith('.sql')).sort((a, b) => a.localeCompare(b))) {
  sql(readFileSync('supabase/migrations/' + migration, 'utf8'));
}
sql(`
  INSERT INTO auth.users(id,email) VALUES('${actor}','one@example.test'),('${stranger}','two@example.test');
  INSERT INTO auth.sessions(id,user_id) VALUES('${session}','${actor}');
  SELECT set_config('request.jwt.claim.sub','${actor}',false);
  SELECT public.memoire_create_native_workspace('${firstBook}','First',NULL,'{}');
  SELECT public.memoire_create_native_workspace('${secondBook}','Second',NULL,'{}');
  SELECT set_config('request.jwt.claim.sub','${stranger}',false);
  SELECT public.memoire_create_native_workspace('${otherBook}','Other',NULL,'{}');
  INSERT INTO sales_activities(id,user_id,raw_note,activity_type)
    SELECT a.id,w.data_owner_id,'Synthetic existing touch','Call'
    FROM (VALUES ('${activityA}'::uuid,'${firstBook}'::uuid), ('${activityB}'::uuid,'${firstBook}'::uuid),
      ('${privateActivity}'::uuid,'${secondBook}'::uuid)) AS a(id,book)
    JOIN memoire_private.workspace_data_owners w ON w.workspace_id=a.book;
  INSERT INTO plan_items(user_id,id,payload,updated_at)
    SELECT data_owner_id,p.id,jsonb_build_object('id',p.id,'label','Synthetic plan','date','2026-11-18',
      'done',false,'updatedAt','${stamp}'),'${stamp}'
    FROM memoire_private.workspace_data_owners CROSS JOIN (VALUES ('race'),('same'),('revoked')) p(id)
    WHERE workspace_id='${firstBook}';
`);

execFileSync('docker', [
  'run', '-d', '--name', 'plan-completion-postgrest', '--network', 'host',
  '-e', 'PGRST_DB_URI=postgres://authenticator:fixture@127.0.0.1:55432/postgres',
  '-e', 'PGRST_DB_ANON_ROLE=anon', '-e', 'PGRST_DB_SCHEMAS=public',
  '-e', 'PGRST_SERVER_PORT=3300', '-e', 'PGRST_JWT_SECRET=' + secret,
  'postgrest/postgrest:v13.0.7',
], { stdio: 'inherit', env: process.env });

function jwt(role, sub, sessionId) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const data = encode({ alg: 'HS256', typ: 'JWT' }) + '.' + encode({ role, sub, session_id: sessionId, exp: Math.floor(Date.now() / 1000) + 600 });
  return data + '.' + createHmac('sha256', secret).update(data).digest('base64url');
}
const service = jwt('service_role', actor);
const identity = jwt('authenticated', actor, session);
const request = (id, activity) => ({
  p_actor: actor, p_session: session, p_workspace: firstBook, p_request: randomUUID(), p_activity: activity,
  p_plan_id: id, p_derived_key: null, p_expected: stamp, p_label: null, p_tag: null,
});
async function rpc(payload, token = service) {
  const response = await fetch(endpoint + '/rpc/memoire_confirm_plan_completion', {
    method: 'POST', signal: AbortSignal.timeout(10_000),
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: JSON.stringify(payload),
  });
  return { code: response.status, data: await response.json() };
}

for (let i = 0; i < 40; i++) {
  const ready = await fetch(endpoint + '/').then(response => response.ok).catch(() => false);
  if (ready) break;
  await new Promise(resolve => setTimeout(resolve, 250));
}
assert.equal((await rpc(request('race', activityA), null)).code, 401);
assert.equal((await rpc(request('race', activityA), identity)).code, 403);
for (const scope of [null, secondBook, otherBook]) {
  const inaccessible = await rpc({ ...request('race', activityA), p_workspace: scope });
  assert.equal(inaccessible.code, 200);
  assert.equal(inaccessible.data.status, scope === otherBook ? 'unavailable' : 'activity_unavailable');
}
assert.equal((await rpc(request('race', privateActivity))).data.status, 'activity_unavailable');

const race = [request('race', activityA), request('race', activityB)];
const outcomes = await Promise.all(race.map(body => rpc(body)));
assert.deepEqual(outcomes.map(result => result.data.status).sort(), ['confirmed', 'conflict']);
const winningIndex = outcomes.findIndex(result => result.data.status === 'confirmed');
const committed = outcomes[winningIndex].data;
assert.equal(committed.transitioned, true);
assert.deepEqual((await rpc(race[winningIndex])).data, { ...committed, transitioned: false });

const same = [request('same', activityA), request('same', activityA)];
const equal = await Promise.all(same.map(body => rpc(body)));
assert.deepEqual(equal.map(outcome => outcome.data.transitioned).sort(), [false, true]);
assert.equal(equal[0].data.receiptId, equal[1].data.receiptId);
assert.equal(equal[0].data.record.doneAt, equal[1].data.record.doneAt);
assert.equal(sql('SELECT count(*) FROM public.sales_activities;'), '3');

const scoped = await fetch(endpoint + '/plan_items?select=id,payload&id=eq.race', {
  headers: { Authorization: 'Bearer ' + identity, 'x-memoire-data-workspace': firstBook },
});
assert.equal(scoped.status, 200);
assert.equal((await scoped.json())[0].payload.completionActivityId, committed.record.completionActivityId);

const owner = sql(`SELECT data_owner_id FROM memoire_private.workspace_data_owners WHERE workspace_id='${firstBook}';`);
const followUpId = 'review-plan-' + 'f'.repeat(64);
async function createFollowUp(token, workspace, label) {
  const response = await fetch(endpoint + '/plan_items?on_conflict=user_id,id&select=id', {
    method: 'POST', signal: AbortSignal.timeout(10_000),
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token,
      'x-memoire-data-workspace': workspace, Prefer: 'resolution=ignore-duplicates,return=representation' },
    body: JSON.stringify({
      user_id: owner, id: followUpId, created_at: stamp, updated_at: stamp,
      payload: { id: followUpId, date: '2026-11-21', label, done: false, createdAt: stamp, updatedAt: stamp,
        reviewProposal: { proposalId: 'proposal', sourceRecordIds: ['evidence'] } },
    }),
  });
  return { code: response.status, data: await response.json() };
}
for (const [token, scope] of [[identity, secondBook], [jwt('authenticated', stranger), firstBook]]) {
  assert.equal((await createFollowUp(token, scope, 'Unauthorized draft')).code, 403);
}
const labels = ['First tab wording', 'Second tab wording'];
const draftWrites = await Promise.all(labels.map(label => createFollowUp(identity, firstBook, label)));
assert.deepEqual(draftWrites.map(result => result.code), [201, 201]);
assert.deepEqual(draftWrites.map(result => result.data.length).sort(), [0, 1]);
const readPlan = await fetch(endpoint + '/plan_items?select=payload&id=eq.' + followUpId, {
  headers: { Authorization: 'Bearer ' + identity, 'x-memoire-data-workspace': firstBook },
});
assert.equal(readPlan.status, 200);
const [planned] = await readPlan.json();
assert.equal(planned.payload.label, labels[draftWrites.findIndex(result => result.data[0]?.id === followUpId)]);
assert.equal(planned.payload.done, false);
assert.equal(planned.payload.completionActivityId, undefined);
assert.equal(sql('SELECT count(*) FROM public.sales_activities;'), '3');
console.log('Review handoff: concurrent authenticated saves created one open Plan item and preserved the first wording.');
sql("DELETE FROM auth.sessions WHERE id='" + session + "';");
assert.equal((await rpc(request('revoked', activityA))).data.status, 'unauthorized');
console.log('PostgREST: explicit workspace scope, direct role denial, revocation, separate concurrent requests, stable receipts, and unchanged Activity count verified.');

async function readReviewStatus(token = identity, workspace = firstBook) {
  const response = await fetch(endpoint + '/rpc/memoire_review_plan_status', {
    signal: AbortSignal.timeout(10_000),
    headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(workspace ? { 'x-memoire-data-workspace': workspace } : {}) },
  });
  return { code: response.status, data: await response.json() };
}
const expected = {
  item_id: followUpId, proposal_id: 'proposal', label: planned.payload.label, plan_date: '2026-11-21',
  completion_status: 'planned', activity_id: null, activity_evidence: null,
};
assert.equal((await readReviewStatus()).code, 403);
sql(`INSERT INTO auth.sessions(id,user_id,not_after) VALUES('${session}','${actor}', now() - interval '1 second');`);
assert.equal((await readReviewStatus()).code, 403);
sql(`UPDATE auth.sessions SET not_after=NULL WHERE id='${session}';`);
assert.deepEqual(await readReviewStatus(), { code: 200, data: [expected] });
assert.deepEqual(await readReviewStatus(identity, null), { code: 200, data: [] });
assert.deepEqual(await readReviewStatus(identity, secondBook), { code: 200, data: [] });
assert.equal((await readReviewStatus(jwt('authenticated', actor))).code, 403);
assert.equal((await readReviewStatus(jwt('authenticated', stranger))).code, 403);
assert.ok([401, 403].includes((await readReviewStatus(null)).code));
const relatedOpportunity = randomUUID();
const asPlanOwner = source => sql(`SELECT set_config('request.jwt.claim.sub','${owner}',false); ${source}`);
asPlanOwner(`INSERT INTO public.opportunities(id,user_id,title,opportunity_name,status)
    VALUES('${relatedOpportunity}','${owner}','Fixture renewal','Fixture renewal','Won');
  UPDATE public.sales_activities SET activity_date='2026-11-16',summary='Discussed renewal terms',
    linked_opportunity_id='${relatedOpportunity}' WHERE id='${activityA}';`);
const followUpReceipt = (await rpc(request(followUpId, activityA))).data;
assert.equal(followUpReceipt.status, 'confirmed');
const activityEvidence = {
  date: '2026-11-16', type: 'Call', summary: 'Discussed renewal terms',
  opportunity_id: relatedOpportunity, opportunity_name: 'Fixture renewal', outcome: null,
  outcome_state: 'unrecorded', has_outcome_evidence: false, pending_follow_up: null,
};
assert.deepEqual((await readReviewStatus()).data,
  [{ ...expected, completion_status: 'verified_done', activity_id: activityA, activity_evidence: activityEvidence }]);
const readActivityEvidence = async () => (await readReviewStatus()).data[0].activity_evidence;
asPlanOwner(`UPDATE public.opportunities SET status='Active' WHERE id='${relatedOpportunity}';`);
assert.equal((await readActivityEvidence()).outcome_state, 'open');
sql(`INSERT INTO public.plan_items(user_id,id,payload) VALUES
  ('${stranger}','foreign-next',jsonb_build_object('linkedOpportunityId','${relatedOpportunity}','date','2026-11-22')),
  ('${owner}','deleted-next',jsonb_build_object('linkedOpportunityId','${relatedOpportunity}','date','2026-11-22','__deleted',true)),
  ('${owner}','existing-next',jsonb_build_object('linkedOpportunityId','${relatedOpportunity}','date','2026-11-23','done',false));`);
assert.deepEqual((await readActivityEvidence()).pending_follow_up, { item_id: 'existing-next', date: '2026-11-23' });
sql(`DELETE FROM public.plan_items WHERE user_id='${owner}' AND id='existing-next';`);
assert.equal((await readActivityEvidence()).pending_follow_up, null);
asPlanOwner(`UPDATE public.opportunities SET status='Won' WHERE id='${relatedOpportunity}';`);
const explicitOutcome = { result: 'Won', date: '2026-11-18', reason: 'Signed renewal' };
function insertOutcome(id, userId, result, date = '2026-11-18', reason = 'Signed renewal') {
  sql(`INSERT INTO public.opportunity_outcomes(user_id,id,payload) VALUES('${userId}','${id}',
    jsonb_build_object('opportunityId','${relatedOpportunity}','outcome','${result}','outcomeDate','${date}','reasonText','${reason}'));`);
}
insertOutcome('other-tenant', stranger, 'Won');
assert.deepEqual(await readActivityEvidence(), activityEvidence);
insertOutcome('incomplete-outcome', owner, 'Won', '2026-11-18', '');
assert.equal((await readActivityEvidence()).outcome_state, 'incomplete');
assert.equal((await readActivityEvidence()).has_outcome_evidence, true);
sql(`DELETE FROM public.opportunity_outcomes WHERE user_id='${owner}' AND id='incomplete-outcome';`);
insertOutcome('recorded-outcome', owner, 'Won');
assert.equal((await readActivityEvidence()).outcome_state, 'recorded');
assert.deepEqual((await readActivityEvidence()).outcome, explicitOutcome);
insertOutcome('conflicting-outcome', owner, 'Lost');
assert.equal((await readActivityEvidence()).outcome_state, 'conflicting');
assert.equal((await readActivityEvidence()).outcome, null);
sql(`DELETE FROM public.opportunity_outcomes WHERE user_id='${owner}' AND id='conflicting-outcome';`);
asPlanOwner(`UPDATE public.opportunities SET status='Lost' WHERE id='${relatedOpportunity}';`);
assert.equal((await readActivityEvidence()).outcome_state, 'conflicting');
asPlanOwner(`UPDATE public.opportunities SET status='Won' WHERE id='${relatedOpportunity}';`);
sql(`UPDATE public.opportunity_outcomes SET payload=payload || '{"outcomeDate":"2026-11-12"}'
  WHERE user_id='${owner}' AND id='recorded-outcome';`);
assert.equal((await readActivityEvidence()).outcome.date, '2026-11-12');
const foreignOpportunity = randomUUID();
sql(`SELECT set_config('request.jwt.claim.sub','${stranger}',false);
  INSERT INTO public.opportunities(id,user_id,title,opportunity_name,status)
    VALUES('${foreignOpportunity}','${stranger}','Foreign deal','Foreign deal','Active');
  UPDATE public.sales_activities SET linked_opportunity_id='${foreignOpportunity}' WHERE id='${activityA}';`);
assert.deepEqual(await readActivityEvidence(), {
  ...activityEvidence, opportunity_id: null, opportunity_name: null, outcome_state: 'unavailable',
});
sql(`UPDATE public.sales_activities SET linked_opportunity_id=NULL WHERE id='${activityA}';`);
assert.equal((await readActivityEvidence()).outcome_state, 'unlinked');
sql(`UPDATE public.sales_activities SET linked_opportunity_id='${relatedOpportunity}' WHERE id='${activityA}';`);

const forged = 'review-copy-with-foreign-receipt';
sql(`INSERT INTO public.plan_items (user_id,id,payload,updated_at)
  SELECT user_id,'${forged}',payload || '{"id":"${forged}","reviewProposal":{"proposalId":"forged"}}','${stamp}'
  FROM public.plan_items WHERE user_id='${owner}' AND id='${followUpId}';`);
const withForgery = (await readReviewStatus()).data;
assert.equal(withForgery.find(row => row.item_id === forged)?.completion_status, 'reported_done');
assert.equal(withForgery.find(row => row.item_id === forged)?.activity_id, null);
sql(`UPDATE public.plan_items SET payload=payload || jsonb_build_object('completionActivityId','${activityB}')
  WHERE user_id='${owner}' AND id='${followUpId}';`);
assert.equal((await readReviewStatus()).data.find(row => row.item_id === followUpId)?.completion_status, 'reported_done');
sql(`UPDATE public.plan_items SET payload=payload || jsonb_build_object('completionActivityId','${activityA}')
  WHERE user_id='${owner}' AND id='${followUpId}';
  DELETE FROM public.sales_activities WHERE user_id='${owner}' AND id='${activityA}';`);
assert.equal((await readReviewStatus()).data.find(row => row.item_id === followUpId)?.completion_status, 'reported_done');
sql(`UPDATE public.plan_items SET payload=payload || jsonb_build_object('completionActivityId','${activityA}','done',false)
  WHERE user_id='${owner}' AND id='${followUpId}';`);
assert.equal((await readReviewStatus()).data.find(row => row.item_id === followUpId)?.completion_status, 'planned');
sql(`UPDATE public.plan_items SET payload=payload || '{"__deleted":true}'
  WHERE user_id='${owner}' AND id='${followUpId}';`);
assert.ok(!(await readReviewStatus()).data.some(row => row.item_id === followUpId));
assert.equal((await readReviewStatus()).data.find(row => row.item_id === forged)?.activity_evidence, null);
console.log('Review evidence verified: active session, scoped Activity and outcome reads, conflicting outcomes, reopen, and deletion.');
