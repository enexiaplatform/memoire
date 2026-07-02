import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Filter, Plus, Save, Search, Trash2, UsersRound, X } from 'lucide-react';
import { useAuthContext } from '../../auth/authContext';
import { DataModePill } from '../../components/common/DataModePill';
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
import { summarizeStakeholderCoverage } from '../../utils/stakeholderGraph';
import {
  getStakeholderNextActionFromNotes,
  setStakeholderNextActionInNotes,
  stripStakeholderNextActionFromNotes,
} from '../../utils/meddicStakeholderMap.ts';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';
const allFilter = 'All';

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
        (!searchText || searchable.includes(searchText)) &&
        (accountFilter === allFilter || stakeholder.accountName === accountFilter) &&
        (roleFilter === allFilter || stakeholder.stakeholderRole === roleFilter) &&
        (stanceFilter === allFilter || stakeholder.stance === stanceFilter) &&
        (influenceFilter === allFilter || stakeholder.influenceLevel === influenceFilter)
      );
    });
  }, [accountFilter, influenceFilter, query, roleFilter, stakeholders, stanceFilter]);

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
    <div className="flex w-full max-w-none flex-col gap-5 px-4 py-5 sm:px-5 lg:px-6">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Stakeholders</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-navy">Stakeholders</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
            Map the people who influence your B2B deals: champions, buyers, procurement, users, blockers, and decision makers.
          </p>
        </div>
        <DataModePill
          compact
          isLoading={authLoading}
          isAuthenticated={isAuthenticated}
          isSupabaseConfigured={isSupabaseConfigured}
          cloudAvailable={canUseStakeholderCloudStore(dataUserId)}
          hasSampleData={sampleDataActive}
        />
      </header>

      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
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

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <Metric label="Total" value={summary.totalStakeholders} />
        <Metric label="Champions" value={summary.champions} tone="green" />
        <Metric label="Economic buyers" value={summary.economicBuyers} tone="blue" />
        <Metric label="Blockers" value={summary.blockers} tone="red" />
        <Metric label="High influence" value={summary.highInfluence} tone="amber" />
        <Metric label="Missing champion" value={summary.accountsWithMissingChampion} tone="amber" />
        <Metric label="Opp risk" value={summary.opportunitiesWithStakeholderRisk} tone="red" />
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_420px]">
        <div className="space-y-3">
          {loading ? (
            <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm font-semibold text-gray-500">Loading stakeholders...</div>
          ) : visibleStakeholders.length === 0 ? (
            <EmptyState onAdd={() => openAddPanel()} />
          ) : (
            visibleStakeholders.map((stakeholder) => (
              <StakeholderCard key={stakeholder.id} stakeholder={stakeholder} onOpen={() => openEditPanel(stakeholder)} />
            ))
          )}
        </div>

        <StakeholderPanel
          mode={panelMode}
          form={form}
          saveState={saveState}
          message={message}
          onChange={setForm}
          onSave={handleSave}
          onClose={closePanel}
          onDelete={selectedStakeholder ? () => handleDelete(selectedStakeholder) : undefined}
        />
      </section>
    </div>
  );
}

function StakeholderCard({ stakeholder, onOpen }: { stakeholder: StakeholderRecord; onOpen: () => void }) {
  return (
    <article className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-gray-400">{stakeholder.accountName || 'Unassigned account'}</p>
          <h2 className="mt-1 text-lg font-bold text-navy">{stakeholder.name}</h2>
          <p className="mt-1 text-sm text-gray-500">{stakeholder.roleTitle || stakeholder.opportunityName || 'No title captured'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge label={stakeholder.stakeholderRole} tone={stakeholder.stakeholderRole === 'Blocker' ? 'red' : stakeholder.stakeholderRole === 'Champion' ? 'green' : 'blue'} />
          <Badge label={stakeholder.influenceLevel} tone={stakeholder.influenceLevel === 'High' ? 'amber' : 'gray'} />
          <Badge label={stakeholder.stance} tone={stakeholder.stance === 'Supportive' ? 'green' : stakeholder.stance === 'Resistant' ? 'red' : 'gray'} />
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
  saveState,
  message,
  onChange,
  onSave,
  onClose,
  onDelete,
}: {
  mode: 'closed' | 'add' | 'edit';
  form: StakeholderFormInput;
  saveState: SaveState;
  message: string;
  onChange: (form: StakeholderFormInput) => void;
  onSave: () => void;
  onClose: () => void;
  onDelete?: () => void;
}) {
  if (mode === 'closed') {
    return (
      <aside className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
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
    <aside className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:overflow-y-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">{mode === 'add' ? 'Add Stakeholder' : 'Stakeholder Detail'}</p>
          <h2 className="mt-2 text-xl font-bold text-navy">{mode === 'add' ? 'New stakeholder' : form.name}</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-full border border-gray-200 p-2 text-gray-500 hover:bg-gray-50"><X className="h-4 w-4" /></button>
      </div>
      <div className="mt-5 space-y-4">
        <Field label="Name" value={form.name} onChange={(value) => update('name', value)} required />
        <Field label="Role title" value={form.roleTitle} onChange={(value) => update('roleTitle', value)} />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Account" value={form.accountName} onChange={(value) => update('accountName', value)} />
          <Field label="Opportunity" value={form.opportunityName} onChange={(value) => update('opportunityName', value)} />
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
    <div className="rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm">
      <p className="text-base font-bold text-navy">No stakeholders yet.</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-gray-500">Start mapping who supports, buys, evaluates, blocks, and approves your active deals.</p>
      <button type="button" onClick={onAdd} className="mt-5 rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">Add Stakeholder</button>
    </div>
  );
}

function Metric({ label, value, tone = 'blue' }: { label: string; value: string | number; tone?: 'blue' | 'green' | 'amber' | 'red' }) {
  return <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm"><p className="text-xs font-bold uppercase tracking-wide text-gray-400">{label}</p><p className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-lg font-black ${toneClass(tone)}`}>{value}</p></div>;
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-gray-50 p-3"><p className="text-xs font-bold uppercase tracking-wide text-gray-400">{label}</p><p className="mt-1 text-sm text-gray-700">{value}</p></div>;
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

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: readonly string[]; onChange: (value: string) => void }) {
  return <label className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2"><Filter className="h-4 w-4 text-gray-400" /><span className="sr-only">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="w-full bg-transparent text-sm font-semibold text-gray-700 outline-none">{options.map((option) => <option key={option} value={option}>{option === allFilter ? label : option}</option>)}</select></label>;
}

function SelectField<Value extends string>({ label, value, options, onChange }: { label: string; value: Value; options: readonly Value[]; onChange: (value: Value) => void }) {
  return <label className="block"><span className="text-sm font-bold text-navy">{label}</span><select value={value} onChange={(event) => onChange(event.target.value as Value)} className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10">{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>;
}

function Field({ label, value, onChange, required = false, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; type?: string }) {
  return <label className="block"><span className="text-sm font-bold text-navy">{label}{required ? ' *' : ''}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10" /></label>;
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
