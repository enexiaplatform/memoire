import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Building2, Database, Filter, Plus, Save, Search, Trash2, X } from 'lucide-react';
import { useAuthContext } from '../../auth/authContext';
import {
  accountPotentials,
  accountToFormInput,
  canUseAccountCloudStore,
  createAccount,
  deleteAccount,
  emptyAccountInput,
  loadAccounts,
  relationshipStatuses,
  updateAccount,
  type AccountFormInput,
  type AccountMemoryRecord,
} from '../../services/accountStore';
import { loadOpportunities, type CrmLiteOpportunity } from '../../services/opportunityStore';
import { loadSalesActivities, type SalesActivityRecord } from '../../services/salesActivityStore';
import {
  buildAccountMemory,
  deriveAccountCandidatesFromActivities,
  deriveAccountCandidatesFromOpportunities,
  mergeAccountCandidates,
  type AccountCandidate,
  type AccountMemory,
} from '../../utils/accountMemory';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const allFilter = 'All';

export function AccountsPage() {
  const { user, loading: authLoading, isAuthenticated } = useAuthContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const [accounts, setAccounts] = useState<AccountMemoryRecord[]>([]);
  const [opportunities, setOpportunities] = useState<CrmLiteOpportunity[]>([]);
  const [activities, setActivities] = useState<SalesActivityRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [segmentFilter, setSegmentFilter] = useState(allFilter);
  const [potentialFilter, setPotentialFilter] = useState(allFilter);
  const [relationshipFilter, setRelationshipFilter] = useState(allFilter);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [panelMode, setPanelMode] = useState<'closed' | 'add' | 'edit'>('closed');
  const [form, setForm] = useState<AccountFormInput>(emptyAccountInput);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [message, setMessage] = useState('');

  const storageLabel = useMemo(() => {
    if (authLoading) return 'Checking account...';
    if (canUseAccountCloudStore(user?.id)) return 'Cloud accounts enabled';
    if (isAuthenticated) return 'Cloud unavailable - saving locally';
    return 'Local account mode';
  }, [authLoading, isAuthenticated, user?.id]);

  const refreshAccounts = async () => {
    setLoading(true);
    const [loadedAccounts, loadedOpportunities, loadedActivities] = await Promise.all([
      loadAccounts(user?.id),
      loadOpportunities(user?.id),
      loadSalesActivities(user?.id),
    ]);
    setAccounts(loadedAccounts);
    setOpportunities(loadedOpportunities);
    setActivities(loadedActivities);
    setLoading(false);
  };

  useEffect(() => {
    refreshAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const memories = useMemo(() => {
    return accounts.map((account) => buildAccountMemory(account, opportunities, activities));
  }, [accounts, activities, opportunities]);

  const candidates = useMemo(() => {
    return mergeAccountCandidates(
      deriveAccountCandidatesFromOpportunities(opportunities),
      deriveAccountCandidatesFromActivities(activities),
      accounts,
    );
  }, [accounts, activities, opportunities]);

  const segments = useMemo(() => {
    return [allFilter, ...Array.from(new Set(accounts.map((account) => account.segment).filter(Boolean))).sort()];
  }, [accounts]);

  const visibleMemories = useMemo(() => {
    const searchText = query.trim().toLowerCase();
    return memories.filter((memory) => {
      const account = memory.account;
      const searchable = [
        account.accountName,
        account.segment,
        account.industry,
        account.location,
        account.notes,
        account.tags.join(' '),
      ].join(' ').toLowerCase();
      return (
        (!searchText || searchable.includes(searchText)) &&
        (segmentFilter === allFilter || account.segment === segmentFilter) &&
        (potentialFilter === allFilter || account.accountPotential === potentialFilter) &&
        (relationshipFilter === allFilter || account.relationshipStatus === relationshipFilter)
      );
    });
  }, [memories, potentialFilter, query, relationshipFilter, segmentFilter]);

  const selectedAccount = accounts.find((account) => account.id === selectedAccountId) || null;
  const selectedMemory = selectedAccount ? buildAccountMemory(selectedAccount, opportunities, activities) : null;

  const summary = useMemo(() => buildAccountsSummary(memories), [memories]);

  const openAddPanel = () => {
    setSelectedAccountId('');
    setForm(emptyAccountInput);
    setPanelMode('add');
    setSaveState('idle');
    setMessage('');
    setSearchParams({});
  };

  const openEditPanel = (account: AccountMemoryRecord, updateUrl = true) => {
    setSelectedAccountId(account.id);
    setForm(accountToFormInput(account));
    setPanelMode('edit');
    setSaveState('idle');
    setMessage('');
    if (updateUrl) setSearchParams({ accountId: account.id });
  };

  const closePanel = () => {
    setSelectedAccountId('');
    setPanelMode('closed');
    setSaveState('idle');
    setMessage('');
    setSearchParams({});
  };

  useEffect(() => {
    const accountId = searchParams.get('accountId') || '';
    const accountName = searchParams.get('accountName') || '';
    if (accountId) {
      const account = accounts.find((item) => item.id === accountId);
      if (account) openEditPanel(account, false);
      return;
    }
    if (accountName) {
      const account = accounts.find((item) => sameName(item.accountName, accountName));
      if (account) openEditPanel(account, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts, searchParams]);

  const handleSave = async () => {
    if (!form.accountName.trim()) {
      setSaveState('error');
      setMessage('Add account name first.');
      return;
    }

    setSaveState('saving');
    setMessage('Saving account...');
    const result = panelMode === 'edit' && selectedAccount
      ? await updateAccount(selectedAccount, form, user?.id)
      : await createAccount(form, user?.id);

    setAccounts((current) => [result.account, ...current.filter((item) => item.id !== result.account.id)]);
    setSelectedAccountId(result.account.id);
    setPanelMode('edit');
    setForm(accountToFormInput(result.account));
    setSaveState(result.warning ? 'error' : 'saved');
    setMessage(result.warning || (result.mode === 'cloud' ? 'Saved to cloud.' : 'Saved locally.'));
    setSearchParams({ accountId: result.account.id });
  };

  const handleDelete = async (account: AccountMemoryRecord) => {
    const confirmed = window.confirm(`Delete ${account.accountName}?`);
    if (!confirmed) return;

    await deleteAccount(account, user?.id);
    setAccounts((current) => current.filter((item) => item.id !== account.id));
    closePanel();
  };

  const handleCreateCandidate = async (candidate: AccountCandidate) => {
    const result = await createAccount({
      ...emptyAccountInput,
      accountName: candidate.accountName,
      relationshipStatus: candidate.activityCount > 0 ? 'Developing' : 'New',
    }, user?.id);
    setAccounts((current) => [result.account, ...current.filter((item) => item.id !== result.account.id)]);
    openEditPanel(result.account);
    setSaveState(result.warning ? 'error' : 'saved');
    setMessage(result.warning || 'Account created from candidate.');
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Accounts</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-navy">Accounts</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
            Relationship memory for your B2B accounts, aggregated from opportunities and linked sales activities.
          </p>
        </div>
        <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold ${
          canUseAccountCloudStore(user?.id)
            ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
            : 'border-amber-100 bg-amber-50 text-amber-700'
        }`}>
          <Database className="h-3.5 w-3.5" />
          {storageLabel}
        </span>
      </header>

      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <button type="button" onClick={openAddPanel} className="inline-flex items-center justify-center gap-2 rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">
            <Plus className="h-4 w-4" />
            Add Account
          </button>
          <div className="grid flex-1 grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-[1.5fr_repeat(3,1fr)]">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search account memory..."
                className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
              />
            </label>
            <FilterSelect label="Segment" value={segmentFilter} options={segments} onChange={setSegmentFilter} />
            <FilterSelect label="Potential" value={potentialFilter} options={[allFilter, ...accountPotentials]} onChange={setPotentialFilter} />
            <FilterSelect label="Relationship" value={relationshipFilter} options={[allFilter, ...relationshipStatuses]} onChange={setRelationshipFilter} />
          </div>
        </div>
      </section>

      <AccountMemorySummary summary={summary} />

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_440px]">
        <div className="space-y-5">
          {candidates.length > 0 && (
            <CandidateSection candidates={candidates} onCreate={handleCreateCandidate} />
          )}

          {loading ? (
            <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm font-semibold text-gray-500 shadow-sm">Loading account memory...</div>
          ) : accounts.length === 0 && candidates.length === 0 ? (
            <EmptyState onAdd={openAddPanel} />
          ) : visibleMemories.length === 0 ? (
            <div className="rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm">
              <p className="text-sm font-semibold text-gray-900">No accounts match these filters.</p>
              <p className="mt-1 text-sm text-gray-500">Clear search or filters to review all account memory.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {visibleMemories.map((memory) => (
                <AccountCard key={memory.account.id} memory={memory} onOpen={() => openEditPanel(memory.account)} />
              ))}
            </div>
          )}
        </div>

        <AccountDetailPanel
          mode={panelMode}
          form={form}
          selectedMemory={selectedMemory}
          saveState={saveState}
          message={message}
          onChange={setForm}
          onSave={handleSave}
          onClose={closePanel}
          onDelete={selectedAccount ? () => handleDelete(selectedAccount) : undefined}
        />
      </section>
    </div>
  );
}

function AccountMemorySummary({ summary }: { summary: ReturnType<typeof buildAccountsSummary> }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <Building2 className="h-4 w-4 text-brand-blue" />
        <h2 className="text-lg font-bold text-navy">Account Memory Summary</h2>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-7">
        <Metric label="Total" value={summary.totalAccounts} />
        <Metric label="Active" value={summary.activeAccounts} tone="green" />
        <Metric label="Dormant" value={summary.dormantAccounts} tone={summary.dormantAccounts ? 'amber' : 'green'} />
        <Metric label="High potential" value={summary.highPotentialAccounts} />
        <Metric label="Next actions" value={summary.accountsWithOpenNextActions} />
        <Metric label="Objections" value={summary.accountsWithObjectionDebt} tone={summary.accountsWithObjectionDebt ? 'red' : 'green'} />
        <Metric label="No recent activity" value={summary.accountsWithNoRecentActivity} tone={summary.accountsWithNoRecentActivity ? 'amber' : 'green'} />
      </div>
    </section>
  );
}

function AccountCard({ memory, onOpen }: { memory: AccountMemory; onOpen: () => void }) {
  return (
    <article className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-gray-400">{memory.account.segment || 'No segment'} / {memory.account.industry || 'No industry'}</p>
          <h3 className="mt-1 text-lg font-bold text-navy">{memory.account.accountName}</h3>
        </div>
        <Badge label={memory.health} tone={memory.health === 'At risk' ? 'red' : memory.health === 'Dormant' ? 'amber' : memory.health === 'Needs attention' ? 'amber' : 'green'} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Badge label={memory.account.accountPotential} />
        <Badge label={memory.account.relationshipStatus} tone={memory.account.relationshipStatus === 'At risk' ? 'red' : memory.account.relationshipStatus === 'Strong' ? 'green' : 'blue'} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Fact label="Active opps" value={String(memory.activeOpportunityCount)} />
        <Fact label="Active value" value={formatMoney(memory.estimatedActiveValue)} />
        <Fact label="Last activity" value={memory.latestActivityDate || 'None'} />
        <Fact label="Open actions" value={String(memory.openNextActions.length)} />
        <Fact label="Objections" value={String(memory.objectionDebt.length)} />
      </div>
      {memory.riskSignals.length > 0 && (
        <p className="mt-4 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
          <AlertTriangle className="h-4 w-4" />
          {memory.riskSignals[0]}
        </p>
      )}
      <button type="button" onClick={onOpen} className="mt-4 rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">
        Open Account Memory
      </button>
    </article>
  );
}

function AccountDetailPanel({
  mode,
  form,
  selectedMemory,
  saveState,
  message,
  onChange,
  onSave,
  onClose,
  onDelete,
}: {
  mode: 'closed' | 'add' | 'edit';
  form: AccountFormInput;
  selectedMemory: AccountMemory | null;
  saveState: SaveState;
  message: string;
  onChange: (form: AccountFormInput) => void;
  onSave: () => void;
  onClose: () => void;
  onDelete?: () => void;
}) {
  if (mode === 'closed') {
    return (
      <aside className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Account Detail</p>
        <h2 className="mt-2 text-xl font-bold text-navy">Select or add an account</h2>
        <p className="mt-2 text-sm leading-6 text-gray-500">
          Account Memory combines profile fields, opportunities, linked activities, open actions, and risk signals.
        </p>
      </aside>
    );
  }

  const update = <Key extends keyof AccountFormInput>(key: Key, value: AccountFormInput[Key]) => {
    onChange({ ...form, [key]: value });
  };

  return (
    <aside className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:overflow-y-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">{mode === 'add' ? 'Add Account' : 'Account Memory'}</p>
          <h2 className="mt-2 text-xl font-bold text-navy">{mode === 'add' ? 'New account' : selectedMemory?.account.accountName}</h2>
        </div>
        <button type="button" onClick={onClose} className="rounded-full border border-gray-200 p-2 text-gray-500 hover:bg-gray-50">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-5 space-y-4">
        <Field label="Account name" value={form.accountName} onChange={(value) => update('accountName', value)} required />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Segment" value={form.segment} onChange={(value) => update('segment', value)} />
          <Field label="Industry" value={form.industry} onChange={(value) => update('industry', value)} />
          <Field label="Location" value={form.location} onChange={(value) => update('location', value)} />
          <SelectField label="Potential" value={form.accountPotential} options={accountPotentials} onChange={(value) => update('accountPotential', value)} />
          <SelectField label="Relationship" value={form.relationshipStatus} options={relationshipStatuses} onChange={(value) => update('relationshipStatus', value)} />
        </div>
        <Field label="Key stakeholders" value={form.keyStakeholders.join(', ')} onChange={(value) => update('keyStakeholders', parseCommaList(value))} />
        <Field label="Tags" value={form.tags.join(', ')} onChange={(value) => update('tags', parseCommaList(value))} />
        <TextArea label="Notes" value={form.notes} onChange={(value) => update('notes', value)} />
      </div>

      {selectedMemory && <MemorySections memory={selectedMemory} />}

      {message && (
        <p className={`mt-4 rounded-lg px-3 py-2 text-sm font-semibold ${
          saveState === 'saved' ? 'bg-emerald-50 text-emerald-700' : saveState === 'error' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'
        }`}>
          {message}
        </p>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" onClick={onSave} disabled={saveState === 'saving'} className="inline-flex items-center gap-2 rounded-full bg-navy px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
          <Save className="h-4 w-4" />
          {saveState === 'saving' ? 'Saving...' : 'Save Account'}
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

function MemorySections({ memory }: { memory: AccountMemory }) {
  const allActivities = [...memory.linkedActivities, ...memory.matchingActivities]
    .sort((a, b) => `${b.activityDate}-${b.createdAt}`.localeCompare(`${a.activityDate}-${a.createdAt}`));
  return (
    <div className="mt-5 space-y-4">
      <section className="rounded-lg border border-gray-100 bg-gray-50 p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Account health / risk signals</p>
        <p className="mt-2 text-sm font-bold text-navy">{memory.health}</p>
        {memory.riskSignals.length > 0 ? (
          <ul className="mt-2 space-y-1 text-sm leading-6 text-gray-700">
            {memory.riskSignals.map((signal) => <li key={signal}>- {signal}</li>)}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-emerald-700">No major risk signals detected.</p>
        )}
      </section>

      <section className="rounded-lg border border-gray-100 bg-gray-50 p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Related opportunities</p>
        {memory.opportunities.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">No opportunities connected to this account yet.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {memory.opportunities.map((opportunity) => (
              <div key={opportunity.id} className="rounded-lg bg-white p-3 ring-1 ring-gray-100">
                <p className="text-sm font-bold text-navy">{opportunity.opportunityName}</p>
                <p className="mt-1 text-xs font-semibold text-gray-500">{opportunity.stage} | {opportunity.status} | {formatMoney(opportunity.estimatedValue || 0, opportunity.currency)}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-gray-100 bg-gray-50 p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Linked activities timeline</p>
        {allActivities.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">No activities linked to this account yet.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {allActivities.map((activity) => (
              <details key={activity.id} className="rounded-lg bg-white p-3 ring-1 ring-gray-100">
                <summary className="cursor-pointer text-sm font-bold text-navy">{activity.activityDate} | {activity.activityType}</summary>
                <p className="mt-2 text-sm leading-6 text-gray-700">{activity.summary}</p>
                {activity.nextAction && <p className="mt-2 text-xs font-bold text-brand-blue">Next: {activity.nextAction}</p>}
                <p className="mt-2 whitespace-pre-line text-xs leading-5 text-gray-500">{activity.rawNote}</p>
              </details>
            ))}
          </div>
        )}
      </section>

      <ListSection title="Open next actions" items={memory.openNextActions} empty="No open next actions captured." />
      <ListSection title="Objection debt" items={memory.objectionDebt} empty="No objection debt captured." />
    </div>
  );
}

function CandidateSection({ candidates, onCreate }: { candidates: AccountCandidate[]; onCreate: (candidate: AccountCandidate) => void }) {
  return (
    <section className="rounded-lg border border-blue-100 bg-blue-50/70 p-4">
      <p className="text-sm font-bold text-blue-950">Suggested accounts from your pipeline/activity</p>
      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
        {candidates.slice(0, 6).map((candidate) => (
          <div key={candidate.accountName} className="rounded-lg bg-white p-3 ring-1 ring-blue-100">
            <p className="font-bold text-navy">{candidate.accountName}</p>
            <p className="mt-1 text-xs font-semibold text-gray-500">
              {candidate.opportunityCount} opportunities | {candidate.activityCount} activities | {candidate.source}
            </p>
            <button type="button" onClick={() => onCreate(candidate)} className="mt-3 rounded-full bg-navy px-3 py-1.5 text-xs font-bold text-white">
              Create account from candidate
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm">
      <p className="text-base font-bold text-navy">No accounts yet.</p>
      <p className="mt-2 text-sm text-gray-500">Add your first account or create opportunities/capture activities first.</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <button type="button" onClick={onAdd} className="rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">Add Account</button>
        <Link to="/app/opportunities" className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700">Go to Opportunities</Link>
        <Link to="/app/capture" className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700">Go to Capture</Link>
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
        {options.map((option) => <option key={option} value={option}>{option === allFilter ? label : option}</option>)}
      </select>
    </label>
  );
}

function SelectField<Value extends string>({ label, value, options, onChange }: { label: string; value: Value; options: readonly Value[]; onChange: (value: Value) => void }) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-navy">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value as Value)} className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10">
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function Field({ label, value, onChange, required = false }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-navy">{label}{required ? ' *' : ''}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10" />
    </label>
  );
}

function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-navy">{label}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={4} className="mt-2 w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10" />
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

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-gray-50 p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 text-sm font-semibold text-gray-800">{value}</p>
    </div>
  );
}

function Badge({ label, tone = 'blue' }: { label: string; tone?: 'blue' | 'green' | 'amber' | 'red' }) {
  const toneClass = {
    blue: 'border-blue-100 bg-blue-50 text-brand-blue',
    green: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-100 bg-amber-50 text-amber-700',
    red: 'border-red-100 bg-red-50 text-red-700',
  }[tone];
  return <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${toneClass}`}>{label}</span>;
}

function ListSection({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <section className="rounded-lg border border-gray-100 bg-gray-50 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-gray-400">{title}</p>
      {items.length === 0 ? <p className="mt-2 text-sm text-gray-500">{empty}</p> : (
        <ul className="mt-2 space-y-1 text-sm leading-6 text-gray-700">
          {items.map((item) => <li key={item}>- {item}</li>)}
        </ul>
      )}
    </section>
  );
}

function buildAccountsSummary(memories: AccountMemory[]) {
  return {
    totalAccounts: memories.length,
    activeAccounts: memories.filter((memory) => memory.account.relationshipStatus === 'Active' || memory.activeOpportunityCount > 0).length,
    dormantAccounts: memories.filter((memory) => memory.health === 'Dormant').length,
    highPotentialAccounts: memories.filter((memory) => memory.account.accountPotential === 'High').length,
    accountsWithOpenNextActions: memories.filter((memory) => memory.openNextActions.length > 0).length,
    accountsWithObjectionDebt: memories.filter((memory) => memory.objectionDebt.length > 0).length,
    accountsWithNoRecentActivity: memories.filter((memory) => !memory.latestActivityDate || isOlderThan(memory.latestActivityDate, 30)).length,
  };
}

function parseCommaList(value: string) {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function formatMoney(value: number, currency = 'VND') {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: currency === 'VND' ? 0 : 2 }).format(value);
}

function sameName(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function isOlderThan(dateKey: string, days: number) {
  return Math.floor((Date.now() - new Date(`${dateKey}T00:00:00`).getTime()) / 86_400_000) > days;
}
