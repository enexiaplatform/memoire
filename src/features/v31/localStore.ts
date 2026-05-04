import type { Account, Contact, Interaction, Objection, Opportunity, SalesAction, StructuredSalesCapture } from '../../types/v31';
import { DEMO_USER_ID } from '../../lib/demoMode';
import { henryFounderWorkspaceSeed, HENRY_FOUNDER_WORKSPACE_LABEL } from './data/henryFounderWorkspaceSeed';

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
  objections: Objection[];
  founderWorkspace?: {
    label: string;
    loadedAt: string;
    brandReferences: unknown[];
    pricingContexts: unknown[];
    reviewFlags: unknown[];
  };
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
    return emptyMemory();
  }

  try {
    const memory = JSON.parse(raw) as Partial<LocalMemory>;
    return {
      ...emptyMemory(),
      ...memory,
      captures: memory.captures || [],
      accounts: memory.accounts || [],
      contacts: memory.contacts || [],
      opportunities: memory.opportunities || [],
      interactions: memory.interactions || [],
      actions: memory.actions || [],
      objections: memory.objections || [],
      founderWorkspace: memory.founderWorkspace,
    };
  } catch {
    return emptyMemory();
  }
}

function emptyMemory(): LocalMemory {
  return { captures: [], accounts: [], contacts: [], opportunities: [], interactions: [], actions: [], objections: [] };
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

  let actionId: string | null = null;
  if (structured.next_action) {
    actionId = id();
    memory.actions.push({
      id: actionId,
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

  if (structured.objection && accountId) {
    memory.objections.push({
      id: id(),
      user_id: DEMO_USER_ID,
      account_id: accountId,
      contact_id: contactId,
      opportunity_id: opportunityId,
      source_interaction_id: interactionId,
      title: structured.objection,
      detail: structured.objection,
      category: 'other',
      status: actionId ? 'addressed' : 'open',
      severity: structured.urgency,
      response_angle: null,
      linked_action_id: actionId,
      first_mentioned_at: timestamp,
      last_mentioned_at: timestamp,
      created_at: timestamp,
      updated_at: timestamp,
    });
  }

  writeLocalMemory(memory);
}

export function createLocalObjection(input: Omit<Objection, 'id' | 'created_at' | 'updated_at' | 'linked_action' | 'opportunity' | 'contact'>): Objection {
  const memory = readLocalMemory();
  const timestamp = now();
  const objection: Objection = {
    ...input,
    id: id(),
    created_at: timestamp,
    updated_at: timestamp,
  };
  memory.objections.push(objection);
  writeLocalMemory(memory);
  return objection;
}

export function updateLocalObjection(
  objectionId: string,
  input: Partial<Omit<Objection, 'id' | 'created_at' | 'updated_at' | 'linked_action' | 'opportunity' | 'contact'>>
): Objection {
  const memory = readLocalMemory();
  const index = memory.objections.findIndex((item) => item.id === objectionId);
  if (index === -1) throw new Error('Objection not found');
  memory.objections[index] = {
    ...memory.objections[index],
    ...input,
    updated_at: now(),
  };
  writeLocalMemory(memory);
  return memory.objections[index];
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

export function loadHenryFounderWorkspace() {
  const memory = readLocalMemory();
  const loadedAt = new Date().toISOString();

  memory.accounts = mergeById(memory.accounts, henryFounderWorkspaceSeed.accounts);
  memory.contacts = mergeById(memory.contacts, henryFounderWorkspaceSeed.contacts);
  memory.opportunities = mergeById(memory.opportunities, henryFounderWorkspaceSeed.opportunities);
  memory.interactions = mergeById(memory.interactions, henryFounderWorkspaceSeed.interactions);
  memory.actions = mergeById(memory.actions, henryFounderWorkspaceSeed.actions);
  memory.objections = mergeById(memory.objections, henryFounderWorkspaceSeed.objections);
  memory.founderWorkspace = {
    label: HENRY_FOUNDER_WORKSPACE_LABEL,
    loadedAt,
    brandReferences: henryFounderWorkspaceSeed.brandReferences,
    pricingContexts: henryFounderWorkspaceSeed.pricingContexts,
    reviewFlags: henryFounderWorkspaceSeed.reviewFlags,
  };

  writeLocalMemory(memory);
  return {
    label: HENRY_FOUNDER_WORKSPACE_LABEL,
    loadedAt,
    counts: {
      accounts: henryFounderWorkspaceSeed.accounts.length,
      contacts: henryFounderWorkspaceSeed.contacts.length,
      opportunities: henryFounderWorkspaceSeed.opportunities.length,
      interactions: henryFounderWorkspaceSeed.interactions.length,
      actions: henryFounderWorkspaceSeed.actions.length,
      objections: henryFounderWorkspaceSeed.objections.length,
      pricingContexts: henryFounderWorkspaceSeed.pricingContexts.length,
      brandReferences: henryFounderWorkspaceSeed.brandReferences.length,
      reviewFlags: henryFounderWorkspaceSeed.reviewFlags.length,
    },
  };
}

export function getFounderWorkspaceState() {
  return readLocalMemory().founderWorkspace || null;
}

function mergeById<T extends { id: string }>(existing: T[], incoming: T[]) {
  const byId = new Map(existing.map((item) => [item.id, item]));
  incoming.forEach((item) => {
    byId.set(item.id, item);
  });
  return Array.from(byId.values());
}
