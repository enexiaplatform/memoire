import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { BrandWordmark } from '../../components/brand/BrandWordmark';
import { NoIndex } from '../../components/marketing/PageSeo';
import { controlClass, ghostPillClass, primaryPillClass } from '../../components/ui/daylightStyles';
import { WorkspaceCreateDialog } from './WorkspaceCreateDialog';
import { createPersonalWorkspace, listPersonalWorkspaces, type PersonalWorkspace } from './personalWorkspaceStore';
import type { CopyCategory } from './workspaceCopy';
import { WorkspaceRecords } from './WorkspaceRecords';

const existingWorkspace = { id: 'legacy', name: 'Personal workspace' };

export function PersonalWorkspacesPage() {
  const { user } = useAuth();
  if (!user) return <main className="mx-auto max-w-lg p-6"><p>Sign in to manage your workspaces.</p><Link to="/login" className={ghostPillClass}>Sign in</Link></main>;
  return <PersonalWorkspaceDirectory key={user.id} userId={user.id} />;
}

function PersonalWorkspaceDirectory({ userId }: { userId: string }) {
  const [query, setQuery] = useSearchParams();
  const navigate = useNavigate();
  const [workspaces, setWorkspaces] = useState<PersonalWorkspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const pending = useRef<{ key: string; id: string } | null>(null);
  const activeId = query.get('workspace');
  const active = workspaces.find(workspace => workspace.id === activeId);
  const choices = [existingWorkspace, ...workspaces];
  const close = useCallback(() => setCreating(false), []);

  useEffect(() => {
    let current = true;
    void listPersonalWorkspaces(userId).then(result => { if (current) setWorkspaces(result); })
      .catch(() => { if (current) setError('Workspace storage is unavailable.'); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [userId]);

  async function create(input: { name: string; sourceId: string; categories: CopyCategory[] }) {
    const sourceId = input.sourceId === existingWorkspace.id ? null : input.sourceId;
    const key = JSON.stringify([input.name, sourceId, input.categories]);
    if (pending.current?.key !== key) pending.current = { key, id: crypto.randomUUID() };
    const created = await createPersonalWorkspace({ ...input, sourceId, id: pending.current.id });
    pending.current = null;
    setWorkspaces(current => [...current.filter(workspace => workspace.id !== created.id), created]);
    setQuery({ workspace: created.id });
    close();
  }

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <NoIndex />
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-4 sm:px-8">
          <Link to="/app/today" aria-label="Memoire home"><BrandWordmark className="text-xl" /></Link>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <span>Workspace</span>
            <select className={controlClass} aria-label="Workspace" value={active?.id ?? existingWorkspace.id} onChange={event => {
              if (event.target.value === existingWorkspace.id) navigate('/app/today');
              else setQuery({ workspace: event.target.value });
            }}>
              {choices.map(choice => <option key={choice.id} value={choice.id}>{choice.name}</option>)}
            </select>
          </label>
        </div>
      </header>
      <main className="mx-auto max-w-5xl space-y-5 px-5 py-8 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-3xl font-bold">{active?.name ?? 'Workspaces'}</h1>
          <button type="button" className={primaryPillClass} disabled={loading || Boolean(error)} onClick={() => setCreating(true)}>Create workspace</button>
        </div>
        {loading && <p role="status" className="text-sm text-muted">Loading workspaces…</p>}
        {error && <p role="alert" className="text-sm text-tint-red-solid">{error}</p>}
        {!loading && !error && active && <WorkspaceRecords key={active.id} userId={userId} workspaceId={active.id} />}
        {!loading && !error && activeId && !active && <p role="alert" className="text-sm text-tint-red-solid">This workspace is unavailable.</p>}
        {!loading && !activeId && <Link to="/app/today" className={ghostPillClass}>Open your existing workspace</Link>}
      </main>
      {creating && <WorkspaceCreateDialog workspaces={choices} sourceId={active?.id ?? existingWorkspace.id} onClose={close} onCreate={create} />}
    </div>
  );
}
