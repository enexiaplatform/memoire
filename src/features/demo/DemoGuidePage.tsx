import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, FileCheck2, ShieldCheck, Target } from 'lucide-react';
import { useAuthContext } from '../../auth/authContext';
import { DataModePill } from '../../components/common/DataModePill';
import { DemoJourneyCard } from '../../components/demo/DemoJourneyCard';
import { isFounderWorkspaceEnabled, isSupabaseConfigured } from '../../lib/demoMode';
import { hasLocalSampleData } from '../../utils/dataMode';
import { clearSampleDataset, loadSampleDataset } from '../../utils/sampleData';
import { markTrialActivationChecklistItemComplete } from '../../utils/trialActivationChecklist';
import {
  createDemoFeedback,
  defaultDemoFeedbackInput,
  generateInterviewScriptText,
  type DemoFeedbackInput,
  type DemoFeedbackUnderstanding,
  type DemoFeedbackUsageFrequency,
  type DemoFeedbackWillingnessToPay,
} from '../../utils/demoFeedback';

export function DemoGuidePage() {
  const { isAuthenticated, loading: authLoading } = useAuthContext();
  const [sampleDataActive, setSampleDataActive] = useState(hasLocalSampleData());
  const [message, setMessage] = useState('');
  const [feedbackForm, setFeedbackForm] = useState<DemoFeedbackInput>(() => ({
    ...defaultDemoFeedbackInput,
    context: 'Demo Guide',
  }));
  const [feedbackMessage, setFeedbackMessage] = useState('');

  const loadDemo = () => {
    if (!sampleDataActive) {
      loadSampleDataset();
      markTrialActivationChecklistItemComplete('load-demo-or-import-csv');
      setSampleDataActive(true);
    }
    setMessage(isAuthenticated
      ? 'Demo sandbox loaded locally only. It was not saved to your cloud account.'
      : 'Demo sandbox loaded locally in this browser.');
  };

  const resetDemo = () => {
    const confirmed = window.confirm('Reset demo data in this browser? This only removes records marked as demo/sample and does not delete cloud data or user records.');
    if (!confirmed) return;
    clearSampleDataset();
    setSampleDataActive(false);
    setMessage('Demo data cleared from this browser. Cloud data was not changed.');
  };

  const updateFeedbackForm = (patch: Partial<DemoFeedbackInput>) => {
    setFeedbackForm((current) => ({ ...current, ...patch }));
  };

  const submitFeedback = () => {
    createDemoFeedback({
      ...feedbackForm,
      context: 'Demo Guide',
    });
    setFeedbackMessage('Feedback saved locally. It will not be sent anywhere unless you copy/export it.');
    setFeedbackForm({
      ...defaultDemoFeedbackInput,
      context: 'Demo Guide',
    });
  };

  const copyInterviewScript = async () => {
    try {
      await navigator.clipboard.writeText(generateInterviewScriptText());
      setFeedbackMessage('Interview script copied.');
    } catch {
      setFeedbackMessage(generateInterviewScriptText());
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="rounded-xl border border-blue-100 bg-blue-50/70 p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">5-minute demo guide</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-navy">Run the Pipeline Defense proof path</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-blue-950">
              Memoire is a Personal Business Activity OS used beside CRM, spreadsheets, and private notes. The demo proves one promise: capture messy sales evidence, let Today expose urgent risks, and copy manager-ready Pipeline Defense answers before Monday review or your next solo sales check-in.
            </p>
          </div>
          <DataModePill
            compact
            isLoading={authLoading}
            isAuthenticated={isAuthenticated}
            isSupabaseConfigured={isSupabaseConfigured}
            cloudAvailable={isSupabaseConfigured}
            hasSampleData={sampleDataActive}
          />
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" onClick={loadDemo} className="inline-flex items-center gap-2 rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">
            <CheckCircle2 className="h-4 w-4" />
            {sampleDataActive ? 'Demo Sandbox Loaded' : 'Load Demo Sandbox'}
          </button>
          <Link to="/app/today" className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white px-4 py-2 text-sm font-bold text-brand-blue">
            Open Today
            <ArrowRight className="h-4 w-4" />
          </Link>
          {sampleDataActive && (
            <button type="button" onClick={resetDemo} className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white px-4 py-2 text-sm font-bold text-amber-700">
              Reset Demo Data
            </button>
          )}
        </div>
        {message && (
          <p className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
            {message}
          </p>
        )}
      </header>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <PositioningCard
          icon={<Target className="h-5 w-5" />}
          title="Beside CRM"
          body="Your CRM, spreadsheet, or notes track the record. Memoire helps you think, remember, and prepare as the person responsible for follow-up."
        />
        <PositioningCard
          icon={<ShieldCheck className="h-5 w-5" />}
          title="Private working copy"
          body="Demo and CSV working copies stay in your browser by default, have no CRM writeback, and can be reviewed safely before any cloud setup."
        />
        <PositioningCard
          icon={<FileCheck2 className="h-5 w-5" />}
          title="Review-ready output"
          body="The demo ends with a Pipeline Defense Brief and Manager Summary that a sales rep, founder, consultant, or solo operator can use for review."
        />
      </section>

      <DemoJourneyCard />

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DemoScriptCard
          title="What to show first"
          items={[
            'Open Today, the daily command center.',
            'Point to Top 3 actions, Top 3 Today Actions, and Proactive Nudges.',
            'Explain: “This is what I must fix before it costs me the deal.”',
            'Then use Paste Email / Thread mode in Capture and confirm the structured draft.',
          ]}
        />
        <DemoScriptCard
          title="What pain this proves"
          items={[
            'Messy notes and emails are where real deal evidence lives.',
            'CRM fields do not tell the seller what they can defend in review.',
            'Missing Champion, Economic Buyer, Procurement, objections, or due dates become review risk.',
            'The seller needs a manager-ready answer, not another dashboard to interpret.',
          ]}
        />
        <DemoScriptCard
          title="Exact talk track"
          items={[
            '“Imagine it is Monday morning and I have pipeline review in 30 minutes.”',
            '“I am not replacing CRM. I am preparing beside CRM.”',
            '“First I check Today: what can embarrass me, what can I defend, and what needs action?”',
            '“Now I paste the customer email. Memoire extracts evidence, but I confirm the fields before saving.”',
            '“Pipeline Defense turns that into a copyable answer: defend, rescue, downgrade, missing evidence, next action. Now I click Copy manager brief.”',
            '“If prior outcomes show a pattern, Memoire warns me cautiously instead of pretending it knows the future.”',
          ]}
        />
        <DemoScriptCard
          title="What not to show"
          items={[
            'Do not present Memoire as the system of record.',
            'Do not start with Accounts, Quotes, imports, settings, or broad reporting.',
            'Do not imply Gmail, Calendar, Zalo, or CRM sync exists in this milestone.',
            'Do not present Memoire as invoicing, inventory, ecommerce, marketplace, or project-delivery management.',
            'Do not over-explain every tab. Stay on Today → Capture → Pipeline Defense.',
          ]}
        />
        <DemoScriptCard
          title="Demo success criteria"
          items={[
            'User can repeat the promise: “Never enter a pipeline review unprepared.”',
            'User understands Today = daily command center.',
            'User sees Capture = evidence input for messy notes/emails.',
            'User sees Pipeline Defense = review artifact with copyable manager brief.',
            'User notices MEDDIC Stakeholder Map and Outcome Learning as proof, not extra CRM modules.',
          ]}
        />
      </section>

      <section className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900 shadow-sm">
        <p className="font-bold">Privacy-first demo note</p>
          <p className="mt-1">
          Demo data is local-only. Memoire does not connect to Salesforce, HubSpot, Gmail, Google Calendar, Zalo, or CRM sync in this flow. AI assist is optional only where a server-side provider is configured.
        </p>
      </section>

      {isFounderWorkspaceEnabled && (
        <DemoFeedbackForm
          form={feedbackForm}
          message={feedbackMessage}
          onChange={updateFeedbackForm}
          onSubmit={submitFeedback}
          onCopyInterviewScript={copyInterviewScript}
        />
      )}
    </div>
  );
}

function DemoFeedbackForm({
  form,
  message,
  onChange,
  onSubmit,
  onCopyInterviewScript,
}: {
  form: DemoFeedbackInput;
  message: string;
  onChange: (patch: Partial<DemoFeedbackInput>) => void;
  onSubmit: () => void;
  onCopyInterviewScript: () => void;
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Demo Feedback</p>
          <h2 className="mt-2 text-xl font-bold text-navy">Capture validation notes</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">
            Use this after a real user demo. Feedback is saved locally in this browser and can be copied later from the feedback log.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onCopyInterviewScript} className="rounded-full border border-blue-100 bg-blue-50 px-4 py-2 text-sm font-bold text-brand-blue">
            Copy Interview Script
          </button>
          <Link to="/app/validation-feedback" className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700">
            Open Feedback Log
          </Link>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TextField label="User persona" value={form.userPersona} placeholder="Account executive, founder-led sales, consultant, agency owner..." onChange={(value) => onChange({ userPersona: value })} />
        <TextField label="What did they think Memoire does?" value={form.freeTextFeedback} placeholder="Their 30-second understanding..." onChange={(value) => onChange({ freeTextFeedback: value })} />
        <SelectField
          label="Understood in 30 seconds"
          value={form.understoodIn30Seconds}
          options={['Yes', 'Partly', 'No']}
          onChange={(value) => onChange({ understoodIn30Seconds: value as DemoFeedbackUnderstanding })}
        />
        <TextField label="Most valuable workflow" value={form.mostValuableWorkflow} placeholder="Pipeline Defense, Capture, Assets, Playbook..." onChange={(value) => onChange({ mostValuableWorkflow: value })} />
        <SelectField
          label="Likely usage"
          value={form.likelyUsageFrequency}
          options={['Daily', 'Weekly', 'Before pipeline review', 'Rarely', 'Not sure']}
          onChange={(value) => onChange({ likelyUsageFrequency: value as DemoFeedbackUsageFrequency })}
        />
        <SelectField
          label="Willingness to pay"
          value={form.willingnessToPay}
          options={['Yes', 'Maybe', 'No', 'Not asked']}
          onChange={(value) => onChange({ willingnessToPay: value as DemoFeedbackWillingnessToPay })}
        />
        <TextField label="Top adoption blocker" value={form.topAdoptionBlocker} placeholder="Duplicate entry, privacy, CRM sync, habit..." onChange={(value) => onChange({ topAdoptionBlocker: value })} />
        <TextField label="What should be built next?" value={form.featureRequest} placeholder="Share links, CRM sync, landing/pricing, capture automation..." onChange={(value) => onChange({ featureRequest: value })} />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button type="button" onClick={onSubmit} className="rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">
          Save Feedback Locally
        </button>
        {message && <p className="text-sm font-semibold text-emerald-700">{message}</p>}
      </div>
    </section>
  );
}

function TextField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-navy">{label}</span>
      <textarea
        value={value}
        placeholder={placeholder}
        rows={3}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm leading-6 outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-navy">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
      >
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function PositioningCard({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <article className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-brand-blue">{icon}</div>
      <h2 className="mt-4 text-base font-bold text-navy">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-gray-600">{body}</p>
    </article>
  );
}

function DemoScriptCard({ title, items }: { title: string; items: string[] }) {
  return (
    <article className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-bold text-navy">{title}</h2>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li key={item} className="flex gap-2 text-sm leading-6 text-gray-600">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-blue" />
            {item}
          </li>
        ))}
      </ul>
    </article>
  );
}
