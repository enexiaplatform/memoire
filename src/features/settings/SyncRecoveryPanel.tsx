import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, CloudOff, RefreshCw } from 'lucide-react';
import { useAuthContext } from '../../auth/authContext';
import { isSupabaseConfigured } from '../../lib/demoMode';
import { hasLocalSampleData } from '../../utils/dataMode';
import { loadSalesWorkspaceData } from '../../services/workspaceData';
import { useWorkspaceSyncStatus } from '../../services/workspaceSyncStatus';
import { resolveAnalyticsDataMode } from '../../utils/productAnalytics';
import {
  readLastBackupExport,
  readLastSuccessfulSync,
  recordSuccessfulSync,
} from '../../services/syncRecoveryLog';

function formatWhen(value: string) {
  if (!value) return 'Never';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Unknown';
  return parsed.toLocaleString();
}

/**
 * Sync & Recovery: what is actually true about where this workspace's data is.
 *
 * The honest boundary matters more here than anywhere else in the product. A
 * restore puts back the *browser* copy - the localStorage side of the
 * workspace. It does not reach into the cloud and replace what is there, and
 * saying otherwise would be the single most damaging thing this screen could
 * do, because someone would rely on it after losing an account.
 */
export function SyncRecoveryPanel() {
  const { user, isAuthenticated } = useAuthContext();
  const syncStatus = useWorkspaceSyncStatus();
  const sampleDataActive = hasLocalSampleData();
  const [retrying, setRetrying] = useState(false);
  const [message, setMessage] = useState('');
  const [lastSync, setLastSync] = useState(() => readLastSuccessfulSync());
  const [lastBackup, setLastBackup] = useState(() => readLastBackupExport());

  const dataMode = resolveAnalyticsDataMode();

  useEffect(() => {
    if (syncStatus.state === 'ready') {
      recordSuccessfulSync();
      setLastSync(readLastSuccessfulSync());
    }
  }, [syncStatus.state]);

  const retry = async () => {
    setRetrying(true);
    setMessage('');
    try {
      await loadSalesWorkspaceData(sampleDataActive ? undefined : user?.id, { force: true });
      recordSuccessfulSync();
      setLastSync(readLastSuccessfulSync());
      setMessage('Synced. Your workspace is up to date.');
    } catch {
      setMessage('Still cannot reach the cloud. Your browser copy is unchanged - export a backup before switching devices.');
    } finally {
      setRetrying(false);
      setLastBackup(readLastBackupExport());
    }
  };

  const failed = syncStatus.state === 'error';

  return (
    <section className="mb-6 rounded-xl border border-gray-200 bg-white p-4" aria-label="Sync and recovery">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-navy">Sync &amp; recovery</h2>
          <p className="mt-1 text-sm text-gray-500">
            Where this workspace&apos;s records actually live right now.
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${
            failed
              ? 'bg-red-50 text-red-700 ring-red-100'
              : dataMode === 'cloud-synced'
                ? 'bg-emerald-50 text-emerald-700 ring-emerald-100'
                : 'bg-amber-50 text-amber-800 ring-amber-100'
          }`}
        >
          {failed ? <CloudOff className="h-3.5 w-3.5" /> : dataMode === 'cloud-synced' ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
          {dataMode}
        </span>
      </div>

      <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-xs leading-5 sm:grid-cols-2">
        <Row label="Cloud status" value={
          !isSupabaseConfigured ? 'Not configured - browser only'
            : !isAuthenticated ? 'Signed out - browser only'
              : failed ? (syncStatus.message || 'Unavailable')
                : syncStatus.state === 'checking' ? 'Checking…'
                  : 'Available'
        } />
        <Row label="Last successful sync" value={formatWhen(lastSync)} />
        <Row label="Last backup exported" value={formatWhen(lastBackup)} />
        <Row
          label="Unsynced changes"
          value={failed
            ? 'Changes since the last successful sync are in this browser only'
            : dataMode === 'cloud-synced' ? 'None known' : 'Everything - nothing is syncing'}
        />
      </dl>

      {message && (
        <p className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800">{message}</p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={retry}
          disabled={retrying || !isAuthenticated}
          className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${retrying ? 'animate-spin' : ''}`} />
          Retry sync
        </button>
        <a
          href="#export"
          className="inline-flex items-center gap-1.5 rounded-full bg-navy px-3 py-1.5 text-xs font-bold text-white hover:bg-navy/90"
        >
          Download a backup
        </a>
      </div>

      {/* The boundary, stated plainly. Someone will read this after losing an
          account, and a comforting half-truth here would be the most damaging
          sentence in the product. */}
      <div className="mt-4 rounded-lg bg-gray-50 p-3 text-xs leading-5 text-gray-600">
        <p className="font-bold text-gray-700">What restore does, and does not do</p>
        <ul className="mt-1.5 space-y-1">
          <li>
            <span className="font-semibold">Browser restore</span> - putting a backup back into this browser. It
            replaces the local copy of your workspace, collection by collection, and reports what landed.
          </li>
          <li>
            <span className="font-semibold">Account restore</span> - when you are signed in, every restored collection
            that lives in your account is pushed there as part of the same operation, so the next sync agrees with the
            file instead of overwriting it. Accounts, deals, activities, stakeholders and objections sync through their
            own stores; the restore says per collection whether the account copy accepted it.
          </li>
          <li>
            A restore can be undone in one click straight afterwards - the workspace it replaced is held until you
            leave the page.
          </li>
          <li>Demo records are always dropped on restore. They never enter a real workspace.</li>
        </ul>
      </div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 font-semibold text-gray-500">{label}:</dt>
      <dd className="min-w-0 text-gray-700">{value}</dd>
    </div>
  );
}
