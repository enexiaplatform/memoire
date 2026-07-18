import { useRef, useState } from 'react';
import JSZip from 'jszip';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import {
  BACKUP_FORMAT_VERSION,
  buildRestorePlan,
  parseBackupFile,
  type BackupEnvelope,
  type BackupSummary,
} from '../../utils/workspaceBackup';
import { hasLocalSampleData } from '../../utils/dataMode';

const SUPPORT_EMAIL = 'hello@memoire.app';
const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Memoire early-access support')}`;

export function ExportTab() {
  const { user } = useAuth();
  const [isExporting, setIsExporting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [pending, setPending] = useState<{ envelope: BackupEnvelope; summary: BackupSummary; fileName: string } | null>(null);
  const [restoreError, setRestoreError] = useState('');
  const [isReading, setIsReading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Restoring into the demo sandbox is a trap: the restore clears every
  // memoire.* key including the sample flag, and since the app grants access on
  // a session *or* that flag, a signed-out demo visitor would land on the login
  // wall with their data behind it. Putting a real workspace into a throwaway
  // showcase means nothing anyway, so the operation is refused up front rather
  // than half-explained afterwards.
  const sampleDataActive = hasLocalSampleData();

  // Reading a backup only ever fills the preview. Nothing is written until the
  // user looks at what is in the file and says so - a restore replaces the
  // workspace, and that is not a decision to make from a file picker.
  const handleChooseBackup = async (file: File | undefined) => {
    if (!file || sampleDataActive) return;
    setRestoreError('');
    setPending(null);
    setIsReading(true);

    try {
      const raw = await readBackupText(file);
      const result = parseBackupFile(raw);
      if (!result.ok) {
        setRestoreError(result.message);
        return;
      }
      setPending({ envelope: result.envelope, summary: result.summary, fileName: file.name });
    } catch {
      setRestoreError('Memoire could not read that file. Pick the ZIP from an export, or the .json inside it.');
    } finally {
      setIsReading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleConfirmRestore = () => {
    if (!pending || sampleDataActive) return;
    const plan = buildRestorePlan(pending.envelope);
    const confirmed = window.confirm(
      `Replace this browser's Memoire workspace with the backup from ${formatBackupDate(pending.summary.exportedAt)}?\n\n`
      + `${plan.restoredRecords} records will be restored across ${plan.writes.length} stores. `
      + 'Everything currently in this browser is replaced. This cannot be undone.',
    );
    if (!confirmed) return;

    clearMemoireLocalData();
    plan.writes.forEach(({ key, value }) => window.localStorage.setItem(key, value));

    const dropped = plan.droppedSampleRecords > 0
      ? ` ${plan.droppedSampleRecords} demo records were left out.`
      : '';
    setStatusMessage(`Workspace restored from ${pending.fileName}.${dropped} Reloading...`);
    setPending(null);
    window.setTimeout(() => window.location.replace('/app/today'), 600);
  };

  const handleExport = async () => {
    setIsExporting(true);
    setExportError(null);
    setStatusMessage('');

    try {
      const localData = collectLocalMemoireData();
      let cloudData: unknown = null;
      const cloudWarning = '';

      if (user) {
        const { data: { session } } = await supabase.auth.getSession();
        const response = await fetch('/api/export', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.id,
            authToken: session?.access_token,
          }),
        });

        if (response.ok) {
          cloudData = await response.json();
        } else {
          const errorBody = await response.json().catch(() => null);
          const errorMessage =
            errorBody && typeof errorBody === 'object' && 'error' in errorBody && typeof errorBody.error === 'string'
              ? errorBody.error
              : 'Cloud export was unavailable. Please retry before relying on this export.';
          throw new Error(errorMessage);
        }
      }

      const exportedAt = new Date().toISOString();
      const archive = {
        exportedAt,
        // Written so a future Memoire can tell what it is holding, and refuse a
        // backup from a version that knows more than it does.
        formatVersion: BACKUP_FORMAT_VERSION,
        mode: user ? 'signed-in' : 'local-only',
        cloudData,
        localBrowserData: localData,
        warning: cloudWarning || undefined,
      };

      const zip = new JSZip();
      zip.file('memoire-workspace-export.json', JSON.stringify(archive, null, 2));
      zip.file('README.txt', buildExportReadme(exportedAt, Boolean(user), cloudWarning));
      const content = await zip.generateAsync({ type: 'blob' });
      downloadBlob(content, `memoire-export-${exportedAt.slice(0, 10)}.zip`);

      setStatusMessage(cloudWarning || 'Workspace export downloaded.');
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Memoire could not generate the workspace export.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleClearLocalData = () => {
    const confirmed = window.confirm(
      'Clear all Memoire data stored in this browser? This does not delete cloud data and cannot be undone.',
    );
    if (!confirmed) return;
    clearMemoireLocalData();
    setStatusMessage('Local Memoire browser data cleared. Reloading...');
    window.setTimeout(() => window.location.replace('/'), 400);
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    const confirmed = window.confirm(
      'Permanently delete your signed-in account and associated cloud data? Export first. This cannot be undone.',
    );
    if (!confirmed) return;
    if (window.prompt("Type 'DELETE' to confirm:") !== 'DELETE') return;

    setIsDeleting(true);
    setExportError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/delete-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          authToken: session?.access_token,
        }),
      });

      if (!response.ok) throw new Error('Account deletion failed.');
      clearMemoireLocalData();
      await supabase.auth.signOut();
      window.location.replace('/');
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Account deletion failed. Contact support if the issue continues.');
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-navy">Export workspace data</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-gray-500">
              Download a ZIP containing Memoire records stored in this browser and available cloud records when signed in.
              Keep this file secure because it may contain customer and pipeline information.
            </p>
          </div>
          <button
            type="button"
            onClick={handleExport}
            disabled={isExporting}
            className="shrink-0 rounded-full bg-navy px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            {isExporting ? 'Generating...' : 'Download ZIP'}
          </button>
        </div>
        {statusMessage && <p className="mt-4 rounded-lg bg-blue-50 p-3 text-sm font-semibold text-blue-700">{statusMessage}</p>}
        {exportError && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">{exportError}</p>}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-navy">Restore from a backup</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-gray-500">
              Put an export back into this browser - after a device change, or to undo a bad import.
              Memoire shows you what is in the file before anything is written. Restoring replaces
              the workspace in this browser; demo records are never restored into it.
            </p>
          </div>
          <div className="shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip,.json,application/zip,application/json"
              onChange={(event) => void handleChooseBackup(event.target.files?.[0])}
              className="hidden"
              id="memoire-restore-file"
              disabled={sampleDataActive}
            />
            <label
              htmlFor="memoire-restore-file"
              aria-disabled={sampleDataActive}
              className={`inline-flex rounded-full border border-gray-200 bg-white px-5 py-2.5 text-sm font-bold text-navy ${
                sampleDataActive ? 'pointer-events-none opacity-40' : 'cursor-pointer hover:bg-gray-50'
              }`}
            >
              {isReading ? 'Reading...' : 'Choose backup file'}
            </label>
          </div>
        </div>

        {sampleDataActive && (
          <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm font-semibold text-amber-800">
            Exit the demo first. Restoring replaces everything in this browser, including the demo
            sandbox you are currently inside.
          </p>
        )}

        {restoreError && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">{restoreError}</p>}

        {pending && (
          <div className="mt-5 rounded-lg border border-blue-100 bg-blue-50/50 p-4">
            <h3 className="text-sm font-bold text-navy">
              {pending.fileName} - exported {formatBackupDate(pending.summary.exportedAt)}
            </h3>
            <p className="mt-1 text-sm text-gray-600">
              {pending.summary.totalRecords} records across {pending.summary.totalKeys} stores
              {pending.summary.totalSampleRecords > 0
                ? `, of which ${pending.summary.totalSampleRecords} are demo records that will not be restored`
                : ''}
              .
            </p>
            <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto text-xs leading-5 text-gray-600">
              {pending.summary.entries.filter((entry) => entry.recordCount !== null && entry.recordCount > 0).map((entry) => (
                <li key={entry.key} className="flex justify-between gap-3">
                  <span className="truncate font-semibold text-gray-800">{friendlyStoreName(entry.key)}</span>
                  <span className="shrink-0">{(entry.recordCount || 0) - entry.sampleCount}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleConfirmRestore}
                className="rounded-full bg-navy px-5 py-2.5 text-sm font-bold text-white"
              >
                Replace workspace with this backup
              </button>
              <button
                type="button"
                onClick={() => setPending(null)}
                className="text-sm font-bold text-gray-500 hover:underline"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-blue-100 bg-blue-50/50 p-6 shadow-sm sm:p-8">
        <h2 className="text-lg font-bold text-navy">Support package</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">
          For early-access support, include what you were doing, the approximate time, the visible error message,
          and whether you were signed in or using local/demo mode. Download an export first if support needs
          workspace evidence for sync, deletion, or data-recovery issues.
        </p>
        <a
          href={SUPPORT_MAILTO}
          className="mt-4 inline-flex rounded-full bg-white px-4 py-2 text-sm font-bold text-brand-blue ring-1 ring-blue-100 hover:bg-blue-100"
        >
          Contact support
        </a>
        <p className="mt-3 text-xs leading-5 text-gray-500">
          Exports may contain customer and pipeline information. Only share an export when you choose to include
          that data for troubleshooting.
        </p>
      </section>

      <section className="rounded-lg border border-red-200 bg-white p-6 shadow-sm sm:p-8">
        <h2 className="text-lg font-bold text-navy">Danger zone</h2>
        <div className="mt-5 space-y-5">
          <DangerAction
            title="Clear this browser"
            description="Removes Memoire local and demo data from this browser only. Signed-in cloud data is not deleted."
            label="Clear local data"
            onClick={handleClearLocalData}
          />
          {user && (
            <DangerAction
              title="Delete signed-in account"
              description="Deletes the authentication account and associated cloud rows that use account-delete cascading, then clears local Memoire data."
              label={isDeleting ? 'Deleting...' : 'Delete account'}
              onClick={handleDeleteAccount}
              disabled={isDeleting}
            />
          )}
        </div>
      </section>
    </div>
  );
}

function DangerAction({
  title,
  description,
  label,
  onClick,
  disabled = false,
}: {
  title: string;
  description: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 border-t border-gray-100 pt-5 first:border-t-0 first:pt-0 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h3 className="text-sm font-bold text-navy">{title}</h3>
        <p className="mt-1 max-w-xl text-sm leading-6 text-gray-500">{description}</p>
      </div>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="shrink-0 rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-700 hover:bg-red-100 disabled:opacity-50"
      >
        {label}
      </button>
    </div>
  );
}

/**
 * Accepts either half of what export produces: the ZIP itself, or the JSON
 * pulled out of it. Asking a user to remember which one to hand back is a
 * detail the app can absorb.
 */
async function readBackupText(file: File) {
  const isZip = file.name.toLowerCase().endsWith('.zip') || file.type.includes('zip');
  if (!isZip) return file.text();

  const zip = await JSZip.loadAsync(file);
  const entry = Object.values(zip.files).find((item) => !item.dir && item.name.toLowerCase().endsWith('.json'));
  if (!entry) throw new Error('No JSON payload in that ZIP.');
  return entry.async('string');
}

function formatBackupDate(value: string) {
  try {
    return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  } catch {
    return value;
  }
}

/** "memoire.salesActivities.v1" reads as plumbing; the user stored activities. */
function friendlyStoreName(key: string) {
  const stem = key.replace(/^memoire\./, '').replace(/\.v\d+$/, '');
  return stem
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, (character) => character.toUpperCase());
}

function collectLocalMemoireData() {
  const data: Record<string, unknown> = {};
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key || !key.startsWith('memoire.')) continue;
    const value = window.localStorage.getItem(key);
    if (value === null) continue;
    try {
      data[key] = JSON.parse(value);
    } catch {
      data[key] = value;
    }
  }
  return data;
}

function clearMemoireLocalData() {
  const keys: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith('memoire.')) keys.push(key);
  }
  keys.forEach((key) => window.localStorage.removeItem(key));
}

function downloadBlob(content: Blob, filename: string) {
  const url = window.URL.createObjectURL(content);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
}

function buildExportReadme(exportedAt: string, signedIn: boolean, warning: string) {
  return [
    'Memoire workspace export',
    `Exported: ${exportedAt}`,
    `Mode: ${signedIn ? 'Signed in (cloud + browser data)' : 'Local browser data only'}`,
    warning ? `Warning: ${warning}` : '',
    '',
    'This archive may contain sensitive customer and pipeline information. Store it securely.',
    'For support: share this archive only if you choose to include workspace data for troubleshooting.',
    `Support contact: ${SUPPORT_EMAIL}`,
  ].filter(Boolean).join('\n');
}
