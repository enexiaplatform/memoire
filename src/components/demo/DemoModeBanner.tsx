import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { clearSampleDataset, loadSampleDataset, SAMPLE_DATA_UPDATED_EVENT, isSampleDataLoaded } from '../../utils/sampleData';
import { RecordDrawer } from '../ui/RecordDrawer';
import { clearDemoWorkspaceMode } from '../../lib/demoMode';

export function DemoModeBanner() {
  const navigate = useNavigate();
  const [demoActive, setDemoActive] = useState(() => isSampleDataLoaded());
  const [confirmAction, setConfirmAction] = useState<'reset' | 'exit' | null>(null), [error, setError] = useState('');

  useEffect(() => {
    const refresh = () => setDemoActive(isSampleDataLoaded());
    window.addEventListener(SAMPLE_DATA_UPDATED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(SAMPLE_DATA_UPDATED_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  if (!demoActive && !confirmAction && !error) return null;

  const resetDemo = () => {
    try { clearSampleDataset(); loadSampleDataset(); setConfirmAction(null); window.location.reload(); }
    catch { setError('The demo could not be reset. Export a browser backup and check available storage before retrying.'); }
  };

  /**
   * Leaving the demo has to leave all of it.
   *
   * This used to drop the sample records and nothing else, so the browser kept
   * the `interactive-demo` workspace flag it was opened with. The banner went
   * away, but `isDemoWorkspaceActive()` stayed true: the rail still introduced
   * the workspace as "Demo workspace / Local sample data" and the top bar still
   * read "Demo browser", over records that were now the operator's own real
   * ones - the data-mode pill saying "Browser only" two inches away. A label
   * whose whole job is telling you whether what you are reading is real must
   * not be the thing that is wrong.
   *
   * Nothing captured is lost by closing the door: local records written with
   * nobody signed in stay adoptable, and the next sign-in claims them
   * (see services/localWorkspaceOwner).
   */
  const exitDemo = () => {
    clearSampleDataset();
    clearDemoWorkspaceMode();
    setDemoActive(false);
    navigate('/');
  };

  return (
    <section className="no-print border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm shadow-sm">
      <div className="flex w-full max-w-none flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <p className="font-semibold text-amber-900">
          {demoActive ? 'Demo mode active - sample data is local to this browser, is not synced to your account, and never writes back to CRM.' : 'Demo reset needs attention. Check the message before retrying.'}
        </p>
        <div className="flex flex-wrap gap-2">
          <Link to="/signup" className="rounded-full bg-amber-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-950">
            Create account
          </Link>
          <button type="button" onClick={() => { setError(''); setConfirmAction('reset'); }} className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100">
            Reset demo
          </button>
          <button type="button" onClick={() => { setError(''); setConfirmAction('exit'); }} className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100">
            Exit demo
          </button>
        </div>
      </div>
      {confirmAction && <RecordDrawer eyebrow="Demo workspace" title={confirmAction === 'reset' ? 'Reset demo data?' : 'Exit demo?'} label="Confirm demo action" onClose={() => setConfirmAction(null)} footer={<div className="flex gap-3"><button type="button" className="min-h-11 rounded-full border border-line px-4 text-sm font-semibold" onClick={() => setConfirmAction(null)}>Keep this demo</button><button type="button" className="min-h-11 rounded-full bg-brand-blue px-4 text-sm font-semibold text-white" onClick={confirmAction === 'reset' ? resetDemo : exitDemo}>{confirmAction === 'reset' ? 'Reset demo data' : 'Exit demo and clear samples'}</button></div>}><p className="text-sm">{confirmAction === 'reset' ? 'Replace the sample examples with the current complete demo, including Brand links and recorded receipts.' : 'Remove sample examples and return to the home page.'} Your personal records and cloud data are preserved.</p>{error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}</RecordDrawer>}
    </section>
  );
}
