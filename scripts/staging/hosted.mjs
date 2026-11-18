import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { assertStagingSession, required, stagingBackend, stagingKey, stagingOrigin } from './isolation.mjs';

export const env = process.env;

export function config() {
  const ref = required(env, 'MEMOIRE_STAGING_PROJECT_REF');
  const backend = stagingBackend(ref, required(env, 'SUPABASE_URL'), required(env, 'VITE_SUPABASE_URL'));
  const origin = stagingOrigin(required(env, 'MEMOIRE_STAGING_APP_ORIGIN'));
  const gitSha = required(env, 'MEMOIRE_STAGING_EXPECTED_SHA');
  const probe = required(env, 'MEMOIRE_STAGING_PROBE_TOKEN');
  assert.match(gitSha, /^[0-9a-f]{40}$/);
  assert.ok(probe.length >= 32, 'Use a staging-specific high-entropy probe token.');
  return { ref, backend, origin, gitSha, probe, bypass: env.MEMOIRE_STAGING_VERCEL_BYPASS,
    anon: stagingKey(required(env, 'VITE_SUPABASE_ANON_KEY'), ref, 'anon'),
    service: stagingKey(required(env, 'SUPABASE_SERVICE_ROLE_KEY'), ref, 'service_role') };
}

export function appHeaders(c, headers = {}) {
  return c.bypass ? { ...headers, 'x-vercel-protection-bypass': c.bypass } : headers;
}

export async function attest(c) {
  const response = await fetch(c.origin + '/api/commercial?resource=staging-attestation', {
    headers: appHeaders(c, { Authorization: 'Bearer ' + c.probe, 'Cache-Control': 'no-store' }),
    redirect: 'error', signal: AbortSignal.timeout(12_000), cache: 'no-store',
  });
  assert.equal(response.status, 200, 'Staging attestation unavailable.');
  const data = await response.json();
  assert.equal(data.backend, c.backend);
  assert.equal(data.origin, c.origin);
  assert.equal(data.commit, c.gitSha);
  assert.equal(typeof data.planCompletionEnabled, 'boolean');
  return data;
}

const auth = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };

export function client(c, key = c.anon, headers = {}) {
  return createClient(c.backend, key, { auth, global: { headers, fetch: (url, options) => {
    assert.equal(new URL(url instanceof Request ? url.url : url).origin, c.backend);
    return fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(20_000) });
  } } });
}

export async function checked(operation, request) {
  const result = await request;
  if (result.error) throw new Error(operation + ' failed (' + (result.error.code || result.error.status || 'unknown') + ').');
  return result.data;
}

export async function seed(c, cleanupIds) {
  const admin = client(c, c.service);
  const runId = randomUUID();
  console.log('Synthetic fixture run', runId);
  const users = [];
  for (const role of ['owner', 'outsider']) {
    const email = 'enexia-stage-' + role + '-' + runId + '@example.invalid';
    const password = randomBytes(32).toString('base64url');
    const created = await checked('Create synthetic Auth user', admin.auth.admin.createUser({
      email, password, email_confirm: true, app_metadata: { enexia_fixture: runId },
    }));
    cleanupIds.push(created.user.id);
    const account = client(c);
    const session = (await checked('Sign in synthetic Auth user', account.auth.signInWithPassword({ email, password }))).session;
    assert.equal(session.user.id, created.user.id);
    assertStagingSession(session.access_token, c.ref, c.backend, created.user.id);
    const verified = await checked('Verify synthetic session with staging Auth', account.auth.getUser(session.access_token));
    assert.equal(verified.user.id, created.user.id);
    users.push({ account, session });
  }
  const [owner, outsider] = users;
  const books = [];
  for (const label of ['A', 'B']) {
    const id = randomUUID();
    const name = 'Stage ' + label + ' ' + runId;
    await checked('Create isolated workspace', owner.account.rpc('memoire_create_native_workspace',
      { p_id: id, p_name: name, p_source_id: null, p_options: [] }));
    const directory = await checked('Resolve isolated data owner', owner.account.rpc('memoire_get_native_workspace_scope', { p_workspace: id }).single());
    const scoped = client(c, c.anon, { Authorization: 'Bearer ' + owner.session.access_token, 'x-memoire-data-workspace': id });
    const effective = await checked('Confirm effective PostgREST scope', scoped.rpc('memoire_active_data_owner'));
    assert.equal(effective, directory.data_owner_id);
    assert.notEqual(effective, owner.session.user.id);
    books.push({ id, scoped, owner: effective });
  }
  assert.notEqual(books[0].owner, books[1].owner);
  return { admin, owner, outsider, books, runId };
}

export async function cleanup(c, ids) {
  if (!ids.length) return;
  await attest(c);
  const admin = client(c, c.service);
  const results = await Promise.allSettled(ids.map(id => checked('Delete synthetic fixture user', admin.auth.admin.deleteUser(id))));
  if (results.some(result => result.status === 'rejected')) throw new Error('Synthetic cleanup incomplete. See the emitted fixture run ID and inspect staging only.');
}

export function command(c, token, workspace, body) {
  return fetch(c.origin + '/api/commercial?resource=plan-completion', {
    method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(12_000),
    headers: appHeaders(c, { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', 'x-memoire-data-workspace': workspace }),
    body: JSON.stringify(body),
  });
}
