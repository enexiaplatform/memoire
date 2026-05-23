import {
  decisionRecommendations,
  forecastEvidenceCategories,
  type DecisionRecommendation,
  type ForecastEvidenceCategory,
  type PipelineDefenseDeal,
} from '../data/pipelineDefenseBrief';

export type ImportFormat = 'csv' | 'markdown' | 'unknown';

export type ImportParseResult = {
  deals: PipelineDefenseDeal[];
  format: ImportFormat;
  warnings: string[];
};

type RawImportedDeal = Omit<Partial<PipelineDefenseDeal>, 'objectionDebt'> & {
  objectionDebt?: Partial<PipelineDefenseDeal['objectionDebt']> | string;
};

export function detectImportFormat(input: string): ImportFormat {
  const trimmed = input.trim();
  if (!trimmed) return 'unknown';
  if (/^###\s+/m.test(trimmed)) return 'markdown';

  const firstLine = trimmed.split(/\r?\n/)[0] || '';
  const normalizedHeaders = splitCsvLine(firstLine).map((header) => normalizeKey(header));
  if (normalizedHeaders.includes('account') && normalizedHeaders.includes('opportunity')) return 'csv';

  return 'markdown';
}

export function parsePipelineDealsFromCsv(input: string): ImportParseResult {
  const warnings: string[] = [];
  const lines = input.split(/\r?\n/).filter((line) => line.trim().length > 0);

  if (lines.length < 2) {
    return { deals: [], format: 'csv', warnings: ['CSV needs a header row and at least one deal row.'] };
  }

  const headers = splitCsvLine(lines[0]).map((header) => normalizeKey(header));
  const missingRequiredHeaders = ['account'].filter((header) => !headers.includes(header));
  if (missingRequiredHeaders.length > 0) {
    warnings.push(`Missing CSV header: ${missingRequiredHeaders.join(', ')}`);
  }

  const deals = lines.slice(1).map((line, index) => {
    const values = splitCsvLine(line);
    const raw: Record<string, string> = {};
    headers.forEach((header, headerIndex) => {
      raw[header] = values[headerIndex] || '';
    });

    return normalizeImportedDeal({
      id: `import-csv-${Date.now()}-${index}`,
      account: raw.account,
      opportunity: raw.opportunity,
      pipelineContext: raw.pipelinecontext,
      dealTruth: raw.dealtruth,
      riskType: splitMultiValue(raw.risktype),
      evidence: splitMultiValue(raw.evidence),
      missingContext: splitMultiValue(raw.missingcontext),
      objectionDebt: raw.objectiondebt,
      forecastEvidenceCategory: raw.forecastevidencecategory as ForecastEvidenceCategory,
      recommendedAction: raw.recommendedaction,
      pipelineReviewAnswer: raw.pipelinereviewanswer,
      decisionRecommendation: raw.decisionrecommendation as DecisionRecommendation,
    });
  }).filter((deal) => deal.account.trim().length > 0 || deal.opportunity.trim().length > 0);

  addDefaultWarnings(deals, warnings);

  return { deals, format: 'csv', warnings };
}

export function parsePipelineDealsFromMarkdown(input: string): ImportParseResult {
  const warnings: string[] = [];
  const blocks = input
    .split(/^###\s+/m)
    .map((block) => block.trim())
    .filter(Boolean);

  if (blocks.length === 0) {
    return { deals: [], format: 'markdown', warnings: ['No markdown deal headings found. Use headings like ### Account / Opportunity.'] };
  }

  const deals = blocks.map((block, index) => {
    const lines = block.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const heading = lines[0] || 'New Account / New Opportunity';
    const [accountFromHeading, opportunityFromHeading] = splitHeading(heading);
    const fields = parseLabelledLines(lines.slice(1));

    return normalizeImportedDeal({
      id: `import-md-${Date.now()}-${index}`,
      account: fields.account || accountFromHeading,
      opportunity: fields.opportunity || opportunityFromHeading,
      pipelineContext: fields.pipelinecontext,
      dealTruth: fields.dealtruth,
      riskType: splitMultiValue(fields.risktype),
      evidence: splitMultiValue(fields.evidence),
      missingContext: splitMultiValue(fields.missingcontext),
      objectionDebt: fields.objectiondebt,
      forecastEvidenceCategory: fields.forecastevidencecategory as ForecastEvidenceCategory,
      recommendedAction: fields.recommendedaction,
      pipelineReviewAnswer: fields.pipelinereviewanswer,
      decisionRecommendation: fields.decisionrecommendation as DecisionRecommendation,
    });
  });

  addDefaultWarnings(deals, warnings);

  return { deals, format: 'markdown', warnings };
}

export function parsePipelineDeals(input: string): ImportParseResult {
  const format = detectImportFormat(input);
  if (format === 'csv') return parsePipelineDealsFromCsv(input);
  if (format === 'markdown') return parsePipelineDealsFromMarkdown(input);
  return { deals: [], format: 'unknown', warnings: ['No deals detected. Check your headers or markdown format.'] };
}

export function normalizeImportedDeal(rawDeal: RawImportedDeal): PipelineDefenseDeal {
  const objectionDebt = normalizeObjectionDebt(rawDeal.objectionDebt);

  return {
    id: rawDeal.id || `import-${Date.now()}`,
    account: normalizeText(rawDeal.account, 'New Account'),
    opportunity: normalizeText(rawDeal.opportunity, 'New Opportunity'),
    pipelineContext: normalizeText(rawDeal.pipelineContext, 'Add pipeline period, stage, and source context.'),
    dealTruth: normalizeText(rawDeal.dealTruth, 'Describe what is actually known versus assumed.'),
    riskType: normalizeStringArray(rawDeal.riskType, ['Missing decision context']),
    evidence: normalizeStringArray(rawDeal.evidence, ['Add the customer evidence that supports or weakens this deal.']),
    missingContext: normalizeStringArray(rawDeal.missingContext, ['Decision maker', 'Decision timeline']),
    objectionDebt,
    forecastEvidenceCategory: normalizeForecastCategory(rawDeal.forecastEvidenceCategory),
    recommendedAction: normalizeText(rawDeal.recommendedAction, 'Clarify the deal truth before defending this opportunity.'),
    pipelineReviewAnswer: normalizeText(rawDeal.pipelineReviewAnswer, 'This deal needs clearer evidence before it can be defended in review.'),
    decisionRecommendation: normalizeDecisionRecommendation(rawDeal.decisionRecommendation),
  };
}

function parseLabelledLines(lines: string[]) {
  const fields: Record<string, string> = {};

  for (const line of lines) {
    const match = line.match(/^-?\s*([^:]+):\s*(.*)$/);
    if (!match) continue;
    const key = normalizeKey(match[1]);
    const value = match[2].trim();
    fields[key] = fields[key] ? `${fields[key]}; ${value}` : value;
  }

  return fields;
}

function splitHeading(heading: string) {
  const cleaned = heading.replace(/^#+\s*/, '').trim();
  const parts = cleaned.split(/\s+\/\s+|\s+—\s+|\s+-\s+/);
  return [
    normalizeText(parts[0], 'New Account'),
    normalizeText(parts.slice(1).join(' / '), 'New Opportunity'),
  ];
}

function splitCsvLine(line: string) {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  return values;
}

function splitMultiValue(value?: string | string[]) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  return value
    .split(/\n|;|\|/)
    .map((item) => item.trim().replace(/^-+\s*/, ''))
    .filter(Boolean);
}

function normalizeObjectionDebt(value: RawImportedDeal['objectionDebt']): PipelineDefenseDeal['objectionDebt'] {
  if (typeof value === 'object' && value) {
    return {
      objection: normalizeText(value.objection, 'Add unresolved objection or context gap.'),
      evidence: normalizeText(value.evidence, 'Add source evidence.'),
      requiredAction: normalizeText(value.requiredAction, 'Add required proof or action.'),
      owner: normalizeText(value.owner, 'Henry'),
      status: value.status === 'Context gap' || value.status === 'Unsupported' ? value.status : 'Open',
    };
  }

  return {
    objection: normalizeText(value, 'Add unresolved objection or context gap.'),
    evidence: 'Add source evidence.',
    requiredAction: 'Add required proof or action.',
    owner: 'Henry',
    status: 'Open',
  };
}

function normalizeForecastCategory(value?: string) {
  const match = forecastEvidenceCategories.find((category) => category.toLowerCase() === value?.trim().toLowerCase());
  return match || 'Unsupported';
}

function normalizeDecisionRecommendation(value?: string) {
  const match = decisionRecommendations.find((decision) => decision.toLowerCase() === value?.trim().toLowerCase());
  return match || 'Monitor';
}

function normalizeStringArray(value: string[] | undefined, fallback: string[]) {
  const normalized = (value || []).map((item) => item.trim()).filter(Boolean);
  return normalized.length > 0 ? normalized : fallback;
}

function normalizeText(value: string | undefined, fallback: string) {
  return value && value.trim().length > 0 ? value.trim() : fallback;
}

function normalizeKey(value: string) {
  return value.trim().replace(/[\s_/-]+/g, '').toLowerCase();
}

function addDefaultWarnings(deals: PipelineDefenseDeal[], warnings: string[]) {
  if (deals.length === 0) {
    warnings.push('No deals detected. Check your headers or markdown format.');
    return;
  }

  if (deals.some((deal) => deal.opportunity === 'New Opportunity' || deal.forecastEvidenceCategory === 'Unsupported' || deal.decisionRecommendation === 'Monitor')) {
    warnings.push('Some fields were missing and filled with defaults.');
  }
}
