import type { Account, AskMemoireAnswer, AskMemoireContext, Interaction, Objection, Opportunity, SalesAction } from '../../types/v31';

export const allMemoryPresets = [
  'Which deals may go silent?',
  'Which accounts need follow-up?',
  'Which objections are unresolved?',
  'What should I fix today?',
  // Measured-history questions answered from computed data (no AI), surfaced
  // as presets so the loop's read-models are discoverable, not hidden behind
  // guessing the phrasing.
  'Where is the money?',
  'Did my follow-ups work?',
  'What are customers telling me?',
  'What changed recently?',
];

export const accountPresets = [
  'Why may this account go silent?',
  'What happened last time?',
  'What does Memoire know?',
  'What does Memoire not know?',
  'What should I do next?',
];

export const opportunityPresets = [
  'Where does this deal stand?',
  'Why is this deal stuck?',
  'What is blocking this opportunity?',
  'What follow-up is missing?',
  'What context is missing?',
  'What should I do next?',
];

export const actionFixPresets = [
  'Draft a follow-up',
  'How should I address this objection?',
  'What should I ask the customer next?',
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
  const accountName = accounts[0]?.name || activeOpportunity?.account?.name || 'Selected account';
  const blockers = unique([
    ...openObjections.map((objection) => objection.title),
    ...opportunities.map((opportunity) => opportunity.blocker || '').filter(Boolean),
    ...interactions.map((interaction) => interaction.objection || '').filter(Boolean),
  ]);
  // summarizeContext already refuses to claim this join, but it is only the
  // last branch of this function. Every branch above it printed the same
  // borrowed evidence under `Account: ${accounts[0].name}` - so asking
  // "Which opportunities have no next action?" on a 19-customer workspace
  // answered "Account: Grupo Calvo" over an interaction belonging to Luis
  // Simoes Logistica and a deal belonging to a third customer entirely.
  // One subject keeps the briefing voice; more than one and every line says
  // which list it is the top of.
  const oneSubject = hasSingleSubject(accounts, activeOpportunity);
  const subjectLine = oneSubject
    ? `Account: ${accountName}`
    : `Scope: all memory - ${accounts.length} customers. This is not one customer's story.`;
  const scopeNote = oneSubject
    ? undefined
    : 'Each line above is the top of its own list, not one account. Pick a customer in the context selector to get one story.';
  const evidence = oneSubject
    ? [
      latestInteraction ? `Last interaction: ${latestInteraction.summary}` : '',
      activeOpportunity ? `Opportunity: ${activeOpportunity.title} (${activeOpportunity.stage})` : '',
      blockers[0] ? `Blocker: ${blockers[0]}` : '',
      suggestedNextAction ? `Next action: ${suggestedNextAction}` : '',
    ].filter(Boolean)
    : [
      latestInteraction ? `Most recent interaction recorded: ${latestInteraction.summary}` : '',
      activeOpportunity ? `Most recently updated deal: ${activeOpportunity.title} (${activeOpportunity.stage})` : '',
      blockers[0] ? `First of ${blockers.length} open blocker${blockers.length === 1 ? '' : 's'}: ${blockers[0]}` : '',
      suggestedNextAction ? `Oldest open action: ${suggestedNextAction}` : '',
    ].filter(Boolean);

  if (normalized.includes('go silent') || normalized.includes('stuck') || normalized.includes('missing follow')) {
    const issue = blockers[0]
      ? 'Unresolved objection'
      : !suggestedNextAction
        ? 'Missing follow-up'
        : context.missingContext.length > 0
          ? 'Weak context'
          : 'No major silent-deal risk detected';
    return response({
      answer: structuredAnswer({
        account: accountName,
        issue,
        evidence,
        suggestedFix: suggestedNextAction || 'Create or confirm a follow-up action.',
        missingContext: context.missingContext,
        nextAction: suggestedNextAction,
      }),
      context,
      suggestedNextAction: suggestedNextAction || 'Create or confirm a follow-up action.',
    });
  }

  if (normalized.includes('what does memoire know')) {
    return response({
      answer: structuredAnswer({
        account: accountName,
        subjectLine,
        scopeNote,
        issue: 'Known account context',
        evidence,
        suggestedFix: suggestedNextAction || 'Capture the next customer update.',
        missingContext: [],
        nextAction: suggestedNextAction,
      }),
      context,
      suggestedNextAction,
    });
  }

  if (normalized.includes('blocking') || normalized.includes('block') || normalized.includes('objection')) {
    return response({
      answer: blockers.length > 0
        ? structuredAnswer({
            account: accountName,
            subjectLine,
            scopeNote,
            issue: 'Unresolved objection',
            evidence,
            suggestedFix: suggestedNextAction || 'Create a follow-up action to clarify the blocker.',
            missingContext: context.missingContext,
            nextAction: suggestedNextAction,
          })
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
    // A draft is text the operator sends. Greeting one customer over another
    // customer's objection is the one place this guess leaves the app, so
    // when the scope holds several customers it asks which one instead.
    if (!oneSubject) {
      return response({
        answer: `Pick a customer first - ${accounts.length} are in scope, and a draft addressed to one of them about another one's objection is worse than no draft. Choose the account in the context selector and ask again.`,
        context,
        suggestedNextAction: 'Select one account in the context selector, then ask for the draft.',
      });
    }
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
        ? structuredAnswer({
            account: accountName,
            subjectLine,
            scopeNote,
            issue: 'Missing context',
            evidence,
            suggestedFix: suggestedNextAction || 'Capture the next interaction or create a next action.',
            missingContext: context.missingContext,
            nextAction: suggestedNextAction,
          })
        : 'No major missing context detected in the selected memory.',
      context,
      suggestedNextAction: suggestedNextAction || 'Capture the next interaction or create a next action if this memory still feels incomplete.',
    });
  }

  if (normalized.includes('next') || normalized.includes('do')) {
    return response({
      answer: suggestedNextAction
        ? structuredAnswer({
            account: accountName,
            subjectLine,
            scopeNote,
            issue: blockers[0] ? 'Unresolved objection' : 'Follow-up ready',
            evidence,
            suggestedFix: suggestedNextAction,
            missingContext: context.missingContext,
            nextAction: suggestedNextAction,
          })
        : 'Memoire does not have an open next action in the selected memory.',
      context,
      suggestedNextAction: suggestedNextAction || 'Create a next action from the latest interaction.',
    });
  }

  if (normalized.includes('prepare')) {
    return response({
      answer: [
        subjectLine,
        ...evidence,
        openObjections.length > 0 ? `Open objections: ${openObjections.map((objection) => objection.title).join('; ')}` : '',
        scopeNote || '',
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

/**
 * The catch-all answer, for a question no preset matched.
 *
 * It used to open "Account: X." and then print `opportunities[0]`,
 * `interactions[0]` and the first open action beneath it, as one paragraph. The
 * four lists are sorted independently and nothing joins them, so with more than
 * one customer in scope those are four unrelated records wearing the grammar of
 * a single-customer briefing.
 *
 * Observed on a 19-customer workspace, asking "Which Dubai customers owe me
 * money right now?": the card answered "Account: Nordisk Storkokken A/S" - a
 * Danish account - followed by "Current opportunity: Newbuild galley outfitting
 * - hulls 4471 to 4474", which belongs to Bahri Ship Management. Two different
 * companies printed as one, under a heading that reads "Answer ready".
 *
 * The attribution cannot be repaired here: a deal carries its account by name
 * and `account_id` is not written. So the fix is to stop claiming the join. One
 * account in scope keeps the briefing voice, because there the join is real.
 * More than one, and every line says which list it is the top of.
 */
function summarizeContext(accounts: Account[], opportunities: Opportunity[], interactions: Interaction[], objections: Objection[], actions: SalesAction[]) {
  if (accounts.length === 0 && opportunities.length === 0 && interactions.length === 0) {
    return 'Memoire does not have enough context to answer confidently.';
  }

  const account = accounts[0];
  const opportunity = opportunities[0];
  const openAction = actions.find((action) => action.status === 'open');
  const objectionLine = objections.length > 0
    ? `Objections: ${objections.map((objection) => objection.title).join('; ')}`
    : '';

  const oneSubject = hasSingleSubject(accounts, opportunity);

  if (oneSubject) {
    return [
      account ? `Account: ${account.name}. ${account.summary || ''}` : '',
      // "at Proposal" reads; "at won" does not, because Won is not a place the
      // deal is sitting at - it is what happened to it.
      opportunity ? `Current opportunity: ${opportunity.title} — ${opportunity.stage}.` : '',
      interactions[0] ? `Last interaction: ${interactions[0].summary}` : '',
      objectionLine,
      openAction ? `Next action: ${openAction.title}` : '',
    ].filter(Boolean).join('\n');
  }

  return [
    `This is the whole workspace, not one customer: ${accounts.length} customers are in scope.`,
    opportunity ? `Most recently updated deal: ${opportunity.title} — ${opportunity.stage}.` : '',
    interactions[0] ? `Most recent interaction recorded: ${interactions[0].summary}` : '',
    objectionLine,
    openAction ? `Oldest open action: ${openAction.title}` : '',
    'Each line above is the top of its own list. Pick one customer in the context selector to get one story instead of four.',
  ].filter(Boolean).join('\n');
}

function structuredAnswer({
  account,
  subjectLine,
  issue,
  evidence,
  suggestedFix,
  missingContext,
  nextAction,
  scopeNote,
}: {
  account: string;
  // When the evidence spans more than one customer there is no single account
  // to put at the top, so the caller supplies a heading it can defend.
  subjectLine?: string;
  issue: string;
  evidence: string[];
  suggestedFix: string;
  missingContext: string[];
  nextAction?: string;
  scopeNote?: string;
}) {
  return [
    subjectLine || `Account: ${account}`,
    `Issue: ${issue}`,
    `Evidence:\n${evidence.length > 0 ? evidence.map((item) => `- ${item}`).join('\n') : '- No recent evidence captured.'}`,
    `Suggested fix: ${suggestedFix || 'Confirm the next follow-up.'}`,
    `Missing context:\n${missingContext.length > 0 ? missingContext.map((item) => `- ${item}`).join('\n') : '- No major missing context detected.'}`,
    `Next action: ${nextAction || suggestedFix || 'Create a follow-up action.'}`,
    scopeNote || '',
  ].filter(Boolean).join('\n\n');
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

/**
 * The questions the Ask page prints under "What this can answer".
 *
 * This is a promise made in the product's own words, and it used to live only
 * in JSX while the matchers that honour it lived in two other files. Five of
 * the eight reached no engine at all and fell through to the generic memory
 * answer - the one that cannot attribute evidence to a customer. Advertised
 * and unrouted is the worst pair of those two properties.
 *
 * They sit here so `routeForAdvertisedQuestion` can be asserted over the exact
 * strings the page renders, and the list and the routing cannot drift apart
 * again without a test going red.
 */
export const advertisedQuestions = [
  'Who needs follow-up?',
  'Where is money stuck?',
  'What changed this week?',
  'Summarize this account.',
  'Which opportunities have no next action?',
  'Which commitments are overdue?',
  'What am I waiting for from customers?',
  'What do I owe today?',
] as const;

/**
 * True when the question is one Memoire answers from a named engine rather
 * than from the generic memory fallback. "Summarize this account." is the
 * deliberate exception: summarizing IS the fallback's job, and with one account
 * in scope it does it honestly.
 */
export function isAttentionQuestion(question: string) {
  const normalized = question.toLowerCase();
  return [
    'what needs attention',
    'what needs attention today',
    'which accounts need attention',
    'which accounts need action',
    'which deals may go silent',
    'which accounts need follow-up',
    'which objections are unresolved',
    'what should i fix today',
    'stuck deals',
    'deals may go silent',
    'what should i focus on',
    'which deals are broken',
    'which accounts are broken',
    'show stuck deals',
    'what are my stuck deals',
    'which deals are missing next actions',
    'missing next actions',
    // Printed verbatim in the advertised list and previously unrouted.
    'who needs follow-up',
    'who needs follow up',
    'needs follow-up',
    'needs follow up',
    'no next action',
    'no next step',
    'without a next action',
  ].some((pattern) => normalized.includes(pattern));
}

export function isWhatChangedQuestion(question: string) {
  const normalized = question.toLowerCase();
  return normalized.includes('what changed') || normalized.includes('changed recently');
}

export function isPatternQuestion(question: string) {
  const normalized = question.toLowerCase();
  return normalized.includes('pattern') || normalized.includes('sales activity');
}

/**
 * Whether the scope holds one customer, so a single-customer briefing is a
 * claim the data supports.
 *
 * A deal carries its account by name and `account_id` is not written, so the
 * join between an account and an opportunity cannot be repaired - only
 * refused. Three separate places had grown their own copy of this test
 * (`summarizeContext`, `answerFromMemory`, and the answer-card builder), and
 * the card builder - the copy the operator actually sees - never had one:
 * "Recipient: Grupo Calvo" printed above another customer's interaction in the
 * card for a draft about to be sent. One test, one answer.
 */
export function hasSingleSubject(
  accounts: { id: string }[],
  opportunity?: { account_id?: string | null } | null,
): boolean {
  if (accounts.length > 1) return false;
  const account = accounts[0];
  return !opportunity || !account || !opportunity.account_id || opportunity.account_id === account.id;
}
