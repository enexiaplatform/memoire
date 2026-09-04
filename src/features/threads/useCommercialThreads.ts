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
import { scorePipelineQualification } from '../../utils/dealQualificationScore';
import { buildCoverage } from '../../domain/commercialKernel/forecast';
import {
  loadTargets,
  loadTargetsForWorkspace,
  TARGETS_UPDATED_EVENT,
  type CommercialTarget,
} from '../../services/commercialKernel/targetStore';
import { COMMITMENTS_UPDATED_EVENT } from '../../services/commercialKernel/commitmentStore';
import { THREADS_UPDATED_EVENT } from '../../services/commercialKernel/threadStore';
import { mergePlanCommitments } from '../../domain/commercialKernel/derivePlanCommitments';
import { loadPlanItemsForWorkspace, PLAN_ITEMS_UPDATED_EVENT } from '../../services/planItemStore';
import type { PlanRecord } from '../../utils/weeklyPlan';

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
  const [targets, setTargets] = useState<CommercialTarget[]>(() => loadTargets());
  const [planItems, setPlanItems] = useState<PlanRecord[]>([]);

  useEffect(() => {
    let active = true;
    void loadTargetsForWorkspace(dataUserId, sampleDataActive)
      .then((loaded) => { if (active) setTargets(loaded); })
      .catch(() => undefined);

    const onTargets = (event: Event) => {
      const detail = (event as CustomEvent<CommercialTarget[]>).detail;
      if (Array.isArray(detail)) setTargets(detail);
    };
    window.addEventListener(TARGETS_UPDATED_EVENT, onTargets);
    return () => { active = false; window.removeEventListener(TARGETS_UPDATED_EVENT, onTargets); };
  }, [dataUserId, sampleDataActive]);

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

  // The Plan holds the promises a capture made, and the ledger holds the ones
  // recorded by hand. A thread that asks "what is scheduled to move this?" has
  // to see both, or it warns about silence over a promise due on Tuesday.
  useEffect(() => {
    let active = true;
    void loadPlanItemsForWorkspace(dataUserId, sampleDataActive)
      .then((records) => { if (active) setPlanItems(records); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [dataUserId, sampleDataActive, refreshToken]);

  // A commitment ticked anywhere changes both the thread's waiting party and
  // the recommendations about it, so the kernel's own events drive the refresh.
  useEffect(() => {
    const bump = () => setRefreshToken((token) => token + 1);
    const onPlanItems = (event: Event) => {
      const detail = (event as CustomEvent<PlanRecord[]>).detail;
      if (Array.isArray(detail)) setPlanItems(detail);
    };
    window.addEventListener(COMMITMENTS_UPDATED_EVENT, bump);
    window.addEventListener(THREADS_UPDATED_EVENT, bump);
    window.addEventListener(PLAN_ITEMS_UPDATED_EVENT, onPlanItems);
    return () => {
      window.removeEventListener(COMMITMENTS_UPDATED_EVENT, bump);
      window.removeEventListener(THREADS_UPDATED_EVENT, bump);
      window.removeEventListener(PLAN_ITEMS_UPDATED_EVENT, onPlanItems);
    };
  }, []);

  const commitments = useMemo(
    () => mergePlanCommitments(workspace?.commitments || [], {
      activities: workspace?.activities || [],
      planItems,
      includeSampleRecords: sampleDataActive,
    }),
    [planItems, sampleDataActive, workspace],
  );

  const threads = useMemo<ResolvedThread[]>(() => {
    if (!workspace) return [];
    return resolveCommercialThreads({
      storedThreads: workspace.threads,
      opportunities: workspace.opportunities,
      activities: workspace.activities,
      quotes: workspace.quotes,
      commitments,
    });
  }, [commitments, workspace]);

  // Coverage feeds the two quarter-level rules. Built here rather than in the
  // Money page so Today can raise a coverage warning without Money being open -
  // a shortfall you only see when you go looking is not a warning.
  /**
   * How well each open deal is actually qualified, so coverage can separate
   * "the number is backed by real deals" from "the number is backed by rows".
   *
   * Built once here and shared, because scoring runs a full MEDDIC review per
   * deal against the stakeholder map, the objection ledger and every touch -
   * doing that again inside each panel would be the same work three times on
   * the same records.
   */
  const qualification = useMemo(() => {
    if (!workspace) return undefined;
    const scores = scorePipelineQualification({
      opportunities: workspace.opportunities,
      stakeholders: workspace.stakeholders,
      objections: workspace.objections,
      activities: workspace.activities,
      quotes: workspace.quotes,
    });
    return new Map(scores.map((score) => [score.opportunityId, score]));
  }, [workspace]);

  const coverage = useMemo(() => {
    if (!workspace || targets.length === 0) return undefined;
    return buildCoverage({
      opportunities: workspace.opportunities,
      threads,
      targets: targets.map((target) => ({ quarter: target.period, amount: target.amount, currency: target.currency })),
      qualification,
      fiscalYearStartMonth: targets[0]?.fiscalYearStartMonth || 1,
      includeSampleRecords: sampleDataActive,
    });
  }, [qualification, sampleDataActive, targets, threads, workspace]);

  const recommendations = useMemo<Recommendation[]>(() => {
    if (!workspace) return [];
    return evaluateCommercialPolicies({
      threads,
      commitments,
      opportunities: workspace.opportunities,
      quotes: workspace.quotes,
      coverage,
      // In the demo, the sample data is the workspace. Anywhere else, a demo
      // record must never raise a real risk.
      includeSampleRecords: sampleDataActive,
    });
  }, [commitments, coverage, sampleDataActive, threads, workspace]);

  return { threads, recommendations, coverage, qualification, workspace, loading };
}
