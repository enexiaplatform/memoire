import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuthContext } from '../../auth/authContext';
import { hasLocalSampleData } from '../../utils/dataMode';
import { SAMPLE_DATA_UPDATED_EVENT } from '../../utils/sampleData';
import { getCachedSalesWorkspaceData } from '../../services/workspaceData';
import { useWorkspaceRefresh } from '../../hooks/useWorkspaceRefresh';
import { scorePipelineQualification, summariseQualification } from '../../utils/dealQualificationScore';
import { selectQualifiedPipeline, disqualifiedLeadIds } from '../../utils/leadQueue';

export type RailSignals = {
  /** Deals still in play. Null until a workspace has been read at all. */
  openDeals: number | null;
  /**
   * The weekly review's one sentence: how many live deals sit at a stage their
   * own evidence does not reach. Read from the qualification engine Review and
   * the policy engine already use, so the rail cannot disagree with them.
   */
  review: { scored: number; overStated: number } | null;
};

const EMPTY: RailSignals = { openDeals: null, review: null };

/** How long to keep looking for a workspace nobody has loaded yet. */
const CACHE_POLL_MS = 1500;
const CACHE_POLL_LIMIT = 20;

/**
 * What the rail knows about the book, read only from the copy a page already
 * loaded.
 *
 * The rail is on screen for every route, so it must never be the reason a
 * workspace is fetched: it reads the per-collection cache and nothing else. A
 * fresh session has no cache until the first page fills it, so the hook looks
 * again briefly rather than showing nothing until the operator navigates.
 */
export function useRailSignals(): RailSignals {
  const { user } = useAuthContext();
  const { pathname } = useLocation();
  const [signals, setSignals] = useState<RailSignals>(EMPTY);
  const dataUserId = hasLocalSampleData() ? undefined : user?.id;
  /**
   * The arrays the last score was computed from. The cache hands back the same
   * array until a collection reloads, so a route change that loaded nothing new
   * finds every reference unchanged and skips the rescore - which is most of
   * them.
   */
  const scoredFrom = useRef<unknown[]>([]);

  const read = useCallback(() => {
    const workspace = getCachedSalesWorkspaceData(dataUserId);
    if (!workspace) {
      // No copy for *this* workspace. Whatever the rail was showing belonged to
      // the last one read - another account on this browser, or the demo - and
      // a count from somebody else's book is the one thing it must not keep.
      scoredFrom.current = [];
      setSignals((current) => (current === EMPTY ? current : EMPTY));
      return false;
    }

    // The Opportunities row counts the qualified pipeline, which is what that
    // page lists. Counting leads here put "8" beside a page that shows five.
    const pipeline = selectQualifiedPipeline(workspace.opportunities, disqualifiedLeadIds(workspace.opportunityOutcomes));
    const openDeals = pipeline.filter((opportunity) => opportunity.status === 'Active').length;
    setSignals((current) => (current.openDeals === openDeals ? current : { ...current, openDeals }));

    const inputs = [workspace.opportunities, workspace.stakeholders, workspace.objections, workspace.activities, workspace.quotes];
    if (inputs.length === scoredFrom.current.length && inputs.every((input, index) => input === scoredFrom.current[index])) {
      return true;
    }
    scoredFrom.current = inputs;

    // Scoring walks every live deal against its people, objections and touches.
    // Cheap for a page that asked for it; the rail did not, so it waits for an
    // idle moment rather than competing with the page's own first paint.
    const score = () => {
      // Superseded while it waited for idle time - a newer read, or a workspace
      // switch that cleared the rail. Its answer is about a book no longer shown.
      if (scoredFrom.current !== inputs) return;
      const summary = summariseQualification(scorePipelineQualification({
        // MEDDIC grades qualified deals. A lead at "a stage its evidence does
        // not reach" is every lead, and the sentence would count them all.
        opportunities: pipeline,
        stakeholders: workspace.stakeholders,
        objections: workspace.objections,
        activities: workspace.activities,
        quotes: workspace.quotes,
      }));
      setSignals((current) => (
        current.review?.scored === summary.scored && current.review.overStated === summary.overStated
          ? current
          : { ...current, review: { scored: summary.scored, overStated: summary.overStated } }
      ));
    };
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      window.requestIdleCallback(score, { timeout: 2000 });
    } else {
      setTimeout(score, 0);
    }
    return true;
  }, [dataUserId]);

  useEffect(() => {
    if (read()) return;
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      if (read() || attempts >= CACHE_POLL_LIMIT) window.clearInterval(timer);
    }, CACHE_POLL_MS);
    return () => window.clearInterval(timer);
    // A route change is when a page has most likely just loaded something.
  }, [pathname, read]);

  useWorkspaceRefresh(() => { read(); });

  useEffect(() => {
    const onSampleData = () => { read(); };
    window.addEventListener(SAMPLE_DATA_UPDATED_EVENT, onSampleData);
    return () => window.removeEventListener(SAMPLE_DATA_UPDATED_EVENT, onSampleData);
  }, [read]);

  return signals;
}
