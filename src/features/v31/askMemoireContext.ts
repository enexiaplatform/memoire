import type { Account, AskMemoireAnswer, AskMemoireContext, Interaction, Objection, Opportunity, SalesAction } from '../../types/v31';

export const allMemoryPresets = [
  'What needs attention today?',
  'Which accounts need action?',
  'What changed recently?',
  'What should I focus on?',
];

export const accountPresets = [
  'Summarize this account',
  'What happened last time?',
  'What is blocking this account?',
  'What should I do next?',
  'Draft follow-up',
];

export const opportunityPresets = [
  'What is blocking this deal?',
  'What is the next action?',
  'What context is missing?',
  'Draft follow-up',
];

export function buildAskMemoireContext({
  scope,
  accountId,
  opportunityId,
  accounts,
  opportunities,
  interactions,
  actions,
  objections,
}: {
  scope: AskMemoireContext['scope'];
  accountId?: string;
  opportunityId?: string;
  accounts: Account[];
  opportunities: Opportunity[];
  interactions: Interaction[];
  actions: SalesAction[];
  objections: Objection[];
}): AskMemoireContext {
  if (scope === 'account' && accountId) {
    const scopedAccounts = accounts.filter((account) => account.id === accountId);
    return {
      scope,
      accountId,
      includedData: {
        accounts: scopedAccounts,
        opportunities: opportunities.filter((opportunity) => opportunity.account_id === accountId),
        interactions: interactions.filter((interaction) => interaction.account_id === accountId),
        actions: actions.filter((action) => action.account_id === accountId),
        objections: objections.filter((objection) => objection.account_id === accountId),
      },
      missingContext: missingForPacket(scopedAccounts, interactions.filter((interaction) => interaction.account_id === accountId), actions.filter((action) => action.account_id === accountId), opportunities.filter((opportunity) => opportunity.account_id === accountId)),
    };
  }

  if (scope === 'opportunity' && opportunityId) {
    const scopedOpportunity = opportunities.filter((opportunity) => opportunity.id === opportunityId);
    const accountIds = new Set(scopedOpportunity.map((opportunity) => opportunity.account_id).filter(Boolean));
    return {
      scope,
      opportunityId,
      accountId: scopedOpportunity[0]?.account_id || undefined,
      includedData: {
        accounts: accounts.filter((account) => accountIds.has(account.id)),
        opportunities: scopedOpportunity,
        interactions: interactions.filter((interaction) => interaction.opportunity_id === opportunityId || accountIds.has(interaction.account_id || '')),
        actions: actions.filter((action) => action.opportunity_id === opportunityId),
        objections: objections.filter((objection) => objection.opportunity_id === opportunityId),
      },
      missingContext: missingForPacket(
        accounts.filter((account) => accountIds.has(account.id)),
        interactions.filter((interaction) => interaction.opportunity_id === opportunityId),
        actions.filter((action) => action.opportunity_id === opportunityId),
        scopedOpportunity
      ),
    };
  }

  return {
    scope: 'all',
    includedData: { accounts, opportunities, interactions, actions, objections },
    missingContext: missingForPacket(accounts, interactions, actions, opportunities),
  };
}

export function answerFromMemory(question: string, context: AskMemoireContext): AskMemoireAnswer {
  const normalized = question.toLowerCase();
  const accounts = context.includedData.accounts || [];
  const opportunities = context.includedData.opportunities || [];
  const interactions = context.includedData.interactions || [];
  const actions = context.includedData.actions || [];
  const objections = context.includedData.objections || [];
  const openActions = actions.filter((action) => action.status === 'open');
  const openObjections = objections.filter((objection) => objection.status === 'open');
  const latestInteraction = [...interactions].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))[0];
  const activeOpportunity = opportunities.find((opportunity) => !['won', 'lost'].includes(opportunity.stage)) || opportunities[0];
  const suggestedNextAction = openActions[0]?.title || activeOpportunity?.next_action_text || '';

  if (normalized.includes('blocking') || normalized.includes('block') || normalized.includes('objection')) {
    const blockers = [
      ...openObjections.map((objection) => objection.title),
      ...opportunities.map((opportunity) => opportunity.blocker || '').filter(Boolean),
      ...interactions.map((interaction) => interaction.objection || '').filter(Boolean),
    ];
    return response({
      answer: blockers.length > 0
        ? `Main blockers:\n- ${unique(blockers).join('\n- ')}`
        : 'No blockers or objections are captured in the selected memory.',
      context,
      suggestedNextAction: suggestedNextAction || 'Create a follow-up action to clarify the blocker.',
    });
  }

  if (normalized.includes('last time') || normalized.includes('happened')) {
    return response({
      answer: latestInteraction
        ? `Last interaction:\n${latestInteraction.summary}`
        : 'No recent interaction is captured in the selected memory.',
      context,
      suggestedNextAction,
    });
  }

  if (normalized.includes('follow-up') || normalized.includes('follow up') || normalized.includes('message')) {
    const account = accounts[0]?.name || 'there';
    const concern = openObjections[0]?.title || activeOpportunity?.blocker || '';
    return response({
      answer: `Hi ${account},\n\nFollowing up on our recent conversation${concern ? ` regarding ${concern}` : ''}. ${suggestedNextAction ? `The next step I noted is ${suggestedNextAction}.` : 'Please let me know the best next step from your side.'}\n\nBest regards,`,
      context,
      suggestedNextAction,
    });
  }

  if (normalized.includes('missing') || normalized.includes('context')) {
    return response({
      answer: context.missingContext.length > 0
        ? `Missing context:\n- ${context.missingContext.join('\n- ')}`
        : 'No major missing context detected in the selected memory.',
      context,
      suggestedNextAction: suggestedNextAction || 'Capture the next interaction or create a next action if this memory still feels incomplete.',
    });
  }

  if (normalized.includes('next') || normalized.includes('do')) {
    return response({
      answer: suggestedNextAction
        ? `Recommended next action:\n${suggestedNextAction}\n\nReason:\nThis is based on the selected open action, blocker, or latest opportunity memory.`
        : 'Memoire does not have an open next action in the selected memory.',
      context,
      suggestedNextAction: suggestedNextAction || 'Create a next action from the latest interaction.',
    });
  }

  if (normalized.includes('prepare')) {
    return response({
      answer: [
        accounts[0] ? `Account: ${accounts[0].name}` : '',
        activeOpportunity ? `Opportunity: ${activeOpportunity.title} (${activeOpportunity.stage})` : '',
        latestInteraction ? `Last interaction: ${latestInteraction.summary}` : '',
        openObjections.length > 0 ? `Open objections: ${openObjections.map((objection) => objection.title).join('; ')}` : '',
        suggestedNextAction ? `Next action: ${suggestedNextAction}` : '',
      ].filter(Boolean).join('\n'),
      context,
      suggestedNextAction,
    });
  }

  return response({
    answer: summarizeContext(accounts, opportunities, interactions, objections, actions),
    context,
    suggestedNextAction,
  });
}

export function presetsForScope(scope: AskMemoireContext['scope']) {
  if (scope === 'account') return accountPresets;
  if (scope === 'opportunity') return opportunityPresets;
  return allMemoryPresets;
}

function response({
  answer,
  context,
  suggestedNextAction,
}: {
  answer: string;
  context: AskMemoireContext;
  suggestedNextAction?: string;
}): AskMemoireAnswer {
  return {
    answer: answer || 'Memoire does not have enough context to answer confidently.',
    contextUsed: contextLabels(context),
    suggestedNextAction,
    missingContext: context.missingContext,
    suggestedQuestions: presetsForScope(context.scope).slice(0, 4),
  };
}

function summarizeContext(accounts: Account[], opportunities: Opportunity[], interactions: Interaction[], objections: Objection[], actions: SalesAction[]) {
  if (accounts.length === 0 && opportunities.length === 0 && interactions.length === 0) {
    return 'Memoire does not have enough context to answer confidently.';
  }
  return [
    accounts[0] ? `Account: ${accounts[0].name}. ${accounts[0].summary || ''}` : '',
    opportunities[0] ? `Current opportunity: ${opportunities[0].title} at ${opportunities[0].stage}.` : '',
    interactions[0] ? `Last interaction: ${interactions[0].summary}` : '',
    objections.length > 0 ? `Objections: ${objections.map((objection) => objection.title).join('; ')}` : '',
    actions.find((action) => action.status === 'open') ? `Next action: ${actions.find((action) => action.status === 'open')?.title}` : '',
  ].filter(Boolean).join('\n');
}

function contextLabels(context: AskMemoireContext) {
  const labels: string[] = [];
  if (context.scope === 'all') labels.push('All Memory');
  if (context.scope === 'account') labels.push(`Account: ${context.includedData.accounts?.[0]?.name || context.accountId}`);
  if (context.scope === 'opportunity') labels.push(`Opportunity: ${context.includedData.opportunities?.[0]?.title || context.opportunityId}`);
  labels.push(`${context.includedData.interactions?.length || 0} interactions`);
  labels.push(`${context.includedData.actions?.length || 0} actions`);
  labels.push(`${context.includedData.objections?.length || 0} objections`);
  return labels;
}

function missingForPacket(accounts: Account[], interactions: Interaction[], actions: SalesAction[], opportunities: Opportunity[]) {
  const missing: string[] = [];
  if (accounts.length === 0) missing.push('Account');
  if (interactions.length === 0) missing.push('Recent interaction');
  if (actions.filter((action) => action.status === 'open').length === 0) missing.push('Open action');
  if (opportunities.length === 0) missing.push('Opportunity stage');
  missing.push('Decision maker');
  return missing;
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
