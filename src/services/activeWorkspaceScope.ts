export type ActiveWorkspaceScope = Readonly<{
  ownerId: string;
  workspaceId: string;
  dataOwnerId: string;
  name: string;
}>;

export const NATIVE_WORKSPACE_HEADER = 'x-memoire-data-workspace';
const selectionKey = 'memoire.active-data-workspace.v1';
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const env = (import.meta as { env?: Record<string, string | undefined> }).env;
export const nativeWorkspacesEnabled = env?.VITE_ENABLE_NATIVE_WORKSPACES === 'true';

let activeScope: ActiveWorkspaceScope | null = null;

export function getActiveWorkspaceScope() {
  return activeScope;
}

/** A document serves one data scope. Switching opens a fresh document. */
export function activateWorkspaceScope(scope: ActiveWorkspaceScope) {
  if (activeScope?.ownerId === scope.ownerId && activeScope.workspaceId === scope.workspaceId
      && activeScope.dataOwnerId === scope.dataOwnerId) return;
  if (activeScope) throw new Error('Reload before switching workspaces.');
  if (![scope.ownerId, scope.workspaceId, scope.dataOwnerId].every(value => uuid.test(value)) || scope.ownerId === scope.dataOwnerId) {
    throw new Error('Workspace data scope is invalid.');
  }
  activeScope = Object.freeze({ ...scope });
}

export function dataOwnerForLogin(loginId?: string | null) {
  return loginId && activeScope?.ownerId === loginId ? activeScope.dataOwnerId : loginId;
}

export function readWorkspaceSelection(ownerId: string) {
  const workspaceId = window.sessionStorage.getItem(`${selectionKey}:${ownerId}`);
  if (workspaceId && !uuid.test(workspaceId)) throw new Error('Workspace selection is invalid.');
  return workspaceId?.toLowerCase() ?? null;
}

export function openWorkspace(ownerId: string, workspaceId: string | null) {
  const key = `${selectionKey}:${ownerId}`;
  if (workspaceId) {
    if (!uuid.test(workspaceId)) throw new Error('Workspace selection is invalid.');
    window.sessionStorage.setItem(key, workspaceId.toLowerCase());
  } else {
    window.sessionStorage.removeItem(key);
  }
  window.location.assign('/app/today');
}

export function activeWorkspaceHeaders(): Record<string, string> {
  return activeScope ? { [NATIVE_WORKSPACE_HEADER]: activeScope.workspaceId } : {};
}
