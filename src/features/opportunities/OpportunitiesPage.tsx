import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ThreadsSection } from '../threads/ThreadsSection';
import {
  AlertTriangle,
  ArrowUpDown,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Copy,
  Eye,
  FileText,
  Filter,
  GitBranch,
  Plus,
  RefreshCw,
  Save,
  Search,
  Target,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useAuthContext } from '../../auth/authContext';
import { DataModePill } from '../../components/common/DataModePill';
import { QuotePricingPanel } from './QuotePricingPanel';
import { isQuotingStage } from '../../utils/quotePricing';
import { isSupabaseConfigured } from '../../lib/demoMode';
import { hasLocalSampleData } from '../../utils/dataMode';
import { trackProductEvent, type AnalyticsDataMode } from '../../utils/productAnalytics';
import {
  canUseOpportunityCloudStore,
  createOpportunity,
  decisionRecommendations,
  deleteOpportunity,
  emptyOpportunityInput,
  forecastEvidenceCategories,
  opportunityStages,
  opportunityStatuses,
  updateOpportunity,
  type CrmLiteOpportunity,
  type OpportunityFormInput,
  type OpportunityStage,
  type OpportunityStatus,
} from '../../services/opportunityStore';
import { analyzePipelineQuality, analyzeOpportunityQuality } from '../../utils/opportunityQuality';
import {
  defaultProbabilityForStage,
  isClosedProbabilityStale,
  isProbabilityOptimistic,
  probabilityGapText,
  PROBABILITY_LADDER,
  resolveProbability,
} from '../../utils/stageProbability';
import {
  closePeriodGroupKey,
  closePeriodGroupLabel,
  resolveClosePeriod,
  UNKNOWN_RANK,
  type ClosePeriod,
} from '../../utils/closePeriod';
import { classifyOpportunitySilence, type OpportunitySilenceState } from '../../utils/proactiveNudges';
import { useEscapeToClose } from '../../hooks/useEscapeToClose';
import { FollowUpComposerPanel } from '../v31/FollowUpComposerPanel';
import { buildReviveFollowUpContext } from '../../utils/followUpFromOpportunity';
import type { FollowUpContext } from '../../types/v31';
import { analyzeMeddicLiteOpportunity, type MeddicLiteDealCategory, type MeddicLiteStatus } from '../../utils/meddicLite';
import {
  convertMoney,
  formatBaseCurrencyAmount as formatBaseMoney,
  formatCompactBaseAmount,
  formatCurrencyAmount as formatMoney,
  getReportingCurrency,
  listSelectableCurrencies,
  sumMoneyInBase,
  SUPPORTED_CURRENCIES,
  type SupportedCurrency,
} from '../../utils/money';
import { buildRevenueHorizon, buildStageFunnel } from '../../utils/pipelineInsights';
import { FunnelBars } from '../../components/charts/FunnelBars';
import { MiniBarChart } from '../../components/charts/MiniBarChart';
import { SkeletonScreen, SkeletonTable } from '../../components/common/Skeleton';
import { PageContainer, PageHeader } from '../../components/layout/PageFrame';
import { compareSafeBusinessDate, formatSafeBusinessDate, isBusinessDateOverdue, sanitizeBusinessDate, todayDateKey } from '../../utils/safeDate.ts';
import { type SalesActivityRecord } from '../../services/salesActivityStore';
import { type StakeholderRecord } from '../../services/stakeholderStore';
import { type ObjectionRecord } from '../../services/objectionStore';
import { type SalesAssetRecord } from '../../services/salesAssetStore';
import { getQuoteRisk, quoteRiskTone, type QuoteRecord } from '../../services/quoteStore';
import {
  actionOutcomeTypes,
  createActionOutcomeFromRecommendedAction,
  getActionOutcomeForAction,
  loadActionOutcomes,
  type ActionOutcomeRecord,
  type ActionOutcomeType,
} from '../../services/actionOutcomeStore';
import {
  buildOpportunityOutcomeDraft,
  createOpportunityOutcomeFromOpportunity,
  getOpportunityOutcomesForOpportunity,
  opportunityOutcomeReasonCategories,
  opportunityOutcomes as opportunityOutcomeOptions,
  opportunityOutcomeToOpportunityStage,
  opportunityOutcomeToOpportunityStatus,
  type OpportunityOutcomeDraft,
  type OpportunityOutcomeRecord,
} from '../../services/opportunityOutcomeStore';
import { getCachedSalesWorkspaceData, loadSalesWorkspaceData } from '../../services/workspaceData';
import { useWorkspaceRefresh } from '../../hooks/useWorkspaceRefresh';
import { type AccountMemoryRecord } from '../../services/accountStore';
import { type AccountMergeRecord } from '../../services/accountMergeStore';
import { SuggestInput } from '../../components/common/SuggestInput';
import { RecordStamp } from '../../components/common/RecordStamp';
import { buildAccountAliasIndex, resolveAccountName, type AccountAliasIndex } from '../../utils/accountAliases';
import {
  buildProcurementReadiness,
  isProcurementRoute,
  procurementRoutes,
  routeNeedsADate,
} from '../../utils/procurementPath';
import { explainPipelineRisk } from '../../utils/revenueView';
import { stageForStatus, statusForStage } from '../../utils/opportunityOutcome';
import { accountKey, normalizeEntityName, sameAccount } from '../../utils/accountIdentity';
import { checkAccountName, type AccountNameCheck } from '../../utils/accountDuplicates';
import { analyzeStakeholderCoverage, getStakeholdersForOpportunity } from '../../utils/stakeholderGraph';
import { buildMeddicStakeholderMap, formatMeddicStakeholderDate } from '../../utils/meddicStakeholderMap.ts';
import { getObjectionsForOpportunity, objectionStatusTone } from '../../utils/objectionLedger';
import { analyzeOpportunityOutcomeLoop } from '../../utils/actionOutcomeLoop';
import {
  formatOpportunityActionCopy,
  generateOpportunityActionPlan,
  generateOpportunityActionsMarkdown,
  type OpportunityActionPriority,
  type OpportunityRecommendedAction,
} from '../../utils/opportunityActionPlan';
import {
  createPipelineDefenseBrief,
  loadPipelineDefenseBriefStore,
  savePipelineDefenseBriefStore,
  type PipelineDefenseBrief,
} from '../../utils/pipelineDefenseStorage';
import { canUsePipelineDefenseCloudStore, createCloudBrief } from '../../services/pipelineDefenseCloudStore';
import {
  generatePipelineDefenseBriefFromOpportunities,
  mapOpportunitiesToPipelineDefenseDeals,
} from '../../utils/opportunityToPipelineBrief';
import { analyzePipelineDefenseDeal } from '../../utils/pipelineDefenseRules';
import {
  composeRetroAnswer,
  evidenceGapPresets,
  lessonPresets,
  reasonPresetsFor,
} from '../../utils/outcomeRetroPresets';
import {
  getRelevantSalesAssetsForOpportunity,
  suggestSalesAssetsForOpportunity,
} from '../../utils/salesAssetSuggestions';
import { generateSalesPlaybookPatterns } from '../../utils/salesPlaybook';
import { getUserDisplayName as getWorkspaceUserDisplayName } from '../../utils/userDisplay';
import {
  OPPORTUNITY_CSV_TEMPLATE,
  buildCsvMappingReview,
  buildFieldMapFromReview,
  buildImportedOpportunityInput,
  deleteCsvMappingProfile,
  detectCsvMappingProfile,
  getCsvHeaders,
  getImportableCsvRows,
  getOpportunityCsvFieldOptions,
  loadCsvMappingProfiles,
  loadOpportunityImportBatches,
  markCsvMappingProfileUsed,
  parseOpportunityCsv,
  preparePipelineRefreshPreview,
  recordOpportunityImportBatch,
  saveCsvMappingProfile,
  summarizeImportedOpportunityEnrichment,
  suggestCsvMappingSourceType,
  type CsvMappingProfile,
  type CsvMappingReviewRow,
  type CsvMappingSourceType,
  type OpportunityCsvImportMode,
  type OpportunityCsvImportResult,
  type OpportunityImportBatchRecord,
  type OpportunityCsvField,
  type OpportunityRefreshField,
  type OpportunityRefreshPreviewItem,
  type PipelineRefreshPreview,
} from '../../utils/opportunityCsvImport';
import { markFirstPipelineReviewStepComplete } from '../../utils/firstPipelineReviewOnboarding';
import { markPipelineReviewHabitStepComplete } from '../../utils/pipelineReviewHabit';
import { markTrialActivationChecklistItemComplete } from '../../utils/trialActivationChecklist';
import {
  buildOpportunitySalesFlowGuidance,
  salesFlowSteps,
  type OpportunitySalesFlowGuidance,
} from '../../utils/salesFlowGuidance';
import { buildCommercialJourneySnapshot, formatJourneyCommitment } from '../../utils/commercialJourney';
import { formatCount } from '../../utils/numberFormat';
import { useModalDrawer } from '../../hooks/useModalDrawer';
import { matchesSearchQuery } from '../../utils/textSearch';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type BriefPreviewMetadata = {
  title: string;
  weekLabel: string;
  salesOwner: string;
  scope: string;
};
type SortDirection = 'asc' | 'desc';
type OpportunitySortKey =
  | 'account'
  | 'opportunity'
  | 'stage'
  | 'value'
  | 'fy26'
  | 'fy27'
  | 'probability'
  | 'closePeriod'
  | 'forecast'
  | 'recommendation'
  | 'nextActionDate'
  | 'quality'
  | 'updatedAt';
type OpportunityQuickFilter = 'all' | 'imported' | 'stageInferred' | 'fy26' | 'fy27' | 'needsAction' | 'goingSilent';

const allFilter = 'All';
const defaultPageSize = 25;
const founderCoreSourceSystem = 'founder_core_fy26';

export function OpportunitiesPage() {
  const { user, loading: authLoading, isAuthenticated } = useAuthContext();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [opportunities, setOpportunities] = useState<CrmLiteOpportunity[]>([]);
  const [activities, setActivities] = useState<SalesActivityRecord[]>([]);
  const [stakeholders, setStakeholders] = useState<StakeholderRecord[]>([]);
  const [objections, setObjections] = useState<ObjectionRecord[]>([]);
  const [actionOutcomes, setActionOutcomes] = useState<ActionOutcomeRecord[]>([]);
  const [opportunityOutcomes, setOpportunityOutcomes] = useState<OpportunityOutcomeRecord[]>([]);
  const [salesAssets, setSalesAssets] = useState<SalesAssetRecord[]>([]);
  const [quotes, setQuotes] = useState<QuoteRecord[]>([]);
  const [accounts, setAccounts] = useState<AccountMemoryRecord[]>([]);
  const [accountMerges, setAccountMerges] = useState<AccountMergeRecord[]>([]);
  const [loading, setLoading] = useState(() => !getCachedSalesWorkspaceData(hasLocalSampleData() ? undefined : user?.id));
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState(allFilter);
  const [forecastFilter, setForecastFilter] = useState(allFilter);
  const [recommendationFilter, setRecommendationFilter] = useState(allFilter);
  const [statusFilter, setStatusFilter] = useState(allFilter);
  const [brandFilter, setBrandFilter] = useState(allFilter);
  // "Q3 2026" or "Aug 2026", both read off the expected close date rather than
  // stored. The date is the record; the quarter and the month are two ways of
  // asking the same question of it, which is why neither is a field.
  const [closeFilter, setCloseFilter] = useState(allFilter);
  const [quickFilter, setQuickFilter] = useState<OpportunityQuickFilter>('all');
  // Opens on "what closes soonest", which is the question a pipeline list is
  // for. Was "last update, newest first" - an order that answers "what did I
  // type most recently".
  const [sortKey, setSortKey] = useState<OpportunitySortKey>('closePeriod');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [editingOpportunity, setEditingOpportunity] = useState<CrmLiteOpportunity | null>(null);
  const [followUpContext, setFollowUpContext] = useState<FollowUpContext | null>(null);
  const [followUpOpportunity, setFollowUpOpportunity] = useState<CrmLiteOpportunity | null>(null);
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
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [csvMode, setCsvMode] = useState<OpportunityCsvImportMode>('import');
  const [csvInput, setCsvInput] = useState('');
  const [csvImportResult, setCsvImportResult] = useState<OpportunityCsvImportResult | null>(null);
  const [csvRefreshPreview, setCsvRefreshPreview] = useState<PipelineRefreshPreview | null>(null);
  const [csvRefreshSelectedFields, setCsvRefreshSelectedFields] = useState<Record<string, OpportunityRefreshField[]>>({});
  const [csvSkipDuplicates, setCsvSkipDuplicates] = useState(true);
  const [csvImportMessage, setCsvImportMessage] = useState('');
  const [csvImportFileName, setCsvImportFileName] = useState('');
  const [importBatchHistory, setImportBatchHistory] = useState<OpportunityImportBatchRecord[]>(() => loadOpportunityImportBatches());
  const [csvMappingProfiles, setCsvMappingProfiles] = useState<CsvMappingProfile[]>(() => loadCsvMappingProfiles());
  const [csvDetectedHeaders, setCsvDetectedHeaders] = useState<string[]>([]);
  const [csvMappingReview, setCsvMappingReview] = useState<CsvMappingReviewRow[]>([]);
  const [csvSelectedMappingProfileId, setCsvSelectedMappingProfileId] = useState('');
  const [csvMappingProfileName, setCsvMappingProfileName] = useState('');
  const [csvMappingSourceType, setCsvMappingSourceType] = useState<CsvMappingSourceType>('Custom');
  const [csvMappingMessage, setCsvMappingMessage] = useState('');
  const [csvTemplateCopyStatus, setCsvTemplateCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [workspaceSyncing, setWorkspaceSyncing] = useState(false);
  const [workspaceLoadError, setWorkspaceLoadError] = useState('');
  const [lastWorkspaceRefreshAt, setLastWorkspaceRefreshAt] = useState('');
  const sampleDataActive = hasLocalSampleData();
  const dataUserId = sampleDataActive ? undefined : user?.id;
  const getAnalyticsDataMode = (syncIssue = false): AnalyticsDataMode => {
    if (sampleDataActive) return 'demo-local';
    if (syncIssue) return 'sync-failed';
    return dataUserId ? 'cloud-synced' : 'browser-only';
  };

  const applyWorkspaceData = (workspaceData: Awaited<ReturnType<typeof loadSalesWorkspaceData>>) => {
    setOpportunities(workspaceData.opportunities);
    setActivities(workspaceData.activities);
    setStakeholders(workspaceData.stakeholders);
    setObjections(workspaceData.objections);
    setActionOutcomes(workspaceData.actionOutcomes);
    setOpportunityOutcomes(workspaceData.opportunityOutcomes);
    setSalesAssets(workspaceData.assets);
    setQuotes(workspaceData.quotes);
    setAccounts(workspaceData.accounts);
    setAccountMerges(workspaceData.accountMerges);
  };

  const accountAliases = useMemo(() => buildAccountAliasIndex(accountMerges), [accountMerges]);
  /** The account spelling the seller has explicitly stood behind on a save. */
  const [accountNameConfirmed, setAccountNameConfirmed] = useState('');
  /** Bumped each time a save is refused for want of a close-out reason. */
  const [closeOutNudge, setCloseOutNudge] = useState(0);

  /**
   * Every customer the workspace already knows, by the name that survived any
   * merge. An opportunity's account link *is* this string, so the deal form has
   * to offer the existing spelling rather than let the seller retype it.
   */
  const knownAccountNames = useMemo(() => {
    const byKey = new Map<string, string>();
    const add = (raw: string) => {
      const name = resolveAccountName(raw || '', accountAliases);
      const key = accountKey(name);
      if (!key || byKey.has(key)) return;
      byKey.set(key, name);
    };
    accounts.forEach((account) => add(account.accountName));
    opportunities.forEach((opportunity) => add(opportunity.accountName));
    return [...byKey.values()].sort((left, right) => left.localeCompare(right));
  }, [accountAliases, accounts, opportunities]);

  const refreshOpportunities = async (options: { force?: boolean } = {}) => {
    setWorkspaceLoadError('');
    // Cache-first: if the workspace is already loaded, render instantly instead
    // of flashing the skeleton on every navigation back to this screen.
    if (!options.force) {
      const cachedData = getCachedSalesWorkspaceData(dataUserId);
      if (cachedData) {
        applyWorkspaceData(cachedData);
        setLastWorkspaceRefreshAt(new Date().toISOString());
        setLoading(false);
        return;
      }
    }
    if (options.force) setWorkspaceSyncing(true);
    setLoading(true);
    try {
      const workspaceData = await loadSalesWorkspaceData(dataUserId, { force: options.force });
      applyWorkspaceData(workspaceData);
      setLastWorkspaceRefreshAt(new Date().toISOString());
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Memoire could not load opportunity memory.';
      setWorkspaceLoadError(message);
    } finally {
      setLoading(false);
      setWorkspaceSyncing(false);
    }
  };

  useEffect(() => {
    refreshOpportunities();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataUserId]);

  // Drawn from the browser copy at first paint; take the cloud answer when it
  // lands rather than holding a partial pipeline for the rest of the session.
  useWorkspaceRefresh(() => { void refreshOpportunities(); });

  const quality = useMemo(() => analyzePipelineQuality(opportunities, activities, objections), [activities, objections, opportunities]);
  const importedEnrichment = useMemo(() => summarizeImportedOpportunityEnrichment(opportunities), [opportunities]);
  const importedPipelineSummary = useMemo(() => buildImportedPipelineSummary(opportunities), [opportunities]);

  const selectedOpportunities = useMemo(() => {
    const selectedIds = new Set(selectedOpportunityIds);
    return opportunities.filter((opportunity) => selectedIds.has(opportunity.id));
  }, [opportunities, selectedOpportunityIds]);

  const opportunityRows = useMemo(
    () => opportunities.map((opportunity) => buildOpportunityMasterRow(opportunity, activities, quotes)),
    [activities, opportunities, quotes],
  );

  const goingSilentCount = useMemo(
    () => opportunityRows.filter((row) => row.silence.status === 'silent' || row.silence.status === 'at-risk').length,
    [opportunityRows],
  );

  // An operator carrying several principals' lines needs to ask "how is
  // Sartorius doing" without reading past every other brand. The filter only
  // appears once the workspace actually carries brands, so a single-brand
  // seller never sees a control that would always say "All".
  const brandOptions = useMemo(
    () => Array.from(new Set(
      opportunities.map((opportunity) => (opportunity.brand || '').trim()).filter(Boolean),
    )).sort((a, b) => a.localeCompare(b)),
    [opportunities],
  );

  const visibleOpportunityRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return opportunityRows.filter((row) => {
      const { opportunity } = row;
      const searchable = [
        opportunity.accountName,
        opportunity.opportunityName,
        opportunity.productOrSolution,
        opportunity.brand,
        opportunity.channel,
        opportunity.opportunityType,
        opportunity.sourceStageConfidence,
        opportunity.nextAction,
        opportunity.evidence,
      ].join(' ').toLowerCase();

      return (
        matchesSearchQuery(searchable, query) &&
        matchesOpportunityQuickFilter(row, quickFilter) &&
        (stageFilter === allFilter || opportunity.stage === stageFilter) &&
        (forecastFilter === allFilter || opportunity.forecastEvidenceCategory === forecastFilter) &&
        (recommendationFilter === allFilter || opportunity.decisionRecommendation === recommendationFilter) &&
        (statusFilter === allFilter || opportunity.status === statusFilter) &&
        (brandFilter === allFilter || (opportunity.brand || '').trim() === brandFilter) &&
        (closeFilter === allFilter || closeFilterOptionsFor(row.closePeriod).includes(closeFilter))
      );
    }).sort((left, right) => compareOpportunityRows(left, right, sortKey, sortDirection));
  }, [brandFilter, closeFilter, forecastFilter, opportunityRows, quickFilter, recommendationFilter, search, sortDirection, sortKey, stageFilter, statusFilter]);

  const visibleOpportunities = useMemo(
    () => visibleOpportunityRows.map((row) => row.opportunity),
    [visibleOpportunityRows],
  );
  // Read over the filtered rows, not the page: a column that appeared on page 1
  // and vanished on page 2 would look like the table lost the data.
  const opportunityColumns = useMemo(
    () => buildOpportunityColumnVisibility(visibleOpportunityRows),
    [visibleOpportunityRows],
  );
  const pageCount = Math.max(1, Math.ceil(visibleOpportunityRows.length / pageSize));
  const pagedRows = useMemo(
    () => visibleOpportunityRows.slice((page - 1) * pageSize, page * pageSize),
    [page, pageSize, visibleOpportunityRows],
  );

  useEffect(() => {
    setPage(1);
  }, [brandFilter, forecastFilter, pageSize, quickFilter, recommendationFilter, search, stageFilter, statusFilter]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const handleSort = (nextKey: OpportunitySortKey) => {
    if (nextKey === sortKey) {
      setSortDirection((current) => current === 'asc' ? 'desc' : 'asc');
      return;
    }
    setSortKey(nextKey);
    setSortDirection(['value', 'fy26', 'fy27', 'probability', 'updatedAt', 'quality'].includes(nextKey) ? 'desc' : 'asc');
  };

  /**
   * `seed` is what makes an empty square on the coverage matrix actionable.
   * The Vault knows the customer and the line that pairing is missing; without
   * carrying them here, "you have never offered this" ended at a page that made
   * the operator retype both.
   */
  const openAddPanel = (seed?: { accountName?: string; brand?: string }) => {
    setEditingOpportunity(null);
    setForm({
      ...emptyOpportunityInput,
      currency: getReportingCurrency(),
      accountName: seed?.accountName || '',
      brand: seed?.brand || '',
    });
    setPanelMode('add');
    setSaveState('idle');
    setMessage('');
  };

  const openCsvImport = () => {
    setCsvImportOpen(true);
    setCsvImportResult(null);
    setCsvRefreshPreview(null);
    setCsvRefreshSelectedFields({});
    setCsvImportMessage('');
    setCsvTemplateCopyStatus('idle');
    refreshCsvMappingReview(csvInput, csvMappingProfiles);
  };

  /**
   * Rebuild the column mapping, and hand it back.
   *
   * The return value is the whole point: `setCsvMappingReview` does not land
   * until the next render, so a caller that set the mapping and then read
   * `csvMappingReview` on the following line read the value from before it.
   * That is why Parse CSV had to be pressed twice - the first press built the
   * mapping and parsed against an empty one, leaving "READY 0 / No preview
   * rows yet" under a panel showing every column correctly auto-detected. A
   * first-time operator reads that as their file being rejected, and nothing on
   * the screen says to press it again.
   */
  const refreshCsvMappingReview = (text: string, profiles = csvMappingProfiles): CsvMappingReviewRow[] => {
    const headers = getCsvHeaders(text);
    setCsvDetectedHeaders(headers);

    if (headers.length === 0) {
      setCsvMappingReview([]);
      setCsvSelectedMappingProfileId('');
      setCsvMappingProfileName('');
      setCsvMappingSourceType('Custom');
      setCsvMappingMessage('');
      return [];
    }

    const match = detectCsvMappingProfile(headers, profiles);
    const sourceType = match?.profile.sourceType || suggestCsvMappingSourceType(headers);
    const review = buildCsvMappingReview(headers, match?.profile.fieldMap || {}, match?.profile || null);
    setCsvMappingReview(review);
    setCsvSelectedMappingProfileId(match?.profile.id || '');
    setCsvMappingProfileName(match?.profile.name || `${sourceType} mapping`);
    setCsvMappingSourceType(sourceType);
    setCsvMappingMessage(match
      ? `Recognized this CSV format. Use saved mapping: ${match.profile.name}.`
      : 'Review the suggested mapping before previewing or refreshing.');
    return review;
  };

  useEffect(() => {
    markFirstPipelineReviewStepComplete('hasReviewedOpportunities');
  }, []);

  useEffect(() => {
    if (searchParams.get('import') === 'csv') {
      openCsvImport();
      setSearchParams({}, { replace: true });
      return;
    }

    if (searchParams.get('new') === '1') {
      openAddPanel({
        accountName: searchParams.get('account') || undefined,
        brand: searchParams.get('brand') || undefined,
      });
      setSearchParams({}, { replace: true });
      return;
    }

    const requestedFilter = searchParams.get('filter');
    if (requestedFilter && ['all', 'imported', 'stageInferred', 'fy26', 'fy27', 'needsAction', 'goingSilent'].includes(requestedFilter)) {
      setQuickFilter(requestedFilter as OpportunityQuickFilter);
      setSearchParams({}, { replace: true });
      return;
    }

    // A square on the coverage matrix links here meaning "show me these deals".
    // Without this the link landed on the unfiltered list and the operator had
    // to find the pair by hand, which is the work the square was meant to save.
    // A square on the coverage matrix sends both; a plan item tagged with a
    // line sends the brand alone.
    const brandParam = searchParams.get('brand') || searchParams.get('brandOnly');
    const accountParam = searchParams.get('account');
    if (brandParam && searchParams.get('outcome') !== '1') {
      setBrandFilter(brandParam);
      if (accountParam) setSearch(accountParam);
      setSearchParams({}, { replace: true });
      return;
    }

    const opportunityId = searchParams.get('opportunityId');
    if (opportunityId && !loading) {
      const opportunity = opportunities.find((item) => item.id === opportunityId);
      if (opportunity) {
        setEditingOpportunity(opportunity);
        setForm(opportunityToForm(opportunity));
        setPanelMode('edit');
        setSaveState('idle');
        setMessage('');
      }
      // Deliberately left in the URL: it is what makes the open drawer a link
      // somebody can send. `closePanel` clears it.
      return;
    }

    if (searchParams.get('outcome') === '1' && !loading) {
      const account = searchParams.get('account') || '';
      const opportunityName = searchParams.get('opportunity') || '';
      const opportunity = opportunities.find((item) => (
        normalizeText(item.accountName) === normalizeText(account) &&
        normalizeText(item.opportunityName) === normalizeText(opportunityName)
      ));
      if (opportunity) {
        setEditingOpportunity(opportunity);
        setForm(opportunityToForm(opportunity));
        setPanelMode('edit');
      } else {
        setSearch([account, opportunityName].filter(Boolean).join(' '));
      }
      setSaveState('idle');
      setMessage(opportunity ? 'Outcome retro ready. Mark Won, Lost, Delayed, or No decision below.' : 'Search opened. Pick the opportunity to record an outcome retro.');
      setSearchParams({}, { replace: true });
    }
    // Query params are only used as one-shot entry points.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.toString(), loading, opportunities]);

  const parseCsvImport = () => {
    // Rebuilt unconditionally and read from the return value. The old guard
    // only rebuilt when no headers had been detected, and then parsed against
    // `csvMappingReview` from the previous render either way.
    const review = csvMappingReview.length
      ? csvMappingReview
      : refreshCsvMappingReview(csvInput, csvMappingProfiles);
    const fieldMap = buildFieldMapFromReview(review);
    const result = parseOpportunityCsv(csvInput, opportunities, fieldMap);
    setCsvImportResult(result);
    if (csvMode === 'refresh') {
      const preview = preparePipelineRefreshPreview(result, opportunities);
      setCsvRefreshPreview(preview);
      setCsvRefreshSelectedFields(buildDefaultRefreshSelection(preview));
      setCsvImportMessage(result.errors[0] || `Compared ${preview.summary.rowCount} row(s): ${preview.summary.newCount} new, ${preview.summary.changedCount} changed, ${preview.summary.unchangedCount} unchanged.`);
      return;
    }

    setCsvRefreshPreview(null);
    setCsvRefreshSelectedFields({});
    setCsvImportMessage(result.errors[0] || `Parsed ${result.rows.length} opportunity row(s). Review warnings before importing.`);
  };

  const handleCsvUpload = async (file: File | null) => {
    if (!file) return;
    const text = await file.text();
    setCsvInput(text);
    setCsvImportFileName(file.name);
    setCsvImportResult(null);
    setCsvRefreshPreview(null);
    setCsvRefreshSelectedFields({});
    refreshCsvMappingReview(text, csvMappingProfiles);
    setCsvImportMessage(`Loaded ${file.name}. Click Parse CSV to preview.`);
  };

  const handleCsvInputChange = (value: string) => {
    setCsvInput(value);
    setCsvImportResult(null);
    setCsvRefreshPreview(null);
    setCsvRefreshSelectedFields({});
    setCsvImportMessage('');
    refreshCsvMappingReview(value, csvMappingProfiles);
  };

  const handleCsvMappingChange = (normalizedHeader: string, mappedField: OpportunityCsvField | '') => {
    setCsvMappingReview((current) => current.map((row) => (
      row.normalizedHeader === normalizedHeader
        ? { ...row, mappedField, confidence: mappedField ? 'Auto-detected' : 'Unmapped' }
        : row
    )));
    setCsvSelectedMappingProfileId('');
    setCsvMappingMessage('Mapping adjusted. Parse again to refresh the preview.');
  };

  const handleSelectMappingProfile = (profileId: string) => {
    const profile = csvMappingProfiles.find((item) => item.id === profileId);
    setCsvSelectedMappingProfileId(profileId);
    if (!profile) {
      const sourceType = suggestCsvMappingSourceType(csvDetectedHeaders);
      setCsvMappingSourceType(sourceType);
      setCsvMappingReview(buildCsvMappingReview(csvDetectedHeaders));
      setCsvMappingProfileName(`${sourceType} mapping`);
      setCsvMappingMessage('Using auto-detected mapping.');
      return;
    }

    setCsvMappingSourceType(profile.sourceType);
    setCsvMappingProfileName(profile.name);
    setCsvMappingReview(buildCsvMappingReview(csvDetectedHeaders, profile.fieldMap, profile));
    setCsvMappingMessage(`Using saved mapping: ${profile.name}.`);
  };

  const handleSaveMappingProfile = () => {
    if (csvDetectedHeaders.length === 0) {
      setCsvMappingMessage('Paste or upload a CSV before saving a mapping profile.');
      return;
    }

    const fieldMap = buildFieldMapFromReview(csvMappingReview);
    if (Object.keys(fieldMap).length === 0) {
      setCsvMappingMessage('Map at least one CSV column before saving.');
      return;
    }

    const profile = saveCsvMappingProfile({
      name: csvMappingProfileName,
      sourceType: csvMappingSourceType,
      detectedHeaders: csvDetectedHeaders,
      fieldMap,
    });
    const nextProfiles = loadCsvMappingProfiles();
    setCsvMappingProfiles(nextProfiles);
    setCsvSelectedMappingProfileId(profile.id);
    setCsvMappingProfileName(profile.name);
    setCsvMappingMessage(`Saved mapping profile: ${profile.name}.`);
  };

  const handleDeleteMappingProfile = (profileId: string) => {
    const nextProfiles = deleteCsvMappingProfile(profileId);
    setCsvMappingProfiles(nextProfiles);
    if (csvSelectedMappingProfileId === profileId) {
      setCsvSelectedMappingProfileId('');
      refreshCsvMappingReview(csvInput, nextProfiles);
    }
  };

  const getActiveMappingProfileForBatch = () => {
    return csvMappingProfiles.find((profile) => profile.id === csvSelectedMappingProfileId);
  };

  const markActiveMappingProfileUsed = () => {
    if (!csvSelectedMappingProfileId) return csvMappingProfiles;
    const nextProfiles = markCsvMappingProfileUsed(csvSelectedMappingProfileId);
    setCsvMappingProfiles(nextProfiles);
    return nextProfiles;
  };

  const copyCsvTemplate = async () => {
    try {
      await navigator.clipboard.writeText(OPPORTUNITY_CSV_TEMPLATE);
      setCsvTemplateCopyStatus('copied');
    } catch {
      setCsvTemplateCopyStatus('failed');
    }
  };

  const importCsvRows = async () => {
    if (!csvImportResult) {
      setCsvImportMessage('Parse CSV before importing.');
      return;
    }

    const rows = getImportableCsvRows(csvImportResult.rows, { skipDuplicates: csvSkipDuplicates });
    if (rows.length === 0) {
      setCsvImportMessage('No valid new rows to import. Check warnings or duplicate settings.');
      return;
    }

    const importBatchId = `csv-${Date.now()}`;
    const activeMappingProfile = getActiveMappingProfileForBatch();
    const fieldMap = buildFieldMapFromReview(csvMappingReview);
    const results = await Promise.all(rows.map((row) => (
      createOpportunity(buildImportedOpportunityInput(row, importBatchId), dataUserId)
    )));
    const imported = results.map((result) => result.opportunity);
    const skipped = csvImportResult.rows.length - rows.length;
    setOpportunities((current) => [
      ...imported,
      ...current.filter((item) => !imported.some((importedItem) => importedItem.id === item.id)),
    ]);
    setCsvImportMessage(`Imported ${imported.length} opportunit${imported.length === 1 ? 'y' : 'ies'}. Skipped ${skipped} row(s).`);
    setCsvImportResult(parseOpportunityCsv(csvInput, [...imported, ...opportunities], fieldMap));
    if (activeMappingProfile) markActiveMappingProfileUsed();
    setImportBatchHistory(recordOpportunityImportBatch({
      id: importBatchId,
      mode: 'import',
      fileName: csvImportFileName || undefined,
      mappingProfileId: activeMappingProfile?.id,
      mappingProfileName: activeMappingProfile?.name,
      sourceType: activeMappingProfile?.sourceType || csvMappingSourceType,
      rowCount: csvImportResult.rows.length,
      newCount: imported.length,
      changedCount: 0,
      skippedCount: skipped,
      invalidCount: csvImportResult.rows.filter((row) => !row.isValid).length,
    }));
    setSaveState(results.some((result) => result.warning) ? 'error' : 'saved');
    setMessage(results.find((result) => result.warning)?.warning || 'CSV import saved. Memoire keeps this as a read-only CRM copy; no CRM is updated.');
    markFirstPipelineReviewStepComplete('hasImportedOrAddedOpportunities');
    markTrialActivationChecklistItemComplete('load-demo-or-import-csv');
    markPipelineReviewHabitStepComplete('refreshedPipelineAt');
    trackProductEvent(
      'csv_import_completed',
      getAnalyticsDataMode(results.some((result) => Boolean(result.warning))),
    );
  };

  const toggleRefreshField = (itemId: string, field: OpportunityRefreshField) => {
    setCsvRefreshSelectedFields((current) => {
      const fields = current[itemId] || [];
      return {
        ...current,
        [itemId]: fields.includes(field) ? fields.filter((item) => item !== field) : [...fields, field],
      };
    });
  };

  const applyPipelineRefresh = async () => {
    if (!csvImportResult || !csvRefreshPreview) {
      setCsvImportMessage('Parse CSV in refresh mode before applying changes.');
      return;
    }

    const importBatchId = `csv-refresh-${Date.now()}`;
    const activeMappingProfile = getActiveMappingProfileForBatch();
    const fieldMap = buildFieldMapFromReview(csvMappingReview);
    const newRows = csvRefreshPreview.newItems.map((item) => item.row);
    const changedItems = csvRefreshPreview.changedItems
      .filter((item) => item.existingOpportunity && (csvRefreshSelectedFields[item.id] || []).length > 0);

    if (newRows.length === 0 && changedItems.length === 0) {
      setCsvImportMessage('No new opportunities or selected field updates to apply.');
      return;
    }

    const createResults = await Promise.all(newRows.map((row) => (
      createOpportunity(buildImportedOpportunityInput(row, importBatchId), dataUserId)
    )));

    const updateResults = await Promise.all(changedItems.map((item) => {
      const existing = item.existingOpportunity as CrmLiteOpportunity;
      const fields = csvRefreshSelectedFields[item.id] || [];
      const nextInput = fields.reduce<OpportunityFormInput>((draft, field) => ({
        ...draft,
        [field]: item.row.input[field],
      }), opportunityToForm(existing));
      return updateOpportunity(existing, nextInput, dataUserId);
    }));

    const warning = [...createResults, ...updateResults].find((result) => result.warning)?.warning;
    const skippedChanged = csvRefreshPreview.changedItems.length - changedItems.length;
    const skipped = csvRefreshPreview.unchangedItems.length + csvRefreshPreview.duplicateItems.length + skippedChanged;

    setImportBatchHistory(recordOpportunityImportBatch({
      id: importBatchId,
      mode: 'refresh',
      fileName: csvImportFileName || undefined,
      mappingProfileId: activeMappingProfile?.id,
      mappingProfileName: activeMappingProfile?.name,
      sourceType: activeMappingProfile?.sourceType || csvMappingSourceType,
      rowCount: csvRefreshPreview.summary.rowCount,
      newCount: createResults.length,
      changedCount: updateResults.length,
      skippedCount: skipped,
      invalidCount: csvRefreshPreview.invalidItems.length,
    }));

    await refreshOpportunities();
    const nextOpportunities = [
      ...createResults.map((result) => result.opportunity),
      ...updateResults.map((result) => result.opportunity),
      ...opportunities,
    ];
    if (activeMappingProfile) markActiveMappingProfileUsed();
    const nextResult = parseOpportunityCsv(csvInput, nextOpportunities, fieldMap);
    const nextPreview = preparePipelineRefreshPreview(nextResult, nextOpportunities);
    setCsvImportResult(nextResult);
    setCsvRefreshPreview(nextPreview);
    setCsvRefreshSelectedFields(buildDefaultRefreshSelection(nextPreview));
    setCsvImportMessage(`Refresh applied: ${createResults.length} new, ${updateResults.length} updated, ${skipped} skipped. Memoire never writes back to CRM.`);
    setSaveState(warning ? 'error' : 'saved');
    setMessage(warning || 'Pipeline refresh applied to your private working copy. CRM/source data was not updated.');
    markFirstPipelineReviewStepComplete('hasImportedOrAddedOpportunities');
    markTrialActivationChecklistItemComplete('load-demo-or-import-csv');
    markPipelineReviewHabitStepComplete('refreshedPipelineAt');
    trackProductEvent(
      'csv_import_completed',
      getAnalyticsDataMode(Boolean(warning)),
    );
  };

  // A filtered list that looks empty is the most expensive state this page has:
  // the operator reads "no deals" as data loss rather than as their own Stage
  // filter from twenty minutes ago. The escape hatch only appears when there is
  // something to escape from.
  const closeFilterOptions = useMemo(() => buildCloseFilterOptions(opportunityRows), [opportunityRows]);

  const hasActiveFilters = search.trim() !== ''
    || stageFilter !== allFilter
    || statusFilter !== allFilter
    || forecastFilter !== allFilter
    || recommendationFilter !== allFilter
    || brandFilter !== allFilter
    || closeFilter !== allFilter
    || quickFilter !== 'all';

  const clearAllFilters = () => {
    setSearch('');
    setStageFilter(allFilter);
    setStatusFilter(allFilter);
    setForecastFilter(allFilter);
    setRecommendationFilter(allFilter);
    setBrandFilter(allFilter);
    setCloseFilter(allFilter);
    setQuickFilter('all');
    setPage(1);
  };

  const markWeakDealsReviewed = () => {
    markPipelineReviewHabitStepComplete('reviewedWeakDealsAt');
    setSaveState('saved');
    setMessage('Weak and risky deals marked as reviewed for this week.');
  };

  const markMeddicAndProofGapsChecked = () => {
    markPipelineReviewHabitStepComplete('checkedGapsAt');
    setSaveState('saved');
    setMessage('MEDDIC and proof gaps marked as checked for this week.');
  };

  /**
   * Opening a deal puts it in the URL, the way opening an account does.
   *
   * Accounts have carried `?accountId=` for a while; deals carried nothing, so
   * the one record a seller most wants to send someone - "look at this deal" -
   * could not be linked, bookmarked or reopened, and the browser's Back button
   * left the page instead of closing the drawer.
   */
  const openEditPanel = (opportunity: CrmLiteOpportunity) => {
    setEditingOpportunity(opportunity);
    setForm(opportunityToForm(opportunity));
    setPanelMode('edit');
    setSaveState('idle');
    setMessage('');
    setSearchParams({ opportunityId: opportunity.id });
  };

  const closePanel = () => {
    setPanelMode('closed');
    setEditingOpportunity(null);
    setSaveState('idle');
    setMessage('');
    // Only clear it if it is ours, so closing the drawer does not wipe an
    // import or filter param that arrived on the same URL.
    if (searchParams.get('opportunityId')) setSearchParams({}, { replace: true });
  };

  /**
   * Interrupts the first write of an account name that looks like a customer the
   * workspace already has. Returns true when the caller must stop.
   *
   * Every path that persists the panel's form runs through this, because there
   * is more than one: Save Opportunity, and the outcome retro - which writes
   * `{ ...editingOpportunity, ...form }` and so carries the typed account name
   * with it. Guarding only the obvious button left the other one able to create
   * the duplicate silently.
   *
   * One interruption, not a block. The first press names the customer this looks
   * like; a second press means the seller meant it. Keyed on the exact string,
   * so editing the name asks again.
   */
  const holdForAccountNameCheck = (rawAccountName: string) => {
    const typedAccount = (rawAccountName || '').trim();
    const check = checkAccountName(typedAccount, knownAccountNames, accountAliases);
    if (check.kind !== 'near' && check.kind !== 'renamed') return false;
    if (accountNameConfirmed === typedAccount) return false;

    setAccountNameConfirmed(typedAccount);
    setSaveState('error');
    setMessage(check.kind === 'renamed'
      ? `You merged "${typedAccount}" into ${check.name}. Save again to keep it separate, or pick ${check.name} above.`
      : `"${typedAccount}" looks like ${check.name}. ${check.reason} Save again to create it as a separate customer.`);
    return true;
  };

  /** A retro already exists for this deal, and it says why. */
  const hasRecordedOutcomeReason = editingOpportunity
    ? getOpportunityOutcomesForOpportunity(opportunityOutcomes, editingOpportunity)
      .some((outcome) => (outcome.reasonText || '').trim().length > 0)
    : false;

  const handleSave = async () => {
    if (!form.accountName.trim() || !form.opportunityName.trim()) {
      setSaveState('error');
      setMessage('Add account and opportunity names first.');
      return;
    }

    if (holdForAccountNameCheck(form.accountName)) return;

    // Closing a deal from the plain form skipped the retro entirely, so the
    // workspace filled up with Won and Lost rows that could never answer "why".
    // The status dropdown is not the place to close a deal; the close-out is -
    // and since picking Won or Lost now opens it directly under Status, this
    // message can point at something on screen rather than at a collapsed
    // section the operator had no reason to know existed.
    const closing = form.status === 'Won' || form.status === 'Lost';
    const alreadyClosed = editingOpportunity?.status === 'Won' || editingOpportunity?.status === 'Lost';
    if (closing && !alreadyClosed && !hasRecordedOutcomeReason) {
      setSaveState('error');
      setMessage(`Marking this ${form.status} needs a reason. The close-out is directly above this message: fill "Why did this happen?" and press "Save outcome retro" - that records what happened and closes the deal for you.`);
      // Pointing at a form is not the same as showing it. The Save button sits
      // at the foot of a long drawer and the close-out is near the top, so an
      // operator who read this message was told to find something a screen and
      // a half above them - and reported it as missing. The nudge scrolls the
      // close-out into view and puts the cursor in the box being asked for.
      setCloseOutNudge((count) => count + 1);
      return;
    }

    setSaveState('saving');
    setMessage('Saving opportunity...');
    const result = panelMode === 'edit' && editingOpportunity
      ? await updateOpportunity(editingOpportunity, form, dataUserId)
      : await createOpportunity(form, dataUserId);

    setOpportunities((current) => [
      result.opportunity,
      ...current.filter((item) => item.id !== result.opportunity.id),
    ]);
    setEditingOpportunity(result.opportunity);
    setPanelMode('edit');
    setForm(opportunityToForm(result.opportunity));
    setSaveState(result.warning ? 'error' : 'saved');
    setMessage(result.warning || (result.mode === 'cloud' ? 'Synced to your account.' : 'Saved locally in this browser.'));
    if (panelMode !== 'edit') {
      markFirstPipelineReviewStepComplete('hasImportedOrAddedOpportunities');
    }
  };

  const handleSaveOpportunityOutcome = async (opportunity: CrmLiteOpportunity, draft: OpportunityOutcomeDraft) => {
    // This receives `{ ...editingOpportunity, ...form }`, so it writes the
    // account name currently typed in the panel - the same duplicate risk the
    // Save button carries, and it needs the same interruption.
    if (holdForAccountNameCheck(opportunity.accountName)) return;

    const outcomeRecord = createOpportunityOutcomeFromOpportunity(opportunity, draft, dataUserId);
    setOpportunityOutcomes((current) => [
      outcomeRecord,
      ...current.filter((item) => item.id !== outcomeRecord.id),
    ]);

    const nextForm: OpportunityFormInput = {
      ...opportunityToForm(opportunity),
      status: opportunityOutcomeToOpportunityStatus(draft.outcome),
      stage: opportunityOutcomeToOpportunityStage(draft.outcome, opportunity.stage),
      estimatedValue: draft.finalAmount,
      currency: draft.currency,
    };
    const result = await updateOpportunity(opportunity, nextForm, dataUserId);

    setOpportunities((current) => [
      result.opportunity,
      ...current.filter((item) => item.id !== result.opportunity.id),
    ]);
    setEditingOpportunity(result.opportunity);
    setForm(opportunityToForm(result.opportunity));
    setSaveState(result.warning ? 'error' : 'saved');
    setMessage(result.warning || `Outcome recorded: ${draft.outcome}. Forecast snapshot preserved for learning.`);
  };

  const handleDelete = async (opportunity: CrmLiteOpportunity) => {
    const confirmed = window.confirm(`Delete ${opportunity.accountName} / ${opportunity.opportunityName}?`);
    if (!confirmed) return;

    try {
      await deleteOpportunity(opportunity, dataUserId);
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
    const draftBrief = generatePipelineDefenseBriefFromOpportunities(previewOpportunities, briefMetadata, objections, stakeholders, activities, actionOutcomes, salesAssets);

    try {
      const createdBrief = dataUserId && canUsePipelineDefenseCloudStore()
        ? await createCloudBrief(draftBrief, dataUserId)
        : createPipelineDefenseBrief(draftBrief);

      persistCreatedBriefLocally(createdBrief);
      setSelectedOpportunityIds([]);
      setBriefCreateState('saved');
      setBriefCreateMessage('Brief created. Opening Pipeline Defense...');
      markFirstPipelineReviewStepComplete('hasGeneratedPipelineDefense');
      markTrialActivationChecklistItemComplete('generate-defense-brief');
      markPipelineReviewHabitStepComplete('generatedBriefAt');
      trackProductEvent('review_completed', getAnalyticsDataMode());
      window.setTimeout(() => navigate('/app/pipeline-defense'), 150);
    } catch (error) {
      const localBrief = createPipelineDefenseBrief(draftBrief);
      persistCreatedBriefLocally(localBrief);
      setSelectedOpportunityIds([]);
      setBriefCreateState('error');
      markFirstPipelineReviewStepComplete('hasGeneratedPipelineDefense');
      markTrialActivationChecklistItemComplete('generate-defense-brief');
      markPipelineReviewHabitStepComplete('generatedBriefAt');
      trackProductEvent('review_completed', getAnalyticsDataMode(true));
      if (import.meta.env.DEV) {
        console.debug('[Opportunities] defense brief cloud create failed', { message: error instanceof Error ? error.message : 'Unknown error' });
      }
      setBriefCreateMessage('Cloud sync issue - your local copy is preserved.');
      window.setTimeout(() => navigate('/app/pipeline-defense'), 700);
    }
  };

  return (
    <PageContainer>
      {/* The list is the page.
          This used to open on a title, a paragraph, a toolbar, a quality
          scorecard and two charts - roughly a screen and a half before the
          first deal. Every one of those panels answers a question worth
          asking once a week; the table answers the question the operator came
          with, and it now starts within the first screen. The analysis is
          still here, one fold below the rows it describes. */}
      <PageHeader
        eyebrow="Records"
        title="Opportunities"
        meta={
          <>
            {loading
              ? 'Loading pipeline...'
              : `${formatCount(visibleOpportunityRows.length)} shown of ${formatCount(opportunities.length)}`}
            {lastWorkspaceRefreshAt ? ` · synced ${formatOpportunityDate(lastWorkspaceRefreshAt)}` : ''}
          </>
        }
        actions={
          <>
            <button
              type="button"
              onClick={() => openAddPanel()}
              className="inline-flex items-center justify-center gap-1.5 rounded-full bg-navy px-3.5 py-1.5 text-sm font-bold text-white"
            >
              <Plus className="h-4 w-4" />
              Add
            </button>
            <button
              type="button"
              onClick={openCsvImport}
              className="inline-flex items-center justify-center gap-1.5 rounded-full border border-brand-blue bg-blue-50 px-3.5 py-1.5 text-sm font-bold text-brand-blue hover:bg-blue-100"
            >
              <Upload className="h-4 w-4" />
              Import
            </button>
            <button
              type="button"
              onClick={() => openDefenseBriefPreview()}
              className="inline-flex items-center justify-center gap-1.5 rounded-full bg-brand-blue px-3.5 py-1.5 text-sm font-bold text-white"
              title="Generate Pipeline Defense Brief from the selected deals"
            >
              <FileText className="h-4 w-4" />
              Defense brief{selectedOpportunities.length > 0 ? ` (${selectedOpportunities.length})` : ''}
            </button>
            <button
              type="button"
              onClick={() => refreshOpportunities({ force: true })}
              disabled={workspaceSyncing}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
              title="Reload opportunities from cloud"
            >
              <RefreshCw className={`h-4 w-4 ${workspaceSyncing ? 'animate-spin' : ''}`} />
            </button>
            <DataModePill
              compact
              isLoading={authLoading}
              isAuthenticated={isAuthenticated}
              isSupabaseConfigured={isSupabaseConfigured}
              cloudAvailable={canUseOpportunityCloudStore(dataUserId)}
              hasSampleData={sampleDataActive}
            />
          </>
        }
      />

      {/* Filters sit directly above the rows they filter, on two lines: what
          you type and pick, then the saved cuts. Sticky, because filtering a
          long list is useless if choosing the next filter means scrolling
          back to the top. */}
      <section className="sticky top-14 z-20 -mx-4 border-y border-gray-200 bg-page/95 px-4 py-2.5 backdrop-blur sm:-mx-5 sm:px-5 lg:-mx-6 lg:top-16 lg:px-6">
        <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
          <label className="relative xl:w-[300px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search account, deal, brand, channel..."
              className="w-full rounded-lg border border-gray-300 bg-white py-1.5 pl-9 pr-3 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
            />
          </label>
          <div className="grid flex-1 grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
            <FilterSelect label="Stage" value={stageFilter} onChange={setStageFilter} options={[allFilter, ...opportunityStages]} />
            <FilterSelect label="Status" value={statusFilter} onChange={setStatusFilter} options={[allFilter, ...opportunityStatuses]} />
            <FilterSelect label="Forecast" value={forecastFilter} onChange={setForecastFilter} options={[allFilter, ...forecastEvidenceCategories]} />
            <FilterSelect label="Decision" value={recommendationFilter} onChange={setRecommendationFilter} options={[allFilter, ...decisionRecommendations]} />
            {brandOptions.length > 0
              ? <FilterSelect label="Brand" value={brandFilter} onChange={setBrandFilter} options={[allFilter, ...brandOptions]} />
              : null}
            {closeFilterOptions.length > 0
              ? <FilterSelect label="Close" value={closeFilter} onChange={setCloseFilter} options={[allFilter, ...closeFilterOptions]} />
              : null}
          </div>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="shrink-0 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-600 hover:border-brand-blue hover:text-brand-blue"
            >
              Clear filters
            </button>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[
            ['all', 'All pipeline'],
            ['imported', 'Imported core'],
            ['stageInferred', 'Stage inferred'],
            ['fy26', 'FY26 value'],
            ['fy27', 'FY27 value'],
            ['needsAction', 'Needs action'],
            ['goingSilent', goingSilentCount > 0 ? `Going silent (${goingSilentCount})` : 'Going silent'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setQuickFilter(value as OpportunityQuickFilter)}
              className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                quickFilter === value
                  ? 'bg-navy text-white'
                  : 'border border-gray-200 bg-white text-gray-600 hover:border-brand-blue hover:text-brand-blue'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {briefCreateMessage && !isPreviewOpen && (
        <p className={`rounded-lg px-3 py-2 text-sm font-semibold ${
          briefCreateState === 'error' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
        }`}>
          {briefCreateMessage}
        </p>
      )}
      {workspaceLoadError && (
        <p className="rounded-lg bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-800">
          Cloud refresh issue: {workspaceLoadError}
        </p>
      )}

      {csvImportOpen && (
        <OpportunityCsvImportPanel
          mode={csvMode}
          csvInput={csvInput}
          result={csvImportResult}
          refreshPreview={csvRefreshPreview}
          selectedRefreshFields={csvRefreshSelectedFields}
          skipDuplicates={csvSkipDuplicates}
          message={csvImportMessage}
          templateCopyStatus={csvTemplateCopyStatus}
          importBatchHistory={importBatchHistory}
          mappingProfiles={csvMappingProfiles}
          detectedHeaders={csvDetectedHeaders}
          mappingReview={csvMappingReview}
          selectedMappingProfileId={csvSelectedMappingProfileId}
          mappingProfileName={csvMappingProfileName}
          mappingSourceType={csvMappingSourceType}
          mappingMessage={csvMappingMessage}
          onModeChange={(mode) => {
            setCsvMode(mode);
            setCsvImportResult(null);
            setCsvRefreshPreview(null);
            setCsvRefreshSelectedFields({});
            setCsvImportMessage('');
          }}
          onInputChange={handleCsvInputChange}
          onFileChange={handleCsvUpload}
          onParse={parseCsvImport}
          onImport={importCsvRows}
          onRefresh={applyPipelineRefresh}
          onToggleRefreshField={toggleRefreshField}
          onMappingChange={handleCsvMappingChange}
          onSelectMappingProfile={handleSelectMappingProfile}
          onMappingProfileNameChange={setCsvMappingProfileName}
          onMappingSourceTypeChange={setCsvMappingSourceType}
          onSaveMappingProfile={handleSaveMappingProfile}
          onDeleteMappingProfile={handleDeleteMappingProfile}
          onSkipDuplicatesChange={setCsvSkipDuplicates}
          onCopyTemplate={copyCsvTemplate}
          onClose={() => setCsvImportOpen(false)}
        />
      )}

      <section>
        {loading ? (
          <SkeletonScreen label="Loading your opportunity master">
            <SkeletonTable rows={8} columns={6} />
          </SkeletonScreen>
        ) : opportunities.length === 0 ? (
          <EmptyState onAdd={openAddPanel} onImport={openCsvImport} />
        ) : visibleOpportunities.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
            <p className="text-sm font-semibold text-gray-900">No opportunities match these filters.</p>
            <p className="mt-1 text-sm text-gray-500">Clear search or filters to review your full pipeline.</p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="mt-4 rounded-full bg-navy px-4 py-2 text-sm font-bold text-white"
              >
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          <OpportunityMasterTable
            rows={pagedRows}
            allRows={visibleOpportunityRows}
            columns={opportunityColumns}
            grouped={sortKey === 'closePeriod' && sortDirection === 'asc'}
            totalRows={visibleOpportunityRows.length}
            totalOpportunities={opportunities.length}
            page={page}
            pageCount={pageCount}
            pageSize={pageSize}
            selectedIds={selectedOpportunityIds}
            sortKey={sortKey}
            sortDirection={sortDirection}
            onSort={handleSort}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            onToggleSelection={toggleOpportunitySelection}
            onOpen={(opportunity) => openEditPanel(opportunity)}
            onDraftFollowUp={(opportunity) => {
              setFollowUpOpportunity(opportunity);
              setFollowUpContext(buildReviveFollowUpContext(opportunity, activities));
            }}
          />
        )}
      </section>

      {/* Everything below reads the same deals the table just listed. It is
          the weekly conversation about the pipeline, not the daily work in it,
          so it opens on request and stays under the rows it describes. */}
      {!loading && opportunities.length > 0 && (
        <details className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <summary className="cursor-pointer list-none px-4 py-3">
            <span className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-bold text-navy">
                Pipeline analysis
                <span className="ml-2 font-semibold text-gray-500">
                  quality, shape, forecast and import coverage
                </span>
              </span>
              <span className="text-xs font-bold text-brand-blue">Open</span>
            </span>
          </summary>

          <div className="flex flex-col gap-4 border-t border-gray-100 p-4">
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={markWeakDealsReviewed} className="inline-flex items-center gap-2 text-xs font-bold text-blue-700 hover:text-brand-blue">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Mark weak deals reviewed
              </button>
              <button type="button" onClick={markMeddicAndProofGapsChecked} className="inline-flex items-center gap-2 text-xs font-bold text-blue-700 hover:text-brand-blue">
                <ClipboardList className="h-3.5 w-3.5" />
                Mark gaps checked
              </button>
            </div>

            <PipelineQualitySummary quality={quality} />

            <PipelineShapeCharts opportunities={opportunities} onSelectStage={setStageFilter} />

            <ImportedPipelineForecastPanel summary={importedPipelineSummary} onFilter={setQuickFilter} />

            <ImportedOpportunityEnrichmentSignal summary={importedEnrichment} />
          </div>
        </details>
      )}

      {followUpContext && (
        <FollowUpComposerPanel
          initialContext={followUpContext}
          onClose={() => { setFollowUpContext(null); setFollowUpOpportunity(null); }}
          onActivityLogged={() => { void refreshOpportunities(); }}
          onScheduleNextAction={followUpOpportunity ? async (nextAction, nextActionDate) => {
            const nextForm: OpportunityFormInput = {
              ...opportunityToForm(followUpOpportunity),
              nextAction,
              nextActionDate,
            };
            const result = await updateOpportunity(followUpOpportunity, nextForm, dataUserId);
            setOpportunities((current) => [
              result.opportunity,
              ...current.filter((item) => item.id !== result.opportunity.id),
            ]);
          } : undefined}
        />
      )}

      {/* The same thread component every other surface uses. When a deal is
          open this narrows to that customer's story, so the opportunity is read
          in the context of the whole thread rather than on its own. */}
      <div className="mt-6">
        <ThreadsSection
          title={editingOpportunity ? `Commercial threads · ${editingOpportunity.accountName}` : 'Commercial threads'}
          description="Quietest first"
          filter={editingOpportunity ? { accountName: editingOpportunity.accountName } : {}}
        />
      </div>

      <OpportunityPanel
        mode={panelMode}
        form={form}
        saveState={saveState}
        message={message}
        editingOpportunity={editingOpportunity}
        linkedActivities={editingOpportunity ? getLinkedActivities(editingOpportunity, activities) : []}
        stakeholders={editingOpportunity ? getStakeholdersForOpportunity(stakeholders, editingOpportunity) : []}
        objections={editingOpportunity ? getObjectionsForOpportunity(objections, editingOpportunity) : []}
        actionOutcomes={editingOpportunity ? actionOutcomes : []}
        opportunityOutcomes={editingOpportunity ? opportunityOutcomes : []}
        salesAssets={salesAssets}
        allOpportunities={opportunities}
        allStakeholders={stakeholders}
        knownAccountNames={knownAccountNames}
        accountAliases={accountAliases}
        accountWarningForced={accountNameConfirmed === form.accountName.trim() && Boolean(accountNameConfirmed)}
        closeOutNudge={closeOutNudge}
        quotes={editingOpportunity ? getQuotesForOpportunity(quotes, editingOpportunity) : []}
        dataUserId={dataUserId}
        sampleDataActive={sampleDataActive}
        onChange={setForm}
        onActionOutcomesChange={setActionOutcomes}
        onSaveOpportunityOutcome={handleSaveOpportunityOutcome}
        onSave={handleSave}
        onClose={closePanel}
        onDelete={editingOpportunity ? () => handleDelete(editingOpportunity) : undefined}
        onCreateDefenseBrief={editingOpportunity ? () => openDefenseBriefPreview([editingOpportunity]) : undefined}
      />

      {isPreviewOpen && (
        <DefenseBriefPreviewModal
          opportunities={previewOpportunities}
          objections={objections}
          stakeholders={stakeholders}
          activities={activities}
          actionOutcomes={actionOutcomes}
          salesAssets={salesAssets}
          metadata={briefMetadata}
          onMetadataChange={setBriefMetadata}
          createState={briefCreateState}
          message={briefCreateMessage}
          onCreate={createDefenseBriefFromPreview}
          onClose={closeDefenseBriefPreview}
        />
      )}
    </PageContainer>
  );
}

function PipelineShapeCharts({
  opportunities,
  onSelectStage,
}: {
  opportunities: CrmLiteOpportunity[];
  onSelectStage: (stage: string) => void;
}) {
  const funnel = useMemo(() => buildStageFunnel(opportunities), [opportunities]);
  const horizon = useMemo(() => buildRevenueHorizon(opportunities), [opportunities]);
  if (funnel.length === 0) return null;

  return (
    <section className="grid gap-4 xl:grid-cols-2">
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Pipeline shape</p>
        <h2 className="mt-1 text-lg font-bold text-navy">Where your deals sit</h2>
        <div className="mt-4">
          <FunnelBars
            ariaLabel="Active pipeline value by stage - select a stage to filter the table"
            onSelect={onSelectStage}
            rows={funnel.map((row) => ({
              label: row.stage,
              value: row.valueBase,
              valueText: formatCompactBaseAmount(row.valueBase),
              countText: `x${row.count}`,
            }))}
          />
        </div>
        <p className="mt-3 text-xs font-semibold text-gray-400">Active deals only. Click a stage to filter the table. (Base: {getReportingCurrency()})</p>
      </div>
      {horizon.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Close horizon</p>
          <h2 className="mt-1 text-lg font-bold text-navy">When the money lands</h2>
          <div className="mt-4">
            <MiniBarChart
              ariaLabel="Expected revenue by close horizon"
              items={horizon.map((bucket) => ({
                label: bucket.label,
                value: bucket.weightedValueBase,
                secondaryValue: bucket.rawValueBase,
                valueText: `weighted ${formatCompactBaseAmount(bucket.weightedValueBase)}`,
                secondaryText: `full ${formatCompactBaseAmount(bucket.rawValueBase)} (${bucket.count} deals)`,
              }))}
            />
          </div>
          <p className="mt-3 text-xs font-semibold text-gray-400">
            Solid bar: weighted by probability. Pale bar: full value. (Base: {getReportingCurrency()})
          </p>
        </div>
      )}
    </section>
  );
}

function PipelineQualitySummary({ quality }: { quality: ReturnType<typeof analyzePipelineQuality> }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
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
        <Metric label="Active value" value={formatBaseMoney(quality.estimatedActiveValue)} />
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

function OpportunityCsvImportPanel({
  mode,
  csvInput,
  result,
  refreshPreview,
  selectedRefreshFields,
  skipDuplicates,
  message,
  templateCopyStatus,
  importBatchHistory,
  mappingProfiles,
  detectedHeaders,
  mappingReview,
  selectedMappingProfileId,
  mappingProfileName,
  mappingSourceType,
  mappingMessage,
  onModeChange,
  onInputChange,
  onFileChange,
  onParse,
  onImport,
  onRefresh,
  onToggleRefreshField,
  onMappingChange,
  onSelectMappingProfile,
  onMappingProfileNameChange,
  onMappingSourceTypeChange,
  onSaveMappingProfile,
  onDeleteMappingProfile,
  onSkipDuplicatesChange,
  onCopyTemplate,
  onClose,
}: {
  mode: OpportunityCsvImportMode;
  csvInput: string;
  result: OpportunityCsvImportResult | null;
  refreshPreview: PipelineRefreshPreview | null;
  selectedRefreshFields: Record<string, OpportunityRefreshField[]>;
  skipDuplicates: boolean;
  message: string;
  templateCopyStatus: 'idle' | 'copied' | 'failed';
  importBatchHistory: OpportunityImportBatchRecord[];
  mappingProfiles: CsvMappingProfile[];
  detectedHeaders: string[];
  mappingReview: CsvMappingReviewRow[];
  selectedMappingProfileId: string;
  mappingProfileName: string;
  mappingSourceType: CsvMappingSourceType;
  mappingMessage: string;
  onModeChange: (mode: OpportunityCsvImportMode) => void;
  onInputChange: (value: string) => void;
  onFileChange: (file: File | null) => void;
  onParse: () => void;
  onImport: () => void;
  onRefresh: () => void;
  onToggleRefreshField: (itemId: string, field: OpportunityRefreshField) => void;
  onMappingChange: (normalizedHeader: string, mappedField: OpportunityCsvField | '') => void;
  onSelectMappingProfile: (profileId: string) => void;
  onMappingProfileNameChange: (value: string) => void;
  onMappingSourceTypeChange: (value: CsvMappingSourceType) => void;
  onSaveMappingProfile: () => void;
  onDeleteMappingProfile: (profileId: string) => void;
  onSkipDuplicatesChange: (value: boolean) => void;
  onCopyTemplate: () => void;
  onClose: () => void;
}) {
  const rows = result?.rows || [];
  const importableRows = getImportableCsvRows(rows, { skipDuplicates });
  const duplicateCount = rows.filter((row) => row.isDuplicate).length;
  const invalidCount = rows.filter((row) => !row.isValid).length;
  const selectedRefreshUpdateCount = refreshPreview?.changedItems.filter((item) => (selectedRefreshFields[item.id] || []).length > 0).length || 0;
  const refreshApplyCount = (refreshPreview?.newItems.length || 0) + selectedRefreshUpdateCount;
  const showWeeklyReviewCta = message.startsWith('Imported') || message.startsWith('Refresh applied');

  return (
    <section className="rounded-lg border border-brand-blue/20 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Read-only CRM import</p>
          <h2 className="mt-1 text-xl font-bold text-navy">Import or Refresh Opportunities from CSV</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-500">
            Refresh from your CRM/Excel export. Memoire updates your private working copy and never writes back. Use refresh before weekly review to compare what changed and prepare your Pipeline Defense Brief.
          </p>
        </div>
        <button type="button" onClick={onClose} className="rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50">
          Close
        </button>
      </div>

      <RefreshAssistantPanel />

      <div className="mb-4 grid gap-2 rounded-lg border border-blue-100 bg-blue-50 p-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onModeChange('import')}
          className={`rounded-md px-4 py-2 text-sm font-bold ${mode === 'import' ? 'bg-white text-navy shadow-sm' : 'text-blue-800 hover:bg-white/60'}`}
        >
          Import new pipeline
        </button>
        <button
          type="button"
          onClick={() => onModeChange('refresh')}
          className={`rounded-md px-4 py-2 text-sm font-bold ${mode === 'refresh' ? 'bg-white text-navy shadow-sm' : 'text-blue-800 hover:bg-white/60'}`}
        >
          Refresh existing pipeline
        </button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
        <div>
          <div className="mb-3 flex flex-wrap gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50">
              <Upload className="h-4 w-4" />
              Upload CSV
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => onFileChange(event.target.files?.[0] || null)}
                className="sr-only"
              />
            </label>
            <button type="button" onClick={onCopyTemplate} className="inline-flex items-center gap-2 rounded-full border border-brand-blue bg-blue-50 px-4 py-2 text-sm font-bold text-brand-blue hover:bg-blue-100">
              <Copy className="h-4 w-4" />
              Copy CSV Template
            </button>
            <button type="button" onClick={onParse} className="rounded-full bg-navy px-4 py-2 text-sm font-bold text-white hover:bg-navy/90">
              {mode === 'refresh' ? 'Compare CSV' : 'Parse CSV'}
            </button>
          </div>
          {templateCopyStatus === 'copied' && <p className="mb-2 text-sm font-semibold text-emerald-700">CSV template copied.</p>}
          {templateCopyStatus === 'failed' && <p className="mb-2 text-sm font-semibold text-amber-700">Clipboard failed. You can copy the template from the docs/report.</p>}
          <textarea
            value={csvInput}
            onChange={(event) => onInputChange(event.target.value)}
            rows={10}
            placeholder="Paste CSV here. Supported headers include Account Name, Opportunity Name, Stage, Value, Currency, Expected Close Period, Product / Solution, Next Action, Evidence, Missing Context."
            className="w-full rounded-lg border border-gray-300 bg-gray-50 p-4 font-mono text-xs leading-5 text-gray-800 outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
          />
          {message && (
            <div className={`mt-3 rounded-lg px-3 py-2 text-sm font-semibold ${
              result?.errors.length ? 'bg-amber-50 text-amber-800' : 'bg-blue-50 text-blue-800'
            }`}>
              <p>{message}</p>
              {showWeeklyReviewCta && (
                <Link to="/app/today" className="mt-2 inline-flex text-xs font-bold uppercase tracking-[0.16em] text-brand-blue hover:text-blue-900">
                  Continue weekly review
                </Link>
              )}
            </div>
          )}
          <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-3 text-sm leading-6 text-blue-900">
            <p className="font-bold">How to export from CRM</p>
            <p className="mt-1">
              Export a CSV with account, opportunity, stage, value, close period, and next step. Import it once, then use Refresh existing pipeline before weekly review to compare changes without touching CRM data.
            </p>
          </div>
          <CsvMappingReviewPanel
            profiles={mappingProfiles}
            detectedHeaders={detectedHeaders}
            rows={mappingReview}
            selectedProfileId={selectedMappingProfileId}
            profileName={mappingProfileName}
            sourceType={mappingSourceType}
            message={mappingMessage}
            onSelectProfile={onSelectMappingProfile}
            onMappingChange={onMappingChange}
            onProfileNameChange={onMappingProfileNameChange}
            onSourceTypeChange={onMappingSourceTypeChange}
            onSaveProfile={onSaveMappingProfile}
          />
          <ImportRefreshHistory records={importBatchHistory} />
          <SavedCsvMappingProfiles profiles={mappingProfiles} onDelete={onDeleteMappingProfile} />
        </div>

        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-bold text-gray-900">{mode === 'refresh' ? 'Refresh preview' : 'Import preview'}</p>
              <p className="mt-1 text-xs text-gray-500">
                {mode === 'refresh' && refreshPreview
                  ? `${refreshPreview.summary.rowCount} rows compared, ${refreshPreview.summary.newCount} new, ${refreshPreview.summary.changedCount} changed.`
                  : rows.length ? `${rows.length} parsed rows, ${importableRows.length} ready to import.` : 'Parse CSV to preview mapped opportunities.'}
              </p>
            </div>
            {mode === 'import' && (
              <label className="inline-flex items-center gap-2 text-sm font-semibold text-gray-700">
                <input
                  type="checkbox"
                  checked={skipDuplicates}
                  onChange={(event) => onSkipDuplicatesChange(event.target.checked)}
                  className="h-4 w-4 accent-brand-blue"
                />
                Skip duplicates
              </label>
            )}
          </div>

          {mode === 'refresh' && refreshPreview ? (
            <div className="mt-3 grid grid-cols-3 gap-2">
              <ImportMetric label="New" value={refreshPreview.summary.newCount} tone="green" />
              <ImportMetric label="Changed" value={refreshPreview.summary.changedCount} tone={refreshPreview.summary.changedCount ? 'amber' : 'green'} />
              <ImportMetric label="Warnings" value={refreshPreview.summary.possibleDuplicateCount + refreshPreview.summary.invalidCount} tone={refreshPreview.summary.possibleDuplicateCount || refreshPreview.summary.invalidCount ? 'red' : 'green'} />
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-3 gap-2">
              <ImportMetric label="Ready" value={importableRows.length} tone="green" />
              <ImportMetric label="Duplicates" value={duplicateCount} tone={duplicateCount ? 'amber' : 'green'} />
              <ImportMetric label="Invalid" value={invalidCount} tone={invalidCount ? 'red' : 'green'} />
            </div>
          )}

          <div className="mt-4 max-h-[420px] overflow-y-auto rounded-lg border border-gray-200 bg-white">
            {rows.length === 0 ? (
              <p className="p-4 text-sm text-gray-500">No preview rows yet.</p>
            ) : (
              <table className="min-w-full divide-y divide-gray-200 text-left text-xs">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="px-3 py-2 font-bold uppercase tracking-wide">Row</th>
                    <th className="px-3 py-2 font-bold uppercase tracking-wide">Opportunity</th>
                    <th className="px-3 py-2 font-bold uppercase tracking-wide">Mapped fields</th>
                    <th className="px-3 py-2 font-bold uppercase tracking-wide">Warnings</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td className="px-3 py-3 align-top font-bold text-gray-500">{row.rowNumber}</td>
                      <td className="px-3 py-3 align-top">
                        <p className="font-bold text-gray-900">{row.input.accountName || 'Missing account'}</p>
                        <p className="mt-1 text-gray-500">{row.input.opportunityName || 'Missing opportunity'}</p>
                      </td>
                      <td className="px-3 py-3 align-top text-gray-600">
                        <p>{row.input.stage} · {row.input.currency} {row.input.estimatedValue || 'No value'}</p>
                        <p className="mt-1">{row.input.expectedClosePeriod || 'No close period'}</p>
                        <p className="mt-1">{row.input.forecastEvidenceCategory} / {row.input.decisionRecommendation}</p>
                      </td>
                      <td className="px-3 py-3 align-top">
                        {row.warnings.length === 0 ? (
                          <Badge label="Clean" tone="green" />
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {row.warnings.map((warning) => (
                              <Badge key={warning} label={warning} tone={row.isValid ? 'amber' : 'red'} />
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {mode === 'refresh' && (
            <PipelineRefreshPreviewTable
              preview={refreshPreview}
              selectedFields={selectedRefreshFields}
              onToggleField={onToggleRefreshField}
            />
          )}

          {mode === 'refresh' ? (
            <button
              type="button"
              onClick={onRefresh}
              disabled={!refreshPreview || refreshApplyCount === 0}
              className="sticky bottom-4 z-10 mt-4 w-full rounded-full bg-navy px-4 py-2 text-sm font-bold text-white shadow-lg shadow-navy/20 hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Apply refresh ({refreshPreview?.newItems.length || 0} new, {selectedRefreshUpdateCount} update{selectedRefreshUpdateCount === 1 ? '' : 's'})
            </button>
          ) : (
            <button
              type="button"
              onClick={onImport}
              disabled={importableRows.length === 0}
              className="sticky bottom-4 z-10 mt-4 w-full rounded-full bg-navy px-4 py-2 text-sm font-bold text-white shadow-lg shadow-navy/20 hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Import {importableRows.length} new opportunit{importableRows.length === 1 ? 'y' : 'ies'}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function RefreshAssistantPanel() {
  const steps = [
    'Paste/upload latest CRM or Excel export',
    'Confirm mapping',
    'Preview new, changed, and skipped rows',
    'Apply safe refresh',
    'Generate Pipeline Defense Brief',
  ];

  return (
    <div className="mb-4 rounded-lg border border-emerald-100 bg-emerald-50/70 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Refresh Assistant</p>
          <h3 className="mt-1 text-sm font-bold text-navy">Weekly pipeline refresh workflow</h3>
          <p className="mt-1 text-sm leading-6 text-emerald-900/75">
            Memoire updates your private working copy and never writes back to CRM.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-5 lg:min-w-[680px]">
          {steps.map((step, index) => (
            <div key={step} className="rounded-lg bg-white px-3 py-2 text-xs font-bold leading-5 text-emerald-900 ring-1 ring-emerald-100">
              <span className="mr-1 text-emerald-600">{index + 1}.</span>
              {step}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CsvMappingReviewPanel({
  profiles,
  detectedHeaders,
  rows,
  selectedProfileId,
  profileName,
  sourceType,
  message,
  onSelectProfile,
  onMappingChange,
  onProfileNameChange,
  onSourceTypeChange,
  onSaveProfile,
}: {
  profiles: CsvMappingProfile[];
  detectedHeaders: string[];
  rows: CsvMappingReviewRow[];
  selectedProfileId: string;
  profileName: string;
  sourceType: CsvMappingSourceType;
  message: string;
  onSelectProfile: (profileId: string) => void;
  onMappingChange: (normalizedHeader: string, mappedField: OpportunityCsvField | '') => void;
  onProfileNameChange: (value: string) => void;
  onSourceTypeChange: (value: CsvMappingSourceType) => void;
  onSaveProfile: () => void;
}) {
  const fieldOptions = getOpportunityCsvFieldOptions();

  return (
    <div className="mt-3 rounded-xl border border-gray-200 bg-white p-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-gray-400">CSV Mapping Memory</p>
          <p className="mt-1 text-sm font-bold text-gray-900">
            {selectedProfileId ? `Recognized this CSV format` : 'Confirm column mapping'}
          </p>
          <p className="mt-1 text-xs leading-5 text-gray-500">
            {message || 'Paste or upload a CSV to review column mapping before import or refresh.'}
          </p>
        </div>
        <select
          value={selectedProfileId}
          onChange={(event) => onSelectProfile(event.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
        >
          <option value="">Auto-detect mapping</option>
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>Use saved mapping: {profile.name}</option>
          ))}
        </select>
      </div>

      {detectedHeaders.length === 0 ? (
        <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-500">
          No CSV headers detected yet.
        </p>
      ) : (
        <>
          <div className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-gray-100">
            <table className="min-w-full divide-y divide-gray-100 text-left text-xs">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-3 py-2 font-bold uppercase tracking-wide">CSV column</th>
                  <th className="px-3 py-2 font-bold uppercase tracking-wide">Memoire field</th>
                  <th className="px-3 py-2 font-bold uppercase tracking-wide">Confidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {rows.map((row) => (
                  <tr key={row.normalizedHeader}>
                    <td className="px-3 py-2 font-semibold text-gray-800">{row.csvColumn}</td>
                    <td className="px-3 py-2">
                      <select
                        value={row.mappedField}
                        onChange={(event) => onMappingChange(row.normalizedHeader, event.target.value as OpportunityCsvField | '')}
                        className="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs font-semibold text-gray-700 outline-none focus:border-brand-blue"
                      >
                        <option value="">Unmapped</option>
                        {fieldOptions.map((field) => (
                          <option key={field.value} value={field.value}>{field.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <Badge label={row.confidence} tone={row.confidence === 'Saved' ? 'green' : row.confidence === 'Auto-detected' ? 'blue' : 'gray'} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 grid gap-2 md:grid-cols-[1fr_170px_auto]">
            <input
              value={profileName}
              onChange={(event) => onProfileNameChange(event.target.value)}
              placeholder="Mapping profile name"
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
            />
            <select
              value={sourceType}
              onChange={(event) => onSourceTypeChange(event.target.value as CsvMappingSourceType)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 outline-none focus:border-brand-blue"
            >
              {(['Salesforce', 'HubSpot', 'Excel', 'Other CRM', 'Custom'] as CsvMappingSourceType[]).map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={onSaveProfile}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-brand-blue bg-blue-50 px-4 py-2 text-sm font-bold text-brand-blue hover:bg-blue-100"
            >
              <Save className="h-4 w-4" />
              Save Mapping
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function SavedCsvMappingProfiles({
  profiles,
  onDelete,
}: {
  profiles: CsvMappingProfile[];
  onDelete: (profileId: string) => void;
}) {
  if (profiles.length === 0) {
    return (
      <div className="mt-3 rounded-xl border border-gray-200 bg-white p-3">
        <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Saved CSV Mapping Profiles</p>
        <p className="mt-1 text-sm text-gray-500">No saved mappings yet. Save one after confirming your CSV columns.</p>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-gray-200 bg-white p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Saved CSV Mapping Profiles</p>
      <div className="mt-2 space-y-2">
        {profiles.slice(0, 5).map((profile) => (
          <div key={profile.id} className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-gray-900">{profile.name}</p>
              <p className="mt-0.5 text-xs font-semibold text-gray-500">
                {profile.sourceType} - last used {formatBatchDate(profile.lastUsedAt)} - {profile.usageCount} use{profile.usageCount === 1 ? '' : 's'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onDelete(profile.id)}
              className="rounded-full border border-gray-200 bg-white p-2 text-gray-500 hover:border-red-200 hover:text-red-600"
              aria-label={`Delete ${profile.name}`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function PipelineRefreshPreviewTable({
  preview,
  selectedFields,
  onToggleField,
}: {
  preview: PipelineRefreshPreview | null;
  selectedFields: Record<string, OpportunityRefreshField[]>;
  onToggleField: (itemId: string, field: OpportunityRefreshField) => void;
}) {
  if (!preview) {
    return (
      <div className="mt-4 rounded-lg border border-dashed border-gray-300 bg-white p-4 text-sm text-gray-500">
        Compare a CSV to see new, changed, unchanged, and warning rows before applying refresh.
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      <RefreshGroup
        title="Changed opportunities"
        items={preview.changedItems}
        tone="amber"
        selectedFields={selectedFields}
        onToggleField={onToggleField}
      />
      <RefreshGroup
        title="New opportunities"
        items={preview.newItems}
        tone="green"
        selectedFields={selectedFields}
        onToggleField={onToggleField}
      />
      <RefreshGroup
        title="Unchanged / skipped"
        items={preview.unchangedItems}
        tone="gray"
        selectedFields={selectedFields}
        onToggleField={onToggleField}
      />
      <RefreshGroup
        title="Invalid / warning rows"
        items={[...preview.duplicateItems, ...preview.invalidItems]}
        tone="red"
        selectedFields={selectedFields}
        onToggleField={onToggleField}
      />
    </div>
  );
}

function RefreshGroup({
  title,
  items,
  tone,
  selectedFields,
  onToggleField,
}: {
  title: string;
  items: OpportunityRefreshPreviewItem[];
  tone: 'green' | 'amber' | 'red' | 'gray';
  selectedFields: Record<string, OpportunityRefreshField[]>;
  onToggleField: (itemId: string, field: OpportunityRefreshField) => void;
}) {
  if (items.length === 0) return null;

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
        <p className="text-xs font-black uppercase tracking-wide text-gray-500">{title}</p>
        <Badge label={String(items.length)} tone={tone} />
      </div>
      <div className="max-h-72 divide-y divide-gray-100 overflow-y-auto">
        {items.map((item) => (
          <div key={item.id} className="p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-bold text-gray-900">{item.row.input.accountName || 'Missing account'}</p>
                <p className="mt-0.5 text-sm text-gray-600">{item.row.input.opportunityName || 'Missing opportunity'}</p>
                {item.existingOpportunity && (
                  <p className="mt-1 text-xs font-semibold text-gray-400">Matches existing opportunity.</p>
                )}
                {item.possibleDuplicate && (
                  <p className="mt-1 text-xs font-semibold text-amber-700">
                    Possible duplicate: {item.possibleDuplicate.accountName} / {item.possibleDuplicate.opportunityName}. {item.duplicateReason}
                  </p>
                )}
              </div>
              <Badge label={refreshStatusLabel(item.status)} tone={tone} />
            </div>

            {item.changes.length > 0 && (
              <div className="mt-3 space-y-2">
                {item.changes.map((change) => {
                  const checked = (selectedFields[item.id] || []).includes(change.field);
                  return (
                    <label key={change.field} className="block rounded-lg border border-gray-100 bg-gray-50 p-2">
                      <span className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => onToggleField(item.id, change.field)}
                          className="mt-1 h-4 w-4 accent-brand-blue"
                        />
                        <span className="min-w-0">
                          <span className="text-xs font-bold uppercase tracking-wide text-gray-500">
                            {change.label}{change.isProtected ? ' - protected' : ''}
                          </span>
                          <span className="mt-1 grid gap-1 text-xs text-gray-600 sm:grid-cols-2">
                            <span><strong>Current:</strong> {change.currentValue}</span>
                            <span><strong>Imported:</strong> {change.importedValue}</span>
                          </span>
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}

            {item.warnings.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {item.warnings.map((warning) => (
                  <Badge key={warning} label={warning} tone={item.row.isValid ? 'amber' : 'red'} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ImportRefreshHistory({ records }: { records: OpportunityImportBatchRecord[] }) {
  if (records.length === 0) return null;

  const latest = records[0];
  return (
    <div className="mt-3 rounded-xl border border-gray-200 bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Import / Refresh History</p>
          <p className="mt-1 text-sm font-semibold text-gray-900">
            Last {latest.mode === 'refresh' ? 'refresh' : 'import'}: {formatBatchDate(latest.createdAt)}
          </p>
        </div>
        <Badge label={`${records.length} batch${records.length === 1 ? '' : 'es'}`} tone="gray" />
      </div>
      <div className="mt-3 space-y-2">
        {records.slice(0, 3).map((record) => (
          <div key={record.id} className="rounded-lg bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600">
            <span className="font-bold text-gray-900">{record.mode === 'refresh' ? 'Refresh' : 'Import'}</span>
            {' '}on {formatBatchDate(record.createdAt)} - {record.rowCount} rows, {record.newCount} new, {record.changedCount} changed, {record.skippedCount} skipped, {record.invalidCount} invalid.
            {record.mappingProfileName && (
              <span className="mt-1 block text-gray-500">
                Mapping: {record.mappingProfileName}{record.sourceType ? ` (${record.sourceType})` : ''}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ImportedOpportunityEnrichmentSignal({
  summary,
}: {
  summary: ReturnType<typeof summarizeImportedOpportunityEnrichment>;
}) {
  if (summary.importedCount === 0) return null;

  return (
    <section className="rounded-lg border border-amber-100 bg-amber-50/70 p-5 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-amber-700" />
            <h2 className="text-lg font-bold text-navy">Imported Opportunities Need Enrichment</h2>
          </div>
          <p className="mt-1 text-sm leading-6 text-amber-900/75">
            Imported CRM copies are useful for review, but they often need buyer, champion, process, evidence, and proof context before defense.
          </p>
        </div>
        <Badge label={`${summary.importedCount} imported`} tone="amber" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Metric label="No buyer" value={summary.missingEconomicBuyer} tone={summary.missingEconomicBuyer ? 'amber' : 'green'} />
        <Metric label="No champion" value={summary.missingChampion} tone={summary.missingChampion ? 'amber' : 'green'} />
        <Metric label="No process" value={summary.missingDecisionProcess} tone={summary.missingDecisionProcess ? 'amber' : 'green'} />
        <Metric label="No action" value={summary.missingNextAction} tone={summary.missingNextAction ? 'red' : 'green'} />
        <Metric label="No evidence" value={summary.missingEvidence} tone={summary.missingEvidence ? 'red' : 'green'} />
        <Metric label="Proof gaps" value={summary.missingProofAsset} tone={summary.missingProofAsset ? 'amber' : 'green'} />
      </div>
    </section>
  );
}

type ImportedPipelineSummary = {
  importedCount: number;
  totalCount: number;
  fy26Total: number;
  fy27Total: number;
  stageInferredCount: number;
  withBrandCount: number;
  withChannelCount: number;
  withProbabilityCount: number;
  needsActionCount: number;
  topBrands: ForecastDimensionSummary[];
  topChannels: ForecastDimensionSummary[];
};

type ForecastDimensionSummary = {
  label: string;
  count: number;
  fy26Total: number;
};

function ImportedPipelineForecastPanel({
  summary,
  onFilter,
}: {
  summary: ImportedPipelineSummary;
  onFilter: (filter: OpportunityQuickFilter) => void;
}) {
  if (summary.importedCount === 0) return null;

  return (
    <section className="rounded-lg border border-emerald-100 bg-emerald-50/70 p-5 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-emerald-700" />
            <h2 className="text-lg font-bold text-navy">Imported Pipeline Forecast</h2>
          </div>
          <p className="mt-1 text-sm leading-6 text-emerald-900/75">
            Founder core pipeline is available as reviewable forecast data: FY value, brand/channel context, probability, and inferred-stage flags.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onFilter('imported')}
          className="inline-flex items-center justify-center rounded-full bg-navy px-3 py-1.5 text-xs font-bold text-white"
        >
          Review imported
        </button>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <Metric label="Imported" value={formatCount(summary.importedCount)} tone="green" />
        <Metric label="FY26" value={formatBaseMoney(summary.fy26Total)} tone="green" />
        <Metric label="FY27" value={formatBaseMoney(summary.fy27Total)} tone="blue" />
        <Metric label="Stage inferred" value={formatCount(summary.stageInferredCount)} tone={summary.stageInferredCount ? 'amber' : 'green'} />
        <Metric label="With brand" value={formatCount(summary.withBrandCount)} tone="blue" />
        <Metric label="With channel" value={formatCount(summary.withChannelCount)} tone="blue" />
        <Metric label="Probability" value={formatCount(summary.withProbabilityCount)} tone="blue" />
        <Metric label="Needs action" value={formatCount(summary.needsActionCount)} tone={summary.needsActionCount ? 'red' : 'green'} />
      </div>
      {(summary.topBrands.length > 0 || summary.topChannels.length > 0) && (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <ForecastDimensionList title="Top brands by FY26" items={summary.topBrands} />
          <ForecastDimensionList title="Top channels by FY26" items={summary.topChannels} />
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => onFilter('stageInferred')} className="rounded-full border border-amber-200 bg-white px-3 py-1.5 text-xs font-bold text-amber-700">
          Check inferred stages
        </button>
        <button type="button" onClick={() => onFilter('fy26')} className="rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-xs font-bold text-emerald-700">
          FY26 pipeline
        </button>
        <button type="button" onClick={() => onFilter('needsAction')} className="rounded-full border border-red-200 bg-white px-3 py-1.5 text-xs font-bold text-red-700">
          Missing next action
        </button>
      </div>
    </section>
  );
}

function ForecastDimensionList({ title, items }: { title: string; items: ForecastDimensionSummary[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-emerald-100 bg-white p-3">
        <p className="text-xs font-bold uppercase tracking-wide text-gray-400">{title}</p>
        <p className="mt-2 text-sm font-semibold text-gray-500">No imported values yet.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-emerald-100 bg-white p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-gray-400">{title}</p>
      <div className="mt-2 space-y-2">
        {items.map((item) => (
          <div key={item.label} className="flex items-center justify-between gap-3 rounded-md bg-gray-50 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-gray-800" title={item.label}>{item.label}</p>
              <p className="text-xs font-semibold text-gray-500">{item.count} deal{item.count === 1 ? '' : 's'}</p>
            </div>
            <p className="whitespace-nowrap text-sm font-black text-emerald-700">{formatBaseMoney(item.fy26Total)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ImportMetric({ label, value, tone }: { label: string; value: number; tone: 'green' | 'amber' | 'red' }) {
  const toneClass = {
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-700',
  }[tone];

  return (
    <div className="rounded-lg bg-white p-3 ring-1 ring-gray-100">
      <p className="text-xs font-bold uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-lg font-black ${toneClass}`}>{value}</p>
    </div>
  );
}

type OpportunityMasterRow = {
  opportunity: CrmLiteOpportunity;
  quality: ReturnType<typeof analyzeOpportunityQuality>;
  commercial: OpportunityCommercialSummary;
  linkedActivityCount: number;
  lastActivityDate: string;
  lastUpdatedAt: string;
  silence: OpportunitySilenceState;
  /** `expectedClosePeriod` read onto one absolute quarter axis. */
  closePeriod: ClosePeriod;
};

type OpportunityCommercialSummary = {
  quotes: QuoteRecord[];
  activeQuotes: number;
  acceptedQuotes: number;
  atRiskQuotes: number;
  quotedValue: number;
  topQuote: QuoteRecord | null;
  topRisk: ReturnType<typeof getQuoteRisk> | null;
  label: string;
};

/**
 * Which optional columns have anything in them.
 *
 * The master list used to render seventeen columns unconditionally, four of
 * which are only ever filled by a founder CSV import: FY26, FY27, probability,
 * and brand/channel. In a workspace that does not use them every row read "Not
 * set", "Not set", "Not set", "No brand" - roughly 380px of horizontal scroll
 * spent saying nothing, in a table already too wide to read.
 *
 * Deleting them was not an option: they are real fields for the pipeline they
 * were built for. So a column appears when at least one row in the *filtered*
 * set has a value for it, and stays gone otherwise. Computed over the filtered
 * rows rather than the page, so paging never makes a column appear and vanish
 * underneath the operator.
 */
type OpportunityColumnVisibility = {
  fy26: boolean;
  fy27: boolean;
  probability: boolean;
  brand: boolean;
};

function buildOpportunityColumnVisibility(rows: OpportunityMasterRow[]): OpportunityColumnVisibility {
  return {
    fy26: rows.some((row) => Boolean(row.opportunity.fy26Value)),
    fy27: rows.some((row) => Boolean(row.opportunity.fy27Value)),
    // Judged on open deals only. Won is 100% and Lost is 0% by definition, so
    // counting them would raise this column in every workspace that has ever
    // closed anything, to tell the operator what the Stage badge already said.
    probability: rows.some((row) => opportunityBand(row) === 0 && typeof row.opportunity.pipelineProbability === 'number'),
    brand: rows.some((row) => Boolean((row.opportunity.brand || '').trim() || (row.opportunity.channel || '').trim())),
  };
}

/** Rows split into close-quarter runs, for the grouped view. */
type OpportunityRowGroup = {
  key: string;
  label: string;
  rows: OpportunityMasterRow[];
  value: number;
  /** Closed deals show a count but no money - see below. */
  showValue: boolean;
  /**
   * Deals in this group carrying money the rate table cannot price. They are
   * counted in `rows` and cannot be in `value`, and a heading that says
   * "3 deals · 42,000,000 JPY" while one of them is 340,000 NOK is understating
   * the quarter without saying so.
   */
  unpriced: number;
};

/**
 * The heading a row sits under.
 *
 * Band comes first, because a group has to mean one thing. Grouping purely by
 * quarter put four deals under "No close date · 3.23B VND" - two live and
 * undated, one won, one lost - and that total is not a number about anything.
 * Closed deals get their own heading at the bottom and no money figure at all,
 * since a won deal plus a lost deal is not a sum worth printing.
 */
function groupHeadingFor(row: OpportunityMasterRow) {
  const band = opportunityBand(row);
  if (band === 2) return { key: 'closed', label: 'Closed · won and lost', showValue: false };
  if (band === 1) return { key: 'on-hold', label: 'On hold', showValue: true };
  return {
    key: `close:${closePeriodGroupKey(row.closePeriod)}`,
    label: closePeriodGroupLabel(row.closePeriod),
    showValue: true,
  };
}

function groupRowsByClosePeriod(rows: OpportunityMasterRow[]): OpportunityRowGroup[] {
  const groups: OpportunityRowGroup[] = [];
  rows.forEach((row) => {
    const heading = groupHeadingFor(row);
    const last = groups[groups.length - 1];
    if (last && last.key === heading.key) {
      last.rows.push(row);
      return;
    }
    groups.push({ ...heading, rows: [row], value: 0, unpriced: 0 });
  });

  // Through the money engine, because a quarter holds whatever currencies the
  // deals in it were agreed in. This used to add the raw amounts together and
  // label the answer with the first row's currency, so a quarter holding
  // 42,000,000 JPY and 120,000 USD read "42,120,000 JPY" - a number that is
  // neither total, and in a currency it is not in. The heading is now the same
  // reporting-currency sum every other aggregate in the product prints.
  return groups.map((group) => ({
    ...group,
    value: sumMoneyInBase(group.rows.map((row) => ({
      amount: row.opportunity.estimatedValue,
      currency: row.opportunity.currency,
    }))),
    unpriced: group.rows.filter((row) => (row.opportunity.estimatedValue || 0) > 0
      && convertMoney(row.opportunity.estimatedValue, row.opportunity.currency) === null).length,
  }));
}

function OpportunityMasterTable({
  rows,
  allRows,
  columns,
  grouped,
  totalRows,
  totalOpportunities,
  page,
  pageCount,
  pageSize,
  selectedIds,
  sortKey,
  sortDirection,
  onSort,
  onPageChange,
  onPageSizeChange,
  onToggleSelection,
  onOpen,
  onDraftFollowUp,
}: {
  /** The rows on this page - what gets rendered. */
  rows: OpportunityMasterRow[];
  /** Every row that survived the filters - what the group headings count. */
  allRows: OpportunityMasterRow[];
  columns: OpportunityColumnVisibility;
  /** True when the rows are in close-quarter order and can carry group headings. */
  grouped: boolean;
  totalRows: number;
  totalOpportunities: number;
  page: number;
  pageCount: number;
  pageSize: number;
  selectedIds: string[];
  sortKey: OpportunitySortKey;
  sortDirection: SortDirection;
  onSort: (key: OpportunitySortKey) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onToggleSelection: (opportunityId: string) => void;
  onOpen: (opportunity: CrmLiteOpportunity) => void;
  onDraftFollowUp: (opportunity: CrmLiteOpportunity) => void;
}) {
  const optionalCount = Number(columns.fy26) + Number(columns.fy27) + Number(columns.probability) + Number(columns.brand);
  // Nine base columns fit a laptop without horizontal scroll; each optional one
  // adds its own width back rather than the table reserving space for all four.
  const minWidth = 1120 + optionalCount * 110;
  /**
   * Two passes on purpose.
   *
   * `groups` is what gets rendered - only the rows on this page. `groupTotals`
   * is what the heading counts, and it reads every row that survived the
   * filters. Building both from the page meant the heading described the page
   * slice: on a 27-deal workspace at 25 rows a page, "CLOSED - WON AND LOST"
   * announced 6 deals, and changing the page size to 50 - which changes no
   * data at all - made the same heading say 8. The money subtotal was cut the
   * same way and silently, which is worse: an operator reconciling what they
   * closed this year against a quarter heading was reading the first page of
   * it. The same reasoning as `opportunityColumns` above, which already reads
   * the filtered rows rather than the page.
   */
  const groups = grouped
    ? groupRowsByClosePeriod(rows)
    : [{ key: 'all', label: '', rows, value: 0, showValue: false, unpriced: 0 }];
  const groupTotals = useMemo(
    () => new Map(groupRowsByClosePeriod(allRows).map((group) => [group.key, group])),
    [allRows],
  );
  const columnCount = 9 + optionalCount;

  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-gray-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-bold text-navy">Opportunity Master List</h2>
          <p className="mt-1 text-xs text-gray-500">
            {formatCount(totalRows)} after filters / {formatCount(totalOpportunities)} total
            {selectedIds.length > 0 ? ` / ${selectedIds.length} selected` : ''}
            {' · '}
            {/* Said out loud, because an ordering rule the operator cannot see is
                one they will read as a bug the first time a won deal is not
                where they expect it. */}
            <span className="font-semibold text-gray-600">open pipeline first, closed deals last</span>
          </p>
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

      {/* See index.css: the header sticks to this scroller, not to the page.
          A 110px page offset inside a horizontally scrolling wrapper pinned it
          over the first rows instead. */}
      <div className="record-table-scroller">
        <table className="w-full border-collapse text-left text-sm" style={{ minWidth }}>
          <thead className="sticky top-0 z-10 bg-gray-50 text-[11px] font-bold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="sticky left-0 z-20 w-10 border-b border-gray-200 bg-gray-50 px-2 py-2.5 text-center">
                <span className="sr-only">Select</span>
                <span aria-hidden="true">·</span>
              </th>
              <OpportunitySortableHeader label="Deal" sortKey="account" activeKey={sortKey} direction={sortDirection} onSort={onSort} className="sticky left-10 z-20 border-r border-gray-200 bg-gray-50" />
              <OpportunitySortableHeader label="Close" sortKey="closePeriod" activeKey={sortKey} direction={sortDirection} onSort={onSort} />
              <OpportunitySortableHeader label="Stage" sortKey="stage" activeKey={sortKey} direction={sortDirection} onSort={onSort} />
              <OpportunitySortableHeader label="Value" sortKey="value" activeKey={sortKey} direction={sortDirection} onSort={onSort} className="text-right" />
              {columns.fy26 && <OpportunitySortableHeader label="FY26" sortKey="fy26" activeKey={sortKey} direction={sortDirection} onSort={onSort} className="text-right" />}
              {columns.fy27 && <OpportunitySortableHeader label="FY27" sortKey="fy27" activeKey={sortKey} direction={sortDirection} onSort={onSort} className="text-right" />}
              {columns.probability && <OpportunitySortableHeader label="Prob." sortKey="probability" activeKey={sortKey} direction={sortDirection} onSort={onSort} className="text-right" />}
              {columns.brand && <th className="border-b border-gray-200 px-3 py-2.5">Brand</th>}
              <OpportunitySortableHeader label="Health" sortKey="quality" activeKey={sortKey} direction={sortDirection} onSort={onSort} />
              <OpportunitySortableHeader label="Next action" sortKey="nextActionDate" activeKey={sortKey} direction={sortDirection} onSort={onSort} />
              <OpportunitySortableHeader label="Last touch" sortKey="updatedAt" activeKey={sortKey} direction={sortDirection} onSort={onSort} />
              <th className="border-b border-gray-200 px-2 py-2.5 text-right">
                <span className="sr-only">Open</span>
                <span aria-hidden="true">·</span>
              </th>
            </tr>
          </thead>

          {groups.map((group) => (
            <tbody key={group.key} className="divide-y divide-gray-100">
              {grouped && (
                <tr className="bg-gray-50/80">
                  <td colSpan={columnCount} className="sticky left-0 border-y border-gray-200 px-3 py-1.5">
                    <span className="flex flex-wrap items-baseline gap-x-2 text-[11px]">
                      <span className="font-bold uppercase tracking-wide text-navy">{group.label}</span>
                      <span className="font-semibold text-gray-500">
                        {groupTotals.get(group.key)?.rows.length !== group.rows.length
                          ? `${group.rows.length} of ${groupTotals.get(group.key)?.rows.length ?? group.rows.length}`
                          : group.rows.length}
                        {' '}
                        {(groupTotals.get(group.key)?.rows.length ?? group.rows.length) === 1 ? 'deal' : 'deals'}
                      </span>
                      {group.showValue && (groupTotals.get(group.key)?.value ?? group.value) > 0 && (
                        <span className="text-gray-500">
                          {formatBaseMoney(groupTotals.get(group.key)?.value ?? group.value)}
                        </span>
                      )}
                      {group.showValue && (groupTotals.get(group.key)?.unpriced ?? group.unpriced) > 0 && (
                        <span className="text-amber-700">
                          · {groupTotals.get(group.key)?.unpriced ?? group.unpriced} not converted
                        </span>
                      )}
                    </span>
                  </td>
                </tr>
              )}

              {group.rows.map((row) => {
                const { opportunity, quality, closePeriod } = row;
                const selected = selectedIds.includes(opportunity.id);
                const flow = buildOpportunitySalesFlowGuidance(opportunity);
                const quiet = row.silence.status === 'silent' || row.silence.status === 'at-risk';
                return (
                  <tr
                    key={opportunity.id}
                    onClick={() => onOpen(opportunity)}
                    className={`group cursor-pointer align-top transition hover:bg-blue-50/60 ${selected ? 'bg-blue-50/40' : 'bg-white'}`}
                  >
                    <td className={`sticky left-0 z-10 px-2 py-2.5 text-center group-hover:bg-blue-50 ${selected ? 'bg-blue-50' : 'bg-white'}`}>
                      <input
                        type="checkbox"
                        checked={selected}
                        onClick={(event) => event.stopPropagation()}
                        onChange={() => onToggleSelection(opportunity.id)}
                        aria-label={`Select ${opportunity.accountName} / ${opportunity.opportunityName}`}
                        // 16px of box measured 20x20 with the browser's own
                        // border, which is under the WCAG 2.5.8 floor of 24 and
                        // was the only failure left on this route at 390px. The
                        // tick itself stays the size it was; the target does not.
                        className="h-4 w-4 cursor-pointer accent-brand-blue outline-offset-2 [transform:scale(1.15)]"
                        style={{ minWidth: 24, minHeight: 24, padding: 2 }}
                      />
                    </td>

                    {/* Account and opportunity were two columns showing nearly the
                        same words - "Apex Labs / Validation Expansion decontamination
                        expansion" beside "Validation Expansion". One column, customer
                        first, because that is how an operator looks a deal up. */}
                    <td className={`sticky left-10 z-10 border-r border-gray-100 px-3 py-2.5 group-hover:bg-blue-50 ${selected ? 'bg-blue-50' : 'bg-white'}`}>
                      <p className="max-w-[clamp(230px,17vw,420px)] truncate font-bold text-navy" title={opportunity.accountName}>
                        {opportunity.accountName || 'No account'}
                      </p>
                      <p
                        className="max-w-[clamp(230px,17vw,420px)] line-clamp-2 text-xs text-gray-600"
                        title={`${opportunity.opportunityName}${opportunity.productOrSolution ? ` · ${opportunity.productOrSolution}` : ''}${opportunity.decisionMaker ? ` · DM: ${opportunity.decisionMaker}` : ''}`}
                      >
                        {opportunity.opportunityName || 'Untitled opportunity'}
                      </p>
                      {!opportunity.decisionMaker && (
                        <p className="text-[11px] font-semibold text-amber-700">No decision maker</p>
                      )}
                      {isFounderImportedOpportunity(opportunity) && (
                        <p className="text-[11px] font-semibold text-emerald-700">Imported core</p>
                      )}
                    </td>

                    <td className="whitespace-nowrap px-3 py-2.5">
                      <ClosePeriodChip period={closePeriod} />
                    </td>

                    {/* Sales flow used to be a column of its own holding a
                        sentence, which made every row about 120px tall. It is
                        stage-gate guidance, so it belongs under the stage; the
                        sentence itself is one hover away and already sits in the
                        detail panel. */}
                    <td className="px-3 py-2.5">
                      <Badge label={opportunity.stage} />
                      <p className="mt-1 text-[11px] text-gray-500">
                        {opportunity.isStageInferred ? 'Inferred stage' : opportunity.status}
                      </p>
                      <p
                        className={`mt-0.5 text-[11px] font-semibold ${flow.status === 'Needs action' ? 'text-amber-700' : 'text-gray-500'}`}
                        title={flow.suggestedAction}
                      >
                        {flow.status}
                        {flow.missingCheckpoints.length > 0 ? ` · ${flow.missingCheckpoints.length} gap${flow.missingCheckpoints.length === 1 ? '' : 's'}` : ''}
                      </p>
                    </td>

                    <td className="whitespace-nowrap px-3 py-2.5 text-right font-bold text-gray-800">
                      {opportunity.estimatedValue ? formatMoney(opportunity.estimatedValue, opportunity.currency) : '—'}
                    </td>

                    {columns.fy26 && (
                      <td className="whitespace-nowrap px-3 py-2.5 text-right font-bold text-emerald-700">
                        {opportunity.fy26Value ? formatMoney(opportunity.fy26Value, opportunity.currency) : '—'}
                      </td>
                    )}
                    {columns.fy27 && (
                      <td className="whitespace-nowrap px-3 py-2.5 text-right font-bold text-gray-800">
                        {opportunity.fy27Value ? formatMoney(opportunity.fy27Value, opportunity.currency) : '—'}
                      </td>
                    )}
                    {columns.probability && (
                      /* Through `resolveProbability`, like every weighted figure
                         in the product. The cell used to print the declared
                         number and an em-dash otherwise, so a deal contributing
                         its stage default to the forecast showed no probability
                         at all here - the column and the forecast were reading
                         two different values off the same record. The stage-
                         derived case is marked, because "25% because I said so"
                         and "25% because it is in Qualification" are not the
                         same claim. */
                      <ProbabilityCell opportunity={opportunity} />
                    )}
                    {columns.brand && (
                      <td className="px-3 py-2.5">
                        <div className="flex max-w-[150px] flex-wrap gap-1">
                          {opportunity.brand && <Badge label={opportunity.brand} tone="green" />}
                          {opportunity.channel && <Badge label={opportunity.channel} tone="blue" />}
                        </div>
                      </td>
                    )}

                    {/* Forecast evidence, review decision and deal quality were
                        three columns answering one question from three angles.
                        The verdict leads; the two judgements that produced it sit
                        under it in the same cell. */}
                    <td className="px-3 py-2.5">
                      <Badge
                        label={quality.status}
                        tone={quality.status === 'High risk' ? 'red' : quality.status === 'Needs cleanup' ? 'amber' : 'green'}
                      />
                      <p className="mt-1 max-w-[clamp(160px,12vw,300px)] truncate text-[11px] text-gray-600" title={`Forecast evidence: ${opportunity.forecastEvidenceCategory} · Review decision: ${opportunity.decisionRecommendation}`}>
                        {opportunity.forecastEvidenceCategory} · {opportunity.decisionRecommendation}
                      </p>
                      <p className="text-[11px] text-gray-500" title={quality.primaryAction}>
                        {quality.issues.length} gap{quality.issues.length === 1 ? '' : 's'} · {row.linkedActivityCount} {row.linkedActivityCount === 1 ? 'touch' : 'touches'}
                      </p>
                    </td>

                    <td className="px-3 py-2.5">
                      <p
                        className={`max-w-[clamp(210px,16vw,400px)] line-clamp-2 font-semibold ${opportunity.nextAction ? 'text-gray-800' : 'text-amber-700'}`}
                        title={opportunity.nextAction}
                      >
                        {opportunity.nextAction || 'No next action'}
                      </p>
                      {opportunity.nextAction && (
                        <p className={`text-[11px] font-semibold ${isPastDate(opportunity.nextActionDate) ? 'text-red-600' : 'text-gray-500'}`}>
                          {formatSafeBusinessDate(opportunity.nextActionDate)}
                        </p>
                      )}
                    </td>

                    <td className="whitespace-nowrap px-3 py-2.5">
                      {/* The column is headed "Last touch", so the line under it
                          has to be one. It printed `lastUpdatedAt` - the later
                          of the newest activity and the record's own edit - and
                          on a deal with no activity that is only the edit. An
                          imported book read "Aug 23, 2026" over "No touch" in
                          every row: a date, presented as the answer to when you
                          last spoke to them, that nobody had spoken on. The
                          edit still shows, underneath, called what it is. */}
                      <p className={`text-[11px] font-semibold ${row.lastActivityDate ? 'text-gray-700' : 'text-amber-700'}`}>
                        {row.lastActivityDate ? formatOpportunityDate(row.lastActivityDate) : 'No touch yet'}
                      </p>
                      <p className={`text-[11px] ${row.silence.status === 'silent' ? 'font-bold text-red-600' : row.silence.status === 'at-risk' ? 'font-bold text-amber-600' : 'text-gray-500'}`}>
                        {quiet
                          ? `Quiet ${row.silence.daysQuiet}d`
                          : row.lastActivityDate ? '' : `Record updated ${formatOpportunityDate(row.lastUpdatedAt)}`}
                      </p>
                      {quiet && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onDraftFollowUp(opportunity);
                          }}
                          className="mt-1 rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-brand-blue hover:border-brand-blue/40"
                        >
                          Draft follow-up
                        </button>
                      )}
                    </td>

                    <td className="px-2 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpen(opportunity);
                        }}
                        title="Open opportunity details"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 hover:border-brand-blue hover:text-brand-blue"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
      </div>

      <div className="flex flex-col gap-3 border-t border-gray-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-gray-500">
          Showing {totalRows === 0 ? 0 : ((page - 1) * pageSize) + 1}-{Math.min(page * pageSize, totalRows)} of {formatCount(totalRows)}
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

/**
 * The close quarter, with the operator's own wording kept underneath it.
 *
 * A record saying "Next quarter" is shown as the quarter it resolves to, but the
 * chip stays visibly softer than one that named a quarter outright, and the raw
 * text is on the row. The distinction is worth preserving: "Q4 2026" is a date
 * somebody committed to, "next quarter" is a date we inferred, and a forecast
 * that treats them as the same number is how a quarter goes missing.
 */
function ClosePeriodChip({ period }: { period: ClosePeriod }) {
  if (period.rank === UNKNOWN_RANK) {
    return (
      <span
        className="inline-flex items-center rounded border border-dashed border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[11px] font-bold text-amber-800"
        title={period.raw ? `"${period.raw}" could not be read as a close date` : 'No close period on this deal'}
      >
        {period.label}
      </span>
    );
  }

  const inferred = period.basis === 'relative' || period.yearInferred || period.basis === 'later';
  return (
    <span title={period.raw && period.raw !== period.longLabel ? `Recorded as "${period.raw}"` : period.longLabel}>
      <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-bold ${
        inferred ? 'border border-dashed border-blue-200 bg-blue-50/60 text-blue-800' : 'bg-blue-50 text-brand-blue'
      }`}>
        {period.label}
      </span>
      {inferred && period.raw && (
        <span className="mt-0.5 block max-w-[110px] truncate text-[10px] text-gray-500">{period.raw}</span>
      )}
    </span>
  );
}

function OpportunitySortableHeader({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
  className = '',
}: {
  label: string;
  sortKey: OpportunitySortKey;
  activeKey: OpportunitySortKey;
  direction: SortDirection;
  onSort: (key: OpportunitySortKey) => void;
  className?: string;
}) {
  const active = sortKey === activeKey;
  return (
    <th className={`border-b border-gray-200 px-3 py-3 ${className}`}>
      <button type="button" onClick={() => onSort(sortKey)} className="inline-flex min-h-[24px] items-center gap-1 hover:text-navy">
        {label}
        <ArrowUpDown className={`h-3.5 w-3.5 ${active ? 'text-brand-blue' : 'text-gray-300'}`} />
        <span className="sr-only">{active ? `Sorted ${direction}` : 'Not sorted'}</span>
      </button>
    </th>
  );
}

function OpportunityPanel({
  mode,
  form,
  saveState,
  message,
  editingOpportunity,
  linkedActivities,
  stakeholders,
  objections,
  actionOutcomes,
  opportunityOutcomes,
  salesAssets,
  allOpportunities,
  allStakeholders,
  knownAccountNames,
  accountAliases,
  accountWarningForced,
  closeOutNudge,
  quotes,
  dataUserId,
  sampleDataActive,
  onChange,
  onActionOutcomesChange,
  onSaveOpportunityOutcome,
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
  stakeholders: StakeholderRecord[];
  objections: ObjectionRecord[];
  actionOutcomes: ActionOutcomeRecord[];
  opportunityOutcomes: OpportunityOutcomeRecord[];
  salesAssets: SalesAssetRecord[];
  allOpportunities: CrmLiteOpportunity[];
  /** Customers already in the workspace, by their surviving name. */
  /**
   * Every stakeholder in the workspace, not just the ones already on this deal.
   * A new opportunity has none attached yet, and the people fields below are
   * exactly where the contacts the workspace already knows should be offered.
   */
  allStakeholders: StakeholderRecord[];
  knownAccountNames: string[];
  accountAliases: AccountAliasIndex;
  /** True once a save has raised the near-miss, so the field shows it too. */
  accountWarningForced: boolean;
  /** Increments when a save was refused for want of a close-out reason. */
  closeOutNudge: number;
  quotes: QuoteRecord[];
  /** Whose workspace the purchase cost below is written into. */
  dataUserId?: string;
  sampleDataActive: boolean;
  onChange: (form: OpportunityFormInput) => void;
  onActionOutcomesChange: (outcomes: ActionOutcomeRecord[]) => void;
  onSaveOpportunityOutcome: (opportunity: CrmLiteOpportunity, draft: OpportunityOutcomeDraft) => void;
  onSave: () => void;
  onClose: () => void;
  onDelete?: () => void;
  onCreateDefenseBrief?: () => void;
}) {
  // Declared before the early return below: a hook after a conditional return is
  // a different hook order on every open and close of this panel.
  const [accountFieldLeft, setAccountFieldLeft] = useState(false);
  const { ref: drawerRef, dialogProps } = useModalDrawer({
    onClose,
    label: mode === 'add' ? 'Add opportunity' : 'Opportunity details',
    enabled: mode !== 'closed',
  });

  if (mode === 'closed') {
    return null;
  }

  const update = <Key extends keyof OpportunityFormInput>(key: Key, value: OpportunityFormInput[Key]) => {
    onChange({ ...form, [key]: value });
  };
  const currentOpportunity = editingOpportunity ? { ...editingOpportunity, ...form } : null;
  // Principals already in the workspace, so the second deal for a line spells
  // it the same way as the first - a brand typed two ways is two brands in
  // every rollup that reads it.
  const brandOptions = Array.from(new Set(
    allOpportunities.map((opportunity) => (opportunity.brand || '').trim()).filter(Boolean),
  )).sort((a, b) => a.localeCompare(b));

  // The account field is the deal's only link to a customer, so it offers what
  // the workspace knows instead of trusting the seller to spell it the same way
  // twice. Matches anywhere in the name, diacritics ignored.
  const accountQuery = normalizeEntityName(form.accountName);
  const accountOptions = knownAccountNames
    // Word-by-word rather than one contiguous run: this book is Vietnamese, and
    // a customer filed as "CÔNG TY CỔ PHẦN DƯỢC PHẨM CỬU LONG" has to be
    // findable by "duoc cuu long" - the way anyone actually types it.
    .filter((name) => matchesSearchQuery(name, form.accountName))
    .filter((name) => normalizeEntityName(name) !== accountQuery)
    .slice(0, 8)
    .map((name) => ({ key: `account-${name}`, primary: name, onPick: () => update('accountName', name) }));

  /**
   * The people this customer already has on file.
   *
   * Decision maker and budget owner were free text, which is how the same
   * person becomes three people: "Dr. Avery", "Avery", "avery nguyen". Every
   * one of those names is already in the workspace with a role beside it, so
   * the field offers them rather than trusting the operator to spell it the
   * same way twice. It stays typeable - a decision maker the workspace has
   * never met is a real case, and the whole point of the unattached-subject
   * queue is that naming them is how they get added.
   */
  const stakeholderOptionsFor = (field: 'decisionMaker' | 'budgetOwner') => {
    // Folded the same way as the names below, so typing "duc" finds "Đức".
    const typed = normalizeEntityName(form[field] || '');
    const forAccount = allStakeholders.filter((person) => sameAccount(person.accountName, form.accountName));
    // Fall back to the whole book only when the account is not named yet;
    // otherwise a customer's own contacts would compete with everyone else's.
    const pool = forAccount.length > 0 || form.accountName.trim() ? forAccount : allStakeholders;
    return pool
      .filter((person) => person.name.trim())
      .filter((person) => !typed || normalizeEntityName(person.name).includes(typed))
      .filter((person) => normalizeEntityName(person.name) !== typed)
      .slice(0, 8)
      .map((person) => ({
        key: `${field}-${person.id}`,
        primary: person.name,
        secondary: [person.roleTitle, person.stakeholderRole !== 'Unknown' ? person.stakeholderRole : '']
          .filter(Boolean)
          .join(' · '),
        onPick: () => update(field, person.name),
      }));
  };

  // What this workspace actually sells, read off the deals already recorded.
  // Same reasoning as the brand field beside it: a product spelled two ways is
  // two products in every rollup that groups by it.
  const productQuery = (form.productOrSolution || '').trim().toLowerCase();
  const productOptions = Array.from(new Set(
    allOpportunities.map((opportunity) => (opportunity.productOrSolution || '').trim()).filter(Boolean),
  ))
    .filter((name) => !productQuery || name.toLowerCase().includes(productQuery))
    .filter((name) => name.toLowerCase() !== productQuery)
    .sort((a, b) => a.localeCompare(b))
    .slice(0, 8)
    .map((name) => ({ key: `product-${name}`, primary: name, onPick: () => update('productOrSolution', name) }));

  const accountCheck = checkAccountName(form.accountName, knownAccountNames, accountAliases);

  /**
   * Moves the deal to a stage, from either control that can do it.
   *
   * Two rules travel with the move and neither is optional, which is why this is
   * one function rather than two copies: the probability follows the stage
   * unless the seller has already put their own number on it - their judgement
   * outranks the convention, a blank field does not - and Status follows too,
   * because Stage and Status both name the outcome and letting them disagree is
   * how a deal ends up won on the board and open in the forecast.
   */
  const changeStage = (value: OpportunityStage) => {
    const stageDefault = defaultProbabilityForStage(value);
    const untouched = form.pipelineProbability === null
      || form.pipelineProbability === undefined
      || form.pipelineProbability === defaultProbabilityForStage(form.stage);
    onChange({
      ...form,
      stage: value,
      status: statusForStage(value, form.status),
      pipelineProbability: untouched && stageDefault !== null ? stageDefault : form.pipelineProbability,
    });
  };

  /**
   * A deal the seller is closing right now, or one already closed.
   *
   * The close-out form used to live only inside the deep-analysis `<details>`
   * below, which is shut by default. Setting Status to Lost therefore
   * produced a save error telling the operator to use a form they
   * could not see - the deal simply refused to close, with no way out on
   * screen. So a closed deal wears its close-out at the top level, beside the
   * status that made it closed, and the collapsed copy below is skipped rather
   * than rendered twice.
   */
  const closingThisDeal = mode === 'edit'
    && currentOpportunity !== null
    && (form.status === 'Won' || form.status === 'Lost');

  return (
    <>
      <button
        type="button"
        aria-label="Close opportunity details"
        onClick={onClose}
        className="fixed inset-y-0 left-0 right-0 top-16 z-40 bg-slate-950/25 backdrop-blur-[1px] lg:left-[220px]"
      />
      <aside ref={drawerRef} {...dialogProps} className="fixed bottom-0 right-0 top-16 z-50 w-full overflow-y-auto border-l border-gray-200 bg-white p-5 shadow-2xl sm:max-w-[760px]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">{mode === 'add' ? 'Add Opportunity' : 'Edit Opportunity'}</p>
          <h2 className="mt-2 text-xl font-bold text-navy">
            {mode === 'add' ? 'New deal record' : editingOpportunity?.opportunityName}
          </h2>
          {mode === 'edit' && editingOpportunity && (
            <RecordStamp className="mt-1" createdAt={editingOpportunity.createdAt} updatedAt={editingOpportunity.updatedAt} />
          )}
          {editingOpportunity?.accountName && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                to={`/app/accounts?accountName=${encodeURIComponent(editingOpportunity.accountName)}`}
                className="inline-flex rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-bold text-brand-blue hover:border-brand-blue/40"
              >
                View Account Memory
              </Link>
              <Link
                to={`/app/capture?mode=quick&account=${encodeURIComponent(editingOpportunity.accountName)}&opportunity=${encodeURIComponent(editingOpportunity.opportunityName)}`}
                className="inline-flex rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:border-emerald-300"
              >
                Capture Update
              </Link>
            </div>
          )}
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-full border border-gray-200 p-2 text-gray-500 hover:bg-gray-50">
          <X className="h-4 w-4" />
        </button>
      </div>

      {mode === 'edit' && currentOpportunity && (
        <DealFirstThingHead
          snapshot={buildCommercialJourneySnapshot({
            opportunity: currentOpportunity,
            quotes,
            activities: linkedActivities,
            objections,
          })}
        />
      )}

      {currentOpportunity && (
        <OpportunitySalesFlowCard
          guidance={buildOpportunitySalesFlowGuidance(currentOpportunity)}
          onUseAsNextAction={(action) => onChange({ ...form, nextAction: action })}
        />
      )}

      {/* Read from `form`, not from the saved record, so it answers about what
          is on screen right now. */}
      {mode === 'edit' && form.status === 'Active' && <WhyThisDealIsFlagged form={form} />}

      <div className="mt-5 space-y-4">
        <div>
          <SuggestInput
            label="Account"
            required
            value={form.accountName}
            placeholder="Your customer's company"
            onChange={(value) => { update('accountName', value); setAccountFieldLeft(false); }}
            onBlurred={() => setAccountFieldLeft(true)}
            options={accountOptions}
          />
          {/* A near-miss is only worth saying once the seller has stopped
              typing: mid-word, the dropdown above is already offering the fix.
              The confirmations ("you already have this customer", "you merged
              this name away") are safe to show live. */}
          <AccountNameNotice
            check={accountCheck}
            settled={accountFieldLeft || accountWarningForced}
            onUse={(name) => { update('accountName', name); setAccountFieldLeft(true); }}
          />
        </div>
        <Field label="Opportunity" value={form.opportunityName} onChange={(value) => update('opportunityName', value)} required />

        {/* The ladder, drawn. A stage is a position on a route, and a dropdown
            renders that as eleven words in a list - you cannot see that
            Proposal is two steps from Procurement, or that a deal has not moved
            since Discovery. The bar is also the faster control: moving a deal
            on is one tap on the step ahead of it. */}
        <StageProgress stage={form.stage} status={form.status} onPick={changeStage} />

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <SelectField
            label="Stage"
            value={form.stage}
            options={opportunityStages}
            onChange={changeStage}
          />
          <SelectField
            label="Status"
            value={form.status}
            options={opportunityStatuses}
            onChange={(value) => onChange({ ...form, status: value, stage: stageForStatus(value, form.stage) })}
          />
          <div>
            <ProbabilityField
              value={form.pipelineProbability ?? null}
              onChange={(value) => update('pipelineProbability', value)}
            />
            <ProbabilityNotice form={form} />
          </div>
          <Field
            label="Estimated value"
            type="number"
            min={0}
            step={1000}
            value={form.estimatedValue?.toString() || ''}
            onChange={(value) => update('estimatedValue', value ? Math.max(0, Number(value)) : null)}
          />
          {/* A picker, not a text box. Free text is how a workspace ends up
              with "sgd", "SGD ", "usd" and "US$" as four different currencies
              that no conversion can add together - and the imported book
              arrived denominated in SGD, so the wrong value was already the
              one sitting in the field. A new deal opens on the reporting
              currency from Settings. */}
          <SelectField
            label="Currency"
            value={normalizeFormCurrency(form.currency)}
            options={listSelectableCurrencies().map(({ code }) => code)}
            onChange={(value) => update('currency', value)}
          />
          {/* A date, not a phrase. `resolveClosePeriod` already treats a real
              date as the strongest signal - "the only form that says which
              quarter without anybody guessing" - and free text was producing
              "Q3", "Q3/2026", "August" and "04/08/2026" as four unrelated
              values for one quarter. The quarter and month groupings on the
              list are derived from this, so they cost the operator nothing to
              maintain. */}
          <Field
            label="Expected close date"
            type="date"
            value={form.expectedClosePeriod}
            onChange={(value) => update('expectedClosePeriod', value)}
          />
          <Field label="Next action date" type="date" value={form.nextActionDate} onChange={(value) => update('nextActionDate', value)} />
        </div>


        {/* Pricing, at the moment a price is being decided.
            Above the deep-analysis fold on purpose: this is not analysis of a
            deal that already happened, it is the number about to be sent, and a
            capability shut inside a collapsed <details> is one the founder
            already reported as missing once. Shown only once the deal is
            actually being quoted - a Lead does not need a landed-cost form. */}
        {mode === 'edit' && currentOpportunity && isQuotingStage(currentOpportunity, quotes.length) && (
          <QuotePricingPanel
            opportunity={currentOpportunity}
            quotes={quotes}
            dataUserId={dataUserId}
            sampleDataActive={sampleDataActive}
          />
        )}

        <SuggestInput
          label="Product / solution"
          value={form.productOrSolution}
          onChange={(value) => update('productOrSolution', value)}
          options={productOptions}
        />
        {/* The principal whose line this deal sells. It arrived with the CSV
            import and had no way in by hand, so a deal added manually could
            never join a brand - which made the brand rollup a report on the
            import rather than on the business. */}
        <Field
          label="Brand / principal"
          value={form.brand || ''}
          onChange={(value) => update('brand', value)}
          suggestions={brandOptions}
        />
        <SuggestInput
          label="Decision maker"
          value={form.decisionMaker}
          onChange={(value) => update('decisionMaker', value)}
          options={stakeholderOptionsFor('decisionMaker')}
        />
        <SuggestInput
          label="Budget owner"
          value={form.budgetOwner}
          onChange={(value) => update('budgetOwner', value)}
          options={stakeholderOptionsFor('budgetOwner')}
        />
        <ProcurementPathField
          value={form.procurementPath}
          expectedCloseDate={form.expectedClosePeriod}
          deal={{
            decisionMaker: form.decisionMaker,
            budgetOwner: form.budgetOwner,
            technicalCriteria: form.technicalCriteria,
          }}
          onChange={(value) => update('procurementPath', value)}
          onUseAsNextAction={(action) => onChange({ ...form, nextAction: action })}
        />
        <TextArea label="Technical criteria" value={form.technicalCriteria} onChange={(value) => update('technicalCriteria', value)} />
        <TextArea label="Next action" value={form.nextAction} onChange={(value) => update('nextAction', value)} />
        <TextArea label="Evidence" value={form.evidence} onChange={(value) => update('evidence', value)} />
        <TextArea label="Missing context" value={form.missingContext} onChange={(value) => update('missingContext', value)} />
        <TextArea label="Objection debt" value={form.objectionDebt} onChange={(value) => update('objectionDebt', value)} />

        {/* Two fields the founder read as jargon, so they now say what they
            ask. Both drive real behaviour - Revenue discounts a value whose
            evidence is "Hope-based", and the review brief groups deals by the
            recommendation - which makes a mis-set one expensive, and a
            not-understood one mis-set by definition. */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <SelectField
            label="Forecast evidence"
            hint="How much of this value the customer has actually confirmed. Hope-based and Unsupported are discounted on Revenue."
            value={form.forecastEvidenceCategory}
            options={forecastEvidenceCategories}
            onChange={(value) => update('forecastEvidenceCategory', value)}
          />
          <SelectField
            label="Decision recommendation"
            hint="What you intend to do about it: Defend (protect it), Rescue (fix it), Downgrade (cut the number), Monitor (watch), Deprioritize (stop working it)."
            value={form.decisionRecommendation}
            options={decisionRecommendations}
            onChange={(value) => update('decisionRecommendation', value)}
          />
        </div>

        {currentOpportunity && (
          <ForecastCallPanel
            opportunity={currentOpportunity}
            objections={objections}
            stakeholders={stakeholders}
            activities={linkedActivities}
            actionOutcomes={actionOutcomes}
            salesAssets={salesAssets}
            onApply={(patch) => onChange({ ...form, ...patch })}
          />
        )}
      </div>

      {mode === 'edit' && (
        <details className="mt-5 rounded-xl border border-gray-200 bg-gray-50/60 p-4">
          <summary className="cursor-pointer text-sm font-bold text-navy">
            Full deal analysis — stakeholders, MEDDIC, quotes, objections, action plan, retro, assets, activity
          </summary>
          <div className="mt-4 space-y-4">
          {currentOpportunity && (
            <StakeholderMap
              opportunity={currentOpportunity}
              stakeholders={stakeholders}
              objections={objections}
              activities={linkedActivities}
            />
          )}
          {currentOpportunity && <OpportunityCommercialPanel opportunity={currentOpportunity} quotes={quotes} />}
          {currentOpportunity && <OpportunityObjectionLedger opportunity={currentOpportunity} objections={objections} />}
          {currentOpportunity && (
            <MeddicLitePanel
              opportunity={currentOpportunity}
              stakeholders={stakeholders}
              objections={objections}
              activities={linkedActivities}
            />
          )}
          {currentOpportunity && (
            <RecommendedActionPlanPanel
              opportunity={currentOpportunity}
              stakeholders={stakeholders}
              objections={objections}
              activities={linkedActivities}
              actionOutcomes={actionOutcomes}
              onActionOutcomesChange={onActionOutcomesChange}
              onUseAsNextAction={(action) => onChange({
                ...form,
                nextAction: action.title,
                nextActionDate: action.suggestedDueDate || form.nextActionDate,
              })}
            />
          )}
          {/* Only when it is not already open above. A closed deal shows its
              close-out beside the status; an active one keeps it down here with
              the rest of the analysis. */}
          {currentOpportunity && !closingThisDeal && (
            <OpportunityOutcomeRetroPanel
              opportunity={currentOpportunity}
              outcomes={getOpportunityOutcomesForOpportunity(opportunityOutcomes, currentOpportunity)}
              stakeholders={stakeholders}
              objections={objections}
              onSaveOutcome={(draft) => onSaveOpportunityOutcome(currentOpportunity, draft)}
            />
          )}
          {currentOpportunity && (
            <ActionOutcomeHistory
              opportunity={currentOpportunity}
              actionOutcomes={actionOutcomes}
              stakeholders={stakeholders}
              objections={objections}
              activities={linkedActivities}
            />
          )}
          {currentOpportunity && (
            <RelevantSalesAssetsPanel
              opportunity={currentOpportunity}
              objections={objections}
              stakeholders={stakeholders}
              activities={linkedActivities}
              actionOutcomes={actionOutcomes}
              assets={salesAssets}
              allOpportunities={allOpportunities}
            />
          )}
          <LinkedActivitiesTimeline activities={linkedActivities} />
          </div>
        </details>
      )}

      {/* The close-out sits immediately above the save it is a condition of.
          It used to render near Status, a screen and a half up, and the save
          that demands it prints its refusal down here - so the operator read
          "fill in the close-out" with no close-out anywhere in sight and
          reported the form as missing, twice. Scrolling them to it was not
          enough: the fix is that the demand and the answer share a viewport.
          The nudge below still runs, but now it has almost nothing to move. */}
      {closingThisDeal && currentOpportunity && (
        <OpportunityOutcomeRetroPanel
          opportunity={currentOpportunity}
          outcomes={getOpportunityOutcomesForOpportunity(opportunityOutcomes, currentOpportunity)}
          closing
          nudge={closeOutNudge}
          stakeholders={stakeholders}
          objections={objections}
          onSaveOutcome={(draft) => onSaveOpportunityOutcome(currentOpportunity, draft)}
        />
      )}

      {message && (
        <p className={`mt-4 rounded-lg px-3 py-2 text-sm font-semibold ${
          saveState === 'saved' ? 'bg-emerald-50 text-emerald-700' : saveState === 'error' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'
        }`}>
          {message}
        </p>
      )}

      {/*
       * Pinned to the bottom of the drawer since 2026-08-23. This form is 4.3
       * screens tall on a 900px window (measured: 3607px of content in an 847px
       * scrollport), and Save sat at the end of it as ordinary flow content. So
       * correcting one field near the top - the thing a seller does most often
       * in here - meant scrolling ~2,700px to commit it, and the surface that
       * promises "nothing goes quiet" gave no visible way to save without
       * hunting for one.
       *
       * `-mx-5 -mb-5` cancels the drawer's own p-5 so the bar spans its full
       * width and the rows scroll under an opaque edge rather than beside it.
       */}
      <div className="sticky bottom-0 -mx-5 -mb-5 mt-5 flex flex-wrap gap-2 border-t border-gray-200 bg-white px-5 py-3">
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
    </>
  );
}

/**
 * Opens the deal drawer on the one question the seller has: what do I do first?
 * Position, money, risk, and the next commitment - the same commercial-journey
 * read-model Today and Ask use - before the long CRM form and the folded deep
 * analysis. The drawer used to open straight into a form of twenty fields.
 */
function DealFirstThingHead({ snapshot }: { snapshot: ReturnType<typeof buildCommercialJourneySnapshot> }) {
  const commitment = formatJourneyCommitment(snapshot.nextCommitment);
  return (
    <section className="mt-4 rounded-xl border border-brand-blue/20 bg-blue-50/50 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-navy px-2.5 py-1 text-xs font-black text-white">{snapshot.position}</span>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          {snapshot.positionSource === 'money-flow' ? 'from money flow' : 'from sales stage'}
        </span>
        {snapshot.daysQuiet !== null && snapshot.daysQuiet > 0 && (
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">Quiet {snapshot.daysQuiet}d</span>
        )}
      </div>
      <p className="mt-3 text-xs font-bold uppercase tracking-wide text-brand-blue">Do this first</p>
      <p className="mt-1 text-sm font-bold leading-6 text-navy">
        {snapshot.nextCommitment ? commitment : 'No next action set — decide the first move and add it below.'}
      </p>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="rounded-lg bg-white/70 px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Money</p>
          <p className="mt-0.5 text-xs font-semibold text-gray-700">{snapshot.moneyStatus || 'Not captured'}</p>
        </div>
        <div className="rounded-lg bg-white/70 px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Risk</p>
          <p className="mt-0.5 text-xs font-semibold text-gray-700">{snapshot.riskStatus || 'None flagged'}</p>
        </div>
        <div className="rounded-lg bg-white/70 px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Blocker</p>
          <p className="mt-0.5 text-xs font-semibold text-gray-700">{snapshot.blocker || 'None captured'}</p>
        </div>
      </div>
      {snapshot.lastTouch && (
        <p className="mt-3 text-xs text-gray-500">
          Last touch {formatSafeBusinessDate(snapshot.lastTouch.date)}: {snapshot.lastTouch.summary}
        </p>
      )}
    </section>
  );
}

function OpportunitySalesFlowCard({
  guidance,
  onUseAsNextAction,
}: {
  guidance: OpportunitySalesFlowGuidance;
  onUseAsNextAction: (action: string) => void;
}) {
  const tone = salesFlowTone(guidance.status);
  return (
    <section className={`mt-5 rounded-lg border p-4 ${opportunityActionToneClass(tone)}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <GitBranch className="h-4 w-4 text-brand-blue" />
            <p className="text-xs font-bold uppercase tracking-wide">Sales flow checkpoint</p>
            <Badge label={guidance.step.label} tone="blue" />
            <Badge label={guidance.status} tone={tone} />
          </div>
          <h3 className="mt-2 text-base font-bold text-navy">{guidance.suggestedAction}</h3>
          <p className="mt-1 text-sm leading-6 text-gray-600">{guidance.reason}</p>
          <div className="mt-3 flex gap-1" aria-label={`Sales flow progress: ${guidance.step.label}`}>
            {salesFlowSteps.map((step, index) => (
              <span
                key={step.id}
                className={`h-1.5 min-w-0 flex-1 rounded-full ${index <= guidance.stepIndex ? 'bg-brand-blue' : 'bg-gray-200'}`}
                title={step.label}
              />
            ))}
          </div>
        </div>
        {guidance.status === 'Needs action' && (
          <button
            type="button"
            onClick={() => onUseAsNextAction(guidance.suggestedAction)}
            className="inline-flex w-fit shrink-0 rounded-full bg-navy px-3 py-1.5 text-xs font-bold text-white"
          >
            Use next action
          </button>
        )}
      </div>
    </section>
  );
}

function opportunityActionToneClass(tone: 'blue' | 'green' | 'amber' | 'red') {
  return {
    blue: 'border-blue-100 bg-blue-50/70',
    green: 'border-emerald-100 bg-emerald-50/70',
    amber: 'border-amber-100 bg-amber-50/70',
    red: 'border-red-100 bg-red-50/70',
  }[tone];
}

function salesFlowTone(status: OpportunitySalesFlowGuidance['status']): 'blue' | 'green' | 'amber' | 'red' {
  if (status === 'Completed') return 'green';
  if (status === 'Closed') return 'red';
  if (status === 'Paused') return 'amber';
  if (status === 'Ready to advance') return 'green';
  return 'amber';
}

function OpportunityCommercialPanel({
  opportunity,
  quotes,
}: {
  opportunity: CrmLiteOpportunity;
  quotes: QuoteRecord[];
}) {
  const commercial = buildOpportunityCommercialSummary(opportunity, quotes);
  const href = buildQuoteLink(opportunity, quotes.length === 0);
  const topQuote = commercial.topQuote;

  return (
    <section className="mt-5 rounded-lg border border-cyan-100 bg-cyan-50/70 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-cyan-700">Commercial status</p>
          <p className="mt-1 text-sm font-bold text-navy">
            {topQuote
              ? `${topQuote.title}: ${topQuote.nextAction || commercial.topRisk || 'review quote status'}`
              : 'No quote is linked to this opportunity yet.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={href} className="inline-flex rounded-full bg-navy px-3 py-1.5 text-xs font-bold text-white">
            {quotes.length ? 'Open quotes' : 'Create quote'}
          </Link>
          <Link to="/app/revenue" className="inline-flex rounded-full border border-cyan-200 bg-white px-3 py-1.5 text-xs font-bold text-cyan-700">
            Revenue view
          </Link>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
        <Metric label="Quotes" value={commercial.quotes.length} tone={commercial.quotes.length ? 'blue' : 'green'} />
        <Metric label="Active" value={commercial.activeQuotes} tone={commercial.activeQuotes ? 'blue' : 'green'} />
        <Metric label="Pending PO" value={commercial.acceptedQuotes} tone={commercial.acceptedQuotes ? 'amber' : 'green'} />
        <Metric label="At risk" value={commercial.atRiskQuotes} tone={commercial.atRiskQuotes ? 'red' : 'green'} />
      </div>

      {topQuote ? (
        <div className="mt-3 rounded-lg bg-white p-3 ring-1 ring-cyan-100">
          <div className="flex flex-wrap gap-2">
            <Badge label={topQuote.status} tone={topQuote.status === 'Accepted' ? 'green' : 'blue'} />
            {commercial.topRisk && commercial.topRisk !== 'None' && <Badge label={commercial.topRisk} tone={quoteRiskTone(commercial.topRisk)} />}
            {topQuote.validUntil && <Badge label={`Valid until ${formatOpportunityDate(topQuote.validUntil)}`} tone={commercial.topRisk === 'Expired' ? 'red' : commercial.topRisk === 'Expiring soon' ? 'amber' : 'gray'} />}
          </div>
          <p className="mt-2 text-xs font-semibold text-gray-500">
            {formatMoney(topQuote.amount || 0, topQuote.currency)}
            {topQuote.paymentTerm ? ` | ${topQuote.paymentTerm}` : ''}
          </p>
        </div>
      ) : (
        <p className="mt-3 rounded-lg bg-white p-3 text-sm text-gray-500 ring-1 ring-cyan-100">
          Create a quote when this deal moves from pipeline defense to commercial follow-up.
        </p>
      )}
    </section>
  );
}

function DefenseBriefPreviewModal({
  opportunities,
  objections,
  stakeholders,
  activities,
  actionOutcomes,
  salesAssets,
  metadata,
  onMetadataChange,
  createState,
  message,
  onCreate,
  onClose,
}: {
  opportunities: CrmLiteOpportunity[];
  objections: ObjectionRecord[];
  stakeholders: StakeholderRecord[];
  activities: SalesActivityRecord[];
  actionOutcomes: ActionOutcomeRecord[];
  salesAssets: SalesAssetRecord[];
  metadata: BriefPreviewMetadata;
  onMetadataChange: (metadata: BriefPreviewMetadata) => void;
  createState: SaveState;
  message: string;
  onCreate: () => void;
  onClose: () => void;
}) {
  const generatedDeals = mapOpportunitiesToPipelineDefenseDeals(opportunities, { objections, stakeholders, activities, actionOutcomes, salesAssets });
  const updateMetadata = <Key extends keyof BriefPreviewMetadata>(
    key: Key,
    value: BriefPreviewMetadata[Key],
  ) => {
    onMetadataChange({ ...metadata, [key]: value });
  };

  useEscapeToClose(onClose);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/60 p-4">
      <section role="dialog" aria-modal="true" aria-label="Pipeline Defense Brief preview" className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-gray-200 p-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Pipeline Defense Preview</p>
            <h2 className="mt-2 text-2xl font-bold text-navy">Generate Defense Brief</h2>
            <p className="mt-1 text-sm leading-6 text-gray-500">
              Review the generated draft before creating a new Pipeline Defense Brief. This will not overwrite existing briefs.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full border border-gray-200 p-2 text-gray-500 hover:bg-gray-50">
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
              <article key={deal.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
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

function RelevantSalesAssetsPanel({
  opportunity,
  objections,
  stakeholders,
  activities,
  actionOutcomes,
  assets,
  allOpportunities,
}: {
  opportunity: CrmLiteOpportunity;
  objections: ObjectionRecord[];
  stakeholders: StakeholderRecord[];
  activities: SalesActivityRecord[];
  actionOutcomes: ActionOutcomeRecord[];
  assets: SalesAssetRecord[];
  allOpportunities: CrmLiteOpportunity[];
}) {
  const patterns = generateSalesPlaybookPatterns({
    opportunities: allOpportunities,
    stakeholders,
    objections,
    activities,
    actionOutcomes,
    limit: 12,
  });
  const relevant = getRelevantSalesAssetsForOpportunity({ opportunity, assets, objections, patterns });
  const suggested = suggestSalesAssetsForOpportunity({ opportunity, objections, patterns, assets });

  return (
    <section className="mt-5 rounded-lg border border-cyan-100 bg-cyan-50/60 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-cyan-700" />
            <p className="text-xs font-bold uppercase tracking-wide text-cyan-700">Relevant Sales Assets</p>
          </div>
          <h3 className="mt-1 text-base font-bold text-navy">Proof and snippets for this deal</h3>
          <p className="mt-1 text-sm leading-6 text-cyan-900/75">
            Assets are reusable text blocks for objections, proof, proposals, procurement, and pipeline defense.
          </p>
        </div>
        <Link to="/app/assets" className="inline-flex w-fit rounded-full bg-navy px-3 py-1.5 text-xs font-bold text-white">
          Open Assets
        </Link>
      </div>

      {relevant.length === 0 && suggested.length === 0 ? (
        <p className="mt-3 rounded-lg bg-white p-3 text-sm text-gray-600 ring-1 ring-cyan-100">
          No specific asset need detected yet. Create assets from Playbook patterns as repeated proof gaps emerge.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {relevant.slice(0, 4).map((asset) => (
            <article key={asset.id} className="rounded-lg bg-white p-3 ring-1 ring-cyan-100">
              <div className="flex flex-wrap gap-2">
                <Badge label={asset.assetType} tone="blue" />
                {asset.relatedObjectionType && <Badge label={asset.relatedObjectionType} tone="amber" />}
              </div>
              <p className="mt-2 text-sm font-bold text-navy">{asset.title}</p>
              <p className="mt-1 text-xs leading-5 text-gray-500">{asset.summary || asset.useCase}</p>
            </article>
          ))}
          {suggested.slice(0, relevant.length > 0 ? 2 : 4).map((need) => (
            <article key={need.id} className="rounded-lg border border-dashed border-cyan-200 bg-white/80 p-3">
              <div className="flex flex-wrap gap-2">
                <Badge label="Suggested asset" tone="gray" />
                <Badge label={need.assetType} tone="blue" />
                <Badge label={need.priority} tone={need.priority === 'High' ? 'red' : need.priority === 'Medium' ? 'amber' : 'green'} />
              </div>
              <p className="mt-2 text-sm font-bold text-navy">{need.title}</p>
              <p className="mt-1 text-xs leading-5 text-gray-500">{need.reason}</p>
            </article>
          ))}
        </div>
      )}
    </section>
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
                {formatSafeBusinessDate(activity.activityDate)} | {activity.activityType}
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

function StakeholderMap({
  opportunity,
  stakeholders,
  objections,
  activities,
}: {
  opportunity: CrmLiteOpportunity;
  stakeholders: StakeholderRecord[];
  objections: ObjectionRecord[];
  activities: SalesActivityRecord[];
}) {
  const coverage = analyzeStakeholderCoverage(stakeholders, opportunity);
  const meddicMap = buildMeddicStakeholderMap({ opportunity, stakeholders, objections, activities });
  return (
    <section className="mt-5 rounded-lg border border-gray-100 bg-gray-50 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-gray-400">MEDDIC Stakeholder Map</p>
          <p className="mt-1 text-sm text-gray-500">Turn missing champion, buyer, procurement, and blocker signals into manager-ready evidence.</p>
        </div>
        <Link
          to={`/app/stakeholders?accountName=${encodeURIComponent(opportunity.accountName)}&opportunityName=${encodeURIComponent(opportunity.opportunityName)}`}
          className="inline-flex w-fit rounded-full border border-blue-100 bg-white px-3 py-1.5 text-xs font-bold text-brand-blue hover:bg-blue-50"
        >
          Add stakeholder
        </Link>
      </div>
      {meddicMap.items.length === 0 && (
        <div className="mt-3 rounded-lg border border-dashed border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-bold text-amber-950">Stakeholder map is empty.</p>
          <p className="mt-1 text-sm leading-6 text-amber-800">
            Add Champion, Economic Buyer, Technical Buyer, or Procurement owner to make your forecast defensible.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link to={`/app/stakeholders?accountName=${encodeURIComponent(opportunity.accountName)}&opportunityName=${encodeURIComponent(opportunity.opportunityName)}`} className="rounded-full bg-navy px-3 py-1.5 text-xs font-bold text-white">
              Add stakeholder
            </Link>
            <Link to={`/app/capture?mode=quick&account=${encodeURIComponent(opportunity.accountName)}&opportunity=${encodeURIComponent(opportunity.opportunityName)}`} className="rounded-full border border-emerald-100 bg-white px-3 py-1.5 text-xs font-bold text-emerald-700">
              Capture meeting note
            </Link>
            <span className="rounded-full border border-amber-200 bg-white px-3 py-1.5 text-xs font-bold text-amber-700">
              Mark role missing
            </span>
          </div>
        </div>
      )}
      {coverage.warnings.length > 0 && (
        <div className="mt-3 rounded-lg border border-amber-100 bg-amber-50 p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-amber-700">Coverage warnings</p>
          <ul className="mt-2 space-y-1 text-sm leading-6 text-amber-800">
            {coverage.warnings.map((warning) => <li key={warning}>- {warning}</li>)}
          </ul>
        </div>
      )}
      {meddicMap.missingRoles.length > 0 && (
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {meddicMap.missingRoles.map((missing) => (
            <div key={missing.role} className="rounded-lg border border-orange-100 bg-white p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-orange-700">Missing evidence</p>
              <p className="mt-1 text-sm font-bold text-navy">{missing.role}</p>
              <p className="mt-1 text-xs leading-5 text-gray-500">{missing.reason}</p>
            </div>
          ))}
        </div>
      )}
      {meddicMap.items.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500">No stakeholders mapped to this opportunity/account yet.</p>
      ) : (
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {meddicMap.items.slice(0, 8).map((stakeholder) => (
            <div key={stakeholder.stakeholderId || stakeholder.name} className="rounded-lg bg-white p-3 ring-1 ring-gray-100">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-bold text-navy">{stakeholder.name}</p>
                <Badge label={stakeholder.role} tone={stakeholder.role === 'Blocker' ? 'red' : stakeholder.role === 'Champion' ? 'green' : 'blue'} />
                <Badge label={stakeholder.confidence} tone={stakeholder.confidence === 'confirmed' ? 'green' : stakeholder.confidence === 'inferred' ? 'amber' : 'gray'} />
              </div>
              <p className="mt-1 text-xs font-semibold text-gray-500">
                {stakeholder.influenceLevel} influence | {stakeholder.relationshipStrength} relationship | {stakeholder.stance}
              </p>
              <p className="mt-1 text-xs text-gray-500">Last: {formatMeddicStakeholderDate(stakeholder.lastInteractionDate)}</p>
              {stakeholder.evidenceNote && <p className="mt-2 line-clamp-2 text-xs leading-5 text-gray-500">{stakeholder.evidenceNote}</p>}
              {stakeholder.openObjection && <p className="mt-2 rounded-md bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">Objection: {stakeholder.openObjection}</p>}
              {stakeholder.nextAction && <p className="mt-2 rounded-md bg-blue-50 px-2 py-1 text-xs font-semibold text-brand-blue">Next: {stakeholder.nextAction}</p>}
            </div>
          ))}
        </div>
      )}
      {(meddicMap.relationshipRisks.length > 0 || meddicMap.stakeholderNextActions.length > 0) && (
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <div className="rounded-lg border border-red-100 bg-white p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-red-700">Relationship risk</p>
            {meddicMap.relationshipRisks.length === 0 ? (
              <p className="mt-1 text-sm text-gray-500">No stakeholder relationship risk detected.</p>
            ) : (
              <ul className="mt-2 space-y-1 text-xs leading-5 text-gray-600">
                {meddicMap.relationshipRisks.map((risk) => <li key={risk}>- {risk}</li>)}
              </ul>
            )}
          </div>
          <div className="rounded-lg border border-blue-100 bg-white p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-brand-blue">Stakeholder next action</p>
            {meddicMap.stakeholderNextActions.length === 0 ? (
              <p className="mt-1 text-sm text-gray-500">No stakeholder-specific next action captured.</p>
            ) : (
              <ul className="mt-2 space-y-1 text-xs leading-5 text-gray-600">
                {/* Two stakeholders can genuinely owe the same next action -
                    the demo workspace has exactly that - so name plus action is
                    not unique, and React was warning it may duplicate or drop a
                    row. The position in an already-sliced, already-ordered list
                    is. */}
                {meddicMap.stakeholderNextActions.slice(0, 3).map((action, index) => (
                  <li key={`${index}-${action.stakeholderName}-${action.action}`}>- {action.stakeholderName}: {action.action}{action.dueDate ? ` (${formatSafeBusinessDate(action.dueDate)})` : ''}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function OpportunityObjectionLedger({ opportunity, objections }: { opportunity: CrmLiteOpportunity; objections: ObjectionRecord[] }) {
  const open = objections.filter((objection) => objection.status === 'Open');
  const addressed = objections.filter((objection) => objection.status === 'Addressed');
  const resolved = objections.filter((objection) => objection.status === 'Resolved');
  const warnings = [
    open.some((objection) => objection.impact === 'High') ? 'High-impact open objection exists.' : '',
    open.some((objection) => objection.objectionType === 'Competitor') ? 'Competitor objection is still open.' : '',
    open.some((objection) => ['Compliance / validation', 'Documentation'].includes(objection.objectionType)) ? 'Compliance/documentation objection is still open.' : '',
  ].filter(Boolean);

  return (
    <section className="mt-5 rounded-lg border border-gray-100 bg-gray-50 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Objection Ledger</p>
        <Link
          to={`/app/objections?accountName=${encodeURIComponent(opportunity.accountName)}&opportunityName=${encodeURIComponent(opportunity.opportunityName)}`}
          className="inline-flex w-fit rounded-full border border-blue-100 bg-white px-3 py-1.5 text-xs font-bold text-brand-blue hover:bg-blue-50"
        >
          Open Objection Ledger
        </Link>
      </div>
      {warnings.length > 0 && (
        <div className="mt-3 rounded-lg border border-red-100 bg-red-50 p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-red-700">Risk warnings</p>
          <ul className="mt-2 space-y-1 text-sm leading-6 text-red-800">
            {warnings.map((warning) => <li key={warning}>- {warning}</li>)}
          </ul>
        </div>
      )}
      {objections.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500">No structured objections linked to this opportunity yet.</p>
      ) : (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-semibold text-gray-500">Open {open.length} | Addressed {addressed.length} | Resolved {resolved.length}</p>
          {objections.slice(0, 6).map((objection) => (
            <div key={objection.id} className="rounded-lg bg-white p-3 ring-1 ring-gray-100">
              <div className="flex flex-wrap gap-2">
                <Badge label={objection.objectionType} tone={objection.objectionType === 'Competitor' ? 'amber' : 'blue'} />
                <Badge label={objection.impact} tone={objection.impact === 'High' ? 'red' : objection.impact === 'Medium' ? 'amber' : 'gray'} />
                <Badge label={objection.status} tone={objectionStatusTone(objection.status)} />
              </div>
              <p className="mt-2 text-sm font-bold text-navy">{objection.objectionText}</p>
              {objection.requiredProof && <p className="mt-1 text-xs leading-5 text-gray-500">Proof: {objection.requiredProof}</p>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function MeddicLitePanel({
  opportunity,
  stakeholders,
  objections,
  activities,
}: {
  opportunity: CrmLiteOpportunity;
  stakeholders: StakeholderRecord[];
  objections: ObjectionRecord[];
  activities: SalesActivityRecord[];
}) {
  const review = analyzeMeddicLiteOpportunity({ opportunity, stakeholders, objections, activities });

  return (
    <section className="mt-5 rounded-lg border border-blue-100 bg-blue-50/60 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-brand-blue">MEDDIC-lite Review</p>
          <h3 className="mt-1 text-base font-bold text-navy">Deal evidence check</h3>
          <p className="mt-1 text-sm leading-6 text-blue-900/75">
            Rule-based review of buyer, criteria, process, pain, champion, and competition.
          </p>
        </div>
        <Badge label={review.category} tone={meddicCategoryTone(review.category)} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2">
        {review.fields.map((field) => (
          <details key={field.key} className="rounded-lg bg-white p-3 ring-1 ring-blue-100">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
              <span className="text-sm font-bold text-navy">{field.label}</span>
              <Badge label={field.status} tone={meddicStatusTone(field.status)} />
            </summary>
            <div className="mt-3 grid grid-cols-1 gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Evidence</p>
                <ul className="mt-1 space-y-1 text-sm leading-6 text-gray-700">
                  {field.evidence.slice(0, 3).map((item) => <li key={item}>- {item}</li>)}
                </ul>
              </div>
              {field.gaps.length > 0 && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-amber-600">Gaps</p>
                  <ul className="mt-1 space-y-1 text-sm leading-6 text-amber-800">
                    {field.gaps.map((gap) => <li key={gap}>- {gap}</li>)}
                  </ul>
                </div>
              )}
            </div>
          </details>
        ))}
      </div>

      {review.gaps.length > 0 && (
        <div className="mt-4 rounded-lg border border-amber-100 bg-amber-50 p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-amber-700">Missing MEDDIC gaps</p>
          <ul className="mt-2 space-y-1 text-sm leading-6 text-amber-900">
            {review.gaps.slice(0, 6).map((gap) => <li key={gap}>- {gap}</li>)}
          </ul>
        </div>
      )}

      <div className="mt-4 rounded-lg border border-gray-100 bg-white p-3">
        <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Recommended defense answer</p>
        <p className="mt-1 text-sm leading-6 text-gray-700">{review.defenseAnswer}</p>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-lg bg-white p-3 ring-1 ring-blue-100">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Recommended questions</p>
          <ul className="mt-2 space-y-1 text-sm leading-6 text-gray-700">
            {review.recommendedQuestions.slice(0, 4).map((question) => <li key={question}>- {question}</li>)}
          </ul>
        </div>
        <div className="rounded-lg bg-white p-3 ring-1 ring-blue-100">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Recommended actions</p>
          <ul className="mt-2 space-y-1 text-sm leading-6 text-gray-700">
            {review.recommendedActions.slice(0, 4).map((action) => <li key={action}>- {action}</li>)}
          </ul>
        </div>
      </div>
    </section>
  );
}

function RecommendedActionPlanPanel({
  opportunity,
  stakeholders,
  objections,
  activities,
  actionOutcomes,
  onActionOutcomesChange,
  onUseAsNextAction,
}: {
  opportunity: CrmLiteOpportunity;
  stakeholders: StakeholderRecord[];
  objections: ObjectionRecord[];
  activities: SalesActivityRecord[];
  actionOutcomes: ActionOutcomeRecord[];
  onActionOutcomesChange: (outcomes: ActionOutcomeRecord[]) => void;
  onUseAsNextAction: (action: OpportunityRecommendedAction) => void;
}) {
  const [copyMessage, setCopyMessage] = useState('');
  const [outcomeAction, setOutcomeAction] = useState<OpportunityRecommendedAction | null>(null);
  const [outcomeType, setOutcomeType] = useState<ActionOutcomeType>('Improved');
  const [outcomeNote, setOutcomeNote] = useState('');
  const [completedAt, setCompletedAt] = useState(todayKey());
  const actions = generateOpportunityActionPlan({ opportunity, stakeholders, objections, activities }).slice(0, 5);

  const persistOutcome = (action: OpportunityRecommendedAction, patch: Parameters<typeof createActionOutcomeFromRecommendedAction>[1]) => {
    const existing = getActionOutcomeForAction(actionOutcomes, action);
    createActionOutcomeFromRecommendedAction(action, {
      ...patch,
      id: existing?.id,
      createdAt: existing?.createdAt,
    });
    onActionOutcomesChange(loadActionOutcomes());
  };

  const markDone = (action: OpportunityRecommendedAction) => {
    persistOutcome(action, {
      status: 'Done',
      outcomeType: 'Still unclear',
      outcomeNote: 'Action completed. Outcome still needs review.',
      completedAt: todayKey(),
    });
  };

  const dismissAction = (action: OpportunityRecommendedAction) => {
    persistOutcome(action, {
      status: 'Dismissed',
      outcomeType: 'No change',
      outcomeNote: 'Action dismissed or deprioritized.',
    });
  };

  const openOutcomeForm = (action: OpportunityRecommendedAction) => {
    const existing = getActionOutcomeForAction(actionOutcomes, action);
    setOutcomeAction(action);
    setOutcomeType(existing?.outcomeType || 'Improved');
    setOutcomeNote(existing?.outcomeNote || '');
    setCompletedAt(existing?.completedAt || todayKey());
  };

  const saveOutcome = () => {
    if (!outcomeAction) return;
    persistOutcome(outcomeAction, {
      status: 'Done',
      outcomeType,
      outcomeNote: outcomeNote.trim(),
      completedAt,
    });
    setOutcomeAction(null);
    setOutcomeNote('');
    setCompletedAt(todayKey());
  };

  const copyAction = async (action: OpportunityRecommendedAction) => {
    const text = formatOpportunityActionCopy(action);
    try {
      await navigator.clipboard.writeText(text);
      setCopyMessage('Copied action.');
    } catch {
      setCopyMessage(text);
    }
  };

  const copyAll = async () => {
    const text = generateOpportunityActionsMarkdown(actions);
    try {
      await navigator.clipboard.writeText(text);
      setCopyMessage('Copied all actions.');
    } catch {
      setCopyMessage(text);
    }
  };

  return (
    <section className="mt-5 rounded-lg border border-emerald-100 bg-emerald-50/60 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-emerald-700" />
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Recommended Action Plan</p>
          </div>
          <h3 className="mt-1 text-base font-bold text-navy">Next best actions for this deal</h3>
          <p className="mt-1 text-sm leading-6 text-emerald-900/75">
            Actions are generated from MEDDIC-lite gaps, stakeholder risk, objection debt, stale follow-up, timeline, and competition signals.
          </p>
        </div>
        <button
          type="button"
          onClick={copyAll}
          className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-50"
        >
          <Copy className="h-3.5 w-3.5" />
          Copy All Actions
        </button>
      </div>

      <div className="mt-4 space-y-3">
        {actions.map((action) => (
          <article key={action.id} className="rounded-lg bg-white p-3 ring-1 ring-emerald-100">
            {getActionOutcomeForAction(actionOutcomes, action) && (
              <div className="mb-2">
                <Badge
                  label={`${getActionOutcomeForAction(actionOutcomes, action)?.status}: ${getActionOutcomeForAction(actionOutcomes, action)?.outcomeType}`}
                  tone={outcomeTone(getActionOutcomeForAction(actionOutcomes, action)?.outcomeType)}
                />
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Badge label={action.priority} tone={actionPriorityTone(action.priority)} />
              <Badge label={action.sourceType} tone={action.sourceType === 'Objection' || action.sourceType === 'Competition' ? 'amber' : 'blue'} />
              {action.suggestedDueDate && <Badge label={`Due ${action.suggestedDueDate}`} tone="gray" />}
            </div>
            <h4 className="mt-2 text-sm font-bold text-navy">{action.title}</h4>
            <p className="mt-1 text-sm leading-6 text-gray-600">{action.reason}</p>
            {action.relatedGap && <p className="mt-1 text-xs font-semibold text-amber-700">Gap: {action.relatedGap}</p>}
            {action.relatedStakeholderName && <p className="mt-1 text-xs font-semibold text-gray-500">Stakeholder: {action.relatedStakeholderName}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => copyAction(action)}
                className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50"
              >
                <Copy className="h-3.5 w-3.5" />
                Copy Action
              </button>
              <button
                type="button"
                onClick={() => onUseAsNextAction(action)}
                className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-bold text-brand-blue hover:border-brand-blue/40"
              >
                Add to Opportunity Next Action
              </button>
              <button
                type="button"
                onClick={() => markDone(action)}
                className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:border-emerald-300"
              >
                Mark Done
              </button>
              <button
                type="button"
                onClick={() => openOutcomeForm(action)}
                className="rounded-full border border-amber-100 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700 hover:border-amber-300"
              >
                Add Outcome
              </button>
              <button
                type="button"
                onClick={() => dismissAction(action)}
                className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-100"
              >
                Dismiss
              </button>
            </div>
          </article>
        ))}
      </div>

      {outcomeAction && (
        <div className="mt-4 rounded-lg border border-amber-100 bg-white p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-amber-700">Add Outcome</p>
              <h4 className="mt-1 text-sm font-bold text-navy">{outcomeAction.title}</h4>
            </div>
            <button type="button" onClick={() => setOutcomeAction(null)} className="rounded-full border border-gray-200 p-1 text-gray-500">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <SelectField label="Outcome type" value={outcomeType} options={actionOutcomeTypes} onChange={(value) => setOutcomeType(value as ActionOutcomeType)} />
            <Field label="Completed date" type="date" value={completedAt} onChange={setCompletedAt} />
          </div>
          <TextArea label="Outcome note" value={outcomeNote} onChange={setOutcomeNote} />
          <button
            type="button"
            onClick={saveOutcome}
            className="mt-3 rounded-full bg-navy px-4 py-2 text-sm font-bold text-white"
          >
            Save Outcome
          </button>
        </div>
      )}

      {copyMessage && (
        <p className={`mt-3 rounded-lg px-3 py-2 text-xs font-semibold ${
          copyMessage.startsWith('Copied') ? 'bg-white text-emerald-700 ring-1 ring-emerald-100' : 'whitespace-pre-line bg-white text-gray-600 ring-1 ring-gray-100'
        }`}>
          {copyMessage}
        </p>
      )}
    </section>
  );
}

function OpportunityOutcomeRetroPanel({
  opportunity,
  outcomes,
  closing = false,
  nudge = 0,
  stakeholders = [],
  objections = [],
  onSaveOutcome,
}: {
  opportunity: CrmLiteOpportunity;
  outcomes: OpportunityOutcomeRecord[];
  /** Rendered beside the save because this deal is being closed, not filed away. */
  closing?: boolean;
  /** This deal's own people and objections, offered instead of retyped. */
  stakeholders?: StakeholderRecord[];
  objections?: ObjectionRecord[];
  /**
   * Bumped by a save that was refused for want of a reason. Each bump opens this
   * form, scrolls it into view and puts the cursor in the box, because the
   * message asking for it is rendered a screen away at the foot of the drawer.
   */
  nudge?: number;
  onSaveOutcome: (draft: OpportunityOutcomeDraft) => void;
}) {
  const [draft, setDraft] = useState<OpportunityOutcomeDraft>(() => buildOpportunityOutcomeDraft(opportunity));
  const [open, setOpen] = useState(closing || outcomes.length === 0);
  const sectionRef = useRef<HTMLElement | null>(null);
  const reasonRef = useRef<HTMLTextAreaElement | null>(null);

  // What was tapped, kept apart from what was typed, so the stored answer can
  // be recomposed from both without either overwriting the other.
  const [reasonPicks, setReasonPicks] = useState<string[]>([]);
  const [reasonNote, setReasonNote] = useState('');
  const [gapPicks, setGapPicks] = useState<string[]>([]);
  const [gapNote, setGapNote] = useState('');
  const [lessonPicks, setLessonPicks] = useState<string[]>([]);
  const [lessonNote, setLessonNote] = useState('');

  const reasonPresets = reasonPresetsFor(draft.outcome);

  /**
   * Files the deal under the category the first picked reason implies.
   *
   * "Price" is a bucket, not an answer, and asking for it separately spends a
   * decision on something the answer already contains. Only the first pick sets
   * it, and only while the operator has not chosen a category themselves - a
   * bucket that keeps changing under a deliberate choice is worse than no help.
   */
  const applyReasonPicks = (picks: string[]) => {
    setReasonPicks(picks);
    setDraft((current) => {
      const impliedCategory = reasonPresets.find((preset) => preset.label === picks[0])?.category;
      return {
        ...current,
        reasonText: composeRetroAnswer(picks, reasonNote),
        reasonCategory: impliedCategory && current.reasonCategory === 'Other' ? impliedCategory : current.reasonCategory,
      };
    });
  };

  // The people and the objections this deal already has on file. A retro is the
  // worst moment to ask someone to spell a name they recorded weeks ago.
  const stakeholderOptions = Array.from(new Set([
    opportunity.decisionMaker,
    opportunity.budgetOwner,
    ...stakeholders.map((person) => person.name),
  ].map((name) => (name || '').trim()).filter(Boolean)));

  const objectionOptions = Array.from(new Set([
    ...objections.map((objection) => (objection.objectionText || objection.objectionType || '').trim()),
    'No objection decided it',
  ].filter(Boolean)));

  useEffect(() => {
    if (nudge === 0) return;
    setOpen(true);
    // After the open above has painted, or the box being focused does not exist
    // yet.
    const timer = window.setTimeout(() => {
      sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      reasonRef.current?.focus();
    }, 60);
    return () => window.clearTimeout(timer);
  }, [nudge]);

  /**
   * Re-seed when the deal changes or the status being closed at changes - not
   * on every render.
   *
   * `opportunity` here is `{ ...editingOpportunity, ...form }`, rebuilt fresh by
   * the panel on every keystroke and on every save message, so an effect keyed
   * on the object itself reset this form constantly. Harmless while it lived
   * inside a collapsed section nobody opened; the moment closing a deal opens it
   * automatically, a failed save re-rendered the panel and erased the reason the
   * seller had just typed to satisfy it.
   */
  const reseedKey = `${opportunity.id}:${opportunity.status}`;
  useEffect(() => {
    const seeded = buildOpportunityOutcomeDraft(opportunity);
    setDraft(seeded);
    // A reason carried over from a previous retro cannot be split back into the
    // buttons that might have written it, so it lands in the typed line, where
    // it stays visible and editable rather than silently lost.
    setReasonPicks([]);
    setReasonNote(seeded.reasonText);
    setGapPicks([]);
    setGapNote(seeded.evidenceThatWasMissing || '');
    setLessonPicks([]);
    setLessonNote(seeded.lessonLearned || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reseedKey]);

  const update = <Key extends keyof OpportunityOutcomeDraft>(key: Key, value: OpportunityOutcomeDraft[Key]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const outcomeNeedsReason = draft.outcome === 'Won' || draft.outcome === 'Lost';

  return (
    <section ref={sectionRef} className="mt-5 rounded-lg border border-indigo-100 bg-indigo-50/70 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-700">
            {closing ? `Close this deal — ${opportunity.status}` : 'Closed-loop learning'}
          </p>
          <h3 className="mt-1 text-base font-bold text-navy">
            {closing ? 'Say why, and this closes' : 'Record win/loss/delay retro'}
          </h3>
          <p className="mt-1 text-sm leading-6 text-indigo-900/75">
            {closing
              ? 'This is the reason the save asked for. Fill it in and press Save outcome retro — that writes the outcome and sets the deal to closed for you.'
              : 'Mark the outcome and capture what Memoire should learn. This is not a heavy CRM close process.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="rounded-full border border-indigo-200 bg-white px-3 py-1.5 text-xs font-bold text-indigo-700"
        >
          {open ? 'Hide retro form' : closing ? 'Close this deal' : 'Mark outcome'}
        </button>
      </div>

      {open && (
        <div className="mt-4 grid gap-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <SelectField label="Outcome" value={draft.outcome} options={opportunityOutcomeOptions} onChange={(value) => update('outcome', value)} />
            <Field label="Outcome date" type="date" value={draft.outcomeDate} onChange={(value) => update('outcomeDate', value)} />
            <Field
              label="Final amount"
              type="number"
              value={draft.finalAmount?.toString() || ''}
              onChange={(value) => update('finalAmount', value ? Number(value) : null)}
            />
          </div>

          {/* The one question the save insists on, asked as a choice.
              Multi-select rather than one dropdown, because a deal is rarely
              lost for one reason - "price was too high" and "we never reached
              the decision maker" are usually the same story - and a form that
              forces a single cause gets the shallowest one. */}
          <QuickPickField
            label="Why did this happen?"
            hint="Tap what applies. Add a line only if none of these says it."
            options={reasonPresets.map((preset) => preset.label)}
            picks={reasonPicks}
            note={reasonNote}
            noteRef={reasonRef}
            notePlaceholder="Anything the buttons do not cover"
            onPicksChange={applyReasonPicks}
            onNoteChange={(value) => { setReasonNote(value); update('reasonText', composeRetroAnswer(reasonPicks, value)); }}
          />

          {/* Filed automatically from the reason picked, and still changeable.
              It is a bucket, not an answer, so it should not cost a decision. */}
          <SelectField
            label="Filed under"
            hint="Set from what you picked above. Change it if the bucket is wrong."
            value={draft.reasonCategory}
            options={opportunityOutcomeReasonCategories}
            onChange={(value) => update('reasonCategory', value)}
          />

          <details className="rounded-lg border border-indigo-100 bg-white/70 p-3">
            <summary className="cursor-pointer text-xs font-bold text-indigo-800">
              Add detail — who decided, which objection, what was missing, what to do differently
            </summary>
            <div className="mt-3 grid gap-3">
              {/* The people and objections already on this deal, offered rather
                  than retyped: the same reason every other name field in this
                  product offers what the workspace knows. */}
              <PickOrTypeField
                label="Which stakeholder mattered?"
                options={stakeholderOptions}
                value={draft.decisiveStakeholder || ''}
                onChange={(value) => update('decisiveStakeholder', value)}
              />
              <PickOrTypeField
                label="Which objection mattered?"
                options={objectionOptions}
                value={draft.objectionThatMattered || ''}
                onChange={(value) => update('objectionThatMattered', value)}
              />
              <QuickPickField
                label="What evidence was missing?"
                options={evidenceGapPresets}
                picks={gapPicks}
                note={gapNote}
                notePlaceholder="Something else that was never established"
                onPicksChange={(picks) => { setGapPicks(picks); update('evidenceThatWasMissing', composeRetroAnswer(picks, gapNote)); }}
                onNoteChange={(value) => { setGapNote(value); update('evidenceThatWasMissing', composeRetroAnswer(gapPicks, value)); }}
              />
              <QuickPickField
                label="What should I do differently next time?"
                options={lessonPresets}
                picks={lessonPicks}
                note={lessonNote}
                notePlaceholder="Your own lesson"
                onPicksChange={(picks) => { setLessonPicks(picks); update('lessonLearned', composeRetroAnswer(picks, lessonNote)); }}
                onNoteChange={(value) => { setLessonNote(value); update('lessonLearned', composeRetroAnswer(lessonPicks, value)); }}
              />
            </div>
          </details>
          <div className="flex flex-wrap items-center gap-2">
            {/* Won and Lost are the two outcomes the whole learning loop reads
                from, and a category alone says nothing a report can use -
                "Price" is not a reason, it is a bucket. Delayed and No decision
                stay unblocked: they are states, and often the honest answer is
                that nobody knows why yet. */}
            <button
              type="button"
              disabled={outcomeNeedsReason && !draft.reasonText.trim()}
              onClick={() => onSaveOutcome(draft)}
              className="inline-flex items-center gap-2 rounded-full bg-navy px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              <CheckCircle2 className="h-4 w-4" />
              Save outcome retro
            </button>
            {outcomeNeedsReason && !draft.reasonText.trim() && (
              <p className="text-xs font-semibold text-amber-800">
                {draft.outcome} needs a reason in "Why did this happen?" - it is what every win/loss report is built from.
              </p>
            )}
            <p className="text-xs font-semibold text-indigo-800">
              Previous forecast snapshot: {opportunity.forecastEvidenceCategory} / {opportunity.decisionRecommendation} / {opportunity.stage}
            </p>
          </div>
        </div>
      )}

      {outcomes.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-xs font-bold uppercase tracking-wide text-indigo-700">Recent retros</p>
          {outcomes.slice(0, 3).map((outcome) => (
            <div key={outcome.id} className="rounded-lg bg-white p-3 text-sm ring-1 ring-indigo-100">
              <div className="flex flex-wrap gap-2">
                <Badge label={outcome.outcome} tone={outcome.outcome === 'Won' ? 'green' : outcome.outcome === 'Lost' ? 'red' : 'amber'} />
                <Badge label={formatSafeBusinessDate(outcome.outcomeDate)} tone="gray" />
                <Badge label={outcome.reasonCategory} tone="blue" />
              </div>
              <p className="mt-2 font-semibold text-navy">{outcome.reasonText || 'Retro note not captured yet.'}</p>
              {outcome.lessonLearned && <p className="mt-1 text-gray-600">Lesson: {outcome.lessonLearned}</p>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ActionOutcomeHistory({
  opportunity,
  actionOutcomes,
  stakeholders,
  objections,
  activities,
}: {
  opportunity: CrmLiteOpportunity;
  actionOutcomes: ActionOutcomeRecord[];
  stakeholders: StakeholderRecord[];
  objections: ObjectionRecord[];
  activities: SalesActivityRecord[];
}) {
  const analysis = analyzeOpportunityOutcomeLoop({ opportunity, outcomes: actionOutcomes, stakeholders, objections, activities });
  const history = [...analysis.latestCompletedActions, ...analysis.dismissedActions]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 6);

  return (
    <section className="mt-5 rounded-lg border border-gray-100 bg-gray-50 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Action Outcome History</p>
      <p className="mt-1 text-sm leading-6 text-gray-600">
        {analysis.lastActionOutcomeSummary}
      </p>
      {analysis.dealNeedsReview && (
        <p className="mt-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
          Deal quality may need review: unresolved critical actions, stale actions, or unclear outcomes remain.
        </p>
      )}
      {history.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500">No completed or dismissed action outcomes yet.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {history.map((outcome) => (
            <article key={outcome.id} className="rounded-lg bg-white p-3 ring-1 ring-gray-100">
              <div className="flex flex-wrap gap-2">
                <Badge label={outcome.status} tone={outcome.status === 'Done' ? 'green' : 'gray'} />
                <Badge label={outcome.outcomeType} tone={outcomeTone(outcome.outcomeType)} />
                {(outcome.completedAt || outcome.updatedAt) && <Badge label={outcome.completedAt || outcome.updatedAt.slice(0, 10)} tone="gray" />}
              </div>
              <p className="mt-2 text-sm font-bold text-navy">{outcome.actionTitle}</p>
              {outcome.outcomeNote && <p className="mt-1 text-xs leading-5 text-gray-500">{outcome.outcomeNote}</p>}
              {outcome.relatedGap && <p className="mt-1 text-xs font-semibold text-amber-700">Gap: {outcome.relatedGap}</p>}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * Four buttons, two of them identically primary, and two that led away from the
 * page rather than filling it - "Start First Pipeline Review" on a workspace
 * with no pipeline to review. An empty state that offers four doors is asking
 * the new user to make a decision they have no basis for. One primary way in,
 * one quieter alternative for the person who has nothing to import.
 */
function EmptyState({ onAdd, onImport }: { onAdd: () => void; onImport: () => void }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
      <p className="text-base font-bold text-navy">Import the deals you are already working.</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-gray-500">
        Opportunities are the deals you want to track and defend. Bring in a CSV from wherever they live now - Memoire
        shows you what it read before it creates anything - and the evidence, risk and next-action views fill in behind it.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <button type="button" onClick={onImport} className="inline-flex items-center gap-2 rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">
          <Upload className="h-4 w-4" />
          Import CSV
        </button>
        <button type="button" onClick={onAdd} className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700">
          <Plus className="h-4 w-4" />
          Add one deal instead
        </button>
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

/**
 * A currency the picker can actually show.
 *
 * Records imported before the field was a picker can hold anything - lowercase,
 * padded, or a code this build does not carry. Falling back to the reporting
 * currency keeps the select from rendering blank and silently rewriting the
 * record to the first option in the list the moment anything else is edited.
 */
function normalizeFormCurrency(value: string): SupportedCurrency {
  const normalized = (value || '').trim().toUpperCase();
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(normalized)
    ? (normalized as SupportedCurrency)
    : getReportingCurrency();
}

/**
 * Probability on the eight rungs the stage table uses, and nothing between.
 *
 * It was a free number box, which let a deal be saved at 37% - a figure with no
 * meaning behind it that still lands, weighted, in the pipeline total. A legacy
 * value off the ladder is kept as its own option rather than snapped, because
 * quietly rewriting a number the operator typed is worse than showing an odd
 * one.
 */
function ProbabilityCell({ opportunity }: { opportunity: CrmLiteOpportunity }) {
  const { value, source } = resolveProbability(opportunity);
  if (value === null) {
    return (
      <td className="whitespace-nowrap px-3 py-2.5 text-right font-bold text-gray-800" title="No probability declared, and this stage has no default.">
        &mdash;
      </td>
    );
  }
  return (
    <td
      className="whitespace-nowrap px-3 py-2.5 text-right font-bold text-gray-800"
      title={source === 'stage'
        ? `From the ${opportunity.stage} stage. Nobody has declared a number on this deal.`
        : 'Declared on this deal.'}
    >
      {Math.round(value)}%
      {source === 'stage' && <span className="ml-1 font-semibold text-gray-400">(stage)</span>}
    </td>
  );
}

function ProbabilityField({ value, onChange }: { value: number | null; onChange: (value: number | null) => void }) {
  const rungs: number[] = [...PROBABILITY_LADDER];
  const offLadder = value !== null && !rungs.includes(value);
  const options = offLadder ? [...rungs, value].sort((left, right) => left - right) : rungs;

  return (
    <label className="block">
      <span className="text-sm font-bold text-navy">Probability %</span>
      <select
        value={value === null ? '' : String(value)}
        onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))}
        className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
      >
        <option value="">Use the stage default</option>
        {options.map((rung) => (
          <option key={rung} value={rung}>
            {rung}%{offLadder && rung === value ? ' (as recorded)' : ''}
          </option>
        ))}
      </select>
    </label>
  );
}

const CLOSE_MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * The two ways a close date can be asked about: which quarter, and which month.
 *
 * Both are derived from the date rather than stored, so they cannot disagree
 * with it and there is no second field to keep in step. A row matches the
 * filter if either reading matches, which is what lets one dropdown carry "Q3
 * 2026" and "Aug 2026" without the operator choosing a mode first.
 *
 * A deal whose close date is unreadable contributes nothing here - it is
 * findable through the Close column and the "no close date" grouping, and
 * inventing a quarter for it is how a forecast acquires deals nobody dated.
 */
function closeFilterOptionsFor(period: ClosePeriod): string[] {
  if (period.quarter === null || period.year === null) return [];
  const quarterLabel = `Q${period.quarter} ${period.year}`;
  // The month is only real when an actual date was read; a bare "Q3" says
  // nothing about which month inside it.
  if (period.basis !== 'date') return [quarterLabel];
  const parsedMonth = Number((period.raw || '').slice(5, 7));
  if (!Number.isFinite(parsedMonth) || parsedMonth < 1 || parsedMonth > 12) return [quarterLabel];
  return [quarterLabel, `${CLOSE_MONTH_LABELS[parsedMonth - 1]} ${period.year}`];
}

/** Quarters first, then months, each in calendar order. */
function buildCloseFilterOptions(rows: { closePeriod: ClosePeriod }[]): string[] {
  const quarters = new Map<string, number>();
  const months = new Map<string, number>();
  for (const row of rows) {
    const period = row.closePeriod;
    if (period.quarter === null || period.year === null) continue;
    quarters.set(`Q${period.quarter} ${period.year}`, period.year * 10 + period.quarter);
    const parsedMonth = Number((period.raw || '').slice(5, 7));
    if (period.basis === 'date' && parsedMonth >= 1 && parsedMonth <= 12) {
      months.set(`${CLOSE_MONTH_LABELS[parsedMonth - 1]} ${period.year}`, period.year * 100 + parsedMonth);
    }
  }
  const sorted = (map: Map<string, number>) => [...map.entries()].sort((a, b) => a[1] - b[1]).map(([label]) => label);
  return [...sorted(quarters), ...sorted(months)];
}

/**
 * Why this deal is on the watch-list, read from the form rather than the record.
 *
 * "Weak pipeline" is raised by three unrelated field states and names none of
 * them. The first operator filled in the decision maker, the budget owner and
 * the procurement path on a flagged deal, saved, and the warning stayed -
 * correctly, because none of those is one of the three. From the outside that
 * is a product ignoring your work.
 *
 * Reading `form` rather than the saved opportunity is the point: the banner
 * clears the moment the right field is filled, before the save, so the
 * connection between the edit and the flag is impossible to miss.
 */
/**
 * The two forecast fields, joined to the record they are a judgement about.
 *
 * The founder's question was the right one: what do "Forecast evidence" and
 * "Decision recommendation" mean, and are they connected to anything? They are
 * connected to a great deal - Revenue discounts a value whose evidence is
 * Hope-based, the watch-list is built from the recommendation, the review brief
 * groups by both, and every closed deal snapshots them so the workspace can
 * eventually say "when you called a deal Defensible, you won 62% of them". None
 * of that was visible from two bare dropdowns, so they read as vocabulary.
 *
 * Worse, the workspace already *computes* what both should be, from this deal's
 * own evidence, stakeholders and objections - the same rules the Pipeline
 * Defense brief runs. That answer existed and was never shown at the field
 * where the operator is being asked to give it. So it is shown here, with the
 * reasons behind it, and one press to accept it.
 *
 * The suggestion never writes itself. A forecast call the product made on the
 * operator's behalf is a call nobody owns, and the calibration built on it
 * would be measuring the rules rather than the seller.
 */
function ForecastCallPanel({
  opportunity,
  objections,
  stakeholders,
  activities,
  actionOutcomes,
  salesAssets,
  onApply,
}: {
  opportunity: CrmLiteOpportunity;
  objections: ObjectionRecord[];
  stakeholders: StakeholderRecord[];
  activities: SalesActivityRecord[];
  actionOutcomes: ActionOutcomeRecord[];
  salesAssets: SalesAssetRecord[];
  onApply: (patch: Partial<OpportunityFormInput>) => void;
}) {
  // Reads the merged `{ ...saved, ...form }` record, so filling Evidence and
  // watching the suggestion move is one gesture rather than a save and a reload.
  //
  // Mapped through the book-level function with a book of one, rather than the
  // per-deal mapper: `verify-surface-scale` forbids this page from reaching for
  // the single-deal mapper at all, because that is the shape a loop takes, and
  // a loop here would regenerate the workspace playbook once per row.
  const suggestion = useMemo(() => {
    const [deal] = mapOpportunitiesToPipelineDefenseDeals([opportunity], {
      objections,
      stakeholders,
      activities,
      actionOutcomes,
      salesAssets,
    });
    return deal ? analyzePipelineDefenseDeal(deal) : null;
  }, [actionOutcomes, activities, objections, opportunity, salesAssets, stakeholders]);

  if (!suggestion) return null;

  const evidenceDiffers = suggestion.forecastEvidenceCategory !== opportunity.forecastEvidenceCategory;
  const decisionDiffers = suggestion.decisionRecommendation !== opportunity.decisionRecommendation;
  // High-severity first: those are the ones that moved the suggestion.
  const reasons = [...suggestion.riskFlags]
    .sort((left, right) => severityRank(right.severity) - severityRank(left.severity))
    .slice(0, 3);

  const consequences = [
    opportunity.forecastEvidenceCategory === 'Hope-based' || opportunity.forecastEvidenceCategory === 'Unsupported'
      ? 'Revenue treats this value as unbacked and counts it as at risk.'
      : 'Revenue counts this value as backed by something the customer confirmed.',
    ['Rescue', 'Downgrade', 'Deprioritize'].includes(opportunity.decisionRecommendation)
      ? `"${opportunity.decisionRecommendation}" keeps this deal on the watch-list until the call changes.`
      : `"${opportunity.decisionRecommendation}" keeps this deal off the watch-list.`,
    `When this deal closes, "${opportunity.forecastEvidenceCategory}" is stored with the outcome — that is what Review's win rate per category is built from.`,
  ];

  return (
    <section className="rounded-xl border border-blue-100 bg-blue-50/40 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wide text-brand-blue">What the record supports</p>
        <p className="text-[11px] text-gray-500">Read from this deal — evidence, stakeholders, objections, next action</p>
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <SuggestedCall
          label="Forecast evidence"
          value={suggestion.forecastEvidenceCategory}
          differs={evidenceDiffers}
          onApply={() => onApply({ forecastEvidenceCategory: suggestion.forecastEvidenceCategory })}
        />
        <SuggestedCall
          label="Decision"
          value={suggestion.decisionRecommendation}
          differs={decisionDiffers}
          onApply={() => onApply({ decisionRecommendation: suggestion.decisionRecommendation })}
        />
      </div>

      {reasons.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {reasons.map((flag) => (
            <li key={flag.id} className="text-[11px] leading-5 text-gray-600">• {flag.reason}</li>
          ))}
        </ul>
      )}

      <p className="mt-2 text-[11px] font-bold uppercase tracking-wide text-gray-500">What your call changes</p>
      <ul className="mt-1 space-y-0.5">
        {consequences.map((line) => (
          <li key={line} className="text-[11px] leading-5 text-gray-600">• {line}</li>
        ))}
      </ul>
    </section>
  );
}

function severityRank(severity: 'low' | 'medium' | 'high') {
  return severity === 'high' ? 2 : severity === 'medium' ? 1 : 0;
}

function SuggestedCall({ label, value, differs, onApply }: {
  label: string;
  value: string;
  differs: boolean;
  onApply: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-1.5 ring-1 ring-blue-100">
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">{label}</p>
        <p className="truncate text-xs font-bold text-navy">{value}</p>
      </div>
      {differs ? (
        <button
          type="button"
          onClick={onApply}
          className="shrink-0 rounded-full border border-brand-blue/30 px-2.5 py-1 text-[11px] font-bold text-brand-blue hover:bg-blue-50"
        >
          Use this
        </button>
      ) : (
        <span className="shrink-0 text-[11px] font-semibold text-emerald-700">Matches yours</span>
      )}
    </div>
  );
}

function WhyThisDealIsFlagged({ form }: { form: OpportunityFormInput }) {
  const explanation = explainPipelineRisk(form);

  if (!explanation) {
    return (
      <div className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2.5">
        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
        <p className="text-xs font-semibold leading-5 text-emerald-900">
          Nothing here puts this deal on the watch-list. Save to clear it everywhere.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2.5">
      <p className="text-xs font-bold uppercase tracking-wide text-amber-800">Why this deal is flagged</p>
      <p className="mt-1 text-xs font-semibold leading-5 text-amber-900">{explanation.reason}</p>
      <p className="mt-1 text-xs leading-5 text-amber-800">{explanation.clearedBy}</p>
    </div>
  );
}

/**
 * The route this customer can buy through, and where this deal stands on it.
 *
 * It replaces an empty textarea that was almost always left blank. Asked as
 * prose, "how do they buy" is a paragraph nobody writes; asked as a route, it
 * is one click and the app can then say what has to exist before a PO can
 * appear - which is the difference between a field that records the answer and
 * a field that changes what the seller does next.
 *
 * Until 2026-08-05 it then printed the same three sentences at every deal on
 * the route, whether or not the seller had already done them. That is a poster.
 * The route's demands are now checked against the fields this deal already
 * carries - the budget owner, the decision maker, the technical criteria, the
 * close date - so the panel states a position (two of four, this one next) and
 * offers the open one as the next action in one click. Requirements only the
 * customer can answer never show a tick; they show the question to ask.
 *
 * A value written before this was a picker is kept as its own option rather
 * than discarded, so no existing note is lost.
 */
function ProcurementPathField({
  value,
  expectedCloseDate,
  deal,
  onChange,
  onUseAsNextAction,
}: {
  value: string;
  expectedCloseDate: string;
  deal: { decisionMaker: string; budgetOwner: string; technicalCriteria: string };
  onChange: (value: string) => void;
  onUseAsNextAction: (action: string) => void;
}) {
  const trimmed = value.trim();
  const legacy = trimmed && !isProcurementRoute(trimmed) ? trimmed : '';
  const readiness = buildProcurementReadiness(trimmed, { ...deal, expectedCloseDate });
  const missingDate = routeNeedsADate(trimmed, expectedCloseDate);

  return (
    <div>
      <label className="block">
        <span className="text-sm font-bold text-navy">Procurement path</span>
        <select
          value={legacy || trimmed || 'Not known yet'}
          onChange={(event) => onChange(event.target.value)}
          className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
        >
          {procurementRoutes.map((route) => (
            <option key={route} value={route}>{route}</option>
          ))}
          {legacy && <option value={legacy}>{legacy} (as recorded)</option>}
        </select>
      </label>

      {readiness && (
        <div className="mt-2 overflow-hidden rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-100 bg-gray-50 px-3 py-2.5">
            <p className="text-xs font-semibold leading-5 text-gray-700">{readiness.guide.meaning}</p>
            <p className="mt-1 text-[11px] font-semibold text-gray-500">{readiness.guide.typicalDuration}</p>
          </div>

          <div className="px-3 py-2.5">
            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">
              Before a PO can exist ({readiness.metCount}/{readiness.items.length})
            </p>
            <ul className="mt-2 space-y-1.5">
              {readiness.items.map((item) => (
                <li key={item.label} className="flex items-start gap-2">
                  <span
                    className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                      item.met ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-400'
                    }`}
                    aria-hidden
                  >
                    {item.met ? <Check className="h-2.5 w-2.5" /> : <span className="h-1 w-1 rounded-full bg-current" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-xs leading-5 ${item.met ? 'text-gray-500' : 'font-semibold text-gray-800'}`}>
                      {item.label}
                    </span>
                    {/* What the record actually says, so a tick is checkable
                        rather than something the panel asserts. */}
                    {item.met && (
                      <span className="block truncate text-[11px] leading-5 text-emerald-700" title={item.evidence}>
                        {item.evidence}
                      </span>
                    )}
                    {!item.met && (
                      <button
                        type="button"
                        onClick={() => onUseAsNextAction(item.action)}
                        className="mt-0.5 inline-flex min-h-[24px] items-center text-[11px] font-bold text-brand-blue hover:underline"
                      >
                        Use as next action: {item.action}
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="border-t border-gray-100 bg-blue-50/50 px-3 py-2.5">
            <p className="text-[11px] font-bold uppercase tracking-wide text-brand-blue">Ask this week</p>
            <p className="mt-0.5 text-xs leading-5 text-gray-700">&ldquo;{readiness.guide.askThisWeek}&rdquo;</p>
          </div>

          <p className="border-t border-gray-100 px-3 py-2 text-[11px] leading-5 text-amber-800">
            {readiness.guide.risk}
          </p>
        </div>
      )}

      {missingDate && (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-900">
          This route runs to a date you do not control, and no expected close date is set. Put the closing date in
          Expected close date so the week can carry it.
        </p>
      )}
    </div>
  );
}

function SelectField<Value extends string>({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label: string;
  value: Value;
  options: readonly Value[];
  onChange: (value: Value) => void;
  /** One plain line saying what the field is asking, when the label cannot. */
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-navy">{label}</span>
      {hint && <span className="mt-0.5 block text-xs font-normal leading-5 text-gray-500">{hint}</span>}
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

/**
 * The declared probability, held against the stage it sits in.
 *
 * Not a prediction and not a block - a seller may know something the stage
 * table does not. It just refuses to let "80%, still in Discovery" pass without
 * anyone noticing, which is the exact record that makes a forecast miss.
 */
function ProbabilityNotice({ form }: { form: OpportunityFormInput }) {
  const stale = isClosedProbabilityStale(form);
  const optimistic = isProbabilityOptimistic(form);
  if (!stale && !optimistic) {
    const stageDefault = defaultProbabilityForStage(form.stage);
    if (form.pipelineProbability === null || form.pipelineProbability === undefined) {
      return (
        <p className="mt-1.5 text-xs text-gray-500">
          {stageDefault === null
            ? 'On hold has no default - set the number yourself.'
            : `${form.stage} normally runs at ${stageDefault}%.`}
        </p>
      );
    }
    return null;
  }

  return (
    <p className={`mt-1.5 text-xs font-semibold ${stale ? 'text-red-700' : 'text-amber-700'}`}>
      {probabilityGapText(form)}
    </p>
  );
}

function AccountNameNotice({
  check,
  settled,
  onUse,
}: {
  check: AccountNameCheck;
  /** True once the seller has left the field, so a guess is worth voicing. */
  settled: boolean;
  onUse: (name: string) => void;
}) {
  if (check.kind === 'quiet') return null;
  // Both of these are guesses about a half-typed name. The two confirmations
  // below - already yours, and merged away - are facts, so they stay live.
  if ((check.kind === 'near' || check.kind === 'new') && !settled) return null;

  if (check.kind === 'known') {
    return (
      <p className="mt-1.5 text-xs font-semibold text-emerald-700">
        Linked to {check.name}, a customer you already have.
      </p>
    );
  }

  if (check.kind === 'new') {
    // Deliberately quiet. Adding a genuinely new customer is normal, and an
    // amber box every time would train the seller to ignore the amber box that
    // matters.
    return (
      <p className="mt-1.5 text-xs text-gray-500">
        New customer - no existing account matches this name.
      </p>
    );
  }

  const isRenamed = check.kind === 'renamed';
  return (
    <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
      <p className="text-xs font-semibold leading-5 text-amber-900">
        {isRenamed
          ? `You merged this name into ${check.name}. Saving it as typed would split them again.`
          : `Did you mean ${check.name}? ${check.reason} Saving this as typed creates a second customer.`}
      </p>
      <button
        type="button"
        onClick={() => onUse(check.name)}
        className="rounded-full bg-navy px-2.5 py-1 text-[11px] font-bold text-white hover:bg-navy/90"
      >
        Use {check.name}
      </button>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  required = false,
  suggestions,
  min,
  step,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  /** Existing values in the workspace, so a repeated name is picked not retyped. */
  suggestions?: string[];
  /** Number fields only. A deal is not worth minus four hundred thousand. */
  min?: number;
  step?: number;
}) {
  const listId = suggestions && suggestions.length > 0 ? `field-${label.replace(/\W+/g, '-').toLowerCase()}` : undefined;
  return (
    <label className="block">
      <span className="text-sm font-bold text-navy">{label}{required ? ' *' : ''}</span>
      {/* The asterisk in the label was the only thing saying "required": the
          input carried no `required` attribute, so nothing enforced it and no
          screen reader announced it. An asterisk is a convention, not a
          contract. */}
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        list={listId}
        required={required}
        aria-required={required || undefined}
        min={min}
        step={step}
        className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
      />
      {listId && (
        <datalist id={listId}>
          {suggestions!.map((option) => <option key={option} value={option} />)}
        </datalist>
      )}
    </label>
  );
}

/**
 * The stage ladder, drawn as the route it is.
 *
 * The eight stages a deal walks through, in order, plus the three states it can
 * end in. A dropdown lists eleven words and says nothing about distance: it
 * cannot show that Proposal is two steps short of Procurement, or that a deal
 * has been sitting at Discovery since June. A bar shows both at a glance, and
 * doubles as the fastest way to move a deal - one tap on the step ahead.
 *
 * The three terminal states get their own colour rather than a position,
 * because they are not further along the route; they are how it ended.
 */
const stageLadder: OpportunityStage[] = opportunityStages.filter(
  (stage) => stage !== 'Won' && stage !== 'Lost' && stage !== 'On hold',
);

function StageProgress({ stage, status, onPick }: {
  stage: OpportunityStage;
  status: OpportunityStatus;
  onPick: (stage: OpportunityStage) => void;
}) {
  const ladderIndex = stageLadder.indexOf(stage);
  const closedTone = stage === 'Won' || status === 'Won'
    ? { fill: 'bg-emerald-500', caption: 'Won — the whole route was walked', text: 'text-emerald-700' }
    : stage === 'Lost' || status === 'Lost'
      ? { fill: 'bg-red-300', caption: 'Lost — closed out', text: 'text-red-700' }
      : stage === 'On hold' || status === 'On hold'
        ? { fill: 'bg-amber-300', caption: 'On hold — paused, not closed', text: 'text-amber-700' }
        : null;

  const stageDefault = defaultProbabilityForStage(stage);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Where this deal stands</p>
        <p className={`text-[11px] font-semibold ${closedTone ? closedTone.text : 'text-gray-500'}`}>
          {closedTone
            ? closedTone.caption
            : `Step ${ladderIndex + 1} of ${stageLadder.length} · ${stage}${stageDefault === null ? '' : ` · normally ${stageDefault}%`}`}
        </p>
      </div>

      <div className="mt-2 flex gap-1">
        {stageLadder.map((step, index) => {
          const reached = closedTone ? true : index <= ladderIndex;
          const current = !closedTone && index === ladderIndex;
          return (
            <button
              key={step}
              type="button"
              title={`Move to ${step}`}
              aria-label={`Move this deal to ${step}`}
              aria-current={current ? 'step' : undefined}
              onClick={() => onPick(step)}
              className="group min-w-0 flex-1"
            >
              <span
                className={`block h-2 rounded-full transition ${
                  reached ? (closedTone ? closedTone.fill : 'bg-brand-blue') : 'bg-gray-200 group-hover:bg-blue-200'
                } ${current ? 'ring-2 ring-brand-blue/30' : ''}`}
              />
              {/* The names are long and the columns are narrow, so only the
                  step you are on is spelled out under the bar; the rest are
                  reachable by hover, title and the select beside it. */}
              <span
                className={`mt-1 block truncate text-[9px] leading-3 ${
                  current ? 'font-bold text-navy' : 'text-transparent group-hover:text-gray-500'
                }`}
              >
                {step}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * A question answered by tapping, with a line to type when tapping is not
 * enough.
 *
 * Multi-select on purpose. The single-choice version of this asks "what was
 * the reason", and deals do not have one - the honest answer is usually two,
 * and a form that only takes one gets whichever came to mind first.
 *
 * The typed line is always present rather than hidden behind an "Other" option,
 * because an operator who wants to add a sentence should not first have to find
 * permission to.
 */
function QuickPickField({
  label,
  hint,
  options,
  picks,
  note,
  notePlaceholder,
  noteRef,
  onPicksChange,
  onNoteChange,
}: {
  label: string;
  hint?: string;
  options: string[];
  picks: string[];
  note: string;
  notePlaceholder?: string;
  noteRef?: RefObject<HTMLTextAreaElement | null>;
  onPicksChange: (picks: string[]) => void;
  onNoteChange: (note: string) => void;
}) {
  const toggle = (option: string) => {
    onPicksChange(picks.includes(option) ? picks.filter((item) => item !== option) : [...picks, option]);
  };

  return (
    <div className="block">
      <span className="text-sm font-bold text-navy">{label}</span>
      {hint && <span className="mt-0.5 block text-xs font-normal leading-5 text-gray-500">{hint}</span>}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {options.map((option) => {
          const picked = picks.includes(option);
          return (
            <button
              key={option}
              type="button"
              aria-pressed={picked}
              onClick={() => toggle(option)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                picked
                  ? 'bg-navy text-white'
                  : 'border border-gray-300 bg-white text-gray-700 hover:border-brand-blue hover:text-brand-blue'
              }`}
            >
              {option}
            </button>
          );
        })}
      </div>
      <textarea
        ref={noteRef}
        value={note}
        onChange={(event) => onNoteChange(event.target.value)}
        rows={2}
        placeholder={notePlaceholder}
        className="mt-2 w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm leading-6 outline-none placeholder:text-gray-400 focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
      />
    </div>
  );
}

/**
 * One answer, chosen from what the deal already knows or typed if it does not.
 *
 * The dropdown holds the names and objections already on this record; picking
 * "Someone else" turns it into a text field. A retro is the worst moment to ask
 * an operator to spell a stakeholder they filed six weeks ago.
 */
function PickOrTypeField({ label, options, value, onChange }: {
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  const OTHER = '__other__';
  const known = options.includes(value);
  const [typing, setTyping] = useState(false);
  const showText = typing || (value.trim().length > 0 && !known);

  return (
    <label className="block">
      <span className="text-sm font-bold text-navy">{label}</span>
      {options.length > 0 && (
        <select
          value={showText ? OTHER : value}
          onChange={(event) => {
            if (event.target.value === OTHER) { setTyping(true); onChange(''); return; }
            setTyping(false);
            onChange(event.target.value);
          }}
          className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
        >
          <option value="">Not recorded</option>
          {options.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
          <option value={OTHER}>Someone or something else…</option>
        </select>
      )}
      {(showText || options.length === 0) && (
        <input
          type="text"
          value={value}
          autoFocus={typing}
          onChange={(event) => onChange(event.target.value)}
          className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
        />
      )}
    </label>
  );
}

function TextArea({ label, value, onChange, hint, inputRef }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** One plain line saying what belongs in the box, when the label cannot. */
  hint?: string;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-navy">{label}</span>
      {hint && <span className="mt-0.5 block text-xs font-normal leading-5 text-gray-500">{hint}</span>}
      <textarea
        ref={inputRef}
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

function buildDefaultRefreshSelection(preview: PipelineRefreshPreview) {
  return preview.changedItems.reduce<Record<string, OpportunityRefreshField[]>>((acc, item) => {
    acc[item.id] = item.changes
      .filter((change) => change.defaultSelected)
      .map((change) => change.field);
    return acc;
  }, {});
}

function refreshStatusLabel(status: OpportunityRefreshPreviewItem['status']) {
  const labels: Record<OpportunityRefreshPreviewItem['status'], string> = {
    new: 'New opportunity',
    'existing-unchanged': 'Unchanged',
    'existing-changed': 'Changed',
    'possible-duplicate': 'Warning',
    invalid: 'Invalid',
  };
  return labels[status];
}

function formatBatchDate(value: string) {
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function buildOpportunityMasterRow(
  opportunity: CrmLiteOpportunity,
  activities: SalesActivityRecord[],
  quotes: QuoteRecord[],
): OpportunityMasterRow {
  const linkedActivities = getLinkedActivities(opportunity, activities);
  const quality = analyzeOpportunityQuality(opportunity, linkedActivities);
  const latestActivity = linkedActivities[0];
  const activityTimestamp = latestActivity
    ? new Date(latestActivity.createdAt || `${latestActivity.activityDate}T00:00:00`).getTime()
    : 0;
  const opportunityTimestamp = new Date(opportunity.updatedAt).getTime();
  const lastUpdatedAt = activityTimestamp > opportunityTimestamp
    ? latestActivity.createdAt || latestActivity.activityDate
    : opportunity.updatedAt;

  return {
    opportunity,
    quality,
    commercial: buildOpportunityCommercialSummary(opportunity, quotes),
    linkedActivityCount: linkedActivities.length,
    lastActivityDate: latestActivity?.activityDate || '',
    lastUpdatedAt,
    silence: classifyOpportunitySilence(opportunity, activities),
    // Resolved once per row rather than inside the comparator, which would
    // re-parse the same free text on every comparison of every sort.
    closePeriod: resolveClosePeriod(opportunity.expectedClosePeriod),
  };
}

function buildOpportunityCommercialSummary(
  opportunity: CrmLiteOpportunity,
  quotes: QuoteRecord[],
): OpportunityCommercialSummary {
  const opportunityQuotes = getQuotesForOpportunity(quotes, opportunity);
  const actionQuotes = [...opportunityQuotes]
    .filter((quote) => ['Sent', 'Revised', 'Accepted'].includes(quote.status))
    .sort((left, right) => quoteActionRank(right) - quoteActionRank(left) || compareSafeBusinessDate(left.validUntil, right.validUntil));
  const topQuote = actionQuotes[0] || opportunityQuotes[0] || null;
  const topRisk = topQuote ? getQuoteRisk(topQuote) : null;
  const activeQuotes = opportunityQuotes.filter((quote) => quote.status === 'Sent' || quote.status === 'Revised').length;
  const acceptedQuotes = opportunityQuotes.filter((quote) => quote.status === 'Accepted').length;
  const atRiskQuotes = opportunityQuotes.filter((quote) => getQuoteRisk(quote) !== 'None').length;

  return {
    quotes: opportunityQuotes,
    activeQuotes,
    acceptedQuotes,
    atRiskQuotes,
    quotedValue: sumMoneyInBase(opportunityQuotes),
    topQuote,
    topRisk,
    label: acceptedQuotes > 0
      ? 'Pending PO'
      : activeQuotes > 0
        ? 'Quoted'
        : 'No quote',
  };
}

function getQuotesForOpportunity(quotes: QuoteRecord[], opportunity: CrmLiteOpportunity) {
  const opportunityName = normalizeText(opportunity.opportunityName);
  const accountName = normalizeText(opportunity.accountName);
  return quotes.filter((quote) => (
    quote.opportunityId === opportunity.id ||
    (
      accountName &&
      normalizeText(quote.accountName) === accountName &&
      normalizeText(quote.opportunityName) === opportunityName
    )
  ));
}

function buildQuoteLink(opportunity: CrmLiteOpportunity, create = false) {
  const params = new URLSearchParams();
  if (opportunity.accountName) params.set('accountName', opportunity.accountName);
  if (opportunity.id) params.set('opportunityId', opportunity.id);
  if (opportunity.opportunityName) params.set('opportunityName', opportunity.opportunityName);
  if (create) params.set('create', '1');
  return `/app/quotes?${params.toString()}`;
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

/**
 * The canonical fold - see accountIdentity.ts.
 *
 * This file already used `normalizeEntityName` for the account typeahead and
 * this helper for matching a quote back to its deal, so one screen decided that
 * two spellings were the same customer in one place and not the other.
 */
function normalizeText(value?: string) {
  return normalizeEntityName(value || '');
}

function buildImportedPipelineSummary(opportunities: CrmLiteOpportunity[]): ImportedPipelineSummary {
  const imported = opportunities.filter(isFounderImportedOpportunity);
  return {
    importedCount: imported.length,
    totalCount: opportunities.length,
    fy26Total: sumOpportunityValue(imported, 'fy26Value'),
    fy27Total: sumOpportunityValue(imported, 'fy27Value'),
    stageInferredCount: imported.filter((opportunity) => opportunity.isStageInferred).length,
    withBrandCount: imported.filter((opportunity) => Boolean(opportunity.brand?.trim())).length,
    withChannelCount: imported.filter((opportunity) => Boolean(opportunity.channel?.trim())).length,
    withProbabilityCount: imported.filter((opportunity) => typeof opportunity.pipelineProbability === 'number').length,
    needsActionCount: imported.filter((opportunity) => !opportunity.nextAction.trim()).length,
    topBrands: summarizeForecastDimension(imported, 'brand'),
    topChannels: summarizeForecastDimension(imported, 'channel'),
  };
}

function summarizeForecastDimension(
  opportunities: CrmLiteOpportunity[],
  field: 'brand' | 'channel',
): ForecastDimensionSummary[] {
  const byLabel = new Map<string, ForecastDimensionSummary>();
  opportunities.forEach((opportunity) => {
    const label = opportunity[field]?.trim();
    if (!label) return;
    const current = byLabel.get(label) || { label, count: 0, fy26Total: 0 };
    current.count += 1;
    current.fy26Total += sumMoneyInBase([{
      amount: opportunity.fy26Value || opportunity.estimatedValue || 0,
      currency: opportunity.currency,
    }]);
    byLabel.set(label, current);
  });

  return Array.from(byLabel.values())
    .sort((left, right) => right.fy26Total - left.fy26Total || right.count - left.count || left.label.localeCompare(right.label))
    .slice(0, 5);
}

function sumOpportunityValue(opportunities: CrmLiteOpportunity[], field: 'fy26Value' | 'fy27Value') {
  return sumMoneyInBase(opportunities.map((opportunity) => ({
    amount: opportunity[field],
    currency: opportunity.currency,
  })));
}

function isFounderImportedOpportunity(opportunity: CrmLiteOpportunity) {
  return opportunity.sourceSystem === founderCoreSourceSystem;
}

function matchesOpportunityQuickFilter(row: OpportunityMasterRow, filter: OpportunityQuickFilter) {
  const { opportunity } = row;
  switch (filter) {
    case 'imported':
      return isFounderImportedOpportunity(opportunity);
    case 'stageInferred':
      return Boolean(opportunity.isStageInferred);
    case 'fy26':
      return Boolean(opportunity.fy26Value && opportunity.fy26Value > 0);
    case 'fy27':
      return Boolean(opportunity.fy27Value && opportunity.fy27Value > 0);
    case 'needsAction':
      return !opportunity.nextAction.trim();
    case 'goingSilent':
      return row.silence.status === 'silent' || row.silence.status === 'at-risk';
    case 'all':
      return true;
  }
}

/**
 * Which band a deal belongs to. Live pipeline first, parked second, finished
 * last.
 *
 * This is applied ahead of whatever column the operator sorted by, and that is
 * deliberate. The table used to default to "last update, newest first", which
 * meant a deal won in May and a deal lost last week sat in the middle of the
 * working pipeline purely because somebody had touched their records. Making the
 * band a *default* rather than an invariant would not have fixed it: one click
 * on "Value" and the biggest number in the workspace - usually a closed deal -
 * jumps back to row one.
 *
 * The Status filter is still there for anyone who wants to look at Won or Lost
 * on purpose. This only decides what a mixed list opens on.
 */
function opportunityBand(row: OpportunityMasterRow) {
  const { status } = row.opportunity;
  if (status === 'Won' || status === 'Lost') return 2;
  if (status === 'On hold') return 1;
  return 0;
}

function compareOpportunityRows(
  left: OpportunityMasterRow,
  right: OpportunityMasterRow,
  sortKey: OpportunitySortKey,
  direction: SortDirection,
) {
  const band = opportunityBand(left) - opportunityBand(right);
  if (band !== 0) return band;

  const directionFactor = direction === 'asc' ? 1 : -1;
  const leftValue = getOpportunitySortValue(left, sortKey);
  const rightValue = getOpportunitySortValue(right, sortKey);

  const primary = typeof leftValue === 'number' && typeof rightValue === 'number'
    ? (leftValue - rightValue) * directionFactor
    : String(leftValue).localeCompare(String(rightValue), undefined, { numeric: true }) * directionFactor;
  if (primary !== 0) return primary;

  // Same quarter, same stage, same whatever: the bigger deal is the one worth
  // looking at first. Without a tiebreak the order inside a group is whatever
  // the store happened to return, which changes between reloads. Compared in
  // the reporting currency, or "bigger" would mean the longer number.
  return (convertMoney(right.opportunity.estimatedValue, right.opportunity.currency) || 0)
    - (convertMoney(left.opportunity.estimatedValue, left.opportunity.currency) || 0);
}

function getOpportunitySortValue(row: OpportunityMasterRow, sortKey: OpportunitySortKey) {
  const { opportunity } = row;
  switch (sortKey) {
    case 'account':
      return opportunity.accountName;
    case 'opportunity':
      return opportunity.opportunityName;
    case 'stage':
      return opportunityStages.indexOf(opportunity.stage);
    // Converted before they are compared. Sorting the raw amounts ranks by the
    // size of the number rather than the size of the deal, so 4,000,000 JPY
    // outranks 120,000 USD - about seven times its worth.
    case 'value':
      return convertMoney(opportunity.estimatedValue, opportunity.currency) || 0;
    case 'fy26':
      return convertMoney(opportunity.fy26Value, opportunity.currency) || 0;
    case 'fy27':
      return convertMoney(opportunity.fy27Value, opportunity.currency) || 0;
    case 'probability':
      return opportunity.pipelineProbability || 0;
    case 'closePeriod':
      // The resolved quarter, not the raw text. Sorting the strings put "Next
      // quarter" ahead of "This month" because N comes before T.
      return row.closePeriod.rank;
    case 'forecast':
      return forecastEvidenceCategories.indexOf(opportunity.forecastEvidenceCategory);
    case 'recommendation':
      return decisionRecommendations.indexOf(opportunity.decisionRecommendation);
    case 'nextActionDate':
      return sanitizeBusinessDate(opportunity.nextActionDate) || '9999-12-31';
    case 'quality':
      return { Healthy: 0, 'Needs cleanup': 1, 'High risk': 2 }[row.quality.status];
    case 'updatedAt':
      return new Date(row.lastUpdatedAt).getTime() || 0;
  }
}

function formatOpportunityDate(value: string) {
  if (!value) return 'Not set';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return formatSafeBusinessDate(value);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function isPastDate(value: string) {
  return isBusinessDateOverdue(value);
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
    // Opening a deal in the editor must not quietly drop the line it sells.
    brand: opportunity.brand || '',
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
    salesOwner: getWorkspaceUserDisplayName(user) || 'Sales owner',
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
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * The touches on a deal.
 *
 * An explicit link is the answer whenever there is one. The name match behind
 * it is for captures taken before saving started linking them: the silence
 * rule has always matched on the account alone, so one row could read "No
 * touch yet" and "1 gap - 0 touches" beside a badge saying "Quiet 18d", where
 * the 18 days were counted from a touch this function refused to see. Stricter
 * than the silence rule on purpose - both the account and the deal have to
 * match, because "we spoke to this customer" and "we moved this deal" are
 * different claims and only the second one belongs in a touch count.
 */
function getLinkedActivities(opportunity: CrmLiteOpportunity, activities: SalesActivityRecord[]) {
  const accountKey = normalizeEntityName(opportunity.accountName || '');
  const opportunityKey = normalizeEntityName(opportunity.opportunityName || '');
  return activities
    .filter((activity) => {
      if (activity.linkStatus === 'Linked') return activity.linkedOpportunityId === opportunity.id;
      if (activity.linkStatus === 'Ignored') return false;
      if (!accountKey || !opportunityKey) return false;
      return normalizeEntityName(activity.accountName || '') === accountKey
        && normalizeEntityName(activity.opportunityName || '') === opportunityKey;
    })
    .sort((a, b) => compareSafeBusinessDate(b.activityDate, a.activityDate) || b.createdAt.localeCompare(a.createdAt));
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

function meddicCategoryTone(category: MeddicLiteDealCategory) {
  if (category === 'Defensible') return 'green';
  if (category === 'Weak but recoverable') return 'amber';
  return 'red';
}

function meddicStatusTone(status: MeddicLiteStatus) {
  if (status === 'Strong') return 'green';
  if (status === 'Partial') return 'amber';
  return 'red';
}

function actionPriorityTone(priority: OpportunityActionPriority) {
  if (priority === 'High') return 'red';
  if (priority === 'Medium') return 'amber';
  return 'green';
}

function outcomeTone(outcomeType?: ActionOutcomeType) {
  if (outcomeType === 'Improved' || outcomeType === 'Resolved') return 'green';
  if (outcomeType === 'Worsened' || outcomeType === 'Downgrade recommended') return 'red';
  if (outcomeType === 'Still unclear') return 'amber';
  return 'gray';
}

function todayKey() {
  return todayDateKey();
}
