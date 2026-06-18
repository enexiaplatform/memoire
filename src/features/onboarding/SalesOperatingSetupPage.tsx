import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  FileText,
  GitBranch,
  NotebookPen,
  RotateCcw,
  Save,
  Sparkles,
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

type SetupPreset = {
  id: string;
  label: string;
  description: string;
  values: SalesOperatingSetupValues;
};

type SectionPlay = {
  templates: string[];
  chips: string[];
  example: string;
};

const sectionIcons: Record<SalesOperatingSetupSectionId, ReactNode> = {
  salesTarget: <Target className="h-5 w-5" />,
  gtmTarget: <Sparkles className="h-5 w-5" />,
  rtmTarget: <GitBranch className="h-5 w-5" />,
  pnlRequired: <FileText className="h-5 w-5" />,
  salesCycle: <CalendarDays className="h-5 w-5" />,
  dailyActivityLog: <NotebookPen className="h-5 w-5" />,
};

const sectionPlaybook: Record<SalesOperatingSetupSectionId, SectionPlay> = {
  salesTarget: {
    templates: [
      'Quarter target: 5B VND revenue, 8 closed-won deals, 20 qualified opportunities. Track by product, owner, and close month.',
      'Month target: 1.5B VND new revenue, 10 qualified demos, 3 signed customers. Focus on deals with next action due this week.',
      'Team target: 12B VND annual revenue, 40 active opportunities, 30% from upsell, 70% from new logos.',
    ],
    chips: ['Quarterly revenue', 'Monthly revenue', 'New logos', 'Upsell', 'Pipeline value', 'Win count', 'By owner', 'By territory'],
    example: '5B VND this quarter, 8 wins, 20 qualified opportunities.',
  },
  gtmTarget: {
    templates: [
      'Primary ICP: mid-market healthcare and pharma distributors in Vietnam. Pain: stock availability, compliance, local support.',
      'Primary ICP: B2B teams with long sales cycles and weekly manager reviews. Pain: deal memory, follow-up drift, weak forecast evidence.',
      'Primary ICP: key accounts in manufacturing and logistics. Pain: multi-stakeholder buying, procurement delays, proof gaps.',
    ],
    chips: ['Healthcare', 'Pharma distributor', 'Manufacturing', 'Logistics', 'Mid-market', 'Enterprise', 'Procurement-heavy', 'Compliance-sensitive'],
    example: 'Mid-market pharma distributors; message around lead time, support, and proof.',
  },
  rtmTarget: {
    templates: [
      'Direct sales for strategic accounts. Distributor route for provincial coverage. Partner owns local follow-up, internal team owns proposal and proof.',
      'Outbound for named accounts, referrals for warm intros, partner route for industry coverage. Review channel contribution weekly.',
      'Direct key account motion for top 50 accounts. Reseller route for long-tail accounts. Online inbound is triaged before sales assignment.',
    ],
    chips: ['Direct sales', 'Distributor', 'Reseller', 'Partner', 'Online inbound', 'Key account', 'Territory coverage', 'Named accounts'],
    example: 'Direct for key accounts, distributors for provincial coverage.',
  },
  pnlRequired: {
    templates: [
      'Optional guardrails: gross margin above 35%, partner commission under 8%, CAC under 20M VND, discount above 15% needs approval.',
      'Track profitability only for strategic deals: margin, discount, implementation cost, commission, and payback period.',
      'No P&L tracking for MVP. Revisit after pipeline review and activity logging are stable.',
    ],
    chips: ['Gross margin', 'Discount cap', 'Commission', 'CAC', 'Budget', 'Implementation cost', 'Payback', 'Skip for now'],
    example: 'Gross margin > 35%; discount > 15% requires approval.',
  },
  salesCycle: {
    templates: [
      'Lead -> discovery -> technical validation -> proposal -> procurement -> PO. Average cycle 75 days. Main blockers: budget owner, proof, procurement path.',
      'Discovery -> demo -> champion validation -> commercial proposal -> legal/procurement -> closed-won. Average cycle 45 days.',
      'Partner lead -> account qualification -> joint meeting -> proposal -> distributor follow-up -> PO. Average cycle 60 days.',
    ],
    chips: ['Discovery', 'Demo', 'Technical validation', 'Proposal', 'Procurement', 'Legal', 'PO', '45 days', '60 days', '90 days'],
    example: 'Discovery -> proposal -> procurement -> PO; average 75 days.',
  },
  dailyActivityLog: {
    templates: [
      'Daily log: customer meetings, dealer calls, proposals sent, objections, competitor signals, stuck deals, next action, due date, and owner.',
      'Daily log: who was contacted, what changed, blocker, buying signal, follow-up promise, account name, opportunity name, and tomorrow priority.',
      'Daily log: meetings, calls, demos, internal reviews, procurement updates, proof requests, customer insight, and lost momentum signals.',
    ],
    chips: ['Meetings', 'Calls', 'Demos', 'Proposals', 'Objections', 'Competitors', 'Next action', 'Due date', 'Owner', 'Stuck deal'],
    example: 'Meeting/call, signal, blocker, next action, due date, owner.',
  },
};

const presets: SetupPreset[] = [
  {
    id: 'distribution-sales',
    label: 'Distributor sales',
    description: 'Direct key accounts plus dealer or distributor coverage.',
    values: {
      salesTarget: 'Quarter target: 5B VND revenue, 8 closed-won deals, 20 qualified opportunities. Split by direct key accounts and distributor-led deals.',
      gtmTarget: 'Primary ICP: healthcare and pharma distributors in Vietnam. Priority pain: stock availability, implementation confidence, local support, and proof.',
      rtmTarget: 'Direct sales for strategic accounts. Distributor route for provincial coverage. Partner owns local follow-up, internal team owns proposal and proof.',
      pnlRequired: 'Optional guardrails: gross margin above 35%, partner commission under 8%, discount above 15% needs approval.',
      salesCycle: 'Lead -> discovery -> technical validation -> proposal -> procurement -> PO. Average cycle 75 days. Main blockers: budget owner, proof, procurement path.',
      dailyActivityLog: 'Daily log: customer meetings, dealer calls, proposals sent, objections, competitor signals, stuck deals, next action, due date, and owner.',
    },
  },
  {
    id: 'b2b-sales-os',
    label: 'B2B sales team',
    description: 'Long-cycle pipeline, weekly review, manager-ready evidence.',
    values: {
      salesTarget: 'Quarter target: 12B VND pipeline reviewed, 4B VND committed forecast, 10 qualified opportunities moved to next stage.',
      gtmTarget: 'Primary ICP: B2B teams with long sales cycles and weekly manager reviews. Pain: deal memory, follow-up drift, weak forecast evidence.',
      rtmTarget: 'Outbound for named accounts, referrals for warm intros, partner route for industry coverage. Review channel contribution weekly.',
      pnlRequired: 'Track profitability only for strategic deals: margin, discount, implementation cost, commission, and payback period.',
      salesCycle: 'Discovery -> demo -> champion validation -> commercial proposal -> legal/procurement -> closed-won. Average cycle 45 days.',
      dailyActivityLog: 'Daily log: who was contacted, what changed, blocker, buying signal, follow-up promise, account name, opportunity name, and tomorrow priority.',
    },
  },
  {
    id: 'enterprise-accounts',
    label: 'Enterprise accounts',
    description: 'Named accounts, multiple stakeholders, procurement pressure.',
    values: {
      salesTarget: 'Annual target: 20 named accounts, 6 strategic wins, 70B VND weighted pipeline. Track expansion and renewal risk separately.',
      gtmTarget: 'Primary ICP: key accounts in manufacturing and logistics. Pain: multi-stakeholder buying, procurement delays, proof gaps.',
      rtmTarget: 'Direct key account motion for top 50 accounts. Reseller route for long-tail accounts. Online inbound is triaged before sales assignment.',
      pnlRequired: 'Guardrails: gross margin above 40%, implementation scope approved before proposal, discount above 12% needs sales lead approval.',
      salesCycle: 'Account mapping -> discovery -> stakeholder validation -> technical proof -> commercial proposal -> procurement -> legal -> PO. Average cycle 90 days.',
      dailyActivityLog: 'Daily log: stakeholder changes, executive signals, technical proof requests, legal/procurement movement, next action, due date, and owner.',
    },
  },
];

const defaultActiveSection: SalesOperatingSetupSectionId = 'salesTarget';

export function SalesOperatingSetupPage() {
  const [state, setState] = useState(() => loadSalesOperatingSetupState());
  const [values, setValues] = useState<SalesOperatingSetupValues>(state.values);
  const [activeSectionId, setActiveSectionId] = useState<SalesOperatingSetupSectionId>(getFirstOpenSection(state.values));
  const [message, setMessage] = useState('');
  const progress = useMemo(() => buildSalesOperatingSetupProgress({ ...state, values }), [state, values]);
  const digest = useMemo(() => buildSalesOperatingSetupDigest({ ...state, values }), [state, values]);
  const activeIndex = salesOperatingSetupSections.findIndex((section) => section.id === activeSectionId);
  const activeSection = salesOperatingSetupSections[activeIndex] || salesOperatingSetupSections[0];
  const dirty = JSON.stringify(values) !== JSON.stringify(state.values);
  const optionalDone = progress.completedOptional > 0;

  const updateValue = (id: SalesOperatingSetupSectionId, value: string) => {
    setValues((current) => ({ ...current, [id]: value }));
    setMessage('');
  };

  const applyPreset = (preset: SetupPreset) => {
    setValues(preset.values);
    setActiveSectionId(defaultActiveSection);
    setMessage(`${preset.label} starter applied. Review and adjust before saving.`);
  };

  const applyTemplate = (template: string) => {
    updateValue(activeSection.id, template);
  };

  const addChip = (chip: string) => {
    const current = values[activeSection.id].trim();
    updateValue(activeSection.id, current ? `${current}, ${chip}` : chip);
  };

  const handleSave = () => {
    const nextState = saveSalesOperatingSetupState({ ...state, values });
    setState(nextState);
    setValues(nextState.values);
    setMessage(nextState.completedAt ? 'Setup saved. Memoire has enough context to guide execution.' : 'Draft saved.');
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
    setActiveSectionId(defaultActiveSection);
    setMessage('Setup reset.');
  };

  const goToPrevious = () => {
    const previous = salesOperatingSetupSections[Math.max(0, activeIndex - 1)];
    setActiveSectionId(previous.id);
  };

  const goToNext = () => {
    const next = salesOperatingSetupSections[Math.min(salesOperatingSetupSections.length - 1, activeIndex + 1)];
    setActiveSectionId(next.id);
  };

  return (
    <div className="flex w-full max-w-none flex-col gap-5 px-4 py-5 sm:px-5 lg:px-6">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Sales Setup</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-navy">Set the sales context in a few clicks.</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
            Pick a starter, adjust the important parts, then save. P&L can stay blank until the team needs margin control.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-700"
          >
            <RotateCcw className="h-4 w-4" />
            Reset
          </button>
          <button
            type="button"
            onClick={handleSkip}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-700"
          >
            Skip
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="inline-flex items-center gap-2 rounded-lg bg-navy px-4 py-2 text-sm font-bold text-white"
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

      <section className="rounded-xl border border-blue-100 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge label={progress.status} tone={progress.status === 'Ready' ? 'green' : progress.status === 'In progress' ? 'amber' : 'blue'} />
              {dirty && <Badge label="Unsaved" tone="amber" />}
              {optionalDone && <Badge label="P&L added" tone="green" />}
            </div>
            <h2 className="mt-2 text-xl font-bold text-navy">
              {progress.percent === 100 ? 'Core context ready' : `${progress.completedRequired}/${progress.requiredCount} required sections ready`}
            </h2>
          </div>
          <div className="min-w-full lg:min-w-[360px]">
            <div className="flex items-center justify-between text-xs font-bold text-gray-500">
              <span>Readiness</span>
              <span>{progress.percent}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100">
              <div className="h-full rounded-full bg-brand-blue transition-all" style={{ width: `${progress.percent}%` }} />
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        {presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => applyPreset(preset)}
            className="rounded-xl border border-gray-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-200 hover:bg-blue-50"
          >
            <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-brand-blue">Starter</span>
            <h2 className="mt-3 text-base font-bold text-navy">{preset.label}</h2>
            <p className="mt-1 text-sm leading-6 text-gray-600">{preset.description}</p>
          </button>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-[280px_1fr_340px]">
        <nav className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm" aria-label="Sales setup sections">
          <p className="px-2 py-2 text-xs font-bold uppercase tracking-[0.18em] text-gray-400">Sections</p>
          <div className="space-y-1">
            {salesOperatingSetupSections.map((section, index) => (
              <button
                key={section.id}
                type="button"
                onClick={() => setActiveSectionId(section.id)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition ${
                  section.id === activeSection.id ? 'bg-navy text-white' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                  section.id === activeSection.id ? 'bg-white/10 text-white' : 'bg-blue-50 text-brand-blue'
                }`}>
                  {sectionIcons[section.id]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold">{index + 1}. {section.shortTitle}</span>
                  <span className={`mt-0.5 block text-xs font-semibold ${section.id === activeSection.id ? 'text-white/60' : 'text-gray-400'}`}>
                    {values[section.id].trim() ? 'Filled' : section.required ? 'Required' : 'Optional'}
                  </span>
                </span>
                {values[section.id].trim() && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />}
              </button>
            ))}
          </div>
        </nav>

        <ActiveSectionEditor
          section={activeSection}
          value={values[activeSection.id]}
          sectionNumber={activeIndex + 1}
          onChange={(value) => updateValue(activeSection.id, value)}
          onApplyTemplate={applyTemplate}
          onAddChip={addChip}
          onPrevious={goToPrevious}
          onNext={goToNext}
          previousDisabled={activeIndex === 0}
          nextDisabled={activeIndex === salesOperatingSetupSections.length - 1}
        />

        <BlueprintPreview digest={digest} onSave={handleSave} />
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Next</p>
            <h2 className="mt-2 text-xl font-bold text-navy">Move from setup to execution.</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/app/capture?mode=quick" className="inline-flex items-center gap-2 rounded-lg bg-brand-blue px-4 py-2 text-sm font-bold text-white">
              Daily Capture
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/app/dashboard" className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700">
              Dashboard
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function ActiveSectionEditor({
  section,
  value,
  sectionNumber,
  onChange,
  onApplyTemplate,
  onAddChip,
  onPrevious,
  onNext,
  previousDisabled,
  nextDisabled,
}: {
  section: SalesOperatingSetupSection;
  value: string;
  sectionNumber: number;
  onChange: (value: string) => void;
  onApplyTemplate: (value: string) => void;
  onAddChip: (value: string) => void;
  onPrevious: () => void;
  onNext: () => void;
  previousDisabled: boolean;
  nextDisabled: boolean;
}) {
  const play = sectionPlaybook[section.id];
  const filled = value.trim().length > 0;

  return (
    <article className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-brand-blue">Step {sectionNumber}</span>
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${section.required ? 'bg-gray-100 text-gray-600' : 'bg-emerald-50 text-emerald-700'}`}>
              {section.required ? 'Required' : 'Optional'}
            </span>
          </div>
          <h2 className="mt-3 text-2xl font-bold tracking-tight text-navy">{section.title}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">{section.prompt}</p>
        </div>
        {filled && <CheckCircle2 className="h-6 w-6 text-emerald-600" />}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-3">
        {play.templates.map((template) => (
          <button
            key={template}
            type="button"
            onClick={() => onApplyTemplate(template)}
            className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-left text-sm font-semibold leading-6 text-gray-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-950"
          >
            {template}
          </button>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {play.chips.map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => onAddChip(chip)}
            className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-700 hover:border-blue-200 hover:bg-blue-50 hover:text-brand-blue"
          >
            {chip}
          </button>
        ))}
      </div>

      <label className="mt-5 block">
        <span className="text-xs font-bold uppercase tracking-wide text-gray-400">Your answer</span>
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={play.example}
          rows={6}
          className="mt-2 w-full resize-y rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-sm leading-6 text-gray-800 outline-none placeholder:text-gray-400 focus:border-brand-blue focus:bg-white focus:ring-2 focus:ring-blue-100"
        />
      </label>

      <div className="mt-4 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
        <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Memoire output</p>
        <p className="mt-1 text-sm leading-6 text-gray-600">{section.intelligenceOutput}</p>
      </div>

      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={onPrevious}
          disabled={previousDisabled}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ArrowLeft className="h-4 w-4" />
          Previous
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={nextDisabled}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-navy px-3 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </article>
  );
}

function BlueprintPreview({ digest, onSave }: { digest: string; onSave: () => void }) {
  return (
    <aside className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Blueprint</p>
          <h2 className="mt-2 text-lg font-bold text-navy">Saved context preview</h2>
        </div>
        <ClipboardList className="h-5 w-5 text-brand-blue" />
      </div>
      {digest ? (
        <pre className="mt-4 max-h-[560px] overflow-auto whitespace-pre-wrap rounded-lg border border-gray-100 bg-gray-50 p-3 text-xs leading-5 text-gray-700">{digest}</pre>
      ) : (
        <div className="mt-4 rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4">
          <p className="text-sm font-bold text-navy">No context yet.</p>
          <p className="mt-1 text-sm leading-6 text-gray-500">Pick a starter or fill the first section.</p>
        </div>
      )}
      <button
        type="button"
        onClick={onSave}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-navy px-4 py-2 text-sm font-bold text-white"
      >
        <Save className="h-4 w-4" />
        Save changes
      </button>
    </aside>
  );
}

function Badge({ label, tone }: { label: string; tone: 'blue' | 'green' | 'amber' }) {
  const toneClass = {
    blue: 'border-blue-100 bg-blue-50 text-brand-blue',
    green: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-100 bg-amber-50 text-amber-700',
  }[tone];

  return <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${toneClass}`}>{label}</span>;
}

function getFirstOpenSection(values: SalesOperatingSetupValues): SalesOperatingSetupSectionId {
  return salesOperatingSetupSections.find((section) => section.required && !values[section.id].trim())?.id || defaultActiveSection;
}
