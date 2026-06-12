import { supabase } from '../../lib/supabase';
import { isDemoMode } from '../../lib/demoMode';
import type { Account, Contact, StructuredSalesCapture, SalesStage, SalesPriority, InteractionType } from '../../types/v31';
import { readLocalMemory, saveLocalStructuredCapture } from './localStore';
import { classifyObjection, inferObjectionSeverity } from './objectionMemory';

export const EMPTY_CAPTURE: StructuredSalesCapture = {
  type: 'note',
  source_type: 'quick_note',
  account: '',
  contact: '',
  contact_role: '',
  opportunity: '',
  opportunity_stage: 'active',
  estimated_value: '',
  email_subject: '',
  current_status: '',
  stuck_risk: '',
  missing_context: [],
  decision_maker_name: '',
  decision_maker_role: '',
  decision_context: '',
  secondary_contact: '',
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
    source_type: input.source_type === 'email_thread' ? 'email_thread' : 'quick_note',
    account: cleanText(input.account),
    contact: cleanText(input.contact),
    contact_role: cleanText(input.contact_role),
    opportunity: cleanText(input.opportunity),
    opportunity_stage: opportunityStage,
    estimated_value: cleanText(input.estimated_value),
    email_subject: cleanText(input.email_subject),
    current_status: cleanText(input.current_status),
    stuck_risk: cleanText(input.stuck_risk),
    missing_context: Array.isArray(input.missing_context) ? input.missing_context.map(cleanText).filter(Boolean) : [],
    decision_maker_name: cleanText(input.decision_maker_name),
    decision_maker_role: cleanText(input.decision_maker_role),
    decision_context: cleanText(input.decision_context),
    secondary_contact: cleanText(input.secondary_contact),
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

  const explicitDate = rawNote.match(/\b(?:on\s+|by\s+)?(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:,\s*(\d{4}))?\b/i);
  if (explicitDate) {
    const monthIndex = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
      .findIndex((month) => explicitDate[1].toLowerCase().startsWith(month));
    const year = explicitDate[3] ? Number(explicitDate[3]) : today.getFullYear();
    const parsed = new Date(Date.UTC(year, monthIndex, Number(explicitDate[2])));
    if (Number.isFinite(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }

  return '';
}

function mergeList(existing: string[] | null | undefined, next: string) {
  const base = existing || [];
  if (!next) return base;
  const lower = next.toLowerCase();
  return base.some((item) => item.toLowerCase() === lower) ? base : [...base, next];
}

function mergeMany(existing: string[] | null | undefined, nextItems: string[]) {
  return nextItems.reduce((current, item) => mergeList(current, item), existing || []);
}

function splitStructuredObjections(value: string) {
  return value
    .split(/\n|;/)
    .map((item) => item.replace(/^\s*(?:\d+[.)]|[-*])\s*/, '').trim())
    .filter(Boolean);
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

function extractEmailSubject(rawEmail: string) {
  return rawEmail.match(/^Subject:\s*(.+)$/im)?.[1]?.trim()
    || rawEmail.match(/\bSubject\s*[:-]\s*(.+)$/im)?.[1]?.trim()
    || '';
}

function extractEmailSender(rawEmail: string) {
  return rawEmail.match(/^From:\s*([^<\n]+?)(?:\s*<[^>]+>)?\s*$/im)?.[1]?.trim()
    || rawEmail.match(/\bRegards,\s*\n\s*([A-Z][A-Za-z.\- ]{1,40})/i)?.[1]?.trim()
    || rawEmail.match(/\bBest regards,\s*\n\s*([A-Z][A-Za-z.\- ]{1,40})/i)?.[1]?.trim()
    || '';
}

function extractEmailConcern(rawEmail: string) {
  const enumerated = extractEnumeratedObjections(rawEmail);
  if (enumerated.length > 0) return enumerated.join('\n');

  const concernMatch = rawEmail.match(/(?:main concerns are|concerns are|concerned about|concern about|concerns around)\s+([^.\n]+)/i);
  if (concernMatch?.[1]) return concernMatch[1].trim();

  const lower = rawEmail.toLowerCase();
  const concerns = [
    lower.includes('lead time') ? 'lead time' : '',
    lower.includes('local support') ? 'local support' : '',
    lower.includes('support') && !lower.includes('local support') ? 'support' : '',
    lower.includes('price') ? 'price' : '',
    lower.includes('budget') ? 'budget' : '',
    lower.includes('compliance') ? 'compliance confidence' : '',
    lower.includes('validation') ? 'validation proof' : '',
    lower.includes('tender') ? 'tender timing' : '',
  ].filter(Boolean);
  return concerns.join(' and ');
}

function extractEnumeratedObjections(rawEmail: string) {
  const lines = rawEmail.split(/\r?\n/);
  const items = lines
    .map((line) => line.match(/^\s*(?:\d+[.)]|[-*])\s*(.+)$/)?.[1]?.trim() || '')
    .filter((line) => line.length > 3)
    .filter((line) => /documentation|iq\/oq\/pq|calibration|drift|sla|service|validation|compliance|timeline|lead time|support|spec|specification|vendor|budget|approval/i.test(line));

  if (items.length > 0) return items.map(normalizeTechnicalObjection);

  const listMatch = rawEmail.match(/(?:following issues|following concerns|three concerns|concerns are|issues are)\s*[:-]\s*([^]+?)(?:\n\n|Regards,|Best regards,|$)/i)?.[1] || '';
  if (listMatch.includes(';')) {
    return listMatch.split(';').map((item) => normalizeTechnicalObjection(item.trim())).filter(Boolean);
  }
  return [];
}

function normalizeTechnicalObjection(value: string) {
  const cleaned = value.replace(/\s+/g, ' ').replace(/[.;]+$/, '').trim();
  if (/iq\/oq\/pq/i.test(cleaned)) return cleaned.includes('documentation') ? cleaned : `${cleaned} documentation`;
  if (/calibration.*drift|drift.*calibration/i.test(cleaned)) return cleaned.includes('spec') ? cleaned : `${cleaned} specification`;
  if (/sla/i.test(cleaned)) return cleaned.includes('service') ? cleaned : `${cleaned} coverage`;
  return cleaned;
}

function detectGhostRisk(rawEmail: string) {
  return /\b(no response|no reply|has not replied|has not responded|went quiet|gone quiet|silent|no update|unanswered|follow-up unanswered|still waiting|waiting for response|no feedback yet|no reply for \d+\s*(?:days|weeks)|no response for \d+\s*(?:days|weeks))\b/i.test(rawEmail);
}

function detectTenderRisk(rawEmail: string) {
  return /\b(tender pending|procurement timeline unclear|committee review|evaluation period extended|no confirmable timeline|notification by end of month|budget approval pending|purchasing committee|internal review)\b/i.test(rawEmail);
}

function extractDecisionContext(rawEmail: string) {
  const rolePattern = '(final decision maker|decision maker|approver|approval owner|budget owner|PO sign-off|procurement approver|committee chair|evaluation lead|technical approver|validation manager|finance director|purchasing manager|final approver|responsible for approval)';
  const nameBeforeRole = rawEmail.match(new RegExp(`\\b([A-Z][A-Za-z.\\-]+(?:\\s+[A-Z][A-Za-z.\\-]+){0,3})\\s+(?:will attend as\\s+)?(?:the\\s+)?${rolePattern}`, 'i'));
  const roleBeforeName = rawEmail.match(new RegExp(`${rolePattern}\\s+(?:is|will be|:)?\\s*([A-Z][A-Za-z.\\-]+(?:\\s+[A-Z][A-Za-z.\\-]+){0,3})`, 'i'));
  const name = nameBeforeRole?.[1]?.trim() || roleBeforeName?.[2]?.trim() || '';
  const role = nameBeforeRole?.[2]?.trim() || roleBeforeName?.[1]?.trim() || '';
  const context = role
    ? `${name ? `${name} - ` : ''}${role}`
    : '';
  return { name, role, context };
}

function extractEmailStatus(rawEmail: string) {
  if (detectGhostRisk(rawEmail)) return 'No response / account going silent';
  if (detectTenderRisk(rawEmail)) return 'Tender/procurement review may go silent';
  if (/reviewing internally|internal review|reviewing the proposal|under review/i.test(rawEmail)) {
    return 'Proposal under internal review';
  }
  if (/awaiting po|purchase order/i.test(rawEmail)) return 'Awaiting purchase order';
  if (/tender pending|pending tender/i.test(rawEmail)) return 'Tender pending';
  if (/proposal/i.test(rawEmail)) return 'Proposal discussion active';
  return '';
}

function extractEmailNextAction(rawEmail: string) {
  if (detectGhostRisk(rawEmail)) {
    return 'Send re-engagement follow-up, confirm status, and ask for decision timeline';
  }
  if (detectTenderRisk(rawEmail)) {
    return 'Confirm evaluation timeline, decision criteria, next communication date, and decision owner';
  }
  const requestMatch = rawEmail.match(/(?:could you|please|can you)\s+([^?\n.]+)(?:\?|\.|\n|$)/i)?.[1]?.trim();
  if (requestMatch) return requestMatch.charAt(0).toUpperCase() + requestMatch.slice(1);

  const sendMatch = rawEmail.match(/\b(send|share|provide|prepare)\s+([^.\n]+)/i);
  if (sendMatch?.[0]) return sendMatch[0].trim();
  return '';
}

function structureEmailThread(rawEmail: string, context?: InteractionStructureContext): StructuredSalesCapture {
  const subject = extractEmailSubject(rawEmail);
  const sender = extractEmailSender(rawEmail);
  const concern = extractEmailConcern(rawEmail);
  const status = extractEmailStatus(rawEmail);
  const nextAction = extractEmailNextAction(rawEmail);
  const ghostRisk = detectGhostRisk(rawEmail);
  const tenderRisk = detectTenderRisk(rawEmail);
  const decision = extractDecisionContext(rawEmail);
  const combinedText = `${subject}\n${rawEmail}`;
  const known = applyKnownMatches({ ...EMPTY_CAPTURE, interaction_summary: rawEmail }, combinedText, context);
  const accountFromSubject = subject.match(/(?:Re:\s*)?([A-Z][A-Za-z0-9&.\- ]{2,60})\s+(?:proposal|review|tender|thread)/i)?.[1]?.trim() || '';
  const missingContext = [
    known.account || accountFromSubject ? '' : 'Account',
    sender ? '' : 'Contact / sender',
    nextAction ? '' : 'Next action',
    decision.name || decision.context ? '' : 'Decision maker',
    decision.context && /\b(timeline|date|on\s+\w+\s+\d{1,2}|next week|tomorrow|today)\b/i.test(rawEmail) ? '' : 'Decision timeline',
    ghostRisk ? 'Current decision status' : '',
    ghostRisk ? 'Alternate contact' : '',
    ghostRisk ? 'Reason for silence' : '',
    tenderRisk ? 'Decision committee' : '',
    tenderRisk ? 'Decision criteria' : '',
    tenderRisk ? 'Procurement timeline' : '',
    tenderRisk ? 'Competing vendors' : '',
    tenderRisk ? 'Budget approval status' : '',
  ].filter(Boolean);
  const stuckRisk = ghostRisk
    ? 'Customer has not responded after follow-up or previous positive signal.'
    : tenderRisk
      ? 'Tender/procurement may go silent without confirmed timeline, criteria, and decision owner.'
      : concern
    ? 'May go silent if the concern is not addressed with a clear follow-up.'
    : nextAction
      ? 'May go silent if the requested follow-up is not scheduled.'
      : 'May go silent because the next action is unclear.';
  const primaryConcern = ghostRisk
    ? 'No response / Account going silent'
    : tenderRisk
      ? 'Tender/procurement may go silent'
      : concern;

  return normalizeStructuredCapture({
    source_type: 'email_thread',
    type: 'email',
    account: known.account || accountFromSubject,
    contact: known.contact || sender,
    opportunity: /proposal/i.test(combinedText) ? 'Proposal review' : '',
    opportunity_stage: /proposal|review/i.test(combinedText) ? 'proposal' : 'active',
    email_subject: subject,
    current_status: status,
    decision_maker_name: decision.name,
    decision_maker_role: decision.role,
    decision_context: decision.context,
    secondary_contact: decision.name && sender && decision.name !== sender ? decision.name : '',
    interaction_summary: [
      subject ? `Subject: ${subject}` : '',
      status || 'Email thread captured.',
      primaryConcern ? `Customer concern: ${primaryConcern}` : '',
      decision.context ? `Decision context: ${decision.context}` : '',
      nextAction ? `Requested next action: ${nextAction}` : '',
    ].filter(Boolean).join(' '),
    pain_point: primaryConcern,
    objection: primaryConcern,
    next_action: nextAction,
    follow_up_date: resolveRelativeFollowUpDate(rawEmail, ''),
    urgency: concern || nextAction ? 'high' : 'medium',
    confidence: known.account || accountFromSubject || sender ? 'medium' : 'low',
    stuck_risk: stuckRisk,
    missing_context: missingContext,
  }, rawEmail);
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
  const missing = new Set<string>(structured.missing_context || []);
  if (!structured.account) missing.add('Account');
  if (!structured.contact) missing.add(structured.source_type === 'email_thread' ? 'Contact / sender' : 'Contact');
  if (!structured.interaction_summary) missing.add('Interaction Summary');
  if (!structured.next_action) missing.add('Next Action');
  if (!structured.follow_up_date && structured.next_action) missing.add('Due Date');
  if (!structured.decision_maker_name && !structured.decision_context) missing.add('Decision maker');
  if (!structured.decision_context || !/\b(timeline|date|on\s+\w+\s+\d{1,2}|next week|tomorrow|today)\b/i.test(structured.decision_context)) {
    missing.add('Decision timeline');
  }
  const dealRelated = structured.source_type === 'email_thread' || structured.opportunity_stage === 'proposal' || /proposal|tender|quote|po|purchase|deal/i.test(structured.interaction_summary);
  if (dealRelated && !structured.opportunity) missing.add('Opportunity context');
  if (structured.stuck_risk && !structured.objection) missing.add('Blocker / objection');
  return Array.from(missing);
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
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Sign in is required for cloud AI structuring.');
  const response = await fetch('/api/structure-capture', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
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

export async function structureEmailThreadCapture(rawEmail: string, context?: InteractionStructureContext): Promise<StructuredSalesCapture> {
  return structureEmailThread(rawEmail, context);
}

export interface SaveStructuredSalesCaptureResult {
  captureId: string;
  accountId: string | null;
  contactId: string | null;
  opportunityId: string | null;
  interactionId: string;
  actionId: string | null;
}

export async function saveStructuredSalesCapture(
  userId: string,
  rawNote: string,
  structuredInput: StructuredSalesCapture
): Promise<SaveStructuredSalesCaptureResult> {
  const structured = normalizeStructuredCapture(structuredInput, rawNote);
  structured.follow_up_date = resolveRelativeFollowUpDate(rawNote, structured.follow_up_date);
  const objectionItems = splitStructuredObjections(structured.objection);

  if (isDemoMode) {
    return saveLocalStructuredCapture(rawNote, structured);
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
      objections: mergeMany(existingAccount?.objections, objectionItems),
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
          blocker: objectionItems.join('\n') || clearMatch.blocker || null,
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
          blocker: objectionItems.join('\n') || null,
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

  if (objectionItems.length > 0 && accountId) {
    const { error: objectionError } = await supabase.from('objections').insert(objectionItems.map((objection) => ({
      user_id: userId,
      account_id: accountId,
      opportunity_id: opportunityId,
      contact_id: contactId,
      source_interaction_id: interaction.id,
      title: objection,
      detail: objection,
      category: classifyObjection(objection),
      status: actionId ? 'addressed' : 'open',
      severity: inferObjectionSeverity(objection),
      linked_action_id: actionId,
      first_mentioned_at: new Date().toISOString(),
      last_mentioned_at: new Date().toISOString(),
    })));

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

  const { data: { session } } = await supabase.auth.getSession();
  fetch('/api/generate-embedding', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      captureId: capture.id,
      text: rawNote,
      userId,
      authToken: session?.access_token,
    }),
  }).catch(console.error);

  return {
    captureId: capture.id,
    accountId,
    contactId,
    opportunityId,
    interactionId: interaction.id,
    actionId,
  };
}
