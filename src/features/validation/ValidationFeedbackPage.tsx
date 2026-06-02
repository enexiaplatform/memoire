import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ClipboardList, Copy, MessageSquareText } from 'lucide-react';
import {
  buildDemoFeedbackSummary,
  generateInterviewScriptText,
  generateValidationSummaryMarkdown,
  loadDemoFeedback,
  type DemoFeedbackRecord,
} from '../../utils/demoFeedback';
import {
  generateEarlyAccessRequestSummary,
  loadEarlyAccessRequests,
  type EarlyAccessRequestRecord,
} from '../../utils/earlyAccessRequests';

export function ValidationFeedbackPage() {
  const [feedback] = useState<DemoFeedbackRecord[]>(() => loadDemoFeedback());
  const [earlyAccessRequests] = useState<EarlyAccessRequestRecord[]>(() => loadEarlyAccessRequests());
  const [copyMessage, setCopyMessage] = useState('');
  const summary = useMemo(() => buildDemoFeedbackSummary(feedback), [feedback]);

  const copyText = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyMessage(`Copied ${label}.`);
    } catch {
      setCopyMessage(text);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6">
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
              Requests are saved only in this browser. Copy summaries before clearing browser data.
            </p>
          </div>
          <Link to="/request-access" className="rounded-full border border-blue-100 bg-blue-50 px-4 py-2 text-sm font-bold text-brand-blue">
            Open Request Form
          </Link>
        </div>
        {earlyAccessRequests.length === 0 ? (
          <p className="mt-5 rounded-lg border border-gray-100 bg-gray-50 p-4 text-sm text-gray-500">No early access requests saved locally yet.</p>
        ) : (
          <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {earlyAccessRequests.map((request) => (
              <EarlyAccessRequestCard
                key={request.id}
                request={request}
                onCopy={() => copyText('early access request', generateEarlyAccessRequestSummary(request))}
              />
            ))}
          </div>
        )}
      </section>

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

function EarlyAccessRequestCard({ request, onCopy }: { request: EarlyAccessRequestRecord; onCopy: () => void }) {
  return (
    <article className="rounded-lg border border-gray-100 bg-gray-50 p-4">
      <div className="flex flex-wrap gap-2">
        <Badge label={request.role} />
        <Badge label={request.segment} />
        <Badge label={request.budgetOwner} />
      </div>
      <h3 className="mt-3 text-base font-bold text-navy">{request.name || 'Unnamed request'}</h3>
      <p className="mt-1 text-sm text-gray-600">{request.workEmail || 'No email provided'}</p>
      <p className="mt-2 text-sm text-gray-700"><span className="font-bold">Pain:</span> {request.biggestPain}</p>
      <p className="mt-1 text-sm text-gray-700"><span className="font-bold">Interested:</span> {request.interestedMost}</p>
      {request.currentTool && <p className="mt-1 text-sm text-gray-700"><span className="font-bold">Tool:</span> {request.currentTool}</p>}
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
