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

function mergeMany(existing: string[], nextItems: string[]) {
  return nextItems.reduce((current, item) => mergeList(current, item), existing);
}

function splitStructuredObjections(value: string) {
  return value
    .split(/\n|;/)
    .map((item) => item.replace(/^\s*(?:\d+[.)]|[-*])\s*/, '').trim())
    .filter(Boolean);
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
  const objectionItems = splitStructuredObjections(structured.objection);

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
    account.objections = mergeMany(account.objections, objectionItems);
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
        blocker: objectionItems.join('\n') || null,
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
    opportunity.blocker = objectionItems.join('\n') || opportunity.blocker;
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

  if (objectionItems.length > 0 && accountId) {
    objectionItems.forEach((objection) => memory.objections.push({
      id: id(),
      user_id: DEMO_USER_ID,
      account_id: accountId,
      contact_id: contactId,
      opportunity_id: opportunityId,
      source_interaction_id: interactionId,
      title: objection,
      detail: objection,
      category: 'other',
      status: actionId ? 'addressed' : 'open',
      severity: structured.urgency,
      response_angle: null,
      linked_action_id: actionId,
      first_mentioned_at: timestamp,
      last_mentioned_at: timestamp,
      created_at: timestamp,
      updated_at: timestamp,
    }));
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
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const proposalSentAt = daysAgo(18);
  const internalReviewAt = daysAgo(15);
  const tenderNoteAt = daysAgo(10);
  const controlReviewAt = daysAgo(5);
  const northstarReviewAt = daysAgo(7);
  const stadaRecentAt = daysAgo(2);
  const memory = emptyMemory();

  const apexPharma: Account = {
    id: 'demo-account-apex-pharma',
    user_id: DEMO_USER_ID,
    name: 'Apex Pharma',
    summary: 'Apex Pharma received a proposal and replied that the customer team is in internal review, but no follow-up is scheduled.',
    industry: 'Pharmaceutical manufacturing',
    status: 'active',
    pain_points: ['Cleanroom readiness', 'Proposal review clarity'],
    objections: ['Internal review may stall without a follow-up'],
    source_capture_id: null,
    created_at: daysAgo(42),
    updated_at: internalReviewAt,
  };
  const tvPharm: Account = {
    id: 'demo-account-orion-pharma',
    user_id: DEMO_USER_ID,
    name: 'Orion Pharma',
    summary: 'Orion Pharma has a Apex Labs / Validation System opportunity with tender status pending and procurement timeline unclear.',
    industry: 'Pharmaceutical manufacturing',
    status: 'active',
    pain_points: ['Apex Labs sterilization readiness', 'Procurement timeline clarity'],
    objections: ['Tender pending and no confirmed next action'],
    source_capture_id: null,
    created_at: daysAgo(38),
    updated_at: tenderNoteAt,
  };
  const controlUnion: Account = {
    id: 'demo-account-northstar-foods',
    user_id: DEMO_USER_ID,
    name: 'Northstar Foods',
    summary: 'Northstar Foods is reviewing a proposal. Their concerns are lead time and local support, and decision ownership is still unclear.',
    industry: 'Testing and certification',
    status: 'active',
    pain_points: ['Implementation timeline clarity', 'Local support confidence'],
    objections: ['Lead time and local support concern'],
    source_capture_id: null,
    created_at: daysAgo(28),
    updated_at: controlReviewAt,
  };
  const northstarLabs: Account = {
    id: 'demo-account-northstar-labs',
    user_id: DEMO_USER_ID,
    name: 'Northstar Labs',
    summary: 'Northstar Labs raised validation proof and compliance confidence concerns with no linked follow-up.',
    industry: 'Life science quality operations',
    status: 'active',
    pain_points: ['Validation documentation', 'Compliance confidence'],
    objections: ['Needs validation proof and compliance confidence'],
    source_capture_id: null,
    created_at: daysAgo(35),
    updated_at: northstarReviewAt,
  };
  const stadaPymepharco: Account = {
    id: 'demo-account-stada-pymepharco',
    user_id: DEMO_USER_ID,
    name: 'STADA Pymepharco',
    summary: 'STADA Pymepharco is on track with a recent technical alignment, known contact, and clear next action.',
    industry: 'Pharmaceutical manufacturing',
    status: 'active',
    pain_points: ['Validation readiness'],
    objections: [],
    source_capture_id: null,
    created_at: daysAgo(40),
    updated_at: stadaRecentAt,
  };

  memory.accounts = [apexPharma, tvPharm, controlUnion, northstarLabs, stadaPymepharco];
  memory.contacts = [
    {
      id: 'demo-contact-nam',
      user_id: DEMO_USER_ID,
      account_id: controlUnion.id,
      name: 'Nam',
      role: 'Technical evaluator',
      email: null,
      phone: null,
      notes: 'Interested in implementation timeline and local support clarity.',
      source_capture_id: null,
      created_at: timestamp,
      updated_at: timestamp,
    },
    {
      id: 'demo-contact-trinh',
      user_id: DEMO_USER_ID,
      account_id: stadaPymepharco.id,
      name: 'Trinh',
      role: 'QC Manager',
      email: null,
      phone: null,
      notes: 'Owns technical validation and next meeting preparation.',
      source_capture_id: null,
      created_at: timestamp,
      updated_at: timestamp,
    },
  ];
  memory.opportunities = [
    {
      id: 'demo-opportunity-apex-proposal',
      user_id: DEMO_USER_ID,
      account_id: apexPharma.id,
      contact_id: null,
      title: 'Cleanroom readiness proposal',
      stage: 'proposal',
      estimated_value: null,
      blocker: 'Internal review may stall without follow-up',
      next_action_text: null,
      last_touch_at: internalReviewAt,
      urgency: 'high',
      confidence: 'medium',
      source_capture_id: null,
      created_at: daysAgo(42),
      updated_at: internalReviewAt,
    },
    {
      id: 'demo-opportunity-orion-procurement',
      user_id: DEMO_USER_ID,
      account_id: tvPharm.id,
      contact_id: null,
      title: 'Orion Pharma / Procurement review',
      stage: 'proposal',
      estimated_value: null,
      blocker: 'Tender pending and procurement timeline unclear',
      next_action_text: null,
      last_touch_at: tenderNoteAt,
      urgency: 'medium',
      confidence: 'medium',
      source_capture_id: null,
      created_at: daysAgo(38),
      updated_at: tenderNoteAt,
    },
    {
      id: 'demo-opportunity-northstar-foods-proposal',
      user_id: DEMO_USER_ID,
      account_id: controlUnion.id,
      contact_id: 'demo-contact-nam',
      title: 'Proposal review',
      stage: 'proposal',
      estimated_value: null,
      blocker: 'Lead time and local support concern',
      next_action_text: 'Send implementation timeline next Tuesday',
      last_touch_at: controlReviewAt,
      urgency: 'high',
      confidence: 'medium',
      source_capture_id: null,
      created_at: daysAgo(28),
      updated_at: controlReviewAt,
    },
    {
      id: 'demo-opportunity-northstar-validation',
      user_id: DEMO_USER_ID,
      account_id: northstarLabs.id,
      contact_id: null,
      title: 'Validation proof request',
      stage: 'active',
      estimated_value: null,
      blocker: 'Needs validation proof and compliance confidence',
      next_action_text: null,
      last_touch_at: northstarReviewAt,
      urgency: 'high',
      confidence: 'low',
      source_capture_id: null,
      created_at: daysAgo(35),
      updated_at: northstarReviewAt,
    },
    {
      id: 'demo-opportunity-stada-alignment',
      user_id: DEMO_USER_ID,
      account_id: stadaPymepharco.id,
      contact_id: 'demo-contact-trinh',
      title: 'Validation readiness alignment',
      stage: 'active',
      estimated_value: null,
      blocker: null,
      next_action_text: 'Prepare validation checklist for Trinh',
      last_touch_at: stadaRecentAt,
      urgency: 'medium',
      confidence: 'medium',
      source_capture_id: null,
      created_at: daysAgo(40),
      updated_at: stadaRecentAt,
    },
  ];
  memory.interactions = [
    {
      id: 'demo-interaction-apex-proposal-sent',
      user_id: DEMO_USER_ID,
      account_id: apexPharma.id,
      contact_id: null,
      opportunity_id: 'demo-opportunity-apex-proposal',
      source_capture_id: null,
      interaction_type: 'proposal',
      occurred_at: proposalSentAt,
      summary: 'Proposal sent for cleanroom readiness project.',
      pain_point: 'Need internal review clarity',
      objection: null,
      raw_note: 'Proposal sent Apr 21. Customer said the team would review internally.',
      structured_data: {},
      created_at: proposalSentAt,
    },
    {
      id: 'demo-interaction-apex-internal-review',
      user_id: DEMO_USER_ID,
      account_id: apexPharma.id,
      contact_id: null,
      opportunity_id: 'demo-opportunity-apex-proposal',
      source_capture_id: null,
      interaction_type: 'note',
      occurred_at: internalReviewAt,
      summary: 'Last response: customer is in internal review. No follow-up action was scheduled.',
      pain_point: null,
      objection: 'Internal review may stall without follow-up',
      raw_note: 'Customer replied that the proposal is under internal review. No follow-up date confirmed.',
      structured_data: {},
      created_at: internalReviewAt,
    },
    {
      id: 'demo-interaction-orion-pharma-tender',
      user_id: DEMO_USER_ID,
      account_id: tvPharm.id,
      contact_id: null,
      opportunity_id: 'demo-opportunity-orion-procurement',
      source_capture_id: null,
      interaction_type: 'note',
      occurred_at: tenderNoteAt,
      summary: 'Tender pending. Procurement timeline is unclear and no confirmed next action exists.',
      pain_point: 'Procurement timeline clarity',
      objection: 'Tender pending and procurement timeline unclear',
      raw_note: 'Orion Pharma / Procurement review pending. Procurement timeline unclear. No confirmed next action.',
      structured_data: {},
      created_at: tenderNoteAt,
    },
    {
      id: 'demo-interaction-northstar-foods-call',
      user_id: DEMO_USER_ID,
      account_id: controlUnion.id,
      contact_id: 'demo-contact-nam',
      opportunity_id: 'demo-opportunity-northstar-foods-proposal',
      source_capture_id: 'demo-capture-northstar-foods',
      interaction_type: 'call',
      occurred_at: controlReviewAt,
      summary: 'Northstar Foods is reviewing the proposal. They are concerned about lead time and local support.',
      pain_point: 'Implementation timeline clarity and local support confidence',
      objection: 'Lead time and local support concern',
      raw_note: 'Just called Nam from Northstar Foods. They are reviewing the proposal but are concerned about lead time and local support. Need to send implementation timeline next Tuesday.',
      structured_data: {},
      created_at: controlReviewAt,
    },
    {
      id: 'demo-interaction-northstar-objection',
      user_id: DEMO_USER_ID,
      account_id: northstarLabs.id,
      contact_id: null,
      opportunity_id: 'demo-opportunity-northstar-validation',
      source_capture_id: null,
      interaction_type: 'note',
      occurred_at: northstarReviewAt,
      summary: 'Northstar Labs asked for validation proof and compliance confidence before they can move forward.',
      pain_point: 'Compliance proof',
      objection: 'Needs validation proof and compliance confidence',
      raw_note: 'Customer asked for validation proof and compliance confidence. No follow-up action linked.',
      structured_data: {},
      created_at: northstarReviewAt,
    },
    {
      id: 'demo-interaction-stada-recent',
      user_id: DEMO_USER_ID,
      account_id: stadaPymepharco.id,
      contact_id: 'demo-contact-trinh',
      opportunity_id: 'demo-opportunity-stada-alignment',
      source_capture_id: null,
      interaction_type: 'meeting',
      occurred_at: stadaRecentAt,
      summary: 'Recent technical alignment with Trinh. Approval owner and timing are known for the next validation review.',
      pain_point: 'Validation readiness',
      objection: null,
      raw_note: 'Recent meeting with Trinh. Next action is to prepare validation checklist for the next review. Decision owner and timing are known.',
      structured_data: {},
      created_at: stadaRecentAt,
    },
  ];
  memory.actions = [
    {
      id: 'demo-action-northstar-foods-timeline',
      user_id: DEMO_USER_ID,
      account_id: controlUnion.id,
      contact_id: 'demo-contact-nam',
      opportunity_id: 'demo-opportunity-northstar-foods-proposal',
      interaction_id: 'demo-interaction-northstar-foods-call',
      title: 'Send implementation timeline to Nam',
      due_date: tomorrow,
      status: 'open',
      suggested: false,
      source: 'capture',
      created_at: timestamp,
      updated_at: timestamp,
    },
    {
      id: 'demo-action-stada-checklist',
      user_id: DEMO_USER_ID,
      account_id: stadaPymepharco.id,
      contact_id: 'demo-contact-trinh',
      opportunity_id: 'demo-opportunity-stada-alignment',
      interaction_id: 'demo-interaction-stada-recent',
      title: 'Prepare validation checklist for Trinh',
      due_date: tomorrow,
      status: 'open',
      suggested: false,
      source: 'manual',
      created_at: timestamp,
      updated_at: timestamp,
    },
  ];
  memory.objections = [
    {
      id: 'demo-objection-apex-internal-review',
      user_id: DEMO_USER_ID,
      account_id: apexPharma.id,
      opportunity_id: 'demo-opportunity-apex-proposal',
      contact_id: null,
      source_interaction_id: 'demo-interaction-apex-internal-review',
      title: 'Internal review may stall without follow-up',
      detail: 'Proposal is in internal review and no follow-up action is scheduled.',
      category: 'other',
      status: 'open',
      severity: 'high',
      response_angle: null,
      linked_action_id: null,
      first_mentioned_at: internalReviewAt,
      last_mentioned_at: internalReviewAt,
      created_at: internalReviewAt,
      updated_at: internalReviewAt,
    },
    {
      id: 'demo-objection-orion-pharma-tender',
      user_id: DEMO_USER_ID,
      account_id: tvPharm.id,
      opportunity_id: 'demo-opportunity-orion-procurement',
      contact_id: null,
      source_interaction_id: 'demo-interaction-orion-pharma-tender',
      title: 'Tender pending and procurement timeline unclear',
      detail: 'Tender/procurement process may go silent because no confirmed next action exists.',
      category: 'other',
      status: 'open',
      severity: 'medium',
      response_angle: null,
      linked_action_id: null,
      first_mentioned_at: tenderNoteAt,
      last_mentioned_at: tenderNoteAt,
      created_at: tenderNoteAt,
      updated_at: tenderNoteAt,
    },
    {
      id: 'demo-objection-northstar-foods-support',
      user_id: DEMO_USER_ID,
      account_id: controlUnion.id,
      opportunity_id: 'demo-opportunity-northstar-foods-proposal',
      contact_id: 'demo-contact-nam',
      source_interaction_id: 'demo-interaction-northstar-foods-call',
      title: 'Lead time and local support concern',
      detail: 'Customer needs implementation timeline and local support confidence. Decision maker and timeline are not yet captured.',
      category: 'support',
      status: 'addressed',
      severity: 'high',
      response_angle: 'Send implementation timeline and clarify local support path.',
      linked_action_id: 'demo-action-northstar-foods-timeline',
      first_mentioned_at: controlReviewAt,
      last_mentioned_at: controlReviewAt,
      created_at: timestamp,
      updated_at: timestamp,
    },
    {
      id: 'demo-objection-northstar-validation-proof',
      user_id: DEMO_USER_ID,
      account_id: northstarLabs.id,
      opportunity_id: 'demo-opportunity-northstar-validation',
      contact_id: null,
      source_interaction_id: 'demo-interaction-northstar-objection',
      title: 'Needs validation proof and compliance confidence',
      detail: 'Customer asked for validation proof and compliance confidence, but there is no linked follow-up.',
      category: 'compliance',
      status: 'open',
      severity: 'high',
      response_angle: null,
      linked_action_id: null,
      first_mentioned_at: northstarReviewAt,
      last_mentioned_at: northstarReviewAt,
      created_at: northstarReviewAt,
      updated_at: northstarReviewAt,
    },
  ];
  memory.captures = [
    {
      id: 'demo-capture-northstar-foods',
      user_id: DEMO_USER_ID,
      raw_text: 'Just called Nam from Northstar Foods. They are reviewing the proposal but are concerned about lead time and local support. Need to send implementation timeline next Tuesday.',
      structured_data: {
        type: 'call',
        account: 'Northstar Foods',
        contact: 'Nam',
        contact_role: 'Technical evaluator',
        opportunity: 'Proposal review',
        opportunity_stage: 'proposal',
        estimated_value: '',
        interaction_summary: 'Northstar Foods is reviewing the proposal and needs implementation confidence.',
        pain_point: 'Implementation timeline clarity and local support confidence',
        objection: 'Lead time and local support concern',
        next_action: 'Send implementation timeline to Nam',
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
  localStorage.setItem('memoire.sampleData.loaded', 'true');
  return memory.demoWorkspace;
}

export function getDemoWorkspaceState() {
  return readLocalMemory().demoWorkspace || null;
}
