import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, Bot, CalendarDays, Clipboard, Copy, Loader2, Mail, NotebookPen, Save, Sparkles, Trash2 } from 'lucide-react';
import { useAuthContext } from '../../auth/authContext';
import { DataModePill } from '../../components/common/DataModePill';
import { isSupabaseConfigured } from '../../lib/demoMode';
import { hasLocalSampleData } from '../../utils/dataMode';
import { classifySalesActivity, type ClassifiedSalesActivity, type SalesActivityType } from '../../utils/salesActivityClassifier';
import {
  canUseSalesActivityCloudStore,
  deleteSalesActivity,
  saveSalesActivity,
  updateSalesActivityLink,
  type SalesActivityRecord,
} from '../../services/salesActivityStore';
import { updateOpportunity, type CrmLiteOpportunity } from '../../services/opportunityStore';
import { type AccountMemoryRecord } from '../../services/accountStore';
import { createStakeholder, type StakeholderRecord } from '../../services/stakeholderStore';
import { createObjection, type ObjectionRecord } from '../../services/objectionStore';
import { getCachedSalesWorkspaceData, loadSalesWorkspaceData } from '../../services/workspaceData';
import { getActiveCaptureAiProvider, type CaptureAiSuggestion } from '../../services/captureAiProvider';
import { ActivityOpportunityLinkPanel } from '../opportunities/ActivityOpportunityLinkPanel';
import { applyOpportunityUpdateSuggestion, suggestOpportunityLinks, type OpportunityUpdateSuggestion } from '../../utils/activityOpportunityLinker';
import { deriveStakeholderCandidateFromCapture } from '../../utils/stakeholderGraph';
import { buildObjectionFromActivity, detectObjectionCandidatesFromActivity } from '../../utils/objectionLedger';
import { markPipelineReviewHabitStepComplete } from '../../utils/pipelineReviewHabit';
import { markTrialActivationChecklistItemComplete } from '../../utils/trialActivationChecklist';
import { markDemoJourneyStepComplete } from '../../utils/demoJourney';
import { formatSafeBusinessDate, isValidBusinessDate, sanitizeBusinessDate, todayDateKey } from '../../utils/safeDate.ts';
import {
  buildEmailThreadIngestion,
  buildIngestionSourceTags,
  composeIngestionParserText,
  type IngestedSourceItem,
} from '../../utils/ingestionSource.ts';
import {
  addCaptureAccountAlias,
  buildCaptureCorrectionEvents,
  clearLocalCaptureCorrectionMemory,
  deleteCaptureAccountAlias,
  deleteCaptureCorrection,
  loadCaptureAccountAliases,
  loadCaptureCorrections,
  recordCaptureCorrections,
  type CaptureAccountAlias,
  type CaptureCorrectionEvent,
} from '../../services/captureCorrectionMemoryStore';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type AiState = 'idle' | 'loading' | 'ready' | 'error';
type ParseSource = 'local' | 'ai';
type CaptureMode = 'note' | 'quick' | 'email';
type QuickInteractionType =
  | 'Customer meeting'
  | 'Dealer call'
  | 'Proposal sent'
  | 'Objection received'
  | 'Procurement update'
  | 'Technical discussion'
  | 'Follow-up'
  | 'Internal review';
type QuickSignalType =
  | 'Buying signal'
  | 'Risk signal'
  | 'Objection'
  | 'Stakeholder update'
  | 'Timeline update'
  | 'Competitor signal'
  | 'Procurement signal'
  | 'No major change';
type QuickCaptureForm = {
  accountName: string;
  opportunityName: string;
  interactionType: QuickInteractionType;
  whatHappened: string;
  nextAction: string;
  dueDate: string;
  signalType: QuickSignalType;
  activityDate: string;
};
type EmailThreadCaptureForm = {
  sourceType: 'pasted-email' | 'pasted-thread';
  subject: string;
  sender: string;
  recipients: string;
  body: string;
  sourceDate: string;
  accountHint: string;
  opportunityHint: string;
};

const activityTypes: SalesActivityType[] = [
  'Customer meeting',
  'Follow-up',
  'Demo / technical discussion',
  'Quote / proposal',
  'Tender / procurement',
  'Internal coordination',
  'Objection handling',
  'Admin / CRM',
  'Other',
];

const quickInteractionTypes: QuickInteractionType[] = [
  'Customer meeting',
  'Dealer call',
  'Proposal sent',
  'Objection received',
  'Procurement update',
  'Technical discussion',
  'Follow-up',
  'Internal review',
];

const quickSignalTypes: QuickSignalType[] = [
  'Buying signal',
  'Risk signal',
  'Objection',
  'Stakeholder update',
  'Timeline update',
  'Competitor signal',
  'Procurement signal',
  'No major change',
];

const quickTemplates: {
  id: string;
  label: string;
  interactionType: QuickInteractionType;
  signalType: QuickSignalType;
  whatHappenedPrompt: string;
  nextActionPrompt: string;
}[] = [
  {
    id: 'customer-meeting',
    label: 'After customer meeting',
    interactionType: 'Customer meeting',
    signalType: 'Stakeholder update',
    whatHappenedPrompt: 'Who joined, what changed, and what signal did you hear?',
    nextActionPrompt: 'What must you send, confirm, or schedule next?',
  },
  {
    id: 'dealer-call',
    label: 'After dealer call',
    interactionType: 'Dealer call',
    signalType: 'Timeline update',
    whatHappenedPrompt: 'What did the dealer report about the account, timeline, or blocker?',
    nextActionPrompt: 'What follow-up should you or the dealer do?',
  },
  {
    id: 'proposal-sent',
    label: 'After proposal sent',
    interactionType: 'Proposal sent',
    signalType: 'Procurement signal',
    whatHappenedPrompt: 'What proposal or quote was sent, and what decision step is expected?',
    nextActionPrompt: 'What proof, clarification, or follow-up is needed?',
  },
  {
    id: 'objection-received',
    label: 'After objection received',
    interactionType: 'Objection received',
    signalType: 'Objection',
    whatHappenedPrompt: 'What objection did they raise, who raised it, and how serious is it?',
    nextActionPrompt: 'What proof or response must be prepared?',
  },
  {
    id: 'procurement-update',
    label: 'After procurement update',
    interactionType: 'Procurement update',
    signalType: 'Procurement signal',
    whatHappenedPrompt: 'What changed in procurement, tender, PO, or approval path?',
    nextActionPrompt: 'What procurement step must be confirmed next?',
  },
  {
    id: 'technical-discussion',
    label: 'After technical discussion',
    interactionType: 'Technical discussion',
    signalType: 'Buying signal',
    whatHappenedPrompt: 'What technical criteria, validation need, or proof request came up?',
    nextActionPrompt: 'What technical document, demo, or answer is needed?',
  },
  {
    id: 'internal-review',
    label: 'After internal pipeline review',
    interactionType: 'Internal review',
    signalType: 'Risk signal',
    whatHappenedPrompt: 'What risk or gap did the review expose?',
    nextActionPrompt: 'What must be clarified before the next review?',
  },
];

export function DailyCapturePage() {
  const { user, loading: authLoading, isAuthenticated } = useAuthContext();
  const [searchParams] = useSearchParams();
  const searchParamsKey = searchParams.toString();
  const [rawNote, setRawNote] = useState('');
  const [activityDate, setActivityDate] = useState(() => getQueryDate(searchParams) || todayKey());
  const [captureMode, setCaptureMode] = useState<CaptureMode>(() => {
    const mode = searchParams.get('mode');
    if (mode === 'quick') return 'quick';
    if (mode === 'email') return 'email';
    return 'note';
  });
  const [quickTemplateId, setQuickTemplateId] = useState(quickTemplates[0].id);
  const [quickForm, setQuickForm] = useState<QuickCaptureForm>(() => createInitialQuickCaptureForm(searchParams));
  const [emailForm, setEmailForm] = useState<EmailThreadCaptureForm>(() => createInitialEmailThreadCaptureForm(searchParams));
  const [activities, setActivities] = useState<SalesActivityRecord[]>([]);
  const [opportunities, setOpportunities] = useState<CrmLiteOpportunity[]>([]);
  const [accounts, setAccounts] = useState<AccountMemoryRecord[]>([]);
  const [stakeholders, setStakeholders] = useState<StakeholderRecord[]>([]);
  const [objections, setObjections] = useState<ObjectionRecord[]>([]);
  const [stakeholderSuggestionDismissed, setStakeholderSuggestionDismissed] = useState(false);
  const [objectionSuggestionDismissed, setObjectionSuggestionDismissed] = useState(false);
  const [lastSavedActivity, setLastSavedActivity] = useState<SalesActivityRecord | null>(null);
  const [loadingActivities, setLoadingActivities] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [aiState, setAiState] = useState<AiState>('idle');
  const [message, setMessage] = useState('');
  const [aiMessage, setAiMessage] = useState('');
  const [aiSuggestion, setAiSuggestion] = useState<CaptureAiSuggestion | null>(null);
  const [structuredDraft, setStructuredDraft] = useState<ClassifiedSalesActivity | null>(null);
  const [originalParsedDraft, setOriginalParsedDraft] = useState<ClassifiedSalesActivity | null>(null);
  const [captureCorrections, setCaptureCorrections] = useState<CaptureCorrectionEvent[]>([]);
  const [accountAliases, setAccountAliases] = useState<CaptureAccountAlias[]>([]);
  const [newAlias, setNewAlias] = useState('');
  const [newAliasAccount, setNewAliasAccount] = useState('');
  const [parseSource, setParseSource] = useState<ParseSource>('local');
  const aiRequestVersion = useRef(0);
  const [copiedId, setCopiedId] = useState('');
  const aiProvider = useMemo(() => getActiveCaptureAiProvider(), []);
  const aiConfigured = aiProvider.isConfigured() && isAuthenticated;
  const sampleDataActive = hasLocalSampleData();
  const dataUserId = sampleDataActive ? undefined : user?.id;

  useEffect(() => {
    setCaptureCorrections(loadCaptureCorrections(user?.id));
    setAccountAliases(loadCaptureAccountAliases(user?.id));
  }, [user?.id]);

  const emailSourceItem = useMemo(() => {
    if (emailForm.body.trim().length < 8) return null;
    return buildEmailThreadIngestion({
      sourceType: emailForm.sourceType,
      subject: emailForm.subject,
      sender: emailForm.sender,
      recipients: emailForm.recipients,
      body: emailForm.body,
      sourceDate: emailForm.sourceDate,
      accountHint: emailForm.accountHint,
      opportunityHint: emailForm.opportunityHint,
      userId: user?.id,
    });
  }, [emailForm, user?.id]);
  const activeSourceItem: IngestedSourceItem | null = captureMode === 'email' ? emailSourceItem : null;
  const activeActivityDate = captureMode === 'email'
    ? sanitizeBusinessDate(emailForm.sourceDate) || activityDate
    : activityDate;
  const activeCaptureText = captureMode === 'email' && emailSourceItem
    ? composeIngestionParserText(emailSourceItem, {
      accountHint: emailForm.accountHint,
      opportunityHint: emailForm.opportunityHint,
    })
    : rawNote.trim();

  const localPreview = useMemo(() => {
    return captureMode !== 'quick' && activeCaptureText.trim().length >= 8
      ? classifySalesActivity(activeCaptureText, activeActivityDate, {
        accounts,
        opportunities,
        corrections: captureCorrections,
        aliases: accountAliases,
        ...(activeSourceItem ? { source: activeSourceItem } : {}),
      })
      : null;
  }, [accountAliases, accounts, activeActivityDate, activeCaptureText, activeSourceItem, captureCorrections, captureMode, opportunities]);
  const preview = structuredDraft || localPreview;
  const needsConfirmation = parseSource === 'local' || aiSuggestion?.confidence === 'Low' || !preview?.accountName;

  const runAiClassification = useCallback(async () => {
    const note = activeCaptureText.trim();
    if (!aiConfigured || note.length < 8 || !isValidBusinessDate(activeActivityDate)) {
      setParseSource('local');
      setAiState('error');
      setAiMessage('AI unavailable — using local fallback. Please review before saving.');
      return false;
    }

    const requestVersion = ++aiRequestVersion.current;
    setAiState('loading');
    setAiMessage('AI is parsing this note...');
    try {
      const suggestion = await aiProvider.classifyCapture({
        rawNote: note,
        activityDate: activeActivityDate,
        opportunities: opportunities.map((opportunity) => ({
          id: opportunity.id,
          accountName: opportunity.accountName,
          opportunityName: opportunity.opportunityName,
          stage: opportunity.stage,
          productOrSolution: opportunity.productOrSolution,
        })),
        accounts: accounts.map((account) => ({
          id: account.id,
          accountName: account.accountName,
          segment: account.segment,
          industry: account.industry,
        })),
        corrections: captureCorrections,
        aliases: accountAliases,
      });
      if (requestVersion !== aiRequestVersion.current) return false;

      setAiSuggestion(suggestion);
      const parsedDraft = withCaptureSourceMetadata(
        aiSuggestionToClassified(suggestion, note, activeActivityDate, 'ai'),
        activeSourceItem,
      );
      setStructuredDraft(parsedDraft);
      setOriginalParsedDraft(cloneClassifiedDraft(parsedDraft));
      setParseSource('ai');
      setAiState('ready');
      setAiMessage(suggestion.confidence === 'Low'
        ? 'AI parsed — needs confirmation. Review the fields before saving.'
        : 'AI parsed. Review the fields before saving.');
      return true;
    } catch {
      if (requestVersion !== aiRequestVersion.current) return false;
      setAiSuggestion(null);
      setStructuredDraft(null);
      setOriginalParsedDraft(null);
      setParseSource('local');
      setAiState('error');
      setAiMessage('AI unavailable — using local fallback. Please review before saving.');
      return false;
    }
  }, [accountAliases, accounts, activeActivityDate, activeCaptureText, activeSourceItem, aiConfigured, aiProvider, captureCorrections, opportunities]);

  useEffect(() => {
    if ((captureMode !== 'note' && captureMode !== 'email') || activeCaptureText.trim().length < 8) return;
    if (!aiConfigured) {
      setParseSource('local');
      setAiMessage('AI unavailable — using local fallback. Please review before saving.');
      return;
    }

    const timer = window.setTimeout(() => void runAiClassification(), 650);
    return () => {
      window.clearTimeout(timer);
      aiRequestVersion.current += 1;
    };
  }, [activeCaptureText, aiConfigured, captureMode, runAiClassification]);

  const refreshActivities = async () => {
    const cachedData = getCachedSalesWorkspaceData(dataUserId);
    if (cachedData) {
      setActivities(cachedData.activities);
      setOpportunities(cachedData.opportunities);
      setAccounts(cachedData.accounts);
      setStakeholders(cachedData.stakeholders);
      setObjections(cachedData.objections);
      setLoadingActivities(false);
      return;
    }

    setLoadingActivities(true);
    const workspaceData = await loadSalesWorkspaceData(dataUserId);
    setActivities(workspaceData.activities);
    setOpportunities(workspaceData.opportunities);
    setAccounts(workspaceData.accounts);
    setStakeholders(workspaceData.stakeholders);
    setObjections(workspaceData.objections);
    setLoadingActivities(false);
  };

  useEffect(() => {
    refreshActivities();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataUserId]);

  useEffect(() => {
    const mode = searchParams.get('mode');
    const nextMode: CaptureMode = mode === 'quick' ? 'quick' : mode === 'email' ? 'email' : 'note';
    const queryDate = getQueryDate(searchParams);
    if (nextMode === 'quick') {
      setCaptureMode('quick');
      setQuickForm((current) => ({
        ...current,
        accountName: searchParams.get('account') || current.accountName,
        opportunityName: searchParams.get('opportunity') || current.opportunityName,
        activityDate: queryDate || current.activityDate,
      }));
      if (queryDate) setActivityDate(queryDate);
    } else if (nextMode === 'email') {
      setCaptureMode('email');
      setEmailForm((current) => ({
        ...current,
        sourceDate: queryDate || current.sourceDate,
        accountHint: searchParams.get('account') || current.accountHint,
        opportunityHint: searchParams.get('opportunity') || current.opportunityHint,
      }));
      if (queryDate) setActivityDate(queryDate);
    }
  }, [searchParams, searchParamsKey]);

  const handleSave = async () => {
    const captureText = activeCaptureText.trim();
    if (captureText.length < 8 || !preview) {
      setMessage('Capture a short sales activity first.');
      setSaveState('error');
      return;
    }
    if (aiConfigured && parseSource !== 'ai' && aiState !== 'error') {
      if (aiState === 'loading') {
        setMessage('AI is still parsing. Review the AI parsed draft when it appears.');
        setSaveState('error');
        return;
      }
      const parsed = await runAiClassification();
      setMessage(parsed
        ? 'AI parsed. Confirm or correct the structured fields, then save again.'
        : 'AI unavailable — using local fallback. Please review before saving.');
      setSaveState('error');
      return;
    }
    if (!isValidBusinessDate(activeActivityDate) || (preview.dueDate && !isValidBusinessDate(preview.dueDate)) || preview.nextActions?.some((action) => action.dueDate && !isValidBusinessDate(action.dueDate))) {
      setMessage('Needs date correction before this activity can be saved.');
      setSaveState('error');
      return;
    }

    setSaveState('saving');
    setMessage('Saving activity...');
    const classified: ClassifiedSalesActivity = {
      ...withCaptureSourceMetadata(preview, activeSourceItem),
      rawNote: captureText,
      activityDate: activeActivityDate,
      tags: mergeSourceTags(normalizeTags([parseSource === 'ai' ? 'ai-parsed' : 'local-fallback', ...preview.tags]), activeSourceItem),
    };
    const corrections = buildCaptureCorrectionEvents({
      original: originalParsedDraft || localPreview || classified,
      corrected: classified,
      source: parseSource === 'ai' ? 'ai' : 'local-fallback',
      rawNote: captureText,
      userId: user?.id,
    });
    const result = await saveSalesActivity(classified, dataUserId);
    const memory = recordCaptureCorrections(corrections, user?.id);
    setCaptureCorrections(memory.corrections);
    setAccountAliases(memory.aliases);
    setActivities((current) => [result.record, ...current.filter((item) => item.id !== result.record.id)]);
    setLastSavedActivity(result.record);
    setRawNote('');
    setEmailForm(createInitialEmailThreadCaptureForm(searchParams));
    setStructuredDraft(null);
    setOriginalParsedDraft(null);
    setOriginalParsedDraft(null);
    setAiSuggestion(null);
    setAiMessage('');
    setAiState('idle');
    setParseSource('local');
    setSaveState(result.warning ? 'error' : 'saved');
    setMessage(result.warning || (result.mode === 'cloud' ? 'Synced to your account.' : 'Saved locally in this browser.'));
    markTrialActivationChecklistItemComplete('capture-update');
    markPipelineReviewHabitStepComplete('capturedUpdatesAt');
    if (activeSourceItem?.sourceType === 'pasted-email' || activeSourceItem?.sourceType === 'pasted-thread') {
      markDemoJourneyStepComplete('paste-evidence', 'Pasted email/thread evidence captured');
    }
    setStakeholderSuggestionDismissed(false);
    setObjectionSuggestionDismissed(false);
  };

  const handleQuickSave = async () => {
    if (!isValidBusinessDate(quickForm.activityDate) || (quickForm.dueDate && !isValidBusinessDate(quickForm.dueDate))) {
      setMessage('Needs date correction before this activity can be saved.');
      setSaveState('error');
      return;
    }
    const prepared = buildQuickCaptureActivity(quickForm);
    if (!prepared) {
      setMessage('Add an account and a short update before saving quick capture.');
      setSaveState('error');
      return;
    }

    setSaveState('saving');
    setMessage('Saving quick capture...');
    const result = await saveSalesActivity(prepared, dataUserId);
    setActivities((current) => [result.record, ...current.filter((item) => item.id !== result.record.id)]);
    setLastSavedActivity(result.record);
    setQuickForm((current) => ({
      ...current,
      whatHappened: '',
      nextAction: '',
      dueDate: '',
      signalType: current.signalType === 'No major change' ? 'No major change' : current.signalType,
    }));
    setRawNote('');
    setStructuredDraft(null);
    setAiSuggestion(null);
    setAiMessage('');
    setAiState('idle');
    setSaveState(result.warning ? 'error' : 'saved');
    setMessage(result.warning || (result.mode === 'cloud' ? 'Quick capture synced to your account.' : 'Quick capture saved locally.'));
    markTrialActivationChecklistItemComplete('capture-update');
    markPipelineReviewHabitStepComplete('capturedUpdatesAt');
    setStakeholderSuggestionDismissed(false);
    setObjectionSuggestionDismissed(false);
  };

  const applyQuickTemplate = (templateId: string) => {
    const template = quickTemplates.find((item) => item.id === templateId) || quickTemplates[0];
    setQuickTemplateId(template.id);
    setQuickForm((current) => ({
      ...current,
      interactionType: template.interactionType,
      signalType: template.signalType,
    }));
  };

  const resetParserState = () => {
    aiRequestVersion.current += 1;
    setStructuredDraft(null);
    setOriginalParsedDraft(null);
    setAiSuggestion(null);
    setAiState('idle');
    setParseSource('local');
    setAiMessage('');
    setSaveState('idle');
    setMessage('');
  };

  const updateEmailForm = (patch: Partial<EmailThreadCaptureForm>) => {
    setEmailForm((current) => ({ ...current, ...patch }));
    resetParserState();
  };

  const updateDraft = <Key extends keyof ClassifiedSalesActivity>(key: Key, value: ClassifiedSalesActivity[Key]) => {
    if (!preview) return;
    if (!originalParsedDraft) setOriginalParsedDraft(cloneClassifiedDraft(preview));
    setStructuredDraft({
      ...preview,
      rawNote: activeCaptureText.trim(),
      activityDate: activeActivityDate,
      [key]: value,
    });
    setSaveState('idle');
    setMessage('');
  };

  const handleAddAlias = () => {
    const next = addCaptureAccountAlias({
      alias: newAlias,
      canonicalAccountName: newAliasAccount,
      source: 'manual',
      userId: user?.id,
    });
    setAccountAliases(next);
    if (next.some((item) => item.alias.toLowerCase() === newAlias.trim().toLowerCase())) {
      setNewAlias('');
      setNewAliasAccount('');
    }
  };

  const handleDelete = async (activity: SalesActivityRecord) => {
    await deleteSalesActivity(activity, dataUserId);
    setActivities((current) => current.filter((item) => item.id !== activity.id));
    if (lastSavedActivity?.id === activity.id) setLastSavedActivity(null);
  };

  const handleLinkActivity = async (
    activity: SalesActivityRecord,
    opportunity: CrmLiteOpportunity,
    applyUpdates: boolean,
    updateSuggestion: OpportunityUpdateSuggestion
  ) => {
    const linkedActivity = await updateSalesActivityLink(activity, {
      linkedOpportunityId: opportunity.id,
      linkedOpportunityName: opportunity.opportunityName,
      linkedAccountName: opportunity.accountName,
      linkStatus: 'Linked',
    }, dataUserId);

    setActivities((current) => current.map((item) => item.id === linkedActivity.id ? linkedActivity : item));
    if (lastSavedActivity?.id === linkedActivity.id) setLastSavedActivity(linkedActivity);

    if (applyUpdates) {
      const result = await updateOpportunity(opportunity, applyOpportunityUpdateSuggestion(opportunity, updateSuggestion), dataUserId);
      setOpportunities((current) => current.map((item) => item.id === result.opportunity.id ? result.opportunity : item));
      setMessage(result.warning || 'Activity linked and opportunity updated.');
      setSaveState(result.warning ? 'error' : 'saved');
      return;
    }

    setMessage('Activity linked to opportunity.');
    setSaveState('saved');
  };

  const handleIgnoreActivityLink = async (activity: SalesActivityRecord) => {
    const updated = await updateSalesActivityLink(activity, { linkStatus: 'Ignored' }, dataUserId);
    setActivities((current) => current.map((item) => item.id === updated.id ? updated : item));
    if (lastSavedActivity?.id === updated.id) setLastSavedActivity(updated);
    setMessage('Link suggestion ignored.');
    setSaveState('saved');
  };

  const handleUnlinkActivity = async (activity: SalesActivityRecord) => {
    const updated = await updateSalesActivityLink(activity, { linkStatus: 'Unlinked' }, dataUserId);
    setActivities((current) => current.map((item) => item.id === updated.id ? updated : item));
    if (lastSavedActivity?.id === updated.id) setLastSavedActivity(updated);
    setMessage('Activity unlinked.');
    setSaveState('saved');
  };

  const handleCopy = async (activity: SalesActivityRecord) => {
    const summary = formatActivitySummary(activity);
    try {
      await navigator.clipboard.writeText(summary);
      setCopiedId(activity.id);
      window.setTimeout(() => setCopiedId(''), 1600);
    } catch {
      setMessage(summary);
      setSaveState('error');
    }
  };

  const createStakeholderFromLastActivity = async () => {
    if (!lastSavedActivity) return;
    const candidate = deriveStakeholderCandidateFromCapture(lastSavedActivity);
    if (!candidate) return;
    const result = await createStakeholder({
      accountId: '',
      accountName: candidate.accountName,
      opportunityId: candidate.opportunityId,
      opportunityName: candidate.opportunityName,
      name: candidate.name,
      roleTitle: '',
      stakeholderRole: 'Unknown',
      influenceLevel: 'Unknown',
      relationshipStrength: 'Developing',
      stance: 'Unknown',
      email: '',
      phone: '',
      notes: candidate.notes,
      tags: ['from-capture', 'role-needs-confirmation'],
      lastInteractionDate: candidate.lastInteractionDate,
    }, dataUserId);
    setStakeholders((current) => [result.stakeholder, ...current.filter((item) => item.id !== result.stakeholder.id)]);
    setStakeholderSuggestionDismissed(true);
    setMessage(result.warning || 'Stakeholder created from capture.');
    setSaveState(result.warning ? 'error' : 'saved');
  };

  const createObjectionFromLastActivity = async () => {
    if (!lastSavedActivity) return;
    const activity = lastSavedActivity;
    const linkedOpportunity = opportunities.find((opportunity) => opportunity.id === activity.linkedOpportunityId);
    const matchingStakeholder = stakeholders.find((stakeholder) => (
      stakeholder.name.toLowerCase() === (activity.stakeholderName || activity.contactName || '').toLowerCase() &&
      (!activity.accountName || stakeholder.accountName.toLowerCase() === activity.accountName.toLowerCase())
    ));
    const result = await createObjection(buildObjectionFromActivity(activity, linkedOpportunity, matchingStakeholder), dataUserId);
    setObjections((current) => [result.objection, ...current.filter((item) => item.id !== result.objection.id)]);
    setObjectionSuggestionDismissed(true);
    setMessage(result.warning || 'Objection created from capture.');
    setSaveState(result.warning ? 'error' : 'saved');
  };

  const stakeholderCandidate = lastSavedActivity ? deriveStakeholderCandidateFromCapture(lastSavedActivity) : null;
  const objectionCandidate = lastSavedActivity ? detectObjectionCandidatesFromActivity(lastSavedActivity)[0] : null;
  const alreadyHasStakeholderCandidate = stakeholderCandidate ? stakeholders.some((stakeholder) => (
    stakeholder.name.toLowerCase() === stakeholderCandidate.name.toLowerCase() &&
    stakeholder.accountName.toLowerCase() === stakeholderCandidate.accountName.toLowerCase()
  )) : false;
  const alreadyHasObjectionCandidate = Boolean(objectionCandidate && lastSavedActivity && objections.some((objection) => (
    objection.sourceActivityId === lastSavedActivity.id ||
    (objection.objectionText.toLowerCase() === objectionCandidate.objectionText.toLowerCase() &&
      objection.accountName.toLowerCase() === (lastSavedActivity.linkedAccountName || lastSavedActivity.accountName).toLowerCase())
  )));

  return (
    <div className="flex w-full max-w-none flex-col gap-5 px-4 py-5 sm:px-5 lg:px-6">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Daily Capture</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-navy">What happened today?</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
            Capture sales activity in natural language. Memoire classifies it locally into structured activity records.
          </p>
        </div>
        <DataModePill
          compact
          isLoading={authLoading}
          isAuthenticated={isAuthenticated}
          isSupabaseConfigured={isSupabaseConfigured}
          cloudAvailable={canUseSalesActivityCloudStore(dataUserId)}
          hasSampleData={sampleDataActive}
        />
      </header>

      <section className="rounded-lg border border-gray-200 bg-white p-2 shadow-sm">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <button
            type="button"
            onClick={() => setCaptureMode('quick')}
            className={`rounded-lg px-4 py-3 text-sm font-bold ${captureMode === 'quick' ? 'bg-navy text-white' : 'bg-gray-50 text-gray-600 hover:bg-blue-50 hover:text-brand-blue'}`}
          >
            Quick Capture
          </button>
          <button
            type="button"
            onClick={() => setCaptureMode('note')}
            className={`rounded-lg px-4 py-3 text-sm font-bold ${captureMode === 'note' ? 'bg-navy text-white' : 'bg-gray-50 text-gray-600 hover:bg-blue-50 hover:text-brand-blue'}`}
          >
            Full Note + AI Assist
          </button>
          <button
            type="button"
            onClick={() => setCaptureMode('email')}
            className={`rounded-lg px-4 py-3 text-sm font-bold ${captureMode === 'email' ? 'bg-navy text-white' : 'bg-gray-50 text-gray-600 hover:bg-blue-50 hover:text-brand-blue'}`}
          >
            Paste Email / Thread
          </button>
        </div>
      </section>

      {captureMode === 'quick' && (
        <QuickCapturePanel
          form={quickForm}
          selectedTemplateId={quickTemplateId}
          saveState={saveState}
          message={message}
          onTemplateSelect={applyQuickTemplate}
          onChange={setQuickForm}
          onSave={handleQuickSave}
        />
      )}

      {captureMode === 'note' && (
      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_220px]">
          <label className="block">
            <span className="text-sm font-bold text-navy">Activity note</span>
            <textarea
              value={rawNote}
              onChange={(event) => {
                aiRequestVersion.current += 1;
                setRawNote(event.target.value);
                setStructuredDraft(null);
                setOriginalParsedDraft(null);
                setAiSuggestion(null);
                setAiState('idle');
                setParseSource('local');
                setAiMessage('');
                setSaveState('idle');
                setMessage('');
              }}
              placeholder="Example: Met the buyer today. Need to clarify the tender timeline next week."
              className="mt-2 min-h-[150px] w-full resize-y rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm leading-6 text-gray-900 outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
            />
          </label>

          <div className="space-y-4">
            <label className="block">
              <span className="text-sm font-bold text-navy">Activity date</span>
              <input
                type="date"
                value={activityDate}
                onChange={(event) => {
                  aiRequestVersion.current += 1;
                  setActivityDate(event.target.value);
                  setStructuredDraft(null);
                  setOriginalParsedDraft(null);
                  setAiSuggestion(null);
                  setAiState('idle');
                  setParseSource('local');
                }}
                className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
              />
            </label>
            <button
              type="button"
              onClick={handleSave}
              disabled={saveState === 'saving' || (aiConfigured && aiState === 'loading')}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-navy px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saveState === 'saving' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Activity
            </button>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-brand-blue" />
                <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                  {aiConfigured ? `AI default: ${aiProvider.label}` : 'Local fallback'}
                </p>
              </div>
              <p className="mt-2 text-xs leading-5 text-gray-500">
                {aiConfigured
                  ? 'AI parses Full Notes automatically. Confirm or correct every field before saving.'
                  : isAuthenticated
                    ? 'AI unavailable — using local fallback. Please review before saving.'
                    : 'AI unavailable — using local fallback. Please review before saving.'}
              </p>
              {aiConfigured && (
                <p className="mt-2 flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-800">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  AI Assist sends this note to your configured server-side AI endpoint. Do not use it for confidential customer data unless your provider is approved.
                </p>
              )}
              <button
                type="button"
                onClick={() => void runAiClassification()}
                disabled={!aiConfigured || aiState === 'loading' || rawNote.trim().length < 8}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full border border-blue-100 bg-white px-3 py-2 text-xs font-bold text-brand-blue disabled:cursor-not-allowed disabled:opacity-50"
              >
                {aiState === 'loading' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {aiState === 'loading' ? 'AI parsing...' : aiState === 'ready' ? 'Re-run AI parse' : 'Try AI parse'}
              </button>
            </div>
            {message && (
              <p className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                saveState === 'saved' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
              }`}>
                {message}
              </p>
            )}
            {aiMessage && (
              <p className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                aiState === 'ready' ? 'bg-blue-50 text-blue-700' : aiState === 'error' ? 'bg-amber-50 text-amber-700' : 'bg-gray-50 text-gray-600'
              }`}>
                {aiMessage}
              </p>
            )}
          </div>
        </div>

        {preview && (
          <div className="mt-5 rounded-lg border border-blue-100 bg-blue-50/60 p-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-brand-blue">Confirm and correct</p>
                <p className="mt-1 text-xs text-blue-800">This reviewed structured draft is exactly what Save Activity will store.</p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs font-bold">
                <span className={`rounded-full px-2.5 py-1 ${parseSource === 'ai' ? 'bg-violet-100 text-violet-700' : 'bg-amber-100 text-amber-700'}`}>
                  {parseSource === 'ai' ? 'AI parsed' : 'Local fallback preview'}
                </span>
                {needsConfirmation && <span className="rounded-full bg-white px-2.5 py-1 text-amber-700 ring-1 ring-amber-200">Needs confirmation</span>}
              </div>
            </div>
            <StructuredPreviewEditor preview={preview} parseSource={parseSource} onChange={updateDraft} />
            {opportunities.length > 0 && (
              <PreviewOpportunitySuggestions preview={previewToRecord(preview)} opportunities={opportunities} />
            )}
          </div>
        )}
      </section>
      )}

      {captureMode === 'email' && (
      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-blue-100 bg-blue-50/60 p-3">
          <Mail className="mt-0.5 h-4 w-4 shrink-0 text-brand-blue" />
          <div>
            <p className="text-sm font-bold text-blue-950">Paste Email / Thread</p>
            <p className="mt-1 text-xs leading-5 text-blue-800">
              Memoire keeps source metadata, parses only a safe excerpt, and routes this through the same AI-first confirm-and-correct flow. Calendar ingestion coming later; no Gmail, Calendar, Zalo, or CRM sync is added here.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_260px]">
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="text-sm font-bold text-navy">Subject optional</span>
                <input
                  type="text"
                  value={emailForm.subject}
                  onChange={(event) => updateEmailForm({ subject: event.target.value })}
                  placeholder="e.g. Q2 renewal quote"
                  className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
                />
              </label>
              <label className="block">
                <span className="text-sm font-bold text-navy">Sender optional</span>
                <input
                  type="text"
                  value={emailForm.sender}
                  onChange={(event) => updateEmailForm({ sender: event.target.value })}
                  placeholder="e.g. Jane Buyer <jane@example.com>"
                  className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
                />
              </label>
              <label className="block">
                <span className="text-sm font-bold text-navy">Recipients optional</span>
                <input
                  type="text"
                  value={emailForm.recipients}
                  onChange={(event) => updateEmailForm({ recipients: event.target.value })}
                  placeholder="To / Cc copied from thread"
                  className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
                />
              </label>
              <label className="block">
                <span className="text-sm font-bold text-navy">Source date optional</span>
                <input
                  type="date"
                  value={emailForm.sourceDate}
                  onChange={(event) => {
                    updateEmailForm({ sourceDate: event.target.value });
                    if (sanitizeBusinessDate(event.target.value)) setActivityDate(event.target.value);
                  }}
                  className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
                />
              </label>
              <label className="block">
                <span className="text-sm font-bold text-navy">Account hint optional</span>
                <input
                  type="text"
                  value={emailForm.accountHint}
                  onChange={(event) => updateEmailForm({ accountHint: event.target.value })}
                  placeholder="Only if the thread is ambiguous"
                  className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
                />
              </label>
              <label className="block">
                <span className="text-sm font-bold text-navy">Opportunity hint optional</span>
                <input
                  type="text"
                  value={emailForm.opportunityHint}
                  onChange={(event) => updateEmailForm({ opportunityHint: event.target.value })}
                  placeholder="Existing deal/project only"
                  className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
                />
              </label>
            </div>
            <label className="block">
              <span className="text-sm font-bold text-navy">Email/thread body</span>
              <textarea
                value={emailForm.body}
                onChange={(event) => updateEmailForm({ body: event.target.value })}
                placeholder="Paste the email or copied thread here. Memoire will extract account, contacts, next action, due date, timeline, risk, buying signal, and commercial evidence without inventing opportunity names."
                className="mt-2 min-h-[190px] w-full resize-y rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm leading-6 text-gray-900 outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
              />
            </label>
          </div>

          <div className="space-y-4">
            <label className="block">
              <span className="text-sm font-bold text-navy">Source type</span>
              <select
                value={emailForm.sourceType}
                onChange={(event) => updateEmailForm({ sourceType: event.target.value as EmailThreadCaptureForm['sourceType'] })}
                className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
              >
                <option value="pasted-email">Pasted email</option>
                <option value="pasted-thread">Pasted thread</option>
              </select>
            </label>
            <button
              type="button"
              onClick={handleSave}
              disabled={saveState === 'saving' || (aiConfigured && aiState === 'loading')}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-navy px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saveState === 'saving' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Reviewed Evidence
            </button>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-brand-blue" />
                <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                  {aiConfigured ? `AI default: ${aiProvider.label}` : 'Local fallback'}
                </p>
              </div>
              <p className="mt-2 text-xs leading-5 text-gray-500">
                {aiConfigured
                  ? 'AI parses pasted emails by default. Confirm or correct every field before saving.'
                  : 'AI unavailable — using local fallback. Please review before saving.'}
              </p>
              <button
                type="button"
                onClick={() => void runAiClassification()}
                disabled={!aiConfigured || aiState === 'loading' || activeCaptureText.trim().length < 8}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full border border-blue-100 bg-white px-3 py-2 text-xs font-bold text-brand-blue disabled:cursor-not-allowed disabled:opacity-50"
              >
                {aiState === 'loading' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {aiState === 'loading' ? 'AI parsing...' : aiState === 'ready' ? 'Re-run AI parse' : 'Try AI parse'}
              </button>
            </div>
            <div className="rounded-lg border border-amber-100 bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-800">
              Long thread guard: saved cards use structured evidence plus source excerpt/hash, not the full raw thread.
            </div>
            {message && (
              <p className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                saveState === 'saved' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
              }`}>
                {message}
              </p>
            )}
            {aiMessage && (
              <p className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                aiState === 'ready' ? 'bg-blue-50 text-blue-700' : aiState === 'error' ? 'bg-amber-50 text-amber-700' : 'bg-gray-50 text-gray-600'
              }`}>
                {aiMessage}
              </p>
            )}
          </div>
        </div>

        {preview && (
          <div className="mt-5 rounded-lg border border-blue-100 bg-blue-50/60 p-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-brand-blue">Confirm and correct</p>
                <p className="mt-1 text-xs text-blue-800">This reviewed structured draft is exactly what Save Reviewed Evidence will store.</p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs font-bold">
                <span className={`rounded-full px-2.5 py-1 ${parseSource === 'ai' ? 'bg-violet-100 text-violet-700' : 'bg-amber-100 text-amber-700'}`}>
                  {parseSource === 'ai' ? 'AI parsed' : 'Local fallback preview'}
                </span>
                <span className="rounded-full bg-white px-2.5 py-1 text-blue-700 ring-1 ring-blue-200">{emailSourceItem?.sourceLabel || 'Source aware'}</span>
                {needsConfirmation && <span className="rounded-full bg-white px-2.5 py-1 text-amber-700 ring-1 ring-amber-200">Needs confirmation</span>}
              </div>
            </div>
            <StructuredPreviewEditor preview={preview} parseSource={parseSource} onChange={updateDraft} />
            {opportunities.length > 0 && (
              <PreviewOpportunitySuggestions preview={previewToRecord(preview)} opportunities={opportunities} />
            )}
          </div>
        )}
      </section>
      )}

      {lastSavedActivity && (
        <ActivityOpportunityLinkPanel
          activity={lastSavedActivity}
          opportunities={opportunities}
          onLink={(opportunity, applyUpdates, updateSuggestion) => handleLinkActivity(lastSavedActivity, opportunity, applyUpdates, updateSuggestion)}
          onIgnore={() => handleIgnoreActivityLink(lastSavedActivity)}
          onUnlink={() => handleUnlinkActivity(lastSavedActivity)}
        />
      )}

      {stakeholderCandidate && !alreadyHasStakeholderCandidate && !stakeholderSuggestionDismissed && (
        <section className="rounded-lg border border-blue-100 bg-blue-50/70 p-4 shadow-sm">
          <p className="text-sm font-bold text-blue-950">Create stakeholder from {stakeholderCandidate.name}?</p>
          <p className="mt-1 text-sm leading-6 text-blue-800">
            Memoire detected this person in the capture and can add them to {stakeholderCandidate.accountName || 'this account'} for stakeholder mapping.
            Role starts as Unknown — Memoire will not auto-assign Champion or Economic Buyer unless explicit evidence is confirmed.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={createStakeholderFromLastActivity} className="rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">
              Create stakeholder
            </button>
            <button type="button" onClick={() => setStakeholderSuggestionDismissed(true)} className="rounded-full border border-blue-200 bg-white px-4 py-2 text-sm font-bold text-blue-800">
              Ignore
            </button>
          </div>
        </section>
      )}

      {objectionCandidate && !alreadyHasObjectionCandidate && !objectionSuggestionDismissed && (
        <section className="rounded-lg border border-amber-100 bg-amber-50/80 p-4 shadow-sm">
          <p className="text-sm font-bold text-amber-950">Create objection from this activity?</p>
          <p className="mt-1 text-sm leading-6 text-amber-800">
            Memoire detected {objectionCandidate.objectionType.toLowerCase()} risk: {objectionCandidate.objectionText}
          </p>
          <p className="mt-1 text-xs font-semibold text-amber-700">Reason: {objectionCandidate.reason}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={createObjectionFromLastActivity} className="rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">
              Create objection
            </button>
            <button type="button" onClick={() => setObjectionSuggestionDismissed(true)} className="rounded-full border border-amber-200 bg-white px-4 py-2 text-sm font-bold text-amber-800">
              Ignore
            </button>
          </div>
        </section>
      )}

      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-navy">Capture Learning Memory</h2>
            <p className="mt-1 text-sm text-gray-500">Local suggestions learned from fields you corrected before saving.</p>
          </div>
          {(captureCorrections.length > 0 || accountAliases.length > 0) && (
            <button
              type="button"
              onClick={() => {
                clearLocalCaptureCorrectionMemory(user?.id);
                setCaptureCorrections([]);
                setAccountAliases([]);
              }}
              className="rounded-full border border-red-200 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-50"
            >
              Clear all local memory
            </button>
          )}
        </div>

        <div className="mt-4 grid gap-5 lg:grid-cols-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Account aliases</p>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input value={newAlias} onChange={(event) => setNewAlias(event.target.value)} placeholder="Alias, e.g. PME" className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              <input value={newAliasAccount} onChange={(event) => setNewAliasAccount(event.target.value)} placeholder="Canonical account" className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              <button type="button" onClick={handleAddAlias} disabled={!newAlias.trim() || !newAliasAccount.trim()} className="rounded-full bg-navy px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Add</button>
            </div>
            <div className="mt-3 space-y-2">
              {accountAliases.length === 0 ? <p className="text-sm text-gray-500">No aliases learned yet.</p> : accountAliases.slice(0, 10).map((alias) => (
                <div key={alias.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm">
                  <span><strong>{alias.alias}</strong> → {alias.canonicalAccountName}</span>
                  <button type="button" onClick={() => setAccountAliases(deleteCaptureAccountAlias(alias.id, user?.id))} className="text-xs font-bold text-red-700">Delete</button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Recent corrections</p>
            <div className="mt-2 space-y-2">
              {captureCorrections.length === 0 ? <p className="text-sm text-gray-500">No corrections recorded yet.</p> : captureCorrections.slice(0, 10).map((correction) => (
                <div key={correction.id} className="rounded-lg bg-gray-50 px-3 py-2 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <p><strong>{correction.fieldName}</strong>: {correction.originalValue || 'Blank'} → {correction.correctedValue || 'Blank'}</p>
                    <button type="button" onClick={() => setCaptureCorrections(deleteCaptureCorrection(correction.id, user?.id))} className="shrink-0 text-xs font-bold text-red-700">Delete</button>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">{correction.source} · {new Date(correction.createdAt).toLocaleDateString()}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-navy">Recent activities</h2>
            <p className="mt-1 text-sm text-gray-500">Your latest structured daily sales captures.</p>
          </div>
          <button
            type="button"
            onClick={refreshActivities}
            className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50"
          >
            Refresh
          </button>
        </div>

        {loadingActivities ? (
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-6 text-sm font-semibold text-gray-500">
            Loading activities...
          </div>
        ) : activities.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-8 text-center">
            <Clipboard className="mx-auto h-6 w-6 text-gray-400" />
            <p className="mt-3 text-sm font-bold text-navy">No activities captured yet.</p>
            <p className="mt-1 text-sm text-gray-500">
              Try: "Met Orion Pharma today. Need to clarify tender timeline next week."
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {activities.map((activity) => (
              <ActivityCard
                key={activity.id}
                activity={activity}
                copied={copiedId === activity.id}
                onCopy={() => handleCopy(activity)}
                onDelete={() => handleDelete(activity)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function QuickCapturePanel({
  form,
  selectedTemplateId,
  saveState,
  message,
  onTemplateSelect,
  onChange,
  onSave,
}: {
  form: QuickCaptureForm;
  selectedTemplateId: string;
  saveState: SaveState;
  message: string;
  onTemplateSelect: (templateId: string) => void;
  onChange: (form: QuickCaptureForm) => void;
  onSave: () => void;
}) {
  const template = quickTemplates.find((item) => item.id === selectedTemplateId) || quickTemplates[0];
  const update = <Key extends keyof QuickCaptureForm>(key: Key, value: QuickCaptureForm[Key]) => {
    onChange({ ...form, [key]: value });
  };

  return (
    <section className="rounded-lg border border-emerald-100 bg-emerald-50/70 p-5 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <NotebookPen className="h-4 w-4 text-emerald-700" />
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Quick Capture</p>
          </div>
          <h2 className="mt-2 text-xl font-bold text-navy">30-second sales update</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-emerald-900/75">
            Use this immediately after a meeting, dealer call, proposal, objection, or procurement update. It saves as a normal sales activity.
          </p>
        </div>
        <button
          type="button"
          onClick={onSave}
          disabled={saveState === 'saving'}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-navy px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saveState === 'saving' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Quick Capture
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {quickTemplates.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onTemplateSelect(item.id)}
            className={`rounded-full border px-3 py-1.5 text-xs font-bold ${
              selectedTemplateId === item.id
                ? 'border-emerald-600 bg-emerald-600 text-white'
                : 'border-emerald-200 bg-white text-emerald-800 hover:bg-emerald-50'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
        <QuickInput label="Account" value={form.accountName} placeholder="Your customer's company" onChange={(value) => update('accountName', value)} />
        <QuickInput label="Opportunity optional" value={form.opportunityName} placeholder="Deal or project name" onChange={(value) => update('opportunityName', value)} />
        <QuickSelect label="Interaction type" value={form.interactionType} options={quickInteractionTypes} onChange={(value) => update('interactionType', value as QuickInteractionType)} />
        <QuickSelect label="Signal type" value={form.signalType} options={quickSignalTypes} onChange={(value) => update('signalType', value as QuickSignalType)} />
        <QuickInput label="Activity date" type="date" value={form.activityDate} placeholder="" onChange={(value) => update('activityDate', value)} />
        <QuickInput label="Due date optional" type="date" value={form.dueDate} placeholder="" onChange={(value) => update('dueDate', value)} />
        <QuickTextArea
          label="What happened?"
          value={form.whatHappened}
          placeholder={template.whatHappenedPrompt}
          onChange={(value) => update('whatHappened', value)}
        />
        <QuickTextArea
          label="Next action"
          value={form.nextAction}
          placeholder={template.nextActionPrompt}
          onChange={(value) => update('nextAction', value)}
        />
      </div>

      {message && (
        <p className={`mt-4 rounded-lg px-3 py-2 text-sm font-semibold ${
          saveState === 'saved' ? 'bg-white text-emerald-700 ring-1 ring-emerald-100' : 'bg-white text-amber-700 ring-1 ring-amber-100'
        }`}>
          {message}
        </p>
      )}
    </section>
  );
}

function QuickInput({
  label,
  value,
  placeholder,
  type = 'text',
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  type?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block rounded-lg bg-white px-3 py-2 ring-1 ring-emerald-100">
      <span className="text-xs font-bold uppercase tracking-wide text-emerald-700">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full bg-transparent text-sm font-semibold text-emerald-950 outline-none placeholder:text-emerald-300"
      />
    </label>
  );
}

function QuickSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block rounded-lg bg-white px-3 py-2 ring-1 ring-emerald-100">
      <span className="text-xs font-bold uppercase tracking-wide text-emerald-700">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full bg-transparent text-sm font-semibold text-emerald-950 outline-none"
      >
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function QuickTextArea({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block rounded-lg bg-white px-3 py-2 ring-1 ring-emerald-100 md:col-span-2">
      <span className="text-xs font-bold uppercase tracking-wide text-emerald-700">{label}</span>
      <textarea
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        className="mt-1 w-full resize-y bg-transparent text-sm font-semibold leading-6 text-emerald-950 outline-none placeholder:text-emerald-300"
      />
    </label>
  );
}

function StructuredPreviewEditor({
  preview,
  parseSource,
  onChange,
}: {
  preview: ClassifiedSalesActivity;
  parseSource: ParseSource;
  onChange: <Key extends keyof ClassifiedSalesActivity>(key: Key, value: ClassifiedSalesActivity[Key]) => void;
}) {
  return (
    <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
      <div className="rounded-lg bg-white px-3 py-2 ring-1 ring-blue-100">
        <span className="text-xs font-bold uppercase tracking-wide text-blue-500">Source</span>
        <p className="mt-1 text-sm font-semibold text-blue-950">{parseSource === 'ai' ? 'AI parsed' : 'Local fallback'}</p>
      </div>
      <label className="block rounded-lg bg-white px-3 py-2 ring-1 ring-blue-100">
        <span className="text-xs font-bold uppercase tracking-wide text-blue-500">Type</span>
        <select
          value={preview.activityType}
          onChange={(event) => onChange('activityType', event.target.value as SalesActivityType)}
          className="mt-1 w-full bg-transparent text-sm font-semibold text-blue-950 outline-none"
        >
          {activityTypes.map((type) => <option key={type} value={type}>{type}</option>)}
        </select>
      </label>
      <PreviewInput label="Account" value={preview.accountName} placeholder="Not captured" onChange={(value) => onChange('accountName', value)} />
      <PreviewInput label="Opportunity" value={preview.opportunityName} placeholder="Not captured" onChange={(value) => onChange('opportunityName', value)} />
      <PreviewInput label="Contact" value={preview.contactName || ''} placeholder="Not captured" onChange={(value) => onChange('contactName', value)} />
      <PreviewInput label="Stakeholder" value={preview.stakeholderName || ''} placeholder="Not captured" onChange={(value) => onChange('stakeholderName', value)} />
      <PreviewInput label="Stakeholder role" value={preview.stakeholderRole || ''} placeholder="Optional role" onChange={(value) => onChange('stakeholderRole', value)} />
      <PreviewInput label="Due date" value={preview.dueDate} placeholder="YYYY-MM-DD" onChange={(value) => onChange('dueDate', value)} />
      <PreviewTextArea label="Summary" value={preview.summary} onChange={(value) => onChange('summary', value)} />
      <PreviewTextArea label="Next action" value={preview.nextAction} onChange={(value) => onChange('nextAction', value)} />
      {preview.nextActions && preview.nextActions.length > 0 && (
        <div className="rounded-lg bg-white px-3 py-2 ring-1 ring-blue-100 md:col-span-2">
          <span className="text-xs font-bold uppercase tracking-wide text-blue-500">Next actions detected</span>
          <div className="mt-2 space-y-2">
            {preview.nextActions.map((action, index) => (
              <div key={`${action.title}-${index}`} className="rounded-md bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-950">
                {index + 1}. {action.title}
                {action.dueDate ? <span className="text-blue-700"> | Due {formatSafeBusinessDate(action.dueDate)}</span> : null}
              </div>
            ))}
          </div>
        </div>
      )}
      <PreviewInput
        label="Competitors"
        value={(preview.competitors || []).join(', ')}
        placeholder="Incumbent Vendor"
        onChange={(value) => onChange('competitors', parseList(value))}
      />
      <PreviewInput
        label="Buying signal"
        value={(preview.buyingSignals || []).join(', ')}
        placeholder="Budget approved"
        onChange={(value) => onChange('buyingSignals', parseList(value))}
      />
      <PreviewInput
        label="Risk / objection"
        value={(preview.risks || []).join(', ')}
        placeholder="Competitor still active"
        onChange={(value) => onChange('risks', parseList(value))}
      />
      <PreviewInput
        label="Timeline signal"
        value={(preview.timelineSignals || []).join(', ')}
        placeholder="Next quarter"
        onChange={(value) => onChange('timelineSignals', parseList(value))}
      />
      <PreviewInput
        label="Tags"
        value={preview.tags.join(', ')}
        placeholder="follow-up, risk-signal"
        onChange={(value) => onChange('tags', parseTags(value))}
      />
    </div>
  );
}

function PreviewInput({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block rounded-lg bg-white px-3 py-2 ring-1 ring-blue-100">
      <span className="text-xs font-bold uppercase tracking-wide text-blue-500">{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full bg-transparent text-sm font-semibold text-blue-950 outline-none placeholder:text-blue-300"
      />
    </label>
  );
}

function PreviewTextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block rounded-lg bg-white px-3 py-2 ring-1 ring-blue-100 md:col-span-2">
      <span className="text-xs font-bold uppercase tracking-wide text-blue-500">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={2}
        className="mt-1 w-full resize-y bg-transparent text-sm font-semibold leading-6 text-blue-950 outline-none"
      />
    </label>
  );
}

function ActivityCard({
  activity,
  copied,
  onCopy,
  onDelete,
}: {
  activity: SalesActivityRecord;
  copied: boolean;
  onCopy: () => void;
  onDelete: () => void;
}) {
  return (
    <article className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-brand-blue">
              {activity.activityType}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-50 px-2.5 py-1 text-xs font-bold text-gray-600">
              <CalendarDays className="h-3.5 w-3.5" />
              {formatSafeBusinessDate(activity.activityDate)}
            </span>
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${
              activity.storageMode === 'cloud' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
            }`}>
              {activity.storageMode === 'cloud' ? 'Cloud' : 'Local'}
            </span>
          </div>
          <h3 className="mt-3 text-base font-bold text-navy">{activity.summary}</h3>
          <p className="mt-2 text-xs font-bold text-gray-500">
            Link: {activity.linkStatus === 'Linked'
              ? `${activity.linkedAccountName || 'Account'} / ${activity.linkedOpportunityName || 'Opportunity'}`
              : activity.linkStatus}
          </p>
          <div className="mt-3 grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
            <ActivityFact label="Account" value={activity.accountName || 'Not captured'} />
            <ActivityFact label="Opportunity" value={activity.opportunityName || 'Not captured'} />
            <ActivityFact label="Contact" value={activity.contactName || activity.stakeholderName || 'Not captured'} />
            <ActivityFact label="Next action" value={activity.nextAction || 'Not captured'} />
            <ActivityFact label="Due date" value={formatSafeBusinessDate(activity.dueDate)} />
          </div>
          <ActivitySignals activity={activity} />
          {activity.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {activity.tags.map((tag) => (
                <span key={tag} className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-600">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={onCopy}
            className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50"
          >
            <Copy className="h-3.5 w-3.5" />
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex items-center gap-1.5 rounded-full border border-red-100 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        </div>
      </div>
    </article>
  );
}

function PreviewOpportunitySuggestions({ preview, opportunities }: { preview: SalesActivityRecord; opportunities: CrmLiteOpportunity[] }) {
  const suggestions = suggestOpportunityLinks(preview, opportunities);
  if (suggestions.length === 0) return null;

  return (
    <div className="mt-4 rounded-lg border border-blue-100 bg-white p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-brand-blue">Likely opportunity links</p>
      <div className="mt-2 space-y-2">
        {suggestions.slice(0, 3).map((suggestion) => (
          <div key={suggestion.opportunity.id} className="rounded-lg bg-blue-50/70 px-3 py-2 text-sm">
            <p className="font-bold text-blue-950">{suggestion.opportunity.accountName} / {suggestion.opportunity.opportunityName}</p>
            <p className="mt-1 text-xs font-semibold text-blue-700">{suggestion.confidence} confidence | {suggestion.reason}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function previewToRecord(preview: ReturnType<typeof classifySalesActivity>): SalesActivityRecord {
  return {
    ...preview,
    id: 'preview',
    linkedOpportunityId: '',
    linkedOpportunityName: '',
    linkedAccountName: '',
    linkStatus: 'Unlinked',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    storageMode: 'local',
  };
}

function aiSuggestionToClassified(
  suggestion: CaptureAiSuggestion,
  rawNote: string,
  activityDate: string,
  source: ParseSource,
): ClassifiedSalesActivity {
  return {
    accountName: suggestion.accountName || '',
    opportunityName: suggestion.opportunityName || '',
    activityType: activityTypes.includes(suggestion.activityType as SalesActivityType)
      ? suggestion.activityType as SalesActivityType
      : 'Other',
    summary: suggestion.summary || rawNote.trim().slice(0, 180),
    nextAction: suggestion.nextAction || '',
    dueDate: sanitizeBusinessDate(suggestion.dueDate),
    contactName: suggestion.contactName || '',
    stakeholderName: suggestion.stakeholderName || suggestion.contactName || '',
    stakeholderRole: suggestion.stakeholderRole || '',
    competitors: suggestion.competitors || [],
    buyingSignals: suggestion.buyingSignals || [],
    risks: suggestion.risks || [],
    timelineSignals: suggestion.timelineSignals || [],
    nextActions: suggestion.nextActions || [],
    tags: normalizeTags([source === 'ai' ? 'ai-parsed' : 'local-fallback', ...suggestion.tags]),
    rawNote: rawNote.trim(),
    activityDate,
  };
}

function cloneClassifiedDraft(draft: ClassifiedSalesActivity): ClassifiedSalesActivity {
  return {
    ...draft,
    tags: [...draft.tags],
    competitors: [...(draft.competitors || [])],
    buyingSignals: [...(draft.buyingSignals || [])],
    risks: [...(draft.risks || [])],
    timelineSignals: [...(draft.timelineSignals || [])],
    nextActions: (draft.nextActions || []).map((action) => ({ ...action })),
  };
}

function parseTags(value: string) {
  return normalizeTags(value.split(','));
}

function parseList(value: string) {
  return Array.from(new Set(value.split(',').map((item) => item.trim()).filter(Boolean))).slice(0, 12);
}

function normalizeTags(tags: string[]) {
  return Array.from(new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))).slice(0, 8);
}

function ActivityFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-gray-50 px-3 py-2">
      <span className="text-xs font-bold uppercase tracking-wide text-gray-400">{label}</span>
      <p className="mt-1 font-semibold text-gray-800">{value}</p>
    </div>
  );
}

function ActivitySignals({ activity }: { activity: SalesActivityRecord }) {
  const rows = [
    { label: 'Competitors', values: activity.competitors || [] },
    { label: 'Buying signals', values: activity.buyingSignals || [] },
    { label: 'Risks', values: activity.risks || [] },
    { label: 'Timeline', values: activity.timelineSignals || [] },
  ].filter((row) => row.values.length > 0);

  if (rows.length === 0 && (!activity.nextActions || activity.nextActions.length === 0)) return null;

  return (
    <div className="mt-3 space-y-2">
      {activity.nextActions && activity.nextActions.length > 0 && (
        <div className="rounded-lg bg-gray-50 px-3 py-2">
          <span className="text-xs font-bold uppercase tracking-wide text-gray-400">Next actions</span>
          <ul className="mt-1 space-y-1 text-sm font-semibold text-gray-800">
            {activity.nextActions.map((action, index) => (
              <li key={`${action.title}-${index}`}>
                {index + 1}. {action.title}{action.dueDate ? ` | Due ${formatSafeBusinessDate(action.dueDate)}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
      {rows.map((row) => (
        <div key={row.label} className="flex flex-wrap gap-2">
          <span className="text-xs font-bold uppercase tracking-wide text-gray-400">{row.label}</span>
          {row.values.map((value) => (
            <span key={value} className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-700">
              {value}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

function formatActivitySummary(activity: SalesActivityRecord) {
  return [
    `Activity: ${activity.activityType}`,
    `Date: ${formatSafeBusinessDate(activity.activityDate)}`,
    activity.accountName ? `Account: ${activity.accountName}` : '',
    activity.opportunityName ? `Opportunity: ${activity.opportunityName}` : '',
    `Summary: ${activity.summary}`,
    activity.nextAction ? `Next action: ${activity.nextAction}` : '',
    activity.dueDate ? `Due: ${formatSafeBusinessDate(activity.dueDate)}` : '',
    activity.contactName || activity.stakeholderName ? `Contact: ${activity.contactName || activity.stakeholderName}` : '',
    activity.competitors?.length ? `Competitors: ${activity.competitors.join(', ')}` : '',
    activity.buyingSignals?.length ? `Buying signals: ${activity.buyingSignals.join(', ')}` : '',
    activity.timelineSignals?.length ? `Timeline: ${activity.timelineSignals.join(', ')}` : '',
    activity.nextActions?.length ? `Next actions:\n${activity.nextActions.map((action, index) => `${index + 1}. ${action.title}${action.dueDate ? ` (${formatSafeBusinessDate(action.dueDate)})` : ''}`).join('\n')}` : '',
    activity.tags.length > 0 ? `Tags: ${activity.tags.join(', ')}` : '',
  ].filter(Boolean).join('\n');
}

function createInitialQuickCaptureForm(searchParams: URLSearchParams): QuickCaptureForm {
  return {
    accountName: searchParams.get('account') || '',
    opportunityName: searchParams.get('opportunity') || '',
    interactionType: 'Customer meeting',
    whatHappened: '',
    nextAction: '',
    dueDate: '',
    signalType: 'No major change',
    activityDate: getQueryDate(searchParams) || todayKey(),
  };
}

function createInitialEmailThreadCaptureForm(searchParams: URLSearchParams): EmailThreadCaptureForm {
  return {
    sourceType: 'pasted-email',
    subject: '',
    sender: '',
    recipients: '',
    body: '',
    sourceDate: getQueryDate(searchParams) || '',
    accountHint: searchParams.get('account') || '',
    opportunityHint: searchParams.get('opportunity') || '',
  };
}

function withCaptureSourceMetadata(activity: ClassifiedSalesActivity, sourceItem: IngestedSourceItem | null): ClassifiedSalesActivity {
  if (!sourceItem) return activity;
  return {
    ...activity,
    sourceType: sourceItem.sourceType,
    sourceLabel: sourceItem.sourceLabel,
    sourceTimestamp: sourceItem.sourceTimestamp,
    sourceHash: sourceItem.safeHash,
    originalExcerpt: sourceItem.originalExcerpt,
    tags: mergeSourceTags(activity.tags, sourceItem),
  };
}

function mergeSourceTags(tags: string[], sourceItem: IngestedSourceItem | null) {
  if (!sourceItem) return tags;
  return Array.from(new Set([
    ...tags.filter((tag) => !tag.startsWith('source:') && !tag.startsWith('source-label:') && !tag.startsWith('source-hash:')),
    ...buildIngestionSourceTags(sourceItem),
  ]));
}

function buildQuickCaptureActivity(form: QuickCaptureForm): ClassifiedSalesActivity | null {
  const accountName = form.accountName.trim();
  const whatHappened = form.whatHappened.trim();
  const nextAction = form.nextAction.trim();
  if (!accountName || (!whatHappened && !nextAction) || !isValidBusinessDate(form.activityDate)) return null;

  const activityType = quickInteractionToActivityType(form.interactionType);
  const dueDate = sanitizeBusinessDate(form.dueDate);
  const rawNote = [
    `${form.interactionType} - ${accountName}${form.opportunityName.trim() ? ` / ${form.opportunityName.trim()}` : ''}`,
    whatHappened ? `What happened: ${whatHappened}` : '',
    nextAction ? `Next action: ${nextAction}${dueDate ? ` by ${dueDate}` : ''}` : '',
    form.signalType !== 'No major change' ? `Signal: ${form.signalType}` : '',
  ].filter(Boolean).join('\n');

  return {
    accountName,
    opportunityName: form.opportunityName.trim(),
    contactName: '',
    stakeholderName: '',
    stakeholderRole: '',
    competitors: form.signalType === 'Competitor signal' ? ['Competitor signal captured'] : [],
    buyingSignals: form.signalType === 'Buying signal' ? ['Buying signal captured'] : [],
    risks: ['Risk signal', 'Objection', 'Competitor signal'].includes(form.signalType) ? [form.signalType] : [],
    timelineSignals: ['Timeline update', 'Procurement signal'].includes(form.signalType) ? [form.signalType] : [],
    nextActions: nextAction ? [{
      title: nextAction,
      ...(dueDate ? { dueDate } : {}),
      sourceText: nextAction,
    }] : [],
    activityType,
    summary: whatHappened || nextAction,
    nextAction,
    dueDate,
    tags: normalizeTags(['quick-capture', form.interactionType, form.signalType]),
    rawNote,
    activityDate: sanitizeBusinessDate(form.activityDate),
    sourceType: 'quick-capture',
    sourceLabel: `Quick capture: ${form.interactionType}`,
    sourceTimestamp: sanitizeBusinessDate(form.activityDate),
    sourceHash: '',
    originalExcerpt: rawNote.slice(0, 600),
  };
}

function quickInteractionToActivityType(interactionType: QuickInteractionType): SalesActivityType {
  if (interactionType === 'Proposal sent') return 'Quote / proposal';
  if (interactionType === 'Objection received') return 'Objection handling';
  if (interactionType === 'Procurement update') return 'Tender / procurement';
  if (interactionType === 'Technical discussion') return 'Demo / technical discussion';
  if (interactionType === 'Internal review') return 'Internal coordination';
  if (interactionType === 'Follow-up') return 'Follow-up';
  return 'Customer meeting';
}

function getQueryDate(searchParams: URLSearchParams) {
  const value = searchParams.get('date') || '';
  return sanitizeBusinessDate(value);
}

function todayKey() {
  return todayDateKey();
}
