import { supabase } from '../../lib/supabase';
import { isDemoMode } from '../../lib/demoMode';
import type { Objection, ObjectionCategory, ObjectionSeverity, ObjectionStatus } from '../../types/v31';
import {
  createLocalObjection,
  updateLocalObjection,
} from './localStore';

export const objectionCategories: ObjectionCategory[] = [
  'price',
  'timeline',
  'support',
  'product_fit',
  'compliance',
  'competitor',
  'authority',
  'budget',
  'other',
];

export const objectionStatuses: ObjectionStatus[] = ['open', 'addressed', 'resolved', 'dismissed'];
export const objectionSeverities: ObjectionSeverity[] = ['low', 'medium', 'high'];

export interface ObjectionDraft {
  title: string;
  detail: string;
  category: ObjectionCategory;
  status: ObjectionStatus;
  severity: ObjectionSeverity;
  response_angle: string;
  linked_action_id: string;
}

export interface SaveObjectionInput extends ObjectionDraft {
  id?: string;
  user_id: string;
  account_id: string;
  opportunity_id?: string | null;
  contact_id?: string | null;
  source_interaction_id?: string | null;
  first_mentioned_at?: string | null;
  last_mentioned_at?: string | null;
}

export const emptyObjectionDraft: ObjectionDraft = {
  title: '',
  detail: '',
  category: 'other',
  status: 'open',
  severity: 'medium',
  response_angle: '',
  linked_action_id: '',
};

export function classifyObjection(value: string): ObjectionCategory {
  const lower = value.toLowerCase();
  if (/price|pricing|giá|gia/.test(lower)) return 'price';
  if (/budget|ngân sách|ngan sach/.test(lower)) return 'budget';
  if (/timeline|lead time|delivery|thời gian|thoi gian|giao hàng|giao hang/.test(lower)) return 'timeline';
  if (/support|service|hỗ trợ|ho tro/.test(lower)) return 'support';
  if (/fit|feature|product|sản phẩm|san pham/.test(lower)) return 'product_fit';
  if (/compliance|legal|regulation|quy định|quy dinh/.test(lower)) return 'compliance';
  if (/competitor|đối thủ|doi thu/.test(lower)) return 'competitor';
  if (/approval|authority|decision|sếp|sep|phê duyệt|phe duyet/.test(lower)) return 'authority';
  return 'other';
}

export function inferObjectionSeverity(value: string): ObjectionSeverity {
  const lower = value.toLowerCase();
  if (/block|blocked|critical|urgent|cannot|không thể|khong the|nghiêm trọng|nghiem trong/.test(lower)) return 'high';
  if (/concern|worry|ngại|ngai|lo|issue|problem/.test(lower)) return 'medium';
  return 'medium';
}

export function makeObjectionDraftFromText(value: string): ObjectionDraft {
  const title = value.trim();
  return {
    ...emptyObjectionDraft,
    title,
    detail: title,
    category: classifyObjection(title),
    severity: inferObjectionSeverity(title),
  };
}

export function normalizeObjectionStatus(draft: ObjectionDraft): ObjectionStatus {
  if (draft.status === 'resolved' || draft.status === 'dismissed') return draft.status;
  if (draft.response_angle || draft.linked_action_id) return 'addressed';
  return draft.status;
}

export async function saveObjection(input: SaveObjectionInput): Promise<Objection> {
  const payload = {
    user_id: input.user_id,
    account_id: input.account_id,
    opportunity_id: input.opportunity_id || null,
    contact_id: input.contact_id || null,
    source_interaction_id: input.source_interaction_id || null,
    title: input.title.trim(),
    detail: input.detail.trim() || null,
    category: input.category,
    status: normalizeObjectionStatus(input),
    severity: input.severity,
    response_angle: input.response_angle.trim() || null,
    linked_action_id: input.linked_action_id || null,
    first_mentioned_at: input.first_mentioned_at || null,
    last_mentioned_at: input.last_mentioned_at || null,
  };

  if (!payload.title) throw new Error('Objection title is required');

  if (isDemoMode) {
    return input.id
      ? updateLocalObjection(input.id, payload)
      : createLocalObjection(payload);
  }

  if (input.id) {
    const { data, error } = await supabase
      .from('objections')
      .update(payload)
      .eq('id', input.id)
      .eq('user_id', input.user_id)
      .select('*,linked_action:linked_action_id(id,title,status,due_date),opportunity:opportunity_id(id,title,stage),contact:contact_id(id,name,role)')
      .single();
    if (error) throw error;
    return data as Objection;
  }

  const { data, error } = await supabase
    .from('objections')
    .insert(payload)
    .select('*,linked_action:linked_action_id(id,title,status,due_date),opportunity:opportunity_id(id,title,stage),contact:contact_id(id,name,role)')
    .single();

  if (error) throw error;
  return data as Objection;
}
