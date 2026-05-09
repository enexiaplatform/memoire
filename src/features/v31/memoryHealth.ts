import type { Account, Contact, Interaction, MemoryHealth, Objection, Opportunity, SalesAction } from '../../types/v31';
import type { BrokenLoop } from './brokenLoops';

type MemoryHealthEntity =
  | { entityType: 'account'; entity: Account }
  | { entityType: 'opportunity'; entity: Opportunity };

interface MemoryHealthRelatedData {
  accounts?: Account[];
  contacts: Contact[];
  opportunities: Opportunity[];
  interactions: Interaction[];
  actions: SalesAction[];
  objections?: Objection[];
  brokenLoops: BrokenLoop[];
  staleDays?: number;
}

const activeStages = ['new', 'active', 'proposal', 'negotiation', 'paused'];

export function calculateMemoryHealth(
  target: MemoryHealthEntity,
  {
    contacts,
    opportunities,
    interactions,
    actions,
    objections = [],
    brokenLoops,
    staleDays = 14,
  }: MemoryHealthRelatedData
): MemoryHealth {
  const entityId = target.entity.id;
  const accountId = target.entityType === 'account' ? target.entity.id : target.entity.account_id;
  const opportunityId = target.entityType === 'opportunity' ? target.entity.id : null;
  const relatedOpportunities = target.entityType === 'account'
    ? opportunities.filter((opportunity) => opportunity.account_id === entityId && activeStages.includes(opportunity.stage))
    : [target.entity];
  const primaryOpportunity = relatedOpportunities[0];
  const relatedContacts = contacts.filter((contact) => contact.account_id === accountId);
  const relatedInteractions = interactions.filter((interaction) => {
    if (opportunityId && interaction.opportunity_id === opportunityId) return true;
    return Boolean(accountId && interaction.account_id === accountId);
  });
  const relatedActions = actions.filter((action) => {
    if (opportunityId && action.opportunity_id === opportunityId) return true;
    return Boolean(accountId && action.account_id === accountId);
  });
  const relatedObjections = objections.filter((objection) => {
    if (opportunityId && objection.opportunity_id === opportunityId) return true;
    return Boolean(accountId && objection.account_id === accountId);
  });
  const relevantBrokenLoops = brokenLoops.filter((loop) => {
    if (opportunityId && loop.opportunityId === opportunityId) return true;
    if (accountId && loop.accountId === accountId) return true;
    return loop.entityId === entityId;
  });

  const latestInteraction = latestByDate(relatedInteractions, (interaction) => interaction.occurred_at);
  const staleCutoff = new Date();
  staleCutoff.setDate(staleCutoff.getDate() - staleDays);
  const lastTouch = latestInteraction?.occurred_at || primaryOpportunity?.last_touch_at;
  const hasRecentInteraction = Boolean(lastTouch && new Date(lastTouch) >= staleCutoff);
  const openActions = relatedActions.filter((action) => action.status === 'open');
  const hasNextAction = openActions.length > 0 || Boolean(primaryOpportunity?.next_action_text);
  const hasOpportunity = relatedOpportunities.length > 0 || target.entityType === 'opportunity';
  const hasContact = relatedContacts.length > 0 || Boolean(primaryOpportunity?.contact_id);
  const hasOpenObjection = relatedObjections.some((objection) => objection.status === 'open')
    || relatedInteractions.some((interaction) => Boolean(interaction.objection));
  const hasDecisionContext = hasDecisionSignal(primaryOpportunity, relatedInteractions, relatedObjections);
  const hasBrokenLoop = relevantBrokenLoops.some((loop) => loop.priority === 'P0' || loop.priority === 'P1');

  const missingContext: string[] = [];
  const reasons: string[] = [];
  const suggestedFixes: string[] = [];

  if (!hasRecentInteraction) {
    missingContext.push('Recent interaction');
    reasons.push('No recent interaction is available.');
    suggestedFixes.push('Capture a recent customer update or schedule a check-in.');
  }
  if (!hasNextAction) {
    missingContext.push('Next action');
    reasons.push('There is no clear next action.');
    suggestedFixes.push('Create a next action to keep the account moving.');
  }
  if (!hasOpportunity) {
    missingContext.push('Opportunity');
    reasons.push('No active opportunity is linked.');
    suggestedFixes.push('Link the account to the current opportunity if one exists.');
  }
  if (!hasContact) {
    missingContext.push('Contact');
    reasons.push('No contact context is linked.');
    suggestedFixes.push('Add or link the main customer contact.');
  }
  if (!hasDecisionContext) {
    missingContext.push('Decision maker / timeline');
    reasons.push('Decision context is still unclear.');
    suggestedFixes.push('Capture decision timing, authority, budget, or approval context.');
  }
  if (hasOpenObjection) {
    reasons.push('There is an open objection or blocker in memory.');
    suggestedFixes.push('Address the objection or link it to a follow-up action.');
  }
  if (hasBrokenLoop) {
    reasons.push('This deal or account may go silent without attention.');
    relevantBrokenLoops.slice(0, 2).forEach((loop) => suggestedFixes.push(loop.suggestedFix));
  }

  const criticalBreak = hasBrokenLoop || !hasNextAction || relevantBrokenLoops.some((loop) => loop.priority === 'P0');
  const status = criticalBreak || !hasRecentInteraction
    ? 'broken'
    : missingContext.length > 0 || hasOpenObjection
      ? 'needs_attention'
      : 'healthy';

  return {
    entityType: target.entityType,
    entityId,
    status,
    reasons: dedupe(reasons),
    missingContext: dedupe(missingContext),
    suggestedFixes: dedupe(suggestedFixes),
    signals: {
      hasRecentInteraction,
      hasNextAction,
      hasOpportunity,
      hasContact,
      hasOpenObjection,
      hasDecisionContext,
      hasBrokenLoop,
    },
    updatedAt: new Date().toISOString(),
  };
}

export function memoryHealthLabel(status: MemoryHealth['status']) {
  if (status === 'healthy') return 'Context Healthy';
  if (status === 'needs_attention') return 'Needs Context';
  return 'Deal at Risk';
}

function latestByDate<T>(items: T[], getDate: (item: T) => string | null | undefined) {
  return items.reduce<T | null>((latest, item) => {
    const itemDate = getDate(item) || '';
    const latestDate = latest ? getDate(latest) || '' : '';
    return !latest || itemDate > latestDate ? item : latest;
  }, null);
}

function hasDecisionSignal(
  opportunity: Opportunity | undefined,
  interactions: Interaction[],
  objections: Objection[]
) {
  if (opportunity?.stage && opportunity.stage !== 'new') return true;
  const decisionWords = ['decision', 'timeline', 'approval', 'authority', 'budget', 'procurement', 'sign off', 'sign-off'];
  const text = [
    opportunity?.blocker,
    opportunity?.next_action_text,
    ...interactions.flatMap((interaction) => [interaction.summary, interaction.pain_point, interaction.objection]),
    ...objections.flatMap((objection) => [objection.title, objection.detail, objection.category]),
  ].filter(Boolean).join(' ').toLowerCase();
  return decisionWords.some((word) => text.includes(word));
}

function dedupe(items: string[]) {
  return Array.from(new Set(items.filter(Boolean)));
}
