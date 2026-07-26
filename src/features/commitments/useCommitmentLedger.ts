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
import { todayDateKey } from '../../utils/safeDate.ts';
import { trackFirstTimeEvent, trackProductEvent } from '../../utils/productAnalytics';

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

  const [commitments, setCommitments] = useState<CommercialCommitment[]>(() => loadCommitments());
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    void loadCommitmentsForWorkspace(dataUserId, sampleDataActive)
      .then((records) => {
        if (!active) return;
        setCommitments(records);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    const onUpdate = (event: Event) => {
      const detail = (event as CustomEvent<CommercialCommitment[]>).detail;
      if (Array.isArray(detail)) setCommitments(detail);
    };
    window.addEventListener(COMMITMENTS_UPDATED_EVENT, onUpdate);
    return () => { active = false; window.removeEventListener(COMMITMENTS_UPDATED_EVENT, onUpdate); };
  }, [dataUserId, sampleDataActive]);

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
      trackProductEvent('commitment_created');
      trackFirstTimeEvent('first_commitment_created');
    }
    return created;
  }, [run, scope]);

  const complete = useCallback((commitmentId: string, evidence?: string) => {
    const completed = run(completeCommitment(scope, { commitmentId, evidence }), 'Marked as kept.');
    if (completed) {
      trackProductEvent('commitment_completed');
      trackFirstTimeEvent('first_commitment_completed');
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
