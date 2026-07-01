import { useState } from 'react';
import JSZip from 'jszip';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';

const SUPPORT_EMAIL = 'hello@memoire.app';
const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Memoire early-access support')}`;

export function ExportTab() {
  const { user } = useAuth();
  const [isExporting, setIsExporting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState('');

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
