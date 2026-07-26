import { useEffect, useMemo, useState } from 'react';
import { useAuthContext } from '../../auth/authContext';
import { hasLocalSampleData } from '../../utils/dataMode';
import { getCachedSalesWorkspaceData, loadSalesWorkspaceData } from '../../services/workspaceData';
import {
  resolveCommercialThreads,
  type ResolvedThread,
} from '../../domain/commercialKernel/deriveThreads';
import {
  evaluateCommercialPolicies,
  type Recommendation,
} from '../../domain/commercialKernel/policyEngine';
import { COMMITMENTS_UPDATED_EVENT } from '../../services/commercialKernel/commitmentStore';
import { THREADS_UPDATED_EVENT } from '../../services/commercialKernel/threadStore';

/**
 * Resolves the workspace's commercial threads and the recommendations the
 * policy engine makes about them.
 *
 * Both come from the same load, because a thread list and a risk list that
 * disagree are worse than either alone: the seller cannot tell which one is
 * stale, so they stop believing both.
 */
export function useCommercialThreads() {
  const { user } = useAuthContext();
  const sampleDataActive = hasLocalSampleData();
  const dataUserId = sampleDataActive ? undefined : user?.id;

  const [workspace, setWorkspace] = useState(() => getCachedSalesWorkspaceData(dataUserId));
  const [loading, setLoading] = useState(() => !getCachedSalesWorkspaceData(dataUserId));
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let active = true;
    void loadSalesWorkspaceData(dataUserId)
      .then((data) => { if (active) setWorkspace(data); })
      .catch(() => undefined)
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // `sampleDataActive` belongs in the dependency list even though it is not
    // read in the effect: loading or clearing the demo replaces the whole
    // workspace without changing the user id, and without this the thread list
    // stayed empty over a demo pipeline full of deals.
  }, [dataUserId, sampleDataActive, refreshToken]);

  // A commitment ticked anywhere changes both the thread's waiting party and
  // the recommendations about it, so the kernel's own events drive the refresh.
  useEffect(() => {
    const bump = () => setRefreshToken((token) => token + 1);
    window.addEventListener(COMMITMENTS_UPDATED_EVENT, bump);
    window.addEventListener(THREADS_UPDATED_EVENT, bump);
    return () => {
      window.removeEventListener(COMMITMENTS_UPDATED_EVENT, bump);
      window.removeEventListener(THREADS_UPDATED_EVENT, bump);
    };
  }, []);

  const threads = useMemo<ResolvedThread[]>(() => {
    if (!workspace) return [];
    return resolveCommercialThreads({
      storedThreads: workspace.threads,
      opportunities: workspace.opportunities,
      activities: workspace.activities,
      quotes: workspace.quotes,
      commitments: workspace.commitments,
    });
  }, [workspace]);

  const recommendations = useMemo<Recommendation[]>(() => {
    if (!workspace) return [];
    return evaluateCommercialPolicies({
      threads,
      commitments: workspace.commitments,
      opportunities: workspace.opportunities,
      quotes: workspace.quotes,
      // In the demo, the sample data is the workspace. Anywhere else, a demo
      // record must never raise a real risk.
      includeSampleRecords: sampleDataActive,
    });
  }, [sampleDataActive, threads, workspace]);

  return { threads, recommendations, workspace, loading };
}
