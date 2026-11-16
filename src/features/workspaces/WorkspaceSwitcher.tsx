import { useEffect, useState } from 'react';
import { useAuthContext } from '../../auth/authContext';
import { getActiveWorkspaceScope, nativeWorkspacesEnabled, openWorkspace } from '../../services/activeWorkspaceScope';
import { isDemoWorkspaceActive } from '../../lib/demoMode';
import { listPersonalWorkspaces, type PersonalWorkspace } from './personalWorkspaceStore';

export function WorkspaceSwitcher() {
  const { session } = useAuthContext();
  const ownerId = session?.user.id;
  const active = getActiveWorkspaceScope();
  const [workspaces, setWorkspaces] = useState<PersonalWorkspace[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!nativeWorkspacesEnabled || !ownerId || isDemoWorkspaceActive()) return;
    let current = true;
    void listPersonalWorkspaces(ownerId).then(result => { if (current) setWorkspaces(result); })
      .catch(() => { if (current) setError(true); });
    return () => { current = false; };
  }, [ownerId]);

  if (!nativeWorkspacesEnabled || !ownerId || isDemoWorkspaceActive()) return null;
  const choices = active && !workspaces.some(workspace => workspace.id === active.workspaceId)
    ? [{ id: active.workspaceId, name: active.name }, ...workspaces]
    : workspaces;
  if (!choices.length) return null;

  return <select
    aria-label="Switch workspace"
    title={error ? 'Workspace list unavailable' : 'Switch workspace'}
    className="max-w-28 truncate rounded-full border border-line bg-white px-2 py-1 text-xs text-ink sm:max-w-48 sm:px-3"
    value={active?.workspaceId ?? ''}
    onChange={event => {
      try { openWorkspace(ownerId, event.currentTarget.value || null); }
      catch { setError(true); }
    }}
  >
    <option value="">Personal workspace</option>
    {choices.map(workspace => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
  </select>;
}
