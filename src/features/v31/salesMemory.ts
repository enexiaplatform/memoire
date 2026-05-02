import { supabase } from '../../lib/supabase';
import { isDemoMode } from '../../lib/demoMode';
import type { StructuredSalesCapture, SalesStage, SalesPriority, InteractionType } from '../../types/v31';
import { saveLocalStructuredCapture } from './localStore';

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
  const matchedDay = dayNames.find((day) => lowerNote.includes(`next ${day}`));
  if (!matchedDay) return '';

  const today = new Date();
  const targetDayIndex = dayNames.indexOf(matchedDay);
  const daysUntilTarget = (targetDayIndex - today.getDay() + 7) % 7 || 7;
  const targetDate = new Date(today);
  targetDate.setDate(today.getDate() + daysUntilTarget);
  return targetDate.toISOString().slice(0, 10);
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

export async function structureSalesCapture(rawNote: string): Promise<StructuredSalesCapture> {
  const response = await fetch('/api/structure-capture', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rawNote }),
  });

  if (!response.ok) {
    throw new Error('Unable to structure capture');
  }

  const data = await response.json();
  return normalizeStructuredCapture(data, rawNote);
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

  if (structured.next_action) {
    const { error: actionError } = await supabase.from('actions').insert({
      user_id: userId,
      account_id: accountId,
      contact_id: contactId,
      opportunity_id: opportunityId,
      interaction_id: interaction.id,
      title: structured.next_action,
      due_date: structured.follow_up_date || null,
      suggested: false,
      source: 'capture',
    });

    if (actionError) throw actionError;
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
