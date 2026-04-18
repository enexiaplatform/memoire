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
