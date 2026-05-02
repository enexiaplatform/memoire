export type SalesStage = 'new' | 'active' | 'proposal' | 'negotiation' | 'won' | 'lost' | 'paused';
export type SalesPriority = 'low' | 'medium' | 'high';
export type InteractionType = 'call' | 'email' | 'meeting' | 'note' | 'proposal' | 'other';

export interface Account {
  id: string;
  user_id: string;
  name: string;
  summary: string | null;
  industry: string | null;
  status: 'active' | 'inactive' | 'archived';
  pain_points: string[];
  objections: string[];
  source_capture_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  user_id: string;
  account_id: string | null;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  source_capture_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Opportunity {
  id: string;
  user_id: string;
  account_id: string | null;
  contact_id: string | null;
  title: string;
  stage: SalesStage;
  estimated_value: number | null;
  blocker: string | null;
  next_action_text: string | null;
  last_touch_at: string | null;
  urgency: SalesPriority;
  confidence: SalesPriority;
  source_capture_id: string | null;
  created_at: string;
  updated_at: string;
  account?: Pick<Account, 'id' | 'name'> | null;
  contact?: Pick<Contact, 'id' | 'name' | 'role'> | null;
}

export interface Interaction {
  id: string;
  user_id: string;
  account_id: string | null;
  contact_id: string | null;
  opportunity_id: string | null;
  source_capture_id: string | null;
  interaction_type: InteractionType;
  occurred_at: string;
  summary: string;
  pain_point: string | null;
  objection: string | null;
  raw_note: string;
  structured_data: Record<string, unknown>;
  created_at: string;
}

export interface SalesAction {
  id: string;
  user_id: string;
  account_id: string | null;
  contact_id: string | null;
  opportunity_id: string | null;
  interaction_id: string | null;
  title: string;
  due_date: string | null;
  status: 'open' | 'done' | 'dismissed';
  suggested: boolean;
  source: 'capture' | 'stale_opportunity' | 'manual' | 'ask_memoire';
  created_at: string;
  updated_at: string;
  account?: Pick<Account, 'id' | 'name'> | null;
  contact?: Pick<Contact, 'id' | 'name' | 'role'> | null;
  opportunity?: Pick<Opportunity, 'id' | 'title' | 'stage'> | null;
}

export interface StructuredSalesCapture {
  type: InteractionType;
  account: string;
  contact: string;
  contact_role: string;
  opportunity: string;
  opportunity_stage: SalesStage;
  estimated_value: string;
  interaction_summary: string;
  pain_point: string;
  objection: string;
  next_action: string;
  follow_up_date: string;
  urgency: SalesPriority;
  confidence: SalesPriority;
}

export type StructuredInteractionConfidence = 'high' | 'medium' | 'low';

export interface StructuredInteraction {
  accountName?: string;
  contactName?: string;
  interactionType?: 'call' | 'meeting' | 'email' | 'message' | 'note';
  summary: string;
  opportunityName?: string;
  painPoints: string[];
  objections: string[];
  nextAction?: {
    title: string;
    dueDate?: string;
    priority?: SalesPriority;
  };
  missingFields: string[];
  confidence: StructuredInteractionConfidence;
}

export interface AccountNarrative {
  accountId: string;
  narrative: string;
  currentOpportunity?: string;
  currentStage?: string;
  mainBlocker?: string;
  nextAction?: string;
  lastInteraction?: string;
  keyPainPoints: string[];
  keyObjections: string[];
  missingContext: string[];
  updatedAt: string;
}
