import { useEffect, useRef, useState } from 'react';
import { supabaseClient } from '../../lib/supabaseClient';
import { captureLocalWorkspaceScope } from '../../services/localWorkspaceOwner';
import { PLAN_ITEMS_UPDATED_EVENT } from '../../services/planItemStore';
import { WORKSPACE_REFRESHED_EVENT } from '../../services/workspaceData';
import { fetchAllRows } from '../../services/supabasePaging';
import { loadCloudJsonCollection } from '../../services/cloudJsonCollectionStore';
import type { PlanRecord } from '../../utils/weeklyPlan';
import { isReviewPlanStatusRow, requiresLegacyReviewLookup, type ReviewPlanStatusRow } from '../../utils/reviewPlanStatus';

type LegacyLookup = { state: 'loading' | 'unavailable' | 'not-required' }
  | { state: 'ready'; plans: PlanRecord[] };

export type PlanStatus = { state: 'loading' | 'unavailable' }
  | { state: 'ready'; rows: ReviewPlanStatusRow[]; legacy: LegacyLookup };

export function useReviewPlanStatus(ownerId: string | undefined, scope: string, accessToken: string | undefined) {
  const [snapshot, setSnapshot] = useState<{ ownerId: string; scope: string; accessToken: string; status: PlanStatus }>();
  const retry = useRef<{ ownerId: string; scope: string; accessToken: string; run: () => void } | null>(null);
  useEffect(() => {
    if (!ownerId || !accessToken) return;
    const isCurrentScope = captureLocalWorkspaceScope(ownerId);
    const controller = new AbortController();
    const isCurrent = () => !controller.signal.aborted && isCurrentScope();
    let inFlight = false;
    let refreshQueued = false;
    let current: PlanStatus = { state: 'loading' };
    const publish = (status: PlanStatus) => {
      if (!isCurrent()) return;
      current = status;
      setSnapshot({ ownerId, scope, accessToken, status });
    };
    const read = async (invalidate = false) => {
      if (!isCurrent()) return;
      if (inFlight) {
        refreshQueued ||= invalidate;
        return;
      }
      inFlight = true;
      if (current.state !== 'ready') publish({ state: 'loading' });
      else if (current.legacy.state !== 'not-required') publish({ ...current, legacy: { state: 'loading' } });
      try {
        const client = supabaseClient;
        if (!client) throw new Error('Missing Plan client.');
        const rows = await fetchAllRows<unknown>((from, to) => client.rpc('memoire_review_plan_status', {}, { get: true })
          .order('plan_date', { ascending: false }).order('item_id').range(from, to).abortSignal(controller.signal));
        if (!rows.every(isReviewPlanStatusRow) || new Set(rows.map(row => row.item_id)).size !== rows.length) {
          throw new Error('Invalid Plan status response.');
        }
        if (!isCurrent()) return;
        const needsLegacyCheck = rows.some(requiresLegacyReviewLookup);
        publish({ state: 'ready', rows, legacy: { state: needsLegacyCheck ? 'loading' : 'not-required' } });
        if (needsLegacyCheck && !refreshQueued) {
          try {
            const plans = await loadCloudJsonCollection<PlanRecord>('plan_items', ownerId, controller.signal);
            if (!refreshQueued) publish({ state: 'ready', rows, legacy: { state: 'ready', plans } });
          } catch {
            if (!refreshQueued) publish({ state: 'ready', rows, legacy: { state: 'unavailable' } });
          }
        }
      } catch {
        publish({ state: 'unavailable' });
      } finally {
        inFlight = false;
        if (refreshQueued) {
          refreshQueued = false;
          void read();
        }
      }
    };
    const refresh = () => { void read(); };
    const invalidate = () => { void read(true); };
    retry.current = { ownerId, scope, accessToken, run: refresh };
    window.addEventListener(PLAN_ITEMS_UPDATED_EVENT, invalidate);
    window.addEventListener(WORKSPACE_REFRESHED_EVENT, invalidate);
    window.addEventListener('focus', refresh);
    window.addEventListener('online', invalidate);
    window.addEventListener('offline', refresh);
    refresh();
    return () => {
      retry.current = null;
      controller.abort();
      window.removeEventListener(PLAN_ITEMS_UPDATED_EVENT, invalidate);
      window.removeEventListener(WORKSPACE_REFRESHED_EVENT, invalidate);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', invalidate);
      window.removeEventListener('offline', refresh);
    };
  }, [ownerId, scope, accessToken]);

  const status: PlanStatus = ownerId && snapshot?.ownerId === ownerId && snapshot.scope === scope && snapshot.accessToken === accessToken
    ? snapshot.status : { state: 'loading' };
  return { status, retry: () => {
    const request = retry.current;
    if (request && request.ownerId === ownerId && request.scope === scope && request.accessToken === accessToken) request.run();
  } };
}
