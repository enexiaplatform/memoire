import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from './useAuth';
import { useDemoWorkspaceMode } from './useDemoWorkspaceMode';
import { buildFirstWeekPath, type FirstWeekPath } from '../utils/firstWeekPath';
import { loadPlanItemsForWorkspace, PLAN_ITEMS_UPDATED_EVENT } from '../services/planItemStore';
import {
  getCachedSalesWorkspaceData,
  loadSalesWorkspaceData,
  WORKSPACE_REFRESHED_EVENT,
  type SalesWorkspaceData,
} from '../services/workspaceData';
import type { PlanRecord } from '../utils/weeklyPlan';

/**
 * How far into the operating loop this workspace has actually got.
 *
 * Today already answers this from the workspace it holds anyway, to draw its
 * First Week Path strip. This is the same question for the surfaces that do not
 * hold a workspace - the Getting Started coach asks it on every route - and it
 * goes through the same `buildFirstWeekPath`, from the same per-collection
 * cache, so the corner of the screen can never disagree with the middle of it.
 *
 * It is cheap on purpose. The synchronous cache read answers immediately when
 * any surface has already loaded the workspace, which on `/app` is nearly
 * always; when it does not, the un-forced load joins whatever request that page
 * already has in flight rather than starting a second one. Nothing here ever
 * passes `force`, so mounting the coach costs no round trip of its own.
 */
export function useFirstWeekPath(): { path: FirstWeekPath; loaded: boolean } {
  const { user } = useAuth();
  const sampleDataActive = useDemoWorkspaceMode();
  const dataUserId = sampleDataActive ? undefined : user?.id;

  const [workspace, setWorkspace] = useState<SalesWorkspaceData | null>(() => getCachedSalesWorkspaceData(dataUserId));
  const [planItems, setPlanItems] = useState<PlanRecord[]>([]);

  const refresh = useCallback(() => {
    let cancelled = false;
    void loadSalesWorkspaceData(dataUserId)
      .then((next) => { if (!cancelled) setWorkspace(next); })
      .catch(() => {
        // A workspace that will not load is reported by the sync pill and by
        // the page the operator is actually on. What must not happen is this
        // hook answering anyway: an empty path over a failed load reads as
        // "you have captured nothing", which is the most alarming thing this
        // product could say to someone whose cloud is briefly unreachable. No
        // workspace means `loaded` stays false and the caller shows nothing.
      });
    void loadPlanItemsForWorkspace(dataUserId, sampleDataActive)
      .then((records) => { if (!cancelled) setPlanItems(records); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [dataUserId, sampleDataActive]);

  useEffect(() => refresh(), [refresh]);

  // The three ways progress changes under a surface that is not the one being
  // looked at: the cloud copy lands after first paint, a plan item is ticked
  // anywhere in the product, or the sample workspace is loaded or cleared.
  useEffect(() => {
    const onPlanItems = (event: Event) => {
      const detail = (event as CustomEvent<PlanRecord[]>).detail;
      if (Array.isArray(detail)) setPlanItems(detail);
    };
    const onWorkspace = () => refresh();
    window.addEventListener(PLAN_ITEMS_UPDATED_EVENT, onPlanItems);
    window.addEventListener(WORKSPACE_REFRESHED_EVENT, onWorkspace);
    return () => {
      window.removeEventListener(PLAN_ITEMS_UPDATED_EVENT, onPlanItems);
      window.removeEventListener(WORKSPACE_REFRESHED_EVENT, onWorkspace);
    };
  }, [refresh]);

  const path = useMemo(() => buildFirstWeekPath({
    activities: workspace?.activities || [],
    opportunities: workspace?.opportunities || [],
    briefs: workspace?.briefs || [],
    commitments: planItems,
  }), [planItems, workspace]);

  return { path, loaded: workspace !== null };
}
