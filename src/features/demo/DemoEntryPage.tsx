import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Database, FileText, RefreshCw, ShieldCheck } from 'lucide-react';
import { useAuthContext } from '../../auth/authContext';
import { loadSampleDataset } from '../../utils/sampleData';
import { markTrialActivationChecklistItemComplete } from '../../utils/trialActivationChecklist';
import { BrandWordmark } from '../../components/brand/BrandWordmark';
import { trackProductEvent } from '../../utils/productAnalytics';

export function DemoEntryPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAuthenticated } = useAuthContext();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [demoDestination, setDemoDestination] = useState('/app/today?demo=1');

  useEffect(() => {
    if (searchParams.get('sample') === '1') {
      setDemoDestination('/app/today?demo=1');
      setConfirmOpen(true);
    }
  }, [searchParams]);

  const openDemoConfirmation = (destination: string) => {
    setDemoDestination(destination);
    setConfirmOpen(true);
  };

  const startDemo = () => {
    loadSampleDataset();
    markTrialActivationChecklistItemComplete('load-demo-or-import-csv');
    trackProductEvent('demo_started', 'demo-local');
    navigate(demoDestination);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <main className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-4 py-12 sm:px-6 lg:px-8">
        <Link to="/" className="mb-8 inline-flex w-fit" aria-label="Memoire home">
          <BrandWordmark className="text-2xl" />
        </Link>

        <section className="grid gap-10 lg:grid-cols-[1fr_0.85fr] lg:items-center">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.26em] text-cyan-200">Public demo mode</p>
            <h1 className="mt-4 max-w-3xl text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
              Try the 5-minute Pipeline Defense proof path.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-200">
              Memoire is a Personal Pipeline Defense OS used beside CRM, spreadsheets, and private notes. See how a B2B or founder-led seller goes from messy notes and pasted email to Today risks, a manager-ready Pipeline Defense Brief, MEDDIC gaps, and outcome learning.
            </p>
            <p className="mt-3 inline-flex rounded-full border border-cyan-200/20 bg-cyan-200/10 px-3 py-1.5 text-sm font-bold text-cyan-100">
              Expected duration: 3-5 minutes
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => openDemoConfirmation('/app/today?demo=1')}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-300 px-6 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-cyan-950/30 transition hover:bg-cyan-200 sm:w-auto"
              >
                Start Demo
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => openDemoConfirmation('/app/demo-guide')}
                className="inline-flex w-full items-center justify-center rounded-lg border border-white/20 bg-white/10 px-6 py-3 text-sm font-bold text-white transition hover:bg-white/15 sm:w-auto"
              >
                View Demo Guide
              </button>
              <Link
                to="/request-access"
                className="inline-flex w-full items-center justify-center rounded-lg border border-white/20 px-6 py-3 text-sm font-bold text-slate-100 transition hover:bg-white/10 sm:w-auto"
              >
                Request Access
              </Link>
              <Link
                to="/"
                className="inline-flex w-full items-center justify-center rounded-lg border border-white/20 px-6 py-3 text-sm font-bold text-slate-100 transition hover:bg-white/10 sm:w-auto"
              >
                Return to Landing
              </Link>
            </div>

            {isAuthenticated && (
              <p className="mt-5 max-w-2xl rounded-lg border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm font-semibold text-amber-100">
                You are signed in. Demo data will still be stored locally only and will not be saved to your cloud account.
              </p>
            )}
          </div>

          <div className="rounded-xl border border-white/10 bg-white/10 p-5 shadow-2xl shadow-black/30">
            <h2 className="text-xl font-bold">What this demo will show</h2>
            <div className="mt-5 grid gap-3">
              <DemoPromise icon={<ShieldCheck className="h-5 w-5" />} title="Beside CRM, spreadsheets, and notes" body="The demo uses local sample data. No Salesforce, HubSpot, Gmail, Calendar, Zalo, or CRM writeback is involved." />
              <DemoPromise icon={<Database className="h-5 w-5" />} title="Demo data stays local" body="Sample records are stored only in this browser, are not synced to your account, and never write back to CRM." />
              <DemoPromise icon={<FileText className="h-5 w-5" />} title="Manager-ready review answer" body="The path ends with a copyable brief that says what to defend, rescue, downgrade, and what evidence is missing." />
              <DemoPromise icon={<RefreshCw className="h-5 w-5" />} title="Learning loop" body="Outcome Learning shows cautious risk signals from prior action outcomes without pretending to know more than the evidence." />
            </div>
          </div>
        </section>
      </main>

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4">
          <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-white p-6 text-slate-950 shadow-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-700">Start demo sandbox</p>
            <h2 className="mt-2 text-2xl font-bold">Load sample pipeline data?</h2>
            <div className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
              <p>Demo data is sample data for exploration only.</p>
              <p>It stays local in this browser and will not sync to your account.</p>
              <p>Memoire will not connect to or write back to any CRM in this demo.</p>
              <p>This is a sales-memory workflow, not invoicing, inventory, ecommerce, marketplace, or project-delivery management.</p>
            </div>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={startDemo}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800"
              >
                <CheckCircle2 className="h-4 w-4" />
                Load demo sandbox
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DemoPromise({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <article className="rounded-lg border border-white/10 bg-slate-900/70 p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cyan-300/10 text-cyan-200">
          {icon}
        </span>
        <div>
          <h3 className="font-bold text-white">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-slate-300">{body}</p>
        </div>
      </div>
    </article>
  );
}
