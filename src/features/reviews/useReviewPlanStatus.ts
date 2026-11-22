import { useEffect, useState } from 'react';
import { supabaseClient } from '../../lib/supabaseClient';
import { captureLocalWorkspaceScope } from '../../services/localWorkspaceOwner';
import { PLAN_ITEMS_UPDATED_EVENT } from '../../services/planItemStore';
import { WORKSPACE_REFRESHED_EVENT } from '../../services/workspaceData';
import { fetchAllRows } from '../../services/supabasePaging';
import { isReviewPlanStatusRow, type ReviewPlanStatusRow } from '../../utils/reviewPlanStatus';

export type PlanStatus = { state: 'loading' | 'unavailable' } | { state: 'ready'; rows: ReviewPlanStatusRow[] };

export function useReviewPlanStatus(ownerId: string | undefined, scope: string, accessToken: string | undefined) {
  const [snapshot, setSnapshot] = useState<{ scope: string; accessToken: string; status: PlanStatus }>();
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!ownerId || !accessToken) return;
    const isCurrentScope = captureLocalWorkspaceScope(ownerId);
    const controller = new AbortController();
    let active = true;
    let inFlight = false;
    let refreshQueued = false;
    const read = async () => {
      if (!active || !isCurrentScope()) return;
      if (inFlight) {
        refreshQueued = true;
        return;
      }
      inFlight = true;
      setSnapshot({ scope, accessToken, status: { state: 'loading' } });
      try {
        const client = supabaseClient;
        if (!client) throw new Error('Missing Plan client.');
        const rows = await fetchAllRows<unknown>((from, to) => client.rpc('memoire_review_plan_status', {}, { get: true })
          .order('plan_date', { ascending: false }).order('item_id').range(from, to).abortSignal(controller.signal));
        if (!rows.every(isReviewPlanStatusRow) || new Set(rows.map(row => row.item_id)).size !== rows.length) {
          throw new Error('Invalid Plan status response.');
        }
        if (active && isCurrentScope() && !refreshQueued) setSnapshot({ scope, accessToken, status: { state: 'ready', rows } });
      } catch {
        if (active && isCurrentScope() && !refreshQueued) setSnapshot({ scope, accessToken, status: { state: 'unavailable' } });
      } finally {
        inFlight = false;
        if (refreshQueued) {
          refreshQueued = false;
          void read();
        }
      }
    };
    const refresh = () => { void read(); };
    window.addEventListener(PLAN_ITEMS_UPDATED_EVENT, refresh);
    window.addEventListener(WORKSPACE_REFRESHED_EVENT, refresh);
    window.addEventListener('focus', refresh);
    refresh();
    return () => {
      active = false;
      controller.abort();
      window.removeEventListener(PLAN_ITEMS_UPDATED_EVENT, refresh);
      window.removeEventListener(WORKSPACE_REFRESHED_EVENT, refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [ownerId, scope, accessToken, retry]);

  const status: PlanStatus = ownerId && snapshot?.scope === scope && snapshot.accessToken === accessToken
    ? snapshot.status : { state: 'loading' };
  return { status, retry: () => setRetry(value => value + 1) };
}
