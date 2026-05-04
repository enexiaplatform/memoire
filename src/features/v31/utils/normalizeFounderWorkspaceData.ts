import type { ObjectionCategory, Opportunity, SalesAction } from '../../../types/v31';

export interface SourceInfo {
  sourceFile: string;
  sourceTab: string;
  sourceRow?: number;
  rawSource?: string;
}

export interface ReviewFlag {
  needsReview?: boolean;
  reviewReason?: string;
}

const accountAliases: Record<string, { canonicalName: string; needsReview?: boolean; reviewReason?: string }> = {
  'tv pharm': { canonicalName: 'TV Pharm' },
  'tv pharma': { canonicalName: 'TV Pharm' },
  'tv pharmaceutical': { canonicalName: 'TV Pharm' },
  pymepharco: { canonicalName: 'STADA Pymepharco' },
  'stada pymepharco': { canonicalName: 'STADA Pymepharco' },
  'pymepharco jsc': { canonicalName: 'STADA Pymepharco' },
  'ft pharma': { canonicalName: 'F.T. Pharma' },
  'f.t. pharma': { canonicalName: 'F.T. Pharma' },
  'f.t.pharma': { canonicalName: 'F.T. Pharma' },
  ftp: { canonicalName: 'F.T. Pharma' },
  samil: { canonicalName: 'Samil Pharmaceutical' },
  'samil pharmaceutical': { canonicalName: 'Samil Pharmaceutical' },
  'terumo bct': { canonicalName: 'Terumo BCT Vietnam' },
  'terumo bct vietnam': { canonicalName: 'Terumo BCT Vietnam' },
  fkv: { canonicalName: 'Fresenius Kabi Vietnam', needsReview: true, reviewReason: 'FKV likely maps to Fresenius Kabi Vietnam; confirm with Henry.' },
  'fresenius kabi vietnam': { canonicalName: 'Fresenius Kabi Vietnam' },
  'phuc thinh': { canonicalName: 'Phuc Thinh', needsReview: true, reviewReason: 'Confirm if Phuc Thinh and Phuc Thinh Food are the same account.' },
  'phuc thinh food': { canonicalName: 'Phuc Thinh', needsReview: true, reviewReason: 'Confirm if Phuc Thinh and Phuc Thinh Food are the same account.' },
  'cuu long': { canonicalName: 'Cuu Long Pharma', needsReview: true, reviewReason: 'Confirm Cuu Long naming and legal account.' },
  'cuu long pharma': { canonicalName: 'Cuu Long Pharma', needsReview: true, reviewReason: 'Confirm Cuu Long naming and legal account.' },
  'dhg pharma': { canonicalName: 'DHG Pharma', needsReview: true, reviewReason: 'Parent account used; preserve plant-specific context in notes.' },
  'dhg pharma (plant 1)': { canonicalName: 'DHG Pharma', needsReview: true, reviewReason: 'Plant-specific account grouped under DHG Pharma.' },
  'dhg pharma (plant 2 - betalactam)': { canonicalName: 'DHG Pharma', needsReview: true, reviewReason: 'Plant-specific account grouped under DHG Pharma.' },
  'dhg pharma (plant 3 - nonbetalactam)': { canonicalName: 'DHG Pharma', needsReview: true, reviewReason: 'Plant-specific account grouped under DHG Pharma.' },
};

export function normalizeAccountName(rawName: string) {
  const key = normalizeKey(rawName);
  return accountAliases[key] || { canonicalName: rawName.trim() };
}

export function mapOpportunityStage(rawStage?: string, probability?: string | number, status?: string): Opportunity['stage'] {
  const text = `${rawStage || ''} ${status || ''}`.toLowerCase();
  if (text.includes('tender') || text.includes('quoted') || text.includes('proposal')) return 'proposal';
  if (text.includes('awaiting po') || text.includes('negotiat')) return 'negotiation';
  if (text.includes('planning') || text.includes('qualifying') || text.includes('discovery')) return 'active';
  const numeric = typeof probability === 'number' ? probability : Number(String(probability || '').replace(',', '.'));
  if (numeric >= 0.6) return 'proposal';
  if (numeric > 0) return 'active';
  return 'new';
}

export function parseOpenTiming(rawOpen?: string | null) {
  const value = (rawOpen || '').trim();
  if (!value) return { rawOpenTiming: '', tentativeTiming: '', timingLabel: '' };
  return {
    rawOpenTiming: value,
    tentativeTiming: value,
    timingLabel: `Tentative open timing: ${value}`,
  };
}

export function deriveBlockersFromExplicitText(text: string) {
  const normalized = text.toLowerCase();
  const blockers: Array<{ title: string; category: ObjectionCategory; detail: string }> = [];

  if (normalized.includes('sartorius')) {
    blockers.push({ title: 'Sartorius incumbent context', category: 'competitor', detail: text });
  }
  if (normalized.includes('merck')) {
    blockers.push({ title: 'Merck incumbent supplier context', category: 'competitor', detail: text });
  }
  if (normalized.includes('lonza')) {
    blockers.push({ title: 'Lonza incumbent supplier context', category: 'competitor', detail: text });
  }
  if (normalized.includes('tender pending') || normalized.includes('tender submitted')) {
    blockers.push({ title: 'Tender/procurement status pending', category: 'other', detail: text });
  }
  if (normalized.includes('awaiting po')) {
    blockers.push({ title: 'Awaiting PO', category: 'other', detail: text });
  }

  return blockers;
}

export function isPlaceholderValue(value?: string | null) {
  const normalized = (value || '').trim().toLowerCase();
  return !normalized || normalized === '-' || normalized === 'na' || normalized.includes('[fill in]');
}

export function attachSourceMetadata<T extends object>(object: T, sourceInfo: SourceInfo, reviewFlag: ReviewFlag = T_OBJECT): T & { sourceMetadata: SourceInfo } & ReviewFlag {
  return {
    ...object,
    ...reviewFlag,
    sourceMetadata: sourceInfo,
  };
}

export function actionWithSource<T extends SalesAction>(action: T, sourceInfo: SourceInfo, reviewFlag: ReviewFlag = T_OBJECT) {
  return attachSourceMetadata(action, sourceInfo, reviewFlag);
}

const T_OBJECT: ReviewFlag = {};

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
