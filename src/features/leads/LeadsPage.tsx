import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, NotebookPen, Search, Upload, UserPlus } from 'lucide-react';
import { useAuthContext } from '../../auth/authContext';
import { PageContainer, PageHeader } from '../../components/layout/PageFrame';
import { TopBar } from '../../components/layout/TopBarSlot';
import { Panel, Segmented, StatusChip, type SegmentOption } from '../../components/ui/daylight';
import { ghostPillClass, primaryPillClass } from '../../components/ui/daylightStyles';
import { SkeletonCard } from '../../components/common/Skeleton';
import { useWorkspaceRefresh } from '../../hooks/useWorkspaceRefresh';
import { derivePlanCommitments } from '../../domain/commercialKernel/derivePlanCommitments';
import {
  getCachedSalesWorkspaceData,
  loadSalesWorkspaceData,
  type SalesWorkspaceData,
} from '../../services/workspaceData';
import { loadPlanItemsForWorkspace } from '../../services/planItemStore';
import { createLead, disqualifyLead, nurtureLead, qualifyLead } from '../../services/leadCommands';
import type { CrmLiteOpportunity } from '../../services/opportunityStore';
import type { PlanRecord } from '../../utils/weeklyPlan';
import { hasLocalSampleData } from '../../utils/dataMode';
import { formatSafeBusinessDate } from '../../utils/safeDate';
import { getReportingCurrency } from '../../utils/money';
import { formatCount } from '../../utils/numberFormat';
import { matchesSearchQuery } from '../../utils/textSearch';
import {
  buildLeadQueue,
  leadQueueStateLabels,
  leadQueueStates,
  type LeadQueueState,
  type LeadRow,
} from '../../utils/leadQueue';
import { LeadQueueList } from './LeadQueueList';
import { AddLeadDrawer, DisqualifyLeadDrawer, NurtureLeadDrawer } from './LeadActionDrawers';
import { emptyNewLead, type NewLeadInput } from './newLead';

/**
 * Leads - the seventh primary destination.
 *
 * The question this page answers is "who is worth progressing, nurturing,
 * contacting or dropping?", and the page is built as a queue of that work
 * rather than as a database of leads. It opens on the leads that need
 * something, sorted by what needs doing, with the three decisions on the row.
 *
 * What it does not answer is "what is my pipeline worth". There is no total
 * value in the header, no forecast and no quarter grouping here on purpose: a
 * lead has not shown a need yet, and a sum of lead values is a number built from
 * guesses about conversations that have not happened.
 *
 * Every rule on the page - the states, the evidence, the silence, the revisit -
 * comes from `buildLeadQueue`. Today reads the same function, so "3 new leads
 * never contacted" on Today is the same three rows this page shows under New.
 */

type QueueFilter = 'all' | LeadQueueState | 'closed';

const FILTER_VALUES: QueueFilter[] = ['all', ...leadQueueStates, 'closed'];

function readFilter(value: string | null): QueueFilter {
  return FILTER_VALUES.includes(value as QueueFilter) ? (value as QueueFilter) : 'all';
}

type Drawer =
  | { kind: 'none' }
  | { kind: 'add' }
  | { kind: 'nurture'; opportunity: CrmLiteOpportunity }
  | { kind: 'disqualify'; opportunity: CrmLiteOpportunity };

export function LeadsPage() {
  const { user } = useAuthContext();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const sampleDataActive = hasLocalSampleData();
  const dataUserId = sampleDataActive ? undefined : user?.id;

  const [data, setData] = useState<SalesWorkspaceData | null>(() => getCachedSalesWorkspaceData(dataUserId));
  const [planItems, setPlanItems] = useState<PlanRecord[]>([]);
  const [loading, setLoading] = useState(() => !getCachedSalesWorkspaceData(dataUserId));
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [drawer, setDrawer] = useState<Drawer>({ kind: 'none' });
  const [busyId, setBusyId] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: 'neutral' | 'green' | 'red'; href?: string; hrefLabel?: string } | null>(null);
  const [newLead, setNewLead] = useState<NewLeadInput>(emptyNewLead);
  const [addMessage, setAddMessage] = useState('');

  const filter = readFilter(searchParams.get('state'));

  const refresh = useCallback(async (options: { force?: boolean } = {}) => {
    setLoadError('');
    if (!options.force) {
      const cached = getCachedSalesWorkspaceData(dataUserId);
      if (cached) {
        setData(cached);
        setLoading(false);
      }
    }
    try {
      const [workspace, plan] = await Promise.all([
        loadSalesWorkspaceData(dataUserId, { force: options.force }),
        loadPlanItemsForWorkspace(dataUserId, sampleDataActive).catch(() => [] as PlanRecord[]),
      ]);
      setData(workspace);
      setPlanItems(plan);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Memoire could not load your leads.');
    } finally {
      setLoading(false);
    }
  }, [dataUserId, sampleDataActive]);

  useEffect(() => { void refresh(); }, [refresh]);
  useWorkspaceRefresh(() => { void refresh(); });

  // `?action=add` is the command bar's and the empty state's door into the form.
  useEffect(() => {
    if (searchParams.get('action') !== 'add') return;
    setDrawer({ kind: 'add' });
    const params = new URLSearchParams(searchParams);
    params.delete('action');
    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams]);

  const plannedCommitments = useMemo(
    () => derivePlanCommitments({
      activities: data?.activities || [],
      planItems,
      includeSampleRecords: sampleDataActive,
    }),
    [data?.activities, planItems, sampleDataActive],
  );

  const queue = useMemo(() => buildLeadQueue({
    opportunities: data?.opportunities || [],
    activities: data?.activities || [],
    stakeholders: data?.stakeholders || [],
    objections: data?.objections || [],
    accounts: data?.accounts || [],
    opportunityOutcomes: data?.opportunityOutcomes || [],
    plannedCommitments,
  }), [data, plannedCommitments]);

  const visibleRows = useMemo(() => {
    const query = search.trim();
    return queue.rows.filter((row) => {
      if (filter === 'closed') { if (!row.closed) return false; }
      else if (row.closed) return false;
      else if (filter !== 'all' && row.state !== filter) return false;
      if (!query) return true;
      return matchesSearchQuery([
        row.opportunity.accountName,
        row.opportunity.opportunityName,
        row.contactName,
        row.source.label,
        row.source.detail,
        row.opportunity.nextAction,
      ].join(' '), query);
    });
  }, [filter, queue.rows, search]);

  // A state with nothing in it is offered only while it is the one selected - a
  // row of six pills, four reading "0", is the dashboard this page is not, and
  // on a phone it wrapped into three lines above the first lead.
  const filterOptions: SegmentOption<QueueFilter>[] = [
    { value: 'all', label: 'All open', count: queue.total },
    ...leadQueueStates
      .filter((state) => queue.counts[state] > 0 || filter === state)
      .map((state) => ({ value: state, label: leadQueueStateLabels[state], count: queue.counts[state] })),
    ...(queue.closedCount > 0 ? [{ value: 'closed' as const, label: 'Disqualified', count: queue.closedCount }] : []),
  ];

  const selectFilter = (next: QueueFilter) => {
    const params = new URLSearchParams(searchParams);
    if (next === 'all') params.delete('state');
    else params.set('state', next);
    setSearchParams(params, { replace: true });
  };

  const replaceRecord = (record: CrmLiteOpportunity) => {
    setData((current) => current && ({
      ...current,
      opportunities: [record, ...current.opportunities.filter((item) => item.id !== record.id)],
    }));
  };

  /**
   * Opens the full record. The editor is the one on Opportunities - there is
   * one deal editor in the product, and a lead is a deal - and `from=leads`
   * brings the operator back here when they close it.
   */
  const openLead = (opportunity: CrmLiteOpportunity) => {
    navigate(`/app/opportunities?opportunityId=${encodeURIComponent(opportunity.id)}&from=leads`);
  };

  const handleQualify = async (opportunity: CrmLiteOpportunity) => {
    if (busyId) return;
    setBusyId(opportunity.id);
    setMessage(null);
    try {
      const result = await qualifyLead(opportunity, dataUserId);
      replaceRecord(result.opportunity);
      setMessage({
        tone: result.warning ? 'red' : 'green',
        text: result.warning || `${opportunity.accountName || 'The lead'} is qualified. It is now in Opportunities at Discovery, with everything recorded on it.`,
        href: `/app/opportunities?opportunityId=${encodeURIComponent(opportunity.id)}`,
        hrefLabel: 'Open the deal',
      });
    } catch {
      setMessage({ tone: 'red', text: 'Could not qualify it. Nothing was changed - try again.' });
    } finally {
      setBusyId('');
    }
  };

  const handleNurture = async (opportunity: CrmLiteOpportunity, input: { nurturedUntil: string; nurtureReason: string }) => {
    setSaving(true);
    try {
      const result = await nurtureLead(opportunity, input, dataUserId);
      replaceRecord(result.opportunity);
      setDrawer({ kind: 'none' });
      setMessage({
        tone: result.warning ? 'red' : 'neutral',
        text: result.warning || (input.nurturedUntil
          ? `${opportunity.accountName || 'The lead'} is parked. It comes back into the queue before ${formatSafeBusinessDate(input.nurturedUntil)}.`
          : `${opportunity.accountName || 'The lead'} is back in the working queue.`),
      });
    } catch {
      setMessage({ tone: 'red', text: 'Could not save the revisit date. Nothing was changed - try again.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDisqualify = async (opportunity: CrmLiteOpportunity, input: Parameters<typeof disqualifyLead>[1]) => {
    setSaving(true);
    try {
      const result = await disqualifyLead(opportunity, input, dataUserId);
      replaceRecord(result.opportunity);
      setData((current) => current && ({
        ...current,
        opportunityOutcomes: [result.outcome, ...current.opportunityOutcomes.filter((item) => item.id !== result.outcome.id)],
      }));
      setDrawer({ kind: 'none' });
      setMessage({
        tone: result.warning ? 'red' : 'neutral',
        text: result.warning || `${opportunity.accountName || 'The lead'} is closed: ${input.reason}. The record is kept under Disqualified.`,
      });
    } catch {
      setMessage({ tone: 'red', text: 'Could not disqualify it. Nothing was changed - try again.' });
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = async () => {
    if (!newLead.accountName.trim()) {
      setAddMessage('Name the customer first.');
      return;
    }
    setSaving(true);
    setAddMessage('');
    try {
      const result = await createLead(
        { ...newLead, currency: getReportingCurrency() },
        dataUserId,
        { source: sampleDataActive ? 'demo' : 'user', isSample: sampleDataActive },
      );
      replaceRecord(result.opportunity);
      if (result.stakeholder) {
        const person = result.stakeholder;
        setData((current) => current && ({ ...current, stakeholders: [person, ...current.stakeholders] }));
      }
      setDrawer({ kind: 'none' });
      setNewLead(emptyNewLead);
      setMessage({
        tone: result.warning ? 'red' : 'green',
        text: result.warning || `${result.opportunity.accountName} is in the queue as a new lead.`,
      });
    } catch (error) {
      setAddMessage(error instanceof Error ? error.message : 'Could not add the lead. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const accountOptions = useMemo(() => {
    const names = new Set<string>();
    (data?.accounts || []).forEach((account) => account.accountName && names.add(account.accountName));
    (data?.opportunities || []).forEach((opportunity) => opportunity.accountName && names.add(opportunity.accountName));
    return [...names].sort((left, right) => left.localeCompare(right));
  }, [data?.accounts, data?.opportunities]);

  const worst = headlineFor(queue.counts, queue.total);

  return (
    <PageContainer>
      <TopBar
        status={!loading && queue.total > 0 ? (
          <StatusChip tone={worst.tone} className="hidden md:inline-flex">{worst.chip}</StatusChip>
        ) : undefined}
        ownsPrimary
        actions={(
          <button type="button" onClick={() => setDrawer({ kind: 'add' })} className={`${primaryPillClass} !px-3 sm:!px-5`}>
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Add lead</span>
            <span className="sr-only sm:hidden">Add lead</span>
          </button>
        )}
      />

      <PageHeader
        // The empty panel below already says "No leads waiting."; a headline
        // saying it too is the same sentence twice, one above the other.
        title={loading || queue.total === 0 ? 'Leads' : `${formatCount(queue.total)} ${queue.total === 1 ? 'lead' : 'leads'}`}
        titleAccent={!loading && worst.accent ? { text: `, ${worst.accent}`, tone: worst.tone === 'green' ? 'green' : worst.tone === 'red' ? 'red' : 'amber' } : undefined}
        documentTitle="Leads"
        description={queue.total > 0
          ? 'Who is worth progressing, nurturing or dropping. Qualify moves a lead into Opportunities with everything recorded on it.'
          : undefined}
        tabs={queue.total > 0 || queue.closedCount > 0 ? (
          <Segmented
            label="Filter leads by state"
            semantics="filter"
            value={filter}
            onChange={selectFilter}
            options={filterOptions}
          />
        ) : undefined}
      />

      {message && (
        <Panel className={`flex flex-wrap items-center justify-between gap-3 px-5 py-3 ${message.tone === 'red' ? 'bg-tint-red-bg' : message.tone === 'green' ? 'bg-tint-green-bg' : ''}`}>
          <p role="status" className={`text-[13px] font-semibold ${message.tone === 'red' ? 'text-tint-red-ink' : message.tone === 'green' ? 'text-tint-green-ink' : 'text-ink'}`}>
            {message.text}
          </p>
          <span className="flex items-center gap-2">
            {message.href && (
              <Link to={message.href} className={`${ghostPillClass} px-3 py-1.5 text-xs`}>{message.hrefLabel}</Link>
            )}
            <button type="button" onClick={() => setMessage(null)} className="text-xs font-semibold text-muted hover:text-ink">
              Dismiss
            </button>
          </span>
        </Panel>
      )}

      {loadError && (
        <Panel className="flex flex-wrap items-center justify-between gap-3 bg-tint-red-bg px-5 py-3">
          <p role="alert" className="text-[13px] font-semibold text-tint-red-ink">{loadError}</p>
          <button type="button" onClick={() => { void refresh({ force: true }); }} className={`${ghostPillClass} px-3 py-1.5 text-xs`}>
            Try again
          </button>
        </Panel>
      )}

      {loading && !data ? (
        <div aria-busy="true" aria-label="Loading leads" className="flex flex-col gap-3">
          <p className="flex items-center gap-2 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Reading your leads…
          </p>
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : queue.total === 0 && queue.closedCount === 0 ? (
        <LeadsEmptyState onAdd={() => setDrawer({ kind: 'add' })} />
      ) : (
        <>
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search customer, person, source or next step"
              aria-label="Search leads"
              className="w-full rounded-full border border-line bg-white py-2 pl-10 pr-4 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
            />
          </div>

          {visibleRows.length > 0 ? (
            <LeadQueueList
              rows={visibleRows}
              caption={captionFor(filter, visibleRows)}
              actions={{
                busyId,
                onOpen: openLead,
                onQualify: (opportunity) => { void handleQualify(opportunity); },
                onNurture: (opportunity) => setDrawer({ kind: 'nurture', opportunity }),
                onDisqualify: (opportunity) => setDrawer({ kind: 'disqualify', opportunity }),
              }}
            />
          ) : (
            <Panel className="px-6 py-8 text-center">
              <p className="font-display text-base font-bold text-ink">
                {search.trim() ? 'No lead matches that search.' : `Nothing is ${filter === 'closed' ? 'disqualified' : `in ${leadQueueStateLabels[filter as LeadQueueState] || 'this view'}`} right now.`}
              </p>
              <p className="mt-1 text-sm text-tint-neutral-ink">
                {search.trim() ? 'Try the customer, the person you met, or the event.' : 'That is the good kind of empty.'}
              </p>
              <button type="button" onClick={() => { setSearch(''); selectFilter('all'); }} className={`mt-4 ${ghostPillClass}`}>
                Show all open leads
              </button>
            </Panel>
          )}
        </>
      )}

      {drawer.kind === 'add' && (
        <AddLeadDrawer
          form={newLead}
          saving={saving}
          message={addMessage}
          accountOptions={accountOptions}
          onChange={setNewLead}
          onClose={() => { setDrawer({ kind: 'none' }); setAddMessage(''); }}
          onSave={() => { void handleAdd(); }}
        />
      )}
      {drawer.kind === 'nurture' && (
        <NurtureLeadDrawer
          opportunity={drawer.opportunity}
          saving={saving}
          onClose={() => setDrawer({ kind: 'none' })}
          onSave={(input) => { void handleNurture(drawer.opportunity, input); }}
        />
      )}
      {drawer.kind === 'disqualify' && (
        <DisqualifyLeadDrawer
          opportunity={drawer.opportunity}
          saving={saving}
          onClose={() => setDrawer({ kind: 'none' })}
          onSave={(input) => { void handleDisqualify(drawer.opportunity, input); }}
        />
      )}
    </PageContainer>
  );
}

/**
 * The header's second clause and the top bar's chip: the worst thing about the
 * queue, in the order an operator would want to hear it.
 */
function headlineFor(counts: Record<LeadQueueState, number>, total: number): {
  accent: string;
  chip: string;
  tone: 'red' | 'amber' | 'green' | 'neutral';
} {
  if (counts['needs-action'] > 0) {
    return { accent: `${formatCount(counts['needs-action'])} need action`, chip: `${formatCount(counts['needs-action'])} need action`, tone: 'amber' };
  }
  if (counts['going-quiet'] > 0) {
    return { accent: `${formatCount(counts['going-quiet'])} going quiet`, chip: `${formatCount(counts['going-quiet'])} going quiet`, tone: 'red' };
  }
  if (counts.new > 0) {
    return { accent: `${formatCount(counts.new)} never contacted`, chip: `${formatCount(counts.new)} never contacted`, tone: 'amber' };
  }
  if (counts.ready > 0) {
    return { accent: `${formatCount(counts.ready)} ready to qualify`, chip: `${formatCount(counts.ready)} ready to qualify`, tone: 'green' };
  }
  return { accent: '', chip: total > 0 ? 'Every lead has a next step' : 'No leads waiting', tone: 'green' };
}

function captionFor(filter: QueueFilter, rows: LeadRow[]) {
  switch (filter) {
    case 'new': return 'Nobody has spoken to these yet. Oldest first.';
    case 'needs-action': return 'A revisit has come due, or something the lead needs is missing.';
    case 'going-quiet': return 'Contacted once, quiet since, and nothing scheduled.';
    case 'ready': return 'Fit, a contact, a stated need and a conversation. Qualify moves them to Discovery.';
    case 'nurture': return 'Parked until a date. Each one comes back on its own.';
    case 'closed': return 'Closed with a reason. Kept for what they teach about which leads are worth having.';
    default: return rows.length
      ? 'Ordered by what needs doing: revisits and missing steps first, then ready, quiet, new and parked.'
      : '';
  }
}

/**
 * No leads at all.
 *
 * Teaches the next behaviour rather than decorating the absence. The three ways
 * a lead gets here are the three doors, and one of them is Capture, because
 * that is how most leads actually arrive - somebody met somebody.
 */
function LeadsEmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <Panel className="px-6 py-10 text-center">
      <p className="font-display text-lg font-bold text-ink">No leads waiting.</p>
      <p className="mx-auto mt-1.5 max-w-lg text-sm leading-6 text-tint-neutral-ink">
        A lead is somebody worth a conversation who has not shown a real need yet. They land here, you work out who is
        worth progressing, and qualifying one moves it into Opportunities with everything recorded on it.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2.5">
        <button type="button" onClick={onAdd} className={primaryPillClass}>
          <UserPlus className="h-4 w-4" aria-hidden="true" />
          Add a lead
        </button>
        <Link to="/app/capture" className={ghostPillClass}>
          <NotebookPen className="h-4 w-4" aria-hidden="true" />
          Capture a conversation
        </Link>
        <Link to="/app/opportunities?import=csv" className={ghostPillClass}>
          <Upload className="h-4 w-4" aria-hidden="true" />
          Import a pipeline
        </Link>
      </div>
      <p className="mx-auto mt-4 max-w-md text-xs leading-5 text-muted">
        An imported row at the Lead stage appears here automatically.
      </p>
    </Panel>
  );
}
