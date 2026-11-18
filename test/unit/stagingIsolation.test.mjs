import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertStagingSession, stagingBackend, stagingDatabase, stagingKey, stagingOrigin } from '../../scripts/staging/isolation.mjs';
import { stagingAttestation } from '../../api/_stagingAttestation.js';

const ref = 'aaaaaaaaaaaaaaaaaaaa';
const backend = 'https://' + ref + '.supabase.co';
const origin = 'https://memoire-staging-example.vercel.app';
const token = 'safe-test-fixture-token-not-a-real-secret';
const valid = {
  VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_SHA: 'a'.repeat(40), MEMOIRE_STAGING_ATTESTATION: 'true',
  MEMOIRE_STAGING_PROBE_TOKEN: token, MEMOIRE_STAGING_APP_ORIGIN: origin, MEMOIRE_STAGING_PROJECT_REF: ref,
  SUPABASE_URL: backend, VITE_SUPABASE_URL: backend, SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_example',
  VITE_SUPABASE_ANON_KEY: 'sb_publishable_example', VITE_ENABLE_NATIVE_WORKSPACES: 'true', PLAN_COMPLETION_ENABLED: 'true',
};
const req = { method: 'GET', headers: { authorization: 'Bearer ' + token } };

test('staging isolation rejects production, existing unrelated projects and unsafe destinations', () => {
  for (const reserved of ['mlmpcpkucurylkrobain', 'sfutajxyudwrdnjpzurk']) {
    assert.throws(() => stagingBackend(reserved, 'https://' + reserved + '.supabase.co'));
  }
  assert.equal(stagingBackend(ref, backend, backend + '/'), backend);
  assert.throws(() => stagingBackend(ref, backend, 'https://other.supabase.co'));
  assert.throws(() => stagingBackend(ref, backend + '/redirect'));
  assert.throws(() => stagingOrigin('https://memoire.vercel.app'));
  assert.throws(() => stagingOrigin(origin + '/path'));
  const foreignKey = 'fixture.' + Buffer.from(JSON.stringify({ ref: 'mlmpcpkucurylkrobain', role: 'service_role' })).toString('base64url') + '.signature';
  assert.throws(() => stagingKey(foreignKey, ref, 'service_role'));
  assert.throws(() => stagingKey('sb_secret_fixture', ref, 'anon'));
  assert.match(stagingDatabase('postgresql://postgres:dummy@db.' + ref + '.supabase.co/postgres?sslmode=require', ref).hostname, /^db\./);
  assert.throws(() => stagingDatabase('postgresql://postgres:dummy@db.mlmpcpkucurylkrobain.supabase.co/postgres?sslmode=require', ref));
  assert.throws(() => stagingDatabase('postgresql://postgres:dummy@db.' + ref + '.supabase.co/postgres?sslmode=disable', ref));
  assert.throws(() => stagingDatabase('postgresql://postgres:dummy@db.mlmpcpkucurylkrobain.supabase.co/postgres?sslmode=require', 'mlmpcpkucurylkrobain'));
  assert.throws(() => stagingDatabase('not-a-url-with-a-secret', ref), {
    message: 'Staging database URL is malformed.',
  });
});

test('attestation only works on the approved protected preview and excludes secrets', () => {
  assert.deepEqual(stagingAttestation(req, valid), {
    origin, backend, commit: valid.VERCEL_GIT_COMMIT_SHA, planCompletionEnabled: true,
  });
  assert.equal(stagingAttestation(req, { ...valid, PLAN_COMPLETION_ENABLED: 'false' }).planCompletionEnabled, false);
  assert.equal(stagingAttestation({ method: 'POST', headers: req.headers }, valid), null);
  assert.equal(stagingAttestation({ method: 'GET', headers: { authorization: 'Bearer bad' } }, valid), null);
  for (const bad of [{ VERCEL_ENV: 'production' }, { VERCEL_ENV: 'development' },
    { VITE_SUPABASE_URL: 'https://mlmpcpkucurylkrobain.supabase.co' },
    { MEMOIRE_STAGING_ATTESTATION: 'false' }, { CRON_SECRET: 'should not exist' }, { AI_CHAT_ENABLED: 'true' }]) {
    assert.equal(stagingAttestation(req, { ...valid, ...bad }), null);
  }
});

test('staging session binding rejects a production issuer and mixed-project claims without a network call', () => {
  const user = '12345678-1234-4234-8234-123456789012';
  const stageClaims = { iss: backend + '/auth/v1', sub: user, role: 'authenticated', session_id: user };
  const encode = claims => 'fixture.' + Buffer.from(JSON.stringify(claims)).toString('base64url') + '.signature';
  assert.doesNotThrow(() => assertStagingSession(encode(stageClaims), ref, backend, user));
  assert.throws(() => assertStagingSession(encode({
    ...stageClaims, iss: 'https://mlmpcpkucurylkrobain.supabase.co/auth/v1',
  }), ref, backend, user));
  assert.throws(() => assertStagingSession(encode({
    ...stageClaims, ref: 'mlmpcpkucurylkrobain',
  }), ref, backend, user));
  assert.throws(() => assertStagingSession(encode(stageClaims), ref, backend, 'another-user'));
});
