import { useEffect, useRef } from 'react';
import { WORKSPACE_REFRESHED_EVENT } from '../services/workspaceData';

/**
 * Re-read the workspace when a cloud load lands behind an already-drawn screen.
 *
 * A surface may be painted from the browser copy so it appears at once rather
 * than after the slowest of sixteen cloud round trips. Only Today ever listened
 * for the cloud answer arriving; Accounts, Opportunities, Stakeholders and the
 * rest kept whatever they were first given, for the rest of the session. That is
 * how a seller ends up looking at a stale screen with no way to tell.
 *
 * By the time this fires the cloud result is in the per-collection cache, so the
 * reload costs a render and no network.
 */
export function useWorkspaceRefresh(refresh: () => void) {
  // Held in a ref so a caller passing an inline arrow - which every caller does -
  // does not tear down and re-attach the listener on every render. Assigned in
  // an effect rather than during render: a render can be thrown away, and a ref
  // written by a discarded render is a value nothing agreed to.
  const latest = useRef(refresh);
  useEffect(() => {
    latest.current = refresh;
  }, [refresh]);

  useEffect(() => {
    const onRefreshed = () => { latest.current(); };
    window.addEventListener(WORKSPACE_REFRESHED_EVENT, onRefreshed);
    return () => window.removeEventListener(WORKSPACE_REFRESHED_EVENT, onRefreshed);
  }, []);
}
