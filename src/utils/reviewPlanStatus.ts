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
};

export function isReviewPlanStatusRow(value: unknown): value is ReviewPlanStatusRow {
  if (!value || typeof value !== 'object') return false;
  const row = value as ReviewPlanStatusRow;
  return typeof row.item_id === 'string' && row.item_id.length > 0 && row.item_id.length <= 200
    && typeof row.proposal_id === 'string' && row.proposal_id.length > 0 && row.proposal_id.length <= 300
    && typeof row.label === 'string' && Boolean(row.label.trim())
    && isValidBusinessDate(row.plan_date)
    && Object.hasOwn(reviewPlanStatusLabels, row.completion_status)
    && (row.completion_status === 'verified_done'
      ? typeof row.activity_id === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(row.activity_id)
      : row.activity_id === null);
}

export function reviewPlanItemHref(id: string, date: string) {
  return '/app/timeline?' + new URLSearchParams({ view: 'upcoming', date, planItem: id }).toString();
}
