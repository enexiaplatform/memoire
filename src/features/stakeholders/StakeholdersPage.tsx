import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Filter, Plus, Save, Search, Trash2, UserPlus } from 'lucide-react';
import { useAuthContext } from '../../auth/authContext';
import { DataModePill } from '../../components/common/DataModePill';
import { PageContainer, PageHeader } from '../../components/layout/PageFrame';
import { TopBar } from '../../components/layout/TopBarSlot';
import { RecordStamp } from '../../components/common/RecordStamp';
import { RecordDrawer } from '../../components/ui/RecordDrawer';
import {
  MicroLabel,
  MicroPill,
  Monogram,
  Panel,
  Segmented,
  SegmentMeter,
  StatusChip,
} from '../../components/ui/daylight';
import { delay, ghostPillClass, primaryPillClass } from '../../components/ui/daylightStyles';
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
import { type SalesActivityRecord } from '../../services/salesActivityStore';
import { deriveStakeholderCandidatesFromActivities } from '../../utils/stakeholderGraph';
import { normalizeEntityName as normalize } from '../../utils/accountIdentity';
import { useWorkspaceRefresh } from '../../hooks/useWorkspaceRefresh';
import { formatCount } from '../../utils/numberFormat';
import { summarizeStakeholderCoverage } from '../../utils/stakeholderGraph';
import {
  getStakeholderNextActionFromNotes,
  setStakeholderNextActionInNotes,
  stripStakeholderNextActionFromNotes,
} from '../../utils/meddicStakeholderMap.ts';
import { matchesSearchQuery } from '../../utils/textSearch';
import {
  COVERAGE_ROLES,
  buildRoleCoverageMatrix,
  daysSinceInteraction,
  describeCoveragePerson,
  PERSON_QUIET_DAYS,
  PERSON_SILENT_DAYS,
  type CoverageRole,
  type RoleCoverageRow,
} from '../../utils/stakeholderRoleCoverage';
import { normalizeMeddicRole } from '../../utils/meddicStakeholderMap.ts';
import { todayDateKey, formatSafeBusinessDate } from '../../utils/safeDate';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type StakeholderView = 'accounts' | 'roles' | 'unknown';
const allFilter = 'All';
const pageSizeOptions = [25, 50, 100] as const;
const MATRIX_PAGE_SIZE = 25;

function readView(value: string | null): StakeholderView {
  return value === 'roles' || value === 'unknown' ? value : 'accounts';
}

/** The order people are listed in under "By role": the buying roles first. */
const ROLE_ORDER: string[] = [...COVERAGE_ROLES, 'Blocker', 'Coach', 'User', 'Unknown'];

export function StakeholdersPage() {
  const { user, loading: authLoading, isAuthenticated } = useAuthContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const sampleDataActive = hasLocalSampleData();
  const dataUserId = sampleDataActive ? undefined : user?.id;
  const [stakeholders, setStakeholders] = useState<StakeholderRecord[]>([]);
  const [opportunities, setOpportunities] = useState<CrmLiteOpportunity[]>([]);
  const [activities, setActivities] = useState<SalesActivityRecord[]>([]);
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
  const [matrixPage, setMatrixPage] = useState(1);
  const view = readView(searchParams.get('view'));
  const today = todayDateKey();

  const refreshStakeholders = async () => {
    const cachedData = getCachedSalesWorkspaceData(dataUserId);
    if (cachedData) {
      setStakeholders(cachedData.stakeholders);
      setOpportunities(cachedData.opportunities);
      setActivities(cachedData.activities);
      setLoading(false);
      return;
    }

    setLoading(true);
    const workspaceData = await loadSalesWorkspaceData(dataUserId);
    setStakeholders(workspaceData.stakeholders);
    setOpportunities(workspaceData.opportunities);
    setActivities(workspaceData.activities);
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

  const selectView = (next: StakeholderView) => {
    const params = new URLSearchParams(searchParams);
    if (next === 'accounts') params.delete('view');
    else params.set('view', next);
    setSearchParams(params, { replace: true });
  };

  const accounts = useMemo(() => [allFilter, ...Array.from(new Set(stakeholders.map((item) => item.accountName).filter(Boolean))).sort()], [stakeholders]);
  const summary = useMemo(() => summarizeStakeholderCoverage(stakeholders, opportunities), [opportunities, stakeholders]);
  const matrix = useMemo(() => buildRoleCoverageMatrix({ stakeholders, opportunities }), [opportunities, stakeholders]);

  const visibleStakeholders = useMemo(() => {
    const searchText = query.trim().toLowerCase();
    const effectiveRole = view === 'unknown' ? 'Unknown' : roleFilter;
    return stakeholders
      .filter((stakeholder) => {
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
          (effectiveRole === allFilter || normalizeMeddicRole(stakeholder.stakeholderRole) === effectiveRole) &&
          (stanceFilter === allFilter || stakeholder.stance === stanceFilter) &&
          (influenceFilter === allFilter || stakeholder.influenceLevel === influenceFilter)
        );
      })
      // Grouped by the role they play, buying roles first - "By role" is a
      // promise about the order, not only a label on the tab.
      .sort((left, right) => (
        rolePosition(left) - rolePosition(right)
        || left.accountName.localeCompare(right.accountName)
        || left.name.localeCompare(right.name)
      ));
  }, [accountFilter, influenceFilter, query, roleFilter, stakeholders, stanceFilter, view]);

  /**
   * The matrix, narrowed by the same search box and account filter as the list.
   * A row matches on its customer or on anybody recorded at it - searching for a
   * person should find the account they belong to, not an empty grid.
   */
  const visibleRows = useMemo(() => {
    // `matchesSearchQuery` folds case and diacritics on both sides itself.
    const searchText = query.trim();
    return matrix.rows.filter((row) => (
      (accountFilter === allFilter || normalize(row.accountName) === normalize(accountFilter))
      && (
        !searchText
        || matchesSearchQuery(row.accountName, searchText)
        || row.cells.some((cell) => cell.people.some((person) => matchesSearchQuery(person.name, searchText)))
      )
    ));
  }, [accountFilter, matrix.rows, query]);

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
  // The matrix pages for the same reason: a book of a thousand accounts is a
  // thousand rows of six cells each.
  const matrixPageCount = Math.max(1, Math.ceil(visibleRows.length / MATRIX_PAGE_SIZE));
  const pagedRows = useMemo(
    () => visibleRows.slice((matrixPage - 1) * MATRIX_PAGE_SIZE, matrixPage * MATRIX_PAGE_SIZE),
    [matrixPage, visibleRows],
  );

  // Filtering to three matches while sitting on page 12 shows an empty list that
  // reads as "no results". Any change to what is being filtered goes to page 1.
  useEffect(() => {
    setPage(1);
    setMatrixPage(1);
  }, [accountFilter, influenceFilter, pageSize, query, roleFilter, stanceFilter, view]);

  /**
   * People your captures name who have no record here.
   *
   * This page calls itself "the whole book". It was the book of what somebody
   * typed into this form, and a person named in a capture only ever got one
   * chance to become a record - the prompt shown immediately after that capture
   * was saved. Dismiss it, or capture before that prompt existed, and the
   * person was never offered again while this page went on claiming to hold
   * everyone. `deriveStakeholderCandidatesFromActivities` was already written
   * and tested for exactly this and had no caller at all.
   */
  const uncountedPeople = useMemo(() => {
    const recorded = new Set(stakeholders.map((person) => `${normalize(person.name)}|${normalize(person.accountName)}`));
    return deriveStakeholderCandidatesFromActivities(activities)
      .filter((candidate) => !recorded.has(`${normalize(candidate.name)}|${normalize(candidate.accountName)}`))
      .slice(0, 12);
  }, [activities, stakeholders]);

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
  };

  const closePanel = () => {
    setSelectedStakeholder(null);
    setPanelMode('closed');
    setSaveState('idle');
    setMessage('');
  };

  /** From a matrix row to the people behind it. */
  const showAccountPeople = (accountName: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('view', 'roles');
    params.set('accountName', accountName);
    setSearchParams(params, { replace: true });
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

  const total = stakeholders.length;
  const unknownCount = matrix.unknownRoles;

  /*
   * The headline states the book, then the problem in it. The problem it names
   * is about people, because the title counts people: an unknown role. The
   * account-level gap - no Economic Buyer - is the top bar's to say, and saying
   * "every role recorded" in green beside it would read as all-clear while
   * twenty accounts have nobody who signs.
   */
  const accountsWithGaps = matrix.rows.filter((row) => row.gaps > 0).length;
  const headline: { title: string; accent?: { text: string; tone: 'red' | 'amber' | 'green' } } = loading
    ? { title: 'Stakeholders' }
    : total === 0
      ? { title: 'No stakeholders yet' }
      : unknownCount > 0
        ? {
          title: `${formatCount(total)} ${total === 1 ? 'person' : 'people'}`,
          accent: { text: `, ${formatCount(unknownCount)} unknown ${unknownCount === 1 ? 'role' : 'roles'}`, tone: 'amber' },
        }
        : accountsWithGaps === 0
          ? { title: `${formatCount(total)} ${total === 1 ? 'person' : 'people'}`, accent: { text: ', every buying role covered', tone: 'green' } }
          : {
            title: `${formatCount(total)} ${total === 1 ? 'person' : 'people'}`,
            accent: { text: `, ${formatCount(accountsWithGaps)} ${accountsWithGaps === 1 ? 'account' : 'accounts'} with a role gap`, tone: 'amber' },
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

      <TopBar
        status={!loading && matrix.rows.length > 0 ? (
          matrix.missingEconomicBuyer > 0 ? (
            <StatusChip tone="amber" className="hidden md:inline-flex">
              {formatCount(matrix.missingEconomicBuyer)} {matrix.missingEconomicBuyer === 1 ? 'account' : 'accounts'} missing an Economic Buyer
            </StatusChip>
          ) : (
            <StatusChip tone="green" className="hidden md:inline-flex">Every account has an Economic Buyer</StatusChip>
          )
        ) : undefined}
        actions={(
          <button type="button" onClick={() => openAddPanel()} className={`${primaryPillClass} !px-3 sm:!px-5`}>
            {/* A person glyph, not a plus: on a phone the label is hidden and the
                bar already holds Capture's plus beside it. */}
            <UserPlus className="h-4 w-4" strokeWidth={2.2} />
            <span className="hidden sm:inline">Add stakeholder</span>
            <span className="sr-only sm:hidden">Add stakeholder</span>
          </button>
        )}
        ownsPrimary
      />

      <PageHeader
        eyebrow="Accounts · Stakeholders"
        documentTitle="Stakeholders"
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
              cloudAvailable={canUseStakeholderCloudStore(dataUserId)}
              hasSampleData={sampleDataActive}
            />
            <Segmented
              label="How to read the book"
              value={view}
              onChange={selectView}
              options={[
                { value: 'accounts', label: 'By account' },
                { value: 'roles', label: 'By role' },
                { value: 'unknown', label: 'Unknown only', count: unknownCount },
              ]}
            />
          </div>
        )}
      />

      {/*
        The people this page was quietly leaving out.

        A page that calls itself "the whole book" has to account for the ones it
        knows about and has not got. Each was named in a capture, with the job
        title that capture recorded, and adding one is a click - the form opens
        already filled with what the note said.
      */}
      {!loading && uncountedPeople.length > 0 && (
        <section className="animate-rise rounded-panel bg-tint-amber-bg px-5 py-4" style={delay(40)}>
          <p className="text-sm font-bold text-tint-amber-ink">
            {uncountedPeople.length} {uncountedPeople.length === 1 ? 'person appears' : 'people appear'} in your captures with no record here
          </p>
          <p className="mt-1 text-xs text-tint-amber-ink">
            Named in a note but never added. Adding one opens the form with what the note already said.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {uncountedPeople.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                onClick={() => openAddPanel({
                  name: candidate.name,
                  accountName: candidate.accountName,
                  roleTitle: candidate.roleTitle,
                  opportunityName: candidate.opportunityName,
                  opportunityId: candidate.opportunityId,
                  notes: candidate.notes,
                })}
                className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-full bg-white px-3 py-1.5 text-left text-xs font-semibold text-tint-amber-ink shadow-seg transition hover:-translate-y-px"
              >
                <Plus className="h-3.5 w-3.5" />
                {candidate.name}
                {candidate.roleTitle ? <span className="font-normal">· {candidate.roleTitle}</span> : null}
                {candidate.accountName ? <span className="font-normal">· {candidate.accountName}</span> : null}
              </button>
            ))}
          </div>
        </section>
      )}

      {view === 'accounts' ? (
        <Panel className="animate-rise overflow-hidden" style={delay(60)} aria-label="Role coverage by account">
          <div className="flex flex-col gap-3 border-b border-line px-5 py-3.5 sm:flex-row sm:items-center lg:px-6">
            <SearchField value={query} onChange={setQuery} placeholder="Find an account or a person..." />
            <FilterSelect label="Account" value={accountFilter} options={accounts} onChange={setAccountFilter} />
            <p className="text-[11.5px] text-muted sm:ml-auto">
              Click a name to open it, or a gap to fill it.
            </p>
          </div>

          {loading ? (
            <p className="px-6 py-8 text-sm font-semibold text-muted">Loading stakeholders...</p>
          ) : visibleRows.length === 0 ? (
            matrix.rows.length === 0 ? (
              <EmptyState onAdd={() => openAddPanel()} />
            ) : (
              <p className="px-6 py-8 text-sm text-muted">No account or person matches that search.</p>
            )
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] table-fixed border-collapse text-left">
                <colgroup>
                  <col className="w-[230px]" />
                  {COVERAGE_ROLES.map((role) => <col key={role} />)}
                  <col className="w-[128px]" />
                </colgroup>
                <thead>
                  <tr className="border-b border-line">
                    <th scope="col" className="px-6 py-3"><MicroLabel>Account</MicroLabel></th>
                    {COVERAGE_ROLES.map((role) => (
                      <th key={role} scope="col" className="px-2 py-3"><MicroLabel>{role}</MicroLabel></th>
                    ))}
                    <th scope="col" className="px-6 py-3 text-right"><MicroLabel>Coverage</MicroLabel></th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map((row) => (
                    <CoverageRow
                      key={row.key}
                      row={row}
                      today={today}
                      onOpenPerson={openEditPanel}
                      onFillGap={(role) => openAddPanel({ accountName: row.accountName, stakeholderRole: role })}
                      onOpenAccount={() => showAccountPeople(row.accountName)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!loading && matrix.rows.length > 0 && (
            <div className="flex flex-col gap-2 border-t border-line px-5 py-3 text-[11.5px] text-muted sm:flex-row sm:items-center sm:justify-between lg:px-6">
              <p>
                {formatCount(pagedRows.length)} of {formatCount(visibleRows.length)} accounts · coverage across {COVERAGE_ROLES.join(', ')}
                {matrix.unattached > 0 && ` · ${formatCount(matrix.unattached)} ${matrix.unattached === 1 ? 'person has' : 'people have'} no account`}
                {/* Every other count on the page is people or accounts. This one
                    counts deals, so it says so rather than reading as a person
                    count that disagrees with the header. */}
                {summary.opportunitiesWithStakeholderRisk > 0 && ` · ${formatCount(summary.opportunitiesWithStakeholderRisk)} open ${summary.opportunitiesWithStakeholderRisk === 1 ? 'deal has' : 'deals have'} a role gap`}
              </p>
              {matrixPageCount > 1 && (
                <Pager page={matrixPage} pageCount={matrixPageCount} onChange={setMatrixPage} />
              )}
            </div>
          )}
        </Panel>
      ) : (
        <Panel className="animate-rise overflow-hidden" style={delay(60)} aria-label={view === 'unknown' ? 'People with no recorded role' : 'People by role'}>
          <div className="grid grid-cols-1 gap-2 border-b border-line px-5 py-3.5 md:grid-cols-2 lg:px-6 xl:grid-cols-[1.5fr_repeat(4,1fr)]">
            <SearchField value={query} onChange={setQuery} placeholder="Search stakeholder, account, opportunity..." />
            <FilterSelect label="Account" value={accountFilter} options={accounts} onChange={setAccountFilter} />
            {view === 'unknown' ? (
              <p className="flex items-center rounded-full bg-chip px-3.5 text-[12px] font-semibold text-tint-neutral-ink">Role: Unknown</p>
            ) : (
              <FilterSelect label="Role" value={roleFilter} options={[allFilter, ...stakeholderRoles]} onChange={setRoleFilter} />
            )}
            <FilterSelect label="Stance" value={stanceFilter} options={[allFilter, ...stakeholderStances]} onChange={setStanceFilter} />
            <FilterSelect label="Influence" value={influenceFilter} options={[allFilter, ...influenceLevels]} onChange={setInfluenceFilter} />
          </div>

          {loading ? (
            <p className="px-6 py-8 text-sm font-semibold text-muted">Loading stakeholders...</p>
          ) : visibleStakeholders.length === 0 ? (
            stakeholders.length === 0 ? (
              <EmptyState onAdd={() => openAddPanel()} />
            ) : (
              <p className="px-6 py-8 text-sm text-muted">
                {view === 'unknown' ? 'Everyone here has a role recorded.' : 'Nobody matches those filters.'}
              </p>
            )
          ) : (
            <>
              <ul className="divide-y divide-line-soft">
                {pagedStakeholders.map((stakeholder) => (
                  <StakeholderRow key={stakeholder.id} stakeholder={stakeholder} today={today} onOpen={() => openEditPanel(stakeholder)} />
                ))}
              </ul>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-3 text-[11.5px] text-muted lg:px-6">
                <p>
                  Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, visibleStakeholders.length)} of{' '}
                  {formatCount(visibleStakeholders.length)}
                </p>
                <div className="flex items-center gap-3">
                  {pageCount > 1 && <Pager page={page} pageCount={pageCount} onChange={setPage} />}
                  <label className="flex items-center gap-2">
                    <span>Per page</span>
                    <select
                      value={pageSize}
                      onChange={(event) => setPageSize(Number(event.target.value))}
                      className="rounded-full border border-line bg-white px-2 py-1 font-semibold text-gray-700 outline-none"
                    >
                      {pageSizeOptions.map((size) => <option key={size} value={size}>{size}</option>)}
                    </select>
                  </label>
                </div>
              </div>
            </>
          )}
        </Panel>
      )}

      {panelMode !== 'closed' && (
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
      )}
    </PageContainer>
  );
}

function rolePosition(stakeholder: StakeholderRecord) {
  const index = ROLE_ORDER.indexOf(normalizeMeddicRole(stakeholder.stakeholderRole));
  return index === -1 ? ROLE_ORDER.length : index;
}

/**
 * One customer across the five buying roles.
 *
 * An empty cell is a button, not a blank: "Not recorded" is the content of this
 * page, and the fastest way to change it is to be one click from the form with
 * the customer and the role already filled in.
 */
function CoverageRow({
  row,
  today,
  onOpenPerson,
  onFillGap,
  onOpenAccount,
}: {
  row: RoleCoverageRow;
  today: string;
  onOpenPerson: (person: StakeholderRecord) => void;
  onFillGap: (role: CoverageRole) => void;
  onOpenAccount: () => void;
}) {
  const tone = row.covered === COVERAGE_ROLES.length ? 'green' : row.covered >= 3 ? 'amber' : 'red';
  const toneText = { green: 'text-tint-green-solid', amber: 'text-tint-amber-solid', red: 'text-tint-red-solid' }[tone];

  return (
    <tr className="border-b border-line-soft transition-colors last:border-b-0 hover:bg-canvas">
      <th scope="row" className="px-6 py-3 font-normal">
        <button type="button" onClick={onOpenAccount} className="flex w-full min-w-0 items-center gap-2.5 text-left" title={`People at ${row.accountName}`}>
          <Monogram name={row.accountName} />
          <span className="min-w-0 flex-1 overflow-hidden">
            <span className="block truncate text-[13.5px] font-semibold text-ink">{row.accountName}</span>
            <span className="block text-[10.5px] text-muted">
              {row.openDealCount === 0 ? 'No open deal' : `${row.openDealCount} open ${row.openDealCount === 1 ? 'deal' : 'deals'}`}
              {row.unknownRoles > 0 && ` · ${row.unknownRoles} unknown`}
            </span>
          </span>
        </button>
      </th>
      {row.cells.map((cell) => {
        const lead = cell.people[0];
        if (!lead) {
          return (
            <td key={cell.role} className="px-2 py-3">
              <button
                type="button"
                onClick={() => onFillGap(cell.role)}
                aria-label={`Add a ${cell.role} at ${row.accountName}`}
                className="group rounded-md px-1 py-0.5 text-left text-[12px] italic text-muted transition-colors hover:bg-white hover:text-brand-blue"
              >
                <span className="group-hover:hidden group-focus-visible:hidden">Not recorded</span>
                <span className="hidden font-semibold not-italic group-hover:inline group-focus-visible:inline">+ Add</span>
              </button>
            </td>
          );
        }
        const detail = describeCoveragePerson(lead, today);
        return (
          <td key={cell.role} className="px-2 py-3">
            <button type="button" onClick={() => onOpenPerson(lead)} className="block max-w-full rounded-md px-1 py-0.5 text-left transition-colors hover:bg-white">
              <span className="block truncate text-[12px] font-semibold text-ink">
                {lead.name}
                {cell.people.length > 1 && <span className="ml-1 font-mono text-[10.5px] font-normal text-muted">+{cell.people.length - 1}</span>}
              </span>
              {detail.text && (
                <span
                  className={`block truncate ${
                    detail.quiet === 'none'
                      ? 'text-[10.5px] text-muted'
                      : `text-[10px] font-bold uppercase tracking-[0.06em] ${detail.quiet === 'silent' ? 'text-tint-red-solid' : 'text-tint-amber-solid'}`
                  }`}
                >
                  {detail.text}
                </span>
              )}
            </button>
          </td>
        );
      })}
      <td className="px-6 py-3 text-right">
        <SegmentMeter
          total={COVERAGE_ROLES.length}
          filled={row.covered}
          filledCells={row.cells.map((cell) => cell.people.length > 0)}
          tone={tone}
          label={`${row.covered} of ${COVERAGE_ROLES.length} buying roles recorded`}
        />
        <span className={`mt-1.5 block text-[10.5px] font-bold uppercase tracking-[0.06em] ${toneText}`}>
          {row.gaps === 0 ? `${row.covered}/${COVERAGE_ROLES.length} complete` : `${row.covered}/${COVERAGE_ROLES.length} · ${row.gaps} ${row.gaps === 1 ? 'gap' : 'gaps'}`}
        </span>
      </td>
    </tr>
  );
}

const roleTone = (role: string) => {
  const normalized = normalizeMeddicRole(role);
  if (normalized === 'Blocker') return 'red' as const;
  if (normalized === 'Champion') return 'green' as const;
  if (normalized === 'Unknown') return 'neutral' as const;
  return 'blue' as const;
};

/** A person as one line: who, where, the role they play, and how they lean. */
function StakeholderRow({ stakeholder, today, onOpen }: { stakeholder: StakeholderRecord; today: string; onOpen: () => void }) {
  const days = daysSinceInteraction(stakeholder, today);
  const touchTone = days === null || days < PERSON_QUIET_DAYS
    ? 'text-muted'
    : days >= PERSON_SILENT_DAYS ? 'font-bold text-tint-red-solid' : 'font-bold text-tint-amber-solid';
  return (
    <li className="flex flex-col gap-3 px-5 py-3.5 transition-colors hover:bg-canvas md:flex-row md:items-center lg:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Monogram name={stakeholder.name} size={32} />
        <div className="min-w-0">
          <p className="truncate text-[13.5px] font-semibold text-ink">
            {stakeholder.name}
            <span className="ml-2 font-normal text-muted">{stakeholder.roleTitle || stakeholder.opportunityName || 'No title captured'}</span>
          </p>
          <p className="mt-0.5 truncate text-[11.5px] text-muted">
            {stakeholder.accountName || 'Unassigned account'}
            {stakeholder.opportunityName ? ` · ${stakeholder.opportunityName}` : ''}
          </p>
          <RecordStamp className="mt-0.5" createdAt={stakeholder.createdAt} updatedAt={stakeholder.updatedAt} label="Added" />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 md:justify-end">
        {/* A badge says which dimension it is reporting, not just its value:
            for an imported stakeholder all three read "Unknown", and three
            identical chips said nothing about which one nobody had filled in. */}
        <Badge dimension="Role" label={stakeholder.stakeholderRole} tone={roleTone(stakeholder.stakeholderRole)} />
        <Badge dimension="Influence" label={stakeholder.influenceLevel} tone={stakeholder.influenceLevel === 'High' ? 'amber' : 'neutral'} />
        <Badge dimension="Stance" label={stakeholder.stance} tone={stakeholder.stance === 'Supportive' ? 'green' : stakeholder.stance === 'Resistant' ? 'red' : 'neutral'} />
        <span className={`min-w-[88px] text-right font-mono text-[11px] ${touchTone}`}>
          {days === null ? 'No touch logged' : days === 0 ? 'Spoke today' : `${days}d ago`}
        </span>
        <button type="button" onClick={onOpen} className={`${ghostPillClass} !px-3.5 !py-1.5`}>Open</button>
      </div>
    </li>
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
  mode: 'add' | 'edit';
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
    <RecordDrawer
      eyebrow={mode === 'add' ? 'Add Stakeholder' : 'Stakeholder Detail'}
      title={mode === 'add' ? 'New stakeholder' : form.name}
      label={mode === 'add' ? 'Add stakeholder' : `Stakeholder ${form.name}`}
      onClose={onClose}
      meta={mode === 'edit' && record ? (
        <>
          <RecordStamp className="mt-1" createdAt={record.createdAt} updatedAt={record.updatedAt} label="Added" />
          {record.lastInteractionDate && (
            <p className="mt-1 text-[11.5px] text-muted">Last interaction {formatSafeBusinessDate(record.lastInteractionDate)}</p>
          )}
        </>
      ) : undefined}
      footer={(
        <>
          <button type="button" onClick={onSave} disabled={saveState === 'saving'} className={primaryPillClass}>
            <Save className="h-4 w-4" />
            {saveState === 'saving' ? 'Saving...' : 'Save Stakeholder'}
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
        <label className="flex items-center gap-2 rounded-xl bg-tint-green-bg px-3 py-2 text-sm font-bold text-tint-green-ink md:col-span-2">
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
      <p className="font-display text-base font-bold text-ink">No stakeholders yet.</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">Start mapping who supports, buys, evaluates, blocks, and approves your active deals.</p>
      <button type="button" onClick={onAdd} className={`${primaryPillClass} mt-5`}>
        <Plus className="h-4 w-4" />
        Add Stakeholder
      </button>
    </div>
  );
}

function Pager({ page, pageCount, onChange }: { page: number; pageCount: number; onChange: (page: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page === 1}
        className="rounded-full border border-line bg-white px-3 py-1 font-semibold text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Previous
      </button>
      <span className="font-mono">{page} / {pageCount}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(pageCount, page + 1))}
        disabled={page === pageCount}
        className="rounded-full border border-line bg-white px-3 py-1 font-semibold text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Next
      </button>
    </div>
  );
}

/**
 * A badge says which dimension it is reporting, not just its value.
 *
 * Three of these sit in a row on every card, and for an imported stakeholder all
 * three read "Unknown" - three identical chips, none of which said whether it
 * was the role, the influence or the stance that nobody had filled in. The
 * dimension is the half a reader cannot infer.
 */
function Badge({ dimension, label, tone }: { dimension: string; label: string; tone: 'blue' | 'green' | 'amber' | 'red' | 'neutral' }) {
  return (
    <MicroPill tone={tone} className="!normal-case !tracking-normal !text-[11px] !font-semibold gap-1 !px-2.5 !py-1">
      <span className="opacity-75">{dimension}</span>
      <span className="font-bold">{label}</span>
    </MicroPill>
  );
}

function SearchField({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <label className="relative block min-w-0 sm:w-72">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-tint-neutral-ink" />
      <span className="sr-only">Search</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-full bg-chip py-2 pl-10 pr-4 text-[13px] text-ink outline-none placeholder:text-tint-neutral-ink focus:ring-2 focus:ring-brand-blue/25"
      />
    </label>
  );
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: readonly string[]; onChange: (value: string) => void }) {
  return <label className="flex min-w-0 items-center gap-2 rounded-full border border-line bg-white px-3.5 py-2"><Filter className="h-3.5 w-3.5 shrink-0 text-muted" /><span className="sr-only">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="w-full min-w-0 bg-transparent text-[13px] font-semibold text-gray-700 outline-none">{options.map((option) => <option key={option} value={option}>{option === allFilter ? label : option}</option>)}</select></label>;
}

function SelectField<Value extends string>({ label, value, options, onChange }: { label: string; value: Value; options: readonly Value[]; onChange: (value: Value) => void }) {
  return <label className="block"><span className="text-[12.5px] font-bold text-ink">{label}</span><select value={value} onChange={(event) => onChange(event.target.value as Value)} className="mt-1.5 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10">{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>;
}

function Field({ label, value, onChange, required = false, type = 'text', listId }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; type?: string; listId?: string }) {
  return <label className="block"><span className="text-[12.5px] font-bold text-ink">{label}{required ? ' *' : ''}</span><input type={type} value={value} list={listId} onChange={(event) => onChange(event.target.value)} className="mt-1.5 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10" /></label>;
}

function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block"><span className="text-[12.5px] font-bold text-ink">{label}</span><textarea value={value} onChange={(event) => onChange(event.target.value)} className="mt-1.5 min-h-[100px] w-full rounded-xl border border-line bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10" /></label>;
}

function parseCommaList(value: string) {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}
