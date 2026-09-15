import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Filter, MessageSquarePlus, Plus, Save, Search, Trash2 } from 'lucide-react';
import { useAuthContext } from '../../auth/authContext';
import { DataModePill } from '../../components/common/DataModePill';
import { PageContainer, PageHeader } from '../../components/layout/PageFrame';
import { TopBar } from '../../components/layout/TopBarSlot';
import { RecordDrawer } from '../../components/ui/RecordDrawer';
import { MicroLabel, MicroPill, Panel, Segmented, StatusChip } from '../../components/ui/daylight';
import { delay, primaryPillClass } from '../../components/ui/daylightStyles';
import { isSupabaseConfigured } from '../../lib/demoMode';
import { hasLocalSampleData } from '../../utils/dataMode';
import {
  canUseObjectionCloudStore,
  createObjection,
  deleteObjection,
  emptyObjectionInput,
  objectionImpacts,
  objectionStatuses,
  objectionToFormInput,
  objectionTypes,
  updateObjection,
  type ObjectionFormInput,
  type ObjectionRecord,
  type ObjectionStatus,
  type ObjectionType,
} from '../../services/objectionStore';
import { getCachedSalesWorkspaceData, loadSalesWorkspaceData } from '../../services/workspaceData';
import type { CrmLiteOpportunity } from '../../services/opportunityStore';
import { objectionStatusTone } from '../../utils/objectionLedger';
import {
  ageObjections,
  compareByDebtAge,
  isObjectionDebt,
  OBJECTION_AGING_DAYS,
  summariseObjectionTypes,
  valueAtStake,
  type AgedObjection,
} from '../../utils/objectionAging';
import { formatSafeBusinessDate, timestampToLocalDateKey, todayDateKey } from '../../utils/safeDate.ts';
import { formatCompactCurrencyAmount, getReportingCurrency } from '../../utils/money';
import { formatCount } from '../../utils/numberFormat';
import { matchesSearchQuery } from '../../utils/textSearch';
import { useWorkspaceRefresh } from '../../hooks/useWorkspaceRefresh';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type StatusView = ObjectionStatus | 'All';
const allFilter = 'All';

/**
 * One colour per kind of objection, used for its pill in the ledger and the
 * bar on its card - so "Lead time" reads as the same thing in both places.
 * Every one carries white 10px text at 4.5:1 or better; the mock's orange
 * (#E8891A) did not, so lead time wears the darker amber.
 */
const TYPE_COLOUR: Record<ObjectionType, string> = {
  Price: '#C62828',
  'Lead time': '#B45309',
  'Technical fit': '#7B1FA2',
  Documentation: '#0E7490',
  'Local support': '#1976D2',
  'Compliance / validation': '#047857',
  Competitor: '#3949AB',
  Budget: '#C2185B',
  Procurement: '#455A64',
  Timing: '#B91C1C',
  'Trust / relationship': '#6D4C41',
  Other: '#4B5563',
};

export function ObjectionsPage() {
  const { user, loading: authLoading, isAuthenticated } = useAuthContext();
  const [searchParams] = useSearchParams();
  const sampleDataActive = hasLocalSampleData();
  const dataUserId = sampleDataActive ? undefined : user?.id;
  const [objections, setObjections] = useState<ObjectionRecord[]>([]);
  const [workspaceOpportunities, setWorkspaceOpportunities] = useState<CrmLiteOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [accountFilter, setAccountFilter] = useState(searchParams.get('accountName') || allFilter);
  const [opportunityFilter, setOpportunityFilter] = useState(searchParams.get('opportunityName') || allFilter);
  const [typeFilter, setTypeFilter] = useState(allFilter);
  // Open first. The ledger is about what is still owed; a filter that opened on
  // "All" put last quarter's resolved objections between the operator and the
  // one they came here to answer.
  const [statusFilter, setStatusFilter] = useState<StatusView>('Open');
  const [impactFilter, setImpactFilter] = useState(allFilter);
  const [selectedObjection, setSelectedObjection] = useState<ObjectionRecord | null>(null);
  const [panelMode, setPanelMode] = useState<'closed' | 'add' | 'edit'>('closed');
  const [form, setForm] = useState<ObjectionFormInput>(emptyObjectionInput);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [message, setMessage] = useState('');
  const today = todayDateKey();
  const reportingCurrency = getReportingCurrency();

  const refreshObjections = async () => {
    const cachedData = getCachedSalesWorkspaceData(dataUserId);
    if (cachedData) {
      setObjections(cachedData.objections);
      setWorkspaceOpportunities(cachedData.opportunities);
      setLoading(false);
      return;
    }

    setLoading(true);
    const workspaceData = await loadSalesWorkspaceData(dataUserId);
    setObjections(workspaceData.objections);
    setWorkspaceOpportunities(workspaceData.opportunities);
    setLoading(false);
  };

  useEffect(() => {
    refreshObjections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataUserId]);

  // The same catch-up every other records surface has: a screen drawn from the
  // browser copy takes the cloud answer when it lands.
  useWorkspaceRefresh(() => { void refreshObjections(); });

  useEffect(() => {
    setAccountFilter(searchParams.get('accountName') || allFilter);
    setOpportunityFilter(searchParams.get('opportunityName') || allFilter);
  }, [searchParams]);

  const accounts = useMemo(() => [allFilter, ...Array.from(new Set(objections.map((item) => item.accountName).filter(Boolean))).sort()], [objections]);
  const opportunities = useMemo(() => [allFilter, ...Array.from(new Set(objections.map((item) => item.opportunityName).filter(Boolean))).sort()], [objections]);
  const aged = useMemo(
    () => ageObjections({ objections, opportunities: workspaceOpportunities, today }),
    [objections, today, workspaceOpportunities],
  );
  const statusCounts = useMemo(() => {
    const counts = Object.fromEntries(objectionStatuses.map((status) => [status, 0])) as Record<ObjectionStatus, number>;
    objections.forEach((objection) => { counts[objection.status] = (counts[objection.status] || 0) + 1; });
    return counts;
  }, [objections]);
  const debt = useMemo(() => aged.filter((item) => isObjectionDebt(item.objection.status)), [aged]);
  const owedTooLong = debt.filter((item) => item.ageDays !== null && item.ageDays >= OBJECTION_AGING_DAYS).length;
  const typeCards = useMemo(() => summariseObjectionTypes(aged), [aged]);
  const stake = useMemo(() => valueAtStake(aged), [aged]);

  const visibleRows = useMemo(() => {
    const searchText = query.trim().toLowerCase();
    return aged
      .filter(({ objection }) => {
        const searchable = [
          objection.accountName,
          objection.opportunityName,
          objection.stakeholderName,
          objection.objectionType,
          objection.objectionText,
          objection.requiredProof,
          objection.responsePlan,
          objection.tags.join(' '),
        ].join(' ').toLowerCase();
        return (
          matchesSearchQuery(searchable, searchText) &&
          (accountFilter === allFilter || objection.accountName === accountFilter) &&
          (opportunityFilter === allFilter || objection.opportunityName === opportunityFilter) &&
          (typeFilter === allFilter || objection.objectionType === typeFilter) &&
          (statusFilter === allFilter || objection.status === statusFilter) &&
          (impactFilter === allFilter || objection.impact === impactFilter)
        );
      })
      // Oldest debt first, never newest first: the objection nobody has answered
      // for a month is the one costing the deal, and newest-first buried it.
      // A resolved objection owes nothing, so those read most recently closed
      // first instead.
      .sort((left, right) => (
        left.objection.status === 'Resolved' && right.objection.status === 'Resolved'
          ? (right.objection.resolvedAt || '').localeCompare(left.objection.resolvedAt || '')
          : compareByDebtAge(left, right)
      ));
  }, [accountFilter, aged, impactFilter, opportunityFilter, query, statusFilter, typeFilter]);

  const openAddPanel = (seed: Partial<ObjectionFormInput> = {}) => {
    setSelectedObjection(null);
    setForm({ ...emptyObjectionInput, ...seed });
    setPanelMode('add');
    setSaveState('idle');
    setMessage('');
  };

  const openEditPanel = (objection: ObjectionRecord) => {
    setSelectedObjection(objection);
    setForm(objectionToFormInput(objection));
    setPanelMode('edit');
    setSaveState('idle');
    setMessage('');
  };

  const closePanel = () => {
    setSelectedObjection(null);
    setPanelMode('closed');
    setSaveState('idle');
    setMessage('');
  };

  const handleSave = async () => {
    if (!form.objectionText.trim()) {
      setSaveState('error');
      setMessage('Add objection text first.');
      return;
    }
    setSaveState('saving');
    setMessage('Saving objection...');
    const result = panelMode === 'edit' && selectedObjection
      ? await updateObjection(selectedObjection, form, dataUserId)
      : await createObjection(form, dataUserId);
    setObjections((current) => [result.objection, ...current.filter((item) => item.id !== result.objection.id)]);
    setSelectedObjection(result.objection);
    setForm(objectionToFormInput(result.objection));
    setPanelMode('edit');
    setSaveState(result.warning ? 'error' : 'saved');
    setMessage(result.warning || (result.mode === 'cloud' ? 'Synced to your account.' : 'Saved locally in this browser.'));
  };

  const handleDelete = async (objection: ObjectionRecord) => {
    if (!window.confirm('Delete this objection?')) return;
    await deleteObjection(objection, dataUserId);
    setObjections((current) => current.filter((item) => item.id !== objection.id));
    closePanel();
  };

  /*
   * The headline is the debt and what rides on it. "Still owed" rather than
   * "open" because it counts Addressed as well as Open - the same line
   * `getOpenObjectionDebt` draws - and the Open pill beside it counts only one
   * of the two.
   */
  const headline: { title: string; accent?: { text: string; tone: 'red' | 'amber' | 'green' } } = loading
    ? { title: 'Objection ledger' }
    : objections.length === 0
      ? { title: 'No objections logged' }
      : debt.length === 0
        ? { title: `${formatCount(objections.length)} logged`, accent: { text: ', none still owed', tone: 'green' } }
        : stake.total > 0
          ? {
            title: `${formatCount(debt.length)} ${debt.length === 1 ? 'objection' : 'objections'} still owed on `,
            accent: { text: formatCompactCurrencyAmount(stake.total, reportingCurrency), tone: 'red' },
          }
          : { title: `${formatCount(debt.length)} ${debt.length === 1 ? 'objection' : 'objections'} still owed` };

  const maxCardAge = Math.max(30, ...typeCards.map((card) => card.averageAgeDays));
  const statusLabel = statusFilter === allFilter ? 'objections' : statusFilter.toLowerCase();

  return (
    <PageContainer>
      {/* Entity options for the add/edit form: names come from the records the
          workspace already knows, so a typed objection joins the data spine
          instead of inventing a new spelling. */}
      <datalist id="objection-account-options">
        {[...new Set([
          ...workspaceOpportunities.map((item) => item.accountName),
          ...objections.map((item) => item.accountName),
        ].filter(Boolean))].sort().map((name) => <option key={name} value={name} />)}
      </datalist>
      <datalist id="objection-opportunity-options">
        {[...new Set([
          ...workspaceOpportunities.filter((item) => item.status === 'Active').map((item) => item.opportunityName),
          ...objections.map((item) => item.opportunityName),
        ].filter(Boolean))].sort().map((name) => <option key={name} value={name} />)}
      </datalist>

      <TopBar
        status={!loading && debt.length > 0 ? (
          owedTooLong > 0 ? (
            <StatusChip tone="red" className="hidden md:inline-flex">
              {formatCount(owedTooLong)} owed over {OBJECTION_AGING_DAYS} days
            </StatusChip>
          ) : (
            <StatusChip tone="green" className="hidden md:inline-flex">Nothing owed over {OBJECTION_AGING_DAYS} days</StatusChip>
          )
        ) : undefined}
        actions={(
          <button type="button" onClick={() => openAddPanel()} className={`${primaryPillClass} !px-3 sm:!px-5`}>
            {/* A speech glyph, not a plus: on a phone the label is hidden and the
                bar already holds Capture's plus beside it. */}
            <MessageSquarePlus className="h-4 w-4" strokeWidth={2.2} />
            <span className="hidden sm:inline">Log objection</span>
            <span className="sr-only sm:hidden">Log objection</span>
          </button>
        )}
        ownsPrimary
      />

      <PageHeader
        eyebrow="Opportunities · Objections"
        documentTitle="Objections"
        title={headline.title}
        titleAccent={headline.accent}
        actions={(
          <div className="flex flex-wrap items-center gap-2.5">
            <DataModePill
              compact
              quietWhenSynced
              isLoading={authLoading}
              isAuthenticated={isAuthenticated}
              isSupabaseConfigured={isSupabaseConfigured}
              cloudAvailable={canUseObjectionCloudStore(dataUserId)}
              hasSampleData={sampleDataActive}
            />
            <Segmented
              label="Show objections by status"
              semantics="filter"
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                ...objectionStatuses.map((status) => ({ value: status as StatusView, label: status, count: statusCounts[status] })),
                { value: 'All' as StatusView, label: 'All', count: objections.length },
              ]}
            />
          </div>
        )}
      />

      {!loading && typeCards.length > 0 && (
        <section aria-label="Objection debt by type" className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
          {typeCards.map((card, index) => (
            <button
              key={card.type}
              type="button"
              onClick={() => setTypeFilter(card.type)}
              aria-label={`${card.type}: ${card.count} owed, average ${card.averageAgeDays} days open. Show these.`}
              className="animate-rise rounded-tile bg-white px-[18px] py-4 text-left shadow-lift transition hover:-translate-y-[3px] hover:shadow-lift-hi"
              style={delay(40 + index * 40)}
            >
              <MicroLabel className="!tracking-[0.11em]">{card.type}</MicroLabel>
              <span className="mt-2.5 flex items-baseline gap-[7px]">
                <span className="font-display text-[28px] font-extrabold leading-none tracking-[-0.03em] text-ink">{card.count}</span>
                <span className="text-xs text-muted">avg {card.averageAgeDays}d open</span>
              </span>
              <span className="mt-3 block h-[7px] overflow-hidden rounded-full bg-track">
                <span
                  className="block h-full origin-left animate-grow-h rounded-full"
                  style={{
                    width: `${Math.max(4, Math.round((card.averageAgeDays / maxCardAge) * 100))}%`,
                    background: TYPE_COLOUR[card.type],
                    animationDelay: `${300 + index * 60}ms`,
                  }}
                />
              </span>
            </button>
          ))}
        </section>
      )}

      <Panel className="animate-rise overflow-hidden" style={delay(200)} aria-label="Objection ledger">
        <div className="grid grid-cols-1 gap-2 border-b border-line px-5 py-3.5 md:grid-cols-2 lg:px-6 xl:grid-cols-[1.5fr_repeat(4,1fr)]">
          <label className="relative block min-w-0">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-tint-neutral-ink" />
            <span className="sr-only">Search objections</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search objections..."
              className="w-full rounded-full bg-chip py-2 pl-10 pr-4 text-[13px] text-ink outline-none placeholder:text-tint-neutral-ink focus:ring-2 focus:ring-brand-blue/25"
            />
          </label>
          <FilterSelect label="Account" value={accountFilter} options={accounts} onChange={setAccountFilter} />
          <FilterSelect label="Opportunity" value={opportunityFilter} options={opportunities} onChange={setOpportunityFilter} />
          <FilterSelect label="Type" value={typeFilter} options={[allFilter, ...objectionTypes]} onChange={setTypeFilter} />
          <FilterSelect label="Impact" value={impactFilter} options={[allFilter, ...objectionImpacts]} onChange={setImpactFilter} />
        </div>

        {loading ? (
          <p className="px-6 py-8 text-sm font-semibold text-muted">Loading objections...</p>
        ) : visibleRows.length === 0 ? (
          objections.length === 0 ? (
            <EmptyState onAdd={() => openAddPanel()} />
          ) : (
            <p className="px-6 py-8 text-sm text-muted">
              {statusFilter === 'Open' && statusCounts.Open === 0 ? 'Nothing is open. Every objection has an answer or a decision.' : 'No objection matches those filters.'}
            </p>
          )
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] table-fixed border-collapse text-left">
              <colgroup>
                <col className="w-[31%]" />
                <col className="w-[128px]" />
                <col />
                <col className="w-[120px]" />
                <col className="w-[120px]" />
                <col className="w-[136px]" />
              </colgroup>
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className="px-6 py-3"><MicroLabel>Objection</MicroLabel></th>
                  <th scope="col" className="px-2 py-3"><MicroLabel>Type</MicroLabel></th>
                  <th scope="col" className="px-2 py-3"><MicroLabel>Required proof</MicroLabel></th>
                  <th scope="col" className="px-2 py-3"><MicroLabel>Status</MicroLabel></th>
                  <th scope="col" className="px-2 py-3"><MicroLabel>Age</MicroLabel></th>
                  <th scope="col" className="px-6 py-3 text-right"><MicroLabel>At stake</MicroLabel></th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((item) => (
                  <LedgerRow key={item.objection.id} item={item} reportingCurrency={reportingCurrency} onOpen={() => openEditPanel(item.objection)} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && visibleRows.length > 0 && (
          <p className="border-t border-line px-5 py-3 text-[11.5px] text-muted lg:px-6">
            {formatCount(visibleRows.length)} {statusLabel} · sorted by age, oldest debt first · impact High unless marked
          </p>
        )}
      </Panel>

      {panelMode !== 'closed' && (
        <ObjectionPanel
          mode={panelMode}
          form={form}
          record={selectedObjection}
          saveState={saveState}
          message={message}
          onChange={setForm}
          onSave={handleSave}
          onClose={closePanel}
          onDelete={selectedObjection ? () => handleDelete(selectedObjection) : undefined}
        />
      )}
    </PageContainer>
  );
}

const statusPillTone = (status: ObjectionStatus) => {
  const tone = objectionStatusTone(status);
  return tone === 'gray' ? 'neutral' : tone;
};

/** One objection as a line of debt: what was said, what it needs, how long it has waited. */
function LedgerRow({ item, reportingCurrency, onOpen }: { item: AgedObjection; reportingCurrency: string; onOpen: () => void }) {
  const { objection, ageDays, tone, pastDue, atStake } = item;
  const resolved = objection.status === 'Resolved';
  const bar = resolved
    ? { colour: '#90A4AE', text: 'text-muted' }
    : {
      new: { colour: '#43A047', text: 'text-muted' },
      fresh: { colour: '#90A4AE', text: 'text-muted' },
      aging: { colour: '#E8891A', text: 'font-bold text-tint-amber-solid' },
      urgent: { colour: '#C62828', text: 'font-bold text-tint-red-solid' },
    }[tone];
  const ageLabel = ageDays === null ? '—' : ageDays <= 2 && !resolved ? 'New' : `${ageDays}d`;
  const width = ageDays === null ? 0 : Math.max(4, Math.min(100, Math.round((ageDays / 30) * 100)));
  const who = [objection.accountName, objection.stakeholderName].filter(Boolean).join(' · ') || 'No account';

  return (
    <tr className="border-b border-line-soft transition-colors last:border-b-0 hover:bg-canvas">
      <td className="px-6 py-3">
        <button type="button" onClick={onOpen} className="block w-full min-w-0 text-left">
          <span className="block text-[13.5px] font-semibold leading-snug text-ink">&ldquo;{objection.objectionText}&rdquo;</span>
          <span className="mt-0.5 block truncate text-[11.5px] text-muted">
            {who}
            {objection.impact !== 'High' && ` · ${objection.impact === 'Unknown' ? 'impact not rated' : `${objection.impact} impact`}`}
          </span>
        </button>
      </td>
      <td className="px-2 py-3">
        <span
          className="inline-flex max-w-full truncate rounded-full px-[9px] py-1 text-[10px] font-bold uppercase leading-none tracking-[0.08em] text-white"
          style={{ background: TYPE_COLOUR[objection.objectionType] || TYPE_COLOUR.Other }}
          title={objection.objectionType}
        >
          {objection.objectionType}
        </span>
      </td>
      <td className="px-2 py-3">
        {objection.requiredProof ? (
          <span className="line-clamp-2 text-[12px] text-ink">{objection.requiredProof}</span>
        ) : (
          <span className="text-[12px] italic text-muted">No required proof recorded</span>
        )}
      </td>
      <td className="px-2 py-3">
        <MicroPill tone={statusPillTone(objection.status)}>{objection.status}</MicroPill>
        {pastDue && (
          <span className="mt-1 block text-[10.5px] font-semibold text-tint-red-solid">Due {formatSafeBusinessDate(objection.dueDate)}</span>
        )}
      </td>
      <td className="px-2 py-3">
        <span className="flex items-center gap-2">
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-track">
            <span className="block h-full rounded-full" style={{ width: `${width}%`, background: bar.colour }} />
          </span>
          <span className={`w-9 text-right font-mono text-[11.5px] ${bar.text}`}>{ageLabel}</span>
        </span>
      </td>
      <td className="px-6 py-3 text-right">
        {atStake === null ? (
          <span className="font-mono text-[12px] text-muted" title="Not attached to a deal the ledger can price">—</span>
        ) : (
          <span className="whitespace-nowrap font-mono text-[13px] font-bold text-ink">{formatCompactCurrencyAmount(atStake, reportingCurrency)}</span>
        )}
      </td>
    </tr>
  );
}

function ObjectionPanel({
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
  mode: 'add' | 'edit';
  form: ObjectionFormInput;
  record: ObjectionRecord | null;
  saveState: SaveState;
  message: string;
  onChange: (form: ObjectionFormInput) => void;
  onSave: () => void;
  onClose: () => void;
  onDelete?: () => void;
}) {
  const update = <Key extends keyof ObjectionFormInput>(key: Key, value: ObjectionFormInput[Key]) => {
    onChange({ ...form, [key]: value });
  };

  return (
    <RecordDrawer
      eyebrow={mode === 'add' ? 'Add Objection' : 'Objection Detail'}
      title={mode === 'add' ? 'New objection' : form.objectionType}
      label={mode === 'add' ? 'Add objection' : `Objection: ${form.objectionText}`}
      onClose={onClose}
      meta={mode === 'edit' && record ? (
        <p className="mt-1 text-[11.5px] text-muted">
          Raised {formatSafeBusinessDate(timestampToLocalDateKey(record.createdAt))}
          {record.accountName ? ` · ${record.accountName}` : ''}
        </p>
      ) : undefined}
      footer={(
        <>
          <button type="button" onClick={onSave} disabled={saveState === 'saving'} className={primaryPillClass}>
            <Save className="h-4 w-4" />
            {saveState === 'saving' ? 'Saving...' : 'Save Objection'}
          </button>
          {onDelete && (
            <button type="button" onClick={onDelete} className="inline-flex items-center gap-2 rounded-full bg-tint-red-bg px-4 py-2 font-display text-sm font-semibold text-tint-red-solid transition hover:-translate-y-px">
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
          )}
        </>
      )}
    >
      <TextArea label="Objection text" value={form.objectionText} onChange={(value) => update('objectionText', value)} required />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {/* Datalist-backed so typed names land on accounts and deals the
            workspace already knows - one data spine, no loose spellings. */}
        <Field label="Account" value={form.accountName} onChange={(value) => update('accountName', value)} listId="objection-account-options" />
        <Field label="Opportunity" value={form.opportunityName} onChange={(value) => update('opportunityName', value)} listId="objection-opportunity-options" />
        <Field label="Stakeholder" value={form.stakeholderName} onChange={(value) => update('stakeholderName', value)} />
        <SelectField label="Type" value={form.objectionType} options={objectionTypes} onChange={(value) => update('objectionType', value)} />
        <SelectField label="Impact" value={form.impact} options={objectionImpacts} onChange={(value) => update('impact', value)} />
        <SelectField label="Status" value={form.status} options={objectionStatuses} onChange={(value) => update('status', value)} />
        <Field label="Due date" type="date" value={form.dueDate} onChange={(value) => update('dueDate', value)} />
        <Field label="Resolved at" type="datetime-local" value={form.resolvedAt ? form.resolvedAt.slice(0, 16) : ''} onChange={(value) => update('resolvedAt', value ? new Date(value).toISOString() : '')} />
        <Field label="Tags" value={form.tags.join(', ')} onChange={(value) => update('tags', parseCommaList(value))} />
      </div>
      <TextArea label="Required proof" value={form.requiredProof} onChange={(value) => update('requiredProof', value)} />
      <TextArea label="Response plan" value={form.responsePlan} onChange={(value) => update('responsePlan', value)} />
      <TextArea label="Resolution note" value={form.resolutionNote} onChange={(value) => update('resolutionNote', value)} />
      {message && (
        <p className={`rounded-xl px-3 py-2 text-sm font-semibold ${saveState === 'saved' ? 'bg-tint-green-bg text-tint-green-ink' : saveState === 'error' ? 'bg-tint-amber-bg text-tint-amber-ink' : 'bg-tint-blue-bg text-tint-blue-ink'}`}>
          {message}
        </p>
      )}
    </RecordDrawer>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="px-6 py-10 text-center">
      <p className="font-display text-base font-bold text-ink">No objections captured yet.</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">Add objections manually or capture sales activity with risk, competitor, procurement, support, or proof signals.</p>
      <button type="button" onClick={onAdd} className={`${primaryPillClass} mt-5`}>
        <Plus className="h-4 w-4" />
        Add Objection
      </button>
    </div>
  );
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: readonly string[]; onChange: (value: string) => void }) {
  return <label className="flex min-w-0 items-center gap-2 rounded-full border border-line bg-white px-3.5 py-2"><Filter className="h-3.5 w-3.5 shrink-0 text-muted" /><span className="sr-only">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="w-full min-w-0 bg-transparent text-[13px] font-semibold text-gray-700 outline-none">{options.map((option) => <option key={option} value={option}>{option === allFilter ? label : option}</option>)}</select></label>;
}

function SelectField<Value extends string>({ label, value, options, onChange }: { label: string; value: Value; options: readonly Value[]; onChange: (value: Value) => void }) {
  return <label className="block"><span className="text-[12.5px] font-bold text-ink">{label}</span><select value={value} onChange={(event) => onChange(event.target.value as Value)} className="mt-1.5 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10">{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>;
}

function Field({ label, value, onChange, type = 'text', listId }: { label: string; value: string; onChange: (value: string) => void; type?: string; listId?: string }) {
  return <label className="block"><span className="text-[12.5px] font-bold text-ink">{label}</span><input type={type} value={value} list={listId} onChange={(event) => onChange(event.target.value)} className="mt-1.5 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10" /></label>;
}

function TextArea({ label, value, onChange, required = false }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) {
  return <label className="block"><span className="text-[12.5px] font-bold text-ink">{label}{required ? ' *' : ''}</span><textarea value={value} onChange={(event) => onChange(event.target.value)} className="mt-1.5 min-h-[100px] w-full rounded-xl border border-line bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10" /></label>;
}

function parseCommaList(value: string) {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}
