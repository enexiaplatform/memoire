import type { Account, Contact, Interaction, Objection, Opportunity, SalesAction, StructuredSalesCapture } from '../../types/v31';
import { DEMO_AUTH_KEY, DEMO_USER_ID, DEMO_WORKSPACE_KEY } from '../../lib/demoMode';

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
  demoWorkspace?: {
    label: string;
    loadedAt: string;
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
      demoWorkspace: memory.demoWorkspace,
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
  return {
    captureId,
    accountId,
    contactId,
    opportunityId,
    interactionId,
    actionId,
  };
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

export function getFounderWorkspaceState() {
  return null;
}

export function loadInteractiveDemoWorkspace() {
  const timestamp = new Date().toISOString();
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const memory = emptyMemory();

  const northstarLabs: Account = {
    id: 'demo-account-northstar-labs',
    user_id: DEMO_USER_ID,
    name: 'Northstar Labs',
    summary: 'Northstar Labs is reviewing a cleanroom validation proposal. The current concern is lead time and local support confidence.',
    industry: 'Life science quality operations',
    status: 'active',
    pain_points: ['Implementation timeline clarity', 'Local service support'],
    objections: ['Concern about lead time and local support'],
    source_capture_id: null,
    created_at: timestamp,
    updated_at: timestamp,
  };
  const apexPharma: Account = {
    id: 'demo-account-apex-pharma',
    user_id: DEMO_USER_ID,
    name: 'Apex Pharma',
    summary: 'Apex Pharma has an active cleanroom readiness opportunity with procurement timing still unresolved.',
    industry: 'Pharmaceutical manufacturing',
    status: 'active',
    pain_points: ['Sterilization workflow confidence'],
    objections: ['Procurement timing pending'],
    source_capture_id: null,
    created_at: timestamp,
    updated_at: timestamp,
  };

  memory.accounts = [northstarLabs, apexPharma];
  memory.contacts = [
    {
      id: 'demo-contact-linh',
      user_id: DEMO_USER_ID,
      account_id: northstarLabs.id,
      name: 'Linh',
      role: 'Technical evaluator',
      email: null,
      phone: null,
      notes: 'Interested in implementation timeline and local support clarity.',
      source_capture_id: null,
      created_at: timestamp,
      updated_at: timestamp,
    },
  ];
  memory.opportunities = [
    {
      id: 'demo-opportunity-northstar-validation',
      user_id: DEMO_USER_ID,
      account_id: northstarLabs.id,
      contact_id: 'demo-contact-linh',
      title: 'Cleanroom validation proposal',
      stage: 'proposal',
      estimated_value: null,
      blocker: 'Concern about lead time and local support',
      next_action_text: 'Send implementation timeline next Tuesday',
      last_touch_at: timestamp,
      urgency: 'high',
      confidence: 'medium',
      source_capture_id: null,
      created_at: timestamp,
      updated_at: timestamp,
    },
    {
      id: 'demo-opportunity-apex-readiness',
      user_id: DEMO_USER_ID,
      account_id: apexPharma.id,
      contact_id: null,
      title: 'Cleanroom readiness project',
      stage: 'proposal',
      estimated_value: null,
      blocker: 'Procurement timing pending',
      next_action_text: null,
      last_touch_at: yesterday,
      urgency: 'medium',
      confidence: 'medium',
      source_capture_id: null,
      created_at: timestamp,
      updated_at: timestamp,
    },
  ];
  memory.interactions = [
    {
      id: 'demo-interaction-northstar-call',
      user_id: DEMO_USER_ID,
      account_id: northstarLabs.id,
      contact_id: 'demo-contact-linh',
      opportunity_id: 'demo-opportunity-northstar-validation',
      source_capture_id: 'demo-capture-northstar',
      interaction_type: 'call',
      occurred_at: timestamp,
      summary: 'Called Linh from Northstar Labs. They are reviewing the proposal but are concerned about lead time and local support.',
      pain_point: 'Need implementation confidence before moving forward.',
      objection: 'Concern about lead time and local support',
      raw_note: 'Just called Linh from Northstar Labs. They are reviewing the proposal but are concerned about lead time and local support. Need to send implementation timeline next Tuesday.',
      structured_data: {},
      created_at: timestamp,
    },
    {
      id: 'demo-interaction-apex-note',
      user_id: DEMO_USER_ID,
      account_id: apexPharma.id,
      contact_id: null,
      opportunity_id: 'demo-opportunity-apex-readiness',
      source_capture_id: null,
      interaction_type: 'note',
      occurred_at: yesterday,
      summary: 'Procurement timing remains pending. Need to confirm next action.',
      pain_point: null,
      objection: 'Procurement timing pending',
      raw_note: 'Apex Pharma procurement timing pending for cleanroom readiness project.',
      structured_data: {},
      created_at: timestamp,
    },
  ];
  memory.actions = [
    {
      id: 'demo-action-northstar-timeline',
      user_id: DEMO_USER_ID,
      account_id: northstarLabs.id,
      contact_id: 'demo-contact-linh',
      opportunity_id: 'demo-opportunity-northstar-validation',
      interaction_id: 'demo-interaction-northstar-call',
      title: 'Send implementation timeline to Linh',
      due_date: tomorrow,
      status: 'open',
      suggested: false,
      source: 'capture',
      created_at: timestamp,
      updated_at: timestamp,
    },
    {
      id: 'demo-action-apex-review',
      user_id: DEMO_USER_ID,
      account_id: apexPharma.id,
      contact_id: null,
      opportunity_id: 'demo-opportunity-apex-readiness',
      interaction_id: null,
      title: 'Confirm next action for Apex Pharma procurement timing',
      due_date: today,
      status: 'open',
      suggested: true,
      source: 'manual',
      created_at: timestamp,
      updated_at: timestamp,
    },
  ];
  memory.objections = [
    {
      id: 'demo-objection-northstar-support',
      user_id: DEMO_USER_ID,
      account_id: northstarLabs.id,
      opportunity_id: 'demo-opportunity-northstar-validation',
      contact_id: 'demo-contact-linh',
      source_interaction_id: 'demo-interaction-northstar-call',
      title: 'Concern about lead time and local support',
      detail: 'Customer needs confidence in implementation timing and local support coverage.',
      category: 'support',
      status: 'addressed',
      severity: 'high',
      response_angle: 'Send a concise implementation timeline and clarify local support path.',
      linked_action_id: 'demo-action-northstar-timeline',
      first_mentioned_at: timestamp,
      last_mentioned_at: timestamp,
      created_at: timestamp,
      updated_at: timestamp,
    },
    {
      id: 'demo-objection-apex-procurement',
      user_id: DEMO_USER_ID,
      account_id: apexPharma.id,
      opportunity_id: 'demo-opportunity-apex-readiness',
      contact_id: null,
      source_interaction_id: 'demo-interaction-apex-note',
      title: 'Procurement timing pending',
      detail: 'Procurement timing is unresolved and needs a clear next step.',
      category: 'other',
      status: 'open',
      severity: 'medium',
      response_angle: null,
      linked_action_id: null,
      first_mentioned_at: yesterday,
      last_mentioned_at: yesterday,
      created_at: timestamp,
      updated_at: timestamp,
    },
  ];
  memory.captures = [
    {
      id: 'demo-capture-northstar',
      user_id: DEMO_USER_ID,
      raw_text: 'Just called Linh from Northstar Labs. They are reviewing the proposal but are concerned about lead time and local support. Need to send implementation timeline next Tuesday.',
      structured_data: {
        type: 'call',
        account: 'Northstar Labs',
        contact: 'Linh',
        contact_role: 'Technical evaluator',
        opportunity: 'Cleanroom validation proposal',
        opportunity_stage: 'proposal',
        estimated_value: '',
        interaction_summary: 'Northstar Labs is reviewing the proposal and needs implementation confidence.',
        pain_point: 'Implementation timeline clarity and local support confidence',
        objection: 'Concern about lead time and local support',
        next_action: 'Send implementation timeline to Linh',
        follow_up_date: tomorrow,
        urgency: 'high',
        confidence: 'medium',
      },
      status: 'processed',
      created_at: timestamp,
    },
  ];
  memory.demoWorkspace = {
    label: 'Interactive Demo Workspace',
    loadedAt: timestamp,
  };
  writeLocalMemory(memory);
  localStorage.setItem(DEMO_AUTH_KEY, 'demo@memoire.local');
  localStorage.setItem(DEMO_WORKSPACE_KEY, 'interactive-demo');
  return memory.demoWorkspace;
}

export function getDemoWorkspaceState() {
  return readLocalMemory().demoWorkspace || null;
}
