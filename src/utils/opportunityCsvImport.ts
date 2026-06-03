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

export type OpportunityCsvField =
  | 'accountName'
  | 'opportunityName'
  | 'stage'
  | 'estimatedValue'
  | 'currency'
  | 'expectedClosePeriod'
  | 'productOrSolution'
  | 'nextAction'
  | 'evidence'
  | 'missingContext'
  | 'forecastEvidenceCategory'
  | 'status';

export type CsvMappingSourceType = 'Salesforce' | 'HubSpot' | 'Excel' | 'Other CRM' | 'Custom';

export type CsvMappingConfidence = 'Saved' | 'Auto-detected' | 'Unmapped';

export type CsvMappingProfile = {
  id: string;
  name: string;
  sourceType: CsvMappingSourceType;
  detectedHeaders: string[];
  fieldMap: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string;
  usageCount: number;
};

export type CsvMappingReviewRow = {
  csvColumn: string;
  normalizedHeader: string;
  mappedField: OpportunityCsvField | '';
  confidence: CsvMappingConfidence;
};

export type CsvMappingProfileMatch = {
  profile: CsvMappingProfile;
  score: number;
  matchedHeaders: number;
  totalHeaders: number;
};

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
  mappingProfileId?: string;
  mappingProfileName?: string;
  sourceType?: CsvMappingSourceType;
  rowCount: number;
  newCount: number;
  changedCount: number;
  skippedCount: number;
  invalidCount: number;
};

export const OPPORTUNITY_IMPORT_BATCH_STORAGE_KEY = 'memoire.importBatches.v1';
export const CSV_MAPPING_PROFILE_STORAGE_KEY = 'memoire.csvMappingProfiles.v1';

export const OPPORTUNITY_CSV_TEMPLATE = [
  'Account Name,Opportunity Name,Stage,Value,Currency,Expected Close Period,Product / Solution,Next Action,Evidence,Missing Context',
  'Apex Labs,Validation Expansion,Technical discussion,120000,VND,Next quarter,Validation System,Send revised quote by Friday,Budget approved and technical team engaged,Confirm procurement path and economic buyer',
].join('\n');

export const opportunityCsvFields: { value: OpportunityCsvField; label: string }[] = [
  { value: 'accountName', label: 'Account name' },
  { value: 'opportunityName', label: 'Opportunity name' },
  { value: 'stage', label: 'Stage' },
  { value: 'estimatedValue', label: 'Value' },
  { value: 'currency', label: 'Currency' },
  { value: 'expectedClosePeriod', label: 'Expected close period' },
  { value: 'productOrSolution', label: 'Product / solution' },
  { value: 'nextAction', label: 'Next action' },
  { value: 'evidence', label: 'Evidence' },
  { value: 'missingContext', label: 'Missing context' },
  { value: 'forecastEvidenceCategory', label: 'Forecast category' },
  { value: 'status', label: 'Status' },
];

export function parseOpportunityCsv(
  text: string,
  existingOpportunities: CrmLiteOpportunity[] = [],
  fieldMap: Record<string, string> = {}
): OpportunityCsvImportResult {
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
      const input = mapRawRowToOpportunityInput(raw, fieldMap);
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

export function getCsvHeaders(text: string) {
  const parsedRows = parseCsvRows(text.trim());
  return (parsedRows[0] || []).map((header) => header.trim()).filter(Boolean);
}

export function buildCsvMappingReview(
  detectedHeaders: string[],
  fieldMap: Record<string, string> = {},
  matchedProfile?: CsvMappingProfile | null
): CsvMappingReviewRow[] {
  return detectedHeaders.map((header) => {
    const normalizedHeader = normalizeHeader(header);
    const savedField = normalizeCsvField(fieldMap[normalizedHeader] || fieldMap[header]);
    const autoField = autoDetectCsvField(normalizedHeader);
    const mappedField = savedField || autoField || '';
    const confidence: CsvMappingConfidence = savedField && matchedProfile ? 'Saved' : mappedField ? 'Auto-detected' : 'Unmapped';

    return {
      csvColumn: header,
      normalizedHeader,
      mappedField,
      confidence,
    };
  });
}

export function buildFieldMapFromReview(rows: CsvMappingReviewRow[]) {
  return rows.reduce<Record<string, string>>((acc, row) => {
    if (row.mappedField) {
      acc[row.normalizedHeader] = row.mappedField;
    }
    return acc;
  }, {});
}

export function getOpportunityCsvFieldOptions() {
  return opportunityCsvFields;
}

export function detectCsvMappingProfile(
  detectedHeaders: string[],
  profiles: CsvMappingProfile[]
): CsvMappingProfileMatch | null {
  const normalizedHeaders = new Set(detectedHeaders.map(normalizeHeader).filter(Boolean));
  if (normalizedHeaders.size === 0) return null;

  const matches = profiles.map((profile) => {
    const profileHeaders = new Set(profile.detectedHeaders.map(normalizeHeader).filter(Boolean));
    const matchedHeaders = Array.from(normalizedHeaders).filter((header) => profileHeaders.has(header)).length;
    const totalHeaders = Math.max(normalizedHeaders.size, profileHeaders.size, 1);
    return {
      profile,
      matchedHeaders,
      totalHeaders,
      score: matchedHeaders / totalHeaders,
    };
  }).sort((a, b) => b.score - a.score || b.profile.lastUsedAt.localeCompare(a.profile.lastUsedAt));

  const best = matches[0];
  return best && best.score >= 0.72 ? best : null;
}

export function loadCsvMappingProfiles(): CsvMappingProfile[] {
  if (typeof localStorage === 'undefined') return [];
  const raw = localStorage.getItem(CSV_MAPPING_PROFILE_STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as Partial<CsvMappingProfile>[];
    return parsed
      .filter((profile) => profile.id && profile.name)
      .map<CsvMappingProfile>((profile) => ({
        id: profile.id || createLocalId('mapping'),
        name: profile.name || 'CSV mapping',
        sourceType: normalizeSourceType(profile.sourceType),
        detectedHeaders: Array.isArray(profile.detectedHeaders) ? profile.detectedHeaders.filter(Boolean) : [],
        fieldMap: normalizeFieldMap(profile.fieldMap || {}),
        createdAt: profile.createdAt || new Date().toISOString(),
        updatedAt: profile.updatedAt || profile.createdAt || new Date().toISOString(),
        lastUsedAt: profile.lastUsedAt || profile.updatedAt || profile.createdAt || new Date().toISOString(),
        usageCount: Number(profile.usageCount) || 0,
      }))
      .sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt));
  } catch {
    return [];
  }
}

export function saveCsvMappingProfile(input: {
  name: string;
  sourceType: CsvMappingSourceType;
  detectedHeaders: string[];
  fieldMap: Record<string, string>;
}) {
  const timestamp = new Date().toISOString();
  const profile: CsvMappingProfile = {
    id: createLocalId('mapping'),
    name: input.name.trim() || 'CSV mapping',
    sourceType: input.sourceType,
    detectedHeaders: input.detectedHeaders,
    fieldMap: normalizeFieldMap(input.fieldMap),
    createdAt: timestamp,
    updatedAt: timestamp,
    lastUsedAt: timestamp,
    usageCount: 1,
  };
  const next = [profile, ...loadCsvMappingProfiles()].slice(0, 20);
  persistCsvMappingProfiles(next);
  return profile;
}

export function deleteCsvMappingProfile(profileId: string) {
  const next = loadCsvMappingProfiles().filter((profile) => profile.id !== profileId);
  persistCsvMappingProfiles(next);
  return next;
}

export function markCsvMappingProfileUsed(profileId: string) {
  const timestamp = new Date().toISOString();
  const next = loadCsvMappingProfiles().map((profile) => (
    profile.id === profileId
      ? {
          ...profile,
          lastUsedAt: timestamp,
          updatedAt: timestamp,
          usageCount: profile.usageCount + 1,
        }
      : profile
  ));
  persistCsvMappingProfiles(next);
  return next;
}

export function suggestCsvMappingSourceType(detectedHeaders: string[]): CsvMappingSourceType {
  const headers = new Set(detectedHeaders.map(normalizeHeader));
  if (headers.has('opportunityname') && (headers.has('stage') || headers.has('stagename')) && (headers.has('amount') || headers.has('closedate'))) {
    return 'Salesforce';
  }
  if ((headers.has('dealname') || headers.has('deal')) && (headers.has('dealstage') || headers.has('pipeline')) && headers.has('amount')) {
    return 'HubSpot';
  }
  if (headers.has('accountname') || headers.has('opportunityname') || headers.has('expectedcloseperiod')) {
    return 'Excel';
  }
  return 'Custom';
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
        mappingProfileId: item.mappingProfileId,
        mappingProfileName: item.mappingProfileName,
        sourceType: normalizeSourceType(item.sourceType),
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

function mapRawRowToOpportunityInput(raw: Record<string, string>, fieldMap: Record<string, string> = {}): OpportunityFormInput {
  const accountName = valueForField(raw, fieldMap, 'accountName');
  const opportunityName = valueForField(raw, fieldMap, 'opportunityName');
  const stageRaw = valueForField(raw, fieldMap, 'stage');
  const closePeriod = valueForField(raw, fieldMap, 'expectedClosePeriod');
  const product = valueForField(raw, fieldMap, 'productOrSolution');
  const nextAction = valueForField(raw, fieldMap, 'nextAction');
  const forecastRaw = valueForField(raw, fieldMap, 'forecastEvidenceCategory');
  const statusRaw = valueForField(raw, fieldMap, 'status');
  const notes = firstValue(raw, ['notes', 'risk', 'risks']);
  const evidence = valueForField(raw, fieldMap, 'evidence');
  const missingContext = valueForField(raw, fieldMap, 'missingContext');

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
    status: normalizeStatus(statusRaw || inferStatus(stageRaw)),
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

const csvFieldAliases: Record<OpportunityCsvField, string[]> = {
  accountName: ['account', 'accountname', 'company', 'companyname', 'customer', 'customername', 'organization'],
  opportunityName: ['opportunity', 'opportunityname', 'deal', 'dealname', 'name', 'projectname'],
  stage: ['stage', 'stagename', 'dealstage', 'opportunitystage', 'pipeline'],
  estimatedValue: ['value', 'amount', 'estimatedvalue', 'dealvalue', 'opportunityamount', 'expectedrevenue'],
  currency: ['currency', 'currencycode'],
  expectedClosePeriod: ['closedate', 'expectedcloseperiod', 'expectedclosedate', 'closeperiod', 'targetclose', 'closingdate'],
  productOrSolution: ['product', 'productsolution', 'solution', 'productorsolution', 'offering'],
  nextAction: ['nextstep', 'nextaction', 'nextsteps', 'followup', 'followupaction'],
  evidence: ['evidence', 'proof', 'qualificationnotes', 'salesnotes'],
  missingContext: ['missingcontext', 'gap', 'gaps', 'risk', 'risks', 'missinginfo'],
  forecastEvidenceCategory: ['forecastcategory', 'forecast', 'forecaststage', 'category'],
  status: ['status', 'dealstatus', 'opportunitystatus'],
};

function valueForField(raw: Record<string, string>, fieldMap: Record<string, string>, field: OpportunityCsvField) {
  const normalizedMap = normalizeFieldMap(fieldMap);
  const mappedValue = Object.entries(normalizedMap)
    .filter(([, mappedField]) => mappedField === field)
    .map(([header]) => raw[header]?.trim())
    .find(Boolean);
  if (mappedValue) return mappedValue;
  return firstValue(raw, csvFieldAliases[field]);
}

function normalizeCsvField(value: unknown): OpportunityCsvField | '' {
  if (typeof value !== 'string') return '';
  const match = opportunityCsvFields.find((field) => field.value === value);
  return match?.value || '';
}

function autoDetectCsvField(normalizedHeader: string): OpportunityCsvField | '' {
  const match = opportunityCsvFields.find((field) => csvFieldAliases[field.value].includes(normalizedHeader));
  return match?.value || '';
}

function normalizeFieldMap(fieldMap: Record<string, string>) {
  return Object.entries(fieldMap).reduce<Record<string, string>>((acc, [header, field]) => {
    const normalizedHeader = normalizeHeader(header);
    const normalizedField = normalizeCsvField(field);
    if (normalizedHeader && normalizedField) {
      acc[normalizedHeader] = normalizedField;
    }
    return acc;
  }, {});
}

function normalizeSourceType(value: unknown): CsvMappingSourceType {
  if (value === 'Salesforce' || value === 'HubSpot' || value === 'Excel' || value === 'Other CRM' || value === 'Custom') {
    return value;
  }
  return 'Custom';
}

function persistCsvMappingProfiles(profiles: CsvMappingProfile[]) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(CSV_MAPPING_PROFILE_STORAGE_KEY, JSON.stringify(profiles));
}

function createLocalId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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

function normalizeStatus(statusRaw: string): OpportunityStatus {
  const normalized = statusRaw.trim().toLowerCase();
  const match = opportunityStatuses.find((status) => status.toLowerCase() === normalized);
  if (match) return match;
  return inferStatus(statusRaw);
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
