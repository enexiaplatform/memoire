import type { Account, Interaction, Objection, Opportunity, SalesAction } from '../../types/v31';

export type BrokenLoopPriority = 'P0' | 'P1' | 'P2';
export type BrokenLoopActionLabel = 'Create Action' | 'Open Account' | 'Open Opportunity' | 'Review Capture';
export type BrokenLoopEntityType = 'account' | 'opportunity' | 'action' | 'capture' | 'objection';

export interface CaptureMemory {
  id: string;
  raw_text: string;
  structured_data?: Record<string, unknown> | null;
  status?: string | null;
  created_at: string;
}

export interface BrokenLoop {
  id: string;
  priority: BrokenLoopPriority;
  issue: string;
  affectedEntity: string;
  whyItMatters: string;
  suggestedFix: string;
  actionLabel: BrokenLoopActionLabel;
  entityType: BrokenLoopEntityType;
  entityId: string;
  accountId?: string | null;
  opportunityId?: string | null;
  captureId?: string | null;
}

interface BrokenLoopInput {
  accounts: Account[];
  opportunities: Opportunity[];
  interactions: Interaction[];
  actions: SalesAction[];
  objections?: Objection[];
  captures?: CaptureMemory[];
  staleDays?: number;
}

const activeOpportunityStages = ['new', 'active', 'proposal', 'negotiation', 'paused'];
const priorityRank: Record<BrokenLoopPriority, number> = { P0: 0, P1: 1, P2: 2 };

export function detectBrokenLoops({
  accounts,
  opportunities,
  interactions,
  actions,
  objections = [],
  captures = [],
  staleDays = 14,
}: BrokenLoopInput): BrokenLoop[] {
  const today = new Date().toISOString().slice(0, 10);
  const staleCutoff = new Date();
  staleCutoff.setDate(staleCutoff.getDate() - staleDays);

  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const activeActions = actions.filter((action) => action.status === 'open');
  const activeOpportunities = opportunities.filter((opportunity) => activeOpportunityStages.includes(opportunity.stage));
  const latestInteractionByAccount = latestBy(interactions, (interaction) => interaction.account_id || '');
  const latestInteractionByOpportunity = latestBy(interactions, (interaction) => interaction.opportunity_id || '');
  const actionByOpportunity = firstBy(activeActions, (action) => action.opportunity_id || '');
  const actionByInteraction = firstBy(activeActions, (action) => action.interaction_id || '');
  const actionById = new Map(activeActions.map((action) => [action.id, action]));
  const actionByCapture = firstBy(activeActions, (action) => {
    const interaction = interactions.find((item) => item.id === action.interaction_id);
    return interaction?.source_capture_id || '';
  });
  const loops: BrokenLoop[] = [];

  activeOpportunities.forEach((opportunity) => {
    const linkedAction = actionByOpportunity.get(opportunity.id);
    if (!linkedAction && !opportunity.next_action_text) {
      loops.push({
        id: `opportunity-no-next-action-${opportunity.id}`,
        priority: 'P0',
        issue: 'Opportunity has no next action',
        affectedEntity: `${accountById.get(opportunity.account_id || '')?.name || 'Unknown account'} / ${opportunity.title}`,
        whyItMatters: 'This deal may stall because there is no clear next step.',
        suggestedFix: 'Create a follow-up action.',
        actionLabel: 'Create Action',
        entityType: 'opportunity',
        entityId: opportunity.id,
        accountId: opportunity.account_id,
        opportunityId: opportunity.id,
      });
    }

    const latestInteraction = latestInteractionByOpportunity.get(opportunity.id)
      || (opportunity.account_id ? latestInteractionByAccount.get(opportunity.account_id) : null);
    const lastTouch = opportunity.last_touch_at || latestInteraction?.occurred_at;
    if (!lastTouch || new Date(lastTouch) < staleCutoff) {
      loops.push({
        id: `stale-opportunity-${opportunity.id}`,
        priority: 'P1',
        issue: 'Opportunity has gone stale',
        affectedEntity: `${accountById.get(opportunity.account_id || '')?.name || 'Unknown account'} / ${opportunity.title}`,
        whyItMatters: 'No recent interaction means the relationship may be cooling down.',
        suggestedFix: 'Schedule a check-in or log a recent update.',
        actionLabel: 'Open Opportunity',
        entityType: 'opportunity',
        entityId: opportunity.id,
        accountId: opportunity.account_id,
        opportunityId: opportunity.id,
      });
    }
  });

  activeActions.forEach((action) => {
    if (action.due_date && action.due_date < today) {
      loops.push({
        id: `overdue-action-${action.id}`,
        priority: 'P0',
        issue: 'Action is overdue',
        affectedEntity: action.title,
        whyItMatters: 'Delayed follow-up can reduce deal momentum.',
        suggestedFix: 'Complete, reschedule, or close this action.',
        actionLabel: 'Create Action',
        entityType: 'action',
        entityId: action.id,
        accountId: action.account_id,
        opportunityId: action.opportunity_id,
      });
    }
  });

  accounts
    .filter((account) => account.status === 'active')
    .forEach((account) => {
      const latestInteraction = latestInteractionByAccount.get(account.id);
      if (!latestInteraction || new Date(latestInteraction.occurred_at) < staleCutoff) {
        loops.push({
          id: `stale-account-${account.id}`,
          priority: 'P1',
          issue: 'Account has gone stale',
          affectedEntity: account.name,
          whyItMatters: 'No recent interaction means the relationship may be cooling down.',
          suggestedFix: 'Schedule a check-in or log a recent update.',
          actionLabel: 'Open Account',
          entityType: 'account',
          entityId: account.id,
          accountId: account.id,
        });
      }
    });

  interactions.forEach((interaction) => {
    if (interaction.objection && !actionByInteraction.has(interaction.id)) {
      loops.push({
        id: `objection-no-follow-up-${interaction.id}`,
        priority: 'P1',
        issue: 'Objection has no follow-up',
        affectedEntity: accountById.get(interaction.account_id || '')?.name || interaction.summary,
        whyItMatters: 'Unresolved objections can quietly block the deal.',
        suggestedFix: 'Create an action to address this objection.',
        actionLabel: 'Create Action',
        entityType: interaction.opportunity_id ? 'opportunity' : 'account',
        entityId: interaction.opportunity_id || interaction.account_id || interaction.id,
        accountId: interaction.account_id,
        opportunityId: interaction.opportunity_id,
        captureId: interaction.source_capture_id,
      });
    }

    if ((!interaction.account_id || !actionByInteraction.has(interaction.id)) && interaction.source_capture_id) {
      loops.push({
        id: `interaction-not-converted-${interaction.id}`,
        priority: 'P2',
        issue: 'Capture was not converted into action',
        affectedEntity: accountById.get(interaction.account_id || '')?.name || interaction.summary,
        whyItMatters: 'Raw notes create no sales movement unless structured.',
        suggestedFix: 'Link this capture to an account and create a next action.',
        actionLabel: 'Review Capture',
        entityType: 'capture',
        entityId: interaction.source_capture_id,
        accountId: interaction.account_id,
        opportunityId: interaction.opportunity_id,
        captureId: interaction.source_capture_id,
      });
    }
  });

  objections.forEach((objection) => {
    const linkedActionIsOpen = objection.linked_action_id ? actionById.has(objection.linked_action_id) : false;
    if (objection.status === 'open' && !linkedActionIsOpen) {
      loops.push({
        id: `objection-bank-no-follow-up-${objection.id}`,
        priority: 'P1',
        issue: 'Objection has no follow-up',
        affectedEntity: accountById.get(objection.account_id)?.name || objection.title,
        whyItMatters: 'Unresolved objections can quietly block the deal.',
        suggestedFix: 'Create an action to address this objection.',
        actionLabel: 'Create Action',
        entityType: 'objection',
        entityId: objection.id,
        accountId: objection.account_id,
        opportunityId: objection.opportunity_id,
      });
    }
  });

  captures.forEach((capture) => {
    const hasInteraction = interactions.some((interaction) => interaction.source_capture_id === capture.id);
    if (!hasInteraction && !actionByCapture.has(capture.id)) {
      loops.push({
        id: `capture-not-converted-${capture.id}`,
        priority: 'P2',
        issue: 'Capture was not converted into action',
        affectedEntity: capture.raw_text.slice(0, 80),
        whyItMatters: 'Raw notes create no sales movement unless structured.',
        suggestedFix: 'Link this capture to an account and create a next action.',
        actionLabel: 'Review Capture',
        entityType: 'capture',
        entityId: capture.id,
        captureId: capture.id,
      });
    }
  });

  return dedupeLoops(loops).sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority]);
}

function latestBy<T extends { occurred_at?: string; updated_at?: string }>(items: T[], getKey: (item: T) => string) {
  const result = new Map<string, T>();
  items.forEach((item) => {
    const key = getKey(item);
    if (!key) return;
    const current = result.get(key);
    const itemDate = item.occurred_at || item.updated_at || '';
    const currentDate = current?.occurred_at || current?.updated_at || '';
    if (!current || itemDate > currentDate) result.set(key, item);
  });
  return result;
}

function firstBy<T>(items: T[], getKey: (item: T) => string) {
  const result = new Map<string, T>();
  items.forEach((item) => {
    const key = getKey(item);
    if (key && !result.has(key)) result.set(key, item);
  });
  return result;
}

function dedupeLoops(loops: BrokenLoop[]) {
  const seen = new Set<string>();
  return loops.filter((loop) => {
    if (seen.has(loop.id)) return false;
    seen.add(loop.id);
    return true;
  });
}
