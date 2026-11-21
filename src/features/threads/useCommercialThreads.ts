import type { CommercialIncident } from '../../domain/commercialKernel/commercialIncident';
import { loadCommercialIncidents, loadCommercialIncidentsForWorkspace, INCIDENT_UPDATED_EVENT } from '../../services/commercialKernel/incidentStore';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { rankRecommendations } from '../../domain/commercialKernel/rankRecommendations';
import { derivePersonalLearning } from '../../domain/commercialLearning/derivePersonalLearning';
import { personalEvidenceFor } from '../../domain/commercialLearning/personalEvidenceFor';
import { scorePipelineQualification } from '../../utils/dealQualificationScore';
import { buildCoverage } from '../../domain/commercialKernel/forecast';
import {
  loadTargets,
  loadTargetsForWorkspace,
  TARGETS_UPDATED_EVENT,
  type CommercialTarget,
} from '../../services/commercialKernel/targetStore';
import { COMMITMENTS_UPDATED_EVENT } from '../../services/commercialKernel/commitmentStore';
import { CONDITION_UPDATED_EVENT } from '../../services/commercialKernel/conditionStore';
import { REQUIREMENT_UPDATED_EVENT } from '../../services/commercialKernel/requirementStore';
import { DEPENDENCY_UPDATED_EVENT } from '../../services/commercialKernel/dependencyStore';
import { TIMING_UPDATED_EVENT } from '../../services/commercialKernel/timingStore';
import { THREADS_UPDATED_EVENT } from '../../services/commercialKernel/threadStore';
import { mergePlanCommitments } from '../../domain/commercialKernel/derivePlanCommitments';
import { loadPlanItemsForWorkspace, PLAN_ITEMS_UPDATED_EVENT } from '../../services/planItemStore';
import type { PlanRecord } from '../../utils/weeklyPlan';
import {attachMoneyConsequenceContext,deriveMoneyConsequences} from '../../domain/commercialKernel/deriveMoneyConsequences';
import {todayDateKey} from '../../utils/safeDate';
import {canonicalReviewOutcomes} from '../../utils/outcomeScoreboard';
import { getActiveWorkspaceScope } from '../../services/activeWorkspaceScope';
import { captureLocalWorkspaceScope } from '../../services/localWorkspaceOwner';
import { indexCommercialReviewSources } from './commercialReviewSources';

/**
 * Resolves the workspace's commercial threads and the recommendations the
 * policy engine makes about them.
 *
 * Both come from the same load, because a thread list and a risk list that
 * disagree are worse than either alone: the seller cannot tell which one is
 * stale, so they stop believing both.
 */
export function useCommercialThreads() {
  const { user, session } = useAuthContext();
  const sampleDataActive = hasLocalSampleData();
  const dataUserId = sampleDataActive ? undefined : user?.id;
  const activeWorkspace = getActiveWorkspaceScope();
  const nativeWorkspace = activeWorkspace?.dataOwnerId === dataUserId ? activeWorkspace : null;
  const workspaceName = sampleDataActive ? 'Sample workspace' : nativeWorkspace?.name ?? 'Personal workspace';
  const snapshotScope = JSON.stringify([session?.user.id, dataUserId, nativeWorkspace?.workspaceId, sampleDataActive]);

  const [snapshot, setSnapshot] = useState(() => {
    const data = getCachedSalesWorkspaceData(dataUserId);
    return { scope: snapshotScope, data, unavailable: false };
  });
  const workspace = snapshot.scope === snapshotScope ? snapshot.data : null;
  const workspaceUnavailable = snapshot.scope === snapshotScope && snapshot.unavailable;
  const loading = !workspace && !workspaceUnavailable;
  const retry = useRef<{ scope: string; run: () => void } | null>(null);
  const [retryScope, setRetryScope] = useState<string | null>(null);
  const attentionRetrying = retryScope === snapshotScope;
  const [targetState, setTargetState] = useState(() => ({scope: snapshotScope, rows: loadTargets()}));
  const targets = useMemo(() => targetState.scope === snapshotScope ? targetState.rows : [], [targetState, snapshotScope]);
  const [incidentState, setIncidentState] = useState<{scope: string; rows: CommercialIncident[]; error: string} | null>(null);
  const incidentScope = snapshotScope;
  const incidents = useMemo(() => incidentState?.scope === incidentScope ? incidentState.rows : [], [incidentState, incidentScope]);
  const attentionError = incidentState?.scope === incidentScope ? incidentState.error : '';
  const [planState, setPlanState] = useState<{scope: string; rows: PlanRecord[]; error?: string} | null>(null);
  const planItems = useMemo(() => planState?.scope === snapshotScope ? planState.rows : [], [planState, snapshotScope]);
  const attentionLoading = attentionRetrying || loading || (!workspaceUnavailable && (planState?.scope !== snapshotScope || incidentState?.scope !== snapshotScope));
  const attentionUnavailable = workspaceUnavailable || Boolean(planState?.scope === snapshotScope && planState.error);
  const retryAttention = useCallback(() => {
    if (retry.current?.scope === snapshotScope) retry.current.run();
  }, [snapshotScope]);

  useEffect(() => {
    let active = true;
    void loadTargetsForWorkspace(dataUserId, sampleDataActive)
      .then((rows) => { if (active) setTargetState({scope: snapshotScope, rows}); })
      .catch(() => undefined);

    const onTargets = (event: Event) => {
      const detail = (event as CustomEvent<CommercialTarget[]>).detail;
      if (Array.isArray(detail)) setTargetState({scope: snapshotScope, rows: detail});
    };
    window.addEventListener(TARGETS_UPDATED_EVENT, onTargets);
    return () => { active = false; window.removeEventListener(TARGETS_UPDATED_EVENT, onTargets); };
  }, [dataUserId, sampleDataActive, snapshotScope]);

  useEffect(() => {
    let active = true;
    let inFlight = false;
    let refreshQueued = false;
    const failed = { workspace: false, incidents: false, plan: false };
    const isCurrentScope = captureLocalWorkspaceScope(dataUserId);
    const isCurrent = () => active && isCurrentScope();
    const incidentError = 'Incident responses could not be loaded. This review is incomplete.';
    setRetryScope(null);

    const load = async (manual = false) => {
      if (!isCurrent() || (manual && !Object.values(failed).some(Boolean))) return;
      if (inFlight) {
        if (manual) setRetryScope(snapshotScope);
        else refreshQueued = true;
        return;
      }
      inFlight = true;
      if (manual) setRetryScope(snapshotScope);
      const read = async <T,>(source: keyof typeof failed, fetch: () => Promise<T>, receive: (result: T | null) => void) => {
        if (manual && !failed[source]) return;
        const result = await fetch().catch(() => null);
        if (!isCurrent()) return;
        failed[source] = result === null;
        receive(result);
      };
      await Promise.allSettled([
        read('workspace', () => loadSalesWorkspaceData(dataUserId), data =>
          setSnapshot({ scope: snapshotScope, data, unavailable: data === null })),
        read('incidents', () => loadCommercialIncidentsForWorkspace(dataUserId, sampleDataActive), rows =>
          setIncidentState({ scope: snapshotScope, rows: rows ?? [], error: rows ? '' : incidentError })),
        read('plan', () => loadPlanItemsForWorkspace(dataUserId, sampleDataActive), rows =>
          setPlanState({ scope: snapshotScope, rows: rows ?? [], error: rows ? undefined : 'Plan is unavailable.' })),
      ]);
      inFlight = false;
      if (!isCurrent()) return;
      setRetryScope(null);
      if (refreshQueued) {
        refreshQueued = false;
        void load();
      }
    };

    retry.current = { scope: snapshotScope, run: () => { void load(true); } };
    const bump = () => { void load(); };
    const onIncidents = () => {
      if (!isCurrent()) return;
      try {
        const rows = loadCommercialIncidents().filter(row => row.userId === (dataUserId || null) && Boolean(row.isSample) === sampleDataActive);
        setIncidentState({ scope: snapshotScope, rows, error: failed.incidents ? incidentError : '' });
      } catch {
        failed.incidents = true;
        setIncidentState({ scope: snapshotScope, rows: [], error: incidentError });
      }
    };
    const onPlanItems = (event: Event) => {
      const detail = (event as CustomEvent<PlanRecord[]>).detail;
      if (isCurrent() && Array.isArray(detail)) setPlanState({scope: snapshotScope, rows: detail});
    };
    window.addEventListener(INCIDENT_UPDATED_EVENT, onIncidents);
    window.addEventListener(COMMITMENTS_UPDATED_EVENT, bump);
    window.addEventListener(THREADS_UPDATED_EVENT, bump);
    window.addEventListener(CONDITION_UPDATED_EVENT, bump);
    window.addEventListener(REQUIREMENT_UPDATED_EVENT, bump);
    window.addEventListener(DEPENDENCY_UPDATED_EVENT, bump);
    window.addEventListener(TIMING_UPDATED_EVENT, bump);
    window.addEventListener(PLAN_ITEMS_UPDATED_EVENT, onPlanItems);
    void load();
    return () => {
      active = false;
      retry.current = null;
      window.removeEventListener(INCIDENT_UPDATED_EVENT, onIncidents);
      window.removeEventListener(COMMITMENTS_UPDATED_EVENT, bump);
      window.removeEventListener(THREADS_UPDATED_EVENT, bump);
      window.removeEventListener(CONDITION_UPDATED_EVENT, bump);
      window.removeEventListener(REQUIREMENT_UPDATED_EVENT, bump);
      window.removeEventListener(DEPENDENCY_UPDATED_EVENT, bump);
      window.removeEventListener(TIMING_UPDATED_EVENT, bump);
      window.removeEventListener(PLAN_ITEMS_UPDATED_EVENT, onPlanItems);
    };
  }, [dataUserId, sampleDataActive, snapshotScope]);

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
  const attentionSources = useMemo(() => workspace
    ? indexCommercialReviewSources(workspace, threads, commitments, sampleDataActive)
    : undefined, [workspace, threads, commitments, sampleDataActive]);

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
      targets: targets.map((target) => ({ quarter: target.period, amount: target.amount, currency: target.currency, fiscalYear: target.fiscalYear })),
      outcomes: canonicalReviewOutcomes(workspace.opportunities, workspace.opportunityOutcomes),
      qualification,
      fiscalYearStartMonth: targets[0]?.fiscalYearStartMonth || 1,
      includeSampleRecords: sampleDataActive,
    });
  }, [qualification, sampleDataActive, targets, threads, workspace]);

  const moneyConsequences=useMemo(()=>workspace?deriveMoneyConsequences({opportunities:workspace.opportunities,
    quotes:workspace.quotes,gates:workspace.moneyGates,requirements:workspace.requirements,conditions:workspace.conditions,
    evidence:workspace.evidence,dependencies:workspace.dependencies,timingAssertions:workspace.timing,commitments,
    today:todayDateKey(),calculatedAt:new Date().toISOString()}):null,[commitments,workspace]);
  const recommendations = useMemo<Recommendation[]>(() => {
    if (!workspace) return [];
    const current=evaluateCommercialPolicies({
      threads,
      commitments,
      incidents,
      opportunities: workspace.opportunities,
      quotes: workspace.quotes,
      coverage,
      // What the seller has recorded learning. Without it, "nothing recorded
      // supports that stage" is said over a deal whose trial result is on file.
      evidence: workspace.evidence,
      conditions: workspace.conditions,
      requirements: workspace.requirements,
      dependencies: workspace.dependencies,
      timing: workspace.timing,
      // In the demo, the sample data is the workspace. Anywhere else, a demo
      // record must never raise a real risk.
      includeSampleRecords: sampleDataActive,
    });
    return moneyConsequences?attachMoneyConsequenceContext(current,moneyConsequences):current;
  }, [commitments, coverage, incidents, moneyConsequences, sampleDataActive, threads, workspace]);

  /**
   * The same recommendations, in the order they are worth doing.
   *
   * Ranked here rather than in each surface, so Today and Review cannot put the
   * same book in two different orders. There is no delta at this scope - it
   * covers the whole workspace, and a delta belongs to one subject - so this is
   * the deterministic order from urgency, unblocking power, evidence and value.
   * A subject-scoped surface re-ranks with its own observed changes; see
   * `useCommercialDelta`.
   */
  /**
   * What the seller's own closed deals show, measured once per workspace.
   *
   * Memoised on the workspace rather than computed per surface: it walks every
   * closed deal once per pattern, and Today re-renders far more often than the
   * book of closed deals changes.
   *
   * It produces evidence, never a candidate. See `personalEvidenceFor` for why
   * only a matured, dimension-relevant pattern reaches a rationale at all, and
   * why none of it changes the order.
   */
  const bookLearning = useMemo(() => {
    if (!workspace) return null;
    return derivePersonalLearning({
      opportunities: workspace.opportunities,
      opportunityOutcomes: workspace.opportunityOutcomes,
      activities: workspace.activities,
      stakeholders: workspace.stakeholders,
      objections: workspace.objections,
      quotes: workspace.quotes,
      commitments: workspace.commitments,
      evidence: workspace.evidence,
      includeSampleRecords: sampleDataActive,
    });
  }, [sampleDataActive, workspace]);

  const ranking = useMemo(() => {
    if (!workspace) return null;
    return rankRecommendations({
      recommendations,
      opportunities: workspace.opportunities,
      quotes: workspace.quotes,
      commitments,
      objections: workspace.objections,
      qualification,
      // Rationale lines only. Nothing here moves a recommendation up or down.
      personalEvidence: personalEvidenceFor(bookLearning?.patterns || [], recommendations),
    });
  }, [bookLearning, commitments, qualification, recommendations, workspace]);

  // `planItems` is returned as well as consumed: the promises on the Plan are
  // where completions are actually recorded, so Delta needs the same list this
  // hook already loaded rather than fetching it a second time.
  return {
    threads,
    attentionError,
    attentionLoading,
    attentionUnavailable,
    attentionRetrying,
    retryAttention,
    attentionScope: incidentScope,
    attentionSources,
    workspaceName,
    recommendations,
    /**
     * The ledger plus the promises derived from the Plan and from captures.
     *
     * Returned because every consumer that reasons about "is anything scheduled
     * here" must see the same list the policy engine saw. The stored ledger
     * alone is empty on most workspaces, so a consumer reading `workspace.commitments`
     * would conclude nothing is ever scheduled.
     */
    commitments,
    rankedRecommendations: ranking?.ranked || [],
    suppressedRecommendations: ranking?.suppressed || [],
    coverage,
    moneyConsequences,
    qualification,
    /** What the closed deals show. Evidence for Review; never a recommendation. */
    bookLearning,
    workspace,
    planItems,
    loading,
  };
}
