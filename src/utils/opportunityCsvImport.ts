import {
  decisionRecommendations,
  emptyOpportunityInput,
  forecastEvidenceCategories,
  opportunityStages,
  opportunityStatuses,
  type CrmLiteOpportunity,
  type DecisionRecommendation,
  type ForecastEvidenceCategory,
  type OpportunityFormInput,
  type OpportunityStage,
  type OpportunityStatus,
} from '../services/opportunityStore';

export type OpportunityCsvPreviewRow = {
  id: string;
  rowNumber: number;
  input: OpportunityFormInput;
  warnings: string[];
  isValid: boolean;
  isDuplicate: boolean;
  duplicateReason?: string;
  raw: Record<string, string>;
};

export type OpportunityCsvImportResult = {
  rows: OpportunityCsvPreviewRow[];
  errors: string[];
  detectedHeaders: string[];
};

export const OPPORTUNITY_CSV_TEMPLATE = [
  'Account Name,Opportunity Name,Stage,Value,Currency,Expected Close Period,Product / Solution,Next Action,Evidence,Missing Context',
  'VHP,SolidFog EU-GMP Phase 2,Technical discussion,120000,VND,Next quarter,SolidFog,Send revised quote by Friday,Budget approved and technical team engaged,Confirm procurement path and economic buyer',
].join('\n');

export function parseOpportunityCsv(text: string, existingOpportunities: CrmLiteOpportunity[] = []): OpportunityCsvImportResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return { rows: [], errors: ['Paste or upload a CSV before parsing.'], detectedHeaders: [] };
  }

  const parsedRows = parseCsvRows(trimmed);
  if (parsedRows.length < 2) {
    return { rows: [], errors: ['CSV needs a header row and at least one opportunity row.'], detectedHeaders: parsedRows[0] || [] };
  }

  const headers = parsedRows[0].map(normalizeHeader);
  const detectedHeaders = parsedRows[0].map((header) => header.trim()).filter(Boolean);
  const existingKeys = new Set(existingOpportunities.map(makeOpportunityKey));
  const seenKeys = new Set<string>();

  const rows = parsedRows.slice(1)
    .filter((cells) => cells.some((cell) => cell.trim()))
    .map<OpportunityCsvPreviewRow>((cells, index) => {
      const raw = headers.reduce<Record<string, string>>((acc, header, cellIndex) => {
        if (header) acc[header] = cells[cellIndex]?.trim() || '';
        return acc;
      }, {});
      const input = mapRawRowToOpportunityInput(raw);
      const warnings = buildWarnings(input, raw);
      const key = normalizeDuplicateKey(input.accountName, input.opportunityName);
      const duplicateInExisting = existingKeys.has(key);
      const duplicateInImport = seenKeys.has(key);
      if (key) seenKeys.add(key);
      const isDuplicate = Boolean(key && (duplicateInExisting || duplicateInImport));

      return {
        id: `csv-row-${index + 2}-${key || index}`,
        rowNumber: index + 2,
        input,
        warnings: isDuplicate
          ? [...warnings, duplicateInExisting ? 'Duplicate candidate already exists.' : 'Duplicate candidate appears earlier in this import.']
          : warnings,
        isValid: Boolean(input.accountName && input.opportunityName),
        isDuplicate,
        duplicateReason: duplicateInExisting ? 'Existing opportunity with same account and opportunity name.' : duplicateInImport ? 'Duplicate row in this CSV.' : undefined,
        raw,
      };
    });

  return {
    rows,
    errors: rows.length === 0 ? ['No opportunity rows found after the header.'] : [],
    detectedHeaders,
  };
}

export function getImportableCsvRows(rows: OpportunityCsvPreviewRow[], options: { skipDuplicates: boolean }) {
  return rows.filter((row) => row.isValid && (!options.skipDuplicates || !row.isDuplicate));
}

export function buildImportedOpportunityInput(row: OpportunityCsvPreviewRow, importBatchId: string): OpportunityFormInput {
  const importNote = `CSV import: read-only pipeline copy. Batch ${importBatchId}. Imported ${new Date().toLocaleDateString()}.`;
  return {
    ...row.input,
    evidence: appendNote(row.input.evidence, importNote),
  };
}

export function summarizeImportedOpportunityEnrichment(opportunities: CrmLiteOpportunity[]) {
  const imported = opportunities.filter(isCsvImportedOpportunity);
  const missingEconomicBuyer = imported.filter((opportunity) => !opportunity.budgetOwner.trim() && !opportunity.decisionMaker.trim()).length;
  const missingChampion = imported.filter((opportunity) => !/champion|supporter|sponsor/i.test(`${opportunity.evidence} ${opportunity.missingContext}`)).length;
  const missingDecisionProcess = imported.filter((opportunity) => !opportunity.procurementPath.trim() && !opportunity.expectedClosePeriod.trim()).length;
  const missingNextAction = imported.filter((opportunity) => !opportunity.nextAction.trim()).length;
  const missingEvidence = imported.filter((opportunity) => !opportunity.evidence.trim() || /^CSV import:/i.test(opportunity.evidence.trim())).length;
  const missingProofAsset = imported.filter((opportunity) => /proof|documentation|validation|compliance|asset/i.test(opportunity.missingContext)).length;

  return {
    importedCount: imported.length,
    missingEconomicBuyer,
    missingChampion,
    missingDecisionProcess,
    missingNextAction,
    missingEvidence,
    missingProofAsset,
    totalGaps: missingEconomicBuyer + missingChampion + missingDecisionProcess + missingNextAction + missingEvidence + missingProofAsset,
  };
}

export function isCsvImportedOpportunity(opportunity: CrmLiteOpportunity) {
  return /CSV import: read-only pipeline copy/i.test(opportunity.evidence);
}

function mapRawRowToOpportunityInput(raw: Record<string, string>): OpportunityFormInput {
  const accountName = firstValue(raw, ['account', 'accountname', 'company']);
  const opportunityName = firstValue(raw, ['opportunity', 'opportunityname', 'dealname']);
  const stageRaw = firstValue(raw, ['stage']);
  const closePeriod = firstValue(raw, ['closedate', 'expectedcloseperiod']);
  const product = firstValue(raw, ['product', 'productsolution', 'solution']);
  const nextAction = firstValue(raw, ['nextstep', 'nextaction']);
  const forecastRaw = firstValue(raw, ['forecastcategory']);
  const notes = firstValue(raw, ['notes', 'risk']);
  const evidence = firstValue(raw, ['evidence']);
  const missingContext = firstValue(raw, ['missingcontext']);

  return {
    ...emptyOpportunityInput,
    accountName,
    opportunityName,
    stage: normalizeStage(stageRaw),
    estimatedValue: normalizeValue(firstValue(raw, ['value', 'amount'])),
    currency: normalizeCurrency(firstValue(raw, ['currency'])),
    expectedClosePeriod: closePeriod,
    productOrSolution: product,
    nextAction,
    evidence: appendNote(evidence, notes),
    missingContext,
    forecastEvidenceCategory: normalizeForecastCategory(forecastRaw),
    decisionRecommendation: inferDecisionRecommendation(forecastRaw, missingContext, notes),
    status: inferStatus(stageRaw),
  };
}

function buildWarnings(input: OpportunityFormInput, raw: Record<string, string>) {
  const warnings: string[] = [];
  if (!input.accountName) warnings.push('Missing account name.');
  if (!input.opportunityName) warnings.push('Missing opportunity name.');
  if (!input.estimatedValue) warnings.push('Missing value.');
  if (!input.expectedClosePeriod) warnings.push('Missing close period.');
  if (!input.nextAction) warnings.push('Missing next action.');
  if (!input.evidence || /^CSV import:/i.test(input.evidence)) warnings.push('Missing evidence.');
  if (firstValue(raw, ['stage']) && !opportunityStages.includes(firstValue(raw, ['stage']) as OpportunityStage)) {
    warnings.push(`Unknown stage mapped to ${input.stage}.`);
  }
  if (firstValue(raw, ['currency']) && input.currency === 'VND' && firstValue(raw, ['currency']).toUpperCase() !== 'VND') {
    warnings.push('Unsupported currency mapped to VND.');
  }
  return warnings;
}

function parseCsvRows(text: string) {
  const rows: string[][] = [];
  let current = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(current);
      current = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(current);
      rows.push(row);
      row = [];
      current = '';
      continue;
    }

    current += char;
  }

  row.push(current);
  rows.push(row);
  return rows;
}

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function firstValue(raw: Record<string, string>, keys: string[]) {
  return keys.map((key) => raw[key]?.trim()).find(Boolean) || '';
}

function normalizeStage(value: string): OpportunityStage {
  const normalized = value.trim().toLowerCase();
  const match = opportunityStages.find((stage) => stage.toLowerCase() === normalized);
  if (match) return match;
  if (/technical|tech/.test(normalized)) return 'Technical discussion';
  if (/quote|proposal/.test(normalized)) return 'Proposal';
  if (/procure|tender/.test(normalized)) return 'Procurement';
  if (/negotiat/.test(normalized)) return 'Negotiation';
  if (/demo/.test(normalized)) return 'Demo';
  if (/qual/.test(normalized)) return 'Qualification';
  if (/discover/.test(normalized)) return 'Discovery';
  if (/won/.test(normalized)) return 'Won';
  if (/lost/.test(normalized)) return 'Lost';
  if (/hold/.test(normalized)) return 'On hold';
  return 'Lead';
}

function normalizeForecastCategory(value: string): ForecastEvidenceCategory {
  const normalized = value.trim().toLowerCase();
  const match = forecastEvidenceCategories.find((category) => category.toLowerCase() === normalized);
  if (match) return match;
  if (/commit|best case|defensible|strong/.test(normalized)) return 'Defensible';
  if (/weak|recover/.test(normalized)) return 'Weak but recoverable';
  if (/hope|upside/.test(normalized)) return 'Hope-based';
  if (/unsupported|low/.test(normalized)) return 'Unsupported';
  return 'Weak but recoverable';
}

function inferDecisionRecommendation(forecastRaw: string, missingContext: string, notes: string): DecisionRecommendation {
  const combined = `${forecastRaw} ${missingContext} ${notes}`.toLowerCase();
  if (decisionRecommendations.includes(forecastRaw as DecisionRecommendation)) return forecastRaw as DecisionRecommendation;
  if (/unsupported|downgrade/.test(combined)) return 'Downgrade';
  if (/rescue|risk|missing|unclear|hope/.test(combined)) return 'Rescue';
  if (/defensible|commit|approved|confirmed/.test(combined)) return 'Defend';
  return 'Monitor';
}

function inferStatus(stageRaw: string): OpportunityStatus {
  const normalized = stageRaw.trim().toLowerCase();
  if (opportunityStatuses.includes(stageRaw as OpportunityStatus)) return stageRaw as OpportunityStatus;
  if (/won/.test(normalized)) return 'Won';
  if (/lost/.test(normalized)) return 'Lost';
  if (/hold/.test(normalized)) return 'On hold';
  return 'Active';
}

function normalizeValue(value: string) {
  if (!value) return null;
  const parsed = Number(value.replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeCurrency(value: string) {
  const normalized = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : 'VND';
}

function appendNote(value: string, note: string) {
  const left = value.trim();
  const right = note.trim();
  if (!left) return right;
  if (!right) return left;
  return `${left}\n${right}`;
}

function makeOpportunityKey(opportunity: CrmLiteOpportunity) {
  return normalizeDuplicateKey(opportunity.accountName, opportunity.opportunityName);
}

function normalizeDuplicateKey(accountName: string, opportunityName: string) {
  if (!accountName.trim() || !opportunityName.trim()) return '';
  return `${accountName}|${opportunityName}`.toLowerCase().replace(/\s+/g, ' ').trim();
}
