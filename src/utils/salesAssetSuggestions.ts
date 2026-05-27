import type { CrmLiteOpportunity } from '../services/opportunityStore';
import type { ObjectionRecord } from '../services/objectionStore';
import type { SalesAssetInput, SalesAssetRecord, SalesAssetType } from '../services/salesAssetStore';
import type { SalesPlaybookPattern } from './salesPlaybook';

export type SalesAssetNeed = {
  id: string;
  title: string;
  assetType: SalesAssetType;
  reason: string;
  priority: 'High' | 'Medium' | 'Low';
  relatedAccountName?: string;
  relatedOpportunityName?: string;
  relatedObjectionType?: string;
  relatedPlaybookPatternTitle?: string;
};

export type AssetGapSummary = {
  topMissingAsset: SalesAssetNeed | null;
  repeatedObjectionsWithoutAsset: number;
  needs: SalesAssetNeed[];
};

export function buildSalesAssetDraftFromPattern(pattern: SalesPlaybookPattern): SalesAssetInput {
  const assetType = inferAssetTypeFromPattern(pattern);
  return {
    title: buildAssetTitle(pattern, assetType),
    assetType,
    summary: buildAssetSummary(pattern, assetType),
    content: [
      `Use case: ${pattern.whyItMatters}`,
      '',
      'Suggested response:',
      pattern.suggestedPlaybookResponse,
      '',
      'Reusable action:',
      pattern.reusableAction,
      '',
      'Evidence to tailor this asset:',
      ...pattern.evidence.slice(0, 4).map((item) => `- ${item}`),
    ].join('\n'),
    tags: unique([
      pattern.category,
      pattern.severity,
      ...pattern.relatedObjectionTypes,
      ...pattern.relatedAccounts.slice(0, 3),
    ]),
    relatedAccountName: pattern.relatedAccounts[0] || '',
    relatedOpportunityName: pattern.relatedOpportunities[0] || '',
    relatedObjectionType: pattern.relatedObjectionTypes[0] || '',
    relatedPlaybookPatternId: pattern.id,
    relatedPlaybookPatternTitle: pattern.title,
    useCase: pattern.reusableAction,
    source: 'user',
    isSample: false,
  };
}

export function generateAssetDraftMarkdown(input: SalesAssetInput) {
  return [
    `Title: ${input.title}`,
    `Type: ${input.assetType}`,
    input.summary ? `Summary: ${input.summary}` : '',
    input.useCase ? `Use case: ${input.useCase}` : '',
    input.tags.length ? `Tags: ${input.tags.join(', ')}` : '',
    '',
    input.content,
  ].filter(Boolean).join('\n');
}

export function generateSalesAssetMarkdown(asset: SalesAssetRecord) {
  return [
    asset.title,
    `Type: ${asset.assetType}`,
    asset.summary ? `Summary: ${asset.summary}` : '',
    asset.useCase ? `Use case: ${asset.useCase}` : '',
    asset.relatedAccountName ? `Account: ${asset.relatedAccountName}` : '',
    asset.relatedOpportunityName ? `Opportunity: ${asset.relatedOpportunityName}` : '',
    asset.tags.length ? `Tags: ${asset.tags.join(', ')}` : '',
    '',
    asset.content,
  ].filter(Boolean).join('\n');
}

export function copyAsEmailOrProposalSnippet(asset: SalesAssetRecord) {
  const opener = asset.assetType === 'Email Template'
    ? 'Hi [Name],'
    : `Proposal snippet: ${asset.title}`;

  return [
    opener,
    '',
    asset.summary || asset.useCase,
    '',
    asset.content,
    '',
    asset.assetType === 'Email Template' ? 'Best,' : '',
  ].filter((line) => line !== '').join('\n');
}

export function getRelevantSalesAssetsForOpportunity(input: {
  opportunity: CrmLiteOpportunity;
  assets: SalesAssetRecord[];
  objections?: ObjectionRecord[];
  patterns?: SalesPlaybookPattern[];
}) {
  const account = normalize(input.opportunity.accountName);
  const opportunity = normalize(input.opportunity.opportunityName);
  const objectionTypes = new Set((input.objections || []).map((item) => normalize(item.objectionType)));
  const patternTitles = new Set((input.patterns || []).map((item) => normalize(item.title)));
  const opportunityTokens = tokenize(`${input.opportunity.opportunityName} ${input.opportunity.productOrSolution} ${input.opportunity.evidence} ${input.opportunity.objectionDebt}`);

  return input.assets
    .filter((asset) => {
      const assetText = normalize([
        asset.title,
        asset.summary,
        asset.content,
        asset.useCase,
        asset.relatedAccountName,
        asset.relatedOpportunityName,
        asset.relatedObjectionType,
        asset.relatedPlaybookPatternTitle,
        asset.tags.join(' '),
      ].join(' '));
      const assetTokens = tokenize(assetText);
      return (
        normalize(asset.relatedAccountName) === account ||
        normalize(asset.relatedOpportunityId) === normalize(input.opportunity.id) ||
        normalize(asset.relatedOpportunityName) === opportunity ||
        objectionTypes.has(normalize(asset.relatedObjectionType)) ||
        patternTitles.has(normalize(asset.relatedPlaybookPatternTitle)) ||
        tokenOverlap(opportunityTokens, assetTokens) >= 2 ||
        assetText.includes(account) ||
        assetText.includes(opportunity)
      );
    })
    .slice(0, 6);
}

export function suggestSalesAssetsForOpportunity(input: {
  opportunity: CrmLiteOpportunity;
  objections?: ObjectionRecord[];
  patterns?: SalesPlaybookPattern[];
  assets?: SalesAssetRecord[];
}): SalesAssetNeed[] {
  const assets = input.assets || [];
  const needs: SalesAssetNeed[] = [];
  const objections = input.objections || [];
  const patterns = input.patterns || [];

  objections
    .filter((objection) => objection.status !== 'Resolved')
    .forEach((objection) => {
      const assetType = assetTypeForObjection(objection.objectionType);
      if (!hasMatchingAsset(assets, objection.objectionType, input.opportunity.accountName, input.opportunity.opportunityName, assetType)) {
        needs.push({
          id: `objection-${objection.id}`,
          title: `Prepare ${objection.objectionType.toLowerCase()} response asset`,
          assetType,
          reason: objection.requiredProof || objection.objectionText,
          priority: objection.impact === 'High' ? 'High' : 'Medium',
          relatedAccountName: objection.accountName || input.opportunity.accountName,
          relatedOpportunityName: objection.opportunityName || input.opportunity.opportunityName,
          relatedObjectionType: objection.objectionType,
        });
      }
    });

  patterns
    .filter((pattern) => pattern.category === 'Proof Asset Needed' || pattern.category === 'Documentation / Compliance Pattern' || pattern.category === 'Competitor Risk' || pattern.category === 'Procurement Risk')
    .forEach((pattern) => {
      const assetType = inferAssetTypeFromPattern(pattern);
      if (!hasMatchingPatternAsset(assets, pattern, assetType)) {
        needs.push({
          id: `pattern-${pattern.id}`,
          title: buildAssetTitle(pattern, assetType),
          assetType,
          reason: pattern.reusableAction,
          priority: pattern.severity,
          relatedAccountName: pattern.relatedAccounts[0],
          relatedOpportunityName: pattern.relatedOpportunities[0],
          relatedObjectionType: pattern.relatedObjectionTypes[0],
          relatedPlaybookPatternTitle: pattern.title,
        });
      }
    });

  if (/procurement|tender|committee/i.test(`${input.opportunity.procurementPath} ${input.opportunity.missingContext}`) && !hasAssetType(assets, 'Procurement Justification')) {
    needs.push({
      id: `procurement-${input.opportunity.id}`,
      title: 'Prepare procurement justification snippet',
      assetType: 'Procurement Justification',
      reason: 'Procurement path or tender process is unclear and needs a reusable internal justification.',
      priority: 'Medium',
      relatedAccountName: input.opportunity.accountName,
      relatedOpportunityName: input.opportunity.opportunityName,
    });
  }

  if (/validation|documentation|iq\/oq|iq-oq|oq\/pq|compliance/i.test(`${input.opportunity.evidence} ${input.opportunity.objectionDebt} ${input.opportunity.technicalCriteria}`) && !hasAssetType(assets, 'Validation / Documentation Note')) {
    needs.push({
      id: `validation-${input.opportunity.id}`,
      title: 'Prepare validation/compliance proof note',
      assetType: 'Validation / Documentation Note',
      reason: 'Validation or documentation proof appears in the deal context.',
      priority: 'Medium',
      relatedAccountName: input.opportunity.accountName,
      relatedOpportunityName: input.opportunity.opportunityName,
    });
  }

  return uniqueNeeds(needs).slice(0, 5);
}

export function analyzeAssetNeeds(input: {
  patterns: SalesPlaybookPattern[];
  objections: ObjectionRecord[];
  assets: SalesAssetRecord[];
  opportunities?: CrmLiteOpportunity[];
}): SalesAssetNeed[] {
  const needs: SalesAssetNeed[] = [];
  const opportunitiesByName = new Map((input.opportunities || []).map((item) => [normalize(item.opportunityName), item]));

  input.patterns.forEach((pattern) => {
    const assetType = inferAssetTypeFromPattern(pattern);
    if (pattern.category === 'Winning Move' || hasMatchingPatternAsset(input.assets, pattern, assetType)) return;
    needs.push({
      id: `playbook-${pattern.id}`,
      title: buildAssetTitle(pattern, assetType),
      assetType,
      reason: pattern.reusableAction,
      priority: pattern.severity,
      relatedAccountName: pattern.relatedAccounts[0],
      relatedOpportunityName: pattern.relatedOpportunities[0],
      relatedObjectionType: pattern.relatedObjectionTypes[0],
      relatedPlaybookPatternTitle: pattern.title,
    });
  });

  input.objections
    .filter((objection) => objection.status !== 'Resolved')
    .forEach((objection) => {
      const assetType = assetTypeForObjection(objection.objectionType);
      if (hasMatchingAsset(input.assets, objection.objectionType, objection.accountName, objection.opportunityName, assetType)) return;
      const opportunity = opportunitiesByName.get(normalize(objection.opportunityName));
      needs.push({
        id: `objection-${objection.id}`,
        title: `Prepare ${objection.objectionType.toLowerCase()} response asset`,
        assetType,
        reason: objection.requiredProof || objection.responsePlan || objection.objectionText,
        priority: objection.impact === 'High' ? 'High' : 'Medium',
        relatedAccountName: objection.accountName || opportunity?.accountName,
        relatedOpportunityName: objection.opportunityName || opportunity?.opportunityName,
        relatedObjectionType: objection.objectionType,
      });
    });

  return uniqueNeeds(needs)
    .sort((a, b) => priorityRank(b.priority) - priorityRank(a.priority) || a.title.localeCompare(b.title))
    .slice(0, 10);
}

export function summarizeAssetGaps(input: {
  patterns: SalesPlaybookPattern[];
  objections: ObjectionRecord[];
  assets: SalesAssetRecord[];
  opportunities?: CrmLiteOpportunity[];
}): AssetGapSummary {
  const needs = analyzeAssetNeeds(input);
  return {
    topMissingAsset: needs[0] || null,
    repeatedObjectionsWithoutAsset: needs.filter((need) => need.id.startsWith('objection-')).length,
    needs,
  };
}

export function formatRelevantProofAssetsForBrief(input: {
  opportunity: CrmLiteOpportunity;
  assets: SalesAssetRecord[];
  objections?: ObjectionRecord[];
  patterns?: SalesPlaybookPattern[];
}) {
  const relevant = getRelevantSalesAssetsForOpportunity(input);
  const suggested = suggestSalesAssetsForOpportunity(input);

  if (relevant.length === 0 && suggested.length === 0) return '';
  return [
    'Relevant Proof Assets:',
    ...relevant.slice(0, 3).map((asset) => `- ${asset.title} (${asset.assetType})`),
    ...suggested.slice(0, relevant.length > 0 ? 2 : 3).map((need) => `- Missing asset: ${need.title}`),
  ].join('\n');
}

function inferAssetTypeFromPattern(pattern: SalesPlaybookPattern): SalesAssetType {
  const text = `${pattern.title} ${pattern.category} ${pattern.relatedObjectionTypes.join(' ')}`.toLowerCase();
  if (text.includes('competitor')) return 'Competitor Response';
  if (text.includes('procurement') || text.includes('tender')) return 'Procurement Justification';
  if (text.includes('documentation') || text.includes('validation') || text.includes('compliance') || text.includes('iq')) return 'Validation / Documentation Note';
  if (text.includes('objection')) return 'Objection Response';
  if (text.includes('follow-up')) return 'Follow-up Script';
  if (text.includes('decision criteria') || text.includes('economic buyer') || text.includes('champion')) return 'Discovery Question Set';
  if (pattern.category === 'Winning Move') return 'Case Study';
  return 'Proof Asset';
}

function assetTypeForObjection(objectionType: string): SalesAssetType {
  if (/competitor/i.test(objectionType)) return 'Competitor Response';
  if (/procurement|timing/i.test(objectionType)) return 'Procurement Justification';
  if (/documentation|compliance|validation/i.test(objectionType)) return 'Validation / Documentation Note';
  if (/lead time|local support|price|budget|technical/i.test(objectionType)) return 'Objection Response';
  return 'Proof Asset';
}

function buildAssetTitle(pattern: SalesPlaybookPattern, assetType: SalesAssetType) {
  if (assetType === 'Validation / Documentation Note') return 'Validation documentation proof note';
  if (assetType === 'Competitor Response') return 'Competitor response note';
  if (assetType === 'Procurement Justification') return 'Procurement justification snippet';
  if (assetType === 'Discovery Question Set') return `${pattern.title} question set`;
  return `${pattern.title} asset`;
}

function buildAssetSummary(pattern: SalesPlaybookPattern, assetType: SalesAssetType) {
  return `Reusable ${assetType.toLowerCase()} for pattern: ${pattern.title}.`;
}

function hasMatchingPatternAsset(assets: SalesAssetRecord[], pattern: SalesPlaybookPattern, assetType: SalesAssetType) {
  const patternTitle = normalize(pattern.title);
  return assets.some((asset) => (
    asset.assetType === assetType &&
    (
      normalize(asset.relatedPlaybookPatternId) === normalize(pattern.id) ||
      normalize(asset.relatedPlaybookPatternTitle) === patternTitle ||
      normalize(asset.title).includes(patternTitle.slice(0, 24)) ||
      pattern.relatedObjectionTypes.some((type) => normalize(asset.relatedObjectionType) === normalize(type))
    )
  ));
}

function hasMatchingAsset(assets: SalesAssetRecord[], objectionType: string, accountName: string, opportunityName: string, assetType: SalesAssetType) {
  const account = normalize(accountName);
  const opportunity = normalize(opportunityName);
  const objection = normalize(objectionType);
  return assets.some((asset) => (
    asset.assetType === assetType &&
    (
      normalize(asset.relatedObjectionType) === objection ||
      normalize(asset.relatedAccountName) === account ||
      normalize(asset.relatedOpportunityName) === opportunity ||
      normalize(`${asset.title} ${asset.summary} ${asset.tags.join(' ')}`).includes(objection)
    )
  ));
}

function hasAssetType(assets: SalesAssetRecord[], assetType: SalesAssetType) {
  return assets.some((asset) => asset.assetType === assetType);
}

function tokenize(value: string) {
  const stop = new Set(['the', 'and', 'for', 'with', 'this', 'that', 'deal', 'opportunity', 'project']);
  return normalize(value).split(/[^a-z0-9]+/).filter((token) => token.length > 2 && !stop.has(token));
}

function tokenOverlap(a: string[], b: string[]) {
  const bSet = new Set(b);
  return a.filter((token) => bSet.has(token)).length;
}

function uniqueNeeds(needs: SalesAssetNeed[]) {
  const byId = new Map<string, SalesAssetNeed>();
  needs.forEach((need) => {
    const key = `${normalize(need.title)}::${normalize(need.relatedAccountName || '')}::${normalize(need.relatedOpportunityName || '')}`;
    const existing = byId.get(key);
    if (!existing || priorityRank(need.priority) > priorityRank(existing.priority)) {
      byId.set(key, need);
    }
  });
  return Array.from(byId.values());
}

function priorityRank(priority: SalesAssetNeed['priority']) {
  return { High: 3, Medium: 2, Low: 1 }[priority];
}

function unique(items: string[]) {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

function normalize(value = '') {
  return value.trim().toLowerCase();
}
