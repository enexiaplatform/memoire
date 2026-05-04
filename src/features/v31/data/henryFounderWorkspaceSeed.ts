import { DEMO_USER_ID } from '../../../lib/demoMode';
import type { Account, Contact, Interaction, Objection, Opportunity, SalesAction } from '../../../types/v31';
import {
  attachSourceMetadata,
  deriveBlockersFromExplicitText,
  mapOpportunityStage,
  normalizeAccountName,
  parseOpenTiming,
  type ReviewFlag,
  type SourceInfo,
} from '../utils/normalizeFounderWorkspaceData';

export const HENRY_FOUNDER_WORKSPACE_LABEL = 'Henry Founder Workspace';

type FounderAccount = Account & { aliases?: string[]; nextStep?: string } & ReviewFlag & { sourceMetadata: SourceInfo };
type FounderContact = Contact & ReviewFlag & { sourceMetadata: SourceInfo };
type FounderOpportunity = Opportunity & ReviewFlag & {
  sourceMetadata: SourceInfo;
  sourceProbability?: string;
  rawProbability?: string;
  confidenceHint?: string;
  timingLabel?: string;
  tentativeTiming?: string;
  rawOpenTiming?: string;
  product?: string;
  brand?: string;
  type?: string;
  channel?: string;
  pricingContexts?: FounderPricingContext[];
};
type FounderInteraction = Interaction & ReviewFlag & { sourceMetadata: SourceInfo };
type FounderAction = SalesAction & ReviewFlag & { sourceMetadata: SourceInfo; timingLabel?: string; rawOpenTiming?: string };
type FounderObjection = Objection & ReviewFlag & { sourceMetadata: SourceInfo };

export interface FounderBrandReference {
  brand: string;
  segment: string;
  type: string;
  margin: string;
  approvalStatus: string;
  volumeTier: string;
  marginTier: string;
  rank: string;
  sourceMetadata: SourceInfo;
}

export interface FounderPricingContext {
  id: string;
  customer: string;
  product: string;
  brand: string;
  quantity: string;
  stage: string;
  status: string;
  rawSource: string;
  sourceMetadata: SourceInfo;
  needsReview?: boolean;
  reviewReason?: string;
}

export interface HenryFounderWorkspaceSeed {
  label: string;
  generatedAt: string;
  accounts: FounderAccount[];
  contacts: FounderContact[];
  opportunities: FounderOpportunity[];
  interactions: FounderInteraction[];
  actions: FounderAction[];
  objections: FounderObjection[];
  brandReferences: FounderBrandReference[];
  pricingContexts: FounderPricingContext[];
  reviewFlags: Array<{ recordType: string; recordId: string; reason: string }>;
}

const importedAt = '2026-05-03T00:00:00.000Z';

const accountRows = [
  {
    rawName: 'Pymepharco',
    segment: 'Pharma',
    territory: 'Central',
    province: 'Đak Lak',
    gmp: 'EU-GMP',
    status: 'active',
    application: 'EM+Sterility+Endo / SVP',
    background: 'Customer is using TSA + LT + Cephase - ICR and Tryp. soy broth media fill bag. Converting to PMM.',
    sourceRow: 48,
  },
  {
    rawName: 'Samil Pharmaceutical',
    segment: 'Pharma',
    territory: 'South',
    province: 'Ho Chi Minh City',
    gmp: 'DAV GMP; pursuing kGMP, cGMP, EU-GMP',
    status: 'active',
    application: 'Eye-drop CDMO / ophthalmology',
    background: 'Korean CDMO, ophthalmology specialty. Phase 2 building under construction.',
    sourceRow: 13,
  },
  {
    rawName: 'FT Pharma',
    segment: 'Pharma',
    territory: 'South',
    province: 'Long An',
    gmp: 'WHO-GMP',
    status: 'active',
    application: 'EM+Sterility+Endo / LVP',
    background: 'Sales Opportunities: Sterility pump (Tailin) + Canister + Media.',
    nextStep: 'Follow up DKSH package tender',
    sourceRow: 40,
  },
  {
    rawName: 'Terumo BCT',
    segment: 'Medical Device',
    territory: 'South',
    province: 'Đồng Nai',
    gmp: 'WHO-GMP / ISO 13485',
    status: 'active',
    application: 'EM+Sterility+Endo / Medical',
    background: 'Using Sartorius pump. Sales Opportunities: Canister Tailin replaced to Sartorius.',
    nextStep: 'Request sample canister for Terumo',
    sourceRow: 27,
  },
  {
    rawName: 'Bidiphar',
    segment: 'Pharma',
    territory: 'Central',
    province: 'Gia Lai',
    gmp: 'EU-GMP',
    status: 'active',
    application: 'EM+Sterility+Endo / SVP',
    background: 'Top 4 Vietnam pharma 2025. Cancer drug line. Henry prior relationship.',
    sourceRow: 29,
  },
  {
    rawName: 'TV Pharm',
    segment: 'Pharma',
    territory: 'South',
    province: '',
    gmp: '',
    status: 'active',
    application: 'EU-GMP Phase 2 / VHP',
    background: 'EU-GMP Phase 2 tender. VHP bid via DKSH. Tender pending May.',
    sourceRow: 20,
  },
  {
    rawName: 'VNVC',
    segment: 'Pharma',
    territory: '',
    province: '',
    gmp: '',
    status: 'active',
    application: 'Tailin AST platform',
    background: 'Vaccination chain. Multi-site rollout potential. Qualifying via DKSH partnership.',
    sourceRow: 17,
  },
  {
    rawName: 'Cuu Long Pharma',
    segment: 'Pharma',
    territory: 'Mekong',
    province: '',
    gmp: '',
    status: 'active',
    application: 'Instruments + consumables',
    background: 'Mekong pharma. Multi-product opportunity. Early discovery and long-term cultivation.',
    sourceRow: 24,
  },
  {
    rawName: 'Allomed',
    segment: 'Pharma',
    territory: 'South',
    province: 'Bình Dương',
    gmp: 'WHO-GMP',
    status: 'active',
    application: 'EM+Sterility / LVP',
    background: 'Pricing context exists in combined Allomed & Tenamyd AMD280 deal.',
    sourceRow: 28,
  },
  {
    rawName: 'Tenamyd',
    segment: 'Pharma',
    territory: 'South',
    province: '',
    gmp: '',
    status: 'active',
    application: 'Instruments / media filling',
    background: 'Pricing context exists in combined Allomed & Tenamyd AMD280 deal.',
    sourceRow: 26,
  },
  {
    rawName: 'Boston Pharma',
    segment: 'Pharma',
    territory: 'South',
    province: 'Bình Dương',
    gmp: 'WHO-GMP',
    status: 'active',
    application: 'EM / Tablet-Capsule',
    background: 'Lab Water System opportunity from pipeline.',
    sourceRow: 33,
  },
  {
    rawName: 'DHG Pharma',
    segment: 'Pharma',
    territory: 'Mekong',
    province: 'Cần Thơ',
    gmp: 'Japan-GMP',
    status: 'active',
    application: 'Plant-specific pharma opportunities',
    background: 'Parent account for DHG Pharma plant-specific accounts. Preserve plant details as sub-context.',
    sourceRow: 34,
  },
  {
    rawName: 'FKV',
    segment: 'Pharma',
    territory: 'South',
    province: 'Gia Lai',
    gmp: 'WHO-GMP',
    status: 'active',
    application: 'EM+Sterility / LVP',
    background: 'Sartorius pump. 6000 canister/year.',
    sourceRow: 23,
  },
  {
    rawName: 'Phuc Thinh Food',
    segment: 'F&B',
    territory: 'South',
    province: 'Thành phố Hồ Chí Minh',
    gmp: '',
    status: 'active',
    application: 'RMM + DCM media / Spice',
    background: 'Stakeholder: Mr. Duong (QCM) from URC. Product: Spice & EU Export. Opportunities: DCM, RTU TSA + blood sheep.',
    sourceRow: 17,
  },
  {
    rawName: 'Control Union',
    segment: 'Service Lab',
    territory: '',
    province: '',
    gmp: '',
    status: 'active',
    application: 'UV-VIS',
    background: 'Pipeline opportunity for UV-VIS / Scitek instrument.',
    sourceRow: 15,
  },
  {
    rawName: 'Bitechphar',
    segment: 'Pharma',
    territory: 'South',
    province: 'Gia Lai',
    gmp: 'WHO-GMP',
    status: 'active',
    application: 'EM+Sterility+Endo / LVP',
    background: 'Using Sartorius pump + Lonza Endotoxin. Prospecting: VHP + Protak + BI.',
    nextStep: 'Discuss with channel partner Viet Eco Supply',
    sourceRow: 32,
  },
  {
    rawName: 'Vinamilk Can Tho',
    segment: 'F&B',
    territory: 'Mekong',
    province: 'Cần Thơ',
    gmp: '',
    status: 'active',
    application: 'RMM + DCM media / Dairy',
    background: 'Stakeholder: Ms. Giao. Prospecting: RMM CertaBlue; Media CulturaLab.',
    nextStep: 'Engage Ms. Giao (26/02)',
    sourceRow: 19,
  },
  {
    rawName: 'Imexpharm',
    segment: 'Pharma',
    territory: 'South',
    province: 'Bình Dương',
    gmp: 'EU-GMP',
    status: 'active',
    application: 'EM+Sterility+Endo / SVP',
    background: 'IMP5 project in Cao Lanh. KOL: Binh Duong plant - Mr. Le Van An. Prospecting: VHP + Protak + CMD + Tailin AST.',
    nextStep: 'Contact Mr. An next week for booking visit',
    sourceRow: 42,
  },
];

const accountIds = new Map<string, string>();

function accountId(rawName: string) {
  const normalized = normalizeAccountName(rawName);
  const id = `henry-account-${slug(normalized.canonicalName)}`;
  accountIds.set(normalized.canonicalName, id);
  return id;
}

const accounts: FounderAccount[] = accountRows.map((row) => {
  const normalized = normalizeAccountName(row.rawName);
  const review = {
    needsReview: normalized.needsReview,
    reviewReason: normalized.reviewReason,
  };
  return attachSourceMetadata({
    id: accountId(row.rawName),
    user_id: DEMO_USER_ID,
    name: normalized.canonicalName,
    summary: row.background,
    industry: row.segment,
    status: row.status as Account['status'],
    pain_points: [],
    objections: deriveBlockersFromExplicitText(row.background).map((blocker) => blocker.title),
    source_capture_id: null,
    created_at: importedAt,
    updated_at: importedAt,
    aliases: row.rawName === normalized.canonicalName ? [] : [row.rawName],
    territory: row.territory,
    province: row.province,
    gmpStatus: row.gmp,
    application: row.application,
    nextStep: row.nextStep || '',
  }, source('4. Master_Database_FY26', 'tblAccounts', row.sourceRow, row.background), review);
});

const contacts: FounderContact[] = [
  contact('STADA Pymepharco', 'Ms. Trinh', 'QC Manager', 'H', 'Strong', '', 'KA account plan contact.', 20),
  contact('STADA Pymepharco', 'Ms. Nhu', 'Purchasing', 'M', 'Strong', '29/04/2026', 'KA account plan contact.', 21),
  contact('Samil Pharmaceutical', 'Mr. Jaewon Kim', '', '', '', '', 'KA account plan contact.', 20),
  contact('Samil Pharmaceutical', 'Mr. Kwon Dae Hoon', 'QC Manager', '', '', '', 'KA account plan contact.', 21),
  contact('Samil Pharmaceutical', 'Mr. Lee Huynchul', '', '', '', '', 'KA account plan contact.', 22),
  contact('Terumo BCT Vietnam', 'Ms. Dao My', '', '', '', '', 'KA account plan contact.', 20),
  contact('Terumo BCT Vietnam', 'Mr. Hien', '', '', '', '', 'KA account plan contact.', 21),
];

const opportunityRows = [
  opp('Samil', 'EM / PMM RTU', 'EM', 'PMM', 'RTU', 'Direct', '0,9', '', '50.000', '', '04Apr/W2', 11),
  opp('Samil', 'BI / Tailin consumables', 'BI', 'Tailin', 'Cons', 'Direct', '0,9', '', '3.500', '', '04Apr/W2', 12),
  opp('Samil', 'EM / PMM Phase 2', 'EM', 'PMM', 'RTU', 'Direct', '0,6', '', '100.000', '', '', 13),
  opp('TV Pharm', 'VHP / SolidFog EU-GMP Phase 2', 'VHP', 'SolidFog', 'Instrument', 'DKSH', '0,6', 'EU-GMP phase 2 project', '90.000', '', '03Mar/W1', 14, 'Tender pending'),
  opp('Control Union', 'UV-VIS / Scitek instrument', 'UV-VIS', 'Scitek', 'Instrument', 'Direct', '0,6', '', '4.000', '', '03Mar/W4', 15),
  opp('Pymepharco', 'EM / PMM RTU', 'EM', 'PMM', 'RTU', 'VES', '0,6', '', '40.000', '', '04Apr/W2', 16),
  opp('FT Pharma', 'BI / Tailin consumables', 'BI', 'Tailin', 'Cons', 'Direct', '0,3', '', '1.000', '', '01Jan/W4', 17),
  opp('Allomed', 'Endotoxin / BOKANG consumables', 'Endotoxin', 'BOKANG', 'Cons', 'Direct', '0,3', '', '7.000', '', '04Apr/W4', 18),
  opp('Pymepharco', 'Media Fill / PMM RTU', 'Media Fill', 'PMM', 'RTU', 'VES', '0,3', '', '100.000', '', '04Apr/W4', 19),
  opp('Terumo BCT', 'Canister / Tailin consumables', 'Canister', 'Tailin', 'Cons', 'Direct', '0,3', 'Sartorius pump IB x 3', '52.000', '', '03Mar/W3', 20),
  opp('Boston Pharma', 'Lab Water System / Scitek', 'Lab Water System', 'Scitek', 'Instrument', 'DKSH', '0,3', '', '10.000', '', '03Mar/W1', 21),
  opp('Fresenius Kabi Vietnam', 'Canister / Tailin consumables', 'Canister', 'Tailin', 'Cons', 'VES', '0,3', 'Sartorius pump. 6000 canister/year', '50.000', '', '04Apr/W2', 23),
  opp('DHG Pharma', 'Auto Colony Counter / Tailin', 'Auto Colony Counter', 'Tailin', 'Instrument', 'Direct', '0,3', 'Parent account; plant context needs review.', '30.000', '', '04Apr/W3', 24, '', true),
  opp('FT Pharma', 'Sterility Pump / Tailin', 'Sterility Pump', 'Tailin', 'Instrument', 'DKSH', '0,3', '', '25.000', '', '03Mar/W2', 27),
  opp('Tenamyd', 'Auto Media Filling / Geevo', 'Auto Media Filling', 'Geevo', 'Instrument', 'Direct', '0,3', '', '25.000', '', '04Apr/W1', 29),
  opp('Phuc Thinh Food', 'RTU / CulturaLab media', 'RTU', 'CulturaLab', 'Media', 'Direct', '0,1', 'New Laboratory', '5.000', '', '03Mar/W1', 39, '', true),
];

const pricingContexts: FounderPricingContext[] = [
  {
    id: 'henry-pricing-allomed-tenamyd-amd280',
    customer: 'Allomed & Tenamyd',
    product: 'AMD280',
    brand: 'GEEVO',
    quantity: '1',
    stage: 'Quoted',
    status: 'Awaiting PO',
    rawSource: '15/04/2026 | Allomed & Tenamyd | AMD280 | GEEVO | Quoted | Awaiting PO',
    sourceMetadata: source('5. Pricing_Margin_Monitor_FY26', '3. Deal Log', 6, 'Allomed & Tenamyd combined pricing context.'),
    needsReview: true,
    reviewReason: 'Combined Allomed & Tenamyd deal context preserved; current app does not support multi-account opportunity links.',
  },
  {
    id: 'henry-pricing-tv-pharm-dosymist-vhp',
    customer: 'TV Pharma',
    product: 'DosyMist VHP',
    brand: 'SolidFog',
    quantity: '4',
    stage: 'Tender',
    status: 'Tender pending',
    rawSource: '17/04/2026 | TV Pharma | DosyMist VHP | SolidFog | Tender | Tender pending',
    sourceMetadata: source('5. Pricing_Margin_Monitor_FY26', '3. Deal Log', 7, 'TV Pharma tender pricing context.'),
  },
];

const opportunities: FounderOpportunity[] = opportunityRows.map((row) => {
  const normalized = normalizeAccountName(row.account);
  const account_id = accountId(row.account);
  const timing = parseOpenTiming(row.open);
  const raw = [row.product, row.brand, row.type, row.channel, row.background, row.status, timing.timingLabel].filter(Boolean).join(' | ');
  const blockers = deriveBlockersFromExplicitText(raw);
  const matchedPricing = pricingContexts.filter((pricing) => normalizeAccountName(pricing.customer).canonicalName === normalized.canonicalName);

  return attachSourceMetadata({
    id: `henry-opportunity-${slug(normalized.canonicalName)}-${slug(row.name)}`,
    user_id: DEMO_USER_ID,
    account_id,
    contact_id: null,
    title: row.name,
    stage: mapOpportunityStage(row.status, row.probability),
    estimated_value: parseMoney(row.fy26),
    blocker: blockers[0]?.title || row.status || null,
    next_action_text: row.open ? `Review tentative timing: ${row.name} (${row.open})` : null,
    last_touch_at: importedAt,
    urgency: blockers.length > 0 ? 'high' : 'medium',
    confidence: confidenceFromProbability(row.probability),
    source_capture_id: null,
    created_at: importedAt,
    updated_at: importedAt,
    sourceProbability: row.probability,
    rawProbability: row.probability,
    confidenceHint: `Source probability: ${row.probability}`,
    ...timing,
    product: row.product,
    brand: row.brand,
    type: row.type,
    channel: row.channel,
    pricingContexts: matchedPricing,
  }, source('1. Pipeline_Forecast_FY26', '2. Pipeline', row.sourceRow, raw), {
    needsReview: row.needsReview || normalized.needsReview,
    reviewReason: row.needsReview
      ? 'Account or plant grouping needs Henry review.'
      : normalized.reviewReason,
  });
});

const interactions: FounderInteraction[] = [
  ...accounts.map((account) => noteInteraction(account, account.summary || '', account.sourceMetadata)),
  kaNote('STADA Pymepharco', 'Strategic rationale: EU-GMP certified, STADA Germany subsidiary, Q3 budget cycle.', 11),
  kaNote('Samil Pharmaceutical', 'Strategic rationale: Korean CDMO, ophthalmology specialty, Phase 2 building under construction.', 12),
  kaNote('F.T. Pharma', 'Strategic rationale: Zeria Japan subsidiary, EU-GMP plans, DKSH partnership channel.', 13),
  kaNote('Terumo BCT Vietnam', 'Current Micro QC Setup: Sartorius filtration pumps deployed (3 units); uses Tailin canisters as consumable.', 13),
  kaNote('Bidiphar', 'Strategic rationale: Top 4 Vietnam pharma 2025, cancer drug line, Henry prior relationship.', 15),
  kaNote('TV Pharm', 'Special Project: 60% tender submitted, awaiting result. May 2026 tender result, if won install Q3-Q4.', 9),
];

const actions: FounderAction[] = [
  ...accounts
    .filter((account) => Boolean(account.nextStep))
    .map((account) => action(account, account.nextStep || '', source('4. Master_Database_FY26', 'tblAccounts', account.sourceMetadata.sourceRow, account.nextStep || ''))),
  ...opportunities
    .filter((opportunity) => Boolean(opportunity.rawOpenTiming))
    .map((opportunity) => attachSourceMetadata({
      id: `henry-action-review-${opportunity.id}`,
      user_id: DEMO_USER_ID,
      account_id: opportunity.account_id,
      contact_id: null,
      opportunity_id: opportunity.id,
      interaction_id: null,
      title: opportunity.next_action_text || `Review ${opportunity.title}`,
      due_date: null,
      status: 'open' as const,
      suggested: true,
      source: 'manual' as const,
      created_at: importedAt,
      updated_at: importedAt,
      timingLabel: opportunity.timingLabel,
      rawOpenTiming: opportunity.rawOpenTiming,
    }, opportunity.sourceMetadata, { needsReview: true, reviewReason: 'Pipeline Open value kept as tentative timing, not a hard due date.' })),
];

const objections: FounderObjection[] = [
  ...interactions.flatMap((interaction) => deriveBlockersFromExplicitText(interaction.raw_note).map((blocker, index) => objection(interaction, blocker.title, blocker.detail, blocker.category, index))),
  ...pricingContexts.filter((pricing) => !pricing.needsReview).flatMap((pricing) => deriveBlockersFromExplicitText(`${pricing.status} ${pricing.rawSource}`).map((blocker, index) => {
    const normalized = normalizeAccountName(pricing.customer);
    const interaction = interactions.find((item) => item.account_id === accountIds.get(normalized.canonicalName));
    return objectionFromPricing(pricing, blocker.title, blocker.detail, blocker.category, index, interaction?.id || null);
  })),
];

const brandReferences: FounderBrandReference[] = [
  brand('Tailin', 'Pharma', 'Consumable', '30,0%', 'N', 'High', 'Star', '1', 5),
  brand('PMM', 'Pharma', 'Media', '30,0%', 'N', 'High', 'Star', '2', 6),
  brand('CulturaLab', 'Multiple', 'DCM', '15,0%', 'Y', 'High', 'Workhorse', '1', 7),
  brand('CertaBlue', 'F&B', 'Consumable', '20,0%', 'N', 'High', 'Workhorse', '2', 8),
  brand('Solidfog', 'Pharma', 'Instrument', '15,0%', 'Y', 'Low', 'Dog', '1', 9),
  brand('Protak', 'Pharma', 'Consumable', '20,0%', 'N', 'Low', 'Dog', '2', 10),
  brand('Scitek', 'Multiple', 'Instrument', '20,0%', 'N', 'Low', 'Dog', '5', 13),
  brand('Entegris', 'Pharma', 'Consumable', '25,0%', 'Y', 'Low', 'Gem', '1', 14),
];

const reviewFlags = [
  ...accounts.filter((item) => item.needsReview).map((item) => ({ recordType: 'account', recordId: item.id, reason: item.reviewReason || 'Needs Henry review.' })),
  ...opportunities.filter((item) => item.needsReview).map((item) => ({ recordType: 'opportunity', recordId: item.id, reason: item.reviewReason || 'Needs Henry review.' })),
  ...actions.filter((item) => item.needsReview).map((item) => ({ recordType: 'action', recordId: item.id, reason: item.reviewReason || 'Needs Henry review.' })),
  ...pricingContexts.filter((item) => item.needsReview).map((item) => ({ recordType: 'pricingContext', recordId: item.id, reason: item.reviewReason || 'Needs Henry review.' })),
];

export const henryFounderWorkspaceSeed: HenryFounderWorkspaceSeed = {
  label: HENRY_FOUNDER_WORKSPACE_LABEL,
  generatedAt: importedAt,
  accounts,
  contacts,
  opportunities,
  interactions,
  actions,
  objections,
  brandReferences,
  pricingContexts,
  reviewFlags,
};

function contact(accountName: string, name: string, role: string, influence: string, relationship: string, lastContact: string, notes: string, sourceRow: number): FounderContact {
  return attachSourceMetadata({
    id: `henry-contact-${slug(accountName)}-${slug(name)}`,
    user_id: DEMO_USER_ID,
    account_id: accountId(accountName),
    name,
    role: role || null,
    email: null,
    phone: null,
    notes: [influence && `Influence: ${influence}`, relationship && `Relationship: ${relationship}`, lastContact && `Last Contact: ${lastContact}`, notes].filter(Boolean).join(' | ') || null,
    source_capture_id: null,
    created_at: importedAt,
    updated_at: importedAt,
  }, source('2. KA_Strategy_FY26', accountName.includes('Pymepharco') ? 'Pymepharco' : accountName.includes('Samil') ? 'Samil' : 'Terumo BCT', sourceRow, notes));
}

function opp(account: string, name: string, product: string, brand: string, type: string, channel: string, probability: string, background: string, fy26: string, fy27: string, open: string, sourceRow: number, status = '', needsReview = false) {
  return { account, name, product, brand, type, channel, probability, background, fy26, fy27, open, sourceRow, status, needsReview };
}

function noteInteraction(account: FounderAccount, note: string, sourceInfo: SourceInfo): FounderInteraction {
  return attachSourceMetadata({
    id: `henry-note-${account.id}`,
    user_id: DEMO_USER_ID,
    account_id: account.id,
    contact_id: null,
    opportunity_id: null,
    source_capture_id: null,
    interaction_type: 'note',
    occurred_at: importedAt,
    summary: note,
    pain_point: null,
    objection: deriveBlockersFromExplicitText(note)[0]?.title || null,
    raw_note: note,
    structured_data: { sourceMetadata: sourceInfo, founderWorkspace: true },
    created_at: importedAt,
  }, sourceInfo);
}

function kaNote(accountName: string, note: string, sourceRow: number): FounderInteraction {
  const sourceInfo = source('2. KA_Strategy_FY26', accountName === 'TV Pharm' ? 'Special Projects' : accountName.includes('Terumo') ? 'Terumo BCT' : accountName.includes('Samil') ? 'Samil' : accountName.includes('F.T') ? 'FT Pharma' : accountName.includes('Bidiphar') ? 'Bidiphar' : 'Pymepharco', sourceRow, note);
  return noteInteraction(accounts.find((account) => account.name === accountName) || accounts[0], note, sourceInfo);
}

function action(account: FounderAccount, title: string, sourceInfo: SourceInfo): FounderAction {
  return attachSourceMetadata({
    id: `henry-action-${slug(account.name)}-${slug(title)}`,
    user_id: DEMO_USER_ID,
    account_id: account.id,
    contact_id: null,
    opportunity_id: null,
    interaction_id: null,
    title,
    due_date: explicitDueDate(title),
    status: 'open',
    suggested: false,
    source: 'manual' as const,
    created_at: importedAt,
    updated_at: importedAt,
  }, sourceInfo, explicitDueDate(title) ? {} : { needsReview: true, reviewReason: 'No explicit due date; preserve as open Next Action.' });
}

function objection(interaction: FounderInteraction, title: string, detail: string, category: Objection['category'], index: number): FounderObjection {
  return attachSourceMetadata({
    id: `${interaction.id}-blocker-${index}`,
    user_id: DEMO_USER_ID,
    account_id: interaction.account_id || accounts[0].id,
    opportunity_id: interaction.opportunity_id,
    contact_id: interaction.contact_id,
    source_interaction_id: interaction.id,
    title,
    detail,
    category,
    status: 'open',
    severity: 'medium',
    response_angle: null,
    linked_action_id: null,
    first_mentioned_at: importedAt,
    last_mentioned_at: importedAt,
    created_at: importedAt,
    updated_at: importedAt,
  }, interaction.sourceMetadata);
}

function objectionFromPricing(pricing: FounderPricingContext, title: string, detail: string, category: Objection['category'], index: number, sourceInteractionId: string | null): FounderObjection {
  const normalized = normalizeAccountName(pricing.customer);
  const account_id = accountIds.get(normalized.canonicalName) || accountId(normalized.canonicalName);
  return attachSourceMetadata({
    id: `${pricing.id}-blocker-${index}`,
    user_id: DEMO_USER_ID,
    account_id,
    opportunity_id: null,
    contact_id: null,
    source_interaction_id: sourceInteractionId,
    title,
    detail,
    category,
    status: 'open',
    severity: 'medium',
    response_angle: null,
    linked_action_id: null,
    first_mentioned_at: importedAt,
    last_mentioned_at: importedAt,
    created_at: importedAt,
    updated_at: importedAt,
  }, pricing.sourceMetadata, pricing.needsReview ? { needsReview: true, reviewReason: pricing.reviewReason } : {});
}

function brand(brandName: string, segment: string, type: string, margin: string, approvalStatus: string, volumeTier: string, marginTier: string, rank: string, sourceRow: number): FounderBrandReference {
  return {
    brand: brandName,
    segment,
    type,
    margin,
    approvalStatus,
    volumeTier,
    marginTier,
    rank,
    sourceMetadata: source('3. Portfolio_Brand_Strategy_FY26', 'tblBrands', sourceRow, `${brandName} | ${segment} | ${type}`),
  };
}

function source(sourceFile: string, sourceTab: string, sourceRow?: number, rawSource?: string): SourceInfo {
  return { sourceFile, sourceTab, sourceRow, rawSource };
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function parseMoney(value: string) {
  const numeric = Number(value.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(numeric) ? numeric : null;
}

function confidenceFromProbability(probability: string): Opportunity['confidence'] {
  const value = Number(probability.replace(',', '.'));
  if (value >= 0.6) return 'high';
  if (value >= 0.3) return 'medium';
  return 'low';
}

function explicitDueDate(title: string) {
  if (title.includes('(26/02)')) return '2026-02-26';
  if (title.includes('(01/03)')) return '2026-03-01';
  return null;
}
