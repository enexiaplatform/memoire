import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Clipboard, Printer, Trash2 } from 'lucide-react';
import { useAuthContext } from '../../auth/authContext';
import { hasLocalSampleData } from '../../utils/dataMode';
import { markPipelineReviewHabitStepComplete } from '../../utils/pipelineReviewHabit';
import {
  deleteReviewPack,
  formatReviewPackDate,
  generateReviewPackMarkdown,
  getReviewPackById,
  loadReviewPacksForWorkspace,
  REVIEW_PACKS_UPDATED_EVENT,
  type ReviewPackSnapshot,
} from '../../utils/reviewPacks';

export function PipelineReviewPackPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, loading: accountLoading } = useAuthContext();
  const [pack, setPack] = useState<ReviewPackSnapshot | null>(() => getReviewPackById(id));
  const [loadingPack, setLoadingPack] = useState(true);
  const [copyStatus, setCopyStatus] = useState('');

  useEffect(() => {
    if (accountLoading) return;
    let cancelled = false;
    setLoadingPack(true);

    loadReviewPacksForWorkspace(user?.id, hasLocalSampleData())
      .then((packs) => {
        if (cancelled) return;
        setPack(packs.find((item) => item.id === id) || null);
      })
      .finally(() => {
        if (!cancelled) setLoadingPack(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accountLoading, id, user?.id]);

  useEffect(() => {
    const handleUpdate = () => setPack(getReviewPackById(id));
    window.addEventListener(REVIEW_PACKS_UPDATED_EVENT, handleUpdate);
    return () => window.removeEventListener(REVIEW_PACKS_UPDATED_EVENT, handleUpdate);
  }, [id]);

  const copyManagerSummary = async () => {
    if (!pack) return;
    try {
      await navigator.clipboard.writeText(pack.managerSummary);
      markPipelineReviewHabitStepComplete('copiedManagerSummaryAt');
      setCopyStatus('Manager summary copied.');
    } catch {
      setCopyStatus('Clipboard failed. The manager summary is visible below.');
    }
  };

  const copyMarkdown = async () => {
    if (!pack) return;
    try {
      await navigator.clipboard.writeText(pack.shareReadyMarkdown || generateReviewPackMarkdown(pack));
      setCopyStatus('Review pack Markdown copied.');
    } catch {
      setCopyStatus('Clipboard failed. Use the visible pack content to copy manually.');
    }
  };

  const deletePack = () => {
    if (!pack) return;
    const sampleDataActive = hasLocalSampleData();
    const confirmed = window.confirm(
      sampleDataActive
        ? 'Delete this saved review pack from this browser?'
        : 'Delete this saved review pack from your workspace?',
    );
    if (!confirmed) return;
    deleteReviewPack(pack.id, { syncCloud: !sampleDataActive });
    setPack(null);
    navigate('/app/pipeline-defense');
  };

  if (loadingPack) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-6 sm:px-6">
        <Link to="/app/pipeline-defense" className="inline-flex w-fit items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50">
          <ArrowLeft className="h-4 w-4" />
          Back to Pipeline Defense
        </Link>
        <section className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-bold text-navy">Loading review pack...</h1>
          <p className="mt-2 text-sm text-gray-500">Checking this browser and your workspace sync.</p>
        </section>
      </div>
    );
  }

  if (!pack) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-6 sm:px-6">
        <Link to="/app/pipeline-defense" className="inline-flex w-fit items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50">
          <ArrowLeft className="h-4 w-4" />
          Back to Pipeline Defense
        </Link>
        <section className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-bold text-navy">Review pack not found</h1>
          <p className="mt-2 text-sm text-gray-500">This saved snapshot may have been deleted from your workspace.</p>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link to="/app/pipeline-defense" className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50">
          <ArrowLeft className="h-4 w-4" />
          Back to Pipeline Defense
        </Link>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={copyManagerSummary} className="inline-flex items-center gap-2 rounded-full bg-navy px-4 py-2 text-sm font-bold text-white hover:bg-navy/90">
            <Clipboard className="h-4 w-4" />
            Copy Manager Summary
          </button>
          <button type="button" onClick={copyMarkdown} className="inline-flex items-center gap-2 rounded-full border border-brand-blue bg-white px-4 py-2 text-sm font-bold text-brand-blue hover:bg-blue-50">
            <Clipboard className="h-4 w-4" />
            Copy Review Pack Markdown
          </button>
          <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50">
            <Printer className="h-4 w-4" />
            Print / Save PDF
          </button>
          <button type="button" onClick={deletePack} className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-700 hover:bg-red-100">
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        </div>
      </div>

      {copyStatus && (
        <p className="no-print rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800">
          {copyStatus}
        </p>
      )}

      <ReviewPackReadOnly pack={pack} />
    </div>
  );
}

export function ReviewPackReadOnly({ pack }: { pack: ReviewPackSnapshot }) {
  const defendDeals = pack.deals.filter((deal) => deal.defenseStatus === 'Defend');
  const rescueDeals = pack.deals.filter((deal) => deal.defenseStatus === 'Rescue');
  const downgradeDeals = pack.deals.filter((deal) => deal.defenseStatus === 'Downgrade');

  return (
    <article className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <header className="border-b border-gray-200 pb-5">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Saved review pack</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-navy">{pack.title}</h1>
        <dl className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <PackMeta label="Week" value={pack.weekId} />
          <PackMeta label="Generated" value={formatReviewPackDate(pack.generatedAt)} />
          <PackMeta label="Saved" value={formatReviewPackDate(pack.createdAt)} />
          <PackMeta label="Pipeline value" value={pack.totalValue || 'Not captured'} />
        </dl>
      </header>

      <section className="mt-6">
        <h2 className="text-xl font-bold text-navy">Executive Summary</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-4">
          <PackMetric label="Deals" value={pack.dealCount} />
          <PackMetric label="Defend" value={pack.defendCount} />
          <PackMetric label="Rescue" value={pack.rescueCount} />
          <PackMetric label="Downgrade" value={pack.downgradeCount} />
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-xl font-bold text-navy">Manager Review Summary</h2>
        <p className="mt-3 whitespace-pre-line rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-950">
          {pack.managerSummary || 'No manager summary captured.'}
        </p>
      </section>

      <section className="mt-6">
        <h2 className="text-xl font-bold text-navy">Deal Defense Table</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-3 py-2">Deal</th>
                <th className="px-3 py-2">Forecast</th>
                <th className="px-3 py-2">Defense</th>
                <th className="px-3 py-2">Evidence / gap</th>
                <th className="px-3 py-2">Next action</th>
              </tr>
            </thead>
            <tbody>
              {pack.deals.map((deal) => (
                <tr key={`${deal.accountName}-${deal.opportunityName}`} className="border-b border-gray-100 align-top">
                  <td className="px-3 py-3">
                    <strong className="text-navy">{deal.accountName}</strong>
                    <p className="mt-1 text-gray-600">{deal.opportunityName}</p>
                    <p className="mt-1 text-xs text-gray-400">{deal.stage || 'No stage'} / {deal.value || 'No value'}</p>
                  </td>
                  <td className="px-3 py-3">{deal.forecastCategory || 'Not captured'}</td>
                  <td className="px-3 py-3">{deal.defenseStatus || 'Not captured'}</td>
                  <td className="px-3 py-3">
                    <p><strong>Evidence:</strong> {deal.evidence || 'Not captured'}</p>
                    <p className="mt-1"><strong>Gap:</strong> {deal.gap || 'Not captured'}</p>
                  </td>
                  <td className="px-3 py-3">{deal.nextAction || 'Not captured'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-3">
        <DealGroup title="Deals to Defend" deals={defendDeals} />
        <DealGroup title="Deals to Rescue" deals={rescueDeals} />
        <DealGroup title="Deals to Downgrade" deals={downgradeDeals} />
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <ListPanel title="Top Missing Proof / MEDDIC Gaps" items={pack.topGaps} empty="No top gaps captured." />
        <ListPanel title="Next Defense Actions" items={pack.nextDefenseActions} empty="No next defense actions captured." />
      </section>

      <section className="mt-6">
        <h2 className="text-xl font-bold text-navy">Quality Checklist Summary</h2>
        <p className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm leading-6 text-gray-700">
          {pack.qualityChecklistSummary || 'No quality checklist summary captured.'}
        </p>
      </section>
    </article>
  );
}

function PackMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
      <dt className="text-xs font-bold uppercase tracking-wide text-gray-400">{label}</dt>
      <dd className="mt-1 text-sm font-bold text-navy">{value}</dd>
    </div>
  );
}

function PackMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-blue-700">{label}</p>
      <p className="mt-1 text-2xl font-black text-brand-blue">{value}</p>
    </div>
  );
}

function DealGroup({ title, deals }: { title: string; deals: ReviewPackSnapshot['deals'] }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <h3 className="font-bold text-navy">{title}</h3>
      {deals.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500">No deals in this group.</p>
      ) : (
        <ul className="mt-3 space-y-2 text-sm text-gray-700">
          {deals.map((deal) => (
            <li key={`${deal.accountName}-${deal.opportunityName}`}>{deal.accountName} / {deal.opportunityName}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ListPanel({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <h3 className="font-bold text-navy">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500">{empty}</p>
      ) : (
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-gray-700">
          {items.map((item) => <li key={item}>{item}</li>)}
        </ul>
      )}
    </div>
  );
}
