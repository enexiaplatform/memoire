import { useEffect, useMemo, useState } from 'react';
import { useAuthContext } from '../../auth/authContext';
import { hasLocalSampleData } from '../../utils/dataMode';
import {
  earliestObservedAt,
  EVENT_WINDOW_DAYS,
  EVENT_WINDOW_LIMIT,
  EVENTS_UPDATED_EVENT,
  loadRecentEvents,
} from '../../services/commercialKernel/eventStore';
import type { CommercialEvent } from '../../domain/commercialKernel/types';
import {
  deriveCommercialDelta,
  type CommercialDelta,
  type CommercialDeltaSubject,
} from '../../domain/commercialKernel/deriveDelta';
import {
  rankRecommendations,
  type RankedRecommendation,
} from '../../domain/commercialKernel/rankRecommendations';
import {
  currentEvidenceFor,
  projectCurrentEvidence,
  type CommercialEvidence,
} from '../../domain/commercialKernel/commercialEvidence';
import { personalEvidenceFor } from '../../domain/commercialLearning/personalEvidenceFor';
import { useCommercialThreads } from './useCommercialThreads';

/**
 * The delta for one subject, over the workspace the threads hook already read.
 *
 * Two deliberate choices:
 *
 *   1. It reuses `useCommercialThreads`. The recommendations Delta presents as
 *      current conditions are the same objects the risk panel beside it renders,
 *      so two panels on one screen cannot disagree about the same customer -
 *      the failure the Commercial Kernel exists to end.
 *   2. The event window is loaded once per workspace and shared, not once per
 *      panel. Events are the only collection Delta needs that is not already in
 *      the workspace load, and a page may hold more than one delta.
 */

type EventWindow = { events: CommercialEvent[]; observedFrom: string | null };

const EMPTY_WINDOW: EventWindow = { events: [], observedFrom: null };

/** One request per workspace, shared by every panel on the page. */
const windowsInFlight = new Map<string, Promise<EventWindow>>();
const windowCache = new Map<string, EventWindow>();

function workspaceKey(userId: string | undefined, sampleDataActive: boolean) {
  return `${userId || 'local'}|${sampleDataActive ? 'sample' : 'live'}`;
}

function toWindow(events: CommercialEvent[]): EventWindow {
  return { events, observedFrom: earliestObservedAt(events) };
}

async function readEventWindow(userId: string | undefined, sampleDataActive: boolean): Promise<EventWindow> {
  const key = workspaceKey(userId, sampleDataActive);
  const cached = windowCache.get(key);
  if (cached) return cached;

  const existing = windowsInFlight.get(key);
  if (existing) return existing;

  const request = loadRecentEvents(userId, sampleDataActive)
    .then((events) => {
      const value = toWindow(events);
      windowCache.set(key, value);
      return value;
    })
    .catch(() => EMPTY_WINDOW)
    .finally(() => { windowsInFlight.delete(key); });

  windowsInFlight.set(key, request);
  return request;
}

export function useCommercialDelta(subject: CommercialDeltaSubject | null): {
  delta: CommercialDelta | null;
  /** The delta's "now what", with the ranking that put it first attached. */
  bestMove: RankedRecommendation | null;
  /**
   * What is currently believed about this subject, one record per category.
   *
   * Separate from `delta.changes` because they answer different questions. A
   * finding recorded five weeks ago is not a change this fortnight, and it is
   * still what the deal is standing on.
   */
  currentEvidence: CommercialEvidence[];
  loading: boolean;
} {
  const { user } = useAuthContext();
  const sampleDataActive = hasLocalSampleData();
  const dataUserId = sampleDataActive ? undefined : user?.id;

  const {
    workspace, recommendations, commitments, planItems, bookLearning, loading,
  } = useCommercialThreads();
  const [eventWindow, setEventWindow] = useState<EventWindow>(
    () => windowCache.get(workspaceKey(dataUserId, sampleDataActive)) || EMPTY_WINDOW,
  );

  useEffect(() => {
    let active = true;
    void readEventWindow(dataUserId, sampleDataActive).then((value) => {
      if (active) setEventWindow(value);
    });
    return () => { active = false; };
  }, [dataUserId, sampleDataActive]);

  /**
   * An event written anywhere - closing a deal, moving a quarter - changes what
   * this panel should say.
   *
   * The refresh is taken from the dispatch payload rather than by re-reading.
   * `loadRecentEvents` writes the merged window back to the browser copy, and
   * that write dispatches this same event: re-reading here would call the loader
   * from inside its own notification, forever.
   */
  useEffect(() => {
    const key = workspaceKey(dataUserId, sampleDataActive);
    const onEvents = (domEvent: Event) => {
      const detail = (domEvent as CustomEvent<CommercialEvent[]>).detail;
      if (!Array.isArray(detail)) return;
      const since = new Date(Date.now() - EVENT_WINDOW_DAYS * 86_400_000).toISOString();
      const value = toWindow(
        detail.filter((event) => event.occurredAt >= since).slice(0, EVENT_WINDOW_LIMIT),
      );
      windowCache.set(key, value);
      setEventWindow(value);
    };
    window.addEventListener(EVENTS_UPDATED_EVENT, onEvents);
    return () => window.removeEventListener(EVENTS_UPDATED_EVENT, onEvents);
  }, [dataUserId, sampleDataActive]);

  // Subjects are built inline by the pages that own them, so the memo keys on
  // the subject's content rather than its identity - otherwise this recomputes
  // on every render of the page above it.
  const subjectKey = subject ? JSON.stringify(subject) : '';

  /**
   * The observed changes, derived before anything is ranked.
   *
   * `changes` depends only on events and records - never on recommendations -
   * so it can be computed first and handed to the ranking as context. That is
   * the whole reason this is split in two: the ranking wants to know what has
   * been observed moving here, and the delta wants to point at whichever
   * recommendation the ranking put first.
   */
  const observedChanges = useMemo(() => {
    if (!subject || !workspace) return [];
    return deriveCommercialDelta({
      subject,
      events: eventWindow.events,
      observedFrom: eventWindow.observedFrom,
      commitments,
      planItems,
      objections: workspace.objections,
      stakeholders: workspace.stakeholders,
      activities: workspace.activities,
      opportunityOutcomes: workspace.opportunityOutcomes,
      evidence: workspace.evidence,
      recommendations: [],
      includeSampleRecords: sampleDataActive,
    }).changes;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectKey, eventWindow, workspace, commitments, planItems, sampleDataActive]);

  const ranking = useMemo(() => {
    if (!workspace) return null;
    return rankRecommendations({
      recommendations,
      opportunities: workspace.opportunities,
      quotes: workspace.quotes,
      commitments,
      objections: workspace.objections,
      observedChanges,
      // The same rationale lines the workspace-wide ranking carries. A
      // recommendation explained one way on Today and another way in this
      // drawer is the disagreement the kernel exists to end.
      personalEvidence: personalEvidenceFor(bookLearning?.patterns || [], recommendations),
    });
  }, [bookLearning, commitments, observedChanges, recommendations, workspace]);

  const delta = useMemo(() => {
    if (!subject || !workspace) return null;
    return deriveCommercialDelta({
      subject,
      events: eventWindow.events,
      observedFrom: eventWindow.observedFrom,
      commitments,
      planItems,
      objections: workspace.objections,
      stakeholders: workspace.stakeholders,
      activities: workspace.activities,
      opportunityOutcomes: workspace.opportunityOutcomes,
      evidence: workspace.evidence,
      // Ranked, and with the contradicted ones already gone. Handing the delta
      // the survivors is what keeps "where it stands now" from listing a
      // condition on a deal that was won last month, and makes "now what" the
      // best move rather than the first one the severity sort happened to hit.
      recommendations: ranking?.ranked || [],
      includeSampleRecords: sampleDataActive,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectKey, eventWindow, workspace, commitments, planItems, ranking, sampleDataActive]);

  /** The same recommendation the delta points at, with its ranking attached. */
  const bestMove = useMemo(() => {
    if (!delta?.recommendation || !ranking) return null;
    return ranking.ranked.find((item) => item.id === delta.recommendation?.id) || null;
  }, [delta, ranking]);

  /**
   * Indexed once for the whole subject, from the same projection the policy
   * engine and Delta use. Nothing re-scans the evidence list per render, and
   * nothing folds it inside a comparator.
   */
  const currentEvidence = useMemo(() => {
    if (!subject || !workspace) return [];
    const scoped = workspace.evidence.filter((record) => (
      sampleDataActive || record.isSample !== true
    ));
    const projection = projectCurrentEvidence(scoped);
    if (subject.kind === 'account') {
      return currentEvidenceFor(projection, { accountName: subject.name });
    }
    return currentEvidenceFor(projection, {
      opportunityId: subject.kind === 'opportunity' ? subject.id : subject.opportunityId,
      accountName: subject.accountName,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectKey, workspace, sampleDataActive]);

  return { delta, bestMove, currentEvidence, loading };
}
