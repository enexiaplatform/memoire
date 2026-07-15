import type { EarlyAccessRequestRecord } from './earlyAccessRequests';

export type CohortBucket = 'invite-first' | 'backup' | 'clarify' | 'skip';

export type CohortSignal = {
  id: string;
  label: string;
  points: number;
  met: boolean;
  /** When the form cannot fully measure the signal, say so plainly. */
  note?: string;
};

export type CohortQualification = {
  score: number;
  maxScore: number;
  bucket: CohortBucket;
  signals: CohortSignal[];
};

const REVIEW_PAIN_FREQUENCIES = new Set(['Weekly', 'Before forecast calls']);

// Roles that indicate someone personally running active B2B opportunities, not
// a manager who only wants dashboards (the doc's avoid list).
const ACTIVE_B2B_ROLES = new Set([
  'Account Executive / Sales Rep',
  'Founder-led sales',
  'Business Development',
  'Consultant / Freelancer',
  'Agency owner',
  'Solo entrepreneur / Solo operator',
]);

const EVIDENCE_PAINS = new Set([
  'Rebuilding deal context before review',
  'Remembering client or partner follow-ups alone',
  'Weak forecast evidence',
  'Objections/proof gaps',
  'Manager-ready summary',
]);

const IMPORT_INTENTS = new Set(['Pipeline Defense Brief', 'CSV import/refresh', 'Review Pack History']);

const NAMED_BUDGET = new Set(['Personal', 'Manager', 'Company']);

/**
 * Scores an early-access request against the Wave 1 qualification rubric
 * (`cohort-validation-system-2026-06-16.md`), deriving each signal from the
 * request form. It is a directional prioritiser, not a decision: the willing/
 * 14-day-commitment signal the form cannot observe is inferred from engagement
 * and flagged as operator-confirmed, never invented. Pure and deterministic.
 */
export function scoreCohortRequest(record: EarlyAccessRequestRecord): CohortQualification {
  const hasReviewPain = REVIEW_PAIN_FREQUENCIES.has(record.pipelineReviewFrequency);
  const activeB2B = ACTIVE_B2B_ROLES.has(record.role);
  // An existing pipeline tool means there is something to import; the explicit
  // import intents say the same.
  const canImport = Boolean(record.currentTool.trim()) || IMPORT_INTENTS.has(record.interestedMost);
  const evidencePain = EVIDENCE_PAINS.has(record.biggestPain);
  // The form never asks "will you do a call and a 14-day test". A filled-in
  // preferred use case is the closest proxy for that effort - counted, but the
  // note keeps the operator honest that it needs confirming on the call.
  const engaged = Boolean(record.preferredUseCase.trim());
  const namedBudget = NAMED_BUDGET.has(record.budgetOwner);

  const signals: CohortSignal[] = [
    { id: 'review-pain', label: 'Weekly / forecast review pain', points: 2, met: hasReviewPain },
    { id: 'active-b2b', label: 'Runs active B2B opportunities', points: 2, met: activeB2B },
    { id: 'can-import', label: 'Has a pipeline to import or add', points: 2, met: canImport },
    { id: 'evidence-pain', label: 'Weak evidence / stale follow-up / objections / review prep', points: 2, met: evidencePain },
    {
      id: 'willing',
      label: 'Willing to do a call + 14-day test',
      points: 1,
      met: engaged,
      note: 'Inferred from a filled-in use case - confirm on the onboarding call.',
    },
    { id: 'named-budget', label: 'Names a budget owner', points: 1, met: namedBudget },
  ];

  const score = signals.reduce((total, signal) => total + (signal.met ? signal.points : 0), 0);
  const maxScore = signals.reduce((total, signal) => total + signal.points, 0);

  return { score, maxScore, bucket: bucketForScore(score), signals };
}

export function bucketForScore(score: number): CohortBucket {
  if (score >= 8) return 'invite-first';
  if (score >= 6) return 'backup';
  if (score >= 4) return 'clarify';
  return 'skip';
}

export const COHORT_BUCKET_LABELS: Record<CohortBucket, string> = {
  'invite-first': 'Invite first',
  backup: 'Backup list',
  clarify: 'Ask one clarification',
  skip: 'Not for cohort 1',
};

/** Sort order for the console: strongest candidates first. */
export function compareCohortQualification(
  left: CohortQualification,
  right: CohortQualification,
): number {
  return right.score - left.score;
}

export type CohortBucketDistribution = Record<CohortBucket, number>;

export function summariseCohortBuckets(records: EarlyAccessRequestRecord[]): CohortBucketDistribution {
  const distribution: CohortBucketDistribution = { 'invite-first': 0, backup: 0, clarify: 0, skip: 0 };
  records.forEach((record) => {
    distribution[scoreCohortRequest(record).bucket] += 1;
  });
  return distribution;
}
