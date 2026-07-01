import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Archive, ArchiveRestore, ArrowUpDown, Building2, ChevronDown, ChevronLeft, ChevronRight, Database, Eye, Filter, Plus, RefreshCw, Save, Search, Star, Trash2, X } from 'lucide-react';
import { useAuthContext } from '../../auth/authContext';
import { DataModePill } from '../../components/common/DataModePill';
import { isSupabaseConfigured } from '../../lib/demoMode';
import { hasLocalSampleData } from '../../utils/dataMode';
import {
  accountPotentials,
  accountToFormInput,
  canUseAccountCloudStore,
  createAccount,
  deleteAccount,
  emptyAccountInput,
  getAccountCode,
  relationshipStatuses,
  updateAccount,
  type AccountFormInput,
  type AccountMemoryRecord,
} from '../../services/accountStore';
import { type CrmLiteOpportunity } from '../../services/opportunityStore';
import { type SalesActivityRecord } from '../../services/salesActivityStore';
import { type StakeholderRecord } from '../../services/stakeholderStore';
import { type ObjectionRecord } from '../../services/objectionStore';
import { getQuoteCommercialStage, getQuoteRisk, quoteRiskTone, type QuoteRecord } from '../../services/quoteStore';
import { loadSalesWorkspaceData } from '../../services/workspaceData';
import {
  buildAccountMemory,
  deriveAccountCandidatesFromActivities,
  deriveAccountCandidatesFromOpportunities,
  mergeAccountCandidates,
  type AccountCandidate,
  type AccountMemory,
} from '../../utils/accountMemory';
import { getStakeholdersForAccount } from '../../utils/stakeholderGraph';
import { getObjectionsForAccount, objectionStatusTone } from '../../utils/objectionLedger';
import {
  formatBaseCurrencyAmount as formatBaseMoney,
  formatCurrencyAmount as formatMoney,
  sumMoneyInBase,
} from '../../utils/money';
import { compareSafeBusinessDate, formatSafeBusinessDate } from '../../utils/safeDate.ts';
import { FollowUpComposerPanel } from '../v31/FollowUpComposerPanel';
import type { FollowUpContext } from '../../types/v31';
import {
  accountEngagementStatuses,
  classifyAccountEngagement,
  isDefaultAccountStatus,
  loadAccountHygienePreferences,
  setAccountArchived,
  setAccountStrategic,
  type AccountEngagementStatus,
  type AccountHygienePreference,
} from '../../utils/accountHygiene.ts';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type SortDirection = 'asc' | 'desc';
type AccountSortKey = 'accountCode' | 'accountName' | 'relationship' | 'potential' | 'activeValue' | 'lastUpdated' | 'health';
type QuickFilter = 'all' | 'imported' | 'keyAccounts' | 'hasTarget' | 'followUpDue' | 'hasStrategy';
type HygieneFilter = 'Active work' | AccountEngagementStatus | 'All';
type AccountNextAction = {
  title: string;
  reason: string;
  cta: string;
  href: string;
  tone: 'blue' | 'green' | 'amber' | 'red';
  badge: string;
};

const allFilter = 'All';
const defaultPageSize = 25;
const founderImportSource = 'founder_core_fy26';

const quickFilterOptions: Array<{ value: QuickFilter; label: string }> = [
  { value: 'all', label: 'All accounts' },
  { value: 'imported', label: 'Imported core' },
  { value: 'keyAccounts', label: 'Key accounts' },
  { value: 'hasTarget', label: 'Has target' },
  { value: 'followUpDue', label: 'Follow-up due' },
  { value: 'hasStrategy', label: 'Has strategy' },
];

export function AccountsPage() {
  const { user, loading: authLoading, isAuthenticated } = useAuthContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const [accounts, setAccounts] = useState<AccountMemoryRecord[]>([]);
  const [opportunities, setOpportunities] = useState<CrmLiteOpportunity[]>([]);
  const [activities, setActivities] = useState<SalesActivityRecord[]>([]);
  const [stakeholders, setStakeholders] = useState<StakeholderRecord[]>([]);
  const [objections, setObjections] = useState<ObjectionRecord[]>([]);
  const [quotes, setQuotes] = useState<QuoteRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastLoadedAt, setLastLoadedAt] = useState('');
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
  const [hygieneFilter, setHygieneFilter] = useState<HygieneFilter>('Active work');
  const [hygienePreferences, setHygienePreferences] = useState<AccountHygienePreference[]>([]);
  const [segmentFilter, setSegmentFilter] = useState(allFilter);
  const [potentialFilter, setPotentialFilter] = useState(allFilter);
  const [relationshipFilter, setRelationshipFilter] = useState(allFilter);
  const [healthFilter, setHealthFilter] = useState(allFilter);
  const [sortKey, setSortKey] = useState<AccountSortKey>('lastUpdated');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [panelMode, setPanelMode] = useState<'closed' | 'add' | 'edit'>('closed');
  const [form, setForm] = useState<AccountFormInput>(emptyAccountInput);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [message, setMessage] = useState('');
  const [followUpContext, setFollowUpContext] = useState<FollowUpContext | null>(null);
  const sampleDataActive = hasLocalSampleData();
  const dataUserId = sampleDataActive ? undefined : user?.id;

  useEffect(() => {
    setHygienePreferences(loadAccountHygienePreferences(user?.id));
  }, [user?.id]);

  const refreshAccounts = async (force = false) => {
    setLoadError('');
    if (accounts.length === 0) setLoading(true);
    else setRefreshing(true);

    try {
      const workspaceData = await loadSalesWorkspaceData(dataUserId, { force });
      setAccounts(workspaceData.accounts);
      setOpportunities(workspaceData.opportunities);
      setActivities(workspaceData.activities);
      setStakeholders(workspaceData.stakeholders);
      setObjections(workspaceData.objections);
      setQuotes(workspaceData.quotes);
      setLastLoadedAt(new Date().toISOString());
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not refresh account data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    refreshAccounts(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataUserId]);

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

  const accountRows = useMemo(
    () => buildAccountMasterRows(memories, stakeholders, objections, quotes, hygienePreferences),
    [hygienePreferences, memories, objections, quotes, stakeholders],
  );

  const visibleRows = useMemo(() => {
    const searchText = query.trim().toLowerCase();
    return accountRows.filter((row) => {
      const account = row.memory.account;
      const searchable = [
        row.accountCode,
        account.accountName,
        account.segment,
        account.industry,
        account.location,
        account.territory,
        account.stateProvince,
        account.priority,
        account.accountMasterStage,
        account.strategy,
        account.strategyOwner,
        account.overdueStatus,
        account.notes,
        account.tags.join(' '),
        row.latestActivity?.summary || '',
        row.latestContact,
      ].join(' ').toLowerCase();
      if (searchText) return searchable.includes(searchText);
      return (
        (hygieneFilter === 'All'
          ? true
          : hygieneFilter === 'Active work'
            ? isDefaultAccountStatus(row.hygiene.status)
            : row.hygiene.status === hygieneFilter) &&
        matchesQuickFilter(account, quickFilter) &&
        (segmentFilter === allFilter || account.segment === segmentFilter) &&
        (potentialFilter === allFilter || account.accountPotential === potentialFilter) &&
        (relationshipFilter === allFilter || account.relationshipStatus === relationshipFilter) &&
        (healthFilter === allFilter || row.memory.health === healthFilter)
      );
    }).sort((left, right) => compareAccountRows(left, right, sortKey, sortDirection));
  }, [accountRows, healthFilter, hygieneFilter, potentialFilter, query, quickFilter, relationshipFilter, segmentFilter, sortDirection, sortKey]);

  const pageCount = Math.max(1, Math.ceil(visibleRows.length / pageSize));
  const pagedRows = useMemo(
    () => visibleRows.slice((page - 1) * pageSize, page * pageSize),
    [page, pageSize, visibleRows],
  );

  useEffect(() => {
    setPage(1);
  }, [healthFilter, hygieneFilter, pageSize, potentialFilter, query, quickFilter, relationshipFilter, segmentFilter]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const selectedAccount = accounts.find((account) => account.id === selectedAccountId) || null;
  const selectedMemory = selectedAccount ? buildAccountMemory(selectedAccount, opportunities, activities) : null;
  const selectedQuotes = selectedAccount
    ? quotes.filter((quote) => sameName(quote.accountName, selectedAccount.accountName))
    : [];
  const selectedHygiene = selectedAccount
    ? classifyAccountEngagement({
      account: selectedAccount,
      opportunities,
      activities,
      objections,
      quotes,
      preference: hygienePreferences.find((item) => item.accountId === selectedAccount.id),
    })
    : null;

  const summary = useMemo(() => buildAccountsSummary(accountRows), [accountRows]);
  const importSummary = useMemo(() => buildImportedCoreSummary(accountRows), [accountRows]);

  const handleSort = (nextKey: AccountSortKey) => {
    if (sortKey === nextKey) {
      setSortDirection((current) => current === 'asc' ? 'desc' : 'asc');
      return;
    }
    setSortKey(nextKey);
    setSortDirection(nextKey === 'lastUpdated' || nextKey === 'activeValue' ? 'desc' : 'asc');
  };

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

  const openFollowUpComposer = (memory: AccountMemory) => {
    const allActivities = [...memory.linkedActivities, ...memory.matchingActivities]
      .sort((left, right) => compareSafeBusinessDate(right.activityDate, left.activityDate) || right.updatedAt.localeCompare(left.updatedAt));
    const currentOpportunity = memory.opportunities.find((opportunity) => opportunity.status === 'Active')
      || memory.opportunities[0];
    const primaryStakeholder = stakeholders.find((stakeholder) =>
      sameName(stakeholder.accountName, memory.account.accountName)
    );

    setFollowUpContext({
      accountName: memory.account.accountName,
      contactName: primaryStakeholder?.name || memory.account.keyStakeholders[0] || '',
      opportunityName: currentOpportunity?.opportunityName || '',
      lastInteractionSummary: allActivities[0]?.summary || '',
      objections: memory.objectionDebt,
      painPoints: allActivities.flatMap((activity) => activity.risks || []).filter(Boolean),
      nextAction: memory.openNextActions[0] || currentOpportunity?.nextAction || '',
      goal: memory.objectionDebt.length > 0 ? 'address_objection' : 'follow_up_after_meeting',
      tone: 'consultative',
      length: 'medium',
    });
  };

  useEffect(() => {
    if (searchParams.get('compose') !== 'follow-up' || accounts.length === 0) return;

    const account = accounts.find((item) => item.id === searchParams.get('accountId')) || accounts[0];
    if (!account) return;

    openEditPanel(account, false);
    openFollowUpComposer(buildAccountMemory(account, opportunities, activities));
    setSearchParams({ accountId: account.id }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts, activities, opportunities, searchParams, setSearchParams, stakeholders]);

  const handleSave = async () => {
    if (!form.accountName.trim()) {
      setSaveState('error');
      setMessage('Add account name first.');
      return;
    }

    setSaveState('saving');
    setMessage('Saving account...');
    const result = panelMode === 'edit' && selectedAccount
      ? await updateAccount(selectedAccount, form, dataUserId)
      : await createAccount(form, dataUserId);

    setAccounts((current) => [result.account, ...current.filter((item) => item.id !== result.account.id)]);
    setSelectedAccountId(result.account.id);
    setPanelMode('edit');
    setForm(accountToFormInput(result.account));
    setSaveState(result.warning ? 'error' : 'saved');
    setMessage(result.warning || (result.mode === 'cloud' ? 'Synced to your account.' : 'Saved locally in this browser.'));
    setSearchParams({ accountId: result.account.id });
  };

  const handleDelete = async (account: AccountMemoryRecord) => {
    const confirmed = window.confirm(`Delete ${account.accountName}?`);
    if (!confirmed) return;

    await deleteAccount(account, dataUserId);
    setAccounts((current) => current.filter((item) => item.id !== account.id));
    closePanel();
  };

  const handleArchive = (account: AccountMemoryRecord, archived: boolean) => {
    setHygienePreferences(setAccountArchived(account.id, archived, user?.id));
    setMessage(archived ? 'Account archived. It remains searchable.' : 'Account restored to account views.');
    setSaveState('saved');
  };

  const handleMarkStrategic = (account: AccountMemoryRecord) => {
    setHygienePreferences(setAccountStrategic(account.id, true, user?.id));
    setMessage('Account marked strategic.');
    setSaveState('saved');
  };

  const handleCreateCandidate = async (candidate: AccountCandidate) => {
    const result = await createAccount({
      ...emptyAccountInput,
      accountName: candidate.accountName,
      relationshipStatus: candidate.activityCount > 0 ? 'Developing' : 'New',
    }, dataUserId);
    setAccounts((current) => [result.account, ...current.filter((item) => item.id !== result.account.id)]);
    openEditPanel(result.account);
    setSaveState(result.warning ? 'error' : 'saved');
    setMessage(result.warning || 'Account created from candidate.');
  };

  return (
    <div className="flex w-full max-w-none flex-col gap-5 px-4 py-5 sm:px-5 lg:px-6">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Account Master</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-navy">Accounts</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
            Search every account while active work stays focused on memory, evidence, and real next actions.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => refreshAccounts(true)}
            disabled={loading || refreshing}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Sync
          </button>
          <DataModePill
            compact
            isLoading={authLoading}
            isAuthenticated={isAuthenticated}
            isSupabaseConfigured={isSupabaseConfigured}
            cloudAvailable={canUseAccountCloudStore(dataUserId)}
            hasSampleData={sampleDataActive}
          />
        </div>
      </header>

      {loadError && (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
          {loadError}
        </section>
      )}

      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <button type="button" onClick={openAddPanel} className="inline-flex items-center justify-center gap-2 rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">
            <Plus className="h-4 w-4" />
            Add Account
          </button>
          <div className="grid flex-1 grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-[1.4fr_repeat(4,1fr)]">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search code, account, industry, note..."
                className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
              />
            </label>
            <FilterSelect label="Segment" value={segmentFilter} options={segments} onChange={setSegmentFilter} />
            <FilterSelect label="Potential" value={potentialFilter} options={[allFilter, ...accountPotentials]} onChange={setPotentialFilter} />
            <FilterSelect label="Relationship" value={relationshipFilter} options={[allFilter, ...relationshipStatuses]} onChange={setRelationshipFilter} />
            <FilterSelect label="Health" value={healthFilter} options={[allFilter, 'Healthy', 'Needs attention', 'At risk', 'Dormant']} onChange={setHealthFilter} />
          </div>
        </div>
        <AccountHygieneTabs value={hygieneFilter} rows={accountRows} onChange={setHygieneFilter} />
        <QuickFilterBar value={quickFilter} onChange={setQuickFilter} importSummary={importSummary} />
      </section>

      <ImportedCoreBanner summary={importSummary} lastLoadedAt={lastLoadedAt} refreshing={refreshing} />

      <AccountMemorySummary summary={summary} />

      <section className="space-y-5">
        {candidates.length > 0 && (
          <CandidateSection candidates={candidates} onCreate={handleCreateCandidate} />
        )}

        {loading ? (
          <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm font-semibold text-gray-500 shadow-sm">Loading account master...</div>
        ) : accounts.length === 0 && candidates.length === 0 ? (
          <EmptyState onAdd={openAddPanel} />
        ) : visibleRows.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm">
            <p className="text-sm font-semibold text-gray-900">No accounts match these filters.</p>
            <p className="mt-1 text-sm text-gray-500">Clear search or filters to review all account records.</p>
          </div>
        ) : (
          <AccountMasterTable
            rows={pagedRows}
            totalRows={visibleRows.length}
            page={page}
            pageCount={pageCount}
            pageSize={pageSize}
            sortKey={sortKey}
            sortDirection={sortDirection}
            onSort={handleSort}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            onOpen={(memory) => openEditPanel(memory.account)}
          />
        )}
      </section>

      <AccountDetailPanel
        mode={panelMode}
        form={form}
        selectedMemory={selectedMemory}
        saveState={saveState}
        message={message}
        stakeholders={selectedAccount ? getStakeholdersForAccount(stakeholders, { id: selectedAccount.id, accountName: selectedAccount.accountName }) : []}
        objections={selectedAccount ? getObjectionsForAccount(objections, { id: selectedAccount.id, accountName: selectedAccount.accountName }) : []}
        quotes={selectedQuotes}
        hygieneStatus={selectedHygiene?.status || null}
        onChange={setForm}
        onSave={handleSave}
        onClose={closePanel}
        onDelete={selectedAccount && selectedHygiene?.status !== 'Imported only' && selectedHygiene?.status !== 'Archived' ? () => handleDelete(selectedAccount) : undefined}
        onDraftFollowUp={selectedMemory ? () => openFollowUpComposer(selectedMemory) : undefined}
        onArchive={selectedAccount ? () => handleArchive(selectedAccount, true) : undefined}
        onUnarchive={selectedAccount ? () => handleArchive(selectedAccount, false) : undefined}
        onMarkStrategic={selectedAccount ? () => handleMarkStrategic(selectedAccount) : undefined}
      />
      {followUpContext && (
        <FollowUpComposerPanel
          initialContext={followUpContext}
          onClose={() => setFollowUpContext(null)}
        />
      )}
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
        <Metric label="Total searchable" value={summary.totalAccounts} />
        <Metric label="Active" value={summary.activeAccounts} tone="green" />
        <Metric label="Needs follow-up" value={summary.followUpAccounts} tone={summary.followUpAccounts ? 'amber' : 'green'} />
        <Metric label="Strategic" value={summary.strategicAccounts} />
        <Metric label="Dormant" value={summary.dormantAccounts} />
        <Metric label="Imported only" value={summary.importedOnlyAccounts} />
        <Metric label="Archived" value={summary.archivedAccounts} />
      </div>
    </section>
  );
}

function AccountHygieneTabs({
  value,
  rows,
  onChange,
}: {
  value: HygieneFilter;
  rows: AccountMasterRow[];
  onChange: (value: HygieneFilter) => void;
}) {
  const options: HygieneFilter[] = ['Active work', ...accountEngagementStatuses, 'All'];
  return (
    <div className="mt-4 flex flex-wrap gap-2 border-t border-gray-100 pt-3" aria-label="Account engagement filters">
      {options.map((option) => {
        const count = option === 'All'
          ? rows.length
          : option === 'Active work'
            ? rows.filter((row) => isDefaultAccountStatus(row.hygiene.status)).length
            : rows.filter((row) => row.hygiene.status === option).length;
        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={`rounded-full border px-3 py-1.5 text-xs font-bold ${value === option ? 'border-brand-blue bg-blue-50 text-brand-blue' : 'border-gray-200 bg-white text-gray-600'}`}
          >
            {option} <span className="ml-1 text-[10px] opacity-70">{count}</span>
          </button>
        );
      })}
    </div>
  );
}

function QuickFilterBar({
  value,
  onChange,
  importSummary,
}: {
  value: QuickFilter;
  onChange: (value: QuickFilter) => void;
  importSummary: ImportedCoreSummary;
}) {
  return (
    <div className="mt-4 flex flex-wrap gap-2 border-t border-gray-100 pt-3">
      {quickFilterOptions.map((option) => {
        const count = quickFilterCount(option.value, importSummary);
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold transition ${
              active ? 'border-brand-blue bg-blue-50 text-brand-blue' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            <span>{option.label}</span>
            {typeof count === 'number' && <span className="rounded-full bg-white/80 px-1.5 py-0.5 font-mono text-[11px]">{count.toLocaleString()}</span>}
          </button>
        );
      })}
    </div>
  );
}

function ImportedCoreBanner({
  summary,
  lastLoadedAt,
  refreshing,
}: {
  summary: ImportedCoreSummary;
  lastLoadedAt: string;
  refreshing: boolean;
}) {
  if (summary.importedAccounts === 0) return null;

  return (
    <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-start gap-3">
          <Database className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
          <div>
            <p className="text-sm font-bold text-emerald-950">Founder core data is loaded</p>
            <p className="mt-1 text-sm leading-6 text-emerald-800">
              {summary.importedAccounts.toLocaleString()} imported accounts, {summary.keyAccounts.toLocaleString()} key accounts, {formatBaseMoney(summary.fy26Target)} FY26 target.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MiniMetric label="With strategy" value={summary.withStrategy} />
          <MiniMetric label="Follow-up due" value={summary.followUpDue} tone={summary.followUpDue ? 'amber' : 'green'} />
          <MiniMetric label="With FY27 target" value={summary.withFy27Target} />
          <MiniMetric label="Loaded" value={refreshing ? 'Syncing' : formatLoadedAt(lastLoadedAt)} />
        </div>
      </div>
    </section>
  );
}

type AccountMasterRow = {
  memory: AccountMemory;
  accountCode: string;
  lastUpdatedAt: string;
  latestActivity: SalesActivityRecord | null;
  latestContact: string;
  stakeholderCount: number;
  openObjectionCount: number;
  hygiene: ReturnType<typeof classifyAccountEngagement>;
};

type ImportedCoreSummary = {
  importedAccounts: number;
  keyAccounts: number;
  withTarget: number;
  withFy26Target: number;
  withFy27Target: number;
  withStrategy: number;
  followUpDue: number;
  fy26Target: number;
  fy27Target: number;
};

function AccountMasterTable({
  rows,
  totalRows,
  page,
  pageCount,
  pageSize,
  sortKey,
  sortDirection,
  onSort,
  onPageChange,
  onPageSizeChange,
  onOpen,
}: {
  rows: AccountMasterRow[];
  totalRows: number;
  page: number;
  pageCount: number;
  pageSize: number;
  sortKey: AccountSortKey;
  sortDirection: SortDirection;
  onSort: (key: AccountSortKey) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onOpen: (memory: AccountMemory) => void;
}) {
  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-gray-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-bold text-navy">Master Account List</h2>
          <p className="mt-1 text-xs text-gray-500">{totalRows.toLocaleString()} accounts after filters</p>
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold text-gray-500">
          Rows
          <select
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            className="rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm font-bold text-gray-700"
          >
            {[25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
        </label>
      </div>

      <div className="max-w-full overflow-x-auto">
        <table className="w-full min-w-[1180px] border-collapse text-left text-sm">
          <thead className="sticky top-0 z-10 bg-gray-50 text-[11px] font-bold uppercase tracking-wide text-gray-500">
            <tr>
              <SortableHeader label="Code" sortKey="accountCode" activeKey={sortKey} direction={sortDirection} onSort={onSort} />
              <SortableHeader label="Account" sortKey="accountName" activeKey={sortKey} direction={sortDirection} onSort={onSort} />
              <th className="border-b border-gray-200 px-3 py-3">Segment / Industry</th>
              <SortableHeader label="Relationship" sortKey="relationship" activeKey={sortKey} direction={sortDirection} onSort={onSort} />
              <SortableHeader label="Potential" sortKey="potential" activeKey={sortKey} direction={sortDirection} onSort={onSort} />
              <SortableHeader label="Pipeline" sortKey="activeValue" activeKey={sortKey} direction={sortDirection} onSort={onSort} />
              <SortableHeader label="Last update" sortKey="lastUpdated" activeKey={sortKey} direction={sortDirection} onSort={onSort} />
              <th className="border-b border-gray-200 px-3 py-3">Latest account memory</th>
              <th className="border-b border-gray-200 px-3 py-3">Engagement</th>
              <th className="border-b border-gray-200 px-3 py-3 text-right">Open</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row) => {
              const { memory } = row;
              return (
                <tr
                  key={memory.account.id}
                  onClick={() => onOpen(memory)}
                  className="cursor-pointer bg-white transition hover:bg-blue-50/60"
                >
                  <td className="whitespace-nowrap px-3 py-3 font-mono text-xs font-bold text-brand-blue">{row.accountCode}</td>
                  <td className="px-3 py-3">
                    <p className="max-w-[220px] truncate font-bold text-navy" title={memory.account.accountName}>{memory.account.accountName}</p>
                    <p className="mt-1 max-w-[220px] truncate text-xs text-gray-500">{formatAccountLocation(memory.account)}</p>
                  </td>
                  <td className="px-3 py-3">
                    <p className="max-w-[170px] truncate font-semibold text-gray-700">{memory.account.segment || 'Unsegmented'}</p>
                    <p className="mt-1 max-w-[170px] truncate text-xs text-gray-500">{formatAccountPriority(memory.account)}</p>
                  </td>
                  <td className="px-3 py-3">
                    <Badge
                      label={memory.account.relationshipStatus}
                      tone={memory.account.relationshipStatus === 'At risk' ? 'red' : memory.account.relationshipStatus === 'Strong' ? 'green' : 'blue'}
                    />
                  </td>
                  <td className="px-3 py-3"><Badge label={memory.account.accountPotential} /></td>
                  <td className="whitespace-nowrap px-3 py-3">
                    {row.hygiene.status === 'Imported only' || row.hygiene.status === 'Archived' ? (
                      <p className="text-xs font-semibold text-gray-400">No pipeline evidence</p>
                    ) : (
                      <><p className="font-bold text-gray-800">{formatBaseMoney(memory.estimatedActiveValue)}</p><p className="mt-1 text-xs text-gray-500">{memory.activeOpportunityCount} active opps</p></>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">
                    <p className="font-semibold text-gray-700">{formatDate(row.lastUpdatedAt)}</p>
                    <p className="mt-1 text-xs text-gray-500">{formatRelativeDate(row.lastUpdatedAt)}</p>
                  </td>
                  <td className="px-3 py-3">
                    {row.latestActivity ? (
                      <>
                        <p className="max-w-[270px] truncate font-semibold text-gray-800" title={row.latestActivity.summary}>
                          {row.latestActivity.summary}
                        </p>
                        <p className="mt-1 max-w-[270px] truncate text-xs text-gray-500">
                          {formatSafeBusinessDate(row.latestActivity.activityDate)} · {row.latestContact || row.latestActivity.activityType}
                        </p>
                      </>
                    ) : (
                      <span className="text-xs text-gray-400">No activity captured</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <Badge label={row.hygiene.status} tone={row.hygiene.status === 'Needs follow-up' ? 'amber' : row.hygiene.status === 'Active' || row.hygiene.status === 'Strategic' ? 'green' : 'gray'} />
                    <p className="mt-1 text-xs text-gray-500">{row.stakeholderCount} contacts · {row.openObjectionCount} open objections</p>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpen(memory);
                      }}
                      title="Open account details"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 hover:border-brand-blue hover:text-brand-blue"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3 border-t border-gray-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-gray-500">
          Showing {totalRows === 0 ? 0 : ((page - 1) * pageSize) + 1}-{Math.min(page * pageSize, totalRows)} of {totalRows.toLocaleString()}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page === 1}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 text-gray-600 disabled:opacity-40"
            title="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[90px] text-center text-xs font-bold text-gray-700">Page {page} / {pageCount}</span>
          <button
            type="button"
            onClick={() => onPageChange(Math.min(pageCount, page + 1))}
            disabled={page === pageCount}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 text-gray-600 disabled:opacity-40"
            title="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </section>
  );
}

function SortableHeader({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
}: {
  label: string;
  sortKey: AccountSortKey;
  activeKey: AccountSortKey;
  direction: SortDirection;
  onSort: (key: AccountSortKey) => void;
}) {
  const active = sortKey === activeKey;
  return (
    <th className="border-b border-gray-200 px-3 py-3">
      <button type="button" onClick={() => onSort(sortKey)} className="inline-flex items-center gap-1 hover:text-navy">
        {label}
        <ArrowUpDown className={`h-3.5 w-3.5 ${active ? 'text-brand-blue' : 'text-gray-300'}`} />
        <span className="sr-only">{active ? `Sorted ${direction}` : 'Not sorted'}</span>
      </button>
    </th>
  );
}

function AccountDetailPanel({
  mode,
  form,
  selectedMemory,
  stakeholders,
  objections,
  quotes,
  hygieneStatus,
  saveState,
  message,
  onChange,
  onSave,
  onClose,
  onDelete,
  onDraftFollowUp,
  onArchive,
  onUnarchive,
  onMarkStrategic,
}: {
  mode: 'closed' | 'add' | 'edit';
  form: AccountFormInput;
  selectedMemory: AccountMemory | null;
  stakeholders: StakeholderRecord[];
  objections: ObjectionRecord[];
  quotes: QuoteRecord[];
  hygieneStatus: AccountEngagementStatus | null;
  saveState: SaveState;
  message: string;
  onChange: (form: AccountFormInput) => void;
  onSave: () => void;
  onClose: () => void;
  onDelete?: () => void;
  onDraftFollowUp?: () => void;
  onArchive?: () => void;
  onUnarchive?: () => void;
  onMarkStrategic?: () => void;
}) {
  if (mode === 'closed') {
    return null;
  }

  const update = <Key extends keyof AccountFormInput>(key: Key, value: AccountFormInput[Key]) => {
    onChange({ ...form, [key]: value });
  };

  return (
    <>
      <button
        type="button"
        aria-label="Close account details"
        onClick={onClose}
        className="fixed inset-y-0 left-0 right-0 top-16 z-40 bg-slate-950/25 backdrop-blur-[1px] lg:left-[220px]"
      />
      <aside className="fixed bottom-0 right-0 top-16 z-50 w-full overflow-y-auto border-l border-gray-200 bg-white p-5 shadow-2xl sm:max-w-[620px]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">{mode === 'add' ? 'Add Account' : 'Account Memory'}</p>
          <h2 className="mt-2 text-xl font-bold text-navy">{mode === 'add' ? 'New account' : selectedMemory?.account.accountName}</h2>
          {selectedMemory && (
            <p className="mt-1 font-mono text-xs font-bold text-gray-400">{getAccountCode(selectedMemory.account)}</p>
          )}
        </div>
        <button type="button" onClick={onClose} className="rounded-full border border-gray-200 p-2 text-gray-500 hover:bg-gray-50">
          <X className="h-4 w-4" />
        </button>
      </div>

      {selectedMemory && (
        <AccountHygieneControls
          status={hygieneStatus || 'Imported only'}
          onArchive={onArchive}
          onUnarchive={onUnarchive}
          onMarkStrategic={onMarkStrategic}
        />
      )}

      {selectedMemory && hygieneStatus !== 'Imported only' && hygieneStatus !== 'Archived' && (
        <AccountNextActionCard
          action={buildAccountNextAction({
            memory: selectedMemory,
            quotes,
            stakeholders,
            objections,
          })}
          onDraftFollowUp={onDraftFollowUp}
        />
      )}

      {selectedMemory && hygieneStatus !== 'Imported only' && hygieneStatus !== 'Archived' && <AccountCommercialLoop memory={selectedMemory} quotes={quotes} />}

      {mode === 'add' ? (
        <>
          <AccountEditFields form={form} update={update} />
          <AccountSaveMessage message={message} saveState={saveState} />
          <AccountSaveActions saveState={saveState} onSave={onSave} />
        </>
      ) : selectedMemory ? (
        <>
          {hygieneStatus === 'Imported only' || hygieneStatus === 'Archived' ? (
            <ImportedOnlyAccountState
              accountName={selectedMemory.account.accountName}
              archived={hygieneStatus === 'Archived'}
              onArchive={onArchive}
              onUnarchive={onUnarchive}
              onMarkStrategic={onMarkStrategic}
            />
          ) : (
            <MemorySections memory={selectedMemory} stakeholders={stakeholders} objections={objections} quotes={quotes} />
          )}
          <details className="group mt-5 rounded-lg border border-gray-200 bg-gray-50">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-bold text-navy">
              Edit account details
              <ChevronDown className="h-4 w-4 text-gray-400 transition-transform group-open:rotate-180" />
            </summary>
            <div className="border-t border-gray-200 bg-white p-4">
              <AccountEditFields form={form} update={update} />
              <ImportedAccountMetadata account={selectedMemory.account} />
              <AccountSaveMessage message={message} saveState={saveState} />
              <AccountSaveActions saveState={saveState} onSave={onSave} onDelete={onDelete} />
            </div>
          </details>
        </>
      ) : null}
      </aside>
    </>
  );
}

function AccountHygieneControls({
  status,
  onArchive,
  onUnarchive,
  onMarkStrategic,
}: {
  status: AccountEngagementStatus;
  onArchive?: () => void;
  onUnarchive?: () => void;
  onMarkStrategic?: () => void;
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
      <Badge label={status} tone={status === 'Needs follow-up' ? 'amber' : status === 'Active' || status === 'Strategic' ? 'green' : 'gray'} />
      {status !== 'Strategic' && status !== 'Archived' && onMarkStrategic && (
        <button type="button" onClick={onMarkStrategic} className="inline-flex items-center gap-1.5 rounded-full border border-blue-100 bg-white px-3 py-1.5 text-xs font-bold text-brand-blue"><Star className="h-3.5 w-3.5" /> Mark strategic</button>
      )}
      {status === 'Archived' && onUnarchive ? (
        <button type="button" onClick={onUnarchive} className="inline-flex items-center gap-1.5 rounded-full border border-emerald-100 bg-white px-3 py-1.5 text-xs font-bold text-emerald-700"><ArchiveRestore className="h-3.5 w-3.5" /> Unarchive account</button>
      ) : onArchive ? (
        <button type="button" onClick={onArchive} className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-600"><Archive className="h-3.5 w-3.5" /> Archive account</button>
      ) : null}
    </div>
  );
}

function ImportedOnlyAccountState({
  accountName,
  archived,
  onArchive,
  onUnarchive,
  onMarkStrategic,
}: {
  accountName: string;
  archived: boolean;
  onArchive?: () => void;
  onUnarchive?: () => void;
  onMarkStrategic?: () => void;
}) {
  return (
    <section className="mt-4 rounded-xl border border-blue-100 bg-blue-50/60 p-5">
      <p className="text-xs font-bold uppercase tracking-wide text-brand-blue">{archived ? 'Archived account' : 'Imported account'}</p>
      <h3 className="mt-2 text-lg font-bold text-navy">{archived ? 'Archived — hidden from active work' : 'Imported account — no sales memory yet'}</h3>
      <p className="mt-2 text-sm leading-6 text-blue-900/70">This record remains searchable. It will not create follow-up urgency until real sales evidence or an explicit action is captured.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link to={`/app/capture?mode=quick&account=${encodeURIComponent(accountName)}`} className="rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">Capture update</Link>
        <Link to={`/app/opportunities?new=1&account=${encodeURIComponent(accountName)}`} className="rounded-full border border-blue-100 bg-white px-4 py-2 text-sm font-bold text-brand-blue">Create opportunity</Link>
        {!archived && onMarkStrategic && <button type="button" onClick={onMarkStrategic} className="rounded-full border border-blue-100 bg-white px-4 py-2 text-sm font-bold text-brand-blue">Mark strategic</button>}
        {archived && onUnarchive
          ? <button type="button" onClick={onUnarchive} className="rounded-full border border-emerald-100 bg-white px-4 py-2 text-sm font-bold text-emerald-700">Unarchive account</button>
          : onArchive && <button type="button" onClick={onArchive} className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-600">Archive</button>}
      </div>
    </section>
  );
}

function AccountEditFields({
  form,
  update,
}: {
  form: AccountFormInput;
  update: <Key extends keyof AccountFormInput>(key: Key, value: AccountFormInput[Key]) => void;
}) {
  return (
    <div className="mt-5 space-y-4 first:mt-0">
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
  );
}

function AccountSaveMessage({ message, saveState }: { message: string; saveState: SaveState }) {
  if (!message) return null;
  return (
    <p className={`mt-4 rounded-lg px-3 py-2 text-sm font-semibold ${
      saveState === 'saved' ? 'bg-emerald-50 text-emerald-700' : saveState === 'error' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'
    }`}>
      {message}
    </p>
  );
}

function AccountSaveActions({
  saveState,
  onSave,
  onDelete,
}: {
  saveState: SaveState;
  onSave: () => void;
  onDelete?: () => void;
}) {
  return (
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
  );
}

function AccountCommercialLoop({ memory, quotes }: { memory: AccountMemory; quotes: QuoteRecord[] }) {
  const activeQuotes = quotes.filter((quote) => quote.status === 'Sent' || quote.status === 'Revised');
  const pendingPoQuotes = quotes.filter((quote) => getQuoteCommercialStage(quote) === 'Pending PO');
  const pendingDeliveryQuotes = quotes.filter((quote) => getQuoteCommercialStage(quote) === 'Pending delivery');
  const pendingPaymentQuotes = quotes.filter((quote) => getQuoteCommercialStage(quote) === 'Pending payment');
  const paidQuotes = quotes.filter((quote) => getQuoteCommercialStage(quote) === 'Paid');
  const riskyQuotes = quotes.filter((quote) => getQuoteRisk(quote) !== 'None');
  const steps = [
    { label: 'Opportunity', value: memory.activeOpportunityCount, hint: 'active' },
    { label: 'Quote', value: activeQuotes.length, hint: 'sent / revised' },
    { label: 'PO', value: pendingPoQuotes.length, hint: 'waiting' },
    { label: 'Delivery', value: pendingDeliveryQuotes.length, hint: 'in progress' },
    { label: 'Payment', value: pendingPaymentQuotes.length, hint: 'waiting' },
    { label: 'Paid', value: paidQuotes.length, hint: 'complete' },
  ];

  return (
    <section className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Commercial loop</p>
          <p className="mt-1 text-sm font-bold text-navy">Opportunity to revenue</p>
        </div>
        <Badge
          label={riskyQuotes.length ? `${riskyQuotes.length} quote risk${riskyQuotes.length === 1 ? '' : 's'}` : 'Flow clear'}
          tone={riskyQuotes.length ? 'amber' : 'green'}
        />
      </div>
      <div className="grid grid-cols-2 divide-x divide-y divide-gray-100 sm:grid-cols-3 xl:grid-cols-6 xl:divide-y-0">
        {steps.map((step) => (
          <div key={step.label} className="min-h-[76px] px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">{step.label}</p>
            <p className="mt-1 text-lg font-black text-navy">{step.value}</p>
            <p className="text-xs text-gray-500">{step.hint}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-gray-100 px-4 py-3 text-xs font-bold">
        <Link to="/app/opportunities" className="text-brand-blue hover:underline">Open opportunities</Link>
        <Link to={`/app/quotes?accountName=${encodeURIComponent(memory.account.accountName)}`} className="text-brand-blue hover:underline">Open quotes</Link>
        <Link to="/app/revenue" className="text-brand-blue hover:underline">Open revenue</Link>
      </div>
    </section>
  );
}

function AccountNextActionCard({
  action,
  onDraftFollowUp,
}: {
  action: AccountNextAction;
  onDraftFollowUp?: () => void;
}) {
  return (
    <section className={`mt-5 rounded-lg border p-4 ${accountActionToneClass(action.tone)}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-bold uppercase tracking-wide">Account next action</p>
            <Badge label={action.badge} tone={action.tone} />
          </div>
          <h3 className="mt-2 text-base font-bold text-navy">{action.title}</h3>
          <p className="mt-1 text-sm leading-6 text-gray-600">{action.reason}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {onDraftFollowUp && (
            <button
              type="button"
              onClick={onDraftFollowUp}
              className="inline-flex w-fit rounded-full border border-blue-100 bg-white px-3 py-1.5 text-xs font-bold text-brand-blue hover:bg-blue-50"
            >
              Draft follow-up
            </button>
          )}
          <Link to={action.href} className="inline-flex w-fit rounded-full bg-navy px-3 py-1.5 text-xs font-bold text-white">
            {action.cta}
          </Link>
        </div>
      </div>
    </section>
  );
}

function buildAccountNextAction({
  memory,
  quotes,
  stakeholders,
  objections,
}: {
  memory: AccountMemory;
  quotes: QuoteRecord[];
  stakeholders: StakeholderRecord[];
  objections: ObjectionRecord[];
}): AccountNextAction {
  const accountName = memory.account.accountName;
  const actionQuotes = [...quotes]
    .filter((quote) => ['Sent', 'Revised', 'Accepted'].includes(quote.status))
    .sort((left, right) => quoteActionRank(right) - quoteActionRank(left) || compareSafeBusinessDate(left.validUntil, right.validUntil));
  const riskyQuote = actionQuotes.find((quote) => getQuoteRisk(quote) !== 'None');
  if (riskyQuote) {
    const risk = getQuoteRisk(riskyQuote);
    const tone = quoteRiskTone(risk);
    return {
      title: riskyQuote.nextAction || `Review ${riskyQuote.title}`,
      reason: `${risk}: ${formatMoney(riskyQuote.amount || 0, riskyQuote.currency)} needs commercial follow-up.`,
      cta: 'Open quotes',
      href: `/app/quotes?accountName=${encodeURIComponent(accountName)}`,
      tone: tone === 'gray' ? 'blue' : tone,
      badge: risk,
    };
  }

  const nextAction = memory.openNextActions[0];
  if (nextAction) {
    return {
      title: nextAction,
      reason: memory.activeOpportunityCount > 0
        ? `${memory.activeOpportunityCount} active opportunit${memory.activeOpportunityCount === 1 ? 'y' : 'ies'} depend on this account touch.`
        : 'This account has a captured next step ready to execute.',
      cta: 'Open capture',
      href: `/app/capture?mode=quick&account=${encodeURIComponent(accountName)}`,
      tone: 'blue',
      badge: 'Follow up',
    };
  }

  const openObjection = objections.find((objection) => objection.status === 'Open');
  if (openObjection) {
    return {
      title: openObjection.requiredProof || openObjection.objectionText,
      reason: `${openObjection.impact} impact objection is still open.`,
      cta: 'Open objections',
      href: `/app/objections?accountName=${encodeURIComponent(accountName)}`,
      tone: openObjection.impact === 'High' ? 'red' : 'amber',
      badge: 'Objection',
    };
  }

  if (memory.activeOpportunityCount > 0 && stakeholders.length === 0) {
    return {
      title: 'Map the buyer or main contact',
      reason: 'Active pipeline exists, but no stakeholder is linked to this account.',
      cta: 'Open stakeholders',
      href: `/app/stakeholders?accountName=${encodeURIComponent(accountName)}`,
      tone: 'amber',
      badge: 'Missing contact',
    };
  }

  if (memory.health === 'Dormant' || memory.health === 'Needs attention') {
    return {
      title: 'Capture a fresh account touch',
      reason: memory.riskSignals[0] || 'Account memory needs a recent customer signal.',
      cta: 'Open capture',
      href: `/app/capture?mode=quick&account=${encodeURIComponent(accountName)}`,
      tone: 'amber',
      badge: memory.health,
    };
  }

  return {
    title: 'Keep account memory current',
    reason: 'No urgent quote, objection, or follow-up risk is blocking this account.',
    cta: 'Open capture',
    href: `/app/capture?mode=quick&account=${encodeURIComponent(accountName)}`,
    tone: 'green',
    badge: 'Clear',
  };

}

function accountActionToneClass(tone: AccountNextAction['tone']) {
  return {
    blue: 'border-blue-100 bg-blue-50/70',
    green: 'border-emerald-100 bg-emerald-50/70',
    amber: 'border-amber-100 bg-amber-50/70',
    red: 'border-red-100 bg-red-50/70',
  }[tone];
}

function ImportedAccountMetadata({ account }: { account: AccountMemoryRecord }) {
  const metadata = [
    account.territory || account.stateProvince ? { label: 'Territory', value: [account.territory, account.stateProvince].filter(Boolean).join(' / ') } : null,
    account.priority ? { label: 'Priority', value: account.priority } : null,
    account.kaFlag !== null && account.kaFlag !== undefined ? { label: 'KA', value: account.kaFlag ? 'Yes' : 'No' } : null,
    account.fy26TargetSgd ? { label: 'FY26 target', value: formatMoney(account.fy26TargetSgd, 'SGD') } : null,
    account.fy27TargetSgd ? { label: 'FY27 target', value: formatMoney(account.fy27TargetSgd, 'SGD') } : null,
    account.accountMasterStage ? { label: 'Source stage', value: account.accountMasterStage } : null,
    account.strategyOwner ? { label: 'Owner', value: account.strategyOwner } : null,
    account.nextFollowUp ? { label: 'Next follow-up', value: formatDate(account.nextFollowUp) } : null,
    account.overdueStatus ? { label: 'Overdue', value: account.overdueStatus } : null,
  ].filter((item): item is { label: string; value: string } => Boolean(item && item.value));

  if (metadata.length === 0 && !account.strategy) return null;

  return (
    <section className="mt-5 rounded-lg border border-blue-100 bg-blue-50/70 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-brand-blue">Imported account metadata</p>
      {metadata.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {metadata.map((item) => (
            <div key={item.label} className="rounded-lg bg-white p-3 ring-1 ring-blue-100">
              <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">{item.label}</p>
              <p className="mt-1 text-sm font-bold text-navy">{item.value}</p>
            </div>
          ))}
        </div>
      )}
      {account.strategy && (
        <p className="mt-3 whitespace-pre-line rounded-lg bg-white p-3 text-sm leading-6 text-gray-700 ring-1 ring-blue-100">
          {account.strategy}
        </p>
      )}
    </section>
  );
}

function MemorySections({
  memory,
  stakeholders,
  objections,
  quotes,
}: {
  memory: AccountMemory;
  stakeholders: StakeholderRecord[];
  objections: ObjectionRecord[];
  quotes: QuoteRecord[];
}) {
  const allActivities = [...memory.linkedActivities, ...memory.matchingActivities]
    .sort((a, b) => compareSafeBusinessDate(b.activityDate, a.activityDate) || b.createdAt.localeCompare(a.createdAt));
  return (
    <div className="mt-5 space-y-4">
      <AccountQuotesSection accountName={memory.account.accountName} quotes={quotes} />

      <details className="group rounded-lg border border-gray-200 bg-gray-50">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-bold text-navy">
          More account context
          <span className="flex items-center gap-2 text-xs font-semibold text-gray-500">
            {stakeholders.length} contacts | {allActivities.length} activities
            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
          </span>
        </summary>
        <div className="space-y-4 border-t border-gray-200 p-4">
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
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Account Objections</p>
          <Link
            to={`/app/objections?accountName=${encodeURIComponent(memory.account.accountName)}`}
            className="inline-flex w-fit rounded-full border border-blue-100 bg-white px-3 py-1.5 text-xs font-bold text-brand-blue hover:bg-blue-50"
          >
            Open Objection Ledger
          </Link>
        </div>
        {objections.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">No structured objections captured for this account yet.</p>
        ) : (
          <div className="mt-3 space-y-2">
            <p className="text-xs font-semibold text-gray-500">
              Open {objections.filter((item) => item.status === 'Open').length} | Resolved {objections.filter((item) => item.status === 'Resolved').length} | Top type {mostCommonObjectionType(objections)}
            </p>
            {objections.slice(0, 6).map((objection) => (
              <div key={objection.id} className="rounded-lg bg-white p-3 ring-1 ring-gray-100">
                <div className="flex flex-wrap gap-2">
                  <Badge label={objection.objectionType} />
                  <Badge label={objection.impact} tone={objection.impact === 'High' ? 'red' : objection.impact === 'Medium' ? 'amber' : 'blue'} />
                  <Badge label={objection.status} tone={objectionStatusTone(objection.status)} />
                </div>
                <p className="mt-2 text-sm font-bold text-navy">{objection.objectionText}</p>
                {objection.requiredProof && <p className="mt-1 text-xs leading-5 text-gray-500">Proof: {objection.requiredProof}</p>}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-gray-100 bg-gray-50 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Stakeholders</p>
          <Link
            to={`/app/stakeholders?accountName=${encodeURIComponent(memory.account.accountName)}`}
            className="inline-flex w-fit rounded-full border border-blue-100 bg-white px-3 py-1.5 text-xs font-bold text-brand-blue hover:bg-blue-50"
          >
            Open Stakeholders
          </Link>
        </div>
        {stakeholders.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">No stakeholders mapped to this account yet.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {stakeholders.slice(0, 6).map((stakeholder) => (
              <div key={stakeholder.id} className="rounded-lg bg-white p-3 ring-1 ring-gray-100">
                <p className="text-sm font-bold text-navy">{stakeholder.name}</p>
                <p className="mt-1 text-xs font-semibold text-gray-500">
                  {stakeholder.stakeholderRole} | {stakeholder.influenceLevel} influence | {stakeholder.stance}
                </p>
                <p className="mt-1 text-xs text-gray-500">{stakeholder.relationshipStrength} relationship{stakeholder.lastInteractionDate ? ` | Last: ${stakeholder.lastInteractionDate}` : ''}</p>
              </div>
            ))}
          </div>
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
                <summary className="cursor-pointer text-sm font-bold text-navy">
                  {formatDate(activity.activityDate)} · {activity.activityType}
                  {getActivityContact(activity) ? ` · ${getActivityContact(activity)}` : ''}
                </summary>
                <p className="mt-2 text-sm leading-6 text-gray-700">{activity.summary}</p>
                {(activity.opportunityName || activity.linkedOpportunityName) && (
                  <p className="mt-2 text-xs font-semibold text-gray-500">
                    Opportunity: {activity.linkedOpportunityName || activity.opportunityName}
                  </p>
                )}
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
      </details>
    </div>
  );
}

function AccountQuotesSection({ accountName, quotes }: { accountName: string; quotes: QuoteRecord[] }) {
  const activeQuotes = quotes.filter((quote) => quote.status === 'Sent' || quote.status === 'Revised');
  const acceptedQuotes = quotes.filter((quote) => quote.status === 'Accepted');
  const actionQuotes = [...quotes]
    .filter((quote) => ['Sent', 'Revised', 'Accepted'].includes(quote.status))
    .sort((left, right) => quoteActionRank(right) - quoteActionRank(left) || compareSafeBusinessDate(left.validUntil, right.validUntil));
  const topQuote = actionQuotes[0] || null;
  const topRisk = topQuote ? getQuoteRisk(topQuote) : null;
  const visibleQuotes = actionQuotes.slice(0, 3);

  return (
    <section className="rounded-lg border border-cyan-100 bg-cyan-50/70 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-cyan-700">Commercial quotes</p>
          <p className="mt-1 text-sm font-bold text-navy">
            {topQuote
              ? `${topQuote.title}: ${topQuote.nextAction || topRisk || 'review quote status'}`
              : 'No quote action is linked to this account yet.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to={`/app/quotes?accountName=${encodeURIComponent(accountName)}`}
            className="inline-flex w-fit rounded-full bg-navy px-3 py-1.5 text-xs font-bold text-white"
          >
            View all quotes
          </Link>
          <Link
            to="/app/revenue"
            className="inline-flex w-fit rounded-full border border-cyan-200 bg-white px-3 py-1.5 text-xs font-bold text-cyan-700"
          >
            Revenue view
          </Link>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <MiniMetric label="Active" value={activeQuotes.length} tone={activeQuotes.length ? 'blue' : 'green'} />
        <MiniMetric label="Accepted" value={acceptedQuotes.length} tone={acceptedQuotes.length ? 'green' : 'blue'} />
        <MiniMetric label="At risk" value={quotes.filter((quote) => getQuoteRisk(quote) !== 'None').length} tone={quotes.some((quote) => getQuoteRisk(quote) !== 'None') ? 'amber' : 'green'} />
      </div>

      {visibleQuotes.length > 0 ? (
        <div className="mt-3 space-y-2">
          {visibleQuotes.map((quote) => {
            const risk = getQuoteRisk(quote);
            return (
              <div key={quote.id} className="rounded-lg bg-white p-3 ring-1 ring-cyan-100">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge label={quote.status} tone={quote.status === 'Accepted' ? 'green' : 'blue'} />
                  {risk !== 'None' && <Badge label={risk} tone={quoteRiskTone(risk)} />}
                  {quote.validUntil && <Badge label={`Valid until ${formatDate(quote.validUntil)}`} tone={risk === 'Expired' ? 'red' : risk === 'Expiring soon' ? 'amber' : 'gray'} />}
                </div>
                <p className="mt-2 text-sm font-bold text-navy">{quote.title}</p>
                <p className="mt-1 text-xs font-semibold text-gray-500">
                  {[quote.opportunityName, formatMoney(quote.amount || 0, quote.currency)].filter(Boolean).join(' | ')}
                </p>
                {quote.nextAction && <p className="mt-2 text-xs font-bold text-cyan-700">Next: {quote.nextAction}</p>}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mt-3 rounded-lg bg-white p-3 text-sm text-gray-500 ring-1 ring-cyan-100">
          Create a quote when this account moves from opportunity to commercial follow-up.
        </p>
      )}
    </section>
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
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-gray-500">
        Accounts remember the relationship context behind your deals: stakeholders, notes, linked activity, open next actions, and objection debt.
      </p>
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

function MiniMetric({ label, value, tone = 'blue' }: { label: string; value: string | number; tone?: 'blue' | 'green' | 'amber' }) {
  const toneClass = {
    blue: 'text-brand-blue',
    green: 'text-emerald-700',
    amber: 'text-amber-700',
  }[tone];
  return (
    <div className="rounded-lg border border-emerald-100 bg-white px-3 py-2">
      <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-800/70">{label}</p>
      <p className={`mt-1 text-sm font-black ${toneClass}`}>{typeof value === 'number' ? value.toLocaleString() : value}</p>
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

function buildAccountMasterRows(
  memories: AccountMemory[],
  stakeholders: StakeholderRecord[],
  objections: ObjectionRecord[],
  quotes: QuoteRecord[],
  preferences: AccountHygienePreference[],
): AccountMasterRow[] {
  return memories.map((memory) => {
    const accountName = normalizeName(memory.account.accountName);
    const accountStakeholders = stakeholders.filter((stakeholder) =>
      stakeholder.accountId === memory.account.id || normalizeName(stakeholder.accountName) === accountName
    );
    const accountObjections = objections.filter((objection) =>
      objection.accountId === memory.account.id || normalizeName(objection.accountName) === accountName
    );
    const activities = [...memory.linkedActivities, ...memory.matchingActivities]
      .sort((left, right) => activityTimestamp(right).localeCompare(activityTimestamp(left)));
    const latestActivity = activities[0] || null;
    const updateCandidates = [
      memory.account.updatedAt,
      ...memory.opportunities.map((opportunity) => opportunity.updatedAt),
      ...activities.map((activity) => activity.updatedAt || activity.createdAt || activity.activityDate),
      ...accountStakeholders.map((stakeholder) => stakeholder.updatedAt),
      ...accountObjections.map((objection) => objection.updatedAt),
    ].filter(Boolean);

    return {
      memory,
      accountCode: getAccountCode(memory.account),
      lastUpdatedAt: updateCandidates.sort().at(-1) || memory.account.createdAt,
      latestActivity,
      latestContact: latestActivity ? getActivityContact(latestActivity) : '',
      stakeholderCount: accountStakeholders.length,
      openObjectionCount: accountObjections.filter((objection) => objection.status === 'Open').length,
      hygiene: classifyAccountEngagement({
        account: memory.account,
        opportunities: memory.opportunities,
        activities,
        objections: accountObjections,
        quotes,
        preference: preferences.find((item) => item.accountId === memory.account.id),
      }),
    };
  });
}

function compareAccountRows(
  left: AccountMasterRow,
  right: AccountMasterRow,
  key: AccountSortKey,
  direction: SortDirection,
) {
  const multiplier = direction === 'asc' ? 1 : -1;
  const values: Record<AccountSortKey, [string | number, string | number]> = {
    accountCode: [left.accountCode, right.accountCode],
    accountName: [left.memory.account.accountName, right.memory.account.accountName],
    relationship: [left.memory.account.relationshipStatus, right.memory.account.relationshipStatus],
    potential: [potentialRank(left.memory.account.accountPotential), potentialRank(right.memory.account.accountPotential)],
    activeValue: [left.memory.estimatedActiveValue, right.memory.estimatedActiveValue],
    lastUpdated: [left.lastUpdatedAt, right.lastUpdatedAt],
    health: [healthRank(left.memory.health), healthRank(right.memory.health)],
  };
  const [leftValue, rightValue] = values[key];
  if (typeof leftValue === 'number' && typeof rightValue === 'number') {
    return (leftValue - rightValue) * multiplier;
  }
  return String(leftValue).localeCompare(String(rightValue), undefined, { numeric: true }) * multiplier;
}

function getActivityContact(activity: SalesActivityRecord) {
  return activity.contactName || activity.stakeholderName || activity.stakeholderRole || '';
}

function formatAccountLocation(account: AccountMemoryRecord) {
  return [account.territory, account.stateProvince].filter(Boolean).join(' / ')
    || account.location
    || 'Location not set';
}

function formatAccountPriority(account: AccountMemoryRecord) {
  const details = [
    account.priority ? `Priority ${account.priority}` : '',
    account.kaFlag ? 'KA' : '',
    account.fy26TargetSgd ? formatMoney(account.fy26TargetSgd, 'SGD') : '',
  ].filter(Boolean);
  return details.join(' | ') || account.industry || 'Industry not set';
}

function activityTimestamp(activity: SalesActivityRecord) {
  return activity.updatedAt || activity.createdAt || `${activity.activityDate}T00:00:00.000Z`;
}

function formatDate(value: string) {
  if (!value) return 'Not updated';
  if (value.length === 10) return formatSafeBusinessDate(value);
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

function formatLoadedAt(value: string) {
  if (!value) return 'Now';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Now';
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatRelativeDate(value: string) {
  if (!value) return '';
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return '';
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days <= 0) return 'Updated today';
  if (days === 1) return 'Updated yesterday';
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}

function potentialRank(value: AccountMemoryRecord['accountPotential']) {
  return { High: 4, Medium: 3, Low: 2, Unknown: 1 }[value];
}

function healthRank(value: AccountMemory['health']) {
  return { 'At risk': 4, 'Needs attention': 3, Dormant: 2, Healthy: 1 }[value];
}

function normalizeName(value: string) {
  return value.trim().toLowerCase();
}

function buildAccountsSummary(rows: AccountMasterRow[]) {
  return {
    totalAccounts: rows.length,
    activeAccounts: rows.filter((row) => row.hygiene.status === 'Active').length,
    followUpAccounts: rows.filter((row) => row.hygiene.status === 'Needs follow-up').length,
    strategicAccounts: rows.filter((row) => row.hygiene.status === 'Strategic').length,
    dormantAccounts: rows.filter((row) => row.hygiene.status === 'Dormant').length,
    importedOnlyAccounts: rows.filter((row) => row.hygiene.status === 'Imported only').length,
    archivedAccounts: rows.filter((row) => row.hygiene.status === 'Archived').length,
  };
}

function buildImportedCoreSummary(rows: AccountMasterRow[]): ImportedCoreSummary {
  const imported = rows.filter((row) => isFounderImportedAccount(row.memory.account));

  return {
    importedAccounts: imported.length,
    keyAccounts: imported.filter((row) => row.memory.account.kaFlag === true).length,
    withTarget: imported.filter((row) => Boolean(row.memory.account.fy26TargetSgd || row.memory.account.fy27TargetSgd)).length,
    withFy26Target: imported.filter((row) => Boolean(row.memory.account.fy26TargetSgd)).length,
    withFy27Target: imported.filter((row) => Boolean(row.memory.account.fy27TargetSgd)).length,
    withStrategy: imported.filter((row) => Boolean(row.memory.account.strategy?.trim())).length,
    followUpDue: imported.filter((row) => row.hygiene.followUpDue).length,
    fy26Target: sumMoneyInBase(imported.map((row) => ({ amount: row.memory.account.fy26TargetSgd, currency: 'SGD' }))),
    fy27Target: sumMoneyInBase(imported.map((row) => ({ amount: row.memory.account.fy27TargetSgd, currency: 'SGD' }))),
  };
}

function matchesQuickFilter(account: AccountMemoryRecord, quickFilter: QuickFilter) {
  switch (quickFilter) {
    case 'imported':
      return isFounderImportedAccount(account);
    case 'keyAccounts':
      return account.kaFlag === true;
    case 'hasTarget':
      return Boolean(account.fy26TargetSgd || account.fy27TargetSgd);
    case 'followUpDue':
      return isDueDate(account.nextFollowUp);
    case 'hasStrategy':
      return Boolean(account.strategy?.trim());
    case 'all':
    default:
      return true;
  }
}

function quickFilterCount(filter: QuickFilter, summary: ImportedCoreSummary) {
  switch (filter) {
    case 'imported':
      return summary.importedAccounts;
    case 'keyAccounts':
      return summary.keyAccounts;
    case 'hasTarget':
      return summary.withTarget;
    case 'followUpDue':
      return summary.followUpDue;
    case 'hasStrategy':
      return summary.withStrategy;
    default:
      return undefined;
  }
}

function isFounderImportedAccount(account: AccountMemoryRecord) {
  return account.sourceSystem === founderImportSource;
}

function isDueDate(value?: string, compareDate = new Date()) {
  if (!value) return false;
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return false;
  const endOfCompareDate = new Date(compareDate);
  endOfCompareDate.setHours(23, 59, 59, 999);
  return date <= endOfCompareDate;
}

function parseCommaList(value: string) {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function sameName(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function quoteActionRank(quote: QuoteRecord) {
  const risk = getQuoteRisk(quote);
  if (risk === 'Expired') return 6;
  if (risk === 'Expiring soon') return 5;
  if (risk === 'Needs commercial follow-up') return 4;
  if (risk === 'Margin check') return 3;
  if (quote.status === 'Accepted') return 2;
  return 1;
}

function mostCommonObjectionType(objections: ObjectionRecord[]) {
  const counts = objections.reduce<Record<string, number>>((acc, objection) => {
    acc[objection.objectionType] = (acc[objection.objectionType] || 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'None';
}

