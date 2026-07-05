import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowUpDown,
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
} from '../../services/opportunityStore';
import { analyzePipelineQuality, analyzeOpportunityQuality } from '../../utils/opportunityQuality';
import { classifyOpportunitySilence, type OpportunitySilenceState } from '../../utils/proactiveNudges';
import { useEscapeToClose } from '../../hooks/useEscapeToClose';
import { FollowUpComposerPanel } from '../v31/FollowUpComposerPanel';
import { buildReviveFollowUpContext } from '../../utils/followUpFromOpportunity';
import type { FollowUpContext } from '../../types/v31';
import { analyzeMeddicLiteOpportunity, type MeddicLiteDealCategory, type MeddicLiteStatus } from '../../utils/meddicLite';
import {
  formatBaseCurrencyAmount as formatBaseMoney,
  formatCompactBaseAmount,
  formatCurrencyAmount as formatMoney,
  getReportingCurrency,
  sumMoneyInBase,
} from '../../utils/money';
import { buildRevenueHorizon, buildStageFunnel } from '../../utils/pipelineInsights';
import { FunnelBars } from '../../components/charts/FunnelBars';
import { MiniBarChart } from '../../components/charts/MiniBarChart';
import { SkeletonScreen, SkeletonTable } from '../../components/common/Skeleton';
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
  mapOpportunityToPipelineDefenseDeal,
} from '../../utils/opportunityToPipelineBrief';
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
  const [loading, setLoading] = useState(() => !getCachedSalesWorkspaceData(hasLocalSampleData() ? undefined : user?.id));
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState(allFilter);
  const [forecastFilter, setForecastFilter] = useState(allFilter);
  const [recommendationFilter, setRecommendationFilter] = useState(allFilter);
  const [statusFilter, setStatusFilter] = useState(allFilter);
  const [quickFilter, setQuickFilter] = useState<OpportunityQuickFilter>('all');
  const [sortKey, setSortKey] = useState<OpportunitySortKey>('updatedAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
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
    if (syncIssue) return 'sync-issue';
    return dataUserId ? 'cloud-browser' : 'browser-only';
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
  };

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
        (!query || searchable.includes(query)) &&
        matchesOpportunityQuickFilter(row, quickFilter) &&
        (stageFilter === allFilter || opportunity.stage === stageFilter) &&
        (forecastFilter === allFilter || opportunity.forecastEvidenceCategory === forecastFilter) &&
        (recommendationFilter === allFilter || opportunity.decisionRecommendation === recommendationFilter) &&
        (statusFilter === allFilter || opportunity.status === statusFilter)
      );
    }).sort((left, right) => compareOpportunityRows(left, right, sortKey, sortDirection));
  }, [forecastFilter, opportunityRows, quickFilter, recommendationFilter, search, sortDirection, sortKey, stageFilter, statusFilter]);

  const visibleOpportunities = useMemo(
    () => visibleOpportunityRows.map((row) => row.opportunity),
    [visibleOpportunityRows],
  );
  const pageCount = Math.max(1, Math.ceil(visibleOpportunityRows.length / pageSize));
  const pagedRows = useMemo(
    () => visibleOpportunityRows.slice((page - 1) * pageSize, page * pageSize),
    [page, pageSize, visibleOpportunityRows],
  );

  useEffect(() => {
    setPage(1);
  }, [forecastFilter, pageSize, quickFilter, recommendationFilter, search, stageFilter, statusFilter]);

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

  const openAddPanel = () => {
    setEditingOpportunity(null);
    setForm({ ...emptyOpportunityInput, currency: getReportingCurrency() });
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

  const refreshCsvMappingReview = (text: string, profiles = csvMappingProfiles) => {
    const headers = getCsvHeaders(text);
    setCsvDetectedHeaders(headers);

    if (headers.length === 0) {
      setCsvMappingReview([]);
      setCsvSelectedMappingProfileId('');
      setCsvMappingProfileName('');
      setCsvMappingSourceType('Custom');
      setCsvMappingMessage('');
      return;
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
      openAddPanel();
      setSearchParams({}, { replace: true });
      return;
    }

    const requestedFilter = searchParams.get('filter');
    if (requestedFilter && ['all', 'imported', 'stageInferred', 'fy26', 'fy27', 'needsAction', 'goingSilent'].includes(requestedFilter)) {
      setQuickFilter(requestedFilter as OpportunityQuickFilter);
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
      setSearchParams({}, { replace: true });
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
    if (csvDetectedHeaders.length === 0) {
      refreshCsvMappingReview(csvInput, csvMappingProfiles);
    }
    const fieldMap = buildFieldMapFromReview(csvMappingReview);
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
      trackProductEvent('pipeline_defense_brief_created', getAnalyticsDataMode());
      window.setTimeout(() => navigate('/app/pipeline-defense'), 150);
    } catch (error) {
      const localBrief = createPipelineDefenseBrief(draftBrief);
      persistCreatedBriefLocally(localBrief);
      setSelectedOpportunityIds([]);
      setBriefCreateState('error');
      markFirstPipelineReviewStepComplete('hasGeneratedPipelineDefense');
      markTrialActivationChecklistItemComplete('generate-defense-brief');
      markPipelineReviewHabitStepComplete('generatedBriefAt');
      trackProductEvent('pipeline_defense_brief_created', getAnalyticsDataMode(true));
      if (import.meta.env.DEV) {
        console.debug('[Opportunities] defense brief cloud create failed', { message: error instanceof Error ? error.message : 'Unknown error' });
      }
      setBriefCreateMessage('Cloud sync issue - your local copy is preserved.');
      window.setTimeout(() => navigate('/app/pipeline-defense'), 700);
    }
  };

  return (
    <div className="flex w-full max-w-none flex-col gap-5 px-4 py-5 sm:px-5 lg:px-6">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Opportunity Master</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-navy">Opportunities</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
            Review pipeline movement, forecast evidence, close timing, next actions, and deal risk in one working table.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => refreshOpportunities({ force: true })}
            disabled={workspaceSyncing}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
            title="Reload opportunities from cloud"
          >
            <RefreshCw className={`h-4 w-4 ${workspaceSyncing ? 'animate-spin' : ''}`} />
            Cloud sync
          </button>
          <DataModePill
            compact
            isLoading={authLoading}
            isAuthenticated={isAuthenticated}
            isSupabaseConfigured={isSupabaseConfigured}
            cloudAvailable={canUseOpportunityCloudStore(dataUserId)}
            hasSampleData={sampleDataActive}
          />
        </div>
      </header>

      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={openAddPanel}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-navy px-4 py-2 text-sm font-bold text-white"
            >
              <Plus className="h-4 w-4" />
              Add Opportunity
            </button>
            <button
              type="button"
              onClick={openCsvImport}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-brand-blue bg-blue-50 px-4 py-2 text-sm font-bold text-brand-blue hover:bg-blue-100"
            >
              <Upload className="h-4 w-4" />
              Import / Refresh
            </button>
            <button
              type="button"
              onClick={() => openDefenseBriefPreview()}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-blue px-4 py-2 text-sm font-bold text-white"
            >
              <FileText className="h-4 w-4" />
              Generate Defense Brief{selectedOpportunities.length > 0 ? ` (${selectedOpportunities.length})` : ''}
            </button>
          </div>

          <div className="grid flex-1 grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-[minmax(260px,1.4fr)_repeat(4,minmax(150px,1fr))]">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search account, opportunity, brand, channel..."
                className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
              />
            </label>
            <FilterSelect label="Stage" value={stageFilter} onChange={setStageFilter} options={[allFilter, ...opportunityStages]} />
            <FilterSelect label="Forecast" value={forecastFilter} onChange={setForecastFilter} options={[allFilter, ...forecastEvidenceCategories]} />
            <FilterSelect label="Decision" value={recommendationFilter} onChange={setRecommendationFilter} options={[allFilter, ...decisionRecommendations]} />
            <FilterSelect label="Status" value={statusFilter} onChange={setStatusFilter} options={[allFilter, ...opportunityStatuses]} />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-100 pt-3">
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
              className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                quickFilter === value
                  ? 'bg-navy text-white'
                  : 'border border-gray-200 bg-white text-gray-600 hover:border-brand-blue hover:text-brand-blue'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-col gap-2 border-t border-gray-100 pt-3 lg:flex-row lg:items-center lg:justify-between">
          <p className="text-xs text-gray-500">
            Select deals in the table to build a new Pipeline Defense Brief. Existing records are never overwritten.
            {lastWorkspaceRefreshAt ? ` Last cloud read: ${formatOpportunityDate(lastWorkspaceRefreshAt)}.` : ''}
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={markWeakDealsReviewed} className="inline-flex items-center gap-2 text-xs font-bold text-blue-700 hover:text-brand-blue">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Mark weak deals reviewed
            </button>
            <button type="button" onClick={markMeddicAndProofGapsChecked} className="inline-flex items-center gap-2 text-xs font-bold text-blue-700 hover:text-brand-blue">
              <ClipboardList className="h-3.5 w-3.5" />
              Mark gaps checked
            </button>
          </div>
        </div>
        {briefCreateMessage && !isPreviewOpen && (
          <p className={`mt-3 rounded-lg px-3 py-2 text-sm font-semibold ${
            briefCreateState === 'error' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
          }`}>
            {briefCreateMessage}
          </p>
        )}
        {workspaceLoadError && (
          <p className="mt-3 rounded-lg bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-800">
            Cloud refresh issue: {workspaceLoadError}
          </p>
        )}
      </section>

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

      <PipelineQualitySummary quality={quality} />

      <PipelineShapeCharts opportunities={opportunities} onSelectStage={setStageFilter} />

      <ImportedPipelineForecastPanel summary={importedPipelineSummary} onFilter={setQuickFilter} />

      <ImportedOpportunityEnrichmentSignal summary={importedEnrichment} />

      <section>
        {loading ? (
          <SkeletonScreen label="Loading your opportunity master">
            <SkeletonTable rows={8} columns={6} />
          </SkeletonScreen>
        ) : opportunities.length === 0 ? (
          <EmptyState onAdd={openAddPanel} onImport={openCsvImport} />
        ) : visibleOpportunities.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm">
            <p className="text-sm font-semibold text-gray-900">No opportunities match these filters.</p>
            <p className="mt-1 text-sm text-gray-500">Clear search or filters to review your full pipeline.</p>
          </div>
        ) : (
          <OpportunityMasterTable
            rows={pagedRows}
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
        quotes={editingOpportunity ? getQuotesForOpportunity(quotes, editingOpportunity) : []}
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
    </div>
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
      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
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
        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
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
              className="mt-4 w-full rounded-full bg-navy px-4 py-2 text-sm font-bold text-white hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Apply refresh ({refreshPreview?.newItems.length || 0} new, {selectedRefreshUpdateCount} update{selectedRefreshUpdateCount === 1 ? '' : 's'})
            </button>
          ) : (
            <button
              type="button"
              onClick={onImport}
              disabled={importableRows.length === 0}
              className="mt-4 w-full rounded-full bg-navy px-4 py-2 text-sm font-bold text-white hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-50"
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
    <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3">
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
      <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3">
        <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Saved CSV Mapping Profiles</p>
        <p className="mt-1 text-sm text-gray-500">No saved mappings yet. Save one after confirming your CSV columns.</p>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3">
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
    <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3">
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
        <Metric label="Imported" value={summary.importedCount.toLocaleString()} tone="green" />
        <Metric label="FY26" value={formatBaseMoney(summary.fy26Total)} tone="green" />
        <Metric label="FY27" value={formatBaseMoney(summary.fy27Total)} tone="blue" />
        <Metric label="Stage inferred" value={summary.stageInferredCount.toLocaleString()} tone={summary.stageInferredCount ? 'amber' : 'green'} />
        <Metric label="With brand" value={summary.withBrandCount.toLocaleString()} tone="blue" />
        <Metric label="With channel" value={summary.withChannelCount.toLocaleString()} tone="blue" />
        <Metric label="Probability" value={summary.withProbabilityCount.toLocaleString()} tone="blue" />
        <Metric label="Needs action" value={summary.needsActionCount.toLocaleString()} tone={summary.needsActionCount ? 'red' : 'green'} />
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

function OpportunityMasterTable({
  rows,
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
  rows: OpportunityMasterRow[];
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
  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-gray-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-bold text-navy">Opportunity Master List</h2>
          <p className="mt-1 text-xs text-gray-500">
            {totalRows.toLocaleString()} after filters / {totalOpportunities.toLocaleString()} total
            {selectedIds.length > 0 ? ` / ${selectedIds.length} selected` : ''}
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

      <div className="max-w-full overflow-x-auto">
        <table className="w-full min-w-[2040px] border-collapse text-left text-sm">
          <thead className="sticky top-0 z-10 bg-gray-50 text-[11px] font-bold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="sticky left-0 z-20 w-12 border-b border-gray-200 bg-gray-50 px-3 py-3 text-center">Pick</th>
              <OpportunitySortableHeader label="Account" sortKey="account" activeKey={sortKey} direction={sortDirection} onSort={onSort} className="sticky left-12 z-20 border-r border-gray-200 bg-gray-50" />
              <OpportunitySortableHeader label="Opportunity" sortKey="opportunity" activeKey={sortKey} direction={sortDirection} onSort={onSort} />
              <th className="border-b border-gray-200 px-3 py-3">Brand / channel</th>
              <OpportunitySortableHeader label="Stage" sortKey="stage" activeKey={sortKey} direction={sortDirection} onSort={onSort} />
              <OpportunitySortableHeader label="Value" sortKey="value" activeKey={sortKey} direction={sortDirection} onSort={onSort} />
              <OpportunitySortableHeader label="FY26" sortKey="fy26" activeKey={sortKey} direction={sortDirection} onSort={onSort} />
              <OpportunitySortableHeader label="FY27" sortKey="fy27" activeKey={sortKey} direction={sortDirection} onSort={onSort} />
              <OpportunitySortableHeader label="Prob." sortKey="probability" activeKey={sortKey} direction={sortDirection} onSort={onSort} />
              <OpportunitySortableHeader label="Close" sortKey="closePeriod" activeKey={sortKey} direction={sortDirection} onSort={onSort} />
              <OpportunitySortableHeader label="Forecast evidence" sortKey="forecast" activeKey={sortKey} direction={sortDirection} onSort={onSort} />
              <OpportunitySortableHeader label="Review decision" sortKey="recommendation" activeKey={sortKey} direction={sortDirection} onSort={onSort} />
              <th className="border-b border-gray-200 px-3 py-3">Sales flow</th>
              <OpportunitySortableHeader label="Next action" sortKey="nextActionDate" activeKey={sortKey} direction={sortDirection} onSort={onSort} />
              <OpportunitySortableHeader label="Deal quality" sortKey="quality" activeKey={sortKey} direction={sortDirection} onSort={onSort} />
              <OpportunitySortableHeader label="Last update" sortKey="updatedAt" activeKey={sortKey} direction={sortDirection} onSort={onSort} />
              <th className="border-b border-gray-200 px-3 py-3 text-right">Open</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row) => {
              const { opportunity, quality } = row;
              const selected = selectedIds.includes(opportunity.id);
              return (
                <tr
                  key={opportunity.id}
                  onClick={() => onOpen(opportunity)}
                  className={`group cursor-pointer transition hover:bg-blue-50/60 ${selected ? 'bg-blue-50/40' : 'bg-white'}`}
                >
                  <td className={`sticky left-0 z-10 px-3 py-3 text-center group-hover:bg-blue-50 ${selected ? 'bg-blue-50' : 'bg-white'}`}>
                    <input
                      type="checkbox"
                      checked={selected}
                      onClick={(event) => event.stopPropagation()}
                      onChange={() => onToggleSelection(opportunity.id)}
                      aria-label={`Select ${opportunity.accountName} / ${opportunity.opportunityName}`}
                      className="h-4 w-4 accent-brand-blue"
                    />
                  </td>
                  <td className={`sticky left-12 z-10 border-r border-gray-100 px-3 py-3 group-hover:bg-blue-50 ${selected ? 'bg-blue-50' : 'bg-white'}`}>
                    <p className="max-w-[190px] truncate font-bold text-navy" title={opportunity.accountName}>{opportunity.accountName || 'No account'}</p>
                    <p className="mt-1 max-w-[190px] truncate text-xs text-gray-500">
                      {opportunity.productOrSolution || `${opportunity.stage} opportunity`}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    <p className="max-w-[250px] truncate font-bold text-gray-900" title={opportunity.opportunityName}>{opportunity.opportunityName || 'Untitled opportunity'}</p>
                    <p className="mt-1 max-w-[250px] truncate text-xs text-gray-500">
                      {opportunity.opportunityType || (opportunity.decisionMaker ? `DM: ${opportunity.decisionMaker}` : 'Decision maker missing')}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex max-w-[190px] flex-wrap gap-1.5">
                      {opportunity.brand ? <Badge label={opportunity.brand} tone="green" /> : <Badge label="No brand" tone="gray" />}
                      {opportunity.channel ? <Badge label={opportunity.channel} tone="blue" /> : null}
                    </div>
                    {isFounderImportedOpportunity(opportunity) && (
                      <p className="mt-1 text-xs font-semibold text-emerald-700">Imported core</p>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <Badge label={opportunity.stage} />
                    <p className="mt-1 text-xs text-gray-500">
                      {opportunity.isStageInferred ? 'Inferred stage' : opportunity.status}
                    </p>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 font-bold text-gray-800">
                    {opportunity.estimatedValue ? formatMoney(opportunity.estimatedValue, opportunity.currency) : 'Not set'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 font-bold text-emerald-700">
                    {opportunity.fy26Value ? formatMoney(opportunity.fy26Value, opportunity.currency) : 'Not set'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 font-bold text-gray-800">
                    {opportunity.fy27Value ? formatMoney(opportunity.fy27Value, opportunity.currency) : 'Not set'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">
                    <p className="font-bold text-gray-800">
                      {typeof opportunity.pipelineProbability === 'number' ? `${Math.round(opportunity.pipelineProbability)}%` : 'Not set'}
                    </p>
                    {opportunity.sourceStageConfidence && (
                      <p className="mt-1 text-xs text-gray-500">{opportunity.sourceStageConfidence}</p>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <p className="max-w-[150px] truncate font-semibold text-gray-700" title={opportunity.expectedClosePeriod}>
                      {opportunity.expectedClosePeriod || 'Missing'}
                    </p>
                  </td>
                  <td className="px-3 py-3"><Badge label={opportunity.forecastEvidenceCategory} tone={forecastTone(opportunity.forecastEvidenceCategory)} /></td>
                  <td className="px-3 py-3"><Badge label={opportunity.decisionRecommendation} tone={decisionTone(opportunity.decisionRecommendation)} /></td>
                  <td className="px-3 py-3">
                    <OpportunitySalesFlowCell opportunity={opportunity} />
                  </td>
                  <td className="px-3 py-3">
                    <p className="max-w-[250px] truncate font-semibold text-gray-800" title={opportunity.nextAction}>
                      {opportunity.nextAction || 'No next action'}
                    </p>
                    <p className={`mt-1 text-xs font-semibold ${isPastDate(opportunity.nextActionDate) ? 'text-red-600' : 'text-gray-500'}`}>
                      {formatSafeBusinessDate(opportunity.nextActionDate)}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    <Badge label={quality.status} tone={quality.status === 'High risk' ? 'red' : quality.status === 'Needs cleanup' ? 'amber' : 'green'} />
                    <p className="mt-1 max-w-[190px] truncate text-xs text-gray-500" title={quality.primaryAction}>
                      {quality.issues.length} gap{quality.issues.length === 1 ? '' : 's'} / {row.linkedActivityCount} activities
                    </p>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">
                    <p className="font-semibold text-gray-700">{formatOpportunityDate(row.lastUpdatedAt)}</p>
                    <p className={`mt-1 text-xs ${row.silence.status === 'silent' ? 'font-bold text-red-600' : row.silence.status === 'at-risk' ? 'font-bold text-amber-600' : 'text-gray-500'}`}>
                      {row.silence.status === 'silent' || row.silence.status === 'at-risk'
                        ? `Quiet ${row.silence.daysQuiet}d - no next action`
                        : row.lastActivityDate ? `Last touch ${formatOpportunityDate(row.lastActivityDate)}` : 'No linked touch'}
                    </p>
                    {(row.silence.status === 'silent' || row.silence.status === 'at-risk') && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onDraftFollowUp(opportunity);
                        }}
                        className="mt-1.5 rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs font-bold text-brand-blue hover:border-brand-blue/40"
                      >
                        Draft follow-up
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpen(opportunity);
                      }}
                      title="Open opportunity details"
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
      <button type="button" onClick={() => onSort(sortKey)} className="inline-flex items-center gap-1 hover:text-navy">
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
  quotes,
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
  quotes: QuoteRecord[];
  onChange: (form: OpportunityFormInput) => void;
  onActionOutcomesChange: (outcomes: ActionOutcomeRecord[]) => void;
  onSaveOpportunityOutcome: (opportunity: CrmLiteOpportunity, draft: OpportunityOutcomeDraft) => void;
  onSave: () => void;
  onClose: () => void;
  onDelete?: () => void;
  onCreateDefenseBrief?: () => void;
}) {
  if (mode === 'closed') {
    return null;
  }

  const update = <Key extends keyof OpportunityFormInput>(key: Key, value: OpportunityFormInput[Key]) => {
    onChange({ ...form, [key]: value });
  };
  const currentOpportunity = editingOpportunity ? { ...editingOpportunity, ...form } : null;

  return (
    <>
      <button
        type="button"
        aria-label="Close opportunity details"
        onClick={onClose}
        className="fixed inset-y-0 left-0 right-0 top-16 z-40 bg-slate-950/25 backdrop-blur-[1px] lg:left-[220px]"
      />
      <aside className="fixed bottom-0 right-0 top-16 z-50 w-full overflow-y-auto border-l border-gray-200 bg-white p-5 shadow-2xl sm:max-w-[760px]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">{mode === 'add' ? 'Add Opportunity' : 'Edit Opportunity'}</p>
          <h2 className="mt-2 text-xl font-bold text-navy">
            {mode === 'add' ? 'New deal record' : editingOpportunity?.opportunityName}
          </h2>
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

      {currentOpportunity && (
        <OpportunitySalesFlowCard
          guidance={buildOpportunitySalesFlowGuidance(currentOpportunity)}
          onUseAsNextAction={(action) => onChange({ ...form, nextAction: action })}
        />
      )}

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
        <>
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
          {currentOpportunity && (
            <OpportunityOutcomeRetroPanel
              opportunity={currentOpportunity}
              outcomes={getOpportunityOutcomesForOpportunity(opportunityOutcomes, currentOpportunity)}
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
        </>
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
    </>
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

function OpportunitySalesFlowCell({ opportunity }: { opportunity: CrmLiteOpportunity }) {
  const guidance = buildOpportunitySalesFlowGuidance(opportunity);
  return (
    <div className="min-w-[190px]">
      <div className="flex flex-wrap gap-1.5">
        <Badge label={guidance.step.label} tone="blue" />
        <Badge label={guidance.status} tone={salesFlowTone(guidance.status)} />
      </div>
      <p className="mt-1 max-w-[220px] truncate text-xs font-semibold text-gray-700" title={guidance.suggestedAction}>
        {guidance.suggestedAction}
      </p>
      <p className="mt-1 text-xs text-gray-500">
        {guidance.missingCheckpoints.length > 0
          ? `${guidance.missingCheckpoints.length} checkpoint gap${guidance.missingCheckpoints.length === 1 ? '' : 's'}`
          : `Next: ${guidance.nextStepLabel}`}
      </p>
    </div>
  );
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
  const generatedDeals = opportunities.map((opportunity) => mapOpportunityToPipelineDefenseDeal(opportunity, objections, stakeholders, activities, actionOutcomes, salesAssets, opportunities));
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
                {meddicMap.stakeholderNextActions.slice(0, 3).map((action) => (
                  <li key={`${action.stakeholderName}-${action.action}`}>- {action.stakeholderName}: {action.action}{action.dueDate ? ` (${formatSafeBusinessDate(action.dueDate)})` : ''}</li>
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
  onSaveOutcome,
}: {
  opportunity: CrmLiteOpportunity;
  outcomes: OpportunityOutcomeRecord[];
  onSaveOutcome: (draft: OpportunityOutcomeDraft) => void;
}) {
  const [draft, setDraft] = useState<OpportunityOutcomeDraft>(() => buildOpportunityOutcomeDraft(opportunity));
  const [open, setOpen] = useState(outcomes.length === 0);

  useEffect(() => {
    setDraft(buildOpportunityOutcomeDraft(opportunity));
  }, [opportunity]);

  const update = <Key extends keyof OpportunityOutcomeDraft>(key: Key, value: OpportunityOutcomeDraft[Key]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  return (
    <section className="mt-5 rounded-lg border border-indigo-100 bg-indigo-50/70 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-700">Closed-loop learning</p>
          <h3 className="mt-1 text-base font-bold text-navy">Record win/loss/delay retro</h3>
          <p className="mt-1 text-sm leading-6 text-indigo-900/75">
            Mark the outcome and capture what Memoire should learn. This is not a heavy CRM close process.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="rounded-full border border-indigo-200 bg-white px-3 py-1.5 text-xs font-bold text-indigo-700"
        >
          {open ? 'Hide retro form' : 'Mark outcome'}
        </button>
      </div>

      {open && (
        <div className="mt-4 grid gap-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <SelectField label="Outcome" value={draft.outcome} options={opportunityOutcomeOptions} onChange={(value) => update('outcome', value)} />
            <Field label="Outcome date" type="date" value={draft.outcomeDate} onChange={(value) => update('outcomeDate', value)} />
            <Field
              label="Final amount"
              type="number"
              value={draft.finalAmount?.toString() || ''}
              onChange={(value) => update('finalAmount', value ? Number(value) : null)}
            />
            <Field label="Currency" value={draft.currency} onChange={(value) => update('currency', value)} />
            <SelectField label="Reason category" value={draft.reasonCategory} options={opportunityOutcomeReasonCategories} onChange={(value) => update('reasonCategory', value)} />
            <Field label="Which stakeholder mattered?" value={draft.decisiveStakeholder || ''} onChange={(value) => update('decisiveStakeholder', value)} />
          </div>
          <TextArea label="Why did this happen?" value={draft.reasonText} onChange={(value) => update('reasonText', value)} />
          <TextArea label="Which objection mattered?" value={draft.objectionThatMattered || ''} onChange={(value) => update('objectionThatMattered', value)} />
          <TextArea label="What evidence was missing?" value={draft.evidenceThatWasMissing || ''} onChange={(value) => update('evidenceThatWasMissing', value)} />
          <TextArea label="What should I do differently next time?" value={draft.lessonLearned || ''} onChange={(value) => update('lessonLearned', value)} />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onSaveOutcome(draft)}
              className="inline-flex items-center gap-2 rounded-full bg-navy px-4 py-2 text-sm font-bold text-white"
            >
              <CheckCircle2 className="h-4 w-4" />
              Save outcome retro
            </button>
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

function EmptyState({ onAdd, onImport }: { onAdd: () => void; onImport: () => void }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm">
      <p className="text-base font-bold text-navy">Import your pipeline or add your first opportunity.</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-gray-500">
        Opportunities are the deals you want to track and defend. Add one active deal, then Memoire can help you inspect evidence, risk, next action, and pipeline defense readiness.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <button type="button" onClick={onImport} className="inline-flex items-center gap-2 rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">
          <Upload className="h-4 w-4" />
          Import CSV
        </button>
        <button type="button" onClick={onAdd} className="inline-flex items-center gap-2 rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">
          <Plus className="h-4 w-4" />
          Add Opportunity
        </button>
        <Link to="/app/onboarding/pipeline-review" className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-4 py-2 text-sm font-bold text-brand-blue">
          Start First Pipeline Review
        </Link>
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

function normalizeText(value?: string) {
  return (value || '').trim().toLowerCase();
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

function compareOpportunityRows(
  left: OpportunityMasterRow,
  right: OpportunityMasterRow,
  sortKey: OpportunitySortKey,
  direction: SortDirection,
) {
  const directionFactor = direction === 'asc' ? 1 : -1;
  const leftValue = getOpportunitySortValue(left, sortKey);
  const rightValue = getOpportunitySortValue(right, sortKey);
  if (typeof leftValue === 'number' && typeof rightValue === 'number') {
    return (leftValue - rightValue) * directionFactor;
  }
  return String(leftValue).localeCompare(String(rightValue), undefined, { numeric: true }) * directionFactor;
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
    case 'value':
      return opportunity.estimatedValue || 0;
    case 'fy26':
      return opportunity.fy26Value || 0;
    case 'fy27':
      return opportunity.fy27Value || 0;
    case 'probability':
      return opportunity.pipelineProbability || 0;
    case 'closePeriod':
      return opportunity.expectedClosePeriod || 'zzzz';
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

function getLinkedActivities(opportunity: CrmLiteOpportunity, activities: SalesActivityRecord[]) {
  return activities
    .filter((activity) => activity.linkStatus === 'Linked' && activity.linkedOpportunityId === opportunity.id)
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
