import { useState } from 'react';
import type { ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ClipboardCheck, Copy, Mail, ShieldCheck } from 'lucide-react';
import {
  buildEarlyAccessMailto,
  budgetOwners,
  defaultEarlyAccessRequest,
  earlyAccessRoles,
  earlyAccessSegments,
  generateEarlyAccessRequestSummary,
  interestedWorkflows,
  loadEarlyAccessRequests,
  pipelineReviewFrequencies,
  pipelineReviewPains,
  saveEarlyAccessRequest,
  type EarlyAccessRequestInput,
  type EarlyAccessRequestRecord,
} from '../../utils/earlyAccessRequests';

export function EarlyAccessRequestPage() {
  const [form, setForm] = useState<EarlyAccessRequestInput>(defaultEarlyAccessRequest);
  const [submitted, setSubmitted] = useState<EarlyAccessRequestRecord | null>(null);
  const [copyMessage, setCopyMessage] = useState('');
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof EarlyAccessRequestInput, string>>>({});
  const [localRequestCount, setLocalRequestCount] = useState(() => loadEarlyAccessRequests().length);

  const updateField = (field: keyof EarlyAccessRequestInput) => (
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
    setFormErrors((current) => ({ ...current, [field]: '' }));
    setCopyMessage('');
  };

  const submitRequest = () => {
    const nextErrors = validateRequest(form);
    setFormErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setCopyMessage('Please fix the highlighted fields before creating the request summary.');
      return;
    }

    const record = saveEarlyAccessRequest(form);
    setSubmitted(record);
    setLocalRequestCount(loadEarlyAccessRequests().length);
    setCopyMessage('Your request summary is ready. Copy it or email it to request access.');
  };

  const copySummary = async () => {
    if (!submitted) return;
    const summary = generateEarlyAccessRequestSummary(submitted);
    try {
      await navigator.clipboard.writeText(summary);
      setCopyMessage('Request summary copied.');
    } catch {
      setCopyMessage(summary);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <section className="border-b border-slate-200 bg-white px-4 py-5">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <Link to="/" className="text-xl font-extrabold tracking-tight text-slate-950">Memoire</Link>
          <div className="flex flex-wrap justify-end gap-2">
            <Link to="/demo" className="rounded-full border border-blue-100 bg-blue-50 px-4 py-2 text-sm font-bold text-blue-700">
              Try Demo
            </Link>
            <Link to="/app/dashboard" className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700">
              Open App
            </Link>
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 lg:grid-cols-[0.85fr_1.15fr]">
        <section className="rounded-xl border border-blue-100 bg-blue-50 p-6 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">Early access</p>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-navy">
            Request access to Memoire.
          </h1>
          <p className="mt-4 text-sm leading-6 text-blue-950">
            Memoire is in early access. Tell us how you prepare pipeline reviews today and what workflow you want to try.
          </p>
          <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 flex-none" />
              <p>
                Do not include confidential customer data. This request is only for product access and use-case context.
              </p>
            </div>
          </div>
          <div className="mt-5 rounded-lg border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600">
            <p className="font-bold text-slate-900">No backend lead capture yet.</p>
            <p className="mt-1">
              Your request is saved locally in this browser. After submitting, copy the summary or send the prepared email.
            </p>
            <p className="mt-2 text-xs font-bold text-slate-500">
              Saved locally now: {localRequestCount} request{localRequestCount === 1 ? '' : 's'}.
            </p>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          {!submitted ? (
            <>
              <div className="flex items-start gap-3">
                <ClipboardCheck className="mt-1 h-5 w-5 text-blue-700" />
                <div>
                  <h2 className="text-xl font-bold text-navy">Tell us what you want to test</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    Keep it high level. Customer names, pricing, tender details, and competitor-sensitive notes should stay out of this request.
                  </p>
                </div>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <TextInput label="Name" value={form.name} onChange={updateField('name')} placeholder="Your name" required error={formErrors.name} />
                <TextInput label="Work email" value={form.workEmail} onChange={updateField('workEmail')} placeholder="name@company.com" type="email" required error={formErrors.workEmail} />
                <SelectInput label="Role" value={form.role} onChange={updateField('role')} options={earlyAccessRoles} />
                <SelectInput label="Segment / industry" value={form.segment} onChange={updateField('segment')} options={earlyAccessSegments} />
                <TextInput label="Current CRM or pipeline tool" value={form.currentTool} onChange={updateField('currentTool')} placeholder="Salesforce, HubSpot, Excel, Notion..." required error={formErrors.currentTool} />
                <SelectInput label="Pipeline review frequency" value={form.pipelineReviewFrequency} onChange={updateField('pipelineReviewFrequency')} options={pipelineReviewFrequencies} />
                <SelectInput label="Biggest pipeline review pain" value={form.biggestPain} onChange={updateField('biggestPain')} options={pipelineReviewPains} />
                <SelectInput label="What interested you most?" value={form.interestedMost} onChange={updateField('interestedMost')} options={interestedWorkflows} />
                <SelectInput label="Budget owner" value={form.budgetOwner} onChange={updateField('budgetOwner')} options={budgetOwners} />
                <label className="md:col-span-2">
                  <span className="text-sm font-bold text-navy">Preferred use case <span className="text-red-600">*</span></span>
                  <textarea
                    value={form.preferredUseCase}
                    onChange={updateField('preferredUseCase')}
                    rows={4}
                    placeholder="Example: I want to prepare weekly pipeline reviews from CSV without rebuilding deal stories manually."
                    aria-invalid={Boolean(formErrors.preferredUseCase)}
                    className={`mt-2 w-full rounded-lg border bg-slate-50 px-3 py-2 text-sm leading-6 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/10 ${
                      formErrors.preferredUseCase ? 'border-red-300' : 'border-slate-300'
                    }`}
                  />
                  {formErrors.preferredUseCase && <span className="mt-1 block text-xs font-semibold text-red-600">{formErrors.preferredUseCase}</span>}
                </label>
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={submitRequest}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-navy px-5 py-3 text-sm font-bold text-white hover:bg-navy/90"
                >
                  Create Request Summary
                  <ArrowRight className="h-4 w-4" />
                </button>
                <Link to="/demo" className="inline-flex justify-center rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50">
                  Return to Demo
                </Link>
              </div>
            </>
          ) : (
            <EarlyAccessSummary
              request={submitted}
              copyMessage={copyMessage}
              onCopy={copySummary}
            />
          )}
        </section>
      </div>
    </main>
  );
}

function EarlyAccessSummary({
  request,
  copyMessage,
  onCopy,
}: {
  request: EarlyAccessRequestRecord;
  copyMessage: string;
  onCopy: () => void;
}) {
  const summary = generateEarlyAccessRequestSummary(request);

  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">Request summary</p>
      <h2 className="mt-2 text-2xl font-bold text-navy">Early Access Request Summary</h2>
      <p className="mt-2 text-sm leading-6 text-slate-500">
        Your request summary is ready. Copy it or email it to request access.
      </p>

      <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <pre className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{summary}</pre>
      </div>

      {copyMessage && (
        <p className={`mt-4 rounded-lg px-3 py-2 text-sm font-semibold ${
          copyMessage.startsWith('Request summary copied') || copyMessage.startsWith('Your request summary')
            ? 'bg-emerald-50 text-emerald-700'
            : 'bg-white text-slate-700'
        }`}>
          {copyMessage}
        </p>
      )}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-navy px-5 py-3 text-sm font-bold text-white hover:bg-navy/90"
        >
          <Copy className="h-4 w-4" />
          Copy Request Summary
        </button>
        <a
          href={buildEarlyAccessMailto(request)}
          className="inline-flex items-center justify-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-5 py-3 text-sm font-bold text-blue-700 hover:bg-blue-100"
        >
          <Mail className="h-4 w-4" />
          Email Request
        </a>
        <Link to="/demo" className="inline-flex justify-center rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50">
          Return to Demo
        </Link>
        <Link to="/app/dashboard" className="inline-flex justify-center rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50">
          Open App
        </Link>
      </div>
    </div>
  );
}

function TextInput({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  required = false,
  error,
}: {
  label: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  placeholder: string;
  type?: string;
  required?: boolean;
  error?: string;
}) {
  return (
    <label>
      <span className="text-sm font-bold text-navy">{label} {required && <span className="text-red-600">*</span>}</span>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        className={`mt-2 w-full rounded-lg border bg-slate-50 px-3 py-2 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/10 ${
          error ? 'border-red-300' : 'border-slate-300'
        }`}
      />
      {error && <span className="mt-1 block text-xs font-semibold text-red-600">{error}</span>}
    </label>
  );
}

function SelectInput({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (event: ChangeEvent<HTMLSelectElement>) => void;
}) {
  return (
    <label>
      <span className="text-sm font-bold text-navy">{label}</span>
      <select
        value={value}
        onChange={onChange}
        className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/10"
      >
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function validateRequest(form: EarlyAccessRequestInput) {
  const errors: Partial<Record<keyof EarlyAccessRequestInput, string>> = {};
  if (!form.name.trim()) {
    errors.name = 'Add your name so we can identify the request.';
  }
  if (!form.workEmail.trim()) {
    errors.workEmail = 'Add a work email for the access follow-up.';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.workEmail.trim())) {
    errors.workEmail = 'Use a valid work email address.';
  }
  if (!form.currentTool.trim()) {
    errors.currentTool = 'Tell us what you use today, even if it is Excel or manual notes.';
  }
  if (!form.preferredUseCase.trim()) {
    errors.preferredUseCase = 'Describe the workflow you want to test.';
  }
  return errors;
}
