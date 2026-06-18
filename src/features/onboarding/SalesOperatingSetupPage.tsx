import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  FileText,
  GitBranch,
  NotebookPen,
  RotateCcw,
  Save,
  Target,
} from 'lucide-react';
import {
  buildSalesOperatingSetupDigest,
  buildSalesOperatingSetupProgress,
  loadSalesOperatingSetupState,
  resetSalesOperatingSetup,
  salesOperatingSetupSections,
  saveSalesOperatingSetupState,
  skipSalesOperatingSetup,
  type SalesOperatingSetupSection,
  type SalesOperatingSetupSectionId,
  type SalesOperatingSetupValues,
} from '../../utils/salesOperatingSetup';

const sectionIcons: Record<SalesOperatingSetupSectionId, ReactNode> = {
  salesTarget: <Target className="h-5 w-5" />,
  gtmTarget: <GitBranch className="h-5 w-5" />,
  rtmTarget: <ClipboardList className="h-5 w-5" />,
  pnlRequired: <FileText className="h-5 w-5" />,
  salesCycle: <CalendarDays className="h-5 w-5" />,
  dailyActivityLog: <NotebookPen className="h-5 w-5" />,
};

export function SalesOperatingSetupPage() {
  const [state, setState] = useState(() => loadSalesOperatingSetupState());
  const [values, setValues] = useState<SalesOperatingSetupValues>(state.values);
  const [message, setMessage] = useState('');
  const progress = useMemo(() => buildSalesOperatingSetupProgress({ ...state, values }), [state, values]);
  const digest = useMemo(() => buildSalesOperatingSetupDigest({ ...state, values }), [state, values]);
  const dirty = JSON.stringify(values) !== JSON.stringify(state.values);

  const updateValue = (id: SalesOperatingSetupSectionId, value: string) => {
    setValues((current) => ({ ...current, [id]: value }));
    setMessage('');
  };

  const handleSave = () => {
    const nextState = saveSalesOperatingSetupState({ ...state, values });
    setState(nextState);
    setValues(nextState.values);
    setMessage(nextState.completedAt ? 'Sales operating setup saved.' : 'Draft saved.');
  };

  const handleSkip = () => {
    const nextState = skipSalesOperatingSetup();
    setState(nextState);
    setMessage('Setup skipped for now.');
  };

  const handleReset = () => {
    const nextState = resetSalesOperatingSetup();
    setState(nextState);
    setValues(nextState.values);
    setMessage('Setup reset.');
  };

  return (
    <div className="flex w-full max-w-none flex-col gap-5 px-4 py-5 sm:px-5 lg:px-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Sales Operating Setup</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-navy">Build the context Memoire should remember.</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
            Set target, GTM, RTM, sales cycle, and daily activity signals so captured work can connect back to execution.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700"
          >
            <RotateCcw className="h-4 w-4" />
            Reset
          </button>
          <button
            type="button"
            onClick={handleSkip}
            className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700"
          >
            Skip for now
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="inline-flex items-center gap-2 rounded-full bg-navy px-4 py-2 text-sm font-bold text-white"
          >
            <Save className="h-4 w-4" />
            Save setup
          </button>
        </div>
      </header>

      {message && (
        <p className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm font-bold text-blue-800">
          {message}
        </p>
      )}

      <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Metric label="Status" value={progress.status} tone={progress.status === 'Ready' ? 'green' : 'blue'} />
        <Metric label="Required" value={`${progress.completedRequired}/${progress.requiredCount}`} tone={progress.percent === 100 ? 'green' : 'amber'} />
        <Metric label="Readiness" value={`${progress.percent}%`} tone={progress.percent === 100 ? 'green' : 'blue'} />
      </section>

      <section className="rounded-xl border border-blue-100 bg-blue-50/70 p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <CheckCircle2 className={`h-5 w-5 ${progress.percent === 100 ? 'text-emerald-600' : 'text-brand-blue'}`} />
              <h2 className="text-xl font-bold text-navy">
                {progress.percent === 100 ? 'Blueprint ready' : 'Finish the required operating context'}
              </h2>
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-blue-950">
              P&L is optional. The core setup is complete when Sales Target, GTM, RTM, Sales Cycle, and Daily Log are filled.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/app/capture?mode=quick" className="inline-flex items-center gap-2 rounded-full bg-brand-blue px-4 py-2 text-sm font-bold text-white">
              Open Daily Capture
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/app/dashboard" className="rounded-full border border-blue-200 bg-white px-4 py-2 text-sm font-bold text-blue-800">
              Dashboard
            </Link>
          </div>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white">
          <div className="h-full rounded-full bg-brand-blue transition-all" style={{ width: `${progress.percent}%` }} />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {salesOperatingSetupSections.map((section) => (
          <SetupSectionCard
            key={section.id}
            section={section}
            value={values[section.id]}
            icon={sectionIcons[section.id]}
            onChange={(value) => updateValue(section.id, value)}
          />
        ))}
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Operating Blueprint</p>
            <h2 className="mt-2 text-xl font-bold text-navy">Current context</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">
              This is the compact context Memoire can use for planning, review prep, and daily execution prompts.
            </p>
          </div>
          {dirty && <span className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700">Unsaved changes</span>}
        </div>
        {digest ? (
          <pre className="mt-4 whitespace-pre-wrap rounded-lg border border-gray-100 bg-gray-50 p-4 text-sm leading-6 text-gray-700">{digest}</pre>
        ) : (
          <p className="mt-4 rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4 text-sm font-semibold text-gray-500">
            No operating context saved yet.
          </p>
        )}
      </section>
    </div>
  );
}

function SetupSectionCard({
  section,
  value,
  icon,
  onChange,
}: {
  section: SalesOperatingSetupSection;
  value: string;
  icon: ReactNode;
  onChange: (value: string) => void;
}) {
  const filled = value.trim().length > 0;

  return (
    <article className={`rounded-xl border bg-white p-5 shadow-sm ${filled ? 'border-emerald-100' : 'border-gray-200'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${filled ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-brand-blue'}`}>
            {icon}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-navy">{section.title}</h2>
              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${section.required ? 'bg-blue-50 text-brand-blue' : 'bg-gray-100 text-gray-600'}`}>
                {section.required ? 'Required' : 'Optional'}
              </span>
            </div>
            <p className="mt-1 text-sm leading-6 text-gray-600">{section.prompt}</p>
          </div>
        </div>
        {filled && <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />}
      </div>

      <label className="mt-4 block">
        <span className="text-xs font-bold uppercase tracking-wide text-gray-400">{section.shortTitle}</span>
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={section.placeholder}
          rows={5}
          className="mt-2 w-full resize-y rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm leading-6 text-gray-800 outline-none placeholder:text-gray-400 focus:border-brand-blue focus:bg-white focus:ring-2 focus:ring-blue-100"
        />
      </label>

      <div className="mt-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
        <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Memoire output</p>
        <p className="mt-1 text-sm leading-6 text-gray-600">{section.intelligenceOutput}</p>
      </div>
    </article>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'blue' | 'green' | 'amber';
}) {
  const toneClass = {
    blue: 'bg-blue-50 text-brand-blue',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
  }[tone];

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`mt-2 inline-flex rounded-full px-3 py-1 text-lg font-black ${toneClass}`}>{value}</p>
    </div>
  );
}
