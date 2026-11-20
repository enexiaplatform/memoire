export const DATA_WORKSPACE_HEADER = 'x-memoire-data-workspace';
const workspaceIdPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

/** Parse the selector only. The caller still has to resolve and authorize the workspace. */
export function parseWorkspaceSelector(headers, { explicitDefault = false } = {}) {
  const requested = headers?.[DATA_WORKSPACE_HEADER];
  if (!explicitDefault && requested === undefined) return { kind: 'default', workspaceId: null };
  if (headers?.['x-memoire-workspace'] !== undefined) return { kind: 'invalid' };
  if (explicitDefault && requested === 'default') return { kind: 'default', workspaceId: null };
  if (typeof requested !== 'string' || !workspaceIdPattern.test(requested)) return { kind: 'invalid' };
  return { kind: 'named', workspaceId: requested.toLowerCase() };
}

export function workspaceDataHeaders(workspaceId) {
  return workspaceId ? { [DATA_WORKSPACE_HEADER]: workspaceId } : {};
}

/** Bind the workspace to the verified login and confirm the Data API applied it. */
export async function resolveWorkspaceServerScope(headers, token, loginId, clientForToken) {
  const selection = parseWorkspaceSelector(headers);
  const accountClient = clientForToken(token);
  if (selection.kind === 'default') return { client: accountClient, ownerId: loginId };
  if (selection.kind === 'invalid') return null;

  const { workspaceId } = selection;
  const directory = await accountClient.rpc('memoire_get_native_workspace_scope', { p_workspace: workspaceId }).maybeSingle();
  const ownerId = directory.data?.data_owner_id;
  if (directory.error || typeof ownerId !== 'string' || !workspaceIdPattern.test(ownerId) || ownerId === loginId) return null;

  const client = clientForToken(token, workspaceId);
  const scope = await client.rpc('memoire_active_data_owner');
  if (scope.error || scope.data !== ownerId) return null;
  return { client, ownerId };
}
