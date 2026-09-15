import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  EMPTY_TOP_BAR_STATE,
  TopBarContext,
  type TopBarContextValue,
  type TopBarState,
} from './topBarContext';

/**
 * The page's half of the top bar.
 *
 * The bar is the shell's and the page is the router's, so the page cannot simply
 * render into it. Under Daylight the bar says something different on each page -
 * "No CRM writeback" and Save on Capture, the worst stakeholder gap on
 * Stakeholders - and those buttons have to call the page's own handlers with the
 * page's own state. A portal keeps both: the elements live in the bar, the
 * component that owns them stays the page.
 *
 * Two slots. `lead` sits where the search pill is and replaces it (search stays
 * one keystroke away on every page). `actions` sits before the sync chip and the
 * global Capture button. A page that brings its own primary action says so, and
 * Capture steps down to a quiet pill so the bar never holds two blue buttons.
 */

export function TopBarProvider({ children }: { children: ReactNode }) {
  const [leadNode, setLeadNode] = useState<HTMLElement | null>(null);
  const [actionsNode, setActionsNode] = useState<HTMLElement | null>(null);
  const [claimed, setClaimed] = useState<{ owner: symbol; state: TopBarState } | null>(null);

  // Stable across renders. The page's effects depend on these, and a fresh
  // function per render would re-run the release-then-claim pair every time
  // the claim itself changed state - a render loop with extra steps.
  const claim = useCallback((owner: symbol, next: TopBarState) => setClaimed((current) => (
    current && current.owner === owner && sameState(current.state, next) ? current : { owner, state: next }
  )), []);
  // Only the page that claimed the bar may hand it back. During a route change
  // the next page can mount before the last one unmounts, and a blind reset
  // would wipe the newcomer's claim.
  const release = useCallback((owner: symbol) => setClaimed((current) => (
    current?.owner === owner ? null : current
  )), []);

  const value = useMemo<TopBarContextValue>(() => ({
    leadNode,
    actionsNode,
    setLeadNode,
    setActionsNode,
    state: claimed?.state || EMPTY_TOP_BAR_STATE,
    claim,
    release,
  }), [actionsNode, claim, claimed, leadNode, release]);

  return <TopBarContext.Provider value={value}>{children}</TopBarContext.Provider>;
}

function sameState(left: TopBarState, right: TopBarState) {
  return left.replacesSearch === right.replacesSearch
    && left.ownsPrimary === right.ownsPrimary
    && left.hasStatus === right.hasStatus;
}

/**
 * Rendered by a page. Outside the shell (a test, the prerender) there is no bar
 * to render into, and it renders nothing rather than throwing.
 */
export function TopBar({
  lead,
  status,
  actions,
  ownsPrimary = false,
}: {
  /** Replaces the search pill with page context - a way back and what this is. */
  lead?: ReactNode;
  /** The page's worst signal, as a StatusChip. */
  status?: ReactNode;
  /** The page's own buttons. Pass `ownsPrimary` when one of them is the primary. */
  actions?: ReactNode;
  ownsPrimary?: boolean;
}) {
  const context = useContext(TopBarContext);
  const [owner] = useState(() => Symbol('top-bar'));
  const replacesSearch = Boolean(lead);
  const hasStatus = Boolean(status);
  const claim = context?.claim;
  const release = context?.release;

  useEffect(() => {
    claim?.(owner, { replacesSearch, ownsPrimary, hasStatus });
  }, [claim, hasStatus, owner, ownsPrimary, replacesSearch]);

  useEffect(() => () => release?.(owner), [owner, release]);

  if (!context) return null;

  return (
    <>
      {lead && context.leadNode ? createPortal(lead, context.leadNode) : null}
      {(status || actions) && context.actionsNode
        ? createPortal(<>{status}{actions}</>, context.actionsNode)
        : null}
    </>
  );
}
