import type { PipelineDefenseBrief } from './pipelineDefenseStorage';
import {
  generateShareReadyPipelineDefenseMarkdown,
  type ShareablePipelineDefenseBrief,
} from './shareablePipelineDefenseBrief';
import { getCurrentPipelineReviewWeekId } from './pipelineReviewHabit';

export const REVIEW_PACK_STORAGE_KEY = 'memoire.reviewPacks.v1';
export const REVIEW_PACKS_UPDATED_EVENT = 'memoire:review-packs-updated';

export type ReviewPackDealSnapshot = {
  accountName: string;
  opportunityName: string;
  stage?: string;
  value?: string;
  forecastCategory?: string;
  defenseStatus?: string;
  evidence?: string;
  gap?: string;
  nextAction?: string;
};

export type ReviewPackSnapshot = {
  id: string;
  title: string;
  weekId: string;
  createdAt: string;
  updatedAt: string;
  generatedAt: string;
  dealCount: number;
  defendCount: number;
  rescueCount: number;
  downgradeCount: number;
  totalValue?: string;
  managerSummary: string;
  shareReadyMarkdown: string;
  qualityChecklistSummary?: string;
  topGaps: string[];
  nextDefenseActions: string[];
  deals: ReviewPackDealSnapshot[];
  sourceBriefId?: string;
};

export function createReviewPackSnapshot(input: {
  brief?: PipelineDefenseBrief | null;
  shareable: ShareablePipelineDefenseBrief;
  qualityChecklistSummary?: string;
  id?: string;
  createdAt?: string;
  weekId?: string;
}): ReviewPackSnapshot {
  const now = new Date().toISOString();
  const title = `${input.brief?.title || 'Pipeline Review Pack'} — ${input.brief?.weekLabel || input.weekId || getCurrentPipelineReviewWeekId()}`;
  const shareReadyMarkdown = generateShareReadyPipelineDefenseMarkdown({
    brief: input.brief,
    shareable: input.shareable,
  });

  return {
    id: input.id || `review-pack-${Date.now()}`,
    title,
    weekId: input.weekId || getCurrentPipelineReviewWeekId(),
    createdAt: input.createdAt || now,
    updatedAt: now,
    generatedAt: input.shareable.generatedAt || now,
    dealCount: input.shareable.executiveSummary.totalDeals,
    defendCount: input.shareable.executiveSummary.defendableDeals,
    rescueCount: input.shareable.executiveSummary.rescueDeals,
    downgradeCount: input.shareable.executiveSummary.downgradeDeals,
    totalValue: input.shareable.executiveSummary.totalPipelineValueLabel,
    managerSummary: input.shareable.managerSummary,
    shareReadyMarkdown,
    qualityChecklistSummary: input.qualityChecklistSummary || summarizeQualityChecklist(input.shareable),
    topGaps: input.shareable.topMissingProofGaps.map((gap) => (
      `${gap.label}: ${gap.count} deal(s) affected${gap.accounts.length ? ` (${gap.accounts.join(', ')})` : ''}`
    )),
    nextDefenseActions: input.shareable.nextDefenseActions.map((action) => (
      `${action.account} / ${action.opportunity}: ${action.title}`
    )),
    deals: input.shareable.dealRows.map((deal) => ({
      accountName: deal.account,
      opportunityName: deal.opportunity,
      stage: deal.currentStage,
      value: deal.value,
      forecastCategory: deal.forecastCategory,
      defenseStatus: deal.defenseStatus,
      evidence: deal.mainEvidence,
      gap: deal.mainGap,
      nextAction: deal.nextDefenseAction,
    })),
    sourceBriefId: input.brief?.id,
  };
}

export function loadReviewPacks(): ReviewPackSnapshot[] {
  if (!canUseStorage()) return [];

  try {
    const raw = window.localStorage.getItem(REVIEW_PACK_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(sanitizeReviewPack)
      .filter((pack): pack is ReviewPackSnapshot => Boolean(pack))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

export function saveReviewPack(pack: ReviewPackSnapshot): ReviewPackSnapshot[] {
  return persistReviewPacks([pack, ...loadReviewPacks()]);
}

export function updateReviewPack(packId: string, nextPack: ReviewPackSnapshot): ReviewPackSnapshot[] {
  const packs = loadReviewPacks();
  const existing = packs.find((pack) => pack.id === packId);
  const updatedPack: ReviewPackSnapshot = {
    ...nextPack,
    id: packId,
    createdAt: existing?.createdAt || nextPack.createdAt,
    updatedAt: new Date().toISOString(),
  };
  return persistReviewPacks([
    updatedPack,
    ...packs.filter((pack) => pack.id !== packId),
  ]);
}

export function deleteReviewPack(packId: string): ReviewPackSnapshot[] {
  return persistReviewPacks(loadReviewPacks().filter((pack) => pack.id !== packId));
}

export function getReviewPackById(packId?: string): ReviewPackSnapshot | null {
  if (!packId) return null;
  return loadReviewPacks().find((pack) => pack.id === packId) || null;
}

export function getLatestReviewPackForWeek(weekId = getCurrentPipelineReviewWeekId()) {
  return loadReviewPacks().find((pack) => pack.weekId === weekId) || null;
}

export function findCurrentWeekReviewPackForBrief(briefId?: string, weekId = getCurrentPipelineReviewWeekId()) {
  if (!briefId) return null;
  return loadReviewPacks().find((pack) => pack.sourceBriefId === briefId && pack.weekId === weekId) || null;
}

export function generateReviewPackMarkdown(pack: ReviewPackSnapshot) {
  return [
    `# ${pack.title}`,
    '',
    `Week ID: ${pack.weekId}`,
    `Generated: ${formatReviewPackDate(pack.generatedAt)}`,
    `Saved: ${formatReviewPackDate(pack.createdAt)}`,
    '',
    '## Executive Summary',
    '',
    `- Deals reviewed: ${pack.dealCount}`,
    `- Defend: ${pack.defendCount}`,
    `- Rescue: ${pack.rescueCount}`,
    `- Downgrade / deprioritize: ${pack.downgradeCount}`,
    `- Pipeline value captured: ${pack.totalValue || 'Not captured'}`,
    '',
    '## Manager Review Summary',
    '',
    pack.managerSummary || 'No manager summary captured.',
    '',
    '## Deal Defense Table',
    '',
    '| Account | Opportunity | Stage | Value | Forecast | Defense | Evidence | Gap | Next action |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...pack.deals.map((deal) => (
      `| ${escapeMarkdownCell(deal.accountName)} | ${escapeMarkdownCell(deal.opportunityName)} | ${escapeMarkdownCell(deal.stage)} | ${escapeMarkdownCell(deal.value)} | ${escapeMarkdownCell(deal.forecastCategory)} | ${escapeMarkdownCell(deal.defenseStatus)} | ${escapeMarkdownCell(deal.evidence)} | ${escapeMarkdownCell(deal.gap)} | ${escapeMarkdownCell(deal.nextAction)} |`
    )),
    '',
    '## Top Missing Proof / MEDDIC Gaps',
    '',
    ...formatBulletList(pack.topGaps, 'No top gaps captured.'),
    '',
    '## Next Defense Actions',
    '',
    ...formatBulletList(pack.nextDefenseActions, 'No next defense actions captured.'),
    '',
    '## Quality Checklist Summary',
    '',
    pack.qualityChecklistSummary || 'No quality checklist summary captured.',
    '',
  ].join('\n');
}

export function formatReviewPackDate(value?: string) {
  if (!value) return 'Not captured';
  try {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function persistReviewPacks(packs: ReviewPackSnapshot[]) {
  const sanitized = packs
    .map(sanitizeReviewPack)
    .filter((pack): pack is ReviewPackSnapshot => Boolean(pack))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  if (canUseStorage()) {
    window.localStorage.setItem(REVIEW_PACK_STORAGE_KEY, JSON.stringify(sanitized));
    window.dispatchEvent(new CustomEvent(REVIEW_PACKS_UPDATED_EVENT, { detail: sanitized }));
  }
  return sanitized;
}

function sanitizeReviewPack(value: unknown): ReviewPackSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<ReviewPackSnapshot>;
  const now = new Date().toISOString();
  const id = typeof candidate.id === 'string' && candidate.id ? candidate.id : `review-pack-${Date.now()}`;

  return {
    id,
    title: typeof candidate.title === 'string' && candidate.title ? candidate.title : 'Pipeline Review Pack',
    weekId: typeof candidate.weekId === 'string' && candidate.weekId ? candidate.weekId : getCurrentPipelineReviewWeekId(),
    createdAt: typeof candidate.createdAt === 'string' && candidate.createdAt ? candidate.createdAt : now,
    updatedAt: typeof candidate.updatedAt === 'string' && candidate.updatedAt ? candidate.updatedAt : now,
    generatedAt: typeof candidate.generatedAt === 'string' && candidate.generatedAt ? candidate.generatedAt : now,
    dealCount: normalizeNumber(candidate.dealCount),
    defendCount: normalizeNumber(candidate.defendCount),
    rescueCount: normalizeNumber(candidate.rescueCount),
    downgradeCount: normalizeNumber(candidate.downgradeCount),
    totalValue: typeof candidate.totalValue === 'string' ? candidate.totalValue : undefined,
    managerSummary: typeof candidate.managerSummary === 'string' ? candidate.managerSummary : '',
    shareReadyMarkdown: typeof candidate.shareReadyMarkdown === 'string' ? candidate.shareReadyMarkdown : '',
    qualityChecklistSummary: typeof candidate.qualityChecklistSummary === 'string' ? candidate.qualityChecklistSummary : undefined,
    topGaps: normalizeStringArray(candidate.topGaps),
    nextDefenseActions: normalizeStringArray(candidate.nextDefenseActions),
    deals: Array.isArray(candidate.deals) ? candidate.deals.map(sanitizeDeal).filter((deal): deal is ReviewPackDealSnapshot => Boolean(deal)) : [],
    sourceBriefId: typeof candidate.sourceBriefId === 'string' ? candidate.sourceBriefId : undefined,
  };
}

function sanitizeDeal(value: unknown): ReviewPackDealSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<ReviewPackDealSnapshot>;
  return {
    accountName: typeof candidate.accountName === 'string' && candidate.accountName ? candidate.accountName : 'Unknown account',
    opportunityName: typeof candidate.opportunityName === 'string' && candidate.opportunityName ? candidate.opportunityName : 'Unknown opportunity',
    stage: normalizeOptionalString(candidate.stage),
    value: normalizeOptionalString(candidate.value),
    forecastCategory: normalizeOptionalString(candidate.forecastCategory),
    defenseStatus: normalizeOptionalString(candidate.defenseStatus),
    evidence: normalizeOptionalString(candidate.evidence),
    gap: normalizeOptionalString(candidate.gap),
    nextAction: normalizeOptionalString(candidate.nextAction),
  };
}

function summarizeQualityChecklist(shareable: ShareablePipelineDefenseBrief) {
  const warningCount = shareable.qualityChecklist.filter((item) => item.status === 'warning').length;
  const passCount = shareable.qualityChecklist.length - warningCount;
  return `${passCount} pass, ${warningCount} warning.`;
}

function canUseStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
}

function normalizeNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function normalizeStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function normalizeOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function formatBulletList(items: string[], emptyText: string) {
  return items.length > 0 ? items.map((item) => `- ${item}`) : [`- ${emptyText}`];
}

function escapeMarkdownCell(value?: string) {
  return (value || 'Not captured').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}
