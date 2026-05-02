import type { Account, Contact, Interaction, Opportunity, SalesAction, StructuredSalesCapture } from '../../types/v31';
import { DEMO_USER_ID } from '../../lib/demoMode';

interface LocalCapture {
  id: string;
  user_id: string;
  raw_text: string;
  structured_data: StructuredSalesCapture;
  status: 'pending' | 'processed';
  created_at: string;
}

interface LocalMemory {
  captures: LocalCapture[];
  accounts: Account[];
  contacts: Contact[];
  opportunities: Opportunity[];
  interactions: Interaction[];
  actions: SalesAction[];
}

const KEY = 'memoire_demo_memory_v1';

function id() {
  return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function now() {
  return new Date().toISOString();
}

export function readLocalMemory(): LocalMemory {
  const raw = localStorage.getItem(KEY);
  if (!raw) {
    return { captures: [], accounts: [], contacts: [], opportunities: [], interactions: [], actions: [] };
  }

  try {
    return JSON.parse(raw) as LocalMemory;
  } catch {
    return { captures: [], accounts: [], contacts: [], opportunities: [], interactions: [], actions: [] };
  }
}

function writeLocalMemory(memory: LocalMemory) {
  localStorage.setItem(KEY, JSON.stringify(memory));
}

function sameName(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function mergeList(existing: string[], next: string) {
  if (!next) return existing;
  return existing.some((item) => sameName(item, next)) ? existing : [...existing, next];
}

function normalizeTitle(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function saveLocalStructuredCapture(rawNote: string, structured: StructuredSalesCapture) {
  const memory = readLocalMemory();
  const timestamp = now();
  const captureId = id();

  memory.captures.push({
    id: captureId,
    user_id: DEMO_USER_ID,
    raw_text: rawNote,
    structured_data: structured,
    status: 'processed',
    created_at: timestamp,
  });

  let accountId: string | null = null;
  if (structured.account) {
    let account = memory.accounts.find((item) => sameName(item.name, structured.account));
    if (!account) {
      account = {
        id: id(),
        user_id: DEMO_USER_ID,
        name: structured.account,
        summary: structured.interaction_summary,
        industry: null,
        status: 'active',
        pain_points: [],
        objections: [],
        source_capture_id: captureId,
        created_at: timestamp,
        updated_at: timestamp,
      };
      memory.accounts.push(account);
    }
    account.summary = structured.interaction_summary || account.summary;
    account.pain_points = mergeList(account.pain_points, structured.pain_point);
    account.objections = mergeList(account.objections, structured.objection);
    account.updated_at = timestamp;
    accountId = account.id;
  }

  let contactId: string | null = null;
  if (structured.contact) {
    let contact = memory.contacts.find((item) =>
      item.account_id === accountId && sameName(item.name, structured.contact)
    );
    if (!contact) {
      contact = {
        id: id(),
        user_id: DEMO_USER_ID,
        account_id: accountId,
        name: structured.contact,
        role: structured.contact_role || null,
        email: null,
        phone: null,
        notes: null,
        source_capture_id: captureId,
        created_at: timestamp,
        updated_at: timestamp,
      };
      memory.contacts.push(contact);
    }
    contact.role = structured.contact_role || contact.role;
    contact.updated_at = timestamp;
    contactId = contact.id;
  }

  let opportunityId: string | null = null;
  if (structured.opportunity && accountId) {
    const incoming = normalizeTitle(structured.opportunity);
    let opportunity = memory.opportunities.find((item) =>
      item.account_id === accountId &&
      ['new', 'active', 'proposal', 'negotiation', 'paused'].includes(item.stage) &&
      normalizeTitle(item.title) === incoming
    );
    if (!opportunity) {
      opportunity = {
        id: id(),
        user_id: DEMO_USER_ID,
        account_id: accountId,
        contact_id: contactId,
        title: structured.opportunity,
        stage: structured.opportunity_stage,
        estimated_value: null,
        blocker: structured.objection || null,
        next_action_text: structured.next_action || null,
        last_touch_at: timestamp,
        urgency: structured.urgency,
        confidence: structured.confidence,
        source_capture_id: captureId,
        created_at: timestamp,
        updated_at: timestamp,
      };
      memory.opportunities.push(opportunity);
    }
    opportunity.contact_id = contactId;
    opportunity.blocker = structured.objection || opportunity.blocker;
    opportunity.next_action_text = structured.next_action || opportunity.next_action_text;
    opportunity.last_touch_at = timestamp;
    opportunity.updated_at = timestamp;
    opportunityId = opportunity.id;
  }

  const interactionId = id();
  memory.interactions.push({
    id: interactionId,
    user_id: DEMO_USER_ID,
    account_id: accountId,
    contact_id: contactId,
    opportunity_id: opportunityId,
    source_capture_id: captureId,
    interaction_type: structured.type,
    occurred_at: timestamp,
    summary: structured.interaction_summary,
    pain_point: structured.pain_point || null,
    objection: structured.objection || null,
    raw_note: rawNote,
    structured_data: structured as unknown as Record<string, unknown>,
    created_at: timestamp,
  });

  if (structured.next_action) {
    memory.actions.push({
      id: id(),
      user_id: DEMO_USER_ID,
      account_id: accountId,
      contact_id: contactId,
      opportunity_id: opportunityId,
      interaction_id: interactionId,
      title: structured.next_action,
      due_date: structured.follow_up_date || null,
      status: 'open',
      suggested: false,
      source: 'capture',
      created_at: timestamp,
      updated_at: timestamp,
    });
  }

  writeLocalMemory(memory);
}

export function markLocalActionDone(actionId: string) {
  const memory = readLocalMemory();
  const action = memory.actions.find((item) => item.id === actionId);
  if (action) {
    action.status = 'done';
    action.updated_at = now();
    writeLocalMemory(memory);
  }
}
