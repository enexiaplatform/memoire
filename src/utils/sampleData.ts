import { ACCOUNT_STORAGE_KEY, type AccountMemoryRecord } from '../services/accountStore';
import { OPPORTUNITY_STORAGE_KEY, type CrmLiteOpportunity } from '../services/opportunityStore';
import { SALES_ACTIVITY_STORAGE_KEY, type SalesActivityRecord } from '../services/salesActivityStore';
import { STAKEHOLDER_STORAGE_KEY, type StakeholderRecord } from '../services/stakeholderStore';
import { OBJECTION_STORAGE_KEY, type ObjectionRecord } from '../services/objectionStore';
import { ACTION_OUTCOME_STORAGE_KEY, type ActionOutcomeRecord } from '../services/actionOutcomeStore';
import { SALES_ASSET_STORAGE_KEY, type SalesAssetRecord } from '../services/salesAssetStore';
import { QUOTE_STORAGE_KEY, type QuoteRecord } from '../services/quoteStore';
import { invalidateWorkspaceDataCache } from '../services/workspaceDataCache';
import { classifySalesActivity } from './salesActivityClassifier';
import { generatePipelineDefenseBriefFromOpportunities } from './opportunityToPipelineBrief';
import { buildEmailThreadIngestion, buildIngestionSourceTags, composeIngestionParserText } from './ingestionSource.ts';
import { clearDemoJourneyCompletion } from './demoJourney';
import { clearDailyExecutionState } from './dailyExecution';
import {
  MULTI_BRIEF_STORAGE_KEY,
  loadPipelineDefenseBriefStore,
  type PipelineDefenseBrief,
  type PipelineDefenseBriefStore,
} from './pipelineDefenseStorage';

export const SAMPLE_DATA_FLAG_KEY = 'memoire.sampleData.loaded';
export const SAMPLE_DATA_NAMESPACE = 'demo';
export const SAMPLE_DATA_UPDATED_EVENT = 'memoire:sample-data-updated';

const LEGACY_SAMPLE_TERMS = [
  'VHP',
  'Control Union',
  'TV Pharm',
  'Bidiphar',
  'SolidFog',
  'STERIS',
  'Microbiology workflow',
  'Tender opportunity',
  'Food Safety Rapid Testing',
];

const SAMPLE_ARRAY_STORAGE_KEYS = [
  SALES_ACTIVITY_STORAGE_KEY,
  OPPORTUNITY_STORAGE_KEY,
  ACCOUNT_STORAGE_KEY,
  STAKEHOLDER_STORAGE_KEY,
  OBJECTION_STORAGE_KEY,
  ACTION_OUTCOME_STORAGE_KEY,
  SALES_ASSET_STORAGE_KEY,
  QUOTE_STORAGE_KEY,
];

type SampleRecord = {
  id?: string;
  source?: string;
  isSample?: boolean;
  tags?: string[];
  title?: string;
};

export type SampleDataset = {
  activities: SalesActivityRecord[];
  opportunities: CrmLiteOpportunity[];
  accounts: AccountMemoryRecord[];
  stakeholders: StakeholderRecord[];
  objections: ObjectionRecord[];
  actionOutcomes: ActionOutcomeRecord[];
  salesAssets: SalesAssetRecord[];
  quotes: QuoteRecord[];
  briefs: PipelineDefenseBrief[];
};

export function isSampleDataLoaded() {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(SAMPLE_DATA_FLAG_KEY) === 'true';
  } catch {
    return false;
  }
}

export function markSampleDataLoaded() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SAMPLE_DATA_FLAG_KEY, 'true');
    window.dispatchEvent(new CustomEvent(SAMPLE_DATA_UPDATED_EVENT));
  } catch {
    // Sample flag is best-effort only.
  }
}

export function clearSampleDataFlag() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(SAMPLE_DATA_FLAG_KEY);
    window.dispatchEvent(new CustomEvent(SAMPLE_DATA_UPDATED_EVENT));
  } catch {
    // Ignore localStorage cleanup failures.
  }
}

export function loadSampleDataset(): SampleDataset {
  clearDemoJourneyCompletion();
  const dataset = buildSampleDataset();

  writeLocalArray(SALES_ACTIVITY_STORAGE_KEY, dataset.activities);
  writeLocalArray(OPPORTUNITY_STORAGE_KEY, dataset.opportunities);
  writeLocalArray(ACCOUNT_STORAGE_KEY, dataset.accounts);
  writeLocalArray(STAKEHOLDER_STORAGE_KEY, dataset.stakeholders);
  writeLocalArray(OBJECTION_STORAGE_KEY, dataset.objections);
  writeLocalArray(ACTION_OUTCOME_STORAGE_KEY, dataset.actionOutcomes);
  writeLocalArray(SALES_ASSET_STORAGE_KEY, dataset.salesAssets);
  writeLocalArray(QUOTE_STORAGE_KEY, dataset.quotes);
  writeLocalBriefs(dataset.briefs);
  markSampleDataLoaded();
  invalidateWorkspaceDataCache();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SAMPLE_DATA_UPDATED_EVENT));
  }

  return {
    ...dataset,
    briefs: [
      ...dataset.briefs,
      ...loadPipelineDefenseBriefStore().briefs.filter((brief) => !isSampleRecord(brief)),
    ],
  };
}

export function clearSampleDataset() {
  removeSampleRecords(SALES_ACTIVITY_STORAGE_KEY);
  removeSampleRecords(OPPORTUNITY_STORAGE_KEY);
  removeSampleRecords(ACCOUNT_STORAGE_KEY);
  removeSampleRecords(STAKEHOLDER_STORAGE_KEY);
  removeSampleRecords(OBJECTION_STORAGE_KEY);
  removeSampleRecords(ACTION_OUTCOME_STORAGE_KEY);
  removeSampleRecords(SALES_ASSET_STORAGE_KEY);
  removeSampleRecords(QUOTE_STORAGE_KEY);
  removeSampleBriefs();
  clearDemoJourneyCompletion();
  clearDailyExecutionState('demo');
  clearSampleDataFlag();
  invalidateWorkspaceDataCache();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SAMPLE_DATA_UPDATED_EVENT));
  }
}

export function sanitizeLegacySampleDataset() {
  if (typeof window === 'undefined' || !isSampleDataLoaded()) return false;

  try {
    if (!hasLegacySampleTerms()) return false;
    SAMPLE_ARRAY_STORAGE_KEYS.forEach(removeLegacySampleRecords);
    removeLegacySampleBriefs();
    clearDemoJourneyCompletion();
    loadSampleDataset();
    return true;
  } catch {
    return false;
  }
}

export function buildSampleDataset(): SampleDataset {
  const now = new Date();
  const timestamp = now.toISOString();
  const today = toDateKey(now);
  const yesterday = toDateKey(addDays(now, -1));
  const twoDaysAgo = toDateKey(addDays(now, -2));
  const sixDaysAgo = toDateKey(addDays(now, -6));
  const sixteenDaysAgo = toDateKey(addDays(now, -16));
  const nextTuesday = toDateKey(nextWeekday(now, 2));
  const friday = toDateKey(nextWeekday(now, 5));
  const nextWeek = toDateKey(addDays(now, 7));

  const opportunities: CrmLiteOpportunity[] = [
    sampleOpportunity({
      id: 'demo-opp-apex-validation-expansion',
      accountName: 'Apex Labs',
      opportunityName: 'Validation Expansion',
      stage: 'Negotiation',
      estimatedValue: 2400000000,
      expectedClosePeriod: 'Next quarter',
      productOrSolution: 'Validation Expansion decontamination expansion',
      decisionMaker: 'Dr. Avery',
      budgetOwner: 'CFO office',
      procurementPath: 'Direct procurement after technical sign-off',
      technicalCriteria: 'Validation compliance, validation package, service response SLA',
      nextAction: 'Send revised quote and procurement checklist',
      nextActionDate: friday,
      evidence: 'Budget approved; Dr. Avery confirmed next-quarter project window and procurement owner.',
      missingContext: 'Final PO issue date',
      objectionDebt: '',
      forecastEvidenceCategory: 'Defensible',
      decisionRecommendation: 'Defend',
      status: 'Active',
      createdAt: timestamp,
    }),
    sampleOpportunity({
      id: 'demo-opp-apex-service-renewal',
      accountName: 'Apex Labs',
      opportunityName: 'Validated decontamination service renewal',
      stage: 'Proposal',
      estimatedValue: 520000000,
      expectedClosePeriod: 'This month',
      productOrSolution: 'Service renewal and validation support',
      decisionMaker: 'Engineering manager',
      budgetOwner: 'Site operations',
      procurementPath: 'Annual vendor renewal',
      technicalCriteria: 'Response time, validation documentation, preventive maintenance schedule',
      nextAction: 'Confirm renewal PO timing with engineering manager',
      nextActionDate: nextTuesday,
      evidence: 'Incumbent renewal discussed; service team confirmed scope and customer requested updated SLA.',
      missingContext: '',
      objectionDebt: 'Minor concern about weekend service coverage.',
      forecastEvidenceCategory: 'Weak but recoverable',
      decisionRecommendation: 'Monitor',
      status: 'Active',
      createdAt: timestamp,
    }),
    sampleOpportunity({
      id: 'demo-opp-northstar-foods-lab',
      accountName: 'Northstar Foods',
      opportunityName: 'Lab workflow',
      stage: 'Proposal',
      estimatedValue: 450000000,
      expectedClosePeriod: 'Next month',
      productOrSolution: 'Lab workflow',
      decisionMaker: 'Lab manager',
      budgetOwner: '',
      procurementPath: 'Internal review before PO',
      technicalCriteria: 'Lead time and local support proof required',
      nextAction: 'Send local support proof and lead time response',
      nextActionDate: nextWeek,
      evidence: 'Customer is reviewing proposal and asked for implementation timeline.',
      missingContext: 'Budget owner; final approval date',
      objectionDebt: 'Lead time concern and local support proof needed.',
      forecastEvidenceCategory: 'Weak but recoverable',
      decisionRecommendation: 'Rescue',
      status: 'Active',
      createdAt: timestamp,
    }),
    sampleOpportunity({
      id: 'demo-opp-orion-pharma-tender',
      accountName: 'Orion Pharma',
      opportunityName: 'Procurement review',
      stage: 'Procurement',
      estimatedValue: 900000000,
      expectedClosePeriod: '',
      productOrSolution: 'Sterility testing workflow',
      decisionMaker: '',
      budgetOwner: '',
      procurementPath: 'Tender path unclear',
      technicalCriteria: 'Tender evaluation criteria unclear',
      nextAction: 'Clarify tender timeline and committee owner',
      nextActionDate: nextWeek,
      evidence: 'Customer expressed tender interest but no confirmed tender calendar yet.',
      missingContext: 'Decision committee; budget owner; procurement path; tender timeline',
      objectionDebt: 'Procurement route and tender timing are unclear.',
      forecastEvidenceCategory: 'Hope-based',
      decisionRecommendation: 'Rescue',
      status: 'Active',
      createdAt: timestamp,
    }),
    sampleOpportunity({
      id: 'demo-opp-summit-diagnostics-qc-workflow',
      accountName: 'Summit Diagnostics',
      opportunityName: 'QC workflow',
      stage: 'Discovery',
      estimatedValue: 650000000,
      expectedClosePeriod: '',
      productOrSolution: 'QC workflow upgrade',
      decisionMaker: '',
      budgetOwner: '',
      procurementPath: '',
      technicalCriteria: '',
      nextAction: '',
      nextActionDate: '',
      evidence: 'Only early interest captured; no confirmed next customer step.',
      missingContext: 'Decision maker; budget owner; procurement path; close period; next action',
      objectionDebt: 'No current objection captured because discovery context is incomplete.',
      forecastEvidenceCategory: 'Unsupported',
      decisionRecommendation: 'Downgrade',
      status: 'Active',
      createdAt: timestamp,
    }),
    sampleOpportunity({
      id: 'demo-opp-northstar-line-audit-won',
      accountName: 'Northstar Foods',
      opportunityName: 'Line audit service',
      stage: 'Won',
      estimatedValue: 480000000,
      expectedClosePeriod: '',
      productOrSolution: 'Production line audit',
      decisionMaker: 'Lan Pham (Ops Director)',
      budgetOwner: 'Ops budget',
      procurementPath: 'Direct PO',
      technicalCriteria: 'Audit scope agreed on both lines',
      nextAction: '',
      nextActionDate: '',
      evidence: 'PO received; kickoff completed.',
      missingContext: '',
      objectionDebt: '',
      forecastEvidenceCategory: 'Defensible',
      decisionRecommendation: 'Defend',
      status: 'Won',
      pipelineProbability: 100,
      createdAt: addDays(now, -25).toISOString(),
    }),
    sampleOpportunity({
      id: 'demo-opp-orion-lims-expansion-lost',
      accountName: 'Orion Pharma',
      opportunityName: 'LIMS expansion',
      stage: 'Lost',
      estimatedValue: 1200000000,
      expectedClosePeriod: '',
      productOrSolution: 'LIMS site expansion',
      decisionMaker: 'Duc Tran (Lab Director)',
      budgetOwner: 'IT capex',
      procurementPath: 'RFP',
      technicalCriteria: 'Integration with legacy instruments',
      nextAction: '',
      nextActionDate: '',
      evidence: 'Lost to incumbent on integration cost; decision email captured.',
      missingContext: '',
      objectionDebt: 'Integration cost objection surfaced too late in the cycle.',
      forecastEvidenceCategory: 'Unsupported',
      decisionRecommendation: 'Downgrade',
      status: 'Lost',
      pipelineProbability: 0,
      createdAt: addDays(now, -80).toISOString(),
    }),
  ];

  const accounts: AccountMemoryRecord[] = [
    sampleAccount({
      id: 'demo-account-apex',
      accountName: 'Apex Labs',
      segment: 'Strategic pharma',
      industry: 'Pharma',
      location: 'Vietnam',
      accountPotential: 'High',
      relationshipStatus: 'Strong',
      keyStakeholders: ['Dr. Avery', 'Engineering manager', 'CFO office'],
      notes: 'Healthy strategic account with budget signal and active EU-GMP expansion work.',
      tags: ['demo-data', 'pharma', 'strategic'],
      createdAt: timestamp,
    }),
    sampleAccount({
      id: 'demo-account-northstar-foods',
      accountName: 'Northstar Foods',
      segment: 'Testing lab',
      industry: 'Food/testing',
      location: 'Vietnam',
      accountPotential: 'Medium',
      relationshipStatus: 'Developing',
      keyStakeholders: ['Lab manager', 'Operations lead'],
      notes: 'Good engagement but needs proof around lead time, validation references, and local support.',
      tags: ['demo-data', 'testing-lab'],
      createdAt: timestamp,
    }),
    sampleAccount({
      id: 'demo-account-orion-pharma',
      accountName: 'Orion Pharma',
      segment: 'Pharma manufacturer',
      industry: 'Pharma',
      location: 'Vietnam',
      accountPotential: 'High',
      relationshipStatus: 'At risk',
      keyStakeholders: ['Procurement lead'],
      notes: 'Procurement review exists, but procurement path and decision committee remain unclear.',
      tags: ['demo-data', 'tender'],
      createdAt: timestamp,
    }),
    sampleAccount({
      id: 'demo-account-summit-diagnostics',
      accountName: 'Summit Diagnostics',
      segment: 'Regional pharma',
      industry: 'Pharma',
      location: 'Vietnam',
      accountPotential: 'Medium',
      relationshipStatus: 'Dormant',
      keyStakeholders: [],
      notes: 'Early interest exists, but no recent decision context or next action is captured.',
      tags: ['demo-data', 'dormant'],
      createdAt: timestamp,
    }),
  ];

  const activities: SalesActivityRecord[] = [
    sampleActivity({
      id: 'demo-activity-apex-budget',
      note: 'Met with Dr. Avery at Apex Labs today. They confirmed budget approval for Validation Expansion next quarter. Need to send revised quote by Friday and follow up with procurement next Tuesday. Competitor Incumbent Vendor still in the loop.',
      activityDate: today,
      linkedOpportunityId: 'demo-opp-apex-validation-expansion',
      linkedOpportunityName: 'Validation Expansion',
      linkedAccountName: 'Apex Labs',
      createdAt: timestamp,
    }),
    sampleActivity({
      id: 'demo-activity-northstar-foods-lead-time',
      note: 'Called Northstar Foods lab manager. They like the lab workflow but are worried about lead time. Need to send local support proof next week.',
      activityDate: yesterday,
      linkedOpportunityId: 'demo-opp-northstar-foods-lab',
      linkedOpportunityName: 'Lab workflow',
      linkedAccountName: 'Northstar Foods',
      createdAt: timestamp,
    }),
    sampleEmailThreadActivity({
      id: 'demo-activity-orion-pharma-tender-email',
      subject: 'Orion Pharma tender review follow-up',
      sender: 'Ms. Linh <procurement@orion.example>',
      recipients: 'seller@example.com',
      body: 'Thanks for the sterility workflow commercial offer. Tender decision is expected end of July, but the committee owner is not confirmed yet. Please send differentiator evidence and clarify procurement path by next Friday.',
      activityDate: twoDaysAgo,
      linkedOpportunityId: 'demo-opp-orion-pharma-tender',
      linkedOpportunityName: 'Procurement review',
      linkedAccountName: 'Orion Pharma',
      createdAt: timestamp,
    }),
    sampleActivity({
      id: 'demo-activity-summit-diagnostics-gap',
      note: 'Reviewed Summit Diagnostics QC workflow. No confirmed decision maker, close period, or next action. Should downgrade until real evidence appears.',
      activityDate: sixteenDaysAgo,
      linkedOpportunityId: 'demo-opp-summit-diagnostics-qc-workflow',
      linkedOpportunityName: 'QC workflow',
      linkedAccountName: 'Summit Diagnostics',
      createdAt: timestamp,
    }),
    sampleActivity({
      id: 'demo-activity-apex-service',
      note: 'Sent service renewal proposal to Apex Labs engineering manager. They requested updated SLA and weekend coverage note by Friday.',
      activityDate: sixDaysAgo,
      linkedOpportunityId: 'demo-opp-apex-service-renewal',
      linkedOpportunityName: 'Validated decontamination service renewal',
      linkedAccountName: 'Apex Labs',
      createdAt: timestamp,
    }),
    sampleActivity({
      id: 'demo-activity-internal-apex',
      note: 'Internal coordination with service and finance team for Apex Labs Validation System quote. Finance confirmed discount guardrail and service confirmed installation capacity next quarter.',
      activityDate: yesterday,
      linkedOpportunityId: 'demo-opp-apex-validation-expansion',
      linkedOpportunityName: 'Validation Expansion',
      linkedAccountName: 'Apex Labs',
      createdAt: timestamp,
    }),
    sampleActivity({
      id: 'demo-activity-orion-pharma-competitor',
      note: 'Orion Pharma mentioned a competing platform during procurement discussion. Need to collect differentiator evidence before procurement meeting.',
      activityDate: today,
      linkedOpportunityId: 'demo-opp-orion-pharma-tender',
      linkedOpportunityName: 'Procurement review',
      linkedAccountName: 'Orion Pharma',
      createdAt: timestamp,
    }),
  ];

  const stakeholders: StakeholderRecord[] = [
    sampleStakeholder({
      id: 'demo-stakeholder-dr-linh',
      accountName: 'Apex Labs',
      opportunityId: 'demo-opp-apex-validation-expansion',
      opportunityName: 'Validation Expansion',
      name: 'Dr. Avery',
      roleTitle: 'QA / Technical lead',
      stakeholderRole: 'Champion',
      influenceLevel: 'High',
      relationshipStrength: 'Strong',
      stance: 'Supportive',
      notes: 'Confirmed budget approval and supports Validation Expansion.',
      tags: ['demo-data', 'champion', 'technical-buyer'],
      lastInteractionDate: today,
      createdAt: timestamp,
    }),
    sampleStakeholder({
      id: 'demo-stakeholder-ms-an',
      accountName: 'Apex Labs',
      opportunityId: 'demo-opp-apex-validation-expansion',
      opportunityName: 'Validation Expansion',
      name: 'Ms. Morgan',
      roleTitle: 'Procurement manager',
      stakeholderRole: 'Procurement',
      influenceLevel: 'Medium',
      relationshipStrength: 'Developing',
      stance: 'Neutral',
      notes: 'Procurement path contact; needs revised quote and checklist.',
      tags: ['demo-data', 'procurement'],
      lastInteractionDate: today,
      createdAt: timestamp,
    }),
    sampleStakeholder({
      id: 'demo-stakeholder-mr-minh',
      accountName: 'Northstar Foods',
      opportunityId: 'demo-opp-northstar-foods-lab',
      opportunityName: 'Lab workflow',
      name: 'Mr. Taylor',
      roleTitle: 'Lab manager',
      stakeholderRole: 'Technical Buyer',
      influenceLevel: 'High',
      relationshipStrength: 'Developing',
      stance: 'Neutral',
      notes: 'Likes workflow but needs lead time proof and local support confidence.',
      tags: ['demo-data', 'technical-buyer'],
      lastInteractionDate: yesterday,
      createdAt: timestamp,
    }),
    sampleStakeholder({
      id: 'demo-stakeholder-orion-pharma-procurement',
      accountName: 'Orion Pharma',
      opportunityId: 'demo-opp-orion-pharma-tender',
      opportunityName: 'Procurement review',
      name: 'Orion Pharma procurement contact',
      roleTitle: 'Procurement',
      stakeholderRole: 'Procurement',
      influenceLevel: 'Medium',
      relationshipStrength: 'Weak',
      stance: 'Unknown',
      notes: 'Tender path unclear; committee owner not confirmed.',
      tags: ['demo-data', 'procurement', 'tender'],
      lastInteractionDate: twoDaysAgo,
      createdAt: timestamp,
    }),
    sampleStakeholder({
      id: 'demo-stakeholder-summit-diagnostics-qa',
      accountName: 'Summit Diagnostics',
      opportunityId: 'demo-opp-summit-diagnostics-qc-workflow',
      opportunityName: 'QC workflow',
      name: 'Summit Diagnostics QA manager',
      roleTitle: 'QA manager',
      stakeholderRole: 'User',
      influenceLevel: 'Medium',
      relationshipStrength: 'Unknown',
      stance: 'Neutral',
      notes: 'No confirmed decision process or next step captured.',
      tags: ['demo-data', 'user'],
      lastInteractionDate: sixteenDaysAgo,
      createdAt: timestamp,
    }),
  ];

  const objections: ObjectionRecord[] = [
    sampleObjection({
      id: 'demo-objection-northstar-foods-lead-time',
      accountName: 'Northstar Foods',
      opportunityId: 'demo-opp-northstar-foods-lab',
      opportunityName: 'Lab workflow',
      stakeholderId: 'demo-stakeholder-mr-minh',
      stakeholderName: 'Mr. Taylor',
      sourceActivityId: 'demo-activity-northstar-foods-lead-time',
      objectionType: 'Lead time',
      objectionText: 'Customer is concerned implementation lead time may not meet project timing.',
      impact: 'Medium',
      status: 'Open',
      requiredProof: 'Provide confirmed delivery timeline and local support proof.',
      responsePlan: 'Send local support proof pack and propose implementation timeline review.',
      dueDate: nextWeek,
      tags: ['demo-data', 'lead-time'],
      createdAt: timestamp,
    }),
    sampleObjection({
      id: 'demo-objection-apex-validation-docs',
      accountName: 'Apex Labs',
      opportunityId: 'demo-opp-apex-validation-expansion',
      opportunityName: 'Validation Expansion',
      stakeholderId: 'demo-stakeholder-dr-linh',
      stakeholderName: 'Dr. Avery',
      sourceActivityId: 'demo-activity-apex-budget',
      objectionType: 'Compliance / validation',
      objectionText: 'Validation and IQ/OQ/PQ proof needed before procurement sign-off.',
      impact: 'Medium',
      status: 'Addressed',
      requiredProof: 'Provide validation package and validation references.',
      responsePlan: 'Validation pack prepared; procurement checklist is next.',
      dueDate: friday,
      tags: ['demo-data', 'validation'],
      createdAt: timestamp,
    }),
    sampleObjection({
      id: 'demo-objection-orion-pharma-procurement',
      accountName: 'Orion Pharma',
      opportunityId: 'demo-opp-orion-pharma-tender',
      opportunityName: 'Procurement review',
      stakeholderId: 'demo-stakeholder-orion-pharma-procurement',
      stakeholderName: 'Orion Pharma procurement contact',
      sourceActivityId: 'demo-activity-orion-pharma-tender',
      objectionType: 'Procurement',
      objectionText: 'Tender timeline and decision committee are still unclear.',
      impact: 'High',
      status: 'Open',
      requiredProof: 'Clarify tender calendar, committee owner, and evaluation criteria.',
      responsePlan: 'Schedule procurement clarification call before forecast review.',
      dueDate: nextWeek,
      tags: ['demo-data', 'procurement', 'tender'],
      createdAt: timestamp,
    }),
    sampleObjection({
      id: 'demo-objection-summit-diagnostics-local-support',
      accountName: 'Summit Diagnostics',
      opportunityId: 'demo-opp-summit-diagnostics-qc-workflow',
      opportunityName: 'QC workflow',
      stakeholderId: 'demo-stakeholder-summit-diagnostics-qa',
      stakeholderName: 'Summit Diagnostics QA manager',
      sourceActivityId: 'demo-activity-summit-diagnostics-gap',
      objectionType: 'Local support',
      objectionText: 'Local support confidence is not established for the QC workflow.',
      impact: 'Medium',
      status: 'Open',
      requiredProof: 'Provide local support owner, response SLA, and reference account.',
      responsePlan: 'Do not defend until support proof and next action are confirmed.',
      dueDate: '',
      tags: ['demo-data', 'local-support'],
      createdAt: timestamp,
    }),
    sampleObjection({
      id: 'demo-objection-apex-competitor',
      accountName: 'Apex Labs',
      opportunityId: 'demo-opp-apex-validation-expansion',
      opportunityName: 'Validation Expansion',
      stakeholderId: '',
      stakeholderName: '',
      sourceActivityId: 'demo-activity-apex-budget',
      objectionType: 'Competitor',
      objectionText: 'Incumbent Vendor remains in the loop as competitor pressure.',
      impact: 'Medium',
      status: 'Addressed',
      requiredProof: 'Prepare differentiator proof against Incumbent Vendor.',
      responsePlan: 'Use validation package and local service coverage as differentiators.',
      dueDate: nextTuesday,
      tags: ['demo-data', 'competitor'],
      createdAt: timestamp,
    }),
  ];

  const actionOutcomes: ActionOutcomeRecord[] = [
    sampleActionOutcome({
      id: 'demo-outcome-apex-economic-buyer',
      opportunityId: 'demo-opp-apex-validation-expansion',
      opportunityName: 'Validation Expansion',
      accountName: 'Apex Labs',
      actionTitle: 'Confirm economic buyer for Validation Expansion',
      actionSourceType: 'MEDDIC Gap',
      status: 'Done',
      outcomeType: 'Improved',
      outcomeNote: 'Dr. Avery confirmed budget approval and CFO office is aligned for next-quarter procurement.',
      relatedGap: 'Economic buyer should be validated as a real buying authority.',
      completedAt: today,
      createdAt: yesterday,
    }),
    sampleActionOutcome({
      id: 'demo-outcome-northstar-foods-lead-time',
      opportunityId: 'demo-opp-northstar-foods-lab',
      opportunityName: 'Lab workflow',
      accountName: 'Northstar Foods',
      actionTitle: 'Prepare proof for lead time objection',
      actionSourceType: 'Objection',
      status: 'Done',
      outcomeType: 'Still unclear',
      outcomeNote: 'Proof was sent, but Mr. Taylor still needs internal confirmation on implementation timing.',
      relatedObjectionId: 'demo-objection-northstar-foods-lead-time',
      relatedStakeholderName: 'Mr. Taylor',
      completedAt: yesterday,
      createdAt: twoDaysAgo,
    }),
    sampleActionOutcome({
      id: 'demo-outcome-summit-diagnostics-downgrade',
      opportunityId: 'demo-opp-summit-diagnostics-qc-workflow',
      opportunityName: 'QC workflow',
      accountName: 'Summit Diagnostics',
      actionTitle: 'Define next customer action',
      actionSourceType: 'Stale Next Action',
      status: 'Dismissed',
      outcomeType: 'Downgrade recommended',
      outcomeNote: 'No confirmed buyer or next action. Keep out of defended forecast until customer re-engages.',
      completedAt: sixteenDaysAgo,
      createdAt: sixteenDaysAgo,
    }),
    sampleActionOutcome({
      id: 'demo-outcome-orion-pharma-tender',
      opportunityId: 'demo-opp-orion-pharma-tender',
      opportunityName: 'Procurement review',
      accountName: 'Orion Pharma',
      actionTitle: 'Clarify procurement decision process for Procurement review',
      actionSourceType: 'Timeline',
      status: 'Accepted',
      outcomeType: 'Still unclear',
      outcomeNote: 'Critical follow-up is still unresolved before the next review.',
      relatedGap: 'Decision process not fully mapped.',
      completedAt: '',
      createdAt: today,
    }),
  ];

  const salesAssets: SalesAssetRecord[] = [
    sampleAsset({
      id: 'demo-asset-iq-oq-pq-proof',
      title: 'IQ/OQ/PQ documentation proof note',
      assetType: 'Validation / Documentation Note',
      summary: 'Reusable validation proof response for pharma customers who need IQ/OQ/PQ confidence.',
      content: 'Use this when validation documentation is a blocker: confirm the required IQ/OQ/PQ documents, provide the standard validation pack index, and offer a short technical review with QA before procurement sign-off.',
      tags: ['demo-data', 'validation', 'iq-oq-pq', 'pharma'],
      relatedAccountName: 'Apex Labs',
      relatedOpportunityId: 'demo-opp-apex-validation-expansion',
      relatedOpportunityName: 'Validation Expansion',
      relatedObjectionType: 'Compliance / validation',
      useCase: 'Neutralize validation and compliance proof gaps before procurement review.',
      createdAt: timestamp,
    }),
    sampleAsset({
      id: 'demo-asset-procurement-justification',
      title: 'Procurement justification snippet',
      assetType: 'Procurement Justification',
      summary: 'Short justification for procurement teams comparing technical fit, risk reduction, and support.',
      content: 'Position the purchase around validated technical fit, reduced implementation risk, local support availability, and clear service accountability. Confirm the decision committee, evaluation criteria, and approval timeline.',
      tags: ['demo-data', 'procurement', 'tender'],
      relatedAccountName: 'Orion Pharma',
      relatedOpportunityId: 'demo-opp-orion-pharma-tender',
      relatedOpportunityName: 'Procurement review',
      relatedObjectionType: 'Procurement',
      useCase: 'Use when tender path, committee ownership, or procurement timing is unclear.',
      createdAt: timestamp,
    }),
    sampleAsset({
      id: 'demo-asset-competitor-response',
      title: 'Incumbent Vendor competitor response note',
      assetType: 'Competitor Response',
      summary: 'Reusable differentiator response when Incumbent Vendor remains in the evaluation.',
      content: 'Anchor the response to the customer criteria: validation proof, local service response, implementation certainty, and total risk reduction. Ask which competitor criterion matters most and prepare proof against that criterion.',
      tags: ['demo-data', 'competitor', 'incumbent-vendor'],
      relatedAccountName: 'Apex Labs',
      relatedOpportunityId: 'demo-opp-apex-validation-expansion',
      relatedOpportunityName: 'Validation Expansion',
      relatedObjectionType: 'Competitor',
      useCase: 'Use when competitor pressure appears without a clear response plan.',
      createdAt: timestamp,
    }),
    sampleAsset({
      id: 'demo-asset-lead-time-response',
      title: 'Lead time objection response',
      assetType: 'Objection Response',
      summary: 'Response path for lead time concerns and implementation timing risk.',
      content: 'Confirm the required go-live date, show the realistic implementation timeline, name local support owner, and propose a checkpoint call to remove schedule uncertainty.',
      tags: ['demo-data', 'lead-time', 'local-support'],
      relatedAccountName: 'Northstar Foods',
      relatedOpportunityId: 'demo-opp-northstar-foods-lab',
      relatedOpportunityName: 'Lab workflow',
      relatedObjectionType: 'Lead time',
      useCase: 'Use when lead time or local support confidence is blocking next step.',
      createdAt: timestamp,
    }),
  ];

  const quotes: QuoteRecord[] = [
    sampleQuote({
      id: 'demo-quote-apex-validation',
      quoteId: 'Q-DEMO-APEX-01',
      accountName: 'Apex Labs',
      opportunityId: 'demo-opp-apex-validation-expansion',
      opportunityName: 'Validation Expansion',
      title: 'Validation expansion revised quote',
      quoteDate: twoDaysAgo,
      validUntil: friday,
      amount: 2400000000,
      currency: 'VND',
      grossMarginEstimate: 34,
      discount: 8,
      paymentTerm: '30 days after delivery',
      status: 'Revised',
      poStatus: 'Pending',
      deliveryStatus: 'Not scheduled',
      expectedDeliveryDate: '',
      paymentStatus: 'Not due',
      paymentDueDate: '',
      nextAction: 'Confirm revised quote approval before expiry.',
      notes: 'Procurement owner is confirmed; final PO date remains open.',
      createdAt: timestamp,
    }),
    sampleQuote({
      id: 'demo-quote-orion-procurement',
      quoteId: 'Q-DEMO-ORION-01',
      accountName: 'Orion Pharma',
      opportunityId: 'demo-opp-orion-pharma-tender',
      opportunityName: 'Procurement review',
      title: 'Sterility workflow commercial offer',
      quoteDate: sixDaysAgo,
      validUntil: nextWeek,
      amount: 900000000,
      currency: 'VND',
      grossMarginEstimate: 29,
      discount: 12,
      paymentTerm: '50% with PO, 50% after delivery',
      status: 'Accepted',
      poStatus: 'Pending',
      deliveryStatus: 'Not scheduled',
      expectedDeliveryDate: '',
      paymentStatus: 'Not due',
      paymentDueDate: '',
      nextAction: 'Confirm PO owner and issue date.',
      notes: 'Commercial acceptance received; formal PO still outstanding.',
      createdAt: timestamp,
    }),
    sampleQuote({
      id: 'demo-quote-northstar-lab',
      quoteId: 'Q-DEMO-NORTHSTAR-01',
      accountName: 'Northstar Foods',
      opportunityId: 'demo-opp-northstar-foods-lab',
      opportunityName: 'Lab workflow',
      title: 'Lab workflow implementation',
      quoteDate: sixDaysAgo,
      validUntil: nextWeek,
      amount: 450000000,
      currency: 'VND',
      grossMarginEstimate: 31,
      discount: 5,
      paymentTerm: '30 days after delivery',
      status: 'Accepted',
      poStatus: 'Received',
      deliveryStatus: 'Scheduled',
      expectedDeliveryDate: nextWeek,
      paymentStatus: 'Not due',
      paymentDueDate: '',
      nextAction: 'Confirm installation slot with the lab manager.',
      notes: 'PO received and delivery planning is active.',
      createdAt: timestamp,
    }),
    sampleQuote({
      id: 'demo-quote-summit-qc',
      quoteId: 'Q-DEMO-SUMMIT-01',
      accountName: 'Summit Diagnostics',
      opportunityId: 'demo-opp-summit-diagnostics-qc-workflow',
      opportunityName: 'QC workflow',
      title: 'QC workflow delivery',
      quoteDate: sixDaysAgo,
      validUntil: nextWeek,
      amount: 650000000,
      currency: 'VND',
      grossMarginEstimate: 32,
      discount: 6,
      paymentTerm: 'Due on delivery',
      status: 'Accepted',
      poStatus: 'Received',
      deliveryStatus: 'Delivered',
      expectedDeliveryDate: twoDaysAgo,
      paymentStatus: 'Due',
      paymentDueDate: yesterday,
      nextAction: 'Confirm payment release date with finance.',
      notes: 'Delivery completed; payment release is overdue.',
      createdAt: timestamp,
    }),
  ];

  const brief = {
    ...generatePipelineDefenseBriefFromOpportunities(opportunities.slice(0, 5), {
      title: `Demo Defense Brief - ${today}`,
      weekLabel: 'Demo week',
      salesOwner: 'Demo Sales Owner',
      scope: 'Demo sandbox opportunities',
    }, objections, stakeholders, activities, actionOutcomes, salesAssets),
    id: 'demo-brief-pipeline-defense',
  } as PipelineDefenseBrief;

  return {
    activities,
    opportunities,
    accounts,
    stakeholders,
    objections,
    actionOutcomes,
    salesAssets,
    quotes,
    briefs: [markSampleBrief(brief)],
  };
}

function sampleActivity(input: {
  id: string;
  note: string;
  activityDate: string;
  linkedOpportunityId: string;
  linkedOpportunityName: string;
  linkedAccountName: string;
  createdAt: string;
}): SalesActivityRecord {
  const classified = classifySalesActivity(input.note, input.activityDate);
  return markSampleRecord({
    ...classified,
    id: input.id,
    linkedOpportunityId: input.linkedOpportunityId,
    linkedOpportunityName: input.linkedOpportunityName,
    linkedAccountName: input.linkedAccountName,
    linkStatus: 'Linked',
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    storageMode: 'local',
  });
}

function sampleEmailThreadActivity(input: {
  id: string;
  subject: string;
  sender: string;
  recipients: string;
  body: string;
  activityDate: string;
  linkedOpportunityId: string;
  linkedOpportunityName: string;
  linkedAccountName: string;
  createdAt: string;
}): SalesActivityRecord {
  const sourceItem = buildEmailThreadIngestion({
    sourceType: 'pasted-email',
    subject: input.subject,
    sender: input.sender,
    recipients: input.recipients,
    body: input.body,
    sourceDate: input.activityDate,
    accountHint: input.linkedAccountName,
    opportunityHint: input.linkedOpportunityName,
  });
  const parserText = composeIngestionParserText(sourceItem, {
    accountHint: input.linkedAccountName,
    opportunityHint: input.linkedOpportunityName,
  });
  const classified = classifySalesActivity(parserText, input.activityDate, {
    accounts: [{ id: `account-${input.linkedAccountName}`, accountName: input.linkedAccountName }],
    opportunities: [{
      id: input.linkedOpportunityId,
      accountName: input.linkedAccountName,
      opportunityName: input.linkedOpportunityName,
      productOrSolution: '',
      stage: 'Procurement',
    }],
    source: sourceItem,
  });

  return markSampleRecord({
    ...classified,
    id: input.id,
    accountName: input.linkedAccountName,
    opportunityName: input.linkedOpportunityName,
    sourceType: sourceItem.sourceType,
    sourceLabel: sourceItem.sourceLabel,
    sourceTimestamp: sourceItem.sourceTimestamp,
    sourceHash: sourceItem.safeHash,
    originalExcerpt: sourceItem.originalExcerpt,
    tags: Array.from(new Set([...classified.tags, ...buildIngestionSourceTags(sourceItem), 'demo-pasted-email'])),
    linkedOpportunityId: input.linkedOpportunityId,
    linkedOpportunityName: input.linkedOpportunityName,
    linkedAccountName: input.linkedAccountName,
    linkStatus: 'Linked',
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    storageMode: 'local',
  });
}

function sampleOpportunity(input: Omit<CrmLiteOpportunity, 'currency' | 'updatedAt' | 'storageMode'>): CrmLiteOpportunity {
  return markSampleRecord({
    ...input,
    currency: 'VND',
    updatedAt: input.createdAt,
    storageMode: 'local',
  });
}

function sampleAccount(input: Omit<AccountMemoryRecord, 'updatedAt' | 'storageMode'>): AccountMemoryRecord {
  return markSampleRecord({
    ...input,
    updatedAt: input.createdAt,
    storageMode: 'local',
  });
}

function sampleStakeholder(input: Omit<StakeholderRecord, 'accountId' | 'email' | 'phone' | 'updatedAt' | 'storageMode'>): StakeholderRecord {
  return markSampleRecord({
    ...input,
    accountId: '',
    email: '',
    phone: '',
    updatedAt: input.createdAt,
    storageMode: 'local',
  });
}

function sampleObjection(input: Omit<ObjectionRecord, 'accountId' | 'userId' | 'resolvedAt' | 'resolutionNote' | 'updatedAt' | 'storageMode'>): ObjectionRecord {
  return markSampleRecord({
    ...input,
    accountId: '',
    userId: undefined,
    resolvedAt: input.status === 'Resolved' ? input.createdAt : '',
    resolutionNote: input.status === 'Resolved' ? input.responsePlan : '',
    updatedAt: input.createdAt,
    storageMode: 'local',
  });
}

function sampleActionOutcome(input: Omit<ActionOutcomeRecord, 'updatedAt' | 'source' | 'isSample'>): ActionOutcomeRecord {
  return markSampleRecord({
    ...input,
    updatedAt: input.completedAt ? `${input.completedAt}T12:00:00.000Z` : input.createdAt,
  });
}

function sampleAsset(input: Omit<SalesAssetRecord, 'updatedAt' | 'source' | 'isSample'>): SalesAssetRecord {
  return markSampleRecord({
    ...input,
    updatedAt: input.createdAt,
  });
}

function sampleQuote(input: Omit<QuoteRecord, 'updatedAt' | 'source' | 'isSample'>): QuoteRecord {
  return markSampleRecord({
    ...input,
    updatedAt: input.createdAt,
  });
}

function markSampleRecord<T extends object>(record: T): T {
  return {
    ...record,
    source: SAMPLE_DATA_NAMESPACE,
    isSample: true,
  };
}

function markSampleBrief(brief: PipelineDefenseBrief): PipelineDefenseBrief {
  return markSampleRecord({
    ...brief,
    source: SAMPLE_DATA_NAMESPACE,
    isSample: true,
  }) as PipelineDefenseBrief;
}

function writeLocalArray<T extends { id: string }>(key: string, records: T[]) {
  if (typeof window === 'undefined') return;
  try {
    const existing = JSON.parse(window.localStorage.getItem(key) || '[]') as T[];
    const cleanExisting = existing.filter((item) => !isSampleRecord(item as SampleRecord));
    window.localStorage.setItem(key, JSON.stringify([...records, ...cleanExisting]));
  } catch {
    window.localStorage.setItem(key, JSON.stringify(records));
  }
}

function writeLocalBriefs(briefs: PipelineDefenseBrief[]) {
  if (typeof window === 'undefined') return;
  const currentStore = readRawBriefStore();
  const cleanBriefs = currentStore.briefs.filter((brief) => !isSampleRecord(brief as SampleRecord));
  const nextStore: PipelineDefenseBriefStore = {
    activeBriefId: briefs[0]?.id || cleanBriefs[0]?.id || '',
    briefs: [...briefs, ...cleanBriefs],
  };
  window.localStorage.setItem(MULTI_BRIEF_STORAGE_KEY, JSON.stringify(nextStore));
}

function removeSampleRecords(key: string) {
  if (typeof window === 'undefined') return;
  try {
    const existing = JSON.parse(window.localStorage.getItem(key) || '[]') as SampleRecord[];
    window.localStorage.setItem(key, JSON.stringify(existing.filter((item) => !isSampleRecord(item))));
  } catch {
    // Keep user data untouched if parsing fails.
  }
}

function removeLegacySampleRecords(key: string) {
  if (typeof window === 'undefined') return;
  try {
    const existing = JSON.parse(window.localStorage.getItem(key) || '[]') as SampleRecord[];
    window.localStorage.setItem(key, JSON.stringify(existing.filter((item) => !containsLegacySampleTerm(item))));
  } catch {
    // Keep local data untouched if parsing fails.
  }
}

function removeSampleBriefs() {
  if (typeof window === 'undefined') return;
  const currentStore = readRawBriefStore();
  const briefs = currentStore.briefs.filter((brief) => !isSampleRecord(brief as SampleRecord));
  if (briefs.length === 0) {
    window.localStorage.removeItem(MULTI_BRIEF_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(MULTI_BRIEF_STORAGE_KEY, JSON.stringify({
    activeBriefId: briefs.some((brief) => brief.id === currentStore.activeBriefId) ? currentStore.activeBriefId : briefs[0].id,
    briefs,
  }));
}

function removeLegacySampleBriefs() {
  if (typeof window === 'undefined') return;
  const currentStore = readRawBriefStore();
  const briefs = currentStore.briefs.filter((brief) => !containsLegacySampleTerm(brief));
  if (briefs.length === 0) {
    window.localStorage.removeItem(MULTI_BRIEF_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(MULTI_BRIEF_STORAGE_KEY, JSON.stringify({
    activeBriefId: briefs.some((brief) => brief.id === currentStore.activeBriefId) ? currentStore.activeBriefId : briefs[0].id,
    briefs,
  }));
}

function readRawBriefStore(): PipelineDefenseBriefStore {
  if (typeof window === 'undefined') return { activeBriefId: '', briefs: [] };
  try {
    const parsed = JSON.parse(window.localStorage.getItem(MULTI_BRIEF_STORAGE_KEY) || '{}') as Partial<PipelineDefenseBriefStore>;
    return {
      activeBriefId: typeof parsed.activeBriefId === 'string' ? parsed.activeBriefId : '',
      briefs: Array.isArray(parsed.briefs) ? parsed.briefs as PipelineDefenseBrief[] : [],
    };
  } catch {
    return { activeBriefId: '', briefs: [] };
  }
}

function isSampleRecord(record: SampleRecord | PipelineDefenseBrief) {
  const maybeRecord = record as SampleRecord;
  return (
    maybeRecord.isSample === true ||
    maybeRecord.source === SAMPLE_DATA_NAMESPACE ||
    Boolean(maybeRecord.id?.startsWith('demo-')) ||
    maybeRecord.tags?.includes('demo-data') ||
    maybeRecord.title?.toLowerCase().includes('demo defense brief')
  );
}

function hasLegacySampleTerms() {
  if (typeof window === 'undefined') return false;
  return [...SAMPLE_ARRAY_STORAGE_KEYS, MULTI_BRIEF_STORAGE_KEY].some((key) => {
    const value = window.localStorage.getItem(key);
    return value ? containsLegacySampleTerm(value) : false;
  });
}

function containsLegacySampleTerm(value: unknown) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  const normalized = text.toLowerCase();
  return LEGACY_SAMPLE_TERMS.some((term) => normalized.includes(term.toLowerCase()));
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function nextWeekday(date: Date, targetDay: number) {
  const next = new Date(date);
  const currentDay = next.getDay();
  const distance = (targetDay - currentDay + 7) % 7 || 7;
  next.setDate(next.getDate() + distance);
  return next;
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}
