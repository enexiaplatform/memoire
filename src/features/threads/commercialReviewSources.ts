import type { ResolvedThread } from '../../domain/commercialKernel/deriveThreads';
import type { CommercialCommitment } from '../../domain/commercialKernel/types';
import type { SalesWorkspaceData } from '../../services/workspaceData';

export type ReviewSources = ReadonlyMap<string, string | null>;

/** Index labels from the same loaded scope as the recommendation. Null marks an ambiguous ID. */
export function indexCommercialReviewSources(
  workspace: Pick<SalesWorkspaceData, 'opportunities' | 'quotes' | 'evidence' | 'conditions' | 'requirements' | 'dependencies' | 'timing'>,
  threads: readonly Pick<ResolvedThread, 'id' | 'title' | 'isSample'>[],
  commitments: readonly Pick<CommercialCommitment, 'id' | 'commitmentText' | 'isSample'>[],
  sampleWorkspace: boolean,
): ReviewSources {
  const sources = new Map<string, string | null>();
  const add = (row: { id: string; isSample?: boolean; source?: string }, kind: string, label: string) => {
    if (Boolean(row.isSample || row.source === 'demo') !== sampleWorkspace) return;
    const { id } = row;
    sources.set(id, sources.has(id) ? null : (label.trim() ? `${kind} · ${label.trim()}` : kind));
  };
  for (const row of workspace.opportunities) add(row, 'Opportunity', row.opportunityName);
  for (const row of workspace.quotes) add(row, 'Quote', row.title || row.quoteId);
  for (const row of threads) add(row, 'Commercial thread', row.title);
  for (const row of commitments) add(row, 'Commitment', row.commitmentText);
  for (const row of workspace.evidence) add(row, 'Recorded evidence', row.summary);
  for (const row of workspace.conditions) add(row, 'Condition', row.statement);
  for (const row of workspace.requirements) add(row, 'Requirement', row.expectedOutcome);
  for (const row of workspace.dependencies) add(row, 'Dependency', row.basis);
  for (const row of workspace.timing) add(row, 'Timing assertion', row.basis);
  return sources;
}

type EvidenceCitation = {
  id: string;
} & ({ status: 'available'; label: string } | { status: 'unavailable' | 'conflicting' });

export function resolveCommercialReviewSources(ids: readonly string[], sources?: ReviewSources) {
  return [...new Set(ids)].map((id): EvidenceCitation => {
    const label = sources?.get(id);
    if (label === undefined) return { id, status: 'unavailable' };
    if (label === null) return { id, status: 'conflicting' };
    return { id, status: 'available', label };
  });
}
