import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DATA_WORKSPACE_HEADER, parseWorkspaceSelector, resolveWorkspaceServerScope } from '../../api/_workspaceScope.js';

const workspaceId = 'abcd1234-1111-4111-8111-111111111111';
const loginId = '11111111-1111-4111-8111-111111111111';
const dataOwnerId = '22222222-2222-4222-8222-222222222222';
const explicit = { explicitDefault: true };
const defaultScope = { kind: 'default', workspaceId: null };
const invalid = { kind: 'invalid' };
const request = (value, extras = {}) => ({ [DATA_WORKSPACE_HEADER]: value, ...extras });

test('Plan and legacy callers keep their own wire representation for the same default scope', () => {
  assert.deepEqual(parseWorkspaceSelector({}), defaultScope);
  assert.deepEqual(parseWorkspaceSelector({}, explicit), invalid);
  assert.deepEqual(parseWorkspaceSelector(request('default')), invalid);
  assert.deepEqual(parseWorkspaceSelector(request('default'), explicit), defaultScope);
  // Legacy callers omitting the native header retain their account default.
  assert.deepEqual(parseWorkspaceSelector({ 'x-memoire-workspace': workspaceId }), defaultScope);
});

test('named selectors normalize UUIDs and reject ambiguous or non-scalar headers', () => {
  for (const mode of [{}, explicit]) {
    assert.deepEqual(parseWorkspaceSelector(request(workspaceId.toUpperCase()), mode), { kind: 'named', workspaceId });
    for (const headers of [
      request(''), request(null), request([workspaceId]), request(workspaceId + ',' + workspaceId),
      request(workspaceId, { 'x-memoire-workspace': workspaceId }),
    ]) assert.deepEqual(parseWorkspaceSelector(headers, mode), invalid);
  }
  assert.deepEqual(parseWorkspaceSelector(request('default', { 'x-memoire-workspace': workspaceId }), explicit), invalid);
});

test('a valid named selector remains subject to directory ownership and effective PostgREST scope', async () => {
  const named = request(workspaceId.toUpperCase());
  let directoryOwner = dataOwnerId;
  let effectiveOwner = dataOwnerId;
  const account = { rpc(name, parameters) {
    assert.equal(name, 'memoire_get_native_workspace_scope');
    assert.deepEqual(parameters, { p_workspace: workspaceId });
    return { maybeSingle: async () => ({ data: { data_owner_id: directoryOwner } }) };
  } };
  const scoped = { async rpc(name) {
    assert.equal(name, 'memoire_active_data_owner');
    return { data: effectiveOwner };
  } };
  const client = (token, workspace) => {
    assert.equal(token, 'fixture');
    assert.ok(workspace === undefined || workspace === workspaceId);
    return workspace ? scoped : account;
  };
  const resolve = headers => resolveWorkspaceServerScope(headers, 'fixture', loginId, client);
  assert.deepEqual(await resolve({}), { client: account, ownerId: loginId });
  assert.deepEqual(await resolve(named), { client: scoped, ownerId: dataOwnerId });
  effectiveOwner = loginId;
  assert.equal(await resolve(named), null);
  directoryOwner = loginId;
  assert.equal(await resolve(named), null);
});
