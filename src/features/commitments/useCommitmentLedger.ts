import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuthContext } from '../../auth/authContext';
import { hasLocalSampleData } from '../../utils/dataMode';
import {
  COMMITMENTS_UPDATED_EVENT,
  loadCommitments,
  loadCommitmentsForWorkspace,
} from '../../services/commercialKernel/commitmentStore';
import {
  cancelCommitment,
  completeCommitment,
  createCommitment,
  rescheduleCommitment,
  type CreateCommitmentInput,
} from '../../domain/commercialKernel/commands';
import type { CommercialCommitment, CommercialScope } from '../../domain/commercialKernel/types';
import { mergePlanCommitments } from '../../domain/commercialKernel/derivePlanCommitments';
import { loadPlanItemsForWorkspace, PLAN_ITEMS_UPDATED_EVENT } from '../../services/planItemStore';
import {
  getCachedSalesWorkspaceData,
  loadSalesWorkspaceData,
  WORKSPACE_REFRESHED_EVENT,
} from '../../services/workspaceData';
import type { SalesActivityRecord } from '../../services/salesActivityStore';
import type { PlanRecord } from '../../utils/weeklyPlan';
import { todayDateKey } from '../../utils/safeDate.ts';
import { trackProductEvent } from '../../utils/productAnalytics';

export type CommitmentGroups = {
  overdue: CommercialCommitment[];
  dueToday: CommercialCommitment[];
  upcoming: CommercialCommitment[];
  undated: CommercialCommitment[];
  settled: CommercialCommitment[];
};

/**
 * One hook, one source of truth for commitments.
 *
 * Today and Timeline both show promises. When each loaded its own copy and
 * implemented its own "tick", the two surfaces could disagree about whether a
 * promise was kept - so both call this, and both re-render from the same
 * COMMITMENTS_UPDATED_EVENT the commands emit.
 */
export function useCommitmentLedger() {
  const { user } = useAuthContext();
  const sampleDataActive = hasLocalSampleData();
  const dataUserId = sampleDataActive ? undefined : user?.id;
  const scope: CommercialScope = useMemo(
    () => ({ userId: dataUserId || null, sampleDataActive }),
    [dataUserId, sampleDataActive],
  );

  const [recorded, setRecorded] = useState<CommercialCommitment[]>(() => loadCommitments());
  const [planItems, setPlanItems] = useState<PlanRecord[]>([]);
  const [activities, setActivities] = useState<SalesActivityRecord[]>(
    () => getCachedSalesWorkspaceData(dataUserId)?.activities || [],
  );
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  // The dated promises a capture made live on the captures themselves - the
  // Plan board derives its days from them rather than storing a row - so the
  // ledger has to read the same workspace. The load is the shared, cached one
  // every `/app` surface already asks for; it joins that request rather than
  // starting a second.
  useEffect(() => {
    let active = true;
    const readWorkspace = () => {
      void loadSalesWorkspaceData(dataUserId)
        .then((data) => { if (active) setActivities(data.activities); })
        .catch(() => undefined);
    };
    readWorkspace();
    window.addEventListener(WORKSPACE_REFRESHED_EVENT, readWorkspace);
    return () => { active = false; window.removeEventListener(WORKSPACE_REFRESHED_EVENT, readWorkspace); };
  }, [dataUserId]);

  useEffect(() => {
    let active = true;
    void loadCommitmentsForWorkspace(dataUserId, sampleDataActive)
      .then((records) => {
        if (!active) return;
        setRecorded(records);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    void loadPlanItemsForWorkspace(dataUserId, sampleDataActive)
      .then((records) => { if (active) setPlanItems(records); })
      .catch(() => undefined);

    const onUpdate = (event: Event) => {
      const detail = (event as CustomEvent<CommercialCommitment[]>).detail;
      if (Array.isArray(detail)) setRecorded(detail);
    };
    const onPlanItems = (event: Event) => {
      const detail = (event as CustomEvent<PlanRecord[]>).detail;
      if (Array.isArray(detail)) setPlanItems(detail);
    };
    window.addEventListener(COMMITMENTS_UPDATED_EVENT, onUpdate);
    window.addEventListener(PLAN_ITEMS_UPDATED_EVENT, onPlanItems);
    return () => {
      active = false;
      window.removeEventListener(COMMITMENTS_UPDATED_EVENT, onUpdate);
      window.removeEventListener(PLAN_ITEMS_UPDATED_EVENT, onPlanItems);
    };
  }, [dataUserId, sampleDataActive]);

  // What is promised, not what was typed into this panel. A dated promise that
  // reached the Plan from a capture is a promise; leaving it out is how every
  // surface in the product came to answer "Nothing is promised right now" over
  // a workspace that had one.
  const commitments = useMemo(
    () => mergePlanCommitments(recorded, { activities, planItems, includeSampleRecords: sampleDataActive }),
    [activities, planItems, recorded, sampleDataActive],
  );

  const groups = useMemo<CommitmentGroups>(() => {
    const today = todayDateKey();
    const open = commitments.filter((item) => item.status === 'open');
    return {
      overdue: open.filter((item) => item.currentDueDate && item.currentDueDate < today),
      dueToday: open.filter((item) => item.currentDueDate === today),
      upcoming: open.filter((item) => item.currentDueDate && item.currentDueDate > today),
      undated: open.filter((item) => !item.currentDueDate),
      settled: commitments.filter((item) => item.status !== 'open'),
    };
  }, [commitments]);

  const run = useCallback((result: { ok: boolean; error?: string }, success: string) => {
    setMessage(result.ok ? success : result.error || 'That did not work. Nothing was changed.');
    return result.ok;
  }, []);

  // Analytics is emitted here, where the behaviour happens, rather than in each
  // page - so a commitment created on Today and one created on Timeline count
  // as the same thing. The `first_*` events fire once per browser and never in
  // the demo, because activation means "this worked for them once", not "they
  // looked at the showcase".
  const create = useCallback((input: CreateCommitmentInput) => {
    const created = run(createCommitment(scope, input), 'Commitment recorded.');
    if (created) {
      // `first_commitment_created` rides along automatically - see
      // ACTIVATION_OF in src/utils/productAnalytics.ts. It was fired by hand
      // here, and that arrangement is what left three of the five activation
      // events with no emitter at all.
      trackProductEvent('commitment_created');
    }
    return created;
  }, [run, scope]);

  const complete = useCallback((commitmentId: string, evidence?: string) => {
    const completed = run(completeCommitment(scope, { commitmentId, evidence }), 'Marked as kept.');
    if (completed) {
      trackProductEvent('commitment_completed');
    }
    return completed;
  }, [run, scope]);

  const cancel = useCallback((commitmentId: string, reason?: string) =>
    run(cancelCommitment(scope, { commitmentId, reason }), 'Commitment cancelled.'), [run, scope]);

  const reschedule = useCallback((commitmentId: string, newDueDate: string, reason?: string) => {
    const moved = run(
      rescheduleCommitment(scope, { commitmentId, newDueDate, reason }),
      'Moved. The promise you first made is kept in its history.',
    );
    if (moved) trackProductEvent('commitment_rescheduled');
    return moved;
  }, [run, scope]);

  return {
    commitments,
    groups,
    loading,
    message,
    clearMessage: () => setMessage(''),
    create,
    complete,
    cancel,
    reschedule,
    scope,
  };
}
