import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { AlertTriangle, Database, RefreshCw, RotateCcw, ShieldCheck } from 'lucide-react';
import { useAuthContext } from '../../auth/authContext';
import {
  FOUNDER_IMPORT_TARGET_EMAIL,
  isFounderImportUser,
  loadImportBatches,
  loadImportRowResults,
  type ImportBatchRecord,
  type ImportRowResultRecord,
} from '../../services/importAuditStore';

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

export function FounderImportReviewPage() {
  const { user, loading: authLoading } = useAuthContext();
  const [batches, setBatches] = useState<ImportBatchRecord[]>([]);
  const [rowResults, setRowResults] = useState<ImportRowResultRecord[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [state, setState] = useState<LoadState>('idle');
  const [message, setMessage] = useState('');
  const isFounder = isFounderImportUser(user?.email);
  const selectedBatch = batches.find((batch) => batch.id === selectedBatchId) || batches[0] || null;

  const refresh = async () => {
    if (!user?.id || !isFounder) return;
    setState('loading');
    setMessage('');
    try {
      const nextBatches = await loadImportBatches(user.id);
      setBatches(nextBatches);
      const batchId = selectedBatchId || nextBatches[0]?.id || '';
      setSelectedBatchId(batchId);
      setRowResults(batchId ? await loadImportRowResults(user.id, batchId) : []);
      setState('ready');
    } catch (error) {
      setState('error');
      setMessage(error instanceof Error ? error.message : 'Could not load import review.');
    }
  };

  useEffect(() => {
    if (!authLoading) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user?.id, isFounder]);

  useEffect(() => {
    let mounted = true;
    async function loadRows() {
      if (!user?.id || !selectedBatchId || !isFounder) return;
      try {
        const rows = await loadImportRowResults(user.id, selectedBatchId);
        if (mounted) setRowResults(rows);
      } catch (error) {
        if (!mounted) return;
        setState('error');
        setMessage(error instanceof Error ? error.message : 'Could not load import row audit.');
      }
    }
    loadRows();
    return () => {
      mounted = false;
    };
  }, [isFounder, selectedBatchId, user?.id]);

  const rowSummary = useMemo(() => summarizeRows(rowResults), [rowResults]);
  const selectedCounts = getSummaryCounts(selectedBatch);
  const warningCounts = getWarningCounts(selectedBatch);

  if (!authLoading && !isFounder) {
    return <Navigate to="/app/dashboard" replace />;
  }

  return (
    <div className="flex w-full max-w-none flex-col gap-5 px-4 py-5 sm:px-5 lg:px-6">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Founder Import</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-navy">Core Data Import Review</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
            Audit batches, warning codes, and safe row-result metadata for {FOUNDER_IMPORT_TARGET_EMAIL}.
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={state === 'loading'}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-navy px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${state === 'loading' ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </header>

      <section className="rounded-lg border border-emerald-100 bg-emerald-50 p-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
          <div>
            <p className="text-sm font-bold text-emerald-900">No workbook row values are stored on this review page.</p>
            <p className="mt-1 text-sm leading-6 text-emerald-800">
              The audit surface shows counts, batch ids, source sheet names, row numbers, target tables, and warning codes only.
            </p>
          </div>
        </div>
      </section>

      {state === 'error' && (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
          {message}
        </section>
      )}

      {state === 'loading' && batches.length === 0 ? (
        <section className="rounded-lg border border-gray-200 bg-white p-6 text-sm font-semibold text-gray-500 shadow-sm">
          Loading import audit...
        </section>
      ) : batches.length === 0 ? (
        <EmptyImportReview />
      ) : (
        <section className="grid grid-cols-1 gap-5 xl:grid-cols-[360px_1fr]">
          <aside className="h-fit rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="text-base font-bold text-navy">Import Batches</h2>
            <div className="mt-4 space-y-2">
              {batches.map((batch) => (
                <button
                  key={batch.id}
                  type="button"
                  onClick={() => setSelectedBatchId(batch.id)}
                  className={`block w-full rounded-lg border p-3 text-left transition ${
                    selectedBatch?.id === batch.id ? 'border-brand-blue bg-blue-50' : 'border-gray-200 bg-white hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <Badge label={batch.status} tone={statusTone(batch.status)} />
                    <span className="text-xs font-semibold text-gray-500">{formatDate(batch.createdAt)}</span>
                  </div>
                  <p className="mt-2 truncate font-mono text-xs font-bold text-gray-500">{batch.id}</p>
                  <p className="mt-1 text-xs font-semibold text-gray-500">{batch.sourceFiles.join(', ') || 'No files'}</p>
                </button>
              ))}
            </div>
          </aside>

          <main className="space-y-5">
            {selectedBatch && (
              <>
                <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap gap-2">
                        <Badge label={selectedBatch.status} tone={statusTone(selectedBatch.status)} />
                        <Badge label={selectedBatch.scope} tone="blue" />
                        <Badge label={selectedBatch.mode} tone="gray" />
                      </div>
                      <h2 className="mt-3 text-xl font-bold text-navy">Batch {shortId(selectedBatch.id)}</h2>
                      <p className="mt-1 font-mono text-xs font-bold text-gray-400">{selectedBatch.id}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link to="/app/accounts" className="rounded-full border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50">
                        Accounts
                      </Link>
                      <Link to="/app/opportunities" className="rounded-full border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50">
                        Opportunities
                      </Link>
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                    <Metric label="Accounts" value={selectedCounts.accounts} />
                    <Metric label="Stakeholders" value={selectedCounts.stakeholders} />
                    <Metric label="Activities" value={selectedCounts.salesActivities} />
                    <Metric label="Opportunities" value={selectedCounts.opportunities} />
                    <Metric label="Operating" value={selectedCounts.operatingContext} />
                    <Metric label="Warnings" value={selectedCounts.warnings} tone={selectedCounts.warnings ? 'amber' : 'green'} />
                  </div>

                  {Object.keys(warningCounts).length > 0 && (
                    <div className="mt-5 rounded-lg border border-amber-100 bg-amber-50 p-4">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-700" />
                        <p className="text-sm font-bold text-amber-900">Warning Codes</p>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {Object.entries(warningCounts).map(([code, count]) => (
                          <Badge key={code} label={`${code}: ${count}`} tone="amber" />
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedBatch.status === 'completed' && (
                    <div className="mt-5 rounded-lg border border-gray-200 bg-gray-50 p-4">
                      <div className="flex items-start gap-3">
                        <RotateCcw className="mt-0.5 h-4 w-4 text-gray-500" />
                        <p className="text-sm leading-6 text-gray-600">
                          Rollback is handled by the local import script with `--rollback-batch={selectedBatch.id}` after server-only credentials are set.
                        </p>
                      </div>
                    </div>
                  )}
                </section>

                <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
                  <div className="border-b border-gray-200 p-4">
                    <div className="flex items-center gap-2">
                      <Database className="h-4 w-4 text-brand-blue" />
                      <h2 className="text-base font-bold text-navy">Row Result Audit</h2>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      {rowResults.length.toLocaleString()} safe row results loaded. {formatRowSummary(rowSummary)}
                    </p>
                  </div>
                  <div className="max-h-[520px] overflow-auto">
                    <table className="w-full min-w-[820px] border-collapse text-left text-sm">
                      <thead className="sticky top-0 bg-gray-50 text-[11px] font-bold uppercase tracking-wide text-gray-500">
                        <tr>
                          <th className="border-b border-gray-200 px-3 py-3">Source</th>
                          <th className="border-b border-gray-200 px-3 py-3">Target</th>
                          <th className="border-b border-gray-200 px-3 py-3">Action</th>
                          <th className="border-b border-gray-200 px-3 py-3">Warnings</th>
                          <th className="border-b border-gray-200 px-3 py-3">Hash</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {rowResults.map((row) => (
                          <tr key={row.id} className="bg-white">
                            <td className="px-3 py-3">
                              <p className="font-semibold text-gray-800">{row.sourceFile}</p>
                              <p className="mt-1 text-xs text-gray-500">{row.sourceSheet}{row.sourceRow ? ` row ${row.sourceRow}` : ''}</p>
                            </td>
                            <td className="px-3 py-3 font-semibold text-gray-700">{row.targetTable}</td>
                            <td className="px-3 py-3"><Badge label={row.action} tone={actionTone(row.action)} /></td>
                            <td className="px-3 py-3 text-xs font-semibold text-gray-500">{row.warningCodes.join(', ') || row.errorCode || 'None'}</td>
                            <td className="px-3 py-3 font-mono text-xs text-gray-400">{row.sourceHash ? `${row.sourceHash.slice(0, 10)}...` : 'n/a'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </>
            )}
          </main>
        </section>
      )}
    </div>
  );
}

function EmptyImportReview() {
  return (
    <section className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center shadow-sm">
      <Database className="mx-auto h-8 w-8 text-gray-400" />
      <h2 className="mt-3 text-lg font-bold text-navy">No import batches yet.</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-gray-500">
        Run the founder core importer after applying the migration to create the first audited batch.
      </p>
    </section>
  );
}

function Metric({ label, value, tone = 'blue' }: { label: string; value: number; tone?: 'blue' | 'green' | 'amber' | 'red' }) {
  const toneClass = {
    blue: 'bg-blue-50 text-brand-blue',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-700',
  }[tone];
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-lg font-black ${toneClass}`}>{value.toLocaleString()}</p>
    </div>
  );
}

function Badge({ label, tone = 'blue' }: { label: string; tone?: 'blue' | 'green' | 'amber' | 'red' | 'gray' }) {
  const toneClass = {
    blue: 'border-blue-100 bg-blue-50 text-brand-blue',
    green: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-100 bg-amber-50 text-amber-700',
    red: 'border-red-100 bg-red-50 text-red-700',
    gray: 'border-gray-200 bg-gray-50 text-gray-600',
  }[tone];
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${toneClass}`}>{label}</span>;
}

function getSummaryCounts(batch: ImportBatchRecord | null) {
  const counts = batch?.summary?.counts || {};
  return {
    accounts: numeric(counts.accounts),
    stakeholders: numeric(counts.stakeholders),
    salesActivities: numeric(counts.salesActivities),
    opportunities: numeric(counts.opportunities),
    operatingContext: numeric(counts.operatingContext),
    warnings: numeric(counts.warnings),
  };
}

function getWarningCounts(batch: ImportBatchRecord | null): Record<string, number> {
  const counts = batch?.summary?.warningCounts || batch?.warnings || {};
  if (!counts || Array.isArray(counts) || typeof counts !== 'object') return {};
  return Object.entries(counts).reduce<Record<string, number>>((result, [key, value]) => {
    const count = numeric(value);
    if (count > 0) result[key] = count;
    return result;
  }, {});
}

function summarizeRows(rows: ImportRowResultRecord[]) {
  return rows.reduce<Record<string, number>>((summary, row) => {
    const key = `${row.targetTable}:${row.action}`;
    summary[key] = (summary[key] || 0) + 1;
    return summary;
  }, {});
}

function formatRowSummary(summary: Record<string, number>) {
  const entries = Object.entries(summary);
  if (entries.length === 0) return 'No row-result details available.';
  return entries.map(([key, value]) => `${key} ${value}`).join(' | ');
}

function numeric(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function statusTone(status: string): 'blue' | 'green' | 'amber' | 'red' | 'gray' {
  if (status === 'completed') return 'green';
  if (status === 'failed') return 'red';
  if (status === 'rolled_back') return 'amber';
  if (status === 'running') return 'blue';
  return 'gray';
}

function actionTone(action: string): 'blue' | 'green' | 'amber' | 'red' | 'gray' {
  if (action === 'insert_or_update') return 'green';
  if (action === 'warning') return 'amber';
  if (action === 'error') return 'red';
  if (action === 'skip') return 'gray';
  return 'blue';
}

function shortId(value: string) {
  return value.slice(0, 8);
}

function formatDate(value: string) {
  if (!value) return 'No date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}
