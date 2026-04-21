export type RevenueBand =
  | 'undisclosed' | '<$10K' | '$10-50K'
  | '$50-250K' | '$250K-$1M' | '>$1M';

export type DealOutcome =
  | 'in-progress' | 'won' | 'lost' | 'no-decision' | 'archived';

export type DealPrivacy = 'personal' | 'shareable';

export interface Deal {
  id: string;
  user_id: string;
  contact_id: string | null;
  company_anonymized: string | null;
  company_label: string | null;
  product_categories: string[];
  revenue_band: RevenueBand | null;
  close_date: string | null; // ISO date
  outcome: DealOutcome;
  what_won: string | null;
  what_almost_killed: string | null;
  lessons: string | null;
  stakeholder_contact_ids: string[];
  privacy_flag: DealPrivacy;
  created_at: string;
  updated_at: string;
}

export const REVENUE_BANDS: RevenueBand[] = [
  'undisclosed','<$10K','$10-50K','$50-250K','$250K-$1M','>$1M'
];

export const DEAL_OUTCOMES: { value: DealOutcome; label: string; color: string }[] = [
  { value: 'in-progress', label: 'In Progress', color: '#F59E0B' },
  { value: 'won',         label: 'Won',         color: '#10B981' },
  { value: 'lost',        label: 'Lost',        color: '#EF4444' },
  { value: 'no-decision', label: 'No Decision', color: '#6B7280' },
  { value: 'archived',    label: 'Archived',    color: '#9CA3AF' },
];
