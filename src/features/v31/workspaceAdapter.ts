import type {
  Account,
  Contact,
  Interaction,
  Objection,
  ObjectionCategory,
  ObjectionSeverity,
  ObjectionStatus,
  Opportunity,
  SalesAction,
  SalesPriority,
  SalesStage,
} from '../../types/v31';
import type { SalesWorkspaceData } from '../../services/workspaceData';
import type { CrmLiteOpportunity } from '../../services/opportunityStore';
import type { SalesActivityRecord } from '../../services/salesActivityStore';
import type { ObjectionRecord } from '../../services/objectionStore';
import { compareSafeBusinessDate, sanitizeBusinessDate } from '../../utils/safeDate.ts';

export type V31WorkspaceMemory = {
  accounts: Account[];
  contacts: Contact[];
  opportunities: Opportunity[];
  interactions: Interaction[];
  actions: SalesAction[];
  objections: Objection[];
};

export function adaptWorkspaceToV31(workspace: SalesWorkspaceData, userId: string): V31WorkspaceMemory {
  const accountIdByName = new Map(
    workspace.accounts.map((account) => [normalize(account.accountName), account.id]),
  );
  const opportunityById = new Map(workspace.opportunities.map((opportunity) => [opportunity.id, opportunity]));
  const opportunityIdByName = new Map(
    workspace.opportunities.map((opportunity) => [
      `${normalize(opportunity.accountName)}::${normalize(opportunity.opportunityName)}`,
      opportunity.id,
    ]),
  );

  const accounts = workspace.accounts.map<Account>((account) => {
    const accountActivities = workspace.activities.filter((activity) => sameName(getActivityAccount(activity), account.accountName));
    const accountObjections = workspace.objections.filter((objection) => sameName(objection.accountName, account.accountName));

    return {
      id: account.id,
      user_id: userId,
      name: account.accountName,
      summary: account.notes || null,
      industry: account.industry || null,
      status: account.relationshipStatus === 'Dormant' ? 'inactive' : 'active',
      pain_points: unique(accountActivities.flatMap((activity) => activity.risks || [])),
      objections: unique(accountObjections.map((objection) => objection.objectionText)),
      source_capture_id: null,
      created_at: account.createdAt,
      updated_at: account.updatedAt,
    };
  });

  const contacts = workspace.stakeholders.map<Contact>((stakeholder) => ({
    id: stakeholder.id,
    user_id: userId,
    account_id: stakeholder.accountId || accountIdByName.get(normalize(stakeholder.accountName)) || null,
    name: stakeholder.name,
    role: stakeholder.roleTitle || stakeholder.stakeholderRole || null,
    email: stakeholder.email || null,
    phone: stakeholder.phone || null,
    notes: stakeholder.notes || null,
    source_capture_id: null,
    created_at: stakeholder.createdAt,
    updated_at: stakeholder.updatedAt,
  }));

  const opportunities = workspace.opportunities.map<Opportunity>((opportunity) => {
    const accountId = accountIdByName.get(normalize(opportunity.accountName)) || null;
    const account = accounts.find((item) => item.id === accountId) || null;
    const lastActivity = getLatestActivityForOpportunity(workspace.activities, opportunity);

    return {
      id: opportunity.id,
      user_id: userId,
      account_id: accountId,
      contact_id: null,
      title: opportunity.opportunityName,
      stage: toLegacyStage(opportunity.stage),
      estimated_value: opportunity.estimatedValue,
      blocker: opportunity.objectionDebt || opportunity.missingContext || null,
      next_action_text: opportunity.nextAction || null,
      last_touch_at: lastActivity ? toTimestamp(lastActivity.activityDate, lastActivity.updatedAt) : null,
      urgency: toPriority(opportunity),
      confidence: toConfidence(opportunity),
      source_capture_id: null,
      created_at: opportunity.createdAt,
      updated_at: opportunity.updatedAt,
      account: account ? { id: account.id, name: account.name } : null,
      contact: null,
    };
  });

  const interactions = workspace.activities.map<Interaction>((activity) => {
    const accountName = getActivityAccount(activity);
    const accountId = accountIdByName.get(normalize(accountName)) || null;
    const opportunityId = activity.linkedOpportunityId
      || opportunityIdByName.get(`${normalize(accountName)}::${normalize(activity.opportunityName)}`)
      || null;

    return {
      id: activity.id,
      user_id: userId,
      account_id: accountId,
      contact_id: null,
      opportunity_id: opportunityId,
      source_capture_id: null,
      interaction_type: toInteractionType(activity),
      occurred_at: toTimestamp(activity.activityDate, activity.createdAt),
      summary: activity.summary,
      pain_point: activity.risks?.[0] || null,
      objection: activity.risks?.join('; ') || null,
      raw_note: activity.rawNote,
      structured_data: {
        accountName,
        opportunityName: activity.linkedOpportunityName || activity.opportunityName,
        contactName: activity.contactName || activity.stakeholderName || '',
        competitors: activity.competitors || [],
        buyingSignals: activity.buyingSignals || [],
        timelineSignals: activity.timelineSignals || [],
      },
      created_at: activity.createdAt,
    };
  });

  const activityActions = workspace.activities.flatMap<SalesAction>((activity) => {
    const accountName = getActivityAccount(activity);
    const accountId = accountIdByName.get(normalize(accountName)) || null;
    const opportunityId = activity.linkedOpportunityId
      || opportunityIdByName.get(`${normalize(accountName)}::${normalize(activity.opportunityName)}`)
      || null;
    const opportunity = opportunityId ? opportunities.find((item) => item.id === opportunityId) || null : null;
    const account = accountId ? accounts.find((item) => item.id === accountId) || null : null;
    const candidates = activity.nextActions?.length
      ? activity.nextActions
      : activity.nextAction
        ? [{ title: activity.nextAction, dueDate: activity.dueDate || undefined }]
        : [];

    return candidates.map((action, index) => ({
      id: `${activity.id}-action-${index + 1}`,
      user_id: userId,
      account_id: accountId,
      contact_id: null,
      opportunity_id: opportunityId,
      interaction_id: activity.id,
      title: action.title,
      due_date: sanitizeBusinessDate(action.dueDate) || null,
      status: 'open',
      suggested: false,
      source: 'capture',
      created_at: activity.createdAt,
      updated_at: activity.updatedAt,
      account: account ? { id: account.id, name: account.name } : null,
      contact: null,
      opportunity: opportunity ? { id: opportunity.id, title: opportunity.title, stage: opportunity.stage } : null,
    }));
  });

  const opportunityActions = workspace.opportunities
    .filter((opportunity) => opportunity.nextAction)
    .map<SalesAction>((opportunity) => {
      const accountId = accountIdByName.get(normalize(opportunity.accountName)) || null;
      const account = accountId ? accounts.find((item) => item.id === accountId) || null : null;
      const legacyOpportunity = opportunities.find((item) => item.id === opportunity.id) || null;

      return {
        id: `${opportunity.id}-next-action`,
        user_id: userId,
        account_id: accountId,
        contact_id: null,
        opportunity_id: opportunity.id,
        interaction_id: null,
        title: opportunity.nextAction,
        due_date: sanitizeBusinessDate(opportunity.nextActionDate) || null,
        status: 'open',
        suggested: false,
        source: 'manual',
        created_at: opportunity.createdAt,
        updated_at: opportunity.updatedAt,
        account: account ? { id: account.id, name: account.name } : null,
        contact: null,
        opportunity: legacyOpportunity
          ? { id: legacyOpportunity.id, title: legacyOpportunity.title, stage: legacyOpportunity.stage }
          : null,
      };
    });

  const objections = workspace.objections.map<Objection>((objection) => {
    const accountId = objection.accountId || accountIdByName.get(normalize(objection.accountName)) || '';
    const opportunityId = objection.opportunityId
      || opportunityIdByName.get(`${normalize(objection.accountName)}::${normalize(objection.opportunityName)}`)
      || null;
    const opportunity = opportunityId ? opportunityById.get(opportunityId) : null;

    return {
      id: objection.id,
      user_id: userId,
      account_id: accountId,
      opportunity_id: opportunityId,
      contact_id: null,
      source_interaction_id: objection.sourceActivityId || null,
      title: objection.objectionText,
      detail: objection.requiredProof || objection.responsePlan || null,
      category: toObjectionCategory(objection),
      status: toObjectionStatus(objection.status),
      severity: toObjectionSeverity(objection.impact),
      response_angle: objection.responsePlan || null,
      linked_action_id: null,
      first_mentioned_at: objection.createdAt,
      last_mentioned_at: objection.updatedAt,
      created_at: objection.createdAt,
      updated_at: objection.updatedAt,
      linked_action: null,
      opportunity: opportunity
        ? { id: opportunity.id, title: opportunity.opportunityName, stage: toLegacyStage(opportunity.stage) }
        : null,
      contact: null,
    };
  });

  return {
    accounts,
    contacts,
    opportunities,
    interactions,
    actions: dedupeActions([...activityActions, ...opportunityActions]),
    objections,
  };
}

function getActivityAccount(activity: SalesActivityRecord) {
  return activity.linkedAccountName || activity.accountName;
}

function getLatestActivityForOpportunity(activities: SalesActivityRecord[], opportunity: CrmLiteOpportunity) {
  return activities
    .filter((activity) => (
      activity.linkedOpportunityId === opportunity.id
      || (
        sameName(getActivityAccount(activity), opportunity.accountName)
        && sameName(activity.linkedOpportunityName || activity.opportunityName, opportunity.opportunityName)
      )
    ))
    .sort((left, right) => compareSafeBusinessDate(right.activityDate, left.activityDate) || right.updatedAt.localeCompare(left.updatedAt))[0];
}

function toLegacyStage(stage: CrmLiteOpportunity['stage']): SalesStage {
  if (stage === 'Lead') return 'new';
  if (stage === 'Proposal') return 'proposal';
  if (stage === 'Negotiation' || stage === 'Procurement') return 'negotiation';
  if (stage === 'Won') return 'won';
  if (stage === 'Lost') return 'lost';
  if (stage === 'On hold') return 'paused';
  return 'active';
}

function toPriority(opportunity: CrmLiteOpportunity): SalesPriority {
  if (opportunity.decisionRecommendation === 'Rescue' || opportunity.decisionRecommendation === 'Downgrade') return 'high';
  if (opportunity.decisionRecommendation === 'Deprioritize') return 'low';
  return 'medium';
}

function toConfidence(opportunity: CrmLiteOpportunity): SalesPriority {
  if (opportunity.forecastEvidenceCategory === 'Defensible') return 'high';
  if (opportunity.forecastEvidenceCategory === 'Unsupported') return 'low';
  return 'medium';
}

function toInteractionType(activity: SalesActivityRecord): Interaction['interaction_type'] {
  if (activity.activityType === 'Customer meeting' || activity.activityType === 'Demo / technical discussion') return 'meeting';
  if (activity.activityType === 'Quote / proposal') return 'proposal';
  if (activity.activityType === 'Follow-up') return 'call';
  return 'note';
}

function toObjectionCategory(objection: ObjectionRecord): ObjectionCategory {
  const category = objection.objectionType;
  if (category === 'Price') return 'price';
  if (category === 'Lead time' || category === 'Timing' || category === 'Procurement') return 'timeline';
  if (category === 'Local support') return 'support';
  if (category === 'Technical fit') return 'product_fit';
  if (category === 'Documentation' || category === 'Compliance / validation') return 'compliance';
  if (category === 'Competitor') return 'competitor';
  if (category === 'Budget') return 'budget';
  return 'other';
}

function toObjectionStatus(status: ObjectionRecord['status']): ObjectionStatus {
  if (status === 'Addressed') return 'addressed';
  if (status === 'Resolved') return 'resolved';
  if (status === 'Parked') return 'dismissed';
  return 'open';
}

function toObjectionSeverity(impact: ObjectionRecord['impact']): ObjectionSeverity {
  if (impact === 'High') return 'high';
  if (impact === 'Low') return 'low';
  return 'medium';
}

function toTimestamp(dateKey: string, fallback: string) {
  const safeDate = sanitizeBusinessDate(dateKey);
  return safeDate ? `${safeDate}T12:00:00.000Z` : fallback;
}

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function sameName(left: string, right: string) {
  return Boolean(left && right && normalize(left) === normalize(right));
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function dedupeActions(actions: SalesAction[]) {
  const seen = new Set<string>();
  return actions.filter((action) => {
    const key = `${action.opportunity_id || action.account_id || ''}::${normalize(action.title)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
