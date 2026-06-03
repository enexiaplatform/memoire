import type { CrmLiteOpportunity } from '../services/opportunityStore';
import type { ObjectionRecord } from '../services/objectionStore';
import type { SalesActivityRecord } from '../services/salesActivityStore';
import type { StakeholderRecord } from '../services/stakeholderStore';
import { getObjectionsForOpportunity } from './objectionLedger';
import { getStakeholdersForOpportunity } from './stakeholderGraph';
import { formatCurrencyAmount } from './currency';

export type MeddicLiteFieldKey =
  | 'metrics'
  | 'economicBuyer'
  | 'decisionCriteria'
  | 'decisionProcess'
  | 'identifyPain'
  | 'champion'
  | 'competition';

export type MeddicLiteStatus = 'Strong' | 'Partial' | 'Missing';

export type MeddicLiteFieldReview = {
  key: MeddicLiteFieldKey;
  label: string;
  status: MeddicLiteStatus;
  evidence: string[];
  gaps: string[];
  recommendedQuestions: string[];
};

export type MeddicLiteDealCategory =
  | 'Defensible'
  | 'Weak but recoverable'
  | 'Hope-based'
  | 'Unsupported';

export type MeddicLiteReview = {
  opportunityId: string;
  accountName: string;
  opportunityName: string;
  category: MeddicLiteDealCategory;
  fields: MeddicLiteFieldReview[];
  gaps: string[];
  recommendedQuestions: string[];
  recommendedActions: string[];
  defenseAnswer: string;
};

export type MeddicLitePipelineRiskSummary = {
  totalOpportunities: number;
  missingChampionCount: number;
  missingEconomicBuyerCount: number;
  decisionProcessGapCount: number;
  unsupportedCount: number;
  hopeBasedCount: number;
  topRisks: {
    opportunityId: string;
    accountName: string;
    opportunityName: string;
    category: MeddicLiteDealCategory;
    gaps: string[];
  }[];
};

export function analyzeMeddicLiteOpportunity(input: {
  opportunity: CrmLiteOpportunity;
  stakeholders?: StakeholderRecord[];
  objections?: ObjectionRecord[];
  activities?: SalesActivityRecord[];
}): MeddicLiteReview {
  const opportunity = input.opportunity;
  const relatedStakeholders = getRelatedStakeholders(opportunity, input.stakeholders || []);
  const relatedObjections = getRelatedObjections(opportunity, input.objections || []);
  const relatedActivities = getRelatedActivities(opportunity, input.activities || []);

  const fields = [
    reviewMetrics(opportunity, relatedActivities),
    reviewEconomicBuyer(opportunity, relatedStakeholders),
    reviewDecisionCriteria(opportunity),
    reviewDecisionProcess(opportunity),
    reviewIdentifyPain(opportunity, relatedObjections, relatedActivities),
    reviewChampion(relatedStakeholders),
    reviewCompetition(opportunity, relatedObjections, relatedActivities),
  ];

  const gaps = dedupe(fields.flatMap((field) => field.gaps));
  const recommendedQuestions = dedupe(fields.flatMap((field) => field.recommendedQuestions)).slice(0, 8);
  const category = deriveDealCategory(opportunity, fields, relatedObjections);
  const recommendedActions = buildRecommendedActions(opportunity, fields, relatedObjections).slice(0, 6);

  return {
    opportunityId: opportunity.id,
    accountName: opportunity.accountName,
    opportunityName: opportunity.opportunityName,
    category,
    fields,
    gaps,
    recommendedQuestions,
    recommendedActions,
    defenseAnswer: buildDefenseAnswer(opportunity, category, gaps, recommendedActions),
  };
}

export function analyzeMeddicLitePipeline(input: {
  opportunities: CrmLiteOpportunity[];
  stakeholders?: StakeholderRecord[];
  objections?: ObjectionRecord[];
  activities?: SalesActivityRecord[];
}): MeddicLitePipelineRiskSummary {
  const reviews = input.opportunities
    .filter((opportunity) => opportunity.status === 'Active')
    .map((opportunity) => analyzeMeddicLiteOpportunity({
      opportunity,
      stakeholders: input.stakeholders || [],
      objections: input.objections || [],
      activities: input.activities || [],
    }));

  return {
    totalOpportunities: reviews.length,
    missingChampionCount: reviews.filter((review) => fieldStatus(review, 'champion') === 'Missing').length,
    missingEconomicBuyerCount: reviews.filter((review) => fieldStatus(review, 'economicBuyer') === 'Missing').length,
    decisionProcessGapCount: reviews.filter((review) => fieldStatus(review, 'decisionProcess') !== 'Strong').length,
    unsupportedCount: reviews.filter((review) => review.category === 'Unsupported').length,
    hopeBasedCount: reviews.filter((review) => review.category === 'Hope-based').length,
    topRisks: reviews
      .filter((review) => review.category !== 'Defensible')
      .sort((a, b) => categoryRank(b.category) - categoryRank(a.category))
      .slice(0, 5)
      .map((review) => ({
        opportunityId: review.opportunityId,
        accountName: review.accountName,
        opportunityName: review.opportunityName,
        category: review.category,
        gaps: review.gaps.slice(0, 3),
      })),
  };
}

export function getMeddicLiteGapsSummary(review: MeddicLiteReview) {
  if (review.gaps.length === 0) return 'No major MEDDIC-lite gaps detected.';
  return `MEDDIC-lite gaps: ${review.gaps.slice(0, 6).join('; ')}.`;
}

export function getMeddicLiteDefenseAnswer(review: MeddicLiteReview) {
  return review.defenseAnswer;
}

function reviewMetrics(opportunity: CrmLiteOpportunity, activities: SalesActivityRecord[]): MeddicLiteFieldReview {
  const buyingSignals = dedupe(activities.flatMap((activity) => activity.buyingSignals || []));
  const timelineSignals = dedupe(activities.flatMap((activity) => activity.timelineSignals || []));
  const evidence: string[] = [];
  if (opportunity.estimatedValue) evidence.push(`Estimated value: ${formatCurrencyAmount(opportunity.estimatedValue, opportunity.currency)}.`);
  if (hasStrongSignal(opportunity.evidence)) evidence.push(firstSentence(opportunity.evidence));
  if (buyingSignals.length > 0) evidence.push(`Buying signals: ${buyingSignals.slice(0, 3).join(', ')}.`);
  if (timelineSignals.length > 0) evidence.push(`Timeline signals: ${timelineSignals.slice(0, 2).join(', ')}.`);

  const hasMetric = Boolean(opportunity.estimatedValue || buyingSignals.length > 0 || hasStrongSignal(opportunity.evidence));
  const hasImpact = businessImpactTerms.test(opportunity.evidence) || businessImpactTerms.test(opportunity.productOrSolution);

  return {
    key: 'metrics',
    label: 'Metrics',
    status: hasMetric && hasImpact ? 'Strong' : hasMetric ? 'Partial' : 'Missing',
    evidence: evidence.length > 0 ? evidence : ['No measurable business impact or value proof captured yet.'],
    gaps: [
      !hasMetric ? 'No measurable business impact captured.' : '',
      !hasImpact ? 'Business impact is not explicit.' : '',
    ].filter(Boolean),
    recommendedQuestions: [
      'What measurable business impact does the customer expect from this project?',
      'What happens if this problem is not solved this quarter?',
    ],
  };
}

function reviewEconomicBuyer(opportunity: CrmLiteOpportunity, stakeholders: StakeholderRecord[]): MeddicLiteFieldReview {
  const buyers = stakeholders.filter((stakeholder) => stakeholder.stakeholderRole === 'Economic buyer' || stakeholder.stakeholderRole === 'Decision maker');
  const evidence = [
    ...buyers.map((buyer) => `${buyer.name} mapped as ${buyer.stakeholderRole}.`),
    opportunity.budgetOwner ? `Budget owner: ${opportunity.budgetOwner}.` : '',
    opportunity.decisionMaker ? `Decision maker field: ${opportunity.decisionMaker}.` : '',
  ].filter(Boolean);

  const status: MeddicLiteStatus = buyers.length > 0
    ? 'Strong'
    : opportunity.budgetOwner || opportunity.decisionMaker
      ? 'Partial'
      : 'Missing';

  return {
    key: 'economicBuyer',
    label: 'Economic Buyer',
    status,
    evidence: evidence.length > 0 ? evidence : ['No economic buyer or decision owner is mapped.'],
    gaps: status === 'Missing' ? ['Economic buyer not mapped.'] : status === 'Partial' ? ['Economic buyer should be validated as a real buying authority.'] : [],
    recommendedQuestions: [
      'Who owns the final budget approval?',
      'Who can say yes without needing another approval layer?',
    ],
  };
}

function reviewDecisionCriteria(opportunity: CrmLiteOpportunity): MeddicLiteFieldReview {
  const hasCriteria = Boolean(opportunity.technicalCriteria.trim());
  const evidence = [
    hasCriteria ? opportunity.technicalCriteria : '',
    criteriaTerms.test(opportunity.evidence) ? `Evidence mentions criteria/proof: ${firstSentence(opportunity.evidence)}` : '',
  ].filter(Boolean);

  return {
    key: 'decisionCriteria',
    label: 'Decision Criteria',
    status: hasCriteria && evidence.length > 1 ? 'Strong' : hasCriteria ? 'Partial' : 'Missing',
    evidence: evidence.length > 0 ? evidence : ['No decision criteria captured.'],
    gaps: hasCriteria ? [] : ['Decision criteria unclear.'],
    recommendedQuestions: [
      'What technical criteria will be used to compare vendors?',
      'What proof would make our solution the safest choice?',
    ],
  };
}

function reviewDecisionProcess(opportunity: CrmLiteOpportunity): MeddicLiteFieldReview {
  const hasProcess = Boolean(opportunity.procurementPath.trim());
  const hasTiming = Boolean(opportunity.expectedClosePeriod.trim());
  const evidence = [
    hasProcess ? `Process: ${opportunity.procurementPath}.` : '',
    hasTiming ? `Timing: ${opportunity.expectedClosePeriod}.` : '',
  ].filter(Boolean);

  return {
    key: 'decisionProcess',
    label: 'Decision Process',
    status: hasProcess && hasTiming ? 'Strong' : hasProcess || hasTiming ? 'Partial' : 'Missing',
    evidence: evidence.length > 0 ? evidence : ['No decision process or timing captured.'],
    gaps: [
      !hasProcess ? 'Decision process unclear.' : '',
      !hasTiming ? 'Close timing not confirmed.' : '',
      !opportunity.nextAction ? 'No next customer action confirmed.' : '',
    ].filter(Boolean),
    recommendedQuestions: [
      'What are the exact steps from current stage to PO?',
      'What date or milestone controls the decision?',
    ],
  };
}

function reviewIdentifyPain(
  opportunity: CrmLiteOpportunity,
  objections: ObjectionRecord[],
  activities: SalesActivityRecord[],
): MeddicLiteFieldReview {
  const openObjections = objections.filter((objection) => objection.status === 'Open');
  const risks = dedupe(activities.flatMap((activity) => activity.risks || []));
  const evidence = [
    opportunity.objectionDebt ? `Legacy objection debt: ${firstSentence(opportunity.objectionDebt)}` : '',
    opportunity.missingContext ? `Missing context: ${firstSentence(opportunity.missingContext)}` : '',
    ...openObjections.slice(0, 3).map((objection) => `${objection.objectionType}: ${objection.objectionText}`),
    risks.length > 0 ? `Captured risks: ${risks.slice(0, 3).join(', ')}.` : '',
  ].filter(Boolean);

  const hasPain = evidence.length > 0;
  const highImpactOpen = openObjections.some((objection) => objection.impact === 'High');

  return {
    key: 'identifyPain',
    label: 'Identify Pain',
    status: hasPain && !highImpactOpen ? 'Strong' : hasPain ? 'Partial' : 'Missing',
    evidence: evidence.length > 0 ? evidence : ['No explicit pain, risk, or objection has been captured.'],
    gaps: [
      !hasPain ? 'Pain is not strongly evidenced.' : '',
      highImpactOpen ? 'High-impact objection is still open.' : '',
    ].filter(Boolean),
    recommendedQuestions: [
      'What customer pain is urgent enough to create action now?',
      'What proof is needed to neutralize the current objection?',
    ],
  };
}

function reviewChampion(stakeholders: StakeholderRecord[]): MeddicLiteFieldReview {
  const champions = stakeholders.filter((stakeholder) => stakeholder.stakeholderRole === 'Champion');
  const supportive = stakeholders.filter((stakeholder) => stakeholder.stance === 'Supportive');
  const evidence = [
    ...champions.map((champion) => `${champion.name} mapped as Champion.`),
    ...supportive.slice(0, 2).map((stakeholder) => `${stakeholder.name} is supportive.`),
  ];

  return {
    key: 'champion',
    label: 'Champion',
    status: champions.length > 0 ? 'Strong' : supportive.length > 0 ? 'Partial' : 'Missing',
    evidence: evidence.length > 0 ? evidence : ['No champion or supportive stakeholder mapped.'],
    gaps: champions.length > 0 ? [] : ['No champion identified.'],
    recommendedQuestions: [
      'Who is willing to support us internally when we are not in the room?',
      'What would make this stakeholder comfortable championing the project?',
    ],
  };
}

function reviewCompetition(
  opportunity: CrmLiteOpportunity,
  objections: ObjectionRecord[],
  activities: SalesActivityRecord[],
): MeddicLiteFieldReview {
  const activityCompetitors = dedupe(activities.flatMap((activity) => activity.competitors || []));
  const competitorObjections = objections.filter((objection) => objection.objectionType === 'Competitor');
  const textCompetitors = extractCompetitorMentions(`${opportunity.evidence} ${opportunity.objectionDebt} ${opportunity.missingContext}`);
  const competitors = dedupe([...activityCompetitors, ...textCompetitors]);
  const hasResponsePlan = competitorObjections.some((objection) => objection.responsePlan || objection.requiredProof)
    || /differentiator|competitive|compare|comparison|advantage|proof/i.test(`${opportunity.evidence} ${opportunity.nextAction}`);

  const evidence = [
    competitors.length > 0 ? `Competitors mentioned: ${competitors.join(', ')}.` : '',
    ...competitorObjections.slice(0, 2).map((objection) => `Ledger: ${objection.objectionText}`),
    hasResponsePlan ? 'A response plan or differentiator proof is captured.' : '',
  ].filter(Boolean);

  return {
    key: 'competition',
    label: 'Competition',
    status: competitors.length === 0 ? 'Partial' : hasResponsePlan ? 'Strong' : 'Partial',
    evidence: evidence.length > 0 ? evidence : ['No active competitor captured.'],
    gaps: competitors.length > 0 && !hasResponsePlan ? ['Competitor present but no response plan captured.'] : [],
    recommendedQuestions: [
      'Which alternative vendor or status quo are we competing against?',
      'What proof differentiates us for this account?',
    ],
  };
}

function deriveDealCategory(
  opportunity: CrmLiteOpportunity,
  fields: MeddicLiteFieldReview[],
  objections: ObjectionRecord[],
): MeddicLiteDealCategory {
  const missingCore = ['economicBuyer', 'decisionProcess', 'champion'].filter((key) => fieldStatus({ fields } as MeddicLiteReview, key as MeddicLiteFieldKey) === 'Missing').length;
  const strongCore = ['economicBuyer', 'decisionProcess', 'champion', 'decisionCriteria'].filter((key) => fieldStatus({ fields } as MeddicLiteReview, key as MeddicLiteFieldKey) === 'Strong').length;
  const highOpenObjection = objections.some((objection) => objection.status === 'Open' && objection.impact === 'High');
  const noNextAction = !opportunity.nextAction.trim();
  const unsupportedForecast = opportunity.forecastEvidenceCategory === 'Unsupported' || opportunity.decisionRecommendation === 'Downgrade';
  const weakEvidence = !opportunity.evidence.trim() || /interest|interested|possible|unclear|waiting|no response|early interest/i.test(opportunity.evidence);

  if (unsupportedForecast || (missingCore >= 3 && weakEvidence) || (highOpenObjection && noNextAction)) return 'Unsupported';
  if (opportunity.forecastEvidenceCategory === 'Hope-based' || missingCore >= 2 || (highOpenObjection && fieldStatus({ fields } as MeddicLiteReview, 'champion') === 'Missing')) return 'Hope-based';
  if (opportunity.forecastEvidenceCategory === 'Defensible' && strongCore >= 3 && !highOpenObjection && !noNextAction) return 'Defensible';
  return 'Weak but recoverable';
}

function buildRecommendedActions(
  opportunity: CrmLiteOpportunity,
  fields: MeddicLiteFieldReview[],
  objections: ObjectionRecord[],
) {
  const actions: string[] = [];
  if (fieldStatus({ fields } as MeddicLiteReview, 'economicBuyer') === 'Missing') actions.push('Map the economic buyer or budget owner before defending the deal.');
  if (fieldStatus({ fields } as MeddicLiteReview, 'champion') === 'Missing') actions.push('Identify a champion who can support the project internally.');
  if (fieldStatus({ fields } as MeddicLiteReview, 'decisionProcess') !== 'Strong') actions.push('Confirm procurement path, decision steps, and close timing.');
  if (fieldStatus({ fields } as MeddicLiteReview, 'decisionCriteria') === 'Missing') actions.push('Capture the technical and commercial decision criteria.');
  if (objections.some((objection) => objection.status === 'Open')) actions.push('Resolve open objection debt with proof, owner, and due timing.');
  if (!opportunity.nextAction.trim()) actions.push('Set one customer-confirmed next action.');
  return actions.length > 0 ? dedupe(actions) : ['Prepare a concise defense answer using the captured evidence and next customer action.'];
}

function buildDefenseAnswer(
  opportunity: CrmLiteOpportunity,
  category: MeddicLiteDealCategory,
  gaps: string[],
  actions: string[],
) {
  if (category === 'Defensible') {
    return `This opportunity is defensible if the current evidence remains valid. Next step: ${opportunity.nextAction || actions[0]}.`;
  }

  if (category === 'Unsupported') {
    return `This opportunity should not be defended yet. It needs ${actions[0]?.toLowerCase() || 'basic buyer, process, pain, and next-action proof'} before review.`;
  }

  const gapText = gaps.slice(0, 2).join('; ') || 'remaining MEDDIC-lite gaps';
  return `This opportunity is ${category.toLowerCase()}. Defend only if this week confirms: ${gapText}. Recommended next step: ${actions[0] || opportunity.nextAction || 'clarify the next customer action'}.`;
}

function getRelatedStakeholders(opportunity: CrmLiteOpportunity, stakeholders: StakeholderRecord[]) {
  return getStakeholdersForOpportunity(stakeholders, opportunity);
}

function getRelatedObjections(opportunity: CrmLiteOpportunity, objections: ObjectionRecord[]) {
  return getObjectionsForOpportunity(objections, opportunity);
}

function getRelatedActivities(opportunity: CrmLiteOpportunity, activities: SalesActivityRecord[]) {
  const account = normalize(opportunity.accountName);
  const opportunityName = normalize(opportunity.opportunityName);
  return activities.filter((activity) => (
    activity.linkedOpportunityId === opportunity.id
    || (activity.linkedOpportunityName && normalize(activity.linkedOpportunityName) === opportunityName)
    || (
      normalize(activity.linkedAccountName || activity.accountName) === account
      && normalize(activity.opportunityName || '').includes(opportunityName)
    )
  ));
}

function fieldStatus(review: Pick<MeddicLiteReview, 'fields'>, key: MeddicLiteFieldKey) {
  return review.fields.find((field) => field.key === key)?.status || 'Missing';
}

function categoryRank(category: MeddicLiteDealCategory) {
  return {
    Defensible: 0,
    'Weak but recoverable': 1,
    'Hope-based': 2,
    Unsupported: 3,
  }[category];
}

function hasStrongSignal(value: string) {
  return /confirmed|approved|budget|po|procurement owner|decision maker|timeline|completed|requested|technical evaluation|validation/i.test(value);
}

function extractCompetitorMentions(value: string) {
  const competitors = new Set<string>();
  const known = ['Incumbent Vendor', 'Competing platform', 'Competing platform', '3M', 'Thermo Fisher', 'Merck', 'Sartorius'];
  known.forEach((competitor) => {
    if (new RegExp(`\\b${escapeRegExp(competitor)}\\b`, 'i').test(value)) competitors.add(competitor === 'Competing platform' ? 'Competing platform' : competitor);
  });
  const genericMatch = value.match(/competitor\s+([A-Z][A-Za-z0-9-]+)/i);
  if (genericMatch?.[1]) competitors.add(genericMatch[1]);
  return Array.from(competitors);
}

function firstSentence(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.split(/(?<=[.!?])\s+/)[0] || trimmed;
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function dedupe(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const businessImpactTerms = /roi|impact|cost|saving|save|reduce|increase|capacity|throughput|compliance|approval|budget|risk|sla|downtime|efficiency|revenue|margin/i;
const criteriaTerms = /criteria|proof|validation|compliance|compare|evaluation|requirement|iq|oq|pq|sla|throughput|technical/i;
