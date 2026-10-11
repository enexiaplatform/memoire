import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { SalesWorkspaceData } from '../../services/workspaceData';
import { workspaceDataIssues } from '../../utils/workspaceDataIssues';
export function WorkspaceDataIssuesPanel({ workspace }: { workspace: SalesWorkspaceData | null | undefined }) {
  const issues = useMemo(() => workspace ? workspaceDataIssues(workspace) : [], [workspace]);
  if (!workspace || !issues.length) return null;
  return <details className="rounded-panel border border-amber-200 bg-amber-50 p-4" data-testid="workspace-data-issues"><summary className="min-h-11 cursor-pointer text-sm font-semibold text-amber-900">Data to complete · {issues.length} issues affecting this workspace</summary><p className="mt-2 text-xs text-amber-900">Open the source record to fix its fields or links. Missing context stays visible until corrected; it is never filled by a guess.</p><ul className="mt-3 space-y-3">{issues.slice(0, 30).map(issue => <li key={issue.id} className="rounded-lg bg-white p-3 text-sm"><p className="font-semibold">{issue.record}</p><p className="mt-1 text-xs text-muted">{issue.reason}</p><Link className="mt-2 inline-flex min-h-11 items-center font-semibold text-brand-blue" to={issue.href}>Open record to resolve</Link></li>)}</ul>{issues.length > 30 && <p className="mt-3 text-xs">Showing the first 30 issues. Resolve these to reveal the rest.</p>}<Link className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-brand-blue" to="/app/settings?tab=export">Export a workspace backup</Link></details>;
}
