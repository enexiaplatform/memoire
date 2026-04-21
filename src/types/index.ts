export type EntityType = 'contact' | 'company' | 'deal' | 'meeting' | 'insight' | 'competitor';

export type SubscriptionStatus = 'free' | 'active' | 'cancelled';
export type SubscriptionTier = 'free' | 'personal' | 'team';

export interface UserProfile {
  id: string;
  display_name: string | null;
  email: string;
  stripe_customer_id: string | null;
  subscription_status: SubscriptionStatus;
  subscription_tier: SubscriptionTier;
  acknowledged_at?: string | null;
  acknowledged_hiring_boundary_at?: string | null;
  anonymize_default?: boolean;
  created_at: string;
  updated_at: string;
}

export interface Entity {
  id: string;
  user_id: string;
  entity_type: EntityType;
  name: string;
  description: string | null;
  attributes: Record<string, unknown>;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface Relationship {
  id: string;
  user_id: string;
  source_entity_id: string;
  target_entity_id: string;
  relationship_type: string;
  created_at: string;
}

export interface Capture {
  id: string;
  user_id: string;
  raw_text: string;
  structured_data: Record<string, unknown>;
  entity_ids: string[];
  status: 'pending' | 'processed';
  anonymization_state?: 'original' | 'anonymized' | 'mixed';
  original_text?: string | null;
  anonymized_at?: string | null;
  captured_at: string;
  created_at: string;
}

export interface ActivityLog {
  id: string;
  user_id: string;
  action: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}
