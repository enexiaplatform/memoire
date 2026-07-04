import type { Account, AccountNarrative, Contact, Interaction, Opportunity, SalesAction } from '../../types/v31';
import { todayDateKey } from '../../utils/safeDate.ts';

interface AccountNarrativeInput {
  account: Account;
  contacts: Contact[];
  opportunities: Opportunity[];
  interactions: Interaction[];
  actions: SalesAction[];
}

const activeStages = ['new', 'active', 'proposal', 'negotiation', 'paused'];

export function buildAccountNarrative({
  account,
  contacts,
  opportunities,
  interactions,
  actions,
}: AccountNarrativeInput): AccountNarrative {
  const currentOpportunity = pickCurrentOpportunity(opportunities);
  const lastInteraction = interactions[0] || null;
  const nextAction = actions[0]?.title || currentOpportunity?.next_action_text || '';
  const mainBlocker = currentOpportunity?.blocker || lastInteraction?.objection || account.objections[0] || '';
  const keyPainPoints = uniqueList([
    ...account.pain_points,
    ...interactions.map((interaction) => interaction.pain_point || ''),
  ]).slice(0, 6);
  const keyObjections = uniqueList([
    ...account.objections,
    ...interactions.map((interaction) => interaction.objection || ''),
    currentOpportunity?.blocker || '',
  ]).slice(0, 6);
  const missingContext = getMissingContext({
    currentOpportunity,
    lastInteraction,
    mainBlocker,
    nextAction,
    contacts,
    keyPainPoints,
    keyObjections,
  });

  return {
    accountId: account.id,
    narrative: buildNarrativeText({
      account,
      currentOpportunity,
      lastInteraction,
      mainBlocker,
      nextAction,
      missingContext,
    }),
    currentOpportunity: currentOpportunity?.title,
    currentStage: currentOpportunity?.stage,
    mainBlocker: mainBlocker || undefined,
    nextAction: nextAction || undefined,
    lastInteraction: lastInteraction?.summary,
    keyPainPoints,
    keyObjections,
    missingContext,
    updatedAt: new Date().toISOString(),
  };
}

export function hasEnoughAccountContext(narrative: AccountNarrative) {
  return Boolean(
    narrative.currentOpportunity ||
    narrative.lastInteraction ||
    narrative.nextAction ||
    narrative.mainBlocker ||
    narrative.keyPainPoints.length > 0 ||
    narrative.keyObjections.length > 0
  );
}

export function buildAccountTimeline(interactions: Interaction[], actions: SalesAction[]) {
  return [
    ...interactions.map((interaction) => ({
      id: `interaction-${interaction.id}`,
      date: interaction.occurred_at,
      label: interaction.interaction_type,
      title: interaction.summary,
      detail: [interaction.pain_point, interaction.objection].filter(Boolean).join(' / '),
      tone: 'memory' as const,
    })),
    ...actions.map((action) => ({
      id: `action-${action.id}`,
      date: action.due_date || action.created_at,
      label: action.status === 'open' ? 'open action' : action.status,
      title: action.title,
      detail: action.due_date ? `Due ${action.due_date}` : 'No due date',
      tone: action.due_date && action.due_date < todayDateKey() ? 'warning' as const : 'action' as const,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));
}

function pickCurrentOpportunity(opportunities: Opportunity[]) {
  return opportunities.find((opportunity) => activeStages.includes(opportunity.stage))
    || opportunities[0]
    || null;
}

function buildNarrativeText({
  account,
  currentOpportunity,
  lastInteraction,
  mainBlocker,
  nextAction,
  missingContext,
}: {
  account: Account;
  currentOpportunity: Opportunity | null;
  lastInteraction: Interaction | null;
  mainBlocker: string;
  nextAction: string;
  missingContext: string[];
}) {
  const sentences: string[] = [];

  if (currentOpportunity) {
    sentences.push(`${account.name} is currently at ${currentOpportunity.stage} for ${currentOpportunity.title}.`);
  } else {
    sentences.push(`${account.name} does not have a current opportunity captured yet.`);
  }

  if (lastInteraction?.summary) {
    sentences.push(`The latest interaction was ${lastInteraction.summary}.`);
  }

  if (mainBlocker) {
    sentences.push(`The main blocker is ${mainBlocker}.`);
  }

  if (nextAction) {
    sentences.push(`The next action is ${nextAction}.`);
  }

  if (sentences.length < 3 && missingContext.length > 0) {
    sentences.push(`Memoire is missing ${missingContext.slice(0, 3).join(', ').toLowerCase()} for this account.`);
  }

  return sentences.slice(0, 5).join(' ');
}

function getMissingContext({
  currentOpportunity,
  lastInteraction,
  mainBlocker,
  nextAction,
  contacts,
  keyPainPoints,
  keyObjections,
}: {
  currentOpportunity: Opportunity | null;
  lastInteraction: Interaction | null;
  mainBlocker: string;
  nextAction: string;
  contacts: Contact[];
  keyPainPoints: string[];
  keyObjections: string[];
}) {
  const missing: string[] = [];
  if (!currentOpportunity) missing.push('Current opportunity');
  if (!lastInteraction) missing.push('Last interaction');
  if (!mainBlocker) missing.push('Main blocker');
  if (!nextAction) missing.push('Next action');
  if (contacts.length === 0) missing.push('Relationship context');
  if (keyPainPoints.length === 0) missing.push('Pain points');
  if (keyObjections.length === 0) missing.push('Objections');
  return missing;
}

function uniqueList(values: string[]) {
  const seen = new Set<string>();
  return values
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
