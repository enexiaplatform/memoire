import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, ClipboardList, Home, LogIn, UserPlus } from 'lucide-react';
import {
  DEMO_JOURNEY_UPDATED_EVENT,
  demoJourneySteps,
  getDemoJourneyProgress,
  type DemoJourneyProgress,
} from '../../utils/demoJourney';

export function DemoJourneyCard({ compact = false }: { compact?: boolean }) {
  const [progress, setProgress] = useState<DemoJourneyProgress>(() => getDemoJourneyProgress());
  const completion = progress.completion;
  const completedCount = progress.completedStepIds.length;
  const progressPercent = Math.round((completedCount / demoJourneySteps.length) * 100);

  useEffect(() => {
    const refresh = () => setProgress(getDemoJourneyProgress());
    window.addEventListener(DEMO_JOURNEY_UPDATED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(DEMO_JOURNEY_UPDATED_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  return (
    <section className="rounded-xl border border-blue-100 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-brand-blue">
            {completion ? <CheckCircle2 className="h-5 w-5" /> : <ClipboardList className="h-5 w-5" />}
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Demo Journey</p>
            <h2 className="mt-1 text-xl font-bold text-navy">
              {completion ? "You've completed the core Memoire workflow." : '5-minute path to the Pipeline Defense aha moment'}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">
              {completion
                ? 'You turned sample pipeline data into a manager-ready Pipeline Defense Brief.'
                : 'Follow three focused steps to see the value before exploring the wider app.'}
            </p>
          </div>
        </div>
        {completion && (
          <div className="flex flex-wrap gap-2">
            <Link to="/signup" className="inline-flex items-center gap-2 rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">
              <UserPlus className="h-4 w-4" />
              Create account for your pipeline
            </Link>
            <Link to="/login" className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-4 py-2 text-sm font-bold text-brand-blue">
              <LogIn className="h-4 w-4" />
              Log in
            </Link>
            <Link to="/request-access" className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-4 py-2 text-sm font-bold text-brand-blue">
              Request guided access
            </Link>
            <Link to="/" className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700">
              <Home className="h-4 w-4" />
              Return to landing
            </Link>
          </div>
        )}
      </div>

      <div className="mt-5">
        <div className="flex items-center justify-between gap-3 text-xs font-bold uppercase tracking-wide text-gray-500">
          <span>{completedCount} of {demoJourneySteps.length} complete</span>
          <span>{progressPercent}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100">
          <div className="h-full rounded-full bg-brand-blue transition-all" style={{ width: `${progressPercent}%` }} />
        </div>
      </div>

      <div className={`mt-5 grid gap-3 ${compact ? 'lg:grid-cols-3' : 'lg:grid-cols-3'}`}>
        {demoJourneySteps.map((step, index) => (
          <article key={step.id} className={`rounded-lg border p-4 ${
            progress.completedStepIds.includes(step.id)
              ? 'border-emerald-100 bg-emerald-50'
              : 'border-gray-100 bg-gray-50'
          }`}>
            <p className={`text-xs font-bold uppercase tracking-wide ${
              progress.completedStepIds.includes(step.id) ? 'text-emerald-700' : 'text-gray-400'
            }`}>
              {progress.completedStepIds.includes(step.id) ? 'Complete' : `Step ${index + 1}`}
            </p>
            <h3 className="mt-2 text-base font-bold text-navy">{step.title}</h3>
            {!compact && <p className="mt-2 text-sm leading-6 text-gray-600">{step.description}</p>}
            <Link to={step.href} className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-brand-blue ring-1 ring-blue-100 hover:bg-blue-50">
              {step.cta}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </article>
        ))}
      </div>

      {completion && (
        <div className="mt-5 rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
          <p className="font-bold">You've completed the core Memoire workflow.</p>
          <p className="mt-1 leading-6">
            You turned sample pipeline data into a manager-ready Pipeline Defense Brief. Your demo work stays in this browser only - your real pipeline deserves an account that syncs safely.
          </p>
          <p className="mt-2 text-xs font-semibold text-emerald-700">Completed from: {completion.reason}</p>
        </div>
      )}
    </section>
  );
}
