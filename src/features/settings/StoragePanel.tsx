import { useEffect, useState } from 'react';
import { Database } from 'lucide-react';
import {
  estimateOriginStorage,
  measureLocalStorageUsage,
  type StorageUsage,
} from '../../services/localWriteGuard';

/**
 * What this workspace costs the browser, and how close that is to the wall.
 *
 * Every record Memoire holds lives in this browser first, and browsers cap that
 * at roughly 5 MB with no warning of their own - the first sign is a save that
 * fails. Measured on a live workspace, a captured activity costs about 2.5 KB
 * and an opportunity about 1.8 KB, so the ceiling is a real date for a daily
 * user rather than a theoretical limit, and pasted email threads bring it much
 * closer.
 *
 * The panel exists so that date is visible before it arrives. It is deliberately
 * plain: a number, a bar, and the two things that actually help - take a backup,
 * and sign in so records have somewhere else to live.
 */
export function StoragePanel() {
  const [usage, setUsage] = useState<StorageUsage>(() => measureLocalStorageUsage());
  const [origin, setOrigin] = useState<{ originBytes: number | null; originQuota: number | null }>({
    originBytes: null,
    originQuota: null,
  });

  useEffect(() => {
    let active = true;
    void estimateOriginStorage().then((estimate) => { if (active) setOrigin(estimate); });
    return () => { active = false; };
  }, []);

  // The browser's own quota where it reports one, and the conservative
  // localStorage ceiling where it does not. Reporting the origin quota alone
  // would be misleading: it covers IndexedDB and caches too, and localStorage
  // hits its own limit long before the origin does.
  const ceiling = 5 * 1024 * 1024;
  const percent = Math.min(100, Math.round((usage.memoireBytes / ceiling) * 100));
  const tone = percent >= 80 ? 'red' : percent >= 60 ? 'amber' : 'green';

  const totalRecords = usage.byKey.reduce((sum, row) => sum + (row.records || 0), 0);

  return (
    <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <Database className="mt-0.5 h-4 w-4 shrink-0 text-brand-blue" />
          <div>
            <p className="text-sm font-semibold text-navy">Storage in this browser</p>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-500">
              Every record is written here first. Browsers cap this at around 5 MB and give no warning of their own -
              the first sign is a save that fails.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setUsage(measureLocalStorageUsage())}
          className="shrink-0 rounded-full border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50"
        >
          Recheck
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className={`text-2xl font-bold ${tone === 'red' ? 'text-red-700' : tone === 'amber' ? 'text-amber-700' : 'text-navy'}`}>
          {formatBytes(usage.memoireBytes)}
        </p>
        <p className="text-sm font-semibold text-gray-500">
          of about 5 MB · {percent}% used · {totalRecords.toLocaleString()} record{totalRecords === 1 ? '' : 's'}
        </p>
      </div>

      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className={`h-full rounded-full ${tone === 'red' ? 'bg-red-500' : tone === 'amber' ? 'bg-amber-500' : 'bg-emerald-500'}`}
          style={{ width: `${Math.max(2, percent)}%` }}
        />
      </div>

      {percent >= 60 && (
        <p className={`mt-3 rounded-lg px-3 py-2 text-sm font-semibold leading-6 ${
          tone === 'red' ? 'bg-red-50 text-red-900' : 'bg-amber-50 text-amber-900'
        }`}>
          {tone === 'red'
            ? 'Close to the limit. Download a backup now, and sign in so records also live in your account rather than only in this browser.'
            : 'Worth a backup. When this browser fills up, the next save fails rather than queueing.'}
        </p>
      )}

      {origin.originBytes !== null && origin.originQuota !== null && (
        <p className="mt-2 text-xs text-gray-400">
          Whole-site storage reported by this browser: {formatBytes(origin.originBytes)} of {formatBytes(origin.originQuota)}.
          That figure covers caches and databases too, and is not the limit local records hit first.
        </p>
      )}

      {usage.byKey.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-bold uppercase tracking-wide text-gray-500">
            What is taking the space ({usage.byKey.length} collections)
          </summary>
          <table className="mt-2 w-full text-left text-xs">
            <thead className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
              <tr>
                <th className="pb-1">Collection</th>
                <th className="pb-1 text-right">Records</th>
                <th className="pb-1 text-right">Size</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {usage.byKey.slice(0, 12).map((row) => (
                <tr key={row.key}>
                  <td className="truncate py-1 font-mono text-[11px] text-gray-600" title={row.key}>
                    {row.key.replace(/^memoire\./, '').replace(/\.v\d+$/, '')}
                  </td>
                  <td className="py-1 text-right font-semibold text-gray-700">{row.records === null ? '—' : row.records.toLocaleString()}</td>
                  <td className="py-1 text-right font-semibold text-gray-700">{formatBytes(row.bytes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
