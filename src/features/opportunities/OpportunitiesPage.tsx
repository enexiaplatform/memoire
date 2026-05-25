import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  FileText,
  Filter,
  Pencil,
  Plus,
  Save,
  Search,
  Target,
  Trash2,
  X,
} from 'lucide-react';
import { useAuthContext } from '../../auth/authContext';
import { DataModePill } from '../../components/common/DataModePill';
import { isSupabaseConfigured } from '../../lib/demoMode';
import { hasLocalSampleData } from '../../utils/dataMode';
import {
  canUseOpportunityCloudStore,
  createOpportunity,
  decisionRecommendations,
  deleteOpportunity,
  emptyOpportunityInput,
  forecastEvidenceCategories,
  loadOpportunities,
  opportunityStages,
  opportunityStatuses,
  updateOpportunity,
  type CrmLiteOpportunity,
  type OpportunityFormInput,
} from '../../services/opportunityStore';
import { analyzePipelineQuality, analyzeOpportunityQuality } from '../../utils/opportunityQuality';
import { loadSalesActivities, type SalesActivityRecord } from '../../services/salesActivityStore';
import {
  createPipelineDefenseBrief,
  loadPipelineDefenseBriefStore,
  savePipelineDefenseBriefStore,
  type PipelineDefenseBrief,
} from '../../utils/pipelineDefenseStorage';
import { canUsePipelineDefenseCloudStore, createCloudBrief } from '../../services/pipelineDefenseCloudStore';
import {
  generatePipelineDefenseBriefFromOpportunities,
  mapOpportunityToPipelineDefenseDeal,
} from '../../utils/opportunityToPipelineBrief';
import { getUserDisplayName as getWorkspaceUserDisplayName } from '../../utils/userDisplay';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type BriefPreviewMetadata = {
  title: string;
  weekLabel: string;
  salesOwner: string;
  scope: string;
};

const allFilter = 'All';

export function OpportunitiesPage() {
  const { user, loading: authLoading, isAuthenticated } = useAuthContext();
  const navigate = useNavigate();
  const [opportunities, setOpportunities] = useState<CrmLiteOpportunity[]>([]);
  const [activities, setActivities] = useState<SalesActivityRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState(allFilter);
  const [forecastFilter, setForecastFilter] = useState(allFilter);
  const [recommendationFilter, setRecommendationFilter] = useState(allFilter);
  const [statusFilter, setStatusFilter] = useState(allFilter);
  const [editingOpportunity, setEditingOpportunity] = useState<CrmLiteOpportunity | null>(null);
  const [form, setForm] = useState<OpportunityFormInput>(emptyOpportunityInput);
  const [panelMode, setPanelMode] = useState<'closed' | 'add' | 'edit'>('closed');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [message, setMessage] = useState('');
  const [selectedOpportunityIds, setSelectedOpportunityIds] = useState<string[]>([]);
  const [previewOpportunities, setPreviewOpportunities] = useState<CrmLiteOpportunity[]>([]);
  const [briefMetadata, setBriefMetadata] = useState<BriefPreviewMetadata>(() => buildDefaultBriefMetadata(null));
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [briefCreateState, setBriefCreateState] = useState<SaveState>('idle');
  const [briefCreateMessage, setBriefCreateMessage] = useState('');

  const refreshOpportunities = async () => {
    setLoading(true);
    const [loaded, loadedActivities] = await Promise.all([
      loadOpportunities(user?.id),
      loadSalesActivities(user?.id),
    ]);
    setOpportunities(loaded);
    setActivities(loadedActivities);
    setLoading(false);
  };

  useEffect(() => {
    refreshOpportunities();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const quality = useMemo(() => analyzePipelineQuality(opportunities, activities), [activities, opportunities]);

  const selectedOpportunities = useMemo(() => {
    const selectedIds = new Set(selectedOpportunityIds);
    return opportunities.filter((opportunity) => selectedIds.has(opportunity.id));
  }, [opportunities, selectedOpportunityIds]);

  const visibleOpportunities = useMemo(() => {
    const query = search.trim().toLowerCase();
    return opportunities.filter((opportunity) => {
      const searchable = [
        opportunity.accountName,
        opportunity.opportunityName,
        opportunity.productOrSolution,
        opportunity.nextAction,
        opportunity.evidence,
      ].join(' ').toLowerCase();

      return (
        (!query || searchable.includes(query)) &&
        (stageFilter === allFilter || opportunity.stage === stageFilter) &&
        (forecastFilter === allFilter || opportunity.forecastEvidenceCategory === forecastFilter) &&
        (recommendationFilter === allFilter || opportunity.decisionRecommendation === recommendationFilter) &&
        (statusFilter === allFilter || opportunity.status === statusFilter)
      );
    });
  }, [forecastFilter, opportunities, recommendationFilter, search, stageFilter, statusFilter]);

  const openAddPanel = () => {
    setEditingOpportunity(null);
    setForm(emptyOpportunityInput);
    setPanelMode('add');
    setSaveState('idle');
    setMessage('');
  };

  const openEditPanel = (opportunity: CrmLiteOpportunity) => {
    setEditingOpportunity(opportunity);
    setForm(opportunityToForm(opportunity));
    setPanelMode('edit');
    setSaveState('idle');
    setMessage('');
  };

  const closePanel = () => {
    setPanelMode('closed');
    setEditingOpportunity(null);
    setSaveState('idle');
    setMessage('');
  };

  const handleSave = async () => {
    if (!form.accountName.trim() || !form.opportunityName.trim()) {
      setSaveState('error');
      setMessage('Add account and opportunity names first.');
      return;
    }

    setSaveState('saving');
    setMessage('Saving opportunity...');
    const result = panelMode === 'edit' && editingOpportunity
      ? await updateOpportunity(editingOpportunity, form, user?.id)
      : await createOpportunity(form, user?.id);

    setOpportunities((current) => [
      result.opportunity,
      ...current.filter((item) => item.id !== result.opportunity.id),
    ]);
    setEditingOpportunity(result.opportunity);
    setPanelMode('edit');
    setForm(opportunityToForm(result.opportunity));
    setSaveState(result.warning ? 'error' : 'saved');
    setMessage(result.warning || (result.mode === 'cloud' ? 'Synced to your account.' : 'Saved locally in this browser.'));
  };

  const handleDelete = async (opportunity: CrmLiteOpportunity) => {
    const confirmed = window.confirm(`Delete ${opportunity.accountName} / ${opportunity.opportunityName}?`);
    if (!confirmed) return;

    try {
      await deleteOpportunity(opportunity, user?.id);
      setOpportunities((current) => current.filter((item) => item.id !== opportunity.id));
      setSelectedOpportunityIds((current) => current.filter((id) => id !== opportunity.id));
      if (editingOpportunity?.id === opportunity.id) closePanel();
      setSaveState('saved');
      setMessage('Opportunity deleted.');
    } catch (error) {
      if (import.meta.env.DEV) {
        console.debug('[Opportunities] delete failed', { message: error instanceof Error ? error.message : 'Unknown error' });
      }
      setSaveState('error');
      setMessage('Cloud sync issue - your local copy is preserved.');
    }
  };

  const toggleOpportunitySelection = (opportunityId: string) => {
    setSelectedOpportunityIds((current) => (
      current.includes(opportunityId)
        ? current.filter((id) => id !== opportunityId)
        : [...current, opportunityId]
    ));
  };

  const openDefenseBriefPreview = (items = selectedOpportunities) => {
    if (items.length === 0) {
      setBriefCreateState('error');
      setBriefCreateMessage('Select at least one opportunity to generate a brief.');
      return;
    }

    setPreviewOpportunities(items);
    setBriefMetadata(buildDefaultBriefMetadata(user));
    setBriefCreateState('idle');
    setBriefCreateMessage('');
    setIsPreviewOpen(true);
  };

  const closeDefenseBriefPreview = () => {
    setIsPreviewOpen(false);
    setPreviewOpportunities([]);
    setBriefCreateState('idle');
    setBriefCreateMessage('');
  };

  const createDefenseBriefFromPreview = async () => {
    if (previewOpportunities.length === 0) {
      setBriefCreateState('error');
      setBriefCreateMessage('Select at least one opportunity to generate a brief.');
      return;
    }

    setBriefCreateState('saving');
    setBriefCreateMessage('Creating Pipeline Defense Brief...');
    const draftBrief = generatePipelineDefenseBriefFromOpportunities(previewOpportunities, briefMetadata);

    try {
      const createdBrief = user?.id && canUsePipelineDefenseCloudStore()
        ? await createCloudBrief(draftBrief, user.id)
        : createPipelineDefenseBrief(draftBrief);

      persistCreatedBriefLocally(createdBrief);
      setSelectedOpportunityIds([]);
      setBriefCreateState('saved');
      setBriefCreateMessage('Brief created. Opening Pipeline Defense...');
      window.setTimeout(() => navigate('/app/pipeline-defense'), 150);
    } catch (error) {
      const localBrief = createPipelineDefenseBrief(draftBrief);
      persistCreatedBriefLocally(localBrief);
      setSelectedOpportunityIds([]);
      setBriefCreateState('error');
      if (import.meta.env.DEV) {
        console.debug('[Opportunities] defense brief cloud create failed', { message: error instanceof Error ? error.message : 'Unknown error' });
      }
      setBriefCreateMessage('Cloud sync issue - your local copy is preserved.');
      window.setTimeout(() => navigate('/app/pipeline-defense'), 700);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Opportunities</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-navy">Opportunities</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
            CRM-lite deal workspace for your active B2B pipeline. Track deal quality, forecast evidence, next actions, and objection debt without connecting an external CRM.
          </p>
        </div>
        <DataModePill
          compact
          isLoading={authLoading}
          isAuthenticated={isAuthenticated}
          isSupabaseConfigured={isSupabaseConfigured}
          cloudAvailable={canUseOpportunityCloudStore(user?.id)}
          hasSampleData={hasLocalSampleData()}
        />
      </header>

      <section className="rounded-lg border border-blue-100 bg-blue-50/70 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-blue-950">
              Generate a Pipeline Defense Brief from selected opportunities.
            </p>
            <p className="mt-1 text-sm text-blue-800">
              This is rule-based and creates a new brief. Existing briefs and opportunities are not overwritten.
            </p>
          </div>
          <button
            type="button"
            onClick={() => openDefenseBriefPreview()}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-blue px-4 py-2 text-sm font-bold text-white"
          >
            <FileText className="h-4 w-4" />
            Generate Defense Brief{selectedOpportunities.length > 0 ? ` (${selectedOpportunities.length})` : ''}
          </button>
        </div>
        {briefCreateMessage && !isPreviewOpen && (
          <p className={`mt-3 rounded-lg px-3 py-2 text-sm font-semibold ${
            briefCreateState === 'error' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
          }`}>
            {briefCreateMessage}
          </p>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <button
            type="button"
            onClick={openAddPanel}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-navy px-4 py-2 text-sm font-bold text-white"
          >
            <Plus className="h-4 w-4" />
            Add Opportunity
          </button>

          <div className="grid flex-1 grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-[1.4fr_repeat(4,1fr)]">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search account, opportunity, action..."
                className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
              />
            </label>
            <FilterSelect label="Stage" value={stageFilter} onChange={setStageFilter} options={[allFilter, ...opportunityStages]} />
            <FilterSelect label="Forecast" value={forecastFilter} onChange={setForecastFilter} options={[allFilter, ...forecastEvidenceCategories]} />
            <FilterSelect label="Decision" value={recommendationFilter} onChange={setRecommendationFilter} options={[allFilter, ...decisionRecommendations]} />
            <FilterSelect label="Status" value={statusFilter} onChange={setStatusFilter} options={[allFilter, ...opportunityStatuses]} />
          </div>
        </div>
      </section>

      <PipelineQualitySummary quality={quality} />

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_420px]">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-navy">Opportunity list</h2>
              <p className="text-sm text-gray-500">{visibleOpportunities.length} visible of {opportunities.length} total.</p>
            </div>
          </div>

          {loading ? (
            <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm font-semibold text-gray-500 shadow-sm">
              Loading opportunities...
            </div>
          ) : opportunities.length === 0 ? (
            <EmptyState onAdd={openAddPanel} />
          ) : visibleOpportunities.length === 0 ? (
            <div className="rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm">
              <p className="text-sm font-semibold text-gray-900">No opportunities match these filters.</p>
              <p className="mt-1 text-sm text-gray-500">Clear search or filters to review your full pipeline.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {visibleOpportunities.map((opportunity) => (
                <OpportunityCard
                  key={opportunity.id}
                  opportunity={opportunity}
                  selected={selectedOpportunityIds.includes(opportunity.id)}
                  linkedActivities={getLinkedActivities(opportunity, activities)}
                  onToggleSelection={() => toggleOpportunitySelection(opportunity.id)}
                  onEdit={() => openEditPanel(opportunity)}
                  onDelete={() => handleDelete(opportunity)}
                />
              ))}
            </div>
          )}
        </div>

        <OpportunityPanel
          mode={panelMode}
          form={form}
          saveState={saveState}
          message={message}
          editingOpportunity={editingOpportunity}
          linkedActivities={editingOpportunity ? getLinkedActivities(editingOpportunity, activities) : []}
          onChange={setForm}
          onSave={handleSave}
          onClose={closePanel}
          onDelete={editingOpportunity ? () => handleDelete(editingOpportunity) : undefined}
          onCreateDefenseBrief={editingOpportunity ? () => openDefenseBriefPreview([editingOpportunity]) : undefined}
        />
      </section>

      {isPreviewOpen && (
        <DefenseBriefPreviewModal
          opportunities={previewOpportunities}
          metadata={briefMetadata}
          onMetadataChange={setBriefMetadata}
          createState={briefCreateState}
          message={briefCreateMessage}
          onCreate={createDefenseBriefFromPreview}
          onClose={closeDefenseBriefPreview}
        />
      )}
    </div>
  );
}

function PipelineQualitySummary({ quality }: { quality: ReturnType<typeof analyzePipelineQuality> }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-brand-blue" />
            <h2 className="text-lg font-bold text-navy">Pipeline Quality Summary</h2>
          </div>
          <p className="mt-1 text-sm leading-6 text-gray-500">
            Rule-based checks for missing decision context, objection debt, weak evidence, stale next actions, and forecast quality.
          </p>
        </div>
        <StatusBadge highRisk={quality.reviews.filter((review) => review.status === 'High risk').length} cleanup={quality.reviews.filter((review) => review.status === 'Needs cleanup').length} />
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-8">
        <Metric label="Total" value={quality.totalOpportunities} />
        <Metric label="Active" value={quality.activeOpportunities} />
        <Metric label="Active value" value={formatMoney(quality.estimatedActiveValue)} />
        <Metric label="Defensible" value={quality.defensibleDeals} tone="green" />
        <Metric label="Weak / Hope" value={quality.weakHopeUnsupportedDeals} tone={quality.weakHopeUnsupportedDeals ? 'amber' : 'green'} />
        <Metric label="No action" value={quality.missingNextActionCount} tone={quality.missingNextActionCount ? 'red' : 'green'} />
        <Metric label="Objections" value={quality.objectionDebtCount} tone={quality.objectionDebtCount ? 'red' : 'green'} />
        <Metric label="No DM" value={quality.missingDecisionMakerCount} tone={quality.missingDecisionMakerCount ? 'amber' : 'green'} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Metric label="Missing close period" value={quality.missingClosePeriodCount} tone={quality.missingClosePeriodCount ? 'amber' : 'green'} />
        <Metric label="Unsupported / Hope-based" value={quality.unsupportedHopeBasedCount} tone={quality.unsupportedHopeBasedCount ? 'red' : 'green'} />
        <Metric label="Rescue / Downgrade" value={quality.rescueDowngradeCount} tone={quality.rescueDowngradeCount ? 'red' : 'green'} />
      </div>

      <div className="mt-5 rounded-lg border border-gray-100 bg-gray-50 p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Recommended cleanup</p>
        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
          {quality.cleanupActions.map((action) => (
            <div key={action} className="rounded-lg bg-white px-3 py-2 text-sm font-semibold leading-6 text-gray-800 ring-1 ring-gray-100">
              {action}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function OpportunityCard({
  opportunity,
  selected,
  linkedActivities,
  onToggleSelection,
  onEdit,
  onDelete,
}: {
  opportunity: CrmLiteOpportunity;
  selected: boolean;
  linkedActivities: SalesActivityRecord[];
  onToggleSelection: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const quality = analyzeOpportunityQuality(opportunity, linkedActivities);

  return (
    <article className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 gap-3">
          <label className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-gray-300 bg-white">
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggleSelection}
              aria-label={`Select ${opportunity.accountName} / ${opportunity.opportunityName}`}
              className="h-4 w-4 accent-brand-blue"
            />
          </label>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-400">{opportunity.accountName || 'No account'}</p>
            <h3 className="mt-1 text-lg font-bold text-navy">{opportunity.opportunityName || 'Untitled opportunity'}</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge label={opportunity.stage} />
              <Badge label={opportunity.status} tone={opportunity.status === 'Active' ? 'blue' : opportunity.status === 'Won' ? 'green' : 'gray'} />
              <Badge label={opportunity.forecastEvidenceCategory} tone={forecastTone(opportunity.forecastEvidenceCategory)} />
              <Badge label={opportunity.decisionRecommendation} tone={decisionTone(opportunity.decisionRecommendation)} />
              <Badge label={quality.status} tone={quality.status === 'High risk' ? 'red' : quality.status === 'Needs cleanup' ? 'amber' : 'green'} />
            </div>
          </div>
        </div>

        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm font-bold text-gray-700 hover:bg-blue-50 hover:text-brand-blue"
          >
            <Pencil className="h-4 w-4" />
            Edit
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex items-center gap-2 rounded-full border border-red-100 bg-red-50 px-3 py-1.5 text-sm font-bold text-red-700 hover:bg-red-100"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Fact label="Value" value={opportunity.estimatedValue ? formatMoney(opportunity.estimatedValue, opportunity.currency) : 'Not set'} icon={<DollarSign className="h-3.5 w-3.5" />} />
        <Fact label="Close period" value={opportunity.expectedClosePeriod || 'Missing'} />
        <Fact label="Next action" value={opportunity.nextAction || 'Missing'} />
        <Fact label="Next action date" value={opportunity.nextActionDate || 'Not set'} />
        <Fact label="Linked activities" value={String(linkedActivities.length)} />
        <Fact label="Last activity" value={quality.lastLinkedActivityDate || 'No linked activity'} />
      </div>

      {quality.issues.length > 0 && (
        <div className="mt-4 rounded-lg border border-amber-100 bg-amber-50/70 p-3">
          <p className="flex items-center gap-2 text-sm font-bold text-amber-900">
            <AlertTriangle className="h-4 w-4" />
            {quality.primaryAction}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {quality.issues.slice(0, 5).map((issue) => (
              <span key={issue.id} className={`rounded-full px-2.5 py-1 text-xs font-bold ${issueTone(issue.severity)}`}>
                {issue.label}
              </span>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

function OpportunityPanel({
  mode,
  form,
  saveState,
  message,
  editingOpportunity,
  linkedActivities,
  onChange,
  onSave,
  onClose,
  onDelete,
  onCreateDefenseBrief,
}: {
  mode: 'closed' | 'add' | 'edit';
  form: OpportunityFormInput;
  saveState: SaveState;
  message: string;
  editingOpportunity: CrmLiteOpportunity | null;
  linkedActivities: SalesActivityRecord[];
  onChange: (form: OpportunityFormInput) => void;
  onSave: () => void;
  onClose: () => void;
  onDelete?: () => void;
  onCreateDefenseBrief?: () => void;
}) {
  if (mode === 'closed') {
    return (
      <aside className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Detail Panel</p>
        <h2 className="mt-2 text-xl font-bold text-navy">Select or add an opportunity</h2>
        <p className="mt-2 text-sm leading-6 text-gray-500">
          Edit full deal fields here: buying context, evidence, objections, forecast category, next action, and review recommendation.
        </p>
      </aside>
    );
  }

  const update = <Key extends keyof OpportunityFormInput>(key: Key, value: OpportunityFormInput[Key]) => {
    onChange({ ...form, [key]: value });
  };

  return (
    <aside className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:overflow-y-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">{mode === 'add' ? 'Add Opportunity' : 'Edit Opportunity'}</p>
          <h2 className="mt-2 text-xl font-bold text-navy">
            {mode === 'add' ? 'New deal record' : editingOpportunity?.opportunityName}
          </h2>
          {editingOpportunity?.accountName && (
            <Link
              to={`/app/accounts?accountName=${encodeURIComponent(editingOpportunity.accountName)}`}
              className="mt-3 inline-flex rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-bold text-brand-blue hover:border-brand-blue/40"
            >
              View Account Memory
            </Link>
          )}
        </div>
        <button type="button" onClick={onClose} className="rounded-full border border-gray-200 p-2 text-gray-500 hover:bg-gray-50">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-5 space-y-4">
        <Field label="Account" value={form.accountName} onChange={(value) => update('accountName', value)} required />
        <Field label="Opportunity" value={form.opportunityName} onChange={(value) => update('opportunityName', value)} required />

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <SelectField label="Stage" value={form.stage} options={opportunityStages} onChange={(value) => update('stage', value)} />
          <SelectField label="Status" value={form.status} options={opportunityStatuses} onChange={(value) => update('status', value)} />
          <Field
            label="Estimated value"
            type="number"
            value={form.estimatedValue?.toString() || ''}
            onChange={(value) => update('estimatedValue', value ? Number(value) : null)}
          />
          <Field label="Currency" value={form.currency} onChange={(value) => update('currency', value)} />
          <Field label="Expected close period" value={form.expectedClosePeriod} onChange={(value) => update('expectedClosePeriod', value)} />
          <Field label="Next action date" type="date" value={form.nextActionDate} onChange={(value) => update('nextActionDate', value)} />
        </div>

        <Field label="Product / solution" value={form.productOrSolution} onChange={(value) => update('productOrSolution', value)} />
        <Field label="Decision maker" value={form.decisionMaker} onChange={(value) => update('decisionMaker', value)} />
        <Field label="Budget owner" value={form.budgetOwner} onChange={(value) => update('budgetOwner', value)} />
        <TextArea label="Procurement path" value={form.procurementPath} onChange={(value) => update('procurementPath', value)} />
        <TextArea label="Technical criteria" value={form.technicalCriteria} onChange={(value) => update('technicalCriteria', value)} />
        <TextArea label="Next action" value={form.nextAction} onChange={(value) => update('nextAction', value)} />
        <TextArea label="Evidence" value={form.evidence} onChange={(value) => update('evidence', value)} />
        <TextArea label="Missing context" value={form.missingContext} onChange={(value) => update('missingContext', value)} />
        <TextArea label="Objection debt" value={form.objectionDebt} onChange={(value) => update('objectionDebt', value)} />

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <SelectField label="Forecast evidence" value={form.forecastEvidenceCategory} options={forecastEvidenceCategories} onChange={(value) => update('forecastEvidenceCategory', value)} />
          <SelectField label="Decision recommendation" value={form.decisionRecommendation} options={decisionRecommendations} onChange={(value) => update('decisionRecommendation', value)} />
        </div>
      </div>

      {mode === 'edit' && (
        <LinkedActivitiesTimeline activities={linkedActivities} />
      )}

      {message && (
        <p className={`mt-4 rounded-lg px-3 py-2 text-sm font-semibold ${
          saveState === 'saved' ? 'bg-emerald-50 text-emerald-700' : saveState === 'error' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'
        }`}>
          {message}
        </p>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={saveState === 'saving'}
          className="inline-flex items-center gap-2 rounded-full bg-navy px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Save className="h-4 w-4" />
          {saveState === 'saving' ? 'Saving...' : 'Save Opportunity'}
        </button>
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex items-center gap-2 rounded-full border border-red-100 bg-red-50 px-4 py-2 text-sm font-bold text-red-700"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        )}
        {onCreateDefenseBrief && (
          <button
            type="button"
            onClick={onCreateDefenseBrief}
            className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-4 py-2 text-sm font-bold text-brand-blue"
          >
            <FileText className="h-4 w-4" />
            Create Defense Brief from this Opportunity
          </button>
        )}
      </div>
    </aside>
  );
}

function DefenseBriefPreviewModal({
  opportunities,
  metadata,
  onMetadataChange,
  createState,
  message,
  onCreate,
  onClose,
}: {
  opportunities: CrmLiteOpportunity[];
  metadata: BriefPreviewMetadata;
  onMetadataChange: (metadata: BriefPreviewMetadata) => void;
  createState: SaveState;
  message: string;
  onCreate: () => void;
  onClose: () => void;
}) {
  const generatedDeals = opportunities.map(mapOpportunityToPipelineDefenseDeal);
  const updateMetadata = <Key extends keyof BriefPreviewMetadata>(
    key: Key,
    value: BriefPreviewMetadata[Key],
  ) => {
    onMetadataChange({ ...metadata, [key]: value });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/60 p-4">
      <section className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-gray-200 p-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Pipeline Defense Preview</p>
            <h2 className="mt-2 text-2xl font-bold text-navy">Generate Defense Brief</h2>
            <p className="mt-1 text-sm leading-6 text-gray-500">
              Review the generated draft before creating a new Pipeline Defense Brief. This will not overwrite existing briefs.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-gray-200 p-2 text-gray-500 hover:bg-gray-50">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="overflow-y-auto p-5">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label="Brief title" value={metadata.title} onChange={(value) => updateMetadata('title', value)} />
            <Field label="Week label" value={metadata.weekLabel} onChange={(value) => updateMetadata('weekLabel', value)} />
            <Field label="Sales owner" value={metadata.salesOwner} onChange={(value) => updateMetadata('salesOwner', value)} />
            <Field label="Scope" value={metadata.scope} onChange={(value) => updateMetadata('scope', value)} />
          </div>

          <div className="mt-5 rounded-lg border border-blue-100 bg-blue-50/70 p-4">
            <p className="text-sm font-bold text-blue-950">{opportunities.length} selected opportunities</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {opportunities.map((opportunity) => (
                <span key={opportunity.id} className="rounded-full border border-blue-100 bg-white px-3 py-1 text-xs font-bold text-brand-blue">
                  {opportunity.accountName} / {opportunity.opportunityName}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {generatedDeals.map((deal) => (
              <article key={deal.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-gray-400">{deal.account}</p>
                    <h3 className="mt-1 text-lg font-bold text-navy">{deal.opportunity}</h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge label={deal.forecastEvidenceCategory} tone={forecastTone(deal.forecastEvidenceCategory)} />
                    <Badge label={deal.decisionRecommendation} tone={decisionTone(deal.decisionRecommendation)} />
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <Fact label="Pipeline context" value={deal.pipelineContext} />
                  <Fact label="Recommended action" value={deal.recommendedAction} />
                  <Fact label="Missing context" value={deal.missingContext.join(', ')} />
                  <Fact label="Objection debt" value={deal.objectionDebt.objection} />
                </div>
                <div className="mt-3 rounded-lg bg-gray-50 p-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Deal truth</p>
                  <p className="mt-1 text-sm leading-6 text-gray-700">{deal.dealTruth}</p>
                </div>
                <div className="mt-3 rounded-lg bg-gray-50 p-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Pipeline review answer</p>
                  <p className="mt-1 text-sm leading-6 text-gray-700">{deal.pipelineReviewAnswer}</p>
                </div>
              </article>
            ))}
          </div>
        </div>

        <footer className="flex flex-col gap-3 border-t border-gray-200 p-5 md:flex-row md:items-center md:justify-between">
          <p className={`text-sm font-semibold ${
            createState === 'error' ? 'text-amber-700' : createState === 'saved' ? 'text-emerald-700' : 'text-gray-500'
          }`}>
            {message || 'Ready to create a new Pipeline Defense Brief.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onCreate}
              disabled={createState === 'saving'}
              className="inline-flex items-center gap-2 rounded-full bg-navy px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              <FileText className="h-4 w-4" />
              {createState === 'saving' ? 'Creating...' : 'Create Brief'}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function LinkedActivitiesTimeline({ activities }: { activities: SalesActivityRecord[] }) {
  return (
    <section className="mt-5 rounded-lg border border-gray-100 bg-gray-50 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Linked Activities</p>
      {activities.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500">No activities linked to this opportunity yet.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {activities.map((activity) => (
            <details key={activity.id} className="rounded-lg bg-white p-3 ring-1 ring-gray-100">
              <summary className="cursor-pointer text-sm font-bold text-navy">
                {activity.activityDate} | {activity.activityType}
              </summary>
              <p className="mt-2 text-sm leading-6 text-gray-700">{activity.summary}</p>
              {activity.nextAction && (
                <p className="mt-2 text-xs font-bold text-brand-blue">Next: {activity.nextAction}</p>
              )}
              <p className="mt-2 whitespace-pre-line text-xs leading-5 text-gray-500">{activity.rawNote}</p>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm">
      <p className="text-base font-bold text-navy">No opportunities yet.</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-gray-500">
        Opportunities are the deals you want to track and defend. Add one active deal, then Memoire can help you inspect evidence, risk, next action, and pipeline defense readiness.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <button type="button" onClick={onAdd} className="inline-flex items-center gap-2 rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">
          <Plus className="h-4 w-4" />
          Add Opportunity
        </button>
        <Link to="/app/capture" className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700">
          Go to Capture
        </Link>
      </div>
    </div>
  );
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: readonly string[]; onChange: (value: string) => void }) {
  return (
    <label className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2">
      <Filter className="h-4 w-4 text-gray-400" />
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="w-full bg-transparent text-sm font-semibold text-gray-700 outline-none">
        {options.map((option) => (
          <option key={option} value={option}>{option === allFilter ? label : option}</option>
        ))}
      </select>
    </label>
  );
}

function SelectField<Value extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: Value;
  options: readonly Value[];
  onChange: (value: Value) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-navy">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as Value)}
        className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
      >
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-navy">{label}{required ? ' *' : ''}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
      />
    </label>
  );
}

function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-navy">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        className="mt-2 w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
      />
    </label>
  );
}

function Metric({ label, value, tone = 'blue' }: { label: string; value: string | number; tone?: 'blue' | 'green' | 'amber' | 'red' }) {
  const toneClass = {
    blue: 'bg-blue-50 text-brand-blue',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-700',
  }[tone];

  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-lg font-black ${toneClass}`}>{value}</p>
    </div>
  );
}

function Fact({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-gray-50 p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-gray-800">
        {icon}
        {value}
      </p>
    </div>
  );
}

function Badge({ label, tone = 'blue' }: { label: string; tone?: 'blue' | 'green' | 'amber' | 'red' | 'gray' }) {
  const toneClass = {
    blue: 'border-blue-100 bg-blue-50 text-brand-blue',
    green: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-100 bg-amber-50 text-amber-700',
    red: 'border-red-100 bg-red-50 text-red-700',
    gray: 'border-gray-200 bg-gray-50 text-gray-600',
  }[tone];

  return <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${toneClass}`}>{label}</span>;
}

function StatusBadge({ highRisk, cleanup }: { highRisk: number; cleanup: number }) {
  if (highRisk) {
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-red-100 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700">
        <AlertTriangle className="h-3.5 w-3.5" />
        High-risk pipeline
      </span>
    );
  }

  if (cleanup) {
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-amber-100 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700">
        <AlertTriangle className="h-3.5 w-3.5" />
        Cleanup needed
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">
      <CheckCircle2 className="h-3.5 w-3.5" />
      Pipeline clean
    </span>
  );
}

function opportunityToForm(opportunity: CrmLiteOpportunity): OpportunityFormInput {
  return {
    accountName: opportunity.accountName,
    opportunityName: opportunity.opportunityName,
    stage: opportunity.stage,
    estimatedValue: opportunity.estimatedValue,
    currency: opportunity.currency,
    expectedClosePeriod: opportunity.expectedClosePeriod,
    productOrSolution: opportunity.productOrSolution,
    decisionMaker: opportunity.decisionMaker,
    budgetOwner: opportunity.budgetOwner,
    procurementPath: opportunity.procurementPath,
    technicalCriteria: opportunity.technicalCriteria,
    nextAction: opportunity.nextAction,
    nextActionDate: opportunity.nextActionDate,
    evidence: opportunity.evidence,
    missingContext: opportunity.missingContext,
    objectionDebt: opportunity.objectionDebt,
    forecastEvidenceCategory: opportunity.forecastEvidenceCategory,
    decisionRecommendation: opportunity.decisionRecommendation,
    status: opportunity.status,
  };
}

function persistCreatedBriefLocally(brief: PipelineDefenseBrief) {
  const currentStore = loadPipelineDefenseBriefStore();
  const nextStore = {
    activeBriefId: brief.id,
    briefs: [
      brief,
      ...currentStore.briefs.filter((item) => item.id !== brief.id),
    ],
  };

  savePipelineDefenseBriefStore(nextStore);
}

function buildDefaultBriefMetadata(user: Parameters<typeof getWorkspaceUserDisplayName>[0]): BriefPreviewMetadata {
  const now = new Date();
  return {
    title: `Pipeline Defense Brief - Opportunities - ${formatDate(now)}`,
    weekLabel: buildCurrentWeekLabel(now),
    salesOwner: getWorkspaceUserDisplayName(user) || 'Henry',
    scope: 'Selected opportunities',
  };
}

function buildCurrentWeekLabel(date: Date) {
  const start = new Date(date);
  const day = start.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diffToMonday);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return `${formatDate(start)} - ${formatDate(end)}`;
}

function formatDate(date: Date) {
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function getLinkedActivities(opportunity: CrmLiteOpportunity, activities: SalesActivityRecord[]) {
  return activities
    .filter((activity) => activity.linkStatus === 'Linked' && activity.linkedOpportunityId === opportunity.id)
    .sort((a, b) => `${b.activityDate}-${b.createdAt}`.localeCompare(`${a.activityDate}-${a.createdAt}`));
}

function formatMoney(value: number, currency = 'VND') {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'VND' ? 0 : 2,
  }).format(value);
}

function forecastTone(category: string) {
  if (category === 'Defensible') return 'green';
  if (category === 'Weak but recoverable') return 'amber';
  return 'red';
}

function decisionTone(decision: string) {
  if (decision === 'Defend') return 'green';
  if (decision === 'Monitor') return 'blue';
  if (decision === 'Deprioritize') return 'gray';
  return 'red';
}

function issueTone(severity: 'low' | 'medium' | 'high') {
  return {
    low: 'bg-blue-50 text-blue-700',
    medium: 'bg-amber-100 text-amber-800',
    high: 'bg-red-100 text-red-700',
  }[severity];
}
