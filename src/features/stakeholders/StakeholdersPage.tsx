import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Filter, Plus, Save, Search, Trash2, UsersRound, X } from 'lucide-react';
import { useAuthContext } from '../../auth/authContext';
import { DataModePill } from '../../components/common/DataModePill';
import { PageContainer, PageHeader } from '../../components/layout/PageFrame';
import { RecordStamp } from '../../components/common/RecordStamp';
import { isSupabaseConfigured } from '../../lib/demoMode';
import { hasLocalSampleData } from '../../utils/dataMode';
import { type CrmLiteOpportunity } from '../../services/opportunityStore';
import {
  canUseStakeholderCloudStore,
  createStakeholder,
  deleteStakeholder,
  emptyStakeholderInput,
  influenceLevels,
  relationshipStrengths,
  stakeholderRoles,
  stakeholderStances,
  stakeholderToFormInput,
  updateStakeholder,
  type StakeholderFormInput,
  type StakeholderRecord,
} from '../../services/stakeholderStore';
import { getCachedSalesWorkspaceData, loadSalesWorkspaceData } from '../../services/workspaceData';
import { useWorkspaceRefresh } from '../../hooks/useWorkspaceRefresh';
import { formatCount } from '../../utils/numberFormat';
import { summarizeStakeholderCoverage } from '../../utils/stakeholderGraph';
import {
  getStakeholderNextActionFromNotes,
  setStakeholderNextActionInNotes,
  stripStakeholderNextActionFromNotes,
} from '../../utils/meddicStakeholderMap.ts';
import { matchesSearchQuery } from '../../utils/textSearch';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';
const allFilter = 'All';
const pageSizeOptions = [25, 50, 100] as const;

export function StakeholdersPage() {
  const { user, loading: authLoading, isAuthenticated } = useAuthContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const sampleDataActive = hasLocalSampleData();
  const dataUserId = sampleDataActive ? undefined : user?.id;
  const [stakeholders, setStakeholders] = useState<StakeholderRecord[]>([]);
  const [opportunities, setOpportunities] = useState<CrmLiteOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [accountFilter, setAccountFilter] = useState(searchParams.get('accountName') || allFilter);
  const [roleFilter, setRoleFilter] = useState(allFilter);
  const [stanceFilter, setStanceFilter] = useState(allFilter);
  const [influenceFilter, setInfluenceFilter] = useState(allFilter);
  const [selectedStakeholder, setSelectedStakeholder] = useState<StakeholderRecord | null>(null);
  const [panelMode, setPanelMode] = useState<'closed' | 'add' | 'edit'>('closed');
  const [form, setForm] = useState<StakeholderFormInput>(emptyStakeholderInput);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [message, setMessage] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const refreshStakeholders = async () => {
    const cachedData = getCachedSalesWorkspaceData(dataUserId);
    if (cachedData) {
      setStakeholders(cachedData.stakeholders);
      setOpportunities(cachedData.opportunities);
      setLoading(false);
      return;
    }

    setLoading(true);
    const workspaceData = await loadSalesWorkspaceData(dataUserId);
    setStakeholders(workspaceData.stakeholders);
    setOpportunities(workspaceData.opportunities);
    setLoading(false);
  };

  useEffect(() => {
    refreshStakeholders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataUserId]);

  // Drawn from the browser copy at first paint; take the cloud answer when it
  // lands rather than reporting an empty relationship map all session.
  useWorkspaceRefresh(() => { void refreshStakeholders(); });

  useEffect(() => {
    const accountName = searchParams.get('accountName') || allFilter;
    const opportunityName = searchParams.get('opportunityName') || '';
    setAccountFilter(accountName);
    if (opportunityName) setQuery(opportunityName);
  }, [searchParams]);

  const accounts = useMemo(() => [allFilter, ...Array.from(new Set(stakeholders.map((item) => item.accountName).filter(Boolean))).sort()], [stakeholders]);
  const summary = useMemo(() => summarizeStakeholderCoverage(stakeholders, opportunities), [opportunities, stakeholders]);
  const visibleStakeholders = useMemo(() => {
    const searchText = query.trim().toLowerCase();
    return stakeholders.filter((stakeholder) => {
      const searchable = [
        stakeholder.name,
        stakeholder.accountName,
        stakeholder.opportunityName,
        stakeholder.roleTitle,
        stakeholder.notes,
        stakeholder.tags.join(' '),
      ].join(' ').toLowerCase();
      return (
        matchesSearchQuery(searchable, searchText) &&
        (accountFilter === allFilter || stakeholder.accountName === accountFilter) &&
        (roleFilter === allFilter || stakeholder.stakeholderRole === roleFilter) &&
        (stanceFilter === allFilter || stakeholder.stance === stanceFilter) &&
        (influenceFilter === allFilter || stakeholder.influenceLevel === influenceFilter)
      );
    });
  }, [accountFilter, influenceFilter, query, roleFilter, stakeholders, stanceFilter]);

  /**
   * Paged, because this list rendered every match.
   *
   * At 1,000 stakeholders that was 22,625 DOM nodes on a page 266,417 pixels
   * tall, and the renderer stopped answering - screenshots of this surface timed
   * out repeatedly. Opportunities already pages at 25 rows and costs 2,076 nodes
   * for the same job, so this is that pattern rather than a new one.
   */
  const pageCount = Math.max(1, Math.ceil(visibleStakeholders.length / pageSize));
  const pagedStakeholders = useMemo(
    () => visibleStakeholders.slice((page - 1) * pageSize, page * pageSize),
    [page, pageSize, visibleStakeholders],
  );

  // Filtering to three matches while sitting on page 12 shows an empty list that
  // reads as "no results". Any change to what is being filtered goes to page 1.
  useEffect(() => {
    setPage(1);
  }, [accountFilter, influenceFilter, pageSize, query, roleFilter, stanceFilter]);

  const openAddPanel = (seed: Partial<StakeholderFormInput> = {}) => {
    setSelectedStakeholder(null);
    setForm({ ...emptyStakeholderInput, ...seed });
    setPanelMode('add');
    setSaveState('idle');
    setMessage('');
  };

  const openEditPanel = (stakeholder: StakeholderRecord) => {
    setSelectedStakeholder(stakeholder);
    setForm(stakeholderToFormInput(stakeholder));
    setPanelMode('edit');
    setSaveState('idle');
    setMessage('');
    setSearchParams(stakeholder.accountName ? { accountName: stakeholder.accountName } : {});
  };

  const closePanel = () => {
    setSelectedStakeholder(null);
    setPanelMode('closed');
    setSaveState('idle');
    setMessage('');
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      setSaveState('error');
      setMessage('Add stakeholder name first.');
      return;
    }
    setSaveState('saving');
    setMessage('Saving stakeholder...');
    const result = panelMode === 'edit' && selectedStakeholder
      ? await updateStakeholder(selectedStakeholder, form, dataUserId)
      : await createStakeholder(form, dataUserId);
    setStakeholders((current) => [result.stakeholder, ...current.filter((item) => item.id !== result.stakeholder.id)]);
    setSelectedStakeholder(result.stakeholder);
    setForm(stakeholderToFormInput(result.stakeholder));
    setPanelMode('edit');
    setSaveState(result.warning ? 'error' : 'saved');
    setMessage(result.warning || (result.mode === 'cloud' ? 'Synced to your account.' : 'Saved locally in this browser.'));
  };

  const handleDelete = async (stakeholder: StakeholderRecord) => {
    if (!window.confirm(`Delete ${stakeholder.name}?`)) return;
    await deleteStakeholder(stakeholder, dataUserId);
    setStakeholders((current) => current.filter((item) => item.id !== stakeholder.id));
    closePanel();
  };

  return (
    <PageContainer>
      {/* Entity options for the add/edit form: names come from the records the
          workspace already knows, so a typed stakeholder joins the data spine
          instead of inventing a new spelling. */}
      <datalist id="stakeholder-account-options">
        {[...new Set([
          ...opportunities.map((item) => item.accountName),
          ...stakeholders.map((item) => item.accountName),
        ].filter(Boolean))].sort().map((name) => <option key={name} value={name} />)}
      </datalist>
      <datalist id="stakeholder-opportunity-options">
        {[...new Set([
          ...opportunities.filter((item) => item.status === 'Active').map((item) => item.opportunityName),
          ...stakeholders.map((item) => item.opportunityName),
        ].filter(Boolean))].sort().map((name) => <option key={name} value={name} />)}
      </datalist>
      <PageHeader
        eyebrow="Records"
        title="Stakeholders"
        meta={loading ? undefined : `${visibleStakeholders.length} shown of ${stakeholders.length}`}
        description="Everyone who influences a deal, across every customer: champions, buyers, procurement, users and blockers. The account and the deal show the people on that record; this is the whole book."
        actions={
          <DataModePill
            compact
            isLoading={authLoading}
            isAuthenticated={isAuthenticated}
            isSupabaseConfigured={isSupabaseConfigured}
            cloudAvailable={canUseStakeholderCloudStore(dataUserId)}
            hasSampleData={sampleDataActive}
          />
        }
      />

      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <button type="button" onClick={() => openAddPanel()} className="inline-flex items-center justify-center gap-2 rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">
            <Plus className="h-4 w-4" />
            Add Stakeholder
          </button>
          <div className="grid flex-1 grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-[1.5fr_repeat(4,1fr)]">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search stakeholder, account, opportunity..." className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10" />
            </label>
            <FilterSelect label="Account" value={accountFilter} options={accounts} onChange={setAccountFilter} />
            <FilterSelect label="Role" value={roleFilter} options={[allFilter, ...stakeholderRoles]} onChange={setRoleFilter} />
            <FilterSelect label="Stance" value={stanceFilter} options={[allFilter, ...stakeholderStances]} onChange={setStanceFilter} />
            <FilterSelect label="Influence" value={influenceFilter} options={[allFilter, ...influenceLevels]} onChange={setInfluenceFilter} />
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <Metric label="Total" value={summary.totalStakeholders} />
        <Metric label="Champions" value={summary.champions} tone="green" />
        <Metric label="Economic buyers" value={summary.economicBuyers} tone="blue" />
        <Metric label="Blockers" value={summary.blockers} tone="red" />
        <Metric label="High influence" value={summary.highInfluence} tone="amber" />
        {/* Counts ACCOUNTS, like the deals tile below counts deals - so it says
            so. Left as "Missing champion" it read as a fact about the people on
            this page: a workspace with one stakeholder showed "Total 1" beside
            "Missing champion 17". */}
        <Metric label="Accounts missing a champion" value={summary.accountsWithMissingChampion} tone="amber" />
        <Metric label="No account" value={summary.unattachedStakeholders} tone={summary.unattachedStakeholders > 0 ? 'amber' : 'green'} />
        {/* Every other tile in this row counts stakeholders. This one counts
            deals, so on a workspace with no stakeholders at all it read
            "Opp risk 1" in red beside six zeros and looked like a contradiction
            rather than the point it was making. */}
        <Metric label="Deals with nobody named" value={summary.opportunitiesWithStakeholderRisk} tone="red" />
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_420px]">
        <div className="space-y-3">
          {loading ? (
            <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm font-semibold text-gray-500">Loading stakeholders...</div>
          ) : visibleStakeholders.length === 0 ? (
            <EmptyState onAdd={() => openAddPanel()} />
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-gray-500">
                <p>
                  Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, visibleStakeholders.length)} of{' '}
                  {formatCount(visibleStakeholders.length)}
                </p>
                <label className="flex items-center gap-2">
                  <span>Per page</span>
                  <select
                    value={pageSize}
                    onChange={(event) => setPageSize(Number(event.target.value))}
                    className="rounded-lg border border-gray-300 bg-white px-2 py-1 font-semibold text-gray-700 outline-none"
                  >
                    {pageSizeOptions.map((size) => <option key={size} value={size}>{size}</option>)}
                  </select>
                </label>
              </div>

              {pagedStakeholders.map((stakeholder) => (
                <StakeholderCard key={stakeholder.id} stakeholder={stakeholder} onOpen={() => openEditPanel(stakeholder)} />
              ))}

              {pageCount > 1 && (
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    disabled={page === 1}
                    className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-700 disabled:cursor-not-allowed disabled:text-gray-300"
                  >
                    Previous
                  </button>
                  <p className="text-xs font-semibold text-gray-500">Page {page} of {pageCount}</p>
                  <button
                    type="button"
                    onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                    disabled={page === pageCount}
                    className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-700 disabled:cursor-not-allowed disabled:text-gray-300"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        <StakeholderPanel
          mode={panelMode}
          form={form}
          record={selectedStakeholder}
          saveState={saveState}
          message={message}
          onChange={setForm}
          onSave={handleSave}
          onClose={closePanel}
          onDelete={selectedStakeholder ? () => handleDelete(selectedStakeholder) : undefined}
        />
      </section>
    </PageContainer>
  );
}

function StakeholderCard({ stakeholder, onOpen }: { stakeholder: StakeholderRecord; onOpen: () => void }) {
  return (
    <article className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-gray-400">{stakeholder.accountName || 'Unassigned account'}</p>
          <h2 className="mt-1 text-lg font-bold text-navy">{stakeholder.name}</h2>
          <p className="mt-1 text-sm text-gray-500">{stakeholder.roleTitle || stakeholder.opportunityName || 'No title captured'}</p>
          <RecordStamp className="mt-1" createdAt={stakeholder.createdAt} updatedAt={stakeholder.updatedAt} label="Added" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge dimension="Role" label={stakeholder.stakeholderRole} tone={stakeholder.stakeholderRole === 'Blocker' ? 'red' : stakeholder.stakeholderRole === 'Champion' ? 'green' : 'blue'} />
          <Badge dimension="Influence" label={stakeholder.influenceLevel} tone={stakeholder.influenceLevel === 'High' ? 'amber' : 'gray'} />
          <Badge dimension="Stance" label={stakeholder.stance} tone={stakeholder.stance === 'Supportive' ? 'green' : stakeholder.stance === 'Resistant' ? 'red' : 'gray'} />
        </div>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
        <Fact label="Opportunity" value={stakeholder.opportunityName || 'Not linked'} />
        <Fact label="Relationship" value={stakeholder.relationshipStrength} />
        <Fact label="Last interaction" value={stakeholder.lastInteractionDate || 'Not captured'} />
      </div>
      <button type="button" onClick={onOpen} className="mt-4 rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">Open Stakeholder</button>
    </article>
  );
}

function StakeholderPanel({
  mode,
  form,
  record,
  saveState,
  message,
  onChange,
  onSave,
  onClose,
  onDelete,
}: {
  mode: 'closed' | 'add' | 'edit';
  form: StakeholderFormInput;
  /** The saved record behind the form, for the provenance line. Null while adding. */
  record: StakeholderRecord | null;
  saveState: SaveState;
  message: string;
  onChange: (form: StakeholderFormInput) => void;
  onSave: () => void;
  onClose: () => void;
  onDelete?: () => void;
}) {
  if (mode === 'closed') {
    return (
      <aside className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <UsersRound className="h-6 w-6 text-brand-blue" />
        <h2 className="mt-3 text-xl font-bold text-navy">Select or add a stakeholder</h2>
        <p className="mt-2 text-sm leading-6 text-gray-500">Map who supports, blocks, buys, evaluates, or approves your deals.</p>
      </aside>
    );
  }

  const update = <Key extends keyof StakeholderFormInput>(key: Key, value: StakeholderFormInput[Key]) => {
    onChange({ ...form, [key]: value });
  };
  const roleConfirmed = form.tags.includes('role-confirmed');
  const stakeholderNextAction = getStakeholderNextActionFromNotes(form.notes);
  const updateRoleConfirmed = (confirmed: boolean) => {
    const tags = new Set(form.tags.filter((tag) => tag !== 'role-confirmed' && tag !== 'role-inferred'));
    if (confirmed) tags.add('role-confirmed');
    update('tags', Array.from(tags));
  };
  const updateEvidenceNote = (value: string) => {
    update('notes', setStakeholderNextActionInNotes(value, stakeholderNextAction));
  };
  const updateStakeholderNextAction = (value: string) => {
    update('notes', setStakeholderNextActionInNotes(form.notes, value));
  };

  return (
    <aside className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:overflow-y-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">{mode === 'add' ? 'Add Stakeholder' : 'Stakeholder Detail'}</p>
          <h2 className="mt-2 text-xl font-bold text-navy">{mode === 'add' ? 'New stakeholder' : form.name}</h2>
          {mode === 'edit' && record && (
            <RecordStamp className="mt-1" createdAt={record.createdAt} updatedAt={record.updatedAt} label="Added" />
          )}
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-full border border-gray-200 p-2 text-gray-500 hover:bg-gray-50"><X className="h-4 w-4" /></button>
      </div>
      <div className="mt-5 space-y-4">
        <Field label="Name" value={form.name} onChange={(value) => update('name', value)} required />
        <Field label="Role title" value={form.roleTitle} onChange={(value) => update('roleTitle', value)} />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {/* Datalist-backed so typed names land on accounts and deals the
              workspace already knows - one data spine, no loose spellings. */}
          <Field label="Account" value={form.accountName} onChange={(value) => update('accountName', value)} listId="stakeholder-account-options" />
          <Field label="Opportunity" value={form.opportunityName} onChange={(value) => update('opportunityName', value)} listId="stakeholder-opportunity-options" />
          <SelectField label="Stakeholder role" value={form.stakeholderRole} options={stakeholderRoles} onChange={(value) => update('stakeholderRole', value)} />
          <SelectField label="Influence" value={form.influenceLevel} options={influenceLevels} onChange={(value) => update('influenceLevel', value)} />
          <SelectField label="Relationship" value={form.relationshipStrength} options={relationshipStrengths} onChange={(value) => update('relationshipStrength', value)} />
          <SelectField label="Stance" value={form.stance} options={stakeholderStances} onChange={(value) => update('stance', value)} />
          <label className="flex items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">
            <input type="checkbox" checked={roleConfirmed} onChange={(event) => updateRoleConfirmed(event.target.checked)} />
            Role confirmed by evidence
          </label>
          <Field label="Stakeholder next action" value={stakeholderNextAction} onChange={updateStakeholderNextAction} />
          <Field label="Email" value={form.email} onChange={(value) => update('email', value)} />
          <Field label="Phone" value={form.phone} onChange={(value) => update('phone', value)} />
          <Field label="Last interaction" type="date" value={form.lastInteractionDate} onChange={(value) => update('lastInteractionDate', value)} />
          <Field label="Tags" value={form.tags.join(', ')} onChange={(value) => update('tags', parseCommaList(value))} />
        </div>
        <TextArea label="Evidence note" value={stripStakeholderNextActionFromNotes(form.notes)} onChange={updateEvidenceNote} />
      </div>
      {message && <p className={`mt-4 rounded-lg px-3 py-2 text-sm font-semibold ${saveState === 'saved' ? 'bg-emerald-50 text-emerald-700' : saveState === 'error' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'}`}>{message}</p>}
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" onClick={onSave} disabled={saveState === 'saving'} className="inline-flex items-center gap-2 rounded-full bg-navy px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
          <Save className="h-4 w-4" />
          {saveState === 'saving' ? 'Saving...' : 'Save Stakeholder'}
        </button>
        {onDelete && (
          <button type="button" onClick={onDelete} className="inline-flex items-center gap-2 rounded-full border border-red-100 bg-red-50 px-4 py-2 text-sm font-bold text-red-700">
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        )}
      </div>
    </aside>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
      <p className="text-base font-bold text-navy">No stakeholders yet.</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-gray-500">Start mapping who supports, buys, evaluates, blocks, and approves your active deals.</p>
      <button type="button" onClick={onAdd} className="mt-5 rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">Add Stakeholder</button>
    </div>
  );
}

function Metric({ label, value, tone = 'blue' }: { label: string; value: string | number; tone?: 'blue' | 'green' | 'amber' | 'red' }) {
  return <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm"><p className="text-xs font-bold uppercase tracking-wide text-gray-400">{label}</p><p className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-lg font-black ${toneClass(tone)}`}>{value}</p></div>;
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-gray-50 p-3"><p className="text-xs font-bold uppercase tracking-wide text-gray-400">{label}</p><p className="mt-1 text-sm text-gray-700">{value}</p></div>;
}

/**
 * A badge says which dimension it is reporting, not just its value.
 *
 * Three of these sit in a row on every card, and for an imported stakeholder all
 * three read "Unknown" - three identical chips, none of which said whether it
 * was the role, the influence or the stance that nobody had filled in. The
 * dimension is the half a reader cannot infer.
 */
function Badge({ dimension, label, tone = 'blue' }: { dimension: string; label: string; tone?: 'blue' | 'green' | 'amber' | 'red' | 'gray' }) {
  const toneMap = {
    blue: 'border-blue-100 bg-blue-50 text-brand-blue',
    green: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-100 bg-amber-50 text-amber-700',
    red: 'border-red-100 bg-red-50 text-red-700',
    gray: 'border-gray-200 bg-gray-50 text-gray-600',
  }[tone];
  return (
    <span className={`inline-flex items-baseline gap-1 rounded-full border px-2.5 py-1 text-xs ${toneMap}`}>
      <span className="font-semibold opacity-70">{dimension}</span>
      <span className="font-bold">{label}</span>
    </span>
  );
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: readonly string[]; onChange: (value: string) => void }) {
  return <label className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2"><Filter className="h-4 w-4 text-gray-400" /><span className="sr-only">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="w-full bg-transparent text-sm font-semibold text-gray-700 outline-none">{options.map((option) => <option key={option} value={option}>{option === allFilter ? label : option}</option>)}</select></label>;
}

function SelectField<Value extends string>({ label, value, options, onChange }: { label: string; value: Value; options: readonly Value[]; onChange: (value: Value) => void }) {
  return <label className="block"><span className="text-sm font-bold text-navy">{label}</span><select value={value} onChange={(event) => onChange(event.target.value as Value)} className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10">{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>;
}

function Field({ label, value, onChange, required = false, type = 'text', listId }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; type?: string; listId?: string }) {
  return <label className="block"><span className="text-sm font-bold text-navy">{label}{required ? ' *' : ''}</span><input type={type} value={value} list={listId} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10" /></label>;
}

function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block"><span className="text-sm font-bold text-navy">{label}</span><textarea value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 min-h-[100px] w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10" /></label>;
}

function parseCommaList(value: string) {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function toneClass(tone: 'blue' | 'green' | 'amber' | 'red') {
  return {
    blue: 'bg-blue-50 text-brand-blue',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-700',
  }[tone];
}
