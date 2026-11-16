import { useEffect, useState, type ReactNode } from 'react';
import { AuthContext, useAuthContext } from '../../auth/authContext';
import { supabaseAccountClient, workspaceApiClient } from '../../lib/supabaseClient';
import { activateWorkspaceScope, getActiveWorkspaceScope, nativeWorkspacesEnabled, openWorkspace, readWorkspaceSelection, type ActiveWorkspaceScope } from '../../services/activeWorkspaceScope';
import { recoverInterruptedRestore } from '../../services/restoreJournal';
import { resolveWorkspaceStorage } from '../../services/workspaceBrowserStorage';
import { claimLocalWorkspace } from '../../services/localWorkspaceOwner';

export function NativeWorkspaceBoundary({ children }: { children: ReactNode }) {
  const auth = useAuthContext();
  const ownerId = auth.user?.id;
  const [state, setState] = useState<{ ownerId: string; scope?: ActiveWorkspaceScope; error?: boolean } | null>(null);

  useEffect(() => {
    if (!nativeWorkspacesEnabled || !ownerId) return;
    let current = true;
    void (async () => {
      try {
        const workspaceId = readWorkspaceSelection(ownerId);
        if (!workspaceId) {
          if (getActiveWorkspaceScope()) window.location.assign('/app/today');
          else setState({ ownerId });
          return;
        }
        const client = supabaseAccountClient;
        if (!client) throw new Error('Workspace connection unavailable.');
        const existing = getActiveWorkspaceScope();
        if (existing?.ownerId === ownerId && existing.workspaceId === workspaceId) {
          setState({ ownerId, scope: existing });
          return;
        }
        const args = { p_workspace: workspaceId };
        let directory = await client.rpc('memoire_get_native_workspace_scope', args).maybeSingle();
        if (!directory.error && !directory.data) {
          const prepared = await client.rpc('memoire_prepare_native_workspace', args);
          if (prepared.error) throw new Error('Workspace preparation unavailable.');
          directory = await client.rpc('memoire_get_native_workspace_scope', args).maybeSingle();
        }
        const row = directory.data as { data_owner_id?: string; name?: string } | null;
        if (directory.error || !row?.data_owner_id || !row.name) throw new Error('Workspace is unavailable.');
        const check = await workspaceApiClient(workspaceId).rpc('memoire_active_data_owner');
        if (check.error || check.data !== row.data_owner_id || check.data === ownerId) throw new Error('Workspace data scope is unavailable.');
        if (!current) return;
        const scope = { ownerId, workspaceId, dataOwnerId: row.data_owner_id, name: row.name };
        const storage = resolveWorkspaceStorage(scope);
        if (!storage || !recoverInterruptedRestore(storage)) throw new Error('Workspace recovery needs attention.');
        activateWorkspaceScope(scope);
        if (claimLocalWorkspace(scope.dataOwnerId).outcome === 'unavailable') throw new Error('Workspace storage unavailable.');
        setState({ ownerId, scope });
      } catch {
        if (current) setState({ ownerId, error: true });
      }
    })();
    return () => { current = false; };
  }, [ownerId]);

  if (!nativeWorkspacesEnabled || !ownerId) return children;
  if (state?.ownerId !== ownerId) return <main aria-busy="true" className="p-8">Opening workspace…</main>;
  if (state.error) return <main className="space-y-3 p-8">
    <p role="alert">Memoire could not open this workspace.</p>
    <button className="underline" type="button" onClick={() => openWorkspace(ownerId, null)}>Open Personal workspace</button>
  </main>;
  if (!state.scope || !auth.user) return children;
  const dataAuth = { ...auth, user: { ...auth.user, id: state.scope.dataOwnerId } };
  return <AuthContext.Provider value={dataAuth}>{children}</AuthContext.Provider>;
}
