import type { Account, Interaction, MemoryChange, MemoryHealth, Objection, Opportunity, SalesAction } from '../../types/v31';
import type { BrokenLoop } from './brokenLoops';

interface WhatChangedDigestInput {
  accounts: Account[];
  opportunities: Opportunity[];
  interactions: Interaction[];
  actions: SalesAction[];
  objections?: Objection[];
  brokenLoops?: BrokenLoop[];
  memoryHealth?: MemoryHealth[];
  sinceDays?: number;
  limit?: number;
}

const severityRank: Record<MemoryChange['severity'], number> = { high: 0, medium: 1, low: 2 };

export function buildWhatChangedDigest({
  accounts,
  opportunities,
  interactions,
  actions,
  objections = [],
  brokenLoops = [],
  memoryHealth = [],
  sinceDays = 14,
  limit = 5,
}: WhatChangedDigestInput): MemoryChange[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - sinceDays);
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const opportunityById = new Map(opportunities.map((opportunity) => [opportunity.id, opportunity]));
  const changes: MemoryChange[] = [];

  interactions
    .filter((interaction) => isRecent(interaction.occurred_at || interaction.created_at, cutoff))
    .forEach((interaction) => {
      changes.push({
        id: `new-interaction-${interaction.id}`,
        type: 'new_interaction',
        title: 'New interaction captured',
        description: withEntity(interaction.summary, accountById.get(interaction.account_id || '')?.name),
        entityType: 'interaction',
        entityId: interaction.id,
        accountId: interaction.account_id || undefined,
        opportunityId: interaction.opportunity_id || undefined,
        severity: 'low',
        suggestedReviewAction: 'Review account memory.',
        createdAt: interaction.occurred_at || interaction.created_at,
      });
    });

  objections
    .filter((objection) => isRecent(objection.first_mentioned_at || objection.created_at, cutoff))
    .forEach((objection) => {
      changes.push({
        id: `new-objection-${objection.id}`,
        type: 'new_objection',
        title: 'New objection appeared',
        description: withEntity(objection.title, accountById.get(objection.account_id)?.name),
        entityType: 'objection',
        entityId: objection.id,
        accountId: objection.account_id,
        opportunityId: objection.opportunity_id || undefined,
        severity: objection.severity === 'high' ? 'high' : 'medium',
        suggestedReviewAction: objection.linked_action_id ? 'Review the linked follow-up.' : 'Create a follow-up action.',
        createdAt: objection.first_mentioned_at || objection.created_at,
      });
    });

  actions
    .filter((action) => action.status === 'open' && action.due_date && action.due_date < today())
    .forEach((action) => {
      changes.push({
        id: `overdue-action-${action.id}`,
        type: 'overdue_action',
        title: 'Action became overdue',
        description: withEntity(action.title, accountById.get(action.account_id || '')?.name || action.account?.name),
        entityType: 'action',
        entityId: action.id,
        accountId: action.account_id || undefined,
        opportunityId: action.opportunity_id || undefined,
        severity: 'high',
        suggestedReviewAction: 'Complete, reschedule, or close this action.',
        createdAt: action.due_date || action.updated_at,
      });
    });

  actions
    .filter((action) => action.status === 'open' && isRecent(action.created_at, cutoff))
    .forEach((action) => {
      changes.push({
        id: `next-action-created-${action.id}`,
        type: 'next_action_created',
        title: 'New next action created',
        description: withEntity(action.title, accountById.get(action.account_id || '')?.name || action.account?.name),
        entityType: 'action',
        entityId: action.id,
        accountId: action.account_id || undefined,
        opportunityId: action.opportunity_id || undefined,
        severity: 'medium',
        suggestedReviewAction: 'Use this action to move the account forward.',
        createdAt: action.created_at,
      });
    });

  brokenLoops.forEach((loop) => {
    changes.push({
      id: `broken-loop-${loop.id}`,
      type: 'broken_loop_appeared',
      title: 'Stuck deal needs review',
      description: `${loop.issue}: ${loop.affectedEntity}`,
      entityType: loop.entityType === 'capture' ? 'interaction' : loop.entityType === 'objection' ? 'objection' : loop.entityType,
      entityId: loop.entityId,
      accountId: loop.accountId || undefined,
      opportunityId: loop.opportunityId || undefined,
      severity: loop.priority === 'P0' ? 'high' : 'medium',
      suggestedReviewAction: loop.suggestedFix,
      createdAt: new Date().toISOString(),
    });
  });

  memoryHealth
    .filter((health) => health.status !== 'healthy')
    .forEach((health) => {
      const accountName = health.entityType === 'account'
        ? accountById.get(health.entityId)?.name
        : accountById.get(opportunityById.get(health.entityId)?.account_id || '')?.name;
      const opportunity = health.entityType === 'opportunity' ? opportunityById.get(health.entityId) : null;
      changes.push({
        id: `memory-health-${health.entityType}-${health.entityId}`,
        type: 'memory_health_changed',
        title: health.status === 'broken' ? 'Context Health shows deal at risk' : 'Context Health needs attention',
        description: withEntity(health.reasons[0] || 'Memoire needs more context for this memory.', opportunity?.title || accountName),
        entityType: health.entityType,
        entityId: health.entityId,
        accountId: health.entityType === 'account' ? health.entityId : opportunity?.account_id || undefined,
        opportunityId: health.entityType === 'opportunity' ? health.entityId : undefined,
        severity: health.status === 'broken' ? 'high' : 'medium',
        suggestedReviewAction: health.suggestedFixes[0] || 'Review missing context.',
        createdAt: health.updatedAt,
      });
    });

  opportunities
    .filter((opportunity) => isRecent(opportunity.updated_at, cutoff) && opportunity.stage !== 'new')
    .forEach((opportunity) => {
      changes.push({
        id: `opportunity-stage-${opportunity.id}`,
        type: 'opportunity_stage_changed',
        title: 'Opportunity stage updated',
        description: withEntity(`${opportunity.title} is now ${opportunity.stage}.`, accountById.get(opportunity.account_id || '')?.name || opportunity.account?.name),
        entityType: 'opportunity',
        entityId: opportunity.id,
        accountId: opportunity.account_id || undefined,
        opportunityId: opportunity.id,
        severity: 'medium',
        suggestedReviewAction: opportunity.next_action_text ? 'Review the next action.' : 'Add a next action for this stage.',
        createdAt: opportunity.updated_at,
      });
    });

  return dedupe(changes)
    .sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export function formatMemoryChangeSeverity(severity: MemoryChange['severity']) {
  if (severity === 'high') return 'High';
  if (severity === 'medium') return 'Medium';
  return 'Low';
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function isRecent(value: string | null | undefined, cutoff: Date) {
  return Boolean(value && new Date(value) >= cutoff);
}

function withEntity(description: string, entityName?: string) {
  return entityName ? `${entityName}: ${description}` : description;
}

function dedupe(changes: MemoryChange[]) {
  const seen = new Set<string>();
  return changes.filter((change) => {
    if (seen.has(change.id)) return false;
    seen.add(change.id);
    return true;
  });
}
