import {
  accountPotentials,
  emptyAccountInput,
  relationshipStatuses,
  type AccountFormInput,
  type AccountMemoryRecord,
  type AccountPotential,
  type RelationshipStatus,
} from '../services/accountStore.ts';
import { accountKey, normalizeEntityName } from './accountIdentity.ts';
import { resolveAccountName, type AccountAliasIndex } from './accountAliases.ts';
import { parseCsvRows } from './csvParse.ts';

/**
 * Bringing an existing book of customers in.
 *
 * Until now the only bulk route into Memoire was the opportunity CSV, and
 * accounts appeared as a by-product: a deal named a customer, and the customer
 * showed up as a candidate to be created one at a time. That is fine for a
 * workspace that grows deal by deal and useless for the first hour of somebody
 * who already has two hundred customers in a spreadsheet - which is every user
 * this product is for, on their first day.
 *
 * Deliberately not a second import engine. Same shape as the opportunity path -
 * parse, map, preview, then write - and the same two questions the rest of the
 * app already asks about a name: `accountKey` decides whether two spellings are
 * the same name ("VNVC" and "VNVC."), and the merge aliases decide whether two
 * different names are the same customer, because the operator said so. An
 * import with its own idea of sameness would spend the first hour creating the
 * duplicates the rest of the product spends its time merging - including the
 * ones already merged, which would come straight back on the next re-export.
 */

export type AccountCsvField =
  | 'ignore'
  | 'accountName'
  | 'segment'
  | 'industry'
  | 'location'
  | 'accountPotential'
  | 'relationshipStatus'
  | 'keyStakeholders'
  | 'notes'
  | 'tags';

export const accountCsvFields: { value: AccountCsvField; label: string }[] = [
  { value: 'accountName', label: 'Account name (required)' },
  { value: 'segment', label: 'Segment' },
  { value: 'industry', label: 'Industry' },
  { value: 'location', label: 'Location' },
  { value: 'accountPotential', label: 'Potential' },
  { value: 'relationshipStatus', label: 'Relationship' },
  { value: 'keyStakeholders', label: 'Contacts / stakeholders' },
  { value: 'notes', label: 'Notes' },
  { value: 'tags', label: 'Tags' },
  { value: 'ignore', label: 'Do not import' },
];

export const ACCOUNT_CSV_TEMPLATE = [
  'Account Name,Segment,Industry,Location,Potential,Relationship,Contacts,Notes,Tags',
  'Orion Pharma,Pharma manufacturing,Pharma,Ho Chi Minh City,High,Developing,"Ms. Lan (QA Head); Mr. Minh (Procurement)",Tender expected Q4,"tender;priority"',
].join('\n');

export type AccountCsvPreviewRow = {
  id: string;
  rowNumber: number;
  input: AccountFormInput;
  warnings: string[];
  isValid: boolean;
  isDuplicate: boolean;
  duplicateReason?: string;
  raw: Record<string, string>;
};

export type AccountCsvImportResult = {
  rows: AccountCsvPreviewRow[];
  errors: string[];
  detectedHeaders: string[];
};

/** Header text the app recognises without being told. */
const HEADER_ALIASES: Record<string, AccountCsvField> = {
  account: 'accountName',
  accountname: 'accountName',
  account_name: 'accountName',
  customer: 'accountName',
  customername: 'accountName',
  company: 'accountName',
  companyname: 'accountName',
  name: 'accountName',
  segment: 'segment',
  vertical: 'segment',
  industry: 'industry',
  sector: 'industry',
  location: 'location',
  city: 'location',
  country: 'location',
  region: 'location',
  potential: 'accountPotential',
  accountpotential: 'accountPotential',
  tier: 'accountPotential',
  relationship: 'relationshipStatus',
  relationshipstatus: 'relationshipStatus',
  status: 'relationshipStatus',
  contact: 'keyStakeholders',
  contacts: 'keyStakeholders',
  stakeholder: 'keyStakeholders',
  stakeholders: 'keyStakeholders',
  keystakeholders: 'keyStakeholders',
  contactname: 'keyStakeholders',
  notes: 'notes',
  note: 'notes',
  comment: 'notes',
  comments: 'notes',
  description: 'notes',
  tags: 'tags',
  tag: 'tags',
  labels: 'tags',
};

/**
 * The option lists come from the store rather than being restated here. A copy
 * would drift, and the way it would show up is a relationship the operator
 * typed correctly landing on the fallback because this file had not heard of it.
 */
const POTENTIALS: readonly string[] = accountPotentials;
const RELATIONSHIPS: readonly string[] = relationshipStatuses;

export function getAccountCsvHeaders(text: string): string[] {
  const rows = parseCsvRows(text.trim());
  return (rows[0] || []).map((header) => header.trim()).filter(Boolean);
}

/**
 * Guesses the mapping from the header text, and says which ones it guessed.
 * A mapping the operator never saw is a mapping they cannot correct.
 */
export function suggestAccountFieldMap(headers: string[]): Record<string, AccountCsvField> {
  const map: Record<string, AccountCsvField> = {};
  const claimed = new Set<AccountCsvField>();

  headers.forEach((header) => {
    const normalized = header.toLowerCase().replace(/[^a-z0-9]/g, '');
    const guess = HEADER_ALIASES[normalized];
    // One column per field: a sheet with both "Customer" and "Company" must not
    // silently map both onto the account name and let the last one win.
    if (guess && !claimed.has(guess)) {
      map[header] = guess;
      claimed.add(guess);
    } else {
      map[header] = 'ignore';
    }
  });

  return map;
}

export function parseAccountCsv(
  text: string,
  existingAccounts: AccountMemoryRecord[] = [],
  fieldMap: Record<string, AccountCsvField> = {},
  aliases?: AccountAliasIndex,
): AccountCsvImportResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return { rows: [], errors: ['Paste or upload a CSV before parsing.'], detectedHeaders: [] };
  }

  const parsedRows = parseCsvRows(trimmed);
  if (parsedRows.length < 2) {
    return {
      rows: [],
      errors: ['CSV needs a header row and at least one account row.'],
      detectedHeaders: parsedRows[0] || [],
    };
  }

  const detectedHeaders = parsedRows[0].map((header) => header.trim()).filter(Boolean);
  const effectiveMap = Object.keys(fieldMap).length > 0 ? fieldMap : suggestAccountFieldMap(detectedHeaders);

  const customerKey = (name: string) => accountKey(resolveAccountName(name, aliases));
  const existingKeys = new Set(existingAccounts.map((account) => customerKey(account.accountName)));
  const seenKeys = new Set<string>();

  const rows = parsedRows.slice(1)
    .filter((cells) => cells.some((cell) => cell.trim()))
    .map<AccountCsvPreviewRow>((cells, index) => {
      const raw: Record<string, string> = {};
      parsedRows[0].forEach((header, cellIndex) => {
        const key = header.trim();
        if (key) raw[key] = (cells[cellIndex] || '').trim();
      });

      const input = mapRowToAccountInput(raw, effectiveMap);
      const warnings = buildWarnings(input, raw);
      const key = customerKey(input.accountName);

      const duplicateInExisting = Boolean(key) && existingKeys.has(key);
      const duplicateInImport = Boolean(key) && seenKeys.has(key);
      if (key) seenKeys.add(key);

      return {
        id: `account-csv-row-${index + 2}-${key || index}`,
        rowNumber: index + 2,
        input,
        warnings: duplicateInExisting || duplicateInImport
          ? [...warnings, duplicateInExisting
            ? 'This customer is already in the workspace.'
            : 'The same customer appears earlier in this file.']
          : warnings,
        isValid: Boolean(input.accountName),
        isDuplicate: duplicateInExisting || duplicateInImport,
        duplicateReason: duplicateInExisting
          ? 'An account with this name already exists.'
          : duplicateInImport
            ? 'Repeated row in this CSV.'
            : undefined,
        raw,
      };
    });

  return {
    rows,
    errors: rows.length === 0 ? ['No account rows found after the header.'] : [],
    detectedHeaders,
  };
}

/**
 * What the operator is actually about to write. Duplicates are skipped by
 * default rather than merged: a CSV that arrives after the workspace already
 * has the customer is far more often a re-export than a correction, and a
 * silent overwrite would replace hand-written notes with spreadsheet blanks.
 */
export function getImportableAccountRows(
  rows: AccountCsvPreviewRow[],
  options: { skipDuplicates: boolean },
): AccountCsvPreviewRow[] {
  return rows.filter((row) => row.isValid && (!options.skipDuplicates || !row.isDuplicate));
}

export function summarizeAccountCsvRows(rows: AccountCsvPreviewRow[]) {
  return {
    total: rows.length,
    importable: rows.filter((row) => row.isValid && !row.isDuplicate).length,
    duplicates: rows.filter((row) => row.isDuplicate).length,
    invalid: rows.filter((row) => !row.isValid).length,
    withContacts: rows.filter((row) => row.input.keyStakeholders.length > 0).length,
  };
}

function mapRowToAccountInput(
  raw: Record<string, string>,
  fieldMap: Record<string, AccountCsvField>,
): AccountFormInput {
  const value = (field: AccountCsvField): string => {
    const header = Object.keys(fieldMap).find((key) => fieldMap[key] === field);
    return header ? (raw[header] || '').trim() : '';
  };

  return {
    ...emptyAccountInput,
    accountName: value('accountName'),
    segment: value('segment'),
    industry: value('industry'),
    location: value('location'),
    accountPotential: matchOption(value('accountPotential'), POTENTIALS, 'Unknown') as AccountPotential,
    relationshipStatus: matchOption(value('relationshipStatus'), RELATIONSHIPS, 'New') as RelationshipStatus,
    keyStakeholders: splitList(value('keyStakeholders')),
    notes: value('notes'),
    tags: splitList(value('tags')),
  };
}

/**
 * A spreadsheet says "high", "HIGH", "Hi" and "A". The first three are the same
 * answer; the fourth is not one this product has, so it becomes the honest
 * default rather than a guess that reads as data.
 */
function matchOption(value: string, options: readonly string[], fallback: string): string {
  const normalized = normalizeEntityName(value);
  if (!normalized) return fallback;
  const exact = options.find((option) => normalizeEntityName(option) === normalized);
  return exact || fallback;
}

function splitList(value: string): string[] {
  if (!value.trim()) return [];
  return value
    .split(/[;|\n]|,(?![^(]*\))/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildWarnings(input: AccountFormInput, raw: Record<string, string>): string[] {
  const warnings: string[] = [];
  if (!input.accountName) warnings.push('No account name - this row cannot be imported.');
  if (input.accountName && input.accountName.length > 120) warnings.push('Account name is unusually long; check the column mapping.');
  if (!input.segment && !input.industry) warnings.push('No segment or industry.');
  if (Object.values(raw).every((value) => !value)) warnings.push('Row is empty.');
  return warnings;
}

/*
 * The reader used to be copied in here, with a comment explaining that keeping
 * it separate let the two import paths "diverge". They never did diverge; they
 * shared a bug, in triplicate, and it could not be fixed once. It now lives in
 * utils/csvParse.ts.
 */
