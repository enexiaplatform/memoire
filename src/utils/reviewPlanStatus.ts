import { isValidBusinessDate } from './safeDate.ts';

export const reviewPlanStatusLabels = {
  planned: 'Planned',
  reported_done: 'Reported Done',
  verified_done: 'Verified Done',
} as const;

export type ReviewPlanStatusRow = {
  item_id: string;
  proposal_id: string;
  label: string;
  plan_date: string;
  completion_status: keyof typeof reviewPlanStatusLabels;
  activity_id: string | null;
  activity_evidence: ReviewActivityEvidence | null;
};

type ReviewActivityEvidence = {
  date: string | null;
  type: string | null;
  summary: string | null;
  opportunity_id: string | null;
  opportunity_name: string | null;
  outcome: unknown;
};

const isUuid = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
const nullableText = (value: unknown) => value === null || typeof value === 'string';

function isReviewActivityEvidence(value: unknown): value is ReviewActivityEvidence {
  if (!value || typeof value !== 'object') return false;
  const row = value as ReviewActivityEvidence;
  return nullableText(row.date) && nullableText(row.type) && nullableText(row.summary)
    && (row.opportunity_id === null || isUuid(row.opportunity_id)) && nullableText(row.opportunity_name);
}

export function confirmedReviewOutcome(activity: ReviewActivityEvidence | null) {
  if (!activity?.opportunity_id || !activity.outcome || typeof activity.outcome !== 'object') return null;
  const { result, date, reason } = activity.outcome as { result: string; date: string; reason: string };
  if ((result !== 'Won' && result !== 'Lost') || !isValidBusinessDate(date) || !isValidBusinessDate(activity.date)
      || date < activity.date || typeof reason !== 'string' || !reason.trim()) return null;
  return { result, date, reason: reason.trim() };
}

export function isReviewPlanStatusRow(value: unknown): value is ReviewPlanStatusRow {
  if (!value || typeof value !== 'object') return false;
  const row = value as ReviewPlanStatusRow;
  return typeof row.item_id === 'string' && row.item_id.length > 0 && row.item_id.length <= 200
    && typeof row.proposal_id === 'string' && row.proposal_id.length > 0 && row.proposal_id.length <= 300
    && typeof row.label === 'string' && Boolean(row.label.trim())
    && isValidBusinessDate(row.plan_date)
    && Object.hasOwn(reviewPlanStatusLabels, row.completion_status)
    && (row.completion_status === 'verified_done'
      ? isUuid(row.activity_id) && isReviewActivityEvidence(row.activity_evidence)
      : row.activity_id === null && row.activity_evidence === null);
}

export function planItemHref(id: string, date: string) {
  return '/app/timeline?' + new URLSearchParams({ view: 'upcoming', date, planItem: id }).toString();
}
