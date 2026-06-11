import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { clearSampleDataset, SAMPLE_DATA_UPDATED_EVENT, isSampleDataLoaded } from '../../utils/sampleData';

export function DemoModeBanner() {
  const navigate = useNavigate();
  const [demoActive, setDemoActive] = useState(() => isSampleDataLoaded());

  useEffect(() => {
    const refresh = () => setDemoActive(isSampleDataLoaded());
    window.addEventListener(SAMPLE_DATA_UPDATED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(SAMPLE_DATA_UPDATED_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  if (!demoActive) return null;

  const resetDemo = () => {
    const confirmed = window.confirm('Reset demo data in this browser? This only removes records marked as demo/sample and does not delete cloud data or user records.');
    if (!confirmed) return;
    clearSampleDataset();
    setDemoActive(false);
    window.location.reload();
  };

  const exitDemo = () => {
    const confirmed = window.confirm('Exit demo mode and clear sample demo data from this browser? Only records marked as demo/sample are removed. Cloud data will not be changed.');
    if (!confirmed) return;
    clearSampleDataset();
    setDemoActive(false);
    navigate('/');
  };

  return (
    <section className="no-print border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm shadow-sm">
      <div className="flex w-full max-w-none flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <p className="font-semibold text-amber-900">
          Demo mode active - sample data is local to this browser, is not synced to your account, and never writes back to CRM.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link to="/app/demo-guide" className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100">
            Continue demo
          </Link>
          <button type="button" onClick={resetDemo} className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100">
            Reset demo
          </button>
          <button type="button" onClick={exitDemo} className="rounded-full bg-amber-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-950">
            Exit demo
          </button>
        </div>
      </div>
    </section>
  );
}
