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

export type OpportunityCsvImportMode = 'import' | 'refresh';

export type OpportunityRefreshStatus =
  | 'new'
  | 'existing-unchanged'
  | 'existing-changed'
  | 'possible-duplicate'
  | 'invalid';

export type OpportunityRefreshField = keyof Pick<
  OpportunityFormInput,
  | 'stage'
  | 'estimatedValue'
  | 'currency'
  | 'expectedClosePeriod'
  | 'productOrSolution'
  | 'nextAction'
  | 'evidence'
  | 'missingContext'
  | 'forecastEvidenceCategory'
  | 'status'
>;

export type OpportunityFieldChange = {
  field: OpportunityRefreshField;
  label: string;
  currentValue: string;
  importedValue: string;
  defaultSelected: boolean;
  isProtected: boolean;
};

export type OpportunityRefreshPreviewItem = {
  id: string;
  row: OpportunityCsvPreviewRow;
  status: OpportunityRefreshStatus;
  existingOpportunity?: CrmLiteOpportunity;
  possibleDuplicate?: CrmLiteOpportunity;
  duplicateReason?: string;
  changes: OpportunityFieldChange[];
  warnings: string[];
};

export type PipelineRefreshPreview = {
  items: OpportunityRefreshPreviewItem[];
  newItems: OpportunityRefreshPreviewItem[];
  changedItems: OpportunityRefreshPreviewItem[];
  unchangedItems: OpportunityRefreshPreviewItem[];
  duplicateItems: OpportunityRefreshPreviewItem[];
  invalidItems: OpportunityRefreshPreviewItem[];
  summary: {
    rowCount: number;
    newCount: number;
    changedCount: number;
    unchangedCount: number;
    possibleDuplicateCount: number;
    invalidCount: number;
  };
};

export type OpportunityImportBatchRecord = {
  id: string;
  mode: OpportunityCsvImportMode;
  createdAt: string;
  fileName?: string;
  rowCount: number;
  newCount: number;
  changedCount: number;
  skippedCount: number;
  invalidCount: number;
};

export const OPPORTUNITY_IMPORT_BATCH_STORAGE_KEY = 'memoire.importBatches.v1';

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

export function preparePipelineRefreshPreview(
  result: OpportunityCsvImportResult,
  existingOpportunities: CrmLiteOpportunity[]
): PipelineRefreshPreview {
  const items = compareImportedOpportunities(result.rows, existingOpportunities);

  return {
    items,
    newItems: items.filter((item) => item.status === 'new'),
    changedItems: items.filter((item) => item.status === 'existing-changed'),
    unchangedItems: items.filter((item) => item.status === 'existing-unchanged'),
    duplicateItems: items.filter((item) => item.status === 'possible-duplicate'),
    invalidItems: items.filter((item) => item.status === 'invalid'),
    summary: {
      rowCount: items.length,
      newCount: items.filter((item) => item.status === 'new').length,
      changedCount: items.filter((item) => item.status === 'existing-changed').length,
      unchangedCount: items.filter((item) => item.status === 'existing-unchanged').length,
      possibleDuplicateCount: items.filter((item) => item.status === 'possible-duplicate').length,
      invalidCount: items.filter((item) => item.status === 'invalid').length,
    },
  };
}

export function compareImportedOpportunities(
  rows: OpportunityCsvPreviewRow[],
  existingOpportunities: CrmLiteOpportunity[]
): OpportunityRefreshPreviewItem[] {
  const existingByKey = new Map(existingOpportunities.map((opportunity) => [makeOpportunityKey(opportunity), opportunity]));
  const seenImportKeys = new Set<string>();

  return rows.map((row) => {
    const key = normalizeDuplicateKey(row.input.accountName, row.input.opportunityName);
    const duplicateInImport = Boolean(key && seenImportKeys.has(key));
    if (key) seenImportKeys.add(key);

    if (!row.isValid) {
      return buildRefreshItem(row, 'invalid', undefined, [], row.warnings);
    }

    const exactMatch = key ? existingByKey.get(key) : undefined;
    if (exactMatch && duplicateInImport) {
      return buildRefreshItem(row, 'possible-duplicate', exactMatch, [], [
        ...row.warnings,
        'Duplicate row appears more than once in this CSV.',
      ]);
    }

    if (exactMatch) {
      const changes = detectOpportunityChanges(exactMatch, row.input);
      return buildRefreshItem(
        row,
        changes.length ? 'existing-changed' : 'existing-unchanged',
        exactMatch,
        changes,
        row.warnings
      );
    }

    const possibleDuplicate = findPossibleDuplicate(row, existingOpportunities);
    if (possibleDuplicate) {
      return {
        ...buildRefreshItem(row, 'possible-duplicate', undefined, [], [
          ...row.warnings,
          'Possible duplicate. Review before importing.',
        ]),
        possibleDuplicate,
        duplicateReason: buildPossibleDuplicateReason(row, possibleDuplicate),
      };
    }

    return buildRefreshItem(row, 'new', undefined, [], row.warnings);
  });
}

export function detectOpportunityChanges(
  existing: CrmLiteOpportunity,
  incoming: OpportunityFormInput
): OpportunityFieldChange[] {
  return refreshFields
    .map((fieldConfig) => {
      const currentValue = fieldToComparableValue(existing[fieldConfig.field]);
      const importedValue = fieldToComparableValue(incoming[fieldConfig.field]);
      if (currentValue === importedValue) return null;

      const existingBlank = currentValue.length === 0;
      return {
        field: fieldConfig.field,
        label: fieldConfig.label,
        currentValue: currentValue || 'Blank',
        importedValue: importedValue || 'Blank',
        defaultSelected: fieldConfig.safeBaseField || (existingBlank && !fieldConfig.safeBaseField),
        isProtected: !fieldConfig.safeBaseField,
      } satisfies OpportunityFieldChange;
    })
    .filter((change): change is OpportunityFieldChange => Boolean(change));
}

export function loadOpportunityImportBatches(): OpportunityImportBatchRecord[] {
  if (typeof localStorage === 'undefined') return [];
  const raw = localStorage.getItem(OPPORTUNITY_IMPORT_BATCH_STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as Partial<OpportunityImportBatchRecord>[];
    return parsed
      .filter((item) => item.id && item.createdAt)
      .map<OpportunityImportBatchRecord>((item) => ({
        id: item.id || `batch-${Date.now()}`,
        mode: item.mode === 'refresh' ? 'refresh' : 'import',
        createdAt: item.createdAt || new Date().toISOString(),
        fileName: item.fileName,
        rowCount: Number(item.rowCount) || 0,
        newCount: Number(item.newCount) || 0,
        changedCount: Number(item.changedCount) || 0,
        skippedCount: Number(item.skippedCount) || 0,
        invalidCount: Number(item.invalidCount) || 0,
      }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

export function recordOpportunityImportBatch(record: Omit<OpportunityImportBatchRecord, 'createdAt'> & { createdAt?: string }) {
  if (typeof localStorage === 'undefined') return [];
  const nextRecord: OpportunityImportBatchRecord = {
    ...record,
    createdAt: record.createdAt || new Date().toISOString(),
  };
  const next = [nextRecord, ...loadOpportunityImportBatches().filter((item) => item.id !== nextRecord.id)].slice(0, 12);
  localStorage.setItem(OPPORTUNITY_IMPORT_BATCH_STORAGE_KEY, JSON.stringify(next));
  return next;
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

const refreshFields: { field: OpportunityRefreshField; label: string; safeBaseField: boolean }[] = [
  { field: 'stage', label: 'Stage', safeBaseField: true },
  { field: 'estimatedValue', label: 'Value', safeBaseField: true },
  { field: 'currency', label: 'Currency', safeBaseField: true },
  { field: 'expectedClosePeriod', label: 'Expected close period', safeBaseField: true },
  { field: 'productOrSolution', label: 'Product / solution', safeBaseField: true },
  { field: 'nextAction', label: 'Next action', safeBaseField: true },
  { field: 'evidence', label: 'Evidence', safeBaseField: false },
  { field: 'missingContext', label: 'Missing context', safeBaseField: false },
  { field: 'forecastEvidenceCategory', label: 'Forecast category', safeBaseField: false },
  { field: 'status', label: 'Status', safeBaseField: false },
];

function buildRefreshItem(
  row: OpportunityCsvPreviewRow,
  status: OpportunityRefreshStatus,
  existingOpportunity: CrmLiteOpportunity | undefined,
  changes: OpportunityFieldChange[],
  warnings: string[]
): OpportunityRefreshPreviewItem {
  return {
    id: `${row.id}-${status}`,
    row,
    status,
    existingOpportunity,
    changes,
    warnings,
  };
}

function findPossibleDuplicate(row: OpportunityCsvPreviewRow, existingOpportunities: CrmLiteOpportunity[]) {
  const incomingAccount = normalizeText(row.input.accountName);
  const incomingOpportunity = normalizeText(row.input.opportunityName);
  const incomingTokens = meaningfulTokens(`${row.input.opportunityName} ${row.input.productOrSolution}`);

  return existingOpportunities.find((opportunity) => {
    const account = normalizeText(opportunity.accountName);
    const opportunityName = normalizeText(opportunity.opportunityName);
    const accountClose = Boolean(incomingAccount && account && (incomingAccount.includes(account) || account.includes(incomingAccount)));
    const opportunityClose = Boolean(incomingOpportunity && opportunityName && (incomingOpportunity.includes(opportunityName) || opportunityName.includes(incomingOpportunity)));
    const overlap = tokenOverlap(incomingTokens, meaningfulTokens(`${opportunity.opportunityName} ${opportunity.productOrSolution}`));
    const sameValue = row.input.estimatedValue !== null && row.input.estimatedValue === opportunity.estimatedValue;
    const sameClose = Boolean(row.input.expectedClosePeriod && row.input.expectedClosePeriod === opportunity.expectedClosePeriod);

    return (accountClose && (opportunityClose || overlap >= 2)) || (overlap >= 3 && (sameValue || sameClose));
  });
}

function buildPossibleDuplicateReason(row: OpportunityCsvPreviewRow, opportunity: CrmLiteOpportunity) {
  const overlap = tokenOverlap(
    meaningfulTokens(`${row.input.opportunityName} ${row.input.productOrSolution}`),
    meaningfulTokens(`${opportunity.opportunityName} ${opportunity.productOrSolution}`)
  );
  if (normalizeText(row.input.accountName) === normalizeText(opportunity.accountName)) {
    return `Same account and ${overlap} meaningful opportunity/product token(s) overlap.`;
  }
  return `${overlap} meaningful opportunity/product token(s) overlap.`;
}

function fieldToComparableValue(value: unknown) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  return String(value).trim();
}

function makeOpportunityKey(opportunity: CrmLiteOpportunity) {
  return normalizeDuplicateKey(opportunity.accountName, opportunity.opportunityName);
}

function normalizeDuplicateKey(accountName: string, opportunityName: string) {
  if (!accountName.trim() || !opportunityName.trim()) return '';
  return `${accountName}|${opportunityName}`.toLowerCase().replace(/\s+/g, ' ').trim();
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function meaningfulTokens(value: string) {
  const stopWords = new Set(['phase', 'project', 'opportunity', 'workflow', 'discussion', 'deal', 'the', 'and', 'for']);
  return normalizeText(value)
    .split(' ')
    .filter((token) => token.length > 2 && !stopWords.has(token));
}

function tokenOverlap(left: string[], right: string[]) {
  const rightSet = new Set(right);
  return Array.from(new Set(left)).filter((token) => rightSet.has(token)).length;
}
