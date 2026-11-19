import assert from 'node:assert/strict';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { createClient } from '@supabase/supabase-js';
import { createCommercialHandler } from '../.memoire-server/commercial.mjs';
import { callHandler } from '../test/support/commercialApiDatabase.mjs';
import { productionMigrations, OWNER_A, OWNER_B } from './release-database-harness.mjs';

const container = process.env.COMMERCIAL_TEST_PG_CONTAINER;
assert.match(container ?? '', /^[a-f0-9]{64}$/);
assert.equal(process.env.CI, 'true');
assert.ok(!Object.keys(process.env).some(key => /^(SUPABASE|VERCEL|VITE_|PGPASSWORD)/.test(key)));
const endpoint = 'http://127.0.0.1:3302';
const secret = randomBytes(32).toString('hex');
const name = 'commercial-receipt-test';
const book = 'bbbbbbbb-1111-4111-8111-111111111171';
const sibling = 'bbbbbbbb-1111-4111-8111-111111111172';
const observation = { schemaVersion: 1, sourceKind: 'crm', sourceNamespace: 'fixture', sourceEventId: 'same', sourceVersion: '1',
  observedAt: '2026-11-17T12:00:00.000Z', summary: 'Reported decision', rawText: 'Synthetic observation.' };
const envelope = observation => ({ command: 'receive-observation', version: 1, observation });
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
function jwt(role, sub) {
  const input = encode({ alg: 'HS256', typ: 'JWT' }) + '.' + encode({ role, sub, exp: Math.floor(Date.now() / 1000) + 600 });
  return input + '.' + createHmac('sha256', secret).update(input).digest('base64url');
}
const tokens = new Map([[jwt('authenticated', OWNER_A), OWNER_A], [jwt('authenticated', OWNER_B), OWNER_B]]);

function sql(input) {
  return execFileSync('docker', ['exec', '-i', container, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-qAt'], {
    input, encoding: 'utf8', timeout: 15_000,
  }).trim();
}

const roleFixture = readFileSync('scripts/release-database-harness.mjs', 'utf8').split('await db.exec(`')[1].split('`);')[0];
sql(roleFixture + "ALTER ROLE authenticator LOGIN PASSWORD 'fixture'; GRANT anon, authenticated, service_role TO authenticator;");
for (const migration of productionMigrations()) sql(readFileSync('supabase/migrations/' + migration, 'utf8'));
sql(`
  INSERT INTO auth.users(id,email) VALUES ('${OWNER_A}','a@example.test'),('${OWNER_B}','b@example.test');
  SELECT set_config('request.jwt.claim.sub','${OWNER_A}',false);
  SELECT public.memoire_create_native_workspace('${book}','Review A',NULL,'{}');
  SELECT public.memoire_create_native_workspace('${sibling}','Review B',NULL,'{}');
`);

let transport = fetch;
let arrival = 0;
function synchronizedWrites() {
  let release;
  const ready = new Promise(resolve => { release = resolve; });
  arrival = 0;
  transport = async (url, options) => {
    if (options?.method === 'POST' && new URL(url).pathname === '/commercial_events') {
      arrival += 1;
      if (arrival === 2) release();
      await Promise.race([ready, delay(5000, undefined, { ref: false })]);
      assert.equal(arrival, 2, 'Both app calls must reach the write boundary.');
    }
    return fetch(url, options);
  };
}

const handler = createCommercialHandler({
  // Test identity mapping replaces only upstream Auth; PostgREST validates real fixture JWTs and runs RLS.
  verify: async token => tokens.has(token) ? { id: tokens.get(token) } : null,
  rateLimit: () => ({ allowed: true }),
  clientForToken: (token, workspace) => createClient(endpoint, jwt('anon'), {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: 'Bearer ' + token, ...(workspace ? { 'x-memoire-data-workspace': workspace } : {}) },
      fetch: (url, args) => {
        // The fixture PostgREST exposes its routes at root and has no Supabase gateway.
        const target = new URL(url);
        assert.equal(target.origin, endpoint);
        assert.ok(target.pathname.startsWith('/rest/v1/'));
        target.pathname = target.pathname.slice('/rest/v1'.length);
        return transport(target, { ...args, redirect: 'error', signal: AbortSignal.timeout(10_000) });
      },
    },
  }),
});
const [owner, outsider] = tokens.keys();
function request(observation, workspace, token = owner) {
  return callHandler(handler, { method: 'POST', body: envelope(observation), headers: {
    authorization: 'Bearer ' + token, ...(workspace ? { 'x-memoire-data-workspace': workspace } : {}),
  } });
}
const idV1 = (scope, row) => 'observation:' + createHash('sha256')
  .update(JSON.stringify([scope, false, row.sourceKind, row.sourceNamespace, row.sourceEventId, row.sourceVersion])).digest('hex');
function receipt(response, effectId, input, duplicate) {
  assert.deepEqual(response.body, {
    version: 1, command: 'receive-observation', duplicate,
    receipt: { id: effectId, observation: input, receivedAt: response.body.receipt.receivedAt, acceptedCommercialTruth: false },
  });
  assert.ok(Number.isFinite(Date.parse(response.body.receipt.receivedAt)));
}

try {
  execFileSync('docker', ['run', '-d', '--name', name, '--network', 'host',
    '-e', 'PGRST_DB_URI=postgres://authenticator:fixture@127.0.0.1:55432/postgres',
    '-e', 'PGRST_DB_ANON_ROLE=anon', '-e', 'PGRST_DB_SCHEMAS=public', '-e', 'PGRST_SERVER_HOST=127.0.0.1',
    '-e', 'PGRST_SERVER_PORT=3302', '-e', 'PGRST_JWT_SECRET=' + secret, 'postgrest/postgrest:v13.0.7'], { stdio: 'ignore' });

  const readyBy = Date.now() + 15_000;
  while (!(await fetch(endpoint + '/').then(r => r.ok).catch(() => false))) {
    assert.ok(Date.now() < readyBy, 'PostgREST did not become ready.');
    await delay(200);
  }

  synchronizedWrites();
  const reordered = Object.fromEntries(Object.entries(observation).reverse());
  const identical = await Promise.all([request(observation), request(reordered)]);
  assert.deepEqual(identical.map(r => r.code).sort(), [200, 201]);
  assert.equal(arrival, 2);
  identical.forEach(r => receipt(r, idV1(OWNER_A, observation), observation, r.code === 200));
  assert.deepEqual(identical[0].body.receipt, identical[1].body.receipt);
  assert.equal(sql("select count(*) from public.commercial_events where source_id='same';"), '1');
  console.log('PASS concurrent reordered V1 requests: one event, stable effect ID and same receipt');

  synchronizedWrites();
  const conflict = { ...observation, sourceEventId: 'concurrent-conflict' };
  const candidates = [conflict, { ...conflict, rawText: 'Second version of the claim under the same source version.' }];
  const conflicting = await Promise.all(candidates.map(input => request(input)));
  assert.deepEqual(conflicting.map(r => r.code).sort(), [201, 409]);
  conflicting.forEach((r, index) => {
    if (r.code === 201) receipt(r, idV1(OWNER_A, conflict), candidates[index], false);
    else assert.deepEqual(r.body, { version: 1, error: 'source_version_conflict' });
  });
  assert.equal(sql("select count(*) from public.commercial_events where source_id='concurrent-conflict';"), '1');
  console.log('PASS concurrent conflicting V1 requests: one event and conflict without receipt');

  const uncertain = { ...observation, sourceEventId: 'unknown' };
  let discardedResponseStatus;
  transport = async (url, args) => {
    const response = await fetch(url, args);
    if (args.method === 'POST' && new URL(url).pathname === '/commercial_events') {
      discardedResponseStatus = response.status;
      await response.arrayBuffer();
      throw new Error('Fixture: response lost after PostgreSQL committed.');
    }
    return response;
  };
  const unknown = await request(uncertain);
  assert.equal(discardedResponseStatus, 201);
  assert.equal(unknown.code, 503);
  assert.equal('receipt' in unknown.body, false);
  transport = fetch;
  receipt(await request(uncertain), idV1(OWNER_A, uncertain), uncertain, true);

  for (const failure of ['POST', 'GET']) {
    const candidate = { ...observation, sourceEventId: 'fixture-unavailable-' + failure };
    transport = (url, args) => args.method === failure && new URL(url).pathname === '/commercial_events'
      ? Promise.resolve(Response.json({ code: 'fixture_unavailable', message: 'Fixture transport failed' }, { status: 503 }))
      : fetch(url, args);
    const failed = await request(candidate);
    assert.deepEqual(failed.body, { version: 1, error: 'receipt_not_confirmed', retrySafe: true });
    assert.equal(failed.code, 503);
    assert.equal(sql("select count(*) from public.commercial_events where source_id='" + candidate.sourceEventId + "';"), failure === 'GET' ? '1' : '0');
    transport = fetch;
    receipt(await request(candidate), idV1(OWNER_A, candidate), candidate, failure === 'GET');
  }
  console.log('PASS failed write/read and lost acknowledgment return no success and recover safely');

  const scoped = await request(observation, book);
  const sameLoginDifferentBook = await request(observation, sibling);
  const otherLoginDefault = await request(observation, undefined, outsider);
  for (const result of [scoped, sameLoginDifferentBook, otherLoginDefault]) assert.equal(result.code, 201);
  const ids = [identical[0], scoped, sameLoginDifferentBook, otherLoginDefault].map(r => r.body.receipt.id);
  for (const result of [scoped, sameLoginDifferentBook]) receipt(result, result.body.receipt.id, observation, false);
  receipt(otherLoginDefault, idV1(OWNER_B, observation), observation, false);
  assert.equal(new Set(ids).size, 4);
  const fromOther = await request(observation, book, outsider);
  assert.deepEqual(fromOther.body, { version: 1, error: 'workspace_unavailable' });
  assert.equal(fromOther.code, 404);
  const direct = await fetch(endpoint + '/commercial_events?select=id&id=eq.' + encodeURIComponent(scoped.body.receipt.id),
    { headers: { Authorization: 'Bearer ' + owner } });
  assert.equal(direct.status, 200);
  assert.deepEqual(await direct.json(), []);
  const forged = await request({ ...observation, grant: { allowed: true } }, book);
  assert.equal(forged.code, 400);
  assert.deepEqual(forged.body, { version: 1, error: 'invalid_observation' });
  assert.equal(sql("select count(*) from public.commercial_events where source_id='same';"), '4');
  console.log('PASS default and named workspace boundaries, including sibling books and direct RLS');
} finally {
  try { execFileSync('docker', ['rm', '-f', name], { stdio: 'ignore' }); } catch { /* Disposable runner. */ }
}
