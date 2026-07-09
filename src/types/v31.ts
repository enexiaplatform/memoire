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

export type ObjectionCategory =
  | 'price'
  | 'timeline'
  | 'support'
  | 'product_fit'
  | 'compliance'
  | 'competitor'
  | 'authority'
  | 'budget'
  | 'other';

export type ObjectionStatus = 'open' | 'addressed' | 'resolved' | 'dismissed';
export type ObjectionSeverity = 'low' | 'medium' | 'high';

export interface Objection {
  id: string;
  user_id: string;
  account_id: string;
  opportunity_id: string | null;
  contact_id: string | null;
  source_interaction_id: string | null;
  title: string;
  detail: string | null;
  category: ObjectionCategory;
  status: ObjectionStatus;
  severity: ObjectionSeverity;
  response_angle: string | null;
  linked_action_id: string | null;
  first_mentioned_at: string | null;
  last_mentioned_at: string | null;
  created_at: string;
  updated_at: string;
  linked_action?: Pick<SalesAction, 'id' | 'title' | 'status' | 'due_date'> | null;
  opportunity?: Pick<Opportunity, 'id' | 'title' | 'stage'> | null;
  contact?: Pick<Contact, 'id' | 'name' | 'role'> | null;
}

export interface StructuredSalesCapture {
  type: InteractionType;
  source_type?: 'quick_note' | 'email_thread';
  account: string;
  contact: string;
  contact_role: string;
  opportunity: string;
  opportunity_stage: SalesStage;
  estimated_value: string;
  email_subject?: string;
  current_status?: string;
  stuck_risk?: string;
  missing_context?: string[];
  decision_maker_name?: string;
  decision_maker_role?: string;
  decision_context?: string;
  secondary_contact?: string;
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

export type FollowUpGoal =
  | 'follow_up_after_meeting'
  | 'address_objection'
  | 'send_requested_information'
  | 'confirm_next_step'
  | 'revive_stale_deal'
  | 'ask_decision_timeline';

export type FollowUpTone = 'professional' | 'consultative' | 'concise' | 'warm' | 'firm_polite';
export type FollowUpLength = 'short' | 'medium' | 'detailed';

export interface FollowUpContext {
  accountName: string;
  contactName?: string;
  opportunityName?: string;
  lastInteractionSummary?: string;
  objections?: string[];
  painPoints?: string[];
  nextAction?: string;
  goal: FollowUpGoal;
  tone: FollowUpTone;
  length: FollowUpLength;
}

export interface FollowUpDraft {
  subject: string;
  body: string;
  missingFields: string[];
}

export interface AskMemoireContext {
  scope: 'all' | 'account' | 'opportunity';
  accountId?: string;
  opportunityId?: string;
  includedData: {
    accounts?: Account[];
    opportunities?: Opportunity[];
    interactions?: Interaction[];
    actions?: SalesAction[];
    objections?: Objection[];
  };
  missingContext: string[];
}

export interface AskMemoireAnswer {
  answer: string;
  contextUsed: string[];
  suggestedNextAction?: string;
  missingContext: string[];
  suggestedQuestions: string[];
  cards?: AskMemoireAnswerCard[];
}

export interface AskMemoireAnswerCard {
  kind: 'stuck_deal' | 'account' | 'opportunity' | 'follow_up' | 'insight';
  title: string;
  fields: {
    label: string;
    value: string | string[];
    tone?: 'default' | 'warning' | 'good';
  }[];
  ctas?: {
    label: string;
    href?: string;
    note?: string;
  }[];
}

export type MemoryHealthStatus = 'healthy' | 'needs_attention' | 'broken';

export interface MemoryHealth {
  entityType: 'account' | 'opportunity';
  entityId: string;
  status: MemoryHealthStatus;
  reasons: string[];
  missingContext: string[];
  suggestedFixes: string[];
  signals: {
    hasRecentInteraction: boolean;
    hasNextAction: boolean;
    hasOpportunity: boolean;
    hasContact: boolean;
    hasOpenObjection: boolean;
    hasDecisionContext: boolean;
    hasBrokenLoop: boolean;
  };
  updatedAt: string;
}

export type MemoryChangeType =
  | 'new_interaction'
  | 'new_objection'
  | 'overdue_action'
  | 'memory_health_changed'
  | 'broken_loop_appeared'
  | 'opportunity_stage_changed'
  | 'next_action_created';

export interface MemoryChange {
  id: string;
  type: MemoryChangeType;
  title: string;
  description: string;
  entityType: 'account' | 'opportunity' | 'action' | 'objection' | 'interaction';
  entityId?: string;
  accountId?: string;
  opportunityId?: string;
  severity: 'low' | 'medium' | 'high';
  suggestedReviewAction?: string;
  createdAt: string;
}

export type SalesPatternType =
  | 'proposal_momentum_loss'
  | 'objection_cluster'
  | 'capture_without_action'
  | 'stale_after_first_meeting'
  | 'missing_decision_context';

export interface SalesPattern {
  id: string;
  type: SalesPatternType;
  title: string;
  insight: string;
  evidence: string[];
  affectedEntityIds: string[];
  severity: 'low' | 'medium' | 'high';
  suggestedBehavior: string;
  createdAt: string;
}
