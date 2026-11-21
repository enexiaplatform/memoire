import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { attest, checked, cleanup, config, env, seed } from './hosted.mjs';
import { required, stagingDatabase } from './isolation.mjs';

const c = config();
const db = stagingDatabase(required(env, 'MEMOIRE_STAGING_DB_URL'), c.ref);
assert.equal((await attest(c)).planCompletionEnabled, false, 'Disable Plan completion before the staging migration rehearsal.');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const signature = 'public.memoire_confirm_plan_completion(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text)';
const ids = [];

function query(sql) {
  // Set every connection attribute explicitly. Never run an implicit linked CLI operation.
  const processEnv = Object.fromEntries(Object.entries(env).filter(([key]) => !key.toUpperCase().startsWith('PG')));
  return execFileSync('psql', ['-X', '-w', '-qAt', '--no-password', '-v', 'ON_ERROR_STOP=1',
    '-h', db.hostname, '-p', '5432', '-d', 'postgres', '-U', decodeURIComponent(db.username)], {
    input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], timeout: 15_000,
    env: { ...processEnv, PGPASSWORD: decodeURIComponent(db.password), PGSSLMODE: 'verify-full',
      PGSSLROOTCERT: required(env, 'MEMOIRE_STAGING_DB_ROOT_CERT'), PGCONNECT_TIMEOUT: '8' },
  }).trim();
}

const installed = () => query("select (to_regprocedure('" + signature + "') is not null)::text;") === 'true';
assert.equal(installed(), false, 'Migration rehearsal requires a staging database with the pre-PR-01 schema.');
try {
  const fixture = await seed(c, ids);
  const [book] = fixture.books;
  assert.match(book.owner, /^[a-f0-9-]{36}$/);
  const planId = 'stage-' + randomUUID();
  const activityId = randomUUID();
  const createdAt = new Date().toISOString();
  await checked('Seed legacy Plan row', book.scoped.from('plan_items').insert({
    id: planId, user_id: book.owner, updated_at: createdAt,
    payload: { id: planId, label: 'Legacy Plan fixture', date: createdAt.slice(0, 10), done: false,
      createdAt, updatedAt: createdAt, legacyFixture: true },
  }));
  await checked('Seed legacy Activity row', book.scoped.from('sales_activities').insert({
    id: activityId, user_id: book.owner, raw_note: 'Legacy stage note', activity_type: 'Call',
  }));
  const fingerprint = () => JSON.parse(query(`
    select jsonb_build_array(
      (select row_to_json(p) from public.plan_items p where p.user_id='${book.owner}' and p.id='${planId}'),
      (select row_to_json(a) from public.sales_activities a where a.user_id='${book.owner}' and a.id='${activityId}')
    );
  `));
  const before = fingerprint();
  assert.ok(before.every(Boolean), 'Both populated legacy fixtures must be present.');
  console.log('Synthetic migration fixture', fixture.runId, 'is ready.');
  console.log('Apply only the approved PR-01 migration to staging now. This runner does not apply it.');
  const timeout = Number(env.MEMOIRE_STAGING_FLAG_WAIT_MS ?? '600000');
  assert.ok(Number.isSafeInteger(timeout) && timeout >= 1000 && timeout <= 1_800_000);
  const end = Date.now() + timeout;
  while (Date.now() < end && !installed()) await pause(3000);
  assert.equal(installed(), true, 'Timed out waiting for the staging migration.');
  assert.deepEqual(fingerprint(), before, 'The additive migration changed a legacy record.');
  const grants = query(`
    select has_function_privilege('anon','${signature}','EXECUTE')::text
      || ':' || has_function_privilege('authenticated','${signature}','EXECUTE')::text
      || ':' || has_function_privilege('service_role','${signature}','EXECUTE')::text;
  `);
  assert.equal(grants, 'false:false:true');
  console.log('PASS hosted migration: legacy Plan and Activity rows identical, command grant restricted to service_role.');
} finally {
  await cleanup(c, ids);
}
