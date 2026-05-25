import { ACCOUNT_STORAGE_KEY, type AccountMemoryRecord } from '../services/accountStore';
import { OPPORTUNITY_STORAGE_KEY, type CrmLiteOpportunity } from '../services/opportunityStore';
import { SALES_ACTIVITY_STORAGE_KEY, type SalesActivityRecord } from '../services/salesActivityStore';
import { classifySalesActivity } from './salesActivityClassifier';
import { generatePipelineDefenseBriefFromOpportunities } from './opportunityToPipelineBrief';
import {
  MULTI_BRIEF_STORAGE_KEY,
  loadPipelineDefenseBriefStore,
  type PipelineDefenseBrief,
  type PipelineDefenseBriefStore,
} from './pipelineDefenseStorage';

export const SAMPLE_DATA_FLAG_KEY = 'memoire.sampleData.loaded';
export const SAMPLE_DATA_NAMESPACE = 'demo';

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
  } catch {
    // Sample flag is best-effort only.
  }
}

export function clearSampleDataFlag() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(SAMPLE_DATA_FLAG_KEY);
  } catch {
    // Ignore localStorage cleanup failures.
  }
}

export function loadSampleDataset(): SampleDataset {
  const dataset = buildSampleDataset();

  writeLocalArray(SALES_ACTIVITY_STORAGE_KEY, dataset.activities);
  writeLocalArray(OPPORTUNITY_STORAGE_KEY, dataset.opportunities);
  writeLocalArray(ACCOUNT_STORAGE_KEY, dataset.accounts);
  writeLocalBriefs(dataset.briefs);
  markSampleDataLoaded();

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
  removeSampleBriefs();
  clearSampleDataFlag();
}

function buildSampleDataset(): SampleDataset {
  const now = new Date();
  const timestamp = now.toISOString();
  const today = toDateKey(now);
  const yesterday = toDateKey(addDays(now, -1));
  const twoDaysAgo = toDateKey(addDays(now, -2));
  const fourDaysAgo = toDateKey(addDays(now, -4));
  const sixDaysAgo = toDateKey(addDays(now, -6));
  const nextTuesday = toDateKey(nextWeekday(now, 2));
  const friday = toDateKey(nextWeekday(now, 5));
  const nextWeek = toDateKey(addDays(now, 7));

  const opportunities: CrmLiteOpportunity[] = [
    sampleOpportunity({
      id: 'demo-opp-vhp-solidfog-phase-2',
      accountName: 'VHP',
      opportunityName: 'SolidFog EU-GMP Phase 2',
      stage: 'Negotiation',
      estimatedValue: 2400000000,
      expectedClosePeriod: 'Next quarter',
      productOrSolution: 'SolidFog EU-GMP decontamination expansion',
      decisionMaker: 'Dr. Linh',
      budgetOwner: 'CFO office',
      procurementPath: 'Direct procurement after technical sign-off',
      technicalCriteria: 'EU-GMP compliance, validation package, service response SLA',
      nextAction: 'Send revised quote and procurement checklist',
      nextActionDate: friday,
      evidence: 'Budget approved; Dr. Linh confirmed next-quarter project window and procurement owner.',
      missingContext: 'Final PO issue date',
      objectionDebt: '',
      forecastEvidenceCategory: 'Defensible',
      decisionRecommendation: 'Defend',
      status: 'Active',
      createdAt: timestamp,
    }),
    sampleOpportunity({
      id: 'demo-opp-vhp-service-renewal',
      accountName: 'VHP',
      opportunityName: 'Vaporized H2O2 service renewal',
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
      id: 'demo-opp-control-union-microbiology',
      accountName: 'Control Union',
      opportunityName: 'Microbiology workflow',
      stage: 'Proposal',
      estimatedValue: 450000000,
      expectedClosePeriod: 'Next month',
      productOrSolution: 'Microbiology workflow',
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
      id: 'demo-opp-tv-pharm-tender',
      accountName: 'TV Pharm',
      opportunityName: 'Tender opportunity',
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
      id: 'demo-opp-bidiphar-qc-workflow',
      accountName: 'Bidiphar',
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
      id: 'demo-opp-control-union-food-safety',
      accountName: 'Control Union',
      opportunityName: 'Food safety rapid testing',
      stage: 'Demo',
      estimatedValue: 320000000,
      expectedClosePeriod: 'Next quarter',
      productOrSolution: 'Rapid testing workflow',
      decisionMaker: 'Operations lead',
      budgetOwner: '',
      procurementPath: 'Demo feedback before budget request',
      technicalCriteria: 'Throughput, validation evidence, reagent availability',
      nextAction: 'Schedule technical demo feedback call',
      nextActionDate: nextTuesday,
      evidence: 'Demo completed with technical team; operations lead requested validation references.',
      missingContext: 'Budget owner',
      objectionDebt: '',
      forecastEvidenceCategory: 'Weak but recoverable',
      decisionRecommendation: 'Monitor',
      status: 'Active',
      createdAt: timestamp,
    }),
  ];

  const accounts: AccountMemoryRecord[] = [
    sampleAccount({
      id: 'demo-account-vhp',
      accountName: 'VHP',
      segment: 'Strategic pharma',
      industry: 'Pharma',
      location: 'Vietnam',
      accountPotential: 'High',
      relationshipStatus: 'Strong',
      keyStakeholders: ['Dr. Linh', 'Engineering manager', 'CFO office'],
      notes: 'Healthy strategic account with budget signal and active EU-GMP expansion work.',
      tags: ['demo-data', 'pharma', 'strategic'],
      createdAt: timestamp,
    }),
    sampleAccount({
      id: 'demo-account-control-union',
      accountName: 'Control Union',
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
      id: 'demo-account-tv-pharm',
      accountName: 'TV Pharm',
      segment: 'Pharma manufacturer',
      industry: 'Pharma',
      location: 'Vietnam',
      accountPotential: 'High',
      relationshipStatus: 'At risk',
      keyStakeholders: ['Procurement lead'],
      notes: 'Tender opportunity exists, but procurement path and decision committee remain unclear.',
      tags: ['demo-data', 'tender'],
      createdAt: timestamp,
    }),
    sampleAccount({
      id: 'demo-account-bidiphar',
      accountName: 'Bidiphar',
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
      id: 'demo-activity-vhp-budget',
      note: 'Met with Dr. Linh at VHP today. They confirmed budget approval for SolidFog Phase 2 next quarter. Need to send revised quote by Friday and follow up with procurement next Tuesday. Competitor STERIS still in the loop.',
      activityDate: today,
      linkedOpportunityId: 'demo-opp-vhp-solidfog-phase-2',
      linkedOpportunityName: 'SolidFog EU-GMP Phase 2',
      linkedAccountName: 'VHP',
      createdAt: timestamp,
    }),
    sampleActivity({
      id: 'demo-activity-control-union-lead-time',
      note: 'Called Control Union lab manager. They like the microbiology workflow but are worried about lead time. Need to send local support proof next week.',
      activityDate: yesterday,
      linkedOpportunityId: 'demo-opp-control-union-microbiology',
      linkedOpportunityName: 'Microbiology workflow',
      linkedAccountName: 'Control Union',
      createdAt: timestamp,
    }),
    sampleActivity({
      id: 'demo-activity-tv-pharm-tender',
      note: 'Followed up with TV Pharm procurement. Tender timeline still unclear and committee owner not confirmed. Need to clarify procurement path next week.',
      activityDate: twoDaysAgo,
      linkedOpportunityId: 'demo-opp-tv-pharm-tender',
      linkedOpportunityName: 'Tender opportunity',
      linkedAccountName: 'TV Pharm',
      createdAt: timestamp,
    }),
    sampleActivity({
      id: 'demo-activity-bidiphar-gap',
      note: 'Reviewed Bidiphar QC workflow. No confirmed decision maker, close period, or next action. Should downgrade until real evidence appears.',
      activityDate: fourDaysAgo,
      linkedOpportunityId: 'demo-opp-bidiphar-qc-workflow',
      linkedOpportunityName: 'QC workflow',
      linkedAccountName: 'Bidiphar',
      createdAt: timestamp,
    }),
    sampleActivity({
      id: 'demo-activity-vhp-service',
      note: 'Sent service renewal proposal to VHP engineering manager. They requested updated SLA and weekend coverage note by Friday.',
      activityDate: sixDaysAgo,
      linkedOpportunityId: 'demo-opp-vhp-service-renewal',
      linkedOpportunityName: 'Vaporized H2O2 service renewal',
      linkedAccountName: 'VHP',
      createdAt: timestamp,
    }),
    sampleActivity({
      id: 'demo-activity-control-union-demo',
      note: 'Completed technical demo with Control Union operations team for food safety rapid testing. Need to send validation references before next Tuesday.',
      activityDate: twoDaysAgo,
      linkedOpportunityId: 'demo-opp-control-union-food-safety',
      linkedOpportunityName: 'Food safety rapid testing',
      linkedAccountName: 'Control Union',
      createdAt: timestamp,
    }),
    sampleActivity({
      id: 'demo-activity-internal-vhp',
      note: 'Internal coordination with service and finance team for VHP SolidFog quote. Finance confirmed discount guardrail and service confirmed installation capacity next quarter.',
      activityDate: yesterday,
      linkedOpportunityId: 'demo-opp-vhp-solidfog-phase-2',
      linkedOpportunityName: 'SolidFog EU-GMP Phase 2',
      linkedAccountName: 'VHP',
      createdAt: timestamp,
    }),
    sampleActivity({
      id: 'demo-activity-tv-pharm-competitor',
      note: 'TV Pharm mentioned competitor BioMérieux during tender discussion. Need to collect differentiator evidence before procurement meeting.',
      activityDate: today,
      linkedOpportunityId: 'demo-opp-tv-pharm-tender',
      linkedOpportunityName: 'Tender opportunity',
      linkedAccountName: 'TV Pharm',
      createdAt: timestamp,
    }),
  ];

  const brief = {
    ...generatePipelineDefenseBriefFromOpportunities(opportunities.slice(0, 5), {
      title: `Demo Defense Brief - ${today}`,
      weekLabel: 'Demo week',
      salesOwner: 'Demo Sales Owner',
      scope: 'Demo sandbox opportunities',
    }),
    id: 'demo-brief-pipeline-defense',
  } as PipelineDefenseBrief;

  return {
    activities,
    opportunities,
    accounts,
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
