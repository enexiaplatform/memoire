import { writeLocalCollection } from './localWriteGuard.ts';
import type { CapturedFactKind } from '../domain/commercialKernel/capturedFacts.ts';

/**
 * How well the deterministic parser is actually doing, in counts.
 *
 * This exists to answer one question later, with evidence rather than a hunch:
 * is an optional language model worth the dependency it would cost? That
 * question has six sub-questions and every one of them is a ratio:
 *
 *   - how many captures produce anything structured at all
 *   - which fact kinds the parser rarely finds
 *   - which kinds the operator corrects before saving
 *   - which kinds the operator unticks
 *   - how often a note yields nothing
 *   - how many record edits one capture replaces
 *
 * ## What is deliberately not here
 *
 * No note text. No customer, deal or person names. No amounts. No dates. This
 * file stores integers, and it stores them on the operator's own device: it is
 * not sent anywhere, there is no endpoint, and it needs no schema change. The
 * product's promise is that what is written into Capture stays between the
 * operator and their own workspace, and a measurement programme is not a reason
 * to make an exception - especially not one whose whole purpose is to decide
 * whether to introduce a third party later.
 *
 * The existing `ProductEvent` union was the obvious home and is the wrong one:
 * it is mirrored in an API route and in a Postgres CHECK constraint, so adding
 * six names to it is a migration. Counting on the device costs nothing and
 * answers the same question.
 */

export const CAPTURE_METRICS_STORAGE_KEY = 'memoire.captureFactMetrics.v1';

type KindCounts = Partial<Record<CapturedFactKind, number>>;

export type CaptureFactMetrics = {
  /** Notes run through the parser. */
  captures: number;
  /** Notes the parser could find nothing structured in. */
  capturesWithNoFacts: number;
  /** Review sets the operator saved, and how many facts each carried. */
  reviewsSaved: number;
  factsSaved: number;
  /** Findings recognised with no canonical destination. The build-next list. */
  unsupported: number;
  /** Facts that failed to write and were left retryable. */
  saveFailures: number;
  proposed: KindCounts;
  accepted: KindCounts;
  edited: KindCounts;
  ignored: KindCounts;
  /** Proposals the workspace could already answer. */
  alreadyRecorded: KindCounts;
  /**
   * How the commercial scope resolved, by category.
   *
   * The one number that says whether the linkage work landed: a workspace whose
   * captures are mostly `unresolved` has a resolver problem, and one that is
   * mostly `corrected` has a resolver that is confidently wrong - which is the
   * worse of the two and is invisible without this split.
   */
  scopeResolution: Partial<Record<ScopeMetricOutcome, number>>;
  /** Facts written against a deal, and facts left with the customer. */
  opportunityScopedFacts: number;
  accountOnlyFacts: number;
  updatedAt: string;
};

/** The four resolver states plus the operator overriding one of them. */
export type ScopeMetricOutcome =
  | 'exact' | 'strong_match' | 'multiple_matches' | 'unresolved' | 'corrected';

const EMPTY: CaptureFactMetrics = {
  captures: 0,
  capturesWithNoFacts: 0,
  reviewsSaved: 0,
  factsSaved: 0,
  unsupported: 0,
  saveFailures: 0,
  proposed: {},
  accepted: {},
  edited: {},
  ignored: {},
  alreadyRecorded: {},
  scopeResolution: {},
  opportunityScopedFacts: 0,
  accountOnlyFacts: 0,
  updatedAt: '',
};

export function readCaptureFactMetrics(): CaptureFactMetrics {
  if (typeof localStorage === 'undefined') return { ...EMPTY };
  try {
    const raw = localStorage.getItem(CAPTURE_METRICS_STORAGE_KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<CaptureFactMetrics>;
    return { ...EMPTY, ...parsed };
  } catch {
    // A corrupt counter is not worth a broken capture screen.
    return { ...EMPTY };
  }
}

/**
 * Adds one review's worth of counts.
 *
 * Takes categories, never content: the caller passes fact *kinds*, so there is
 * no path by which a customer name or an amount could reach this file even by
 * accident.
 */
export function recordCaptureFactMetrics(delta: {
  parsed?: boolean;
  foundNothing?: boolean;
  unsupported?: number;
  saved?: boolean;
  saveFailures?: number;
  proposed?: CapturedFactKind[];
  accepted?: CapturedFactKind[];
  edited?: CapturedFactKind[];
  ignored?: CapturedFactKind[];
  alreadyRecorded?: CapturedFactKind[];
  scopeResolution?: ScopeMetricOutcome;
  opportunityScopedFacts?: number;
  accountOnlyFacts?: number;
}): CaptureFactMetrics {
  const current = readCaptureFactMetrics();

  const next: CaptureFactMetrics = {
    ...current,
    captures: current.captures + (delta.parsed ? 1 : 0),
    capturesWithNoFacts: current.capturesWithNoFacts + (delta.foundNothing ? 1 : 0),
    reviewsSaved: current.reviewsSaved + (delta.saved ? 1 : 0),
    factsSaved: current.factsSaved + (delta.accepted?.length || 0),
    unsupported: current.unsupported + (delta.unsupported || 0),
    saveFailures: current.saveFailures + (delta.saveFailures || 0),
    proposed: addAll(current.proposed, delta.proposed),
    accepted: addAll(current.accepted, delta.accepted),
    edited: addAll(current.edited, delta.edited),
    ignored: addAll(current.ignored, delta.ignored),
    alreadyRecorded: addAll(current.alreadyRecorded, delta.alreadyRecorded),
    scopeResolution: delta.scopeResolution
      ? {
        ...current.scopeResolution,
        [delta.scopeResolution]: (current.scopeResolution[delta.scopeResolution] || 0) + 1,
      }
      : current.scopeResolution,
    opportunityScopedFacts: current.opportunityScopedFacts + (delta.opportunityScopedFacts || 0),
    accountOnlyFacts: current.accountOnlyFacts + (delta.accountOnlyFacts || 0),
    updatedAt: new Date().toISOString(),
  };

  writeLocalCollection(CAPTURE_METRICS_STORAGE_KEY, JSON.stringify(next));
  return next;
}

/**
 * The ratios, computed rather than stored.
 *
 * Storing a rate would mean storing it wrong the first time the denominator
 * changed. These are the numbers the AI decision is made on.
 */
export function captureFactRates(metrics: CaptureFactMetrics) {
  const rate = (top: number, bottom: number) => (bottom > 0 ? top / bottom : null);
  const kinds = new Set([
    ...Object.keys(metrics.proposed),
    ...Object.keys(metrics.accepted),
  ]) as Set<CapturedFactKind>;

  return {
    /** How often a note yields anything structured at all. */
    usefulCaptureRate: rate(metrics.captures - metrics.capturesWithNoFacts, metrics.captures),
    /** Record edits replaced, per review the operator actually saved. */
    factsPerSavedReview: rate(metrics.factsSaved, metrics.reviewsSaved),
    byKind: [...kinds].map((kind) => ({
      kind,
      proposed: metrics.proposed[kind] || 0,
      acceptanceRate: rate(metrics.accepted[kind] || 0, metrics.proposed[kind] || 0),
      correctionRate: rate(metrics.edited[kind] || 0, metrics.proposed[kind] || 0),
      ignoreRate: rate(metrics.ignored[kind] || 0, metrics.proposed[kind] || 0),
    })),
  };
}

function addAll(counts: KindCounts, kinds?: CapturedFactKind[]): KindCounts {
  if (!kinds || kinds.length === 0) return counts;
  const next = { ...counts };
  for (const kind of kinds) next[kind] = (next[kind] || 0) + 1;
  return next;
}
