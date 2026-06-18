import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, ClipboardList, Upload } from 'lucide-react';
import { useAuthContext } from '../../auth/authContext';
import { DataModePill } from '../../components/common/DataModePill';
import { isSupabaseConfigured } from '../../lib/demoMode';
import { loadObjections, type ObjectionRecord } from '../../services/objectionStore';
import { loadOpportunities, type CrmLiteOpportunity } from '../../services/opportunityStore';
import { loadSalesAssets, loadSalesAssetsForUser, type SalesAssetRecord } from '../../services/salesAssetStore';
import { hasLocalSampleData } from '../../utils/dataMode';
import {
  buildFirstPipelineReviewMetrics,
  buildFirstPipelineReviewProgress,
  getFirstPipelineReviewNextStep,
  getFirstPipelineReviewProgressPercent,
  loadFirstPipelineReviewOnboardingState,
  markFirstPipelineReviewStepComplete,
  resetFirstPipelineReviewOnboarding,
  type FirstPipelineReviewOnboardingState,
  type FirstPipelineReviewProgressStep,
} from '../../utils/firstPipelineReviewOnboarding';
import { canUsePipelineDefenseCloudStore, loadCloudBriefs } from '../../services/pipelineDefenseCloudStore';
import { loadPipelineDefenseBriefStore, type PipelineDefenseBrief } from '../../utils/pipelineDefenseStorage';
import { loadSampleDataset } from '../../utils/sampleData';

type FirstReviewData = {
  opportunities: CrmLiteOpportunity[];
  objections: ObjectionRecord[];
  assets: SalesAssetRecord[];
  briefs: PipelineDefenseBrief[];
};

const emptyData: FirstReviewData = {
  opportunities: [],
  objections: [],
  assets: [],
  briefs: [],
};

export function FirstPipelineReviewFlow() {
  const { user, loading: authLoading, isAuthenticated } = useAuthContext();
  const [data, setData] = useState<FirstReviewData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [state, setState] = useState<FirstPipelineReviewOnboardingState>(() => loadFirstPipelineReviewOnboardingState());

  const sampleDataActive = hasLocalSampleData();
  const dataUserId = sampleDataActive ? undefined : user?.id;

  async function reloadData() {
    setLoading(true);
    setMessage('');
    try {
      const nextData = await loadFirstReviewData(dataUserId);
      setData(nextData);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.debug('[FirstPipelineReviewFlow] load failed', { message: error instanceof Error ? error.message : 'Unknown error' });
      }
      setMessage('Cloud sync issue - your local copy is preserved.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!authLoading) {
      reloadData();
    }
    // reloadData is also used by button handlers; route-level data reload is driven by auth/data mode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, dataUserId]);

  const metrics = useMemo(() => buildFirstPipelineReviewMetrics({
    opportunities: data.opportunities,
    objections: data.objections,
    assets: data.assets,
    briefs: data.briefs,
  }), [data]);
  const progress = useMemo(() => buildFirstPipelineReviewProgress({
    state,
    metrics,
    includeDataSignals: !sampleDataActive,
  }), [metrics, sampleDataActive, state]);
  const nextStep = getFirstPipelineReviewNextStep(progress);
  const progressPercent = getFirstPipelineReviewProgressPercent(progress);

  const completeStep = (step: FirstPipelineReviewProgressStep['id']) => {
    setState(markFirstPipelineReviewStepComplete(step));
  };

  const handleLoadDemoSandbox = async () => {
    if (metrics.totalOpportunities > 0) {
      const confirmed = window.confirm('You already have local opportunity data. Loading demo data may mix with this browser workspace. Continue?');
      if (!confirmed) return;
    }

    loadSampleDataset();
    setState(markFirstPipelineReviewStepComplete('hasImportedOrAddedOpportunities'));
    setMessage(isAuthenticated
      ? 'Demo sandbox loaded locally only. It was not saved to your cloud account.'
      : 'Demo sandbox loaded locally in this browser.');
    await reloadData();
  };

  const handleReset = () => {
    setState(resetFirstPipelineReviewOnboarding());
    setMessage('First pipeline review guide reset.');
  };

  return (
    <div className="flex w-full max-w-none flex-col gap-5 px-4 py-5 sm:px-5 lg:px-6">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">First pipeline review</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-navy">Prepare your first Pipeline Defense Brief</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
            Your personal pipeline review and sales memory OS. Import your pipeline, capture what happened, find weak deals, and prepare a manager-ready Pipeline Defense Brief.
          </p>
        </div>
        <DataModePill
          compact
          isLoading={authLoading || loading}
          isAuthenticated={isAuthenticated}
          isSupabaseConfigured={isSupabaseConfigured}
          cloudAvailable={isSupabaseConfigured}
          syncError={message.startsWith('Cloud sync issue') ? message : null}
          hasSampleData={sampleDataActive}
        />
      </header>

      {message && (
        <p className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800">
          {message}
        </p>
      )}

      <section className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <InfoCard
          title="Private working copy"
          body="Memoire does not replace your CRM. It helps you review and defend your pipeline with a private, read-only working copy."
        />
        <InfoCard
          title="No CRM writeback"
          body="CSV import is for local review and enrichment. Salesforce, HubSpot, Excel, or CRM exports remain separate from Memoire."
        />
        <InfoCard
          title="Manager-ready output"
          body="The goal is a weekly review pack that separates defensible deals from rescue, monitor, and downgrade candidates."
        />
      </section>

      <section className="rounded-xl border border-blue-100 bg-blue-50/70 p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-bold text-brand-blue">{progressPercent}% complete</p>
            <h2 className="mt-1 text-xl font-bold text-navy">{state.completedAt ? 'First Pipeline Review Ready' : `Next step: ${nextStep.title}`}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-blue-950">
              {state.completedAt
                ? 'Your first review path is complete. Keep using Quick Capture after customer interactions so the next brief is easier.'
                : nextStep.description}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to={nextStep.href} className="inline-flex items-center gap-2 rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">
              Continue
              <ArrowRight className="h-4 w-4" />
            </Link>
            <button type="button" onClick={handleReset} className="rounded-full border border-blue-200 bg-white px-4 py-2 text-sm font-bold text-blue-800">
              Reset guide
            </button>
          </div>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white">
          <div className="h-full rounded-full bg-brand-blue transition-all" style={{ width: `${progressPercent}%` }} />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <MetricCard label="Active opportunities" value={metrics.activeOpportunities} />
        <MetricCard label="Need enrichment" value={metrics.opportunitiesNeedingEnrichment} tone={metrics.opportunitiesNeedingEnrichment ? 'amber' : 'green'} />
        <MetricCard label="Open objections" value={metrics.unresolvedObjections} tone={metrics.unresolvedObjections ? 'red' : 'green'} />
        <MetricCard label="Defense briefs" value={metrics.userBriefCount} tone={metrics.userBriefCount ? 'green' : 'blue'} />
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        {progress.map((step, index) => (
          <StepCard
            key={step.id}
            step={step}
            number={index + 1}
            metrics={metrics}
            onComplete={() => completeStep(step.id)}
            onLoadDemo={handleLoadDemoSandbox}
          />
        ))}
      </section>

      <section id="gaps" className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-brand-blue" />
              <h2 className="text-lg font-bold text-navy">Top gaps to review before manager review</h2>
            </div>
            <p className="mt-1 text-sm text-gray-500">These are rule-based signals from current opportunities, objections, and proof assets.</p>
          </div>
          <button
            type="button"
            onClick={() => completeStep('hasViewedGaps')}
            className="inline-flex w-fit rounded-full bg-navy px-4 py-2 text-sm font-bold text-white"
          >
            I reviewed top gaps
          </button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <MetricCard label="No value" value={metrics.missingValue} tone={metrics.missingValue ? 'amber' : 'green'} compact />
          <MetricCard label="No close" value={metrics.missingClosePeriod} tone={metrics.missingClosePeriod ? 'amber' : 'green'} compact />
          <MetricCard label="No evidence" value={metrics.missingEvidence} tone={metrics.missingEvidence ? 'red' : 'green'} compact />
          <MetricCard label="No action" value={metrics.missingNextAction} tone={metrics.missingNextAction ? 'red' : 'green'} compact />
          <MetricCard label="No buyer" value={metrics.missingEconomicBuyer} tone={metrics.missingEconomicBuyer ? 'amber' : 'green'} compact />
          <MetricCard label="No champion" value={metrics.missingChampion} tone={metrics.missingChampion ? 'amber' : 'green'} compact />
          <MetricCard label="Unclear process" value={metrics.unclearDecisionProcess} tone={metrics.unclearDecisionProcess ? 'amber' : 'green'} compact />
          <MetricCard label="Proof gaps" value={metrics.missingProofAssets} tone={metrics.missingProofAssets ? 'amber' : 'green'} compact />
        </div>
      </section>

      {state.completedAt && (
        <section className="rounded-xl border border-emerald-100 bg-emerald-50 p-5 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-700" />
                <h2 className="text-lg font-bold text-emerald-950">First Pipeline Review Ready</h2>
              </div>
              <p className="mt-1 text-sm leading-6 text-emerald-900/80">
                Your first review flow is complete. Suggested next habit: use Quick Capture after every customer interaction.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link to="/app/pipeline-defense" className="rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">Go to Pipeline Defense</Link>
              <Link to="/app/dashboard" className="rounded-full border border-emerald-200 bg-white px-4 py-2 text-sm font-bold text-emerald-800">Continue to Dashboard</Link>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function StepCard({
  step,
  number,
  metrics,
  onComplete,
  onLoadDemo,
}: {
  step: FirstPipelineReviewProgressStep;
  number: number;
  metrics: ReturnType<typeof buildFirstPipelineReviewMetrics>;
  onComplete: () => void;
  onLoadDemo: () => void;
}) {
  return (
    <article className={`rounded-xl border p-5 shadow-sm ${step.done ? 'border-emerald-100 bg-emerald-50/70' : 'border-gray-200 bg-white'}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy text-sm font-black text-white">{number}</span>
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${step.done ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
          {step.status}
        </span>
      </div>
      <h3 className="mt-4 text-base font-bold text-navy">{step.title}</h3>
      <p className="mt-2 min-h-[72px] text-sm leading-6 text-gray-600">{step.description}</p>

      {step.id === 'hasImportedOrAddedOpportunities' && (
        <div className="mt-4 space-y-2">
          <Link to="/app/opportunities?import=csv" className="flex items-center justify-between rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm font-bold text-brand-blue">
            <span className="inline-flex items-center gap-2"><Upload className="h-4 w-4" /> Import CSV</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
          <button type="button" onClick={onLoadDemo} className="flex w-full items-center justify-between rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">
            Use Demo Sandbox
            <ArrowRight className="h-4 w-4" />
          </button>
          <Link to="/app/opportunities?new=1" className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-700">
            Add opportunity manually
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}

      {step.id !== 'hasImportedOrAddedOpportunities' && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Link to={step.href} className="inline-flex rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">
            {step.cta}
          </Link>
          {!step.done && (
            <button type="button" onClick={onComplete} className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700">
              Mark done
            </button>
          )}
        </div>
      )}

      {step.id === 'hasReviewedOpportunities' && (
        <p className="mt-3 text-xs font-semibold text-gray-500">{metrics.totalOpportunities} opportunities available for review.</p>
      )}
      {step.id === 'hasGeneratedPipelineDefense' && (
        <p className="mt-3 text-xs font-semibold text-gray-500">Select opportunities, generate a preview, then create the brief.</p>
      )}
    </article>
  );
}

function InfoCard({ title, body }: { title: string; body: string }) {
  return (
    <article className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-bold text-navy">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-gray-600">{body}</p>
    </article>
  );
}

function MetricCard({
  label,
  value,
  tone = 'blue',
  compact = false,
}: {
  label: string;
  value: number;
  tone?: 'blue' | 'green' | 'amber' | 'red';
  compact?: boolean;
}) {
  return (
    <div className={`rounded-lg border border-gray-100 bg-white ${compact ? 'p-3' : 'p-4'} shadow-sm`}>
      <p className="text-xs font-bold uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`mt-2 inline-flex rounded-full px-2.5 py-1 font-black ${compact ? 'text-lg' : 'text-2xl'} ${toneClass(tone)}`}>{value}</p>
    </div>
  );
}

function toneClass(tone: 'blue' | 'green' | 'amber' | 'red') {
  return {
    blue: 'bg-blue-50 text-brand-blue',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-700',
  }[tone];
}

async function loadFirstReviewData(userId?: string | null): Promise<FirstReviewData> {
  const [opportunities, objections, assets, briefs] = await Promise.all([
    loadOpportunities(userId),
    loadObjections(userId),
    userId ? loadSalesAssetsForUser(userId) : Promise.resolve(loadSalesAssets()),
    loadPipelineBriefs(userId),
  ]);

  return { opportunities, objections, assets, briefs };
}

async function loadPipelineBriefs(userId?: string | null) {
  if (userId && canUsePipelineDefenseCloudStore()) {
    try {
      return await loadCloudBriefs(userId);
    } catch {
      return loadPipelineDefenseBriefStore().briefs;
    }
  }

  return loadPipelineDefenseBriefStore().briefs;
}
