import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ClipboardList, Copy, Download, MessageSquareText, Trash2 } from 'lucide-react';
import {
  buildDemoFeedbackSummary,
  generateInterviewScriptText,
  generateValidationSummaryMarkdown,
  loadDemoFeedback,
  type DemoFeedbackRecord,
} from '../../utils/demoFeedback';
import {
  clearEarlyAccessRequests,
  generateAllEarlyAccessRequestsSummary,
  generateEarlyAccessRequestSummary,
  generateEarlyAccessRequestsCsv,
  generateEarlyAccessRequestsJson,
  loadEarlyAccessRequests,
  type EarlyAccessRequestRecord,
} from '../../utils/earlyAccessRequests';
import {
  COHORT_BUCKET_LABELS,
  scoreCohortRequest,
  summariseCohortBuckets,
  type CohortBucket,
  type CohortQualification,
} from '../../utils/cohortQualification';
import {
  evaluateCohortStopGo,
  loadCohortFunnelInput,
  saveCohortFunnelInput,
  type CohortFunnelInput,
  type CohortStopGo,
  type CohortVerdict,
} from '../../utils/cohortStopGo';

export function ValidationFeedbackPage() {
  const [feedback] = useState<DemoFeedbackRecord[]>(() => loadDemoFeedback());
  const [earlyAccessRequests, setEarlyAccessRequests] = useState<EarlyAccessRequestRecord[]>(() => loadEarlyAccessRequests());
  const [copyMessage, setCopyMessage] = useState('');
  const summary = useMemo(() => buildDemoFeedbackSummary(feedback), [feedback]);
  // Score and rank access requests against the Wave 1 qualification rubric so the
  // strongest cohort candidates surface first.
  const scoredRequests = useMemo(() => earlyAccessRequests
    .map((request) => ({ request, qualification: scoreCohortRequest(request) }))
    .sort((left, right) => right.qualification.score - left.qualification.score),
    [earlyAccessRequests]);
  const bucketDistribution = useMemo(() => summariseCohortBuckets(earlyAccessRequests), [earlyAccessRequests]);
  const [funnelInput, setFunnelInput] = useState<CohortFunnelInput>(() => loadCohortFunnelInput());
  const stopGo = useMemo(() => evaluateCohortStopGo(funnelInput), [funnelInput]);
  const updateFunnel = (patch: Partial<CohortFunnelInput>) => {
    setFunnelInput((current) => saveCohortFunnelInput({ ...current, ...patch }));
  };

  const copyText = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyMessage(`Copied ${label}.`);
    } catch {
      setCopyMessage(text);
    }
  };

  const exportRequests = (format: 'csv' | 'json') => {
    const content = format === 'csv'
      ? generateEarlyAccessRequestsCsv(earlyAccessRequests)
      : generateEarlyAccessRequestsJson(earlyAccessRequests);
    const mimeType = format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8';
    downloadTextFile(`memoire-early-access-requests.${format}`, content, mimeType);
    setCopyMessage(`Exported ${format.toUpperCase()} from local access requests.`);
  };

  const clearRequests = () => {
    if (earlyAccessRequests.length === 0) return;
    const confirmed = window.confirm('Clear all early access requests saved in this browser? This will not affect cloud data or any backend because these requests are local-only.');
    if (!confirmed) return;
    clearEarlyAccessRequests();
    setEarlyAccessRequests([]);
    setCopyMessage('Cleared local early access requests from this browser.');
  };

  return (
    <div className="flex w-full max-w-none flex-col gap-5 px-4 py-5 sm:px-5 lg:px-6">
      <header className="rounded-xl border border-blue-100 bg-blue-50/70 p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">User validation</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-navy">Demo Feedback Log</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-blue-950">
              Local-only validation notes from real B2B sales demos. Nothing is sent externally unless you copy or export it.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => copyText('validation summary', generateValidationSummaryMarkdown(feedback))}
              className="inline-flex items-center gap-2 rounded-full bg-navy px-4 py-2 text-sm font-bold text-white"
            >
              <Copy className="h-4 w-4" />
              Copy Validation Summary
            </button>
            <button
              type="button"
              onClick={() => copyText('interview script', generateInterviewScriptText())}
              className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white px-4 py-2 text-sm font-bold text-brand-blue"
            >
              <ClipboardList className="h-4 w-4" />
              Copy Interview Script
            </button>
          </div>
        </div>
        {copyMessage && (
          <p className={`mt-4 rounded-lg px-3 py-2 text-sm font-semibold ${
            copyMessage.startsWith('Copied') ? 'bg-emerald-50 text-emerald-700' : 'bg-white text-gray-700'
          }`}>
            {copyMessage}
          </p>
        )}
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <SummaryCard label="Feedback entries" value={summary.totalEntries} />
        <SummaryCard label="Access requests" value={earlyAccessRequests.length} />
        <SummaryCard label="Understood" value={summary.byUnderstanding.Yes || 0} tone="green" />
        <SummaryCard label="Partly / No" value={(summary.byUnderstanding.Partly || 0) + (summary.byUnderstanding.No || 0)} tone="amber" />
        <SummaryCard label="Pay yes/maybe" value={(summary.byWillingnessToPay.Yes || 0) + (summary.byWillingnessToPay.Maybe || 0)} tone="green" />
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <article className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Recommended Next Bet</p>
          <h2 className="mt-2 text-xl font-bold text-navy">{summary.recommendedNextBet}</h2>
          <p className="mt-3 text-sm leading-6 text-gray-600">
            This is rule-based from copied demo feedback, not analytics. Use it as a directional signal after 5-10 real user conversations.
          </p>
          <Link to="/app/demo-guide" className="mt-4 inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-sm font-bold text-brand-blue">
            Open Demo Guide
            <ArrowRight className="h-4 w-4" />
          </Link>
        </article>

        <article className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <MessageSquareText className="h-4 w-4 text-brand-blue" />
            <h2 className="text-lg font-bold text-navy">User Interview Script</h2>
          </div>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-6 text-gray-700">
            {generateInterviewScriptText().split('\n').slice(2).map((line) => (
              <li key={line}>{line.replace(/^\d+\.\s*/, '')}</li>
            ))}
          </ol>
        </article>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <SignalList title="Most valued workflows" items={summary.topValuedWorkflows} empty="No workflow signal yet." />
        <SignalList title="Adoption blockers" items={summary.topAdoptionBlockers} empty="No blocker signal yet." />
        <DistributionList title="Usage frequency" items={summary.byUsageFrequency} />
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Early access</p>
            <h2 className="mt-2 text-xl font-bold text-navy">Local access requests</h2>
            <p className="mt-1 text-sm leading-6 text-gray-500">
              Requests are saved only in this browser. Copy or export them before clearing browser data.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/request-access" className="rounded-full border border-blue-100 bg-blue-50 px-4 py-2 text-sm font-bold text-brand-blue">
              Open Request Form
            </Link>
            <button
              type="button"
              onClick={() => copyText('all early access requests', generateAllEarlyAccessRequestsSummary(earlyAccessRequests))}
              disabled={earlyAccessRequests.length === 0}
              className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Copy className="h-4 w-4" />
              Copy all
            </button>
            <button
              type="button"
              onClick={() => exportRequests('csv')}
              disabled={earlyAccessRequests.length === 0}
              className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
            <button
              type="button"
              onClick={() => exportRequests('json')}
              disabled={earlyAccessRequests.length === 0}
              className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Export JSON
            </button>
            <button
              type="button"
              onClick={clearRequests}
              disabled={earlyAccessRequests.length === 0}
              className="inline-flex items-center gap-2 rounded-full border border-red-100 bg-red-50 px-4 py-2 text-sm font-bold text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              Clear local
            </button>
          </div>
        </div>
        {earlyAccessRequests.length === 0 ? (
          <div className="mt-5 rounded-lg border border-gray-100 bg-gray-50 p-6 text-center">
            <p className="text-sm font-bold text-navy">No early access requests saved locally yet.</p>
            <p className="mt-2 text-sm leading-6 text-gray-500">
              Open the request form after a demo. Requests stay local until you copy, export, or email them.
            </p>
            <Link to="/request-access" className="mt-4 inline-flex rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">
              Open Request Form
            </Link>
          </div>
        ) : (
          <>
            <CohortBucketSummary distribution={bucketDistribution} />
            <p className="mt-4 text-xs font-semibold text-gray-400">
              Scored against the Wave 1 rubric and ranked strongest first. Directional only - confirm fit on the onboarding call.
            </p>
            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
              {scoredRequests.map(({ request, qualification }) => (
                <EarlyAccessRequestCard
                  key={request.id}
                  request={request}
                  qualification={qualification}
                  onCopy={() => copyText('early access request', generateEarlyAccessRequestSummary(request))}
                />
              ))}
            </div>
          </>
        )}
      </section>

      <CohortStopGoPanel input={funnelInput} stopGo={stopGo} onChange={updateFunnel} />

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Feedback entries</p>
            <h2 className="mt-2 text-xl font-bold text-navy">Raw local feedback</h2>
          </div>
          <p className="text-sm font-semibold text-gray-500">{feedback.length} entr{feedback.length === 1 ? 'y' : 'ies'}</p>
        </div>

        {feedback.length === 0 ? (
          <div className="mt-5 rounded-lg border border-gray-100 bg-gray-50 p-6 text-center">
            <p className="text-sm font-bold text-navy">No validation feedback captured yet.</p>
            <p className="mt-2 text-sm text-gray-500">Run the demo with a real user, then submit feedback from the Demo Guide or Pipeline Defense.</p>
            <Link to="/app/demo-guide" className="mt-4 inline-flex rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">
              Open Demo Guide
            </Link>
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {feedback.map((entry) => (
              <FeedbackCard key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SummaryCard({ label, value, tone = 'blue' }: { label: string; value: number; tone?: 'blue' | 'green' | 'amber' }) {
  const toneClass = {
    blue: 'bg-blue-50 text-brand-blue',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
  }[tone];

  return (
    <article className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-2xl font-black ${toneClass}`}>{value}</p>
    </article>
  );
}

function SignalList({ title, items, empty }: { title: string; items: { label: string; count: number }[]; empty: string }) {
  return (
    <article className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold text-navy">{title}</h2>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500">{empty}</p>
      ) : (
        <div className="mt-4 space-y-2">
          {items.map((item) => (
            <div key={item.label} className="rounded-lg bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-700">
              {item.label} <span className="text-gray-400">({item.count})</span>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

function DistributionList({ title, items }: { title: string; items: Record<string, number> }) {
  const entries = Object.entries(items);
  return (
    <article className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold text-navy">{title}</h2>
      {entries.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500">No signal yet.</p>
      ) : (
        <div className="mt-4 space-y-2">
          {entries.map(([label, count]) => (
            <div key={label} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm">
              <span className="font-semibold text-gray-700">{label}</span>
              <span className="font-bold text-brand-blue">{count}</span>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

function FeedbackCard({ entry }: { entry: DemoFeedbackRecord }) {
  return (
    <article className="rounded-lg border border-gray-100 bg-gray-50 p-4">
      <div className="flex flex-wrap gap-2">
        <Badge label={entry.context} />
        <Badge label={entry.understoodIn30Seconds} />
        <Badge label={entry.likelyUsageFrequency} />
        <Badge label={`Pay: ${entry.willingnessToPay}`} />
      </div>
      <h3 className="mt-3 text-base font-bold text-navy">{entry.userPersona || 'Unspecified user'}</h3>
      {entry.mostValuableWorkflow && <p className="mt-2 text-sm text-gray-700"><span className="font-bold">Most valuable:</span> {entry.mostValuableWorkflow}</p>}
      {entry.topAdoptionBlocker && <p className="mt-2 text-sm text-gray-700"><span className="font-bold">Blocker:</span> {entry.topAdoptionBlocker}</p>}
      {entry.featureRequest && <p className="mt-2 text-sm text-gray-700"><span className="font-bold">Build next:</span> {entry.featureRequest}</p>}
      {entry.freeTextFeedback && <p className="mt-2 text-sm leading-6 text-gray-600">{entry.freeTextFeedback}</p>}
      <p className="mt-3 text-xs font-semibold text-gray-400">{entry.createdAt.slice(0, 10)}</p>
    </article>
  );
}

const COHORT_BUCKET_TONE: Record<CohortBucket, string> = {
  'invite-first': 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  backup: 'bg-blue-50 text-brand-blue ring-blue-200',
  clarify: 'bg-amber-50 text-amber-700 ring-amber-200',
  skip: 'bg-gray-100 text-gray-500 ring-gray-200',
};

function CohortBucketSummary({ distribution }: { distribution: Record<CohortBucket, number> }) {
  const order: CohortBucket[] = ['invite-first', 'backup', 'clarify', 'skip'];
  return (
    <div className="mt-5 grid grid-cols-2 gap-2 lg:grid-cols-4">
      {order.map((bucket) => (
        <div key={bucket} className={`rounded-lg px-3 py-2 ring-1 ${COHORT_BUCKET_TONE[bucket]}`}>
          <p className="text-2xl font-black">{distribution[bucket]}</p>
          <p className="text-xs font-bold uppercase tracking-wide">{COHORT_BUCKET_LABELS[bucket]}</p>
        </div>
      ))}
    </div>
  );
}

const COHORT_VERDICT_STYLE: Record<CohortVerdict, { label: string; tone: string }> = {
  go: { label: 'Go to paid-offer design', tone: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  iterate: { label: 'Iterate before pricing', tone: 'bg-amber-50 text-amber-700 ring-amber-200' },
  pause: { label: 'Pause or reposition', tone: 'bg-red-50 text-red-700 ring-red-200' },
};

const COHORT_FUNNEL_FIELDS: { id: keyof CohortFunnelInput; label: string }[] = [
  { id: 'participants', label: 'Active participants' },
  { id: 'finishedLoop', label: 'Finished the 14-day loop' },
  { id: 'createdOrReviewedBrief', label: 'Created / reviewed a brief' },
  { id: 'savedPackOrCopiedSummary', label: 'Saved pack / copied summary' },
  { id: 'wouldUseWeeklyOrBeforeReview', label: 'Would use weekly / before review' },
  { id: 'paidIntent', label: 'Showed paid intent' },
];

function CohortStopGoPanel({ input, stopGo, onChange }: { input: CohortFunnelInput; stopGo: CohortStopGo; onChange: (patch: Partial<CohortFunnelInput>) => void }) {
  const verdict = COHORT_VERDICT_STYLE[stopGo.verdict];
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Cohort stop / go</p>
          <h2 className="mt-2 text-xl font-bold text-navy">Friday review verdict</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-500">
            Enter this week&apos;s counts from your tracker. The verdict is computed from the measured stop/go criteria - the qualitative signals still need your read.
          </p>
        </div>
        <div className={`shrink-0 rounded-lg px-4 py-2 text-center ring-1 ${verdict.tone}`}>
          <p className="text-xs font-bold uppercase tracking-wide">Verdict</p>
          <p className="text-base font-black">{verdict.label}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {COHORT_FUNNEL_FIELDS.map((field) => (
          <label key={field.id} className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-gray-500">{field.label}</span>
            <input
              type="number"
              min={0}
              value={String(input[field.id] as number)}
              onChange={(event) => onChange({ [field.id]: Number(event.target.value) } as Partial<CohortFunnelInput>)}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-bold text-navy focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </label>
        ))}
      </div>

      <label className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-gray-700">
        <input
          type="checkbox"
          checked={input.hasUnresolvedP0}
          onChange={(event) => onChange({ hasUnresolvedP0: event.target.checked })}
          className="h-4 w-4 rounded border-gray-300"
        />
        An unresolved P0 (trust, isolation, deletion, or sync) is open
      </label>

      <p className="mt-4 rounded-lg bg-gray-50 px-3 py-2 text-sm leading-6 text-gray-700">{stopGo.summary}</p>

      <div className="mt-4 grid grid-cols-1 gap-2 lg:grid-cols-2">
        {[...stopGo.goConditions, ...stopGo.pauseFlags].map((condition) => {
          const isPause = stopGo.pauseFlags.some((flag) => flag.id === condition.id);
          const good = isPause ? !condition.met : condition.met;
          return (
            <div key={condition.id} className={`flex items-start justify-between gap-3 rounded-lg px-3 py-2 text-sm ${good ? 'bg-emerald-50' : 'bg-amber-50'}`}>
              <span className={`font-semibold ${good ? 'text-emerald-800' : 'text-amber-900'}`}>
                {good ? '✓' : '•'} {condition.label}
              </span>
              <span className="shrink-0 text-xs font-semibold text-gray-500">{condition.detail}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function EarlyAccessRequestCard({ request, qualification, onCopy }: { request: EarlyAccessRequestRecord; qualification: CohortQualification; onCopy: () => void }) {
  return (
    <article className="rounded-lg border border-gray-100 bg-gray-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Badge label={request.role} />
          <Badge label={request.segment} />
          <Badge label={request.budgetOwner} />
        </div>
        <div className={`shrink-0 rounded-lg px-2.5 py-1 text-center ring-1 ${COHORT_BUCKET_TONE[qualification.bucket]}`}>
          <p className="text-lg font-black leading-none">{qualification.score}<span className="text-xs font-bold text-gray-400">/{qualification.maxScore}</span></p>
          <p className="text-[10px] font-bold uppercase tracking-wide">{COHORT_BUCKET_LABELS[qualification.bucket]}</p>
        </div>
      </div>
      <h3 className="mt-3 text-base font-bold text-navy">{request.name || 'Unnamed request'}</h3>
      <p className="mt-1 text-sm text-gray-600">{request.workEmail || 'No email provided'}</p>
      <p className="mt-2 text-sm text-gray-700"><span className="font-bold">Pain:</span> {request.biggestPain}</p>
      <p className="mt-1 text-sm text-gray-700"><span className="font-bold">Interested:</span> {request.interestedMost}</p>
      {request.currentTool && <p className="mt-1 text-sm text-gray-700"><span className="font-bold">Tool:</span> {request.currentTool}</p>}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {qualification.signals.map((signal) => (
          <span
            key={signal.id}
            title={signal.note ? `${signal.note}` : `${signal.met ? 'Met' : 'Not met'} - ${signal.points} pt`}
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              signal.met ? 'bg-emerald-50 text-emerald-700' : 'bg-white text-gray-400 line-through ring-1 ring-gray-200'
            }`}
          >
            {signal.met ? '✓' : '·'} {signal.label}
          </span>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-gray-400">{request.createdAt.slice(0, 10)}</p>
        <button type="button" onClick={onCopy} className="rounded-full border border-blue-100 bg-white px-3 py-1.5 text-xs font-bold text-brand-blue">
          Copy summary
        </button>
      </div>
    </article>
  );
}

function Badge({ label }: { label: string }) {
  return <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-gray-600 ring-1 ring-gray-200">{label}</span>;
}

function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
