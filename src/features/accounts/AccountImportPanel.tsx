import { useMemo, useState } from 'react';
import { Copy, Upload, X } from 'lucide-react';
import { createAccounts, type AccountMemoryRecord } from '../../services/accountStore';
import {
  ACCOUNT_CSV_TEMPLATE,
  accountCsvFields,
  getAccountCsvHeaders,
  getImportableAccountRows,
  parseAccountCsv,
  suggestAccountFieldMap,
  summarizeAccountCsvRows,
  type AccountCsvField,
  type AccountCsvPreviewRow,
} from '../../utils/accountCsvImport';
import { type AccountAliasIndex } from '../../utils/accountAliases';
import { copyTextToClipboard } from '../../utils/clipboard';

/**
 * The first hour, for somebody who already has customers.
 *
 * Everything else on this page assumes the book exists. Until now the only way
 * to put it there was to type it, one account at a time, or to let accounts
 * appear as a side effect of a pipeline CSV - which produces a name and nothing
 * else. A distributor with two hundred customers in a spreadsheet had no first
 * hour at all.
 *
 * Three deliberate refusals:
 *
 * - Nothing is written before it has been seen. Parse produces a preview with
 *   the mapping on show; the write button comes after it and says how many
 *   records it is about to create.
 * - A duplicate is skipped, never merged. A re-exported spreadsheet is far more
 *   often a copy than a correction, and a silent overwrite would replace
 *   hand-written notes with the blanks the CRM exported.
 * - A cell the product cannot read becomes the honest default, and the row says
 *   so. "Platinum" in a relationship column is not a relationship this app has;
 *   inventing one would put a number on the page that nobody typed.
 */

type ImportState =
  | { status: 'idle' }
  | { status: 'working'; message: string }
  | { status: 'done'; created: number; skipped: number; message: string }
  | { status: 'failed'; message: string };

export function AccountImportPanel({
  existingAccounts,
  aliases,
  userId,
  onClose,
  onImported,
}: {
  existingAccounts: AccountMemoryRecord[];
  aliases: AccountAliasIndex;
  userId?: string;
  onClose: () => void;
  onImported: (accounts: AccountMemoryRecord[]) => void;
}) {
  const [csvText, setCsvText] = useState('');
  const [fileName, setFileName] = useState('');
  const [fieldMap, setFieldMap] = useState<Record<string, AccountCsvField>>({});
  const [parsed, setParsed] = useState<AccountCsvPreviewRow[] | null>(null);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [importState, setImportState] = useState<ImportState>({ status: 'idle' });
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  const summary = useMemo(() => (parsed ? summarizeAccountCsvRows(parsed) : null), [parsed]);
  const importable = useMemo(
    () => (parsed ? getImportableAccountRows(parsed, { skipDuplicates }) : []),
    [parsed, skipDuplicates],
  );

  const readText = (text: string, name = '') => {
    setCsvText(text);
    setFileName(name);
    setParsed(null);
    setParseErrors([]);
    setImportState({ status: 'idle' });
    const detected = getAccountCsvHeaders(text);
    setHeaders(detected);
    setFieldMap(detected.length ? suggestAccountFieldMap(detected) : {});
  };

  const handleParse = () => {
    const result = parseAccountCsv(csvText, existingAccounts, fieldMap, aliases);
    setHeaders(result.detectedHeaders);
    setParsed(result.rows.length ? result.rows : null);
    setParseErrors(result.errors);
    setImportState({ status: 'idle' });
  };

  const handleCopyTemplate = async () => {
    const copied = await copyTextToClipboard(ACCOUNT_CSV_TEMPLATE);
    setCopyState(copied ? 'copied' : 'failed');
  };

  const handleImport = async () => {
    if (importable.length === 0) return;
    setImportState({ status: 'working', message: `Creating ${importable.length} account(s)...` });

    try {
      const result = await createAccounts(importable.map((row) => row.input), userId);
      const skipped = (parsed?.length || 0) - result.accounts.length;
      onImported(result.accounts);
      setImportState({
        status: 'done',
        created: result.accounts.length,
        skipped,
        message: result.warning
          || (result.mode === 'cloud'
            ? 'Saved to your account and to this device.'
            : 'Saved on this device. Sign in to sync these to your account.'),
      });
      setParsed(null);
      setCsvText('');
      setHeaders([]);
    } catch (error) {
      setImportState({
        status: 'failed',
        message: error instanceof Error ? error.message : 'The import did not complete. Nothing was created.',
      });
    }
  };

  return (
    <section className="rounded-lg border border-blue-200 bg-blue-50/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-navy">Import accounts</h2>
          <p className="mt-0.5 max-w-2xl text-xs leading-5 text-gray-600">
            Paste or upload a customer list. Memoire shows you what it read before anything is created, and skips
            customers you already have.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-1 text-gray-500 transition hover:bg-white hover:text-navy"
          aria-label="Close import"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50">
          <Upload className="h-3.5 w-3.5" />
          Upload CSV
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (file) readText(await file.text(), file.name);
            }}
            className="sr-only"
          />
        </label>
        <button
          type="button"
          onClick={handleCopyTemplate}
          className="inline-flex items-center gap-1.5 rounded-full border border-brand-blue bg-white px-3 py-1.5 text-xs font-bold text-brand-blue hover:bg-blue-50"
        >
          <Copy className="h-3.5 w-3.5" />
          Copy template
        </button>
        <button
          type="button"
          onClick={handleParse}
          disabled={!csvText.trim()}
          className="rounded-full bg-navy px-3.5 py-1.5 text-xs font-bold text-white disabled:opacity-50"
        >
          Preview
        </button>
        {fileName && <span className="text-xs text-gray-500">{fileName}</span>}
        {copyState === 'copied' && <span className="text-xs font-semibold text-emerald-700">Template copied.</span>}
        {copyState === 'failed' && <span className="text-xs font-semibold text-amber-700">Clipboard blocked - copy the template from the placeholder below.</span>}
      </div>

      <textarea
        value={csvText}
        onChange={(event) => readText(event.target.value, fileName)}
        rows={5}
        placeholder={`Paste CSV here. Recognised headers include:\n${ACCOUNT_CSV_TEMPLATE}`}
        className="mt-3 w-full rounded-lg border border-gray-300 bg-white p-3 font-mono text-[11px] leading-5 text-gray-800 outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
      />

      {parseErrors.length > 0 && (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">{parseErrors[0]}</p>
      )}

      {headers.length > 0 && (
        <ColumnMapping
          headers={headers}
          fieldMap={fieldMap}
          onChange={(header, field) => {
            setFieldMap((current) => ({ ...current, [header]: field }));
            setParsed(null);
          }}
        />
      )}

      {parsed && summary && (
        <div className="mt-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span className="font-bold text-navy">{summary.total} row(s) read</span>
            <span className="text-emerald-700">{summary.importable} new</span>
            {summary.duplicates > 0 && <span className="text-amber-800">{summary.duplicates} already here</span>}
            {summary.invalid > 0 && <span className="text-red-700">{summary.invalid} with no name</span>}
            {summary.withContacts > 0 && <span className="text-gray-600">{summary.withContacts} with contacts</span>}
          </div>

          <PreviewTable rows={parsed} />

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-gray-700">
              <input
                type="checkbox"
                checked={skipDuplicates}
                onChange={(event) => setSkipDuplicates(event.target.checked)}
                className="h-3.5 w-3.5 accent-brand-blue"
              />
              Skip customers already in the workspace
            </label>
            <button
              type="button"
              onClick={handleImport}
              disabled={importable.length === 0 || importState.status === 'working'}
              className="rounded-full bg-brand-blue px-4 py-1.5 text-xs font-bold text-white disabled:opacity-50"
            >
              {importState.status === 'working' ? 'Creating...' : `Create ${importable.length} account(s)`}
            </button>
          </div>
        </div>
      )}

      {importState.status === 'done' && (
        <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
          Created {importState.created} account(s){importState.skipped > 0 ? `, skipped ${importState.skipped}` : ''}. {importState.message}
        </p>
      )}
      {importState.status === 'failed' && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">{importState.message}</p>
      )}
    </section>
  );
}

/**
 * The mapping is shown, not hidden behind a guess. A column the app read as
 * something else is the one import mistake that is invisible afterwards - the
 * record looks filled in, and the wrong field is filled.
 */
function ColumnMapping({
  headers,
  fieldMap,
  onChange,
}: {
  headers: string[];
  fieldMap: Record<string, AccountCsvField>;
  onChange: (header: string, field: AccountCsvField) => void;
}) {
  const unmapped = headers.filter((header) => (fieldMap[header] || 'ignore') === 'ignore').length;

  return (
    <div className="mt-3">
      <p className="text-xs font-bold text-navy">
        Columns
        {unmapped > 0 && <span className="ml-2 font-semibold text-gray-500">{unmapped} not imported</span>}
      </p>
      <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {headers.map((header) => (
          <label key={header} className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-2 py-1.5">
            <span className="min-w-0 flex-1 truncate text-xs font-semibold text-gray-700" title={header}>{header}</span>
            <select
              value={fieldMap[header] || 'ignore'}
              onChange={(event) => onChange(header, event.target.value as AccountCsvField)}
              className="max-w-[52%] rounded border border-gray-300 bg-white px-1.5 py-1 text-[11px] font-semibold text-navy"
              aria-label={`Import ${header} as`}
            >
              {accountCsvFields.map((field) => (
                <option key={field.value} value={field.value}>{field.label}</option>
              ))}
            </select>
          </label>
        ))}
      </div>
    </div>
  );
}

function PreviewTable({ rows }: { rows: AccountCsvPreviewRow[] }) {
  const shown = rows.slice(0, 25);

  return (
    <div className="relative mt-2 overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="w-full min-w-[720px] text-left text-xs">
        <thead className="bg-gray-50 text-[10px] uppercase tracking-[0.12em] text-gray-500">
          <tr>
            <th className="px-2 py-1.5 font-bold">Row</th>
            <th className="px-2 py-1.5 font-bold">Account</th>
            <th className="px-2 py-1.5 font-bold">Segment / industry</th>
            <th className="px-2 py-1.5 font-bold">Potential</th>
            <th className="px-2 py-1.5 font-bold">Relationship</th>
            <th className="px-2 py-1.5 font-bold">Contacts</th>
            <th className="px-2 py-1.5 font-bold">Notes on this row</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {shown.map((row) => (
            <tr key={row.id} className={!row.isValid ? 'bg-red-50/60' : row.isDuplicate ? 'bg-amber-50/60' : ''}>
              <td className="px-2 py-1.5 text-gray-400">{row.rowNumber}</td>
              <td className="px-2 py-1.5 font-semibold text-navy">{row.input.accountName || '-'}</td>
              <td className="px-2 py-1.5 text-gray-600">
                {[row.input.segment, row.input.industry].filter(Boolean).join(' / ') || '-'}
              </td>
              <td className="px-2 py-1.5 text-gray-600">{row.input.accountPotential}</td>
              <td className="px-2 py-1.5 text-gray-600">{row.input.relationshipStatus}</td>
              <td className="px-2 py-1.5 text-gray-600">
                {row.input.keyStakeholders.length > 0 ? row.input.keyStakeholders.join(', ') : '-'}
              </td>
              <td className="px-2 py-1.5 text-gray-500">{row.warnings.join(' ') || 'Ready'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > shown.length && (
        <p className="border-t border-gray-100 px-2 py-1.5 text-[11px] text-gray-500">
          Showing the first {shown.length} of {rows.length} rows. All of them are imported.
        </p>
      )}
    </div>
  );
}
