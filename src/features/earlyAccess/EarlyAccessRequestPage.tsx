import { useState } from 'react';
import type { ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, ClipboardCheck, Copy, Mail, ShieldCheck } from 'lucide-react';
import { BrandWordmark } from '../../components/brand/BrandWordmark';
import { copyTextToClipboard } from '../../utils/clipboard';
import {
  buildEarlyAccessMailto,
  defaultEarlyAccessRequest,
  earlyAccessRoles,
  generateEarlyAccessRequestSummary,
  pipelineReviewPains,
  submitEarlyAccessRequest,
  type EarlyAccessRequestInput,
  type EarlyAccessRequestRecord,
} from '../../utils/earlyAccessRequests';
import { trackProductEvent } from '../../utils/productAnalytics';

export function EarlyAccessRequestPage() {
  const [form, setForm] = useState<EarlyAccessRequestInput>(defaultEarlyAccessRequest);
  const [submitted, setSubmitted] = useState<EarlyAccessRequestRecord | null>(null);
  const [copyMessage, setCopyMessage] = useState('');
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof EarlyAccessRequestInput, string>>>({});
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const updateField = (field: keyof EarlyAccessRequestInput) => (
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
    setFormErrors((current) => ({ ...current, [field]: '' }));
    setCopyMessage('');
  };

  const submitRequest = async () => {
    const nextErrors = validateRequest(form);
    setFormErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setCopyMessage('Please fix the highlighted fields before submitting.');
      return;
    }
    if (!consent) {
      setCopyMessage('Please confirm that Memoire may use these details to follow up about early access.');
      return;
    }

    setSubmitting(true);
    setCopyMessage('');
    try {
      await submitEarlyAccessRequest(form, consent, website);
      const record: EarlyAccessRequestRecord = {
        ...form,
        id: 'submitted',
        createdAt: new Date().toISOString(),
      };
      setSubmitted(record);
      setCopyMessage('Request received. We will review it and reply by email within 2 business days.');
      trackProductEvent('request_access_submitted', 'browser-only');
    } catch (error) {
      setCopyMessage(error instanceof Error ? error.message : 'We could not submit your request. Please retry.');
    } finally {
      setSubmitting(false);
    }
  };

  const copySummary = async () => {
    if (!submitted) return;
    const summary = generateEarlyAccessRequestSummary(submitted);
    if (await copyTextToClipboard(summary)) {
      setCopyMessage('Request summary copied.');
    } else {
      setCopyMessage(summary);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <section className="border-b border-slate-200 bg-white px-4 py-5">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <Link to="/" aria-label="Memoire home">
            <BrandWordmark className="text-2xl" />
          </Link>
          <div className="flex flex-wrap justify-end gap-2">
            <Link to="/demo" className="rounded-full border border-blue-100 bg-blue-50 px-4 py-2 text-sm font-bold text-brand-blue hover:bg-blue-100">
              Try Demo
            </Link>
            <Link to="/login" className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700">
              Log in
            </Link>
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 lg:grid-cols-[0.85fr_1.15fr]">
        <section className="rounded-xl border border-blue-100 bg-blue-50 p-6 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Early access</p>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-navy">
            Request access to Memoire.
          </h1>
          <p className="mt-4 text-sm leading-6 text-blue-950">
            Memoire is in early access. Tell us how you manage sales follow-up, pipeline reviews, or client/partner deal memory today and what workflow you want to try.
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
            <p className="font-bold text-slate-900">What happens next</p>
            <p className="mt-1">
              We review your workflow and reply to your work email within 2 business days. Submitting does not add you to a marketing list.
            </p>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          {!submitted ? (
            <>
              <div className="flex items-start gap-3">
                <ClipboardCheck className="mt-1 h-5 w-5 text-brand-blue" />
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
                <TextInput label="Current CRM, spreadsheet, notes, or pipeline tool" value={form.currentTool} onChange={updateField('currentTool')} placeholder="Salesforce, HubSpot, Excel, Notion, private notes..." required error={formErrors.currentTool} />
                <div className="md:col-span-2">
                  <SelectInput label="Biggest pipeline review pain" value={form.biggestPain} onChange={updateField('biggestPain')} options={pipelineReviewPains} />
                </div>
                <label className="md:col-span-2">
                  <span className="text-sm font-bold text-navy">Preferred use case <span className="text-red-600">*</span></span>
                  <textarea
                    value={form.preferredUseCase}
                    onChange={updateField('preferredUseCase')}
                    rows={4}
                    placeholder="Example: I want to remember client follow-ups and prepare review-ready deal stories without rebuilding context manually."
                    aria-invalid={Boolean(formErrors.preferredUseCase)}
                    className={`mt-2 w-full rounded-lg border bg-slate-50 px-3 py-2 text-sm leading-6 outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10 ${
                      formErrors.preferredUseCase ? 'border-red-300' : 'border-slate-300'
                    }`}
                  />
                  {formErrors.preferredUseCase && <span className="mt-1 block text-xs font-semibold text-red-600">{formErrors.preferredUseCase}</span>}
                </label>
                <label className="hidden" aria-hidden="true">
                  Website
                  <input
                    aria-hidden="true"
                    tabIndex={-1}
                    autoComplete="off"
                    value={website}
                    onChange={(event) => setWebsite(event.target.value)}
                  />
                </label>
                <label className="md:col-span-2 flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(event) => setConsent(event.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-brand-blue"
                  />
                  <span className="text-sm leading-6 text-slate-600">
                    Memoire may use these details to review this request and contact me about early access. See the{' '}
                    <Link to="/legal/privacy" className="font-semibold text-brand-blue">Privacy Policy</Link>.
                  </span>
                </label>
              </div>

              {copyMessage && (
                <p className="mt-5 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700" role="alert">
                  {copyMessage}
                </p>
              )}

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={submitRequest}
                  disabled={submitting}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-navy px-5 py-3 text-sm font-bold text-white hover:bg-navy/90"
                >
                  {submitting ? 'Submitting...' : 'Submit Request'}
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
      <CheckCircle2 className="h-9 w-9 text-emerald-600" />
      <p className="mt-4 text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Request received</p>
      <h2 className="mt-2 text-2xl font-bold text-navy">Thank you for your interest in Memoire.</h2>
      <p className="mt-2 text-sm leading-6 text-slate-500">
        Keep this summary for your records. We normally reply within 2 business days.
      </p>

      <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <pre className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{summary}</pre>
      </div>

      {copyMessage && (
        <p className={`mt-4 rounded-lg px-3 py-2 text-sm font-semibold ${
          copyMessage.startsWith('Request summary copied') || copyMessage.startsWith('Request received')
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
          Copy for my records
        </button>
        <a
          href={buildEarlyAccessMailto(request)}
          className="inline-flex items-center justify-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-5 py-3 text-sm font-bold text-brand-blue hover:bg-blue-100"
        >
          <Mail className="h-4 w-4" />
          Email as fallback
        </a>
        <Link to="/demo" className="inline-flex justify-center rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50">
          Return to Demo
        </Link>
        <Link to="/signup" className="inline-flex justify-center rounded-full bg-navy px-5 py-3 text-sm font-bold text-white hover:bg-navy/90">
          Create account now
        </Link>
        <Link to="/login" className="inline-flex justify-center rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50">
          Log in
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
        className={`mt-2 w-full rounded-lg border bg-slate-50 px-3 py-2 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10 ${
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
        className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
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
