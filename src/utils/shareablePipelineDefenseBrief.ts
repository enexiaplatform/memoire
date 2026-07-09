import { pipelineDefenseBriefMeta, type PipelineDefenseDeal } from '../data/pipelineDefenseBrief';
import type { PipelineDefenseActionItem } from './pipelineDefenseActionPlan';
import type { PipelineDefenseBrief } from './pipelineDefenseStorage';
import type { FollowUpImpactSummary } from './followUpImpact.ts';
import { followUpImpactStatusLabel } from './followUpImpact.ts';
import { formatBaseCurrencyAmount, formatCurrencyAmount, sumMoneyInBase } from './money.ts';
import { buildPipelineDefenseCenter } from './pipelineDefenseCenter.ts';

export type ShareableDefenseStatus = 'Defend' | 'Rescue' | 'Downgrade' | 'Monitor';

export type ShareableDealRow = {
  id: string;
  account: string;
  opportunity: string;
  value: string;
  currentStage: string;
  forecastCategory: string;
  defenseStatus: ShareableDefenseStatus;
  mainEvidence: string;
  mainGap: string;
  nextDefenseAction: string;
};

export type ShareableBriefChecklistItem = {
  id: string;
  label: string;
  status: 'pass' | 'warning';
  detail: string;
};

export type ShareableBriefGap = {
  label: string;
  count: number;
  accounts: string[];
};

export type ShareableNextDefenseAction = {
  id: string;
  account: string;
  opportunity: string;
  title: string;
  detail: string;
  priority: string;
  source: string;
};

export type ShareablePipelineDefenseBrief = {
  generatedAt: string;
  executiveSummary: {
    totalDeals: number;
    defendableDeals: number;
    rescueDeals: number;
    downgradeDeals: number;
    totalPipelineValueLabel: string;
    topRiskThemes: ShareableBriefGap[];
  };
  dealRows: ShareableDealRow[];
  dealsToDefend: PipelineDefenseDeal[];
  dealsToRescue: PipelineDefenseDeal[];
  dealsToDowngrade: PipelineDefenseDeal[];
  topMissingProofGaps: ShareableBriefGap[];
  nextDefenseActions: ShareableNextDefenseAction[];
  managerSummary: string;
  qualityChecklist: ShareableBriefChecklistItem[];
};

export function buildShareablePipelineDefenseBrief(input: {
  brief?: PipelineDefenseBrief | null;
  deals: PipelineDefenseDeal[];
  actionItems?: PipelineDefenseActionItem[];
  generatedAt?: string;
}): ShareablePipelineDefenseBrief {
  const generatedAt = input.generatedAt || new Date().toISOString();
  const actionItems = input.actionItems || [];
  const dealsToDefend = input.deals.filter((deal) => getDefenseStatus(deal) === 'Defend');
  const dealsToRescue = input.deals.filter((deal) => getDefenseStatus(deal) === 'Rescue');
  const dealsToDowngrade = input.deals.filter((deal) => getDefenseStatus(deal) === 'Downgrade');
  const dealRows = input.deals.map((deal) => buildDealRow(deal, actionItems));
  const topRiskThemes = buildRiskThemes(input.deals).slice(0, 5);
  const topMissingProofGaps = buildMissingProofGaps(input.deals).slice(0, 7);
  const nextDefenseActions = buildNextDefenseActions(input.deals, actionItems).slice(0, 12);
  const qualityChecklist = buildBriefQualityChecklist(input.deals, nextDefenseActions);
  const executiveSummary = {
    totalDeals: input.deals.length,
    defendableDeals: dealsToDefend.length,
    rescueDeals: dealsToRescue.length,
    downgradeDeals: dealsToDowngrade.length,
    totalPipelineValueLabel: buildTotalPipelineValueLabel(input.deals),
    topRiskThemes,
  };

  const shareable: Omit<ShareablePipelineDefenseBrief, 'managerSummary'> = {
    generatedAt,
    executiveSummary,
    dealRows,
    dealsToDefend,
    dealsToRescue,
    dealsToDowngrade,
    topMissingProofGaps,
    nextDefenseActions,
    qualityChecklist,
  };

  return {
    ...shareable,
    managerSummary: generateManagerReviewSummary(shareable),
  };
}

export function generateManagerReviewSummary(brief: Omit<ShareablePipelineDefenseBrief, 'managerSummary'>) {
  const summary = brief.executiveSummary;
  const riskThemes = summary.topRiskThemes.length > 0
    ? summary.topRiskThemes.map((item) => `${item.label} (${item.count})`).join(', ')
    : 'No repeated risk theme detected';
  const topAction = brief.nextDefenseActions[0]?.title || 'No next defense action defined yet';

  return [
    `Manager summary: ${summary.totalDeals} deals reviewed; ${summary.defendableDeals} defendable, ${summary.rescueDeals} rescue, ${summary.downgradeDeals} downgrade/deprioritize.`,
    `Pipeline value captured: ${summary.totalPipelineValueLabel}.`,
    `Top risk themes: ${riskThemes}.`,
    `Immediate defense action: ${topAction}.`,
  ].join('\n');
}

export function generateShareReadyPipelineDefenseMarkdown(input: {
  brief?: PipelineDefenseBrief | null;
  shareable: ShareablePipelineDefenseBrief;
  followUpImpact?: FollowUpImpactSummary | null;
}) {
  const brief = input.brief;
  const shareable = input.shareable;
  const meta = [
    `# ${brief?.title || 'Pipeline Review Defense Brief'}`,
    '',
    `Generated: ${formatDateTime(shareable.generatedAt)}`,
    `Week: ${brief?.weekLabel || pipelineDefenseBriefMeta.week}`,
    `Sales owner: ${brief?.salesOwner || pipelineDefenseBriefMeta.salesOwner}`,
    `Scope: ${brief?.scope || pipelineDefenseBriefMeta.scope}`,
    '',
    '> Data mode note: this brief reflects the current Memoire workspace data. Confirm whether it is synced, local-only, or demo-local before sharing externally.',
    '',
  ];

  return [
    ...meta,
    '## Executive Summary',
    '',
    `- Total deals: ${shareable.executiveSummary.totalDeals}`,
    `- Defendable: ${shareable.executiveSummary.defendableDeals}`,
    `- Rescue: ${shareable.executiveSummary.rescueDeals}`,
    `- Downgrade / deprioritize: ${shareable.executiveSummary.downgradeDeals}`,
    `- Total pipeline value captured: ${shareable.executiveSummary.totalPipelineValueLabel}`,
    `- Top risk themes: ${formatGapList(shareable.executiveSummary.topRiskThemes)}`,
    '',
    '## Manager Review Summary',
    '',
    shareable.managerSummary,
    '',
    ...formatFollowUpImpactSection(input.followUpImpact),
    '## Deal Defense Table',
    '',
    '| Account | Opportunity | Value | Stage | Forecast | Defense status | Main evidence | Main gap | Next defense action |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...shareable.dealRows.map((row) => (
      `| ${escapeMarkdownCell(row.account)} | ${escapeMarkdownCell(row.opportunity)} | ${escapeMarkdownCell(row.value)} | ${escapeMarkdownCell(row.currentStage)} | ${escapeMarkdownCell(row.forecastCategory)} | ${escapeMarkdownCell(row.defenseStatus)} | ${escapeMarkdownCell(row.mainEvidence)} | ${escapeMarkdownCell(row.mainGap)} | ${escapeMarkdownCell(row.nextDefenseAction)} |`
    )),
    '',
    '## Deals To Defend',
    '',
    ...formatDealGroup(shareable.dealsToDefend),
    '',
    '## Deals To Rescue',
    '',
    ...formatDealGroup(shareable.dealsToRescue),
    '',
    '## Deals To Downgrade / Deprioritize',
    '',
    ...formatDealGroup(shareable.dealsToDowngrade),
    '',
    '## Top Missing Proof / MEDDIC Gaps',
    '',
    ...formatGapsAsBullets(shareable.topMissingProofGaps),
    '',
    '## Next Defense Actions',
    '',
    ...formatDefenseActions(shareable.nextDefenseActions),
    '',
    '## Brief Quality Checklist',
    '',
    ...shareable.qualityChecklist.map((item) => `- ${item.status === 'pass' ? '[OK]' : '[Warning]'} ${item.label}: ${item.detail}`),
    '',
  ].join('\n');
}

function formatFollowUpImpactSection(impact?: FollowUpImpactSummary | null) {
  if (!impact || impact.followUpsSent === 0) return [];
  const backInMotion = impact.dealsRevived + impact.dealsWon + impact.dealsProtected;
  return [
    `## Saved From Silence (Last ${impact.windowDays} Days)`,
    '',
    `- Follow-ups sent: ${impact.followUpsSent}`,
    `- Quiet deals contacted: ${impact.quietDealsContacted}`,
    `- Deals back in motion: ${backInMotion} (${impact.dealsRevived} revived, ${impact.dealsWon} won, ${impact.dealsProtected} next touch booked)`,
    `- Value back in motion: ${formatBaseCurrencyAmount(impact.valueBackInMotionBase, true)}`,
    ...impact.events.slice(0, 4).map((event) => (
      `- ${event.accountName} / ${event.opportunityName}: ${followUpImpactStatusLabel(event.status)} - ${event.evidence}`
    )),
    '',
  ];
}

export function buildPipelineReviewDashboardSignal(briefs: PipelineDefenseBrief[]) {
  const latestBrief = [...briefs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  if (!latestBrief) {
    return {
      briefTitle: 'No defense brief yet',
      dealsNeedingReview: 0,
      rescueDowngradeCandidates: 0,
      readinessScore: 0,
      defendableDeals: 0,
      rescueDeals: 0,
      downgradeCandidates: 0,
      topMissingEvidenceGaps: ['No Pipeline Defense Brief prepared yet'],
      topReason: 'Create a Pipeline Defense Brief from selected opportunities before review.',
      href: '/app/pipeline-defense',
    };
  }

  const shareable = buildShareablePipelineDefenseBrief({ brief: latestBrief, deals: latestBrief.deals });
  const center = buildPipelineDefenseCenter(latestBrief.deals);
  const dealsNeedingReview = latestBrief.deals.filter((deal) => (
    deal.forecastEvidenceCategory !== 'Defensible'
    || deal.decisionRecommendation !== 'Defend'
    || hasText(deal.missingContext.join(' '))
    || deal.objectionDebt.status === 'Open'
  )).length;
  const rescueDowngradeCandidates = shareable.executiveSummary.rescueDeals + shareable.executiveSummary.downgradeDeals;

  return {
    briefTitle: latestBrief.title,
    dealsNeedingReview,
    rescueDowngradeCandidates,
    readinessScore: center.readinessScore,
    defendableDeals: center.defendableDeals,
    rescueDeals: center.rescueDeals,
    downgradeCandidates: center.downgradeCandidates,
    topMissingEvidenceGaps: center.topMissingEvidenceGaps.map((gap) => `${gap.label} (${gap.count})`),
    topReason: shareable.topMissingProofGaps[0]
      ? `${shareable.topMissingProofGaps[0].label} affects ${shareable.topMissingProofGaps[0].count} deal(s).`
      : 'Pipeline review brief is ready for final manager review.',
    href: '/app/pipeline-defense',
  };
}

function buildDealRow(deal: PipelineDefenseDeal, actionItems: PipelineDefenseActionItem[]): ShareableDealRow {
  const action = actionItems.find((item) => item.dealId === deal.id);

  return {
    id: deal.id,
    account: deal.account || 'Unknown account',
    opportunity: deal.opportunity || 'Unknown opportunity',
    value: extractValueLabel(deal),
    currentStage: extractStageLabel(deal),
    forecastCategory: deal.forecastEvidenceCategory,
    defenseStatus: getDefenseStatus(deal),
    mainEvidence: firstUseful(deal.evidence) || firstSentence(deal.dealTruth) || 'No evidence captured',
    mainGap: firstUseful(deal.missingContext) || firstUseful(deal.riskType) || 'No major gap captured',
    nextDefenseAction: action?.title || firstSentence(deal.recommendedAction) || 'Define next defense action',
  };
}

function getDefenseStatus(deal: PipelineDefenseDeal): ShareableDefenseStatus {
  if (deal.decisionRecommendation === 'Defend' || deal.forecastEvidenceCategory === 'Defensible') return 'Defend';
  if (deal.decisionRecommendation === 'Downgrade' || deal.decisionRecommendation === 'Deprioritize' || deal.forecastEvidenceCategory === 'Unsupported') return 'Downgrade';
  if (deal.decisionRecommendation === 'Rescue' || deal.forecastEvidenceCategory === 'Weak but recoverable' || deal.forecastEvidenceCategory === 'Hope-based') return 'Rescue';
  return 'Monitor';
}

function buildRiskThemes(deals: PipelineDefenseDeal[]): ShareableBriefGap[] {
  const themes = new Map<string, Set<string>>();
  deals.forEach((deal) => {
    [...deal.riskType, ...deal.missingContext].forEach((item) => {
      const label = normalizeTheme(item);
      if (!label) return;
      const accounts = themes.get(label) || new Set<string>();
      accounts.add(deal.account || 'Unknown account');
      themes.set(label, accounts);
    });
  });

  return Array.from(themes.entries())
    .map(([label, accounts]) => ({ label, count: accounts.size, accounts: Array.from(accounts) }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function buildMissingProofGaps(deals: PipelineDefenseDeal[]): ShareableBriefGap[] {
  const gapMap = new Map<string, Set<string>>();
  deals.forEach((deal) => {
    const combined = [
      ...deal.missingContext,
      ...deal.riskType.filter((item) => /proof|evidence|buyer|champion|decision|process|procurement|documentation|objection|competitor|meddic/i.test(item)),
    ];
    combined.forEach((item) => {
      const label = normalizeTheme(item);
      if (!label) return;
      const accounts = gapMap.get(label) || new Set<string>();
      accounts.add(deal.account || 'Unknown account');
      gapMap.set(label, accounts);
    });
  });

  return Array.from(gapMap.entries())
    .map(([label, accounts]) => ({ label, count: accounts.size, accounts: Array.from(accounts) }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function buildNextDefenseActions(deals: PipelineDefenseDeal[], actionItems: PipelineDefenseActionItem[]): ShareableNextDefenseAction[] {
  if (actionItems.length > 0) {
    return actionItems.map((item) => ({
      id: item.id,
      account: item.account,
      opportunity: item.opportunity,
      title: item.title,
      detail: item.detail,
      priority: item.priority,
      source: item.actionType,
    }));
  }

  return deals
    .filter((deal) => hasText(deal.recommendedAction))
    .map((deal) => ({
      id: `${deal.id}-next-defense-action`,
      account: deal.account || 'Unknown account',
      opportunity: deal.opportunity || 'Unknown opportunity',
      title: firstSentence(deal.recommendedAction) || 'Confirm next defense action',
      detail: deal.recommendedAction,
      priority: getDefenseStatus(deal) === 'Downgrade' ? 'High' : getDefenseStatus(deal) === 'Rescue' ? 'High' : 'Medium',
      source: 'Deal recommendation',
    }));
}

function buildBriefQualityChecklist(deals: PipelineDefenseDeal[], actions: ShareableNextDefenseAction[]): ShareableBriefChecklistItem[] {
  const keyDeals = deals.filter((deal) => getDefenseStatus(deal) !== 'Monitor');
  const economicBuyerGaps = countMatchingGaps(keyDeals, /economic buyer|budget owner|decision maker|decision owner/i);
  const championGaps = countMatchingGaps(keyDeals, /champion|stakeholder|supporter/i);
  const decisionProcessGaps = countMatchingGaps(keyDeals, /decision process|decision timeline|procurement|close period|timeline/i);
  const openObjections = keyDeals.filter((deal) => deal.objectionDebt.status === 'Open' || deal.objectionDebt.status === 'Unsupported').length;
  const proofGaps = countMatchingGaps(keyDeals, /proof|asset|documentation|evidence|validation|compliance|case study/i);
  const unsupportedDeals = deals.filter((deal) => deal.forecastEvidenceCategory === 'Unsupported');
  const unsupportedFlagged = unsupportedDeals.filter((deal) => deal.decisionRecommendation === 'Downgrade' || deal.decisionRecommendation === 'Deprioritize').length;

  return [
    buildChecklistItem('economic-buyer', 'Economic buyer identified for key deals', economicBuyerGaps === 0, economicBuyerGaps === 0 ? 'No explicit economic buyer gap in key deals.' : `${economicBuyerGaps} key deal(s) still mention buyer or decision owner gaps.`),
    buildChecklistItem('champion', 'Champion identified for key deals', championGaps === 0, championGaps === 0 ? 'No explicit champion gap in key deals.' : `${championGaps} key deal(s) still need champion or stakeholder clarity.`),
    buildChecklistItem('decision-process', 'Decision process clear', decisionProcessGaps === 0, decisionProcessGaps === 0 ? 'No explicit decision process gap in key deals.' : `${decisionProcessGaps} key deal(s) still need timeline, procurement, or process clarity.`),
    buildChecklistItem('major-objections', 'Major objections addressed', openObjections === 0, openObjections === 0 ? 'No open major objection debt in key deals.' : `${openObjections} key deal(s) still carry open objection debt.`),
    buildChecklistItem('proof-assets', 'Relevant proof assets prepared', proofGaps === 0, proofGaps === 0 ? 'No explicit proof asset gap detected.' : `${proofGaps} key deal(s) still need proof, documentation, or evidence.`),
    buildChecklistItem('next-actions', 'Next defense actions defined', actions.length >= deals.length || deals.every((deal) => hasText(deal.recommendedAction)), actions.length >= deals.length || deals.every((deal) => hasText(deal.recommendedAction)) ? 'Every deal has a next defense action or recommendation.' : 'One or more deals still need a specific next defense action.'),
    buildChecklistItem('unsupported-flagged', 'Unsupported deals flagged for downgrade', unsupportedDeals.length === unsupportedFlagged, unsupportedDeals.length === 0 ? 'No unsupported deals in this brief.' : `${unsupportedFlagged}/${unsupportedDeals.length} unsupported deal(s) are flagged for downgrade or deprioritization.`),
  ];
}

function buildChecklistItem(id: string, label: string, passed: boolean, detail: string): ShareableBriefChecklistItem {
  return {
    id,
    label,
    status: passed ? 'pass' : 'warning',
    detail,
  };
}

function countMatchingGaps(deals: PipelineDefenseDeal[], pattern: RegExp) {
  return deals.filter((deal) => pattern.test([...deal.missingContext, ...deal.riskType, deal.pipelineContext, deal.dealTruth].join(' '))).length;
}

function buildTotalPipelineValueLabel(deals: PipelineDefenseDeal[]) {
  const values = deals
    .filter((deal) => deal.estimatedValue !== null && deal.estimatedValue !== undefined && deal.currency)
    .map((deal) => ({ amount: deal.estimatedValue, currency: deal.currency }));
  if (values.length === 0) return 'Not captured';
  return formatBaseCurrencyAmount(sumMoneyInBase(values));
}

function extractValueLabel(deal: PipelineDefenseDeal) {
  return deal.estimatedValue !== null && deal.estimatedValue !== undefined && deal.currency
    ? formatCurrencyAmount(deal.estimatedValue, deal.currency)
    : 'Not captured';
}

function extractStageLabel(deal: PipelineDefenseDeal) {
  const context = deal.pipelineContext || '';
  const stageMatch = context.match(/stage\s*[:=-]\s*([^.;\n]+)/i);
  if (stageMatch?.[1]) return cleanLabel(stageMatch[1]);
  const words = ['Lead', 'Discovery', 'Qualification', 'Technical discussion', 'Demo', 'Proposal', 'Negotiation', 'Procurement', 'Won', 'Lost', 'On hold'];
  const match = words.find((stage) => new RegExp(`\\b${escapeRegExp(stage)}\\b`, 'i').test(context));
  return match || 'Not captured';
}

function firstUseful(items: string[]) {
  return items.find((item) => hasText(item))?.trim() || '';
}

function firstSentence(value: string) {
  if (!hasText(value)) return '';
  const sentence = value.split(/\.\s+/)[0]?.trim();
  return sentence ? sentence.replace(/\.$/, '') : value.trim();
}

function hasText(value?: string) {
  return Boolean(value && value.trim().length > 0);
}

function normalizeTheme(value: string) {
  if (!hasText(value)) return '';
  const lower = value.toLowerCase();
  if (lower.includes('economic buyer') || lower.includes('budget owner')) return 'Economic buyer / budget owner';
  if (lower.includes('decision maker') || lower.includes('decision owner')) return 'Decision maker';
  if (lower.includes('champion')) return 'Champion not confirmed';
  if (lower.includes('procurement')) return 'Procurement path';
  if (lower.includes('decision process')) return 'Decision process';
  if (lower.includes('decision timeline') || lower.includes('timeline') || lower.includes('close period')) return 'Decision timeline';
  if (lower.includes('proof') || lower.includes('documentation') || lower.includes('validation') || lower.includes('compliance')) return 'Proof / documentation';
  if (lower.includes('competitor')) return 'Competitor response';
  if (lower.includes('objection')) return 'Objection debt';
  if (lower.includes('technical')) return 'Technical criteria';
  return cleanLabel(value);
}

function cleanLabel(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function formatGapList(gaps: ShareableBriefGap[]) {
  if (gaps.length === 0) return 'None detected';
  return gaps.map((gap) => `${gap.label} (${gap.count})`).join(', ');
}

function formatDealGroup(deals: PipelineDefenseDeal[]) {
  if (deals.length === 0) return ['- None'];
  return deals.map((deal) => `- ${deal.account || 'Unknown account'} / ${deal.opportunity || 'Unknown opportunity'}: ${firstSentence(deal.pipelineReviewAnswer || deal.recommendedAction) || 'No review answer captured.'}`);
}

function formatGapsAsBullets(gaps: ShareableBriefGap[]) {
  if (gaps.length === 0) return ['- None detected'];
  return gaps.map((gap) => `- ${gap.label}: ${gap.count} deal(s) affected (${gap.accounts.join(', ')})`);
}

function formatDefenseActions(actions: ShareableNextDefenseAction[]) {
  if (actions.length === 0) return ['- No next defense actions defined yet.'];
  return actions.map((action) => `- [${action.priority}] ${action.account} / ${action.opportunity}: ${action.title} (${action.source})`);
}

function escapeMarkdownCell(value: string) {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
