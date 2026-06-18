import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Copy, Eye, FileText, PackagePlus, Plus, Search, Trash2, X } from 'lucide-react';
import { useAuthContext } from '../../auth/authContext';
import { DataModePill } from '../../components/common/DataModePill';
import { hasLocalSampleData } from '../../utils/dataMode';
import {
  copyAsEmailOrProposalSnippet,
  generateSalesAssetMarkdown,
} from '../../utils/salesAssetSuggestions';
import {
  clearSalesAssetDraft,
  createSalesAsset,
  deleteSalesAsset,
  emptySalesAssetInput,
  loadSalesAssetDraft,
  loadSalesAssets,
  loadSalesAssetsForUser,
  salesAssetTypes,
  saveSalesAssets,
  splitCommaList,
  updateSalesAsset,
  type SalesAssetInput,
  type SalesAssetRecord,
  type SalesAssetType,
} from '../../services/salesAssetStore';
import { starterAssetPacks, type StarterAssetPack } from '../../utils/starterAssetPacks';
import { markTrialActivationChecklistItemComplete } from '../../utils/trialActivationChecklist';
import { reportWorkspaceSyncError } from '../../services/workspaceSyncStatus';

const allFilter = 'All';

export function SalesAssetsPage() {
  const { loading: authLoading, isAuthenticated, user } = useAuthContext();
  const [assets, setAssets] = useState<SalesAssetRecord[]>([]);
  const [search, setSearch] = useState('');
  const [assetTypeFilter, setAssetTypeFilter] = useState<SalesAssetType | typeof allFilter>(allFilter);
  const [tagFilter, setTagFilter] = useState('');
  const [panelMode, setPanelMode] = useState<'closed' | 'add' | 'edit'>('closed');
  const [editingAsset, setEditingAsset] = useState<SalesAssetRecord | null>(null);
  const [form, setForm] = useState<SalesAssetInput>(emptySalesAssetInput);
  const [message, setMessage] = useState('');
  const [previewPack, setPreviewPack] = useState<StarterAssetPack | null>(null);
  const sampleDataActive = hasLocalSampleData();

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      let loaded = loadSalesAssets();
      if (user && !sampleDataActive) {
        try {
          loaded = await loadSalesAssetsForUser(user.id);
        } catch {
          reportWorkspaceSyncError();
        }
      }
      if (!cancelled) setAssets(loaded);
    };
    void load();
    const draft = loadSalesAssetDraft();
    if (draft) {
      setForm(draft);
      setPanelMode('add');
      setEditingAsset(null);
      setMessage('Asset draft loaded from Playbook. Review and save when ready.');
      clearSalesAssetDraft();
    }
    return () => {
      cancelled = true;
    };
  }, [sampleDataActive, user]);

  const summary = useMemo(() => summarizeAssets(assets), [assets]);
  const visibleAssets = useMemo(() => {
    const query = search.trim().toLowerCase();
    const tagQuery = tagFilter.trim().toLowerCase();
    return assets.filter((asset) => {
      const searchable = [
        asset.title,
        asset.assetType,
        asset.summary,
        asset.content,
        asset.useCase,
        asset.relatedAccountName,
        asset.relatedOpportunityName,
        asset.relatedPlaybookPatternTitle,
        asset.relatedObjectionType,
        asset.tags.join(' '),
      ].join(' ').toLowerCase();
      return (
        (!query || searchable.includes(query)) &&
        (assetTypeFilter === allFilter || asset.assetType === assetTypeFilter) &&
        (!tagQuery || asset.tags.some((tag) => tag.toLowerCase().includes(tagQuery)) || asset.useCase.toLowerCase().includes(tagQuery))
      );
    });
  }, [assetTypeFilter, assets, search, tagFilter]);

  const openAddPanel = () => {
    setEditingAsset(null);
    setForm(emptySalesAssetInput);
    setPanelMode('add');
    setMessage('');
  };

  const openEditPanel = (asset: SalesAssetRecord) => {
    setEditingAsset(asset);
    setForm(assetToInput(asset));
    setPanelMode('edit');
    setMessage('');
  };

  const closePanel = () => {
    setEditingAsset(null);
    setPanelMode('closed');
    setMessage('');
  };

  const saveAsset = () => {
    if (!form.title.trim()) {
      setMessage('Add an asset title first.');
      return;
    }

    if (!form.content.trim() && !form.summary.trim()) {
      setMessage('Add a summary or reusable content before saving.');
      return;
    }

    const saved = panelMode === 'edit' && editingAsset
      ? updateSalesAsset(editingAsset, form)
      : createSalesAsset(form);

    setAssets(loadSalesAssets());
    setEditingAsset(saved);
    setForm(assetToInput(saved));
    setPanelMode('edit');
    setMessage(isAuthenticated && !sampleDataActive ? 'Sales asset saved and syncing to your workspace.' : 'Sales asset saved in this browser.');
  };

  const removeAsset = (asset: SalesAssetRecord) => {
    const confirmed = window.confirm(`Delete ${asset.title}?`);
    if (!confirmed) return;
    deleteSalesAsset(asset.id);
    setAssets(loadSalesAssets());
    if (editingAsset?.id === asset.id) closePanel();
    setMessage(isAuthenticated && !sampleDataActive ? 'Sales asset deleted from your workspace.' : 'Sales asset deleted from this browser.');
  };

  const copyText = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setMessage(`Copied ${label}.`);
    } catch {
      setMessage(text);
    }
  };

  const importStarterPack = (pack: StarterAssetPack) => {
    const currentAssets = loadSalesAssets();
    const seen = new Set(currentAssets.map((asset) => starterDuplicateKey(asset.title, asset.assetType)));
    const now = new Date().toISOString();
    let skipped = 0;

    const importedAssets: SalesAssetRecord[] = pack.assets.flatMap((asset, index) => {
      const key = starterDuplicateKey(asset.title, asset.assetType);
      if (seen.has(key)) {
        skipped += 1;
        return [];
      }
      seen.add(key);

      return [{
        id: `starter-${pack.id}-${slugify(asset.title)}-${Date.now()}-${index}`,
        title: asset.title,
        assetType: asset.assetType,
        summary: asset.summary,
        content: asset.content,
        tags: [...asset.tags, 'starter-pack', pack.id],
        relatedObjectionType: asset.relatedObjectionType || '',
        relatedAccountName: '',
        relatedOpportunityId: '',
        relatedOpportunityName: '',
        relatedPlaybookPatternId: '',
        relatedPlaybookPatternTitle: pack.name,
        useCase: asset.useCase,
        createdAt: now,
        updatedAt: now,
        source: 'user',
        isSample: false,
      }];
    });

    saveSalesAssets([...importedAssets, ...currentAssets]);
    setAssets(loadSalesAssets());
    setMessage(`Imported ${importedAssets.length} asset${importedAssets.length === 1 ? '' : 's'} from ${pack.name}. Skipped ${skipped} duplicate${skipped === 1 ? '' : 's'}.`);
    markTrialActivationChecklistItemComplete('import-starter-asset-pack');
    setPreviewPack(pack);
  };

  return (
    <div className="flex w-full max-w-none flex-col gap-5 px-4 py-5 sm:px-5 lg:px-6">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Assets</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-navy">Sales Asset Library</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
            Reusable proof, objection responses, proposal snippets, and compliance notes for your B2B sales motion. No file storage or external CRM sync.
          </p>
        </div>
        <DataModePill
          compact
          isLoading={authLoading}
          isAuthenticated={isAuthenticated}
          isSupabaseConfigured
          cloudAvailable
          hasSampleData={sampleDataActive}
        />
      </header>

      <section className="rounded-lg border border-blue-100 bg-blue-50/70 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-bold text-blue-950">Proof vault, not document storage.</p>
            <p className="mt-1 text-sm text-blue-800">
              Save short reusable responses, proof notes, and snippets you can copy into email, proposal, or pipeline review.
            </p>
          </div>
          <button type="button" onClick={openAddPanel} className="inline-flex items-center justify-center gap-2 rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">
            <Plus className="h-4 w-4" />
            Create Asset
          </button>
        </div>
        {message && (
          <p className={`mt-3 rounded-lg px-3 py-2 text-sm font-semibold ${
            message.startsWith('Copied') || message.includes('saved') ? 'bg-emerald-50 text-emerald-700' : 'bg-white text-gray-700'
          }`}>
            {message}
          </p>
        )}
      </section>

      <StarterAssetPacksSection
        packs={starterAssetPacks}
        previewPack={previewPack}
        onPreview={setPreviewPack}
        onImport={importStarterPack}
      />

      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <SummaryCard label="Assets" value={summary.total} />
          <SummaryCard label="Proof assets" value={summary.proofAssets} tone={summary.proofAssets ? 'green' : 'blue'} />
          <SummaryCard label="Objection responses" value={summary.objectionResponses} tone={summary.objectionResponses ? 'amber' : 'blue'} />
          <SummaryCard label="Competitor notes" value={summary.competitorResponses} tone={summary.competitorResponses ? 'amber' : 'blue'} />
          <SummaryCard label="Compliance notes" value={summary.complianceNotes} tone={summary.complianceNotes ? 'green' : 'blue'} />
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-[1fr_220px_220px]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm font-semibold text-gray-700 outline-none focus:border-brand-blue focus:bg-white"
              placeholder="Search asset, account, objection, pattern..."
            />
          </label>
          <select
            value={assetTypeFilter}
            onChange={(event) => setAssetTypeFilter(event.target.value as SalesAssetType | typeof allFilter)}
            className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-700 outline-none focus:border-brand-blue focus:bg-white"
          >
            <option value={allFilter}>All asset types</option>
            {salesAssetTypes.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
          <input
            value={tagFilter}
            onChange={(event) => setTagFilter(event.target.value)}
            className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-700 outline-none focus:border-brand-blue focus:bg-white"
            placeholder="Filter tag/use case"
          />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_420px]">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-bold text-gray-500">{visibleAssets.length} visible assets</p>
            <Link to="/app/playbook" className="text-sm font-bold text-brand-blue">Open Playbook</Link>
          </div>
          {assets.length === 0 ? (
            <AssetsEmptyState onAdd={openAddPanel} />
          ) : visibleAssets.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center">
              <p className="text-sm font-bold text-navy">No asset matches this filter.</p>
              <p className="mt-2 text-sm text-gray-500">Clear search or create a new reusable proof asset.</p>
            </div>
          ) : (
            visibleAssets.map((asset) => (
              <AssetCard
                key={asset.id}
                asset={asset}
                isSelected={editingAsset?.id === asset.id}
                onSelect={() => openEditPanel(asset)}
                onCopy={copyText}
                onDelete={() => removeAsset(asset)}
              />
            ))
          )}
        </div>

        <AssetPanel
          mode={panelMode}
          asset={editingAsset}
          form={form}
          onChange={setForm}
          onSave={saveAsset}
          onClose={closePanel}
          onDelete={editingAsset ? () => removeAsset(editingAsset) : undefined}
        />
      </section>
    </div>
  );
}

function AssetCard({
  asset,
  isSelected,
  onSelect,
  onCopy,
  onDelete,
}: {
  asset: SalesAssetRecord;
  isSelected: boolean;
  onSelect: () => void;
  onCopy: (label: string, text: string) => void;
  onDelete: () => void;
}) {
  return (
    <article className={`rounded-lg border bg-white p-4 shadow-sm ${isSelected ? 'border-brand-blue ring-2 ring-blue-100' : 'border-gray-200'}`}>
      <button type="button" onClick={onSelect} className="block w-full text-left">
        <div className="flex flex-wrap gap-2">
          <Badge label={asset.assetType} tone={assetTypeTone(asset.assetType)} />
          {asset.isSample && <Badge label="Demo" tone="gray" />}
          {asset.relatedObjectionType && <Badge label={asset.relatedObjectionType} tone="amber" />}
        </div>
        <h2 className="mt-3 text-lg font-bold text-navy">{asset.title}</h2>
        <p className="mt-2 text-sm leading-6 text-gray-600">{asset.summary || asset.useCase || 'Reusable sales asset.'}</p>
        {(asset.relatedAccountName || asset.relatedOpportunityName || asset.relatedPlaybookPatternTitle) && (
          <p className="mt-2 text-xs font-bold uppercase tracking-wide text-gray-400">
            {[asset.relatedAccountName, asset.relatedOpportunityName, asset.relatedPlaybookPatternTitle].filter(Boolean).join(' / ')}
          </p>
        )}
      </button>
      {asset.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {asset.tags.slice(0, 6).map((tag) => <span key={tag} className="rounded-full bg-gray-50 px-2 py-1 text-xs font-bold text-gray-500">{tag}</span>)}
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <AssetButton onClick={() => onCopy('asset content', asset.content || generateSalesAssetMarkdown(asset))}>Copy Content</AssetButton>
        <AssetButton onClick={() => onCopy('asset summary', asset.summary || asset.title)}>Copy Summary</AssetButton>
        <AssetButton onClick={() => onCopy('email/proposal snippet', copyAsEmailOrProposalSnippet(asset))}>Copy Snippet</AssetButton>
        <button type="button" onClick={onDelete} className="inline-flex items-center gap-2 rounded-full border border-red-100 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100">
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </button>
      </div>
    </article>
  );
}

function StarterAssetPacksSection({
  packs,
  previewPack,
  onPreview,
  onImport,
}: {
  packs: StarterAssetPack[];
  previewPack: StarterAssetPack | null;
  onPreview: (pack: StarterAssetPack | null) => void;
  onImport: (pack: StarterAssetPack) => void;
}) {
  return (
    <section id="starter-packs" className="rounded-lg border border-indigo-100 bg-indigo-50/70 p-5 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <PackagePlus className="h-4 w-4 text-indigo-700" />
            <h2 className="text-lg font-bold text-navy">Starter Asset Packs</h2>
          </div>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-indigo-900/75">
            Import practical, industry-specific proof notes, objection responses, proposal snippets, discovery questions, and follow-up scripts. Packs are local and editable after import.
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
        {packs.map((pack) => (
          <article key={pack.id} className="rounded-lg border border-indigo-100 bg-white p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-indigo-600">{pack.industry}</p>
            <h3 className="mt-2 text-base font-bold text-navy">{pack.name}</h3>
            <p className="mt-2 line-clamp-3 text-sm leading-6 text-gray-600">{pack.description}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge label={`${pack.assets.length} assets`} tone="blue" />
              <Badge label="Local import" tone="gray" />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onPreview(previewPack?.id === pack.id ? null : pack)}
                className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100"
              >
                <Eye className="h-3.5 w-3.5" />
                {previewPack?.id === pack.id ? 'Hide Preview' : 'Preview'}
              </button>
              <button
                type="button"
                onClick={() => onImport(pack)}
                className="inline-flex items-center gap-2 rounded-full bg-navy px-3 py-1.5 text-xs font-bold text-white"
              >
                <PackagePlus className="h-3.5 w-3.5" />
                Import Pack
              </button>
            </div>
          </article>
        ))}
      </div>

      {previewPack && (
        <div className="mt-5 rounded-lg border border-indigo-100 bg-white p-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-indigo-600">Pack preview</p>
              <h3 className="mt-1 text-base font-bold text-navy">{previewPack.name}</h3>
            </div>
            <button
              type="button"
              onClick={() => onImport(previewPack)}
              className="inline-flex w-fit items-center gap-2 rounded-full bg-navy px-3 py-1.5 text-xs font-bold text-white"
            >
              <PackagePlus className="h-3.5 w-3.5" />
              Import This Pack
            </button>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            {previewPack.assets.map((asset) => (
              <article key={`${asset.assetType}-${asset.title}`} className="rounded-lg bg-gray-50 p-3 ring-1 ring-gray-100">
                <div className="flex flex-wrap gap-2">
                  <Badge label={asset.assetType} tone={assetTypeTone(asset.assetType)} />
                  {asset.relatedObjectionType && <Badge label={asset.relatedObjectionType} tone="amber" />}
                </div>
                <h4 className="mt-2 text-sm font-bold text-navy">{asset.title}</h4>
                <p className="mt-1 text-sm leading-6 text-gray-600">{asset.summary}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {asset.tags.slice(0, 5).map((tag) => (
                    <span key={tag} className="rounded-full bg-white px-2 py-1 text-xs font-bold text-gray-500 ring-1 ring-gray-100">{tag}</span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function AssetPanel({
  mode,
  asset,
  form,
  onChange,
  onSave,
  onClose,
  onDelete,
}: {
  mode: 'closed' | 'add' | 'edit';
  asset: SalesAssetRecord | null;
  form: SalesAssetInput;
  onChange: (form: SalesAssetInput) => void;
  onSave: () => void;
  onClose: () => void;
  onDelete?: () => void;
}) {
  if (mode === 'closed') {
    return (
      <aside className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-brand-blue">
          <FileText className="h-5 w-5" />
        </div>
        <h2 className="mt-4 text-lg font-bold text-navy">Select or create an asset</h2>
        <p className="mt-2 text-sm leading-6 text-gray-500">
          Keep short reusable content that supports objections, proof gaps, competitor responses, procurement, and pipeline defense.
        </p>
      </aside>
    );
  }

  return (
    <aside className="sticky top-6 h-fit rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-brand-blue">{mode === 'add' ? 'New Asset' : 'Edit Asset'}</p>
          <h2 className="mt-1 text-xl font-bold text-navy">{asset?.title || 'Reusable sales asset'}</h2>
        </div>
        <button type="button" onClick={onClose} className="rounded-full border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-5 space-y-4">
        <Field label="Title" value={form.title} onChange={(value) => onChange({ ...form, title: value })} required />
        <SelectField label="Asset type" value={form.assetType} options={salesAssetTypes} onChange={(value) => onChange({ ...form, assetType: value })} />
        <TextArea label="Summary" rows={2} value={form.summary} onChange={(value) => onChange({ ...form, summary: value })} />
        <TextArea label="Content" rows={8} value={form.content} onChange={(value) => onChange({ ...form, content: value })} />
        <TextArea label="Use case" rows={2} value={form.useCase} onChange={(value) => onChange({ ...form, useCase: value })} />
        <Field label="Tags" value={form.tags.join(', ')} onChange={(value) => onChange({ ...form, tags: splitCommaList(value) })} />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Related account" value={form.relatedAccountName || ''} onChange={(value) => onChange({ ...form, relatedAccountName: value })} />
          <Field label="Related opportunity" value={form.relatedOpportunityName || ''} onChange={(value) => onChange({ ...form, relatedOpportunityName: value })} />
        </div>
        <Field label="Related objection type" value={form.relatedObjectionType || ''} onChange={(value) => onChange({ ...form, relatedObjectionType: value })} />
        <Field label="Related playbook pattern" value={form.relatedPlaybookPatternTitle || ''} onChange={(value) => onChange({ ...form, relatedPlaybookPatternTitle: value })} />
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" onClick={onSave} className="rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">
          Save Asset
        </button>
        {onDelete && (
          <button type="button" onClick={onDelete} className="rounded-full border border-red-100 bg-red-50 px-4 py-2 text-sm font-bold text-red-700">
            Delete
          </button>
        )}
      </div>
    </aside>
  );
}

function AssetsEmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <section className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center shadow-sm">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-brand-blue">
        <FileText className="h-6 w-6" />
      </div>
      <h2 className="mt-4 text-xl font-bold text-navy">No sales assets yet.</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-gray-500">
        Import starter asset packs to prepare proof responses, or create a reusable proof note, objection response, proposal snippet, or competitor response.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <button type="button" onClick={onAdd} className="rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">Create Asset</button>
        <a href="#starter-packs" className="rounded-full border border-indigo-100 bg-indigo-50 px-4 py-2 text-sm font-bold text-indigo-700">Open Starter Packs</a>
        <Link to="/app/playbook" className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700">Open Playbook</Link>
      </div>
    </section>
  );
}

function AssetButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50">
      <Copy className="h-3.5 w-3.5" />
      {children}
    </button>
  );
}

function SummaryCard({ label, value, tone = 'blue' }: { label: string; value: number; tone?: 'blue' | 'green' | 'amber' }) {
  const toneClass = {
    blue: 'bg-blue-50 text-brand-blue',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
  }[tone];
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`mt-2 inline-flex rounded-full px-3 py-1 text-2xl font-black ${toneClass}`}>{value}</p>
    </div>
  );
}

function Badge({ label, tone = 'blue' }: { label: string; tone?: 'blue' | 'green' | 'amber' | 'red' | 'gray' }) {
  const toneMap = {
    blue: 'border-blue-100 bg-blue-50 text-brand-blue',
    green: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-100 bg-amber-50 text-amber-700',
    red: 'border-red-100 bg-red-50 text-red-700',
    gray: 'border-gray-200 bg-gray-50 text-gray-600',
  }[tone];
  return <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${toneMap}`}>{label}</span>;
}

function Field({ label, value, onChange, required = false }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-navy">{label}{required ? ' *' : ''}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
      />
    </label>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: SalesAssetType; options: SalesAssetType[]; onChange: (value: SalesAssetType) => void }) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-navy">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as SalesAssetType)}
        className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
      >
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function TextArea({ label, value, onChange, rows = 3 }: { label: string; value: string; onChange: (value: string) => void; rows?: number }) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-navy">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        className="mt-2 w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
      />
    </label>
  );
}

function summarizeAssets(assets: SalesAssetRecord[]) {
  return {
    total: assets.length,
    proofAssets: assets.filter((asset) => asset.assetType === 'Proof Asset' || asset.assetType === 'Case Study').length,
    objectionResponses: assets.filter((asset) => asset.assetType === 'Objection Response').length,
    competitorResponses: assets.filter((asset) => asset.assetType === 'Competitor Response').length,
    complianceNotes: assets.filter((asset) => asset.assetType === 'Compliance Note' || asset.assetType === 'Validation / Documentation Note').length,
  };
}

function assetToInput(asset: SalesAssetRecord): SalesAssetInput {
  return {
    title: asset.title,
    assetType: asset.assetType,
    content: asset.content,
    summary: asset.summary,
    tags: asset.tags,
    relatedAccountName: asset.relatedAccountName,
    relatedOpportunityId: asset.relatedOpportunityId,
    relatedOpportunityName: asset.relatedOpportunityName,
    relatedObjectionType: asset.relatedObjectionType,
    relatedPlaybookPatternId: asset.relatedPlaybookPatternId,
    relatedPlaybookPatternTitle: asset.relatedPlaybookPatternTitle,
    useCase: asset.useCase,
    source: asset.source || 'user',
    isSample: asset.isSample === true,
  };
}

function assetTypeTone(assetType: SalesAssetType) {
  if (assetType === 'Objection Response' || assetType === 'Competitor Response') return 'amber';
  if (assetType === 'Validation / Documentation Note' || assetType === 'Compliance Note') return 'green';
  return 'blue';
}

function starterDuplicateKey(title: string, assetType: SalesAssetType) {
  return `${assetType.trim().toLowerCase()}::${title.trim().toLowerCase()}`;
}

function slugify(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60) || 'asset';
}
