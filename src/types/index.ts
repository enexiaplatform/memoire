export type EntityType = 'contact' | 'company' | 'deal' | 'meeting' | 'insight' | 'competitor';

/**
 * `on_trial` is deliberately distinct from `active`: both have full access, but
 * only one of them has a card about to be charged and a date worth showing.
 * See subscriptionStateFor in api/_lemonsqueezy.js.
 */
export type SubscriptionStatus = 'free' | 'on_trial' | 'active' | 'cancelled';
export type SubscriptionTier = 'free' | 'personal' | 'team';

export interface UserProfile {
  id: string;
  display_name: string | null;
  email: string;
  lemonsqueezy_customer_id: string | null;
  lemonsqueezy_subscription_id: string | null;
  subscription_status: SubscriptionStatus;
  subscription_tier: SubscriptionTier;
  /**
   * When the Lemon Squeezy trial ends. Null when there is no trial. Written
   * only by the subscription webhook - the client has no UPDATE grant on it.
   */
  subscription_trial_ends_at?: string | null;
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
