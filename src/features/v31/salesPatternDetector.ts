import type { Account, Interaction, Objection, Opportunity, SalesAction, SalesPattern } from '../../types/v31';

interface SalesPatternInput {
  accounts: Account[];
  opportunities: Opportunity[];
  interactions: Interaction[];
  actions: SalesAction[];
  objections?: Objection[];
  staleDays?: number;
}

const activeStages = ['new', 'active', 'proposal', 'negotiation', 'paused'];
const severityRank: Record<SalesPattern['severity'], number> = { high: 0, medium: 1, low: 2 };

export function detectSalesPatterns({
  accounts,
  opportunities,
  interactions,
  actions,
  objections = [],
  staleDays = 14,
}: SalesPatternInput): SalesPattern[] {
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const openActions = actions.filter((action) => action.status === 'open');
  const staleCutoff = new Date();
  staleCutoff.setDate(staleCutoff.getDate() - staleDays);
  const patterns: SalesPattern[] = [];

  const proposalMomentumLoss = opportunities.filter((opportunity) => {
    if (!['proposal', 'negotiation'].includes(opportunity.stage)) return false;
    const datedAction = openActions.find((action) => action.opportunity_id === opportunity.id && action.due_date);
    const latestInteraction = latestByDate(
      interactions.filter((interaction) => interaction.opportunity_id === opportunity.id || interaction.account_id === opportunity.account_id),
      (interaction) => interaction.occurred_at
    );
    const lastTouch = opportunity.last_touch_at || latestInteraction?.occurred_at;
    return !datedAction || !lastTouch || new Date(lastTouch) < staleCutoff;
  });

  if (proposalMomentumLoss.length >= 2) {
    patterns.push({
      id: 'proposal-momentum-loss',
      type: 'proposal_momentum_loss',
      title: 'Proposal Momentum Loss',
      insight: 'You may be losing momentum after proposal stage because some deals do not have clear dated next actions.',
      evidence: proposalMomentumLoss.slice(0, 4).map((opportunity) => evidenceName(opportunity.title, accountById.get(opportunity.account_id || '')?.name)),
      affectedEntityIds: proposalMomentumLoss.map((opportunity) => opportunity.id),
      severity: proposalMomentumLoss.length >= 3 ? 'high' : 'medium',
      suggestedBehavior: 'After sending a proposal, always create a dated follow-up action.',
      createdAt: new Date().toISOString(),
    });
  }

  const objectionsByCategory = groupBy(
    objections.filter((objection) => objection.status === 'open'),
    (objection) => objection.category
  );
  Object.entries(objectionsByCategory).forEach(([category, categoryObjections]) => {
    if (categoryObjections.length < 2) return;
    patterns.push({
      id: `objection-cluster-${category}`,
      type: 'objection_cluster',
      title: 'Objection Cluster',
      insight: `Most recent open objections are about ${category}.`,
      evidence: categoryObjections.slice(0, 4).map((objection) => evidenceName(objection.title, accountById.get(objection.account_id)?.name)),
      affectedEntityIds: categoryObjections.map((objection) => objection.id),
      severity: categoryObjections.some((objection) => objection.severity === 'high') || categoryObjections.length >= 3 ? 'high' : 'medium',
      suggestedBehavior: 'Prepare a reusable response angle or proof point for this objection.',
      createdAt: new Date().toISOString(),
    });
  });

  const capturedWithoutAction = interactions.filter((interaction) => {
    if (!interaction.source_capture_id) return false;
    return !openActions.some((action) => action.interaction_id === interaction.id);
  });
  if (capturedWithoutAction.length >= 2) {
    patterns.push({
      id: 'capture-without-action',
      type: 'capture_without_action',
      title: 'Capture Without Action',
      insight: 'Some captured interactions are not being converted into actions.',
      evidence: capturedWithoutAction.slice(0, 4).map((interaction) => evidenceName(interaction.summary, accountById.get(interaction.account_id || '')?.name)),
      affectedEntityIds: capturedWithoutAction.map((interaction) => interaction.id),
      severity: capturedWithoutAction.length >= 4 ? 'high' : 'medium',
      suggestedBehavior: 'After every customer interaction, define one next action before closing the note.',
      createdAt: new Date().toISOString(),
    });
  }

  const staleAfterFirstMeeting = accounts.filter((account) => {
    const accountInteractions = interactions
      .filter((interaction) => interaction.account_id === account.id)
      .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
    const firstInteraction = accountInteractions[0];
    const latestInteraction = accountInteractions[accountInteractions.length - 1];
    const hasFollowUpAction = openActions.some((action) => action.account_id === account.id);
    const firstWasMeeting = firstInteraction && ['meeting', 'call'].includes(firstInteraction.interaction_type);
    const latestIsStale = !latestInteraction || new Date(latestInteraction.occurred_at) < staleCutoff;
    return Boolean(firstWasMeeting && new Date(firstInteraction.occurred_at) < staleCutoff && !hasFollowUpAction && latestIsStale);
  });

  if (staleAfterFirstMeeting.length >= 2) {
    patterns.push({
      id: 'stale-after-first-meeting',
      type: 'stale_after_first_meeting',
      title: 'Stale After First Meeting',
      insight: 'Several accounts become stale after the first meeting.',
      evidence: staleAfterFirstMeeting.slice(0, 4).map((account) => account.name),
      affectedEntityIds: staleAfterFirstMeeting.map((account) => account.id),
      severity: staleAfterFirstMeeting.length >= 3 ? 'high' : 'medium',
      suggestedBehavior: 'Create a follow-up action immediately after the first meeting.',
      createdAt: new Date().toISOString(),
    });
  }

  const missingDecisionContext = opportunities.filter((opportunity) => {
    if (!activeStages.includes(opportunity.stage)) return false;
    const opportunityInteractions = interactions.filter((interaction) => (
      interaction.opportunity_id === opportunity.id || interaction.account_id === opportunity.account_id
    ));
    const opportunityObjections = objections.filter((objection) => (
      objection.opportunity_id === opportunity.id || objection.account_id === opportunity.account_id
    ));
    return !hasDecisionSignal(opportunity, opportunityInteractions, opportunityObjections);
  });

  if (missingDecisionContext.length >= 2) {
    patterns.push({
      id: 'missing-decision-context',
      type: 'missing_decision_context',
      title: 'Missing Decision Context',
      insight: 'Many active opportunities are missing decision context.',
      evidence: missingDecisionContext.slice(0, 4).map((opportunity) => evidenceName(opportunity.title, accountById.get(opportunity.account_id || '')?.name)),
      affectedEntityIds: missingDecisionContext.map((opportunity) => opportunity.id),
      severity: missingDecisionContext.length >= 4 ? 'high' : 'medium',
      suggestedBehavior: 'Ask about approval process and decision timeline earlier in the sales conversation.',
      createdAt: new Date().toISOString(),
    });
  }

  return patterns.sort((a, b) => (
    severityRank[a.severity] - severityRank[b.severity]
    || b.affectedEntityIds.length - a.affectedEntityIds.length
    || a.title.localeCompare(b.title)
  ));
}

export function salesPatternSeverityLabel(severity: SalesPattern['severity']) {
  if (severity === 'high') return 'High';
  if (severity === 'medium') return 'Medium';
  return 'Low';
}

function latestByDate<T>(items: T[], getDate: (item: T) => string | null | undefined) {
  return items.reduce<T | null>((latest, item) => {
    const itemDate = getDate(item) || '';
    const latestDate = latest ? getDate(latest) || '' : '';
    return !latest || itemDate > latestDate ? item : latest;
  }, null);
}

function groupBy<T>(items: T[], getKey: (item: T) => string) {
  return items.reduce<Record<string, T[]>>((result, item) => {
    const key = getKey(item);
    result[key] = result[key] || [];
    result[key].push(item);
    return result;
  }, {});
}

function evidenceName(name: string, parentName?: string) {
  return parentName ? `${parentName}: ${name}` : name;
}

function hasDecisionSignal(opportunity: Opportunity, interactions: Interaction[], objections: Objection[]) {
  const decisionWords = ['decision', 'timeline', 'approval', 'authority', 'budget', 'procurement', 'sign off', 'sign-off'];
  const text = [
    opportunity.blocker,
    opportunity.next_action_text,
    ...interactions.flatMap((interaction) => [interaction.summary, interaction.pain_point, interaction.objection]),
    ...objections.flatMap((objection) => [objection.title, objection.detail, objection.category]),
  ].filter(Boolean).join(' ').toLowerCase();
  return decisionWords.some((word) => text.includes(word));
}
