import { supabase } from '../../lib/supabase';
import { isDemoMode } from '../../lib/demoMode';
import type { Account, Contact, StructuredSalesCapture, SalesStage, SalesPriority, InteractionType } from '../../types/v31';
import { readLocalMemory, saveLocalStructuredCapture } from './localStore';
import { classifyObjection, inferObjectionSeverity } from './objectionMemory';

export const EMPTY_CAPTURE: StructuredSalesCapture = {
  type: 'note',
  account: '',
  contact: '',
  contact_role: '',
  opportunity: '',
  opportunity_stage: 'active',
  estimated_value: '',
  interaction_summary: '',
  pain_point: '',
  objection: '',
  next_action: '',
  follow_up_date: '',
  urgency: 'medium',
  confidence: 'medium',
};

const stages: SalesStage[] = ['new', 'active', 'proposal', 'negotiation', 'won', 'lost', 'paused'];
const priorities: SalesPriority[] = ['low', 'medium', 'high'];
const interactionTypes: InteractionType[] = ['call', 'email', 'meeting', 'note', 'proposal', 'other'];
const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const vietnameseDayNames = [
  { key: 'chủ nhật', index: 0 },
  { key: 'chu nhat', index: 0 },
  { key: 'thứ hai', index: 1 },
  { key: 'thu hai', index: 1 },
  { key: 'thứ ba', index: 2 },
  { key: 'thu ba', index: 2 },
  { key: 'thứ tư', index: 3 },
  { key: 'thu tu', index: 3 },
  { key: 'thứ năm', index: 4 },
  { key: 'thu nam', index: 4 },
  { key: 'thứ sáu', index: 5 },
  { key: 'thu sau', index: 5 },
  { key: 'thứ bảy', index: 6 },
  { key: 'thu bay', index: 6 },
];

export interface InteractionStructureContext {
  accounts: Pick<Account, 'id' | 'name'>[];
  contacts: Pick<Contact, 'id' | 'name' | 'account_id'>[];
}

function cleanText(value: string | null | undefined) {
  return (value || '').trim();
}

function normalizeStructuredCapture(input: Partial<StructuredSalesCapture>, rawNote: string): StructuredSalesCapture {
  const type = interactionTypes.includes(input.type as InteractionType) ? input.type as InteractionType : 'note';
  const opportunityStage = stages.includes(input.opportunity_stage as SalesStage) ? input.opportunity_stage as SalesStage : 'active';
  const urgency = priorities.includes(input.urgency as SalesPriority) ? input.urgency as SalesPriority : 'medium';
  const confidence = priorities.includes(input.confidence as SalesPriority) ? input.confidence as SalesPriority : 'medium';

  return {
    type,
    account: cleanText(input.account),
    contact: cleanText(input.contact),
    contact_role: cleanText(input.contact_role),
    opportunity: cleanText(input.opportunity),
    opportunity_stage: opportunityStage,
    estimated_value: cleanText(input.estimated_value),
    interaction_summary: cleanText(input.interaction_summary) || rawNote.trim(),
    pain_point: cleanText(input.pain_point),
    objection: cleanText(input.objection),
    next_action: cleanText(input.next_action),
    follow_up_date: cleanText(input.follow_up_date),
    urgency,
    confidence,
  };
}

function parseMoney(value: string) {
  const cleaned = value.replace(/[^0-9.]/g, '');
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveRelativeFollowUpDate(rawNote: string, currentValue: string) {
  if (currentValue) return currentValue;

  const lowerNote = rawNote.toLowerCase();
  const today = new Date();
  if (/\btoday\b|hôm nay|hom nay/.test(lowerNote)) {
    return today.toISOString().slice(0, 10);
  }

  if (/\btomorrow\b|ngày mai|ngay mai/.test(lowerNote)) {
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    return tomorrow.toISOString().slice(0, 10);
  }

  if (/\bnext week\b|tuần sau|tuan sau/.test(lowerNote)) {
    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 7);
    return nextWeek.toISOString().slice(0, 10);
  }

  const matchedDay = dayNames.find((day) => lowerNote.includes(`next ${day}`));
  if (matchedDay) {
    return nextWeekday(today, dayNames.indexOf(matchedDay));
  }

  const matchedVietnameseDay = vietnameseDayNames.find((day) => lowerNote.includes(day.key));
  if (matchedVietnameseDay) {
    return nextWeekday(today, matchedVietnameseDay.index);
  }

  return '';
}

function mergeList(existing: string[] | null | undefined, next: string) {
  const base = existing || [];
  if (!next) return base;
  const lower = next.toLowerCase();
  return base.some((item) => item.toLowerCase() === lower) ? base : [...base, next];
}

function normalizeTitle(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(the|a|an|for|with|at|opportunity|deal)\b/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function isClearOpportunityMatch(candidateTitle: string, existingTitle: string) {
  const candidate = normalizeTitle(candidateTitle);
  const existing = normalizeTitle(existingTitle);

  if (!candidate || !existing) return false;
  if (candidate === existing) return true;

  const shorter = candidate.length < existing.length ? candidate : existing;
  const longer = candidate.length < existing.length ? existing : candidate;
  return shorter.length >= 8 && longer.includes(shorter);
}

function nextWeekday(today: Date, targetDayIndex: number) {
  const daysUntilTarget = (targetDayIndex - today.getDay() + 7) % 7 || 7;
  const targetDate = new Date(today);
  targetDate.setDate(today.getDate() + daysUntilTarget);
  return targetDate.toISOString().slice(0, 10);
}

function extractAfterKeyword(rawNote: string, keywords: string[]) {
  const pattern = new RegExp(`(?:${keywords.join('|')})\\s+(?:about\\s+|are\\s+|is\\s+|là\\s+|la\\s+)?([^.;\\n]+)`, 'i');
  return rawNote.match(pattern)?.[1]?.trim() || '';
}

function heuristicInteractionStructure(rawNote: string): StructuredSalesCapture {
  const lowerNote = rawNote.toLowerCase();
  const type: InteractionType = /call|called|spoke|gọi|goi/.test(lowerNote)
    ? 'call'
    : /meeting|met|họp|hop|hẹn|hen/.test(lowerNote)
      ? 'meeting'
      : /email|emailed/.test(lowerNote)
        ? 'email'
        : /proposal/.test(lowerNote)
          ? 'proposal'
          : 'note';
  const accountMatch = rawNote.match(/\bat\s+([A-Z][A-Za-z0-9&.\- ]{2,60})/);
  const contactMatch = rawNote.match(/\b(?:called|met|emailed|spoke with|talked to|gọi|goi|họp với|hop voi)\s+([A-Z][A-Za-z.\- ]{1,40})(?:\s+at\b|\s+from\b|,|\.|$)/i);
  const objection = extractAfterKeyword(rawNote, [
    'concerned about',
    'concern about',
    'concerns are',
    'worry about',
    'objection',
    'price',
    'budget',
    'lead time',
    'support',
    'timeline',
    'competitor',
    'lo',
    'ngại',
    'ngai',
    'giá',
    'gia',
    'ngân sách',
    'ngan sach',
    'thời gian giao hàng',
    'thoi gian giao hang',
    'hỗ trợ',
    'ho tro',
    'đối thủ',
    'doi thu',
  ]);
  const nextAction = extractAfterKeyword(rawNote, [
    'follow up',
    'follow',
    'send',
    'call',
    'schedule',
    'prepare',
    'gửi',
    'gui',
    'gọi',
    'goi',
    'hẹn',
    'hen',
    'chuẩn bị',
    'chuan bi',
  ]);
  const hasProposal = /proposal|báo giá|bao gia|đề xuất|de xuat/i.test(rawNote);

  return normalizeStructuredCapture({
    type,
    account: accountMatch?.[1]?.trim() || '',
    contact: contactMatch?.[1]?.trim() || '',
    opportunity: hasProposal ? 'Proposal review' : '',
    opportunity_stage: hasProposal ? 'proposal' : 'active',
    interaction_summary: rawNote.trim(),
    pain_point: extractAfterKeyword(rawNote, ['pain', 'problem', 'challenge', 'need', 'cần', 'can']),
    objection,
    next_action: nextAction || (/follow up|follow|gửi|gui|gọi|goi|hẹn|hen/i.test(rawNote) ? 'Follow up with customer' : ''),
    follow_up_date: resolveRelativeFollowUpDate(rawNote, ''),
    urgency: nextAction ? 'high' : 'medium',
    confidence: accountMatch || contactMatch || nextAction ? 'medium' : 'low',
  }, rawNote);
}

function applyKnownMatches(structured: StructuredSalesCapture, rawNote: string, context?: InteractionStructureContext) {
  if (!context) return structured;
  const lowerNote = rawNote.toLowerCase();
  const accountMatch = !structured.account
    ? context.accounts.find((account) => lowerNote.includes(account.name.toLowerCase()))
    : null;
  const contactMatch = !structured.contact
    ? context.contacts.find((contact) => lowerNote.includes(contact.name.toLowerCase()))
    : null;

  return {
    ...structured,
    account: structured.account || accountMatch?.name || '',
    contact: structured.contact || contactMatch?.name || '',
  };
}

export function getMissingInteractionFields(structured: StructuredSalesCapture) {
  const missing: string[] = [];
  if (!structured.account) missing.push('Account');
  if (!structured.interaction_summary) missing.push('Interaction Summary');
  if (!structured.next_action) missing.push('Next Action');
  if (!structured.follow_up_date && structured.next_action) missing.push('Due Date');
  return missing;
}

export async function loadInteractionStructureContext(userId: string): Promise<InteractionStructureContext> {
  if (isDemoMode) {
    const memory = readLocalMemory();
    return {
      accounts: memory.accounts.map((account) => ({ id: account.id, name: account.name })),
      contacts: memory.contacts.map((contact) => ({ id: contact.id, name: contact.name, account_id: contact.account_id })),
    };
  }

  const [accountsResult, contactsResult] = await Promise.all([
    supabase.from('accounts').select('id,name').eq('user_id', userId).limit(80),
    supabase.from('contacts').select('id,name,account_id').eq('user_id', userId).limit(120),
  ]);

  return {
    accounts: (accountsResult.data || []) as Pick<Account, 'id' | 'name'>[],
    contacts: (contactsResult.data || []) as Pick<Contact, 'id' | 'name' | 'account_id'>[],
  };
}

export async function structureSalesCapture(rawNote: string, context?: InteractionStructureContext): Promise<StructuredSalesCapture> {
  const response = await fetch('/api/structure-capture', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rawNote }),
  });

  if (!response.ok) {
    throw new Error('Unable to structure capture');
  }

  const data = await response.json();
  const structured = normalizeStructuredCapture(data, rawNote);
  structured.follow_up_date = resolveRelativeFollowUpDate(rawNote, structured.follow_up_date);
  return applyKnownMatches(structured, rawNote, context);
}

export async function structureInteraction(rawNote: string, context?: InteractionStructureContext): Promise<StructuredSalesCapture> {
  try {
    return await structureSalesCapture(rawNote, context);
  } catch {
    return applyKnownMatches(heuristicInteractionStructure(rawNote), rawNote, context);
  }
}

export async function saveStructuredSalesCapture(
  userId: string,
  rawNote: string,
  structuredInput: StructuredSalesCapture
) {
  const structured = normalizeStructuredCapture(structuredInput, rawNote);
  structured.follow_up_date = resolveRelativeFollowUpDate(rawNote, structured.follow_up_date);

  if (isDemoMode) {
    saveLocalStructuredCapture(rawNote, structured);
    return;
  }

  const { data: capture, error: captureError } = await supabase
    .from('captures')
    .insert({
      user_id: userId,
      raw_text: rawNote,
      structured_data: structured,
      status: 'pending',
    })
    .select('id')
    .single();

  if (captureError) throw captureError;

  let accountId: string | null = null;
  if (structured.account) {
    const { data: existingAccount, error: existingAccountError } = await supabase
      .from('accounts')
      .select('id,pain_points,objections')
      .eq('user_id', userId)
      .eq('name', structured.account)
      .maybeSingle();

    if (existingAccountError) throw existingAccountError;

    const accountPayload = {
      user_id: userId,
      name: structured.account,
      summary: structured.interaction_summary,
      pain_points: mergeList(existingAccount?.pain_points, structured.pain_point),
      objections: mergeList(existingAccount?.objections, structured.objection),
      source_capture_id: capture.id,
    };

    const { data: account, error } = await supabase
      .from('accounts')
      .upsert(accountPayload, { onConflict: 'user_id,name', ignoreDuplicates: false })
      .select('id,pain_points,objections')
      .single();

    if (error) throw error;
    accountId = account.id;
  }

  let contactId: string | null = null;
  if (structured.contact) {
    const { data: contact, error } = await supabase
      .from('contacts')
      .upsert(
        {
          user_id: userId,
          account_id: accountId,
          name: structured.contact,
          role: structured.contact_role || null,
          source_capture_id: capture.id,
        },
        { onConflict: 'user_id,account_id,name', ignoreDuplicates: false }
      )
      .select('id')
      .single();

    if (error) throw error;
    contactId = contact.id;
  }

  let opportunityId: string | null = null;
  if (structured.opportunity || accountId) {
    const title = structured.opportunity || `${structured.account || 'Account'} opportunity`;
    const existingOpportunitiesResult = accountId
      ? await supabase
          .from('opportunities')
          .select('id,title,next_action_text,blocker')
          .eq('user_id', userId)
          .eq('account_id', accountId)
          .in('stage', ['new', 'active', 'proposal', 'negotiation', 'paused'])
      : { data: [], error: null };

    if (existingOpportunitiesResult.error) throw existingOpportunitiesResult.error;

    const clearMatch = (existingOpportunitiesResult.data || []).find((opportunity) =>
      isClearOpportunityMatch(title, opportunity.title)
    );

    if (clearMatch) {
      opportunityId = clearMatch.id;
      const { error: updateOpportunityError } = await supabase
        .from('opportunities')
        .update({
          contact_id: contactId,
          blocker: structured.objection || clearMatch.blocker || null,
          next_action_text: structured.next_action || clearMatch.next_action_text || null,
          last_touch_at: new Date().toISOString(),
          urgency: structured.urgency,
          confidence: structured.confidence,
        })
        .eq('id', clearMatch.id)
        .eq('user_id', userId);

      if (updateOpportunityError) throw updateOpportunityError;
    } else if (structured.opportunity) {
      const { data: opportunity, error } = await supabase
        .from('opportunities')
        .insert({
          user_id: userId,
          account_id: accountId,
          contact_id: contactId,
          title,
          stage: structured.opportunity_stage,
          estimated_value: parseMoney(structured.estimated_value),
          blocker: structured.objection || null,
          next_action_text: structured.next_action || null,
          last_touch_at: new Date().toISOString(),
          urgency: structured.urgency,
          confidence: structured.confidence,
          source_capture_id: capture.id,
        })
        .select('id')
        .single();

      if (error) throw error;
      opportunityId = opportunity.id;
    }
  }

  const { data: interaction, error: interactionError } = await supabase
    .from('interactions')
    .insert({
      user_id: userId,
      account_id: accountId,
      contact_id: contactId,
      opportunity_id: opportunityId,
      source_capture_id: capture.id,
      interaction_type: structured.type,
      summary: structured.interaction_summary,
      pain_point: structured.pain_point || null,
      objection: structured.objection || null,
      raw_note: rawNote,
      structured_data: structured,
    })
    .select('id')
    .single();

  if (interactionError) throw interactionError;

  let actionId: string | null = null;
  if (structured.next_action) {
    const { data: action, error: actionError } = await supabase.from('actions').insert({
      user_id: userId,
      account_id: accountId,
      contact_id: contactId,
      opportunity_id: opportunityId,
      interaction_id: interaction.id,
      title: structured.next_action,
      due_date: structured.follow_up_date || null,
      suggested: false,
      source: 'capture',
    }).select('id').single();

    if (actionError) throw actionError;
    actionId = action.id;
  }

  if (structured.objection && accountId) {
    const { error: objectionError } = await supabase.from('objections').insert({
      user_id: userId,
      account_id: accountId,
      opportunity_id: opportunityId,
      contact_id: contactId,
      source_interaction_id: interaction.id,
      title: structured.objection,
      detail: structured.objection,
      category: classifyObjection(structured.objection),
      status: actionId ? 'addressed' : 'open',
      severity: inferObjectionSeverity(structured.objection),
      linked_action_id: actionId,
      first_mentioned_at: new Date().toISOString(),
      last_mentioned_at: new Date().toISOString(),
    });

    if (objectionError) throw objectionError;
  }

  await supabase
    .from('captures')
    .update({ status: 'processed' })
    .eq('id', capture.id)
    .eq('user_id', userId);

  supabase.rpc('increment_capture_count', { p_user_id: userId }).then(({ error }) => {
    if (error) console.warn('Usage tracking failed:', error);
  });

  fetch('/api/generate-embedding', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      captureId: capture.id,
      text: rawNote,
      userId,
    }),
  }).catch(console.error);
}
