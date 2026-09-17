import { matchCommands } from '../../utils/commandRegistry';
import { selectQualifiedPipeline, disqualifiedLeadIds, isLeadStage } from '../../utils/leadIdentity';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ExternalLink, Lock, Sparkles } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { DEMO_USER_ID } from '../../lib/demoMode';
import type { Account, AskMemoireAnswer, AskMemoireAnswerCard, AskMemoireContext, Interaction, MemoryChange, Objection, Opportunity, SalesAction, SalesPattern } from '../../types/v31';
import { actionFixPresets, advertisedQuestions, answerFromMemory, attentionEmptyAnswers, attentionFocusFor, attentionHeadings, attentionWhyLabels, type AttentionFocus, buildAskMemoireContext, hasSingleSubject, isAttentionQuestion, isPatternQuestion, isWhatChangedQuestion, presetsForScope } from './askMemoireContext';
import { detectBrokenLoops, type BrokenLoop } from './brokenLoops';
import { calculateMemoryHealth } from './memoryHealth';
import { buildWhatChangedDigest, formatMemoryChangeSeverity } from './whatChangedDigest';
import { detectSalesPatterns, salesPatternSeverityLabel } from './salesPatternDetector';
import { RouteLoadingFallback } from './RouteLoadingFallback';
import { useSlowLoadingFallback } from './useSlowLoadingFallback';
import { hasLocalSampleData } from '../../utils/dataMode';
import { getCachedSalesWorkspaceData, loadSalesWorkspaceData, type SalesWorkspaceData } from '../../services/workspaceData';
import { adaptWorkspaceToV31 } from './workspaceAdapter';
import { buildFollowUpImpact } from '../../utils/followUpImpact';
import { buildObjectionPlaybook } from '../../utils/objectionPlaybook';
import { buildForecastCalibration } from '../../utils/forecastCalibration';
import {
  answerFromCommitments,
  answerFromCustomerSignals,
  answerFromDealPosition,
  answerFromFollowUpImpact,
  answerFromForecastCalibration,
  answerFromInitiativeReview,
  answerFromAwaitingCustomer,
  answerFromRecordFind,
  answerFromLeadCommand,
  isLeadNavigationCommand,
  findRecords,
  namedAccountIn,
  answerFromMoneyFlow,
  answerFromOwnObligations,
  answerFromObjectionPlaybook,
  answerFromRetentionSignals,
  answerFromWeekRecap,
  detectInsightQuestion,
  resolveDealForQuestion,
} from './askMemoireInsightAnswers';
import { buildMoneyFlow } from '../../utils/moneyFlow';
import { buildOrderBook } from '../../utils/orderToCash';
import { buildOwnObligations } from '../../utils/ownObligations';
import { buildRetentionSignals } from '../../utils/retentionSignals';
import { buildCommitmentLedger } from '../../utils/weeklyBusinessReview';
import { buildInitiativeReview } from '../../utils/initiativeReview';
import { buildCustomerSignalDigest } from '../../utils/customerSignals';
import { buildCommercialJourneySnapshot } from '../../utils/commercialJourney';
import { todayDateKey } from '../../utils/safeDate';
import { PageContainer, PageHeader } from '../../components/layout/PageFrame';
import { TopBar } from '../../components/layout/TopBarSlot';
import { MicroLabel, Panel, Segmented, StatusChip } from '../../components/ui/daylight';
import { delay, ghostPillClass } from '../../components/ui/daylightStyles';
import { formatCount } from '../../utils/numberFormat';
import { useEntitlement } from '../../hooks/useEntitlement';

/** What counts as an objection in a stuck-deal or context-health reason. */
const OBJECTION_TEXT = /objection|blocker|blocked|concern/i;

/** How far either side of today a promise counts as this week's. */
const COMMITMENT_WINDOW_DAYS = 7;

export function AskMemoirePage() {
  const { user } = useAuth();
  const { canSearch } = useEntitlement();
  const [searchParams] = useSearchParams();
  const [scope, setScope] = useState<AskMemoireContext['scope']>((searchParams.get('scope') as AskMemoireContext['scope']) || 'all');
  const [selectedAccountId, setSelectedAccountId] = useState(searchParams.get('accountId') || '');
  const [selectedOpportunityId, setSelectedOpportunityId] = useState(searchParams.get('opportunityId') || '');
  // The composer starts empty. It used to open holding "What should I do next?",
  // which made the box read as already asked; the suggestions beside it now do
  // that job without putting words in the operator's mouth.
  const [question, setQuestion] = useState(() => searchParams.get('question')?.trim() || '');
  /** The question the answer on screen belongs to - drawn as the bubble above it. */
  const [askedQuestion, setAskedQuestion] = useState('');
  /**
   * What was asked on this visit, newest first. Held in memory only: a question
   * names customers, and a list of them written to this browser would outlive
   * the session and be readable by the next person to sign in here.
   */
  const [askedThisVisit, setAskedThisVisit] = useState<string[]>([]);
  const [urlQuestionConsumed, setUrlQuestionConsumed] = useState(false);
  const [answer, setAnswer] = useState<AskMemoireAnswer | null>(null);
  /**
   * The answer renders below the question form and the preset list, which on a
   * laptop puts it off the bottom of the screen. Pressing Ask therefore looked
   * like pressing a dead button: the page did not move, and the thing that had
   * changed was somewhere the operator could not see.
   */
  const answerSectionRef = useRef<HTMLElement>(null);
  /** Set when a question is answered, consumed by the effect that scrolls to it. */
  const pendingScrollRef = useRef(false);
  const [loading, setLoading] = useState(false);
  const [contextLoading, setContextLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState('Every answer is computed on this device from your own records.');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [actions, setActions] = useState<SalesAction[]>([]);
  const [objections, setObjections] = useState<Objection[]>([]);
  const [rawWorkspace, setRawWorkspace] = useState<SalesWorkspaceData | null>(null);
  const slowContextLoading = useSlowLoadingFallback(contextLoading);

  const loadMemory = useCallback(async () => {
    const sampleDataActive = hasLocalSampleData();
    const dataUserId = sampleDataActive ? undefined : user?.id;
    const cached = getCachedSalesWorkspaceData(dataUserId);
    if (cached) {
      // Ask answers from records that are already in memory. Blocking the whole
      // surface on a load that is about to return that same cached copy is what
      // made asking a question feel like waiting on the network.
      const cachedMemory = adaptWorkspaceToV31(cached, user?.id || DEMO_USER_ID);
      setRawWorkspace(cached);
      setAccounts(cachedMemory.accounts);
      setOpportunities(cachedMemory.opportunities);
      setInteractions(cachedMemory.interactions);
      setActions(cachedMemory.actions);
      setObjections(cachedMemory.objections);
      setContextLoading(false);
      setError(null);
      return;
    }

    setContextLoading(true);
    setError(null);

    try {
      const workspace = await loadSalesWorkspaceData(dataUserId);
      const memory = adaptWorkspaceToV31(workspace, user?.id || DEMO_USER_ID);
      setRawWorkspace(workspace);
      setAccounts(memory.accounts);
      setOpportunities(memory.opportunities);
      setInteractions(memory.interactions);
      setActions(memory.actions);
      setObjections(memory.objections);
    } catch (loadError) {
      if (import.meta.env.DEV) {
        console.debug('[AskMemoire] workspace load failed', {
          message: loadError instanceof Error ? loadError.message : 'Unknown error',
        });
      }
      setError('Memoire could not load this workspace. Your local data is still preserved.');
    } finally {
      setContextLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadMemory();
  }, [loadMemory]);

  // Scrolls to the answer once it has actually been painted, never on load.
  useEffect(() => {
    if (!pendingScrollRef.current || loading) return;
    pendingScrollRef.current = false;
    answerSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [answer, loading]);

  useEffect(() => {
    const nextScope = (searchParams.get('scope') as AskMemoireContext['scope']) || 'all';
    setScope(['all', 'account', 'opportunity'].includes(nextScope) ? nextScope : 'all');
    setSelectedAccountId(searchParams.get('accountId') || '');
    setSelectedOpportunityId(searchParams.get('opportunityId') || '');
  }, [searchParams]);

  const contextPacket = useMemo(
    () => buildAskMemoireContext({
      scope,
      accountId: selectedAccountId,
      opportunityId: selectedOpportunityId,
      accounts,
      opportunities,
      interactions,
      actions,
      objections,
    }),
    [accounts, actions, interactions, objections, opportunities, scope, selectedAccountId, selectedOpportunityId]
  );
  const presets = presetsForScope(scope);
  const contextLabel = getContextLabel(scope, selectedAccountId, selectedOpportunityId, accounts, opportunities);
  const visibleOpportunities = scope === 'account' && selectedAccountId
    ? opportunities.filter((opportunity) => opportunity.account_id === selectedAccountId)
    : opportunities;
  const scopedMemory = useMemo(() => ({
    accounts: contextPacket.includedData.accounts || [],
    opportunities: contextPacket.includedData.opportunities || [],
    interactions: contextPacket.includedData.interactions || [],
    actions: contextPacket.includedData.actions || [],
    objections: contextPacket.includedData.objections || [],
  }), [contextPacket]);
  const scopedBrokenLoops = useMemo(
    () => detectBrokenLoops({
      accounts: scopedMemory.accounts,
      opportunities: scopedMemory.opportunities,
      interactions: scopedMemory.interactions,
      actions: scopedMemory.actions,
      objections: scopedMemory.objections,
    }),
    [scopedMemory]
  );
  const scopedMemoryHealth = useMemo(() => {
    const accountHealth = scopedMemory.accounts.map((account) => calculateMemoryHealth(
      { entityType: 'account', entity: account },
      {
        contacts: [],
        opportunities: scopedMemory.opportunities,
        interactions: scopedMemory.interactions,
        actions: scopedMemory.actions,
        objections: scopedMemory.objections,
        brokenLoops: scopedBrokenLoops,
      }
    ));
    const opportunityHealth = scopedMemory.opportunities.map((opportunity) => calculateMemoryHealth(
      { entityType: 'opportunity', entity: opportunity },
      {
        accounts: scopedMemory.accounts,
        contacts: [],
        opportunities: scopedMemory.opportunities,
        interactions: scopedMemory.interactions,
        actions: scopedMemory.actions,
        objections: scopedMemory.objections,
        brokenLoops: scopedBrokenLoops,
      }
    ));
    return [...accountHealth, ...opportunityHealth];
  }, [scopedBrokenLoops, scopedMemory]);
  const whatChanged = useMemo(
    () => buildWhatChangedDigest({
      accounts: scopedMemory.accounts,
      opportunities: scopedMemory.opportunities,
      interactions: scopedMemory.interactions,
      actions: scopedMemory.actions,
      objections: scopedMemory.objections,
      brokenLoops: scopedBrokenLoops,
      memoryHealth: scopedMemoryHealth,
      limit: 5,
    }),
    [scopedBrokenLoops, scopedMemory, scopedMemoryHealth]
  );
  const salesPatterns = useMemo(
    () => detectSalesPatterns({
      accounts: scopedMemory.accounts,
      opportunities: scopedMemory.opportunities,
      interactions: scopedMemory.interactions,
      actions: scopedMemory.actions,
      objections: scopedMemory.objections,
    }),
    [scopedMemory]
  );

  const ask = useCallback(async (nextQuestion = question) => {
    // Every preset button and the form all funnel through here, so this is the
    // only place the subscription has to be checked.
    if (!canSearch) {
      setError('Search & Insights is part of a subscription. Your trial has ended, but everything you captured is still here to read and export - subscribe in Settings to ask again.');
      return;
    }
    if (!nextQuestion.trim()) {
      setError('Ask a question or choose a preset first.');
      return;
    }
    if (scope === 'account' && !selectedAccountId) {
      setError('Missing context - select an account so Memoire can answer with better context.');
      return;
    }
    if (scope === 'opportunity' && !selectedOpportunityId) {
      setError('Missing context - select an opportunity so Memoire can answer with better context.');
      return;
    }

    setAskedQuestion(nextQuestion);
    setQuestion('');
    setAskedThisVisit((current) => [nextQuestion, ...current.filter((item) => item !== nextQuestion)].slice(0, 6));
    setLoading(true);
    setError(null);
    setStatusMessage('');

    try {
      const command = matchCommands(nextQuestion).find(isLeadNavigationCommand);
      if (command) {
        setStatusMessage('Counted from your own records, on this device.');
        setAnswer(answerFromLeadCommand(command, rawWorkspace));
        return;
      }
      const fallbackAnswer = withAnswerCards(answerFromMemory(nextQuestion, contextPacket), nextQuestion, contextPacket);
      if (scope === 'all' && isAttentionQuestion(nextQuestion)) {
        setStatusMessage('Answered with local rule-based deal memory.');
        setAnswer(answerFromAttention({
          focus: attentionFocusFor(nextQuestion),
          objections: scopedMemory.objections,
          context: contextPacket,
          accounts: scopedMemory.accounts,
          opportunities: scopedMemory.opportunities.filter((opportunity) => !isLeadStage(opportunity.stage)),
          actions: scopedMemory.actions,
          brokenLoops: scopedBrokenLoops,
          memoryHealth: scopedMemoryHealth,
        }));
        return;
      }
      if (isWhatChangedQuestion(nextQuestion)) {
        setStatusMessage('Answered with local rule-based change detection.');
        setAnswer(answerFromChanges(
          whatChanged,
          contextPacket,
          rawWorkspace ? namedAccountIn(nextQuestion, rawWorkspace.opportunities) ?? undefined : undefined,
        ));
        return;
      }
      if (isPatternQuestion(nextQuestion)) {
        setStatusMessage('Answered with local rule-based pattern detection.');
        setAnswer(answerFromPatterns(salesPatterns, contextPacket));
        return;
      }
      // Questions about the seller's own measured history are deterministic:
      // answer from the computed data layers, never from the AI endpoint.
      const insightKind = rawWorkspace ? detectInsightQuestion(nextQuestion) : null;
      // Deal position needs to resolve which deal first; if it can't, fall
      // through to the normal answer path instead of guessing.
      if (insightKind === 'deal_position' && rawWorkspace) {
        const deal = resolveDealForQuestion(nextQuestion, rawWorkspace.opportunities, selectedOpportunityId);
        if (deal) {
          setStatusMessage('Answered from your measured history (no AI involved).');
          setAnswer(answerFromDealPosition(
            buildCommercialJourneySnapshot({
              opportunity: deal,
              quotes: rawWorkspace.quotes,
              activities: rawWorkspace.activities,
              objections: rawWorkspace.objections,
            }),
            deal,
          ));
          return;
        }
      }
      if (insightKind && insightKind !== 'deal_position' && rawWorkspace) {
        setStatusMessage('Answered from your measured history (no AI involved).');
        if (insightKind === 'follow_up_impact') {
          setAnswer(answerFromFollowUpImpact(buildFollowUpImpact({
            activities: rawWorkspace.activities,
            opportunities: rawWorkspace.opportunities,
            opportunityOutcomes: rawWorkspace.opportunityOutcomes,
          })));
        } else if (insightKind === 'objection_playbook') {
          setAnswer(answerFromObjectionPlaybook(buildObjectionPlaybook({
            objections: rawWorkspace.objections,
            opportunityOutcomes: rawWorkspace.opportunityOutcomes,
          })));
        } else if (insightKind === 'money_state') {
          // Both pools: the pipeline, and what is committed but not collected.
          setAnswer(answerFromMoneyFlow(
            buildMoneyFlow({
              opportunities: rawWorkspace.opportunities,
              quotes: rawWorkspace.quotes,
            }),
            buildOrderBook({
              opportunities: rawWorkspace.opportunities,
              quotes: rawWorkspace.quotes,
              milestoneRecords: [],
              outcomes: rawWorkspace.opportunityOutcomes,
            }),
          ));
        } else if (insightKind === 'week_recap') {
          setAnswer(answerFromWeekRecap(rawWorkspace.activities));
        } else if (insightKind === 'retention_check') {
          setAnswer(answerFromRetentionSignals(buildRetentionSignals({
            quotes: rawWorkspace.quotes,
            activities: rawWorkspace.activities,
            opportunities: rawWorkspace.opportunities,
            accounts: rawWorkspace.accounts,
          })));
        } else if (insightKind === 'commitments') {
          // Promises checked one week back and one week ahead of today.
          const today = todayDateKey();
          setAnswer(answerFromCommitments(buildCommitmentLedger({
            opportunities: rawWorkspace.opportunities,
            activities: rawWorkspace.activities,
            period: {
              start: addDaysToDateKey(today, -COMMITMENT_WINDOW_DAYS),
              end: addDaysToDateKey(today, COMMITMENT_WINDOW_DAYS),
            },
          }, today)));
        } else if (insightKind === 'initiative_review') {
          setAnswer(answerFromInitiativeReview(buildInitiativeReview({
            operatingContexts: rawWorkspace.operatingContext,
            activities: rawWorkspace.activities,
          })));
        } else if (insightKind === 'awaiting_customer') {
          setAnswer(answerFromAwaitingCustomer(
            buildOrderBook({
              opportunities: rawWorkspace.opportunities,
              quotes: rawWorkspace.quotes,
              milestoneRecords: [],
              outcomes: rawWorkspace.opportunityOutcomes,
            }),
            buildMoneyFlow({ opportunities: rawWorkspace.opportunities, quotes: rawWorkspace.quotes }),
          ));
        } else if (insightKind === 'own_obligations') {
          setAnswer(answerFromOwnObligations(
            buildOwnObligations({ expenses: rawWorkspace.expenses, quotes: rawWorkspace.quotes }),
            // The same window the commitments answer uses. Two Ask answers
            // reporting different missed-promise counts for the same week is
            // exactly the disagreement this page exists to end.
            buildCommitmentLedger({
              opportunities: rawWorkspace.opportunities,
              activities: rawWorkspace.activities,
              period: {
                start: addDaysToDateKey(todayDateKey(), -COMMITMENT_WINDOW_DAYS),
                end: addDaysToDateKey(todayDateKey(), COMMITMENT_WINDOW_DAYS),
              },
            }, todayDateKey()),
          ));
        } else if (insightKind === 'customer_signals') {
          setAnswer(answerFromCustomerSignals(buildCustomerSignalDigest({ activities: rawWorkspace.activities })));
        } else {
          setAnswer(answerFromForecastCalibration(buildForecastCalibration({
            outcomes: rawWorkspace.opportunityOutcomes,
            opportunities: rawWorkspace.opportunities,
          })));
        }
        return;
      }
      // The page is called Search & Insights and titled "Find anything". A
      // bare customer name is the first thing anyone types on a page called
      // Search, and it used to fall through to a summary of the whole
      // workspace that never mentioned the name typed. Checked last, so a
      // real question always keeps its own engine.
      const found = rawWorkspace ? findRecords(nextQuestion, rawWorkspace.opportunities) : null;
      if (found) {
        setStatusMessage('Found in your workspace - matched by name, on this device.');
        setAnswer(answerFromRecordFind(found, rawWorkspace?.opportunityOutcomes));
        return;
      }
      // Answers are computed from your own workspace by rule, on this device.
      // No model call, no API key, nothing leaves the browser.
      setStatusMessage('Answered from your workspace using rules - nothing was sent to an AI service.');
      setAnswer(fallbackAnswer);
    } catch (err) {
      if (import.meta.env.DEV) {
        console.debug('[Ask Memoire] answer build failed', { message: err instanceof Error ? err.message : 'Unknown error' });
      }
      setStatusMessage('There is not enough recorded yet to answer that from your workspace.');
      setAnswer(withAnswerCards(answerFromMemory(nextQuestion, contextPacket), nextQuestion, contextPacket));
    } finally {
      setLoading(false);
      // Deliberately NOT scrolled here. This runs inside the handler, before
      // React has committed the answer, so it scrolled the still-empty card -
      // which was already on screen - and the real answer then rendered below
      // the fold. Asking a question and being left looking at the form is how
      // this read as "Ask does nothing". The scroll moved to an effect that
      // fires after the answer is painted; see `pendingScrollRef`.
      pendingScrollRef.current = true;
    }
  }, [
    canSearch,
    question,
    scope,
    selectedAccountId,
    selectedOpportunityId,
    contextPacket,
    scopedMemory,
    scopedBrokenLoops,
    scopedMemoryHealth,
    whatChanged,
    salesPatterns,
    rawWorkspace,
  ]);

  // Deep-linked questions (e.g. from the Today morning brief) run once the
  // workspace context has loaded, so the answer uses real memory.
  useEffect(() => {
    if (contextLoading || urlQuestionConsumed) return;
    const urlQuestion = searchParams.get('question')?.trim();
    if (!urlQuestion) return;
    setUrlQuestionConsumed(true);
    void ask(urlQuestion);
  }, [ask, contextLoading, searchParams, urlQuestionConsumed]);

  const startNewThread = () => {
    setAnswer(null);
    setAskedQuestion('');
    setQuestion('');
    setError(null);
    setStatusMessage('Every answer is computed on this device from your own records.');
  };

  const dealCount = rawWorkspace ? selectQualifiedPipeline(rawWorkspace.opportunities, disqualifiedLeadIds(rawWorkspace.opportunityOutcomes)).length : opportunities.filter((opportunity) => !isLeadStage(opportunity.stage)).length;
  const nextQuestions = (answer?.suggestedQuestions.length ? answer.suggestedQuestions : presets).slice(0, 4);
  const earlierQuestions = askedThisVisit.filter((item) => item !== askedQuestion).slice(0, 4);
  const answerParts = answer ? splitAnswer(answer) : null;

  return (
    <PageContainer>
      <TopBar
        lead={(
          <>
            <Link
              to="/app/today"
              className="inline-flex shrink-0 items-center gap-2 rounded-full bg-chip px-3.5 py-2 text-[12.5px] font-semibold text-tint-neutral-ink transition-colors hover:text-ink"
            >
              <ArrowLeft className="h-[15px] w-[15px]" />
              Back to Today
            </Link>
            <span className="hidden truncate text-[12.5px] text-muted xl:inline">Ask Memoire · computed from your own records, no AI service</span>
          </>
        )}
        status={contextLoading ? undefined : (
          <StatusChip tone="green" className="hidden md:inline-flex">
            {formatCount(dealCount)} {dealCount === 1 ? 'deal' : 'deals'} indexed
          </StatusChip>
        )}
        actions={(
          <button type="button" onClick={startNewThread} className={`${ghostPillClass} hidden sm:inline-flex`}>
            New thread
          </button>
        )}
      />

      {/* This is Search & Insights, not a chatbot. An open text box with a
          blinking cursor promises unlimited natural-language intelligence;
          Memoire answers a bounded set of questions from the user's own
          records, deterministically. So the supported questions are shown as
          buttons and named as a list - what it can answer is visible before
          anything is typed, and nothing is implied that is not true.

          Under Daylight the list sits in the column beside the conversation,
          where it stays in view while an answer is read, instead of below the
          box it describes. */}
      <div className="grid items-start gap-[18px] xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-4">
          {/* The eyebrow carries the surface's own name rather than a rail
              group: the title is a sentence, and the name would otherwise
              appear nowhere on the page you reached by clicking it. */}
          <PageHeader eyebrow="Ask Memoire" title="Ask your own pipeline" documentTitle="Ask Memoire" />

          <Panel as="div" className="flex animate-rise flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center" style={delay(40)}>
            <MicroLabel className="shrink-0">Asking about</MicroLabel>
            <Segmented
              label="Context selector"
              value={scope}
              onChange={(item) => {
                setScope(item);
                setAnswer(null);
                setError(null);
              }}
              options={[
                { value: 'all', label: 'All Deals' },
                { value: 'account', label: 'Specific Account' },
                { value: 'opportunity', label: 'Specific Opportunity' },
              ]}
            />
            {scope === 'account' && (
              <select
                value={selectedAccountId}
                onChange={(event) => {
                  setSelectedAccountId(event.target.value);
                  setAnswer(null);
                }}
                disabled={contextLoading}
                aria-label="Choose account"
                className="min-w-0 flex-1 rounded-full border border-line bg-white px-3.5 py-2 text-[13px] font-semibold text-gray-700 outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
              >
                <option value="">Choose account</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>{account.name}</option>
                ))}
              </select>
            )}
            {scope === 'opportunity' && (
              <select
                value={selectedOpportunityId}
                onChange={(event) => {
                  setSelectedOpportunityId(event.target.value);
                  setAnswer(null);
                }}
                disabled={contextLoading}
                aria-label="Choose opportunity"
                className="min-w-0 flex-1 rounded-full border border-line bg-white px-3.5 py-2 text-[13px] font-semibold text-gray-700 outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
              >
                <option value="">Choose opportunity</option>
                {visibleOpportunities.map((opportunity) => (
                  <option key={opportunity.id} value={opportunity.id}>{opportunity.title}</option>
                ))}
              </select>
            )}
            <span className="truncate text-[11.5px] text-muted sm:ml-auto" title={`Current context: ${contextLabel}`}>
              Current context: {contextLabel}
            </span>
          </Panel>

          {slowContextLoading && <RouteLoadingFallback onRetry={loadMemory} />}

          {/* `aria-live` so the answer is announced rather than silently
              appearing, and `scroll-mt` so the question is not tucked under the
              sticky header when this is scrolled to. */}
          <section
            ref={answerSectionRef}
            aria-live="polite"
            aria-busy={loading}
            aria-label="Answer"
            className="flex scroll-mt-24 flex-col gap-4"
          >
            {askedQuestion && (
              <div className="flex animate-rise justify-end">
                <p className="max-w-[82%] rounded-[18px_18px_6px_18px] bg-ink px-[18px] py-[13px] text-sm leading-[1.55] text-white sm:max-w-[62%]">
                  {askedQuestion}
                </p>
              </div>
            )}

            <Panel as="div" className="flex animate-rise flex-col gap-3.5 px-[22px] py-5" style={delay(60)}>
              <div className="flex items-start gap-2.5">
                <span className="brand-gradient inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] text-white">
                  <Sparkles className="h-[15px] w-[15px]" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h2 className="font-display text-sm font-bold leading-snug text-ink">
                    {loading
                      ? 'Building answer...'
                      : error
                        ? 'That question could not be answered'
                        : answerParts?.headline || 'Ask a question, or pick one beside this'}
                  </h2>
                  {statusMessage && !loading && (
                    <p className="mt-0.5 text-[11.5px] text-muted">{statusMessage}</p>
                  )}
                </div>
              </div>

              {loading ? (
                <p className="flex items-center gap-2 text-sm text-muted">
                  <Sparkles className="h-4 w-4 animate-pulse" aria-hidden="true" />
                  Reading your records...
                </p>
              ) : error ? (
                <p className="rounded-[13px] bg-tint-red-bg px-4 py-3 text-sm text-tint-red-ink">{error}</p>
              ) : answer && answerParts ? (
                <>
                  {answer.cards && answer.cards.length > 0 ? (
                    <div className="grid gap-3">
                      {answer.cards.map((card, index) => (
                        <AnswerCard key={`${card.kind}-${card.title}-${index}`} card={card} />
                      ))}
                    </div>
                  ) : answerParts.body ? (
                    <p className="whitespace-pre-line text-sm leading-[1.7] text-ink [text-wrap:pretty]">{answerParts.body}</p>
                  ) : !answerParts.headline ? (
                    <div className="rounded-[13px] bg-tint-neutral-bg px-4 py-3.5">
                      <p className="text-sm font-bold text-ink">Memoire does not have enough sales memory to answer this yet.</p>
                      <p className="mt-1 text-sm text-tint-neutral-ink">
                        Answers are built from your captured activity. Capture a customer note or add an opportunity, then ask again.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Link to="/app/capture" className="rounded-full bg-brand-blue px-3.5 py-1.5 text-xs font-bold text-white hover:bg-brand-blue-dark">
                          Capture a sales update
                        </Link>
                        <Link to="/app/opportunities?new=1" className="rounded-full border border-line bg-white px-3.5 py-1.5 text-xs font-bold text-gray-700 hover:bg-canvas">
                          Add an opportunity
                        </Link>
                      </div>
                    </div>
                  ) : null}
                  {answer.cards && answer.cards.length > 0 && answer.answer && (
                    <details className="rounded-[13px] bg-tint-neutral-bg px-4 py-3">
                      <summary className="cursor-pointer text-[11px] font-bold uppercase tracking-[0.12em] text-tint-neutral-ink">Structured text</summary>
                      <p className="mt-3 whitespace-pre-line text-sm leading-7 text-ink">{answer.answer}</p>
                    </details>
                  )}

                  <div className="mt-1 border-t border-line pt-3.5">
                    <AnswerBlock title="Drawn from" items={answer.contextUsed} />
                    {answer.missingContext.length > 0 && (
                      <div className="mt-3"><AnswerBlock title="Missing context" items={answer.missingContext} tone="amber" /></div>
                    )}
                    {answer.suggestedNextAction && (
                      <p className="mt-3.5 flex items-start gap-2 rounded-[13px] bg-tint-blue-bg px-3.5 py-2.5 text-[13px] leading-[1.5] text-ink">
                        <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-brand-blue" aria-hidden="true" />
                        <span><span className="font-semibold">Suggested next action:</span> {answer.suggestedNextAction}</span>
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-sm leading-6 text-tint-neutral-ink">
                  Type a customer or a deal to find it, or ask about stuck deals, money and follow-ups. Every answer names
                  the records it came from.
                </p>
              )}
            </Panel>
          </section>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!loading) void ask();
            }}
            className="flex animate-rise items-center gap-3 rounded-full bg-white py-2 pl-5 pr-2 shadow-panel"
            style={delay(100)}
          >
            <input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              aria-label="Find a record by name, or ask a supported question"
              placeholder="Find a customer or deal by name, or ask about a deal, an account, or a week..."
              className="min-w-0 flex-1 bg-transparent text-[13.5px] text-ink outline-none placeholder:text-muted"
            />
            <button
              type="submit"
              disabled={loading}
              aria-label="Ask"
              className="inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-brand-blue text-white transition hover:bg-brand-blue-dark disabled:opacity-50"
            >
              <ArrowRight className="h-4 w-4" strokeWidth={2.3} />
            </button>
          </form>
        </div>

        <aside className="flex min-w-0 flex-col gap-3.5" aria-label="Questions Memoire can answer">
          <Panel as="div" className="animate-rise px-5 py-[18px]" style={delay(120)}>
            <MicroLabel as="h2">{answer ? 'Ask next' : scope === 'all' ? 'Stuck deal presets' : scope === 'account' ? 'Account presets' : 'Opportunity presets'}</MicroLabel>
            <div className="mt-3 flex flex-col gap-2">
              {nextQuestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => ask(suggestion)}
                  className="rounded-xl bg-tint-neutral-bg px-3.5 py-2.5 text-left text-[12.5px] leading-[1.45] text-ink transition hover:bg-chip"
                >
                  {suggestion}
                </button>
              ))}
            </div>
            <MicroLabel as="h3" className="mt-4 block">Action / fix prompts</MicroLabel>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {actionFixPresets.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => ask(preset)}
                  className="rounded-full bg-tint-blue-bg px-3 py-1.5 text-left text-[12px] font-semibold text-tint-blue-ink transition hover:bg-[#D3E5F8]"
                >
                  {preset}
                </button>
              ))}
            </div>
            {scope === 'all' && (
              // These three write about one customer. Offered over the whole
              // workspace they either dead-end or answer about whoever happens to
              // sort first, so the requirement is stated before the click.
              <p className="mt-2.5 text-[11.5px] leading-5 text-muted">
                These three need one customer - pick an account or opportunity in the context selector first.
              </p>
            )}
          </Panel>

          <Panel as="div" className="animate-rise px-5 py-[18px]" style={delay(160)}>
            <MicroLabel as="h2">What this can answer</MicroLabel>
            <ul className="mt-2.5 space-y-1.5">
              {advertisedQuestions.map((advertised) => (
                // Every one of these routes to an engine now, so there is no
                // reason to make the operator retype what the page just offered.
                <li key={advertised}>
                  <button
                    type="button"
                    onClick={() => ask(advertised)}
                    className="text-left text-[12.5px] leading-5 text-ink underline decoration-line-strong underline-offset-2 hover:text-brand-blue hover:decoration-brand-blue"
                  >
                    {advertised}
                  </button>
                </li>
              ))}
            </ul>
          </Panel>

          {earlierQuestions.length > 0 && (
            <Panel as="div" className="animate-rise px-5 py-[18px]">
              <MicroLabel as="h2">Asked this visit</MicroLabel>
              <div className="mt-3 flex flex-col gap-2.5">
                {earlierQuestions.map((earlier) => (
                  <button key={earlier} type="button" onClick={() => ask(earlier)} className="text-left text-[12.5px] font-semibold leading-snug text-ink hover:text-brand-blue">
                    {earlier}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-[11px] text-muted">Kept for this visit only - nothing you ask is stored.</p>
            </Panel>
          )}

          <section className="animate-rise rounded-panel bg-chip px-[18px] py-4" style={delay(200)} aria-label="Private by default">
            <div className="flex items-center gap-2">
              <Lock className="h-3.5 w-3.5 text-tint-neutral-ink" aria-hidden="true" />
              <h2 className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-tint-neutral-ink">Private by default</h2>
            </div>
            <p className="mt-2 text-[12px] leading-[1.55] text-tint-neutral-ink">
              Answers are built on this device from your captured data. Nothing is sent to an AI service, so no
              customer context leaves your browser.
            </p>
          </section>
        </aside>
      </div>
    </PageContainer>
  );
}

/**
 * The answer's first line as its headline, and the rest as its body.
 *
 * The engines write a heading line and then the reasons ("Which deals may go
 * silent" and then the list). Drawing the whole thing as one paragraph under a
 * generic "Answer" label buried the verdict in the prose; lifting the first line
 * out is the Daylight shape - verdict, then evidence - without asking any engine
 * to write differently.
 */
function splitAnswer(answer: AskMemoireAnswer): { headline: string; body: string } {
  const lines = (answer.answer || '').split('\n');
  const firstIndex = lines.findIndex((line) => line.trim());
  if (firstIndex === -1) return { headline: '', body: '' };
  const first = lines[firstIndex].trim().replace(/:$/, '');
  if (first.length > 140) return { headline: 'Here is what your records say', body: answer.answer.trim() };
  return { headline: first, body: lines.slice(firstIndex + 1).join('\n').trim() };
}

function addDaysToDateKey(dateKey: string, days: number) {
  const parsed = Date.parse(`${dateKey}T00:00:00Z`);
  return new Date(parsed + days * 86_400_000).toISOString().slice(0, 10);
}

function withAnswerCards(answer: AskMemoireAnswer, question: string, context: AskMemoireContext): AskMemoireAnswer {
  const normalized = question.toLowerCase();
  const accounts = context.includedData.accounts || [];
  const opportunities = context.includedData.opportunities || [];
  const interactions = context.includedData.interactions || [];
  const actions = context.includedData.actions || [];
  const objections = context.includedData.objections || [];
  const account = accounts[0];
  const opportunity = opportunities.find((item) => !['won', 'lost'].includes(item.stage)) || opportunities[0];
  const latestInteraction = [...interactions].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))[0];
  const openAction = actions.find((action) => action.status === 'open');
  const openObjections = objections.filter((objection) => objection.status === 'open');
  const blocker = openObjections[0]?.title || opportunity?.blocker || interactions.find((item) => item.objection)?.objection || '';
  const missingContext = normalizeMissing(answer.missingContext.length > 0 ? answer.missingContext : context.missingContext);
  const nextAction = answer.suggestedNextAction || openAction?.title || opportunity?.next_action_text || '';
  const contextHref = account?.id
    ? `/app/accounts?accountId=${encodeURIComponent(account.id)}`
    : opportunity?.account_id
      ? `/app/accounts?accountId=${encodeURIComponent(opportunity.account_id)}`
      : undefined;
  const opportunityHref = opportunity?.id ? '/app/opportunities' : undefined;

  // Every card below is a single-customer briefing: it prints one Recipient,
  // one Current story, one Deal status, and fills them from five independently
  // sorted lists. That is the third copy of the join `summarizeContext` refuses
  // to claim, and it is the copy the operator sees - "Recipient: Grupo Calvo"
  // sat above "Last interaction: Call with Luis Simoes Logistica" on a
  // 21-customer workspace, in the card for a draft they were about to send.
  // With more than one customer in scope there is no card to draw, and the
  // answer text already carries the honest workspace-wide framing.
  if (!hasSingleSubject(accounts, opportunity)) return answer;

  const commonCtas = [
    contextHref ? { label: 'Open Account', href: contextHref } : null,
    opportunityHref ? { label: 'Open Opportunity', href: opportunityHref } : null,
    contextHref ? { label: 'Draft Follow-up', href: contextHref, note: 'Open Account Memory to draft from context.' } : null,
    { label: 'Capture Update', href: '/app/capture' },
  ].filter(Boolean) as AskMemoireAnswerCard['ctas'];

  if (normalized.includes('draft') || normalized.includes('follow-up') || normalized.includes('follow up') || normalized.includes('address this objection') || normalized.includes('ask the customer')) {
    return {
      ...answer,
      cards: [{
        kind: 'follow_up',
        title: 'Follow-up suggestion',
        fields: [
          { label: 'Goal', value: normalized.includes('address') ? 'Address the objection' : 'Move the follow-up forward' },
          { label: 'Recipient', value: account?.name || 'Recipient not known yet' },
          { label: 'What to mention', value: [latestInteraction ? `Last interaction: ${latestInteraction.summary}` : '', blocker ? `Concern: ${blocker}` : '', nextAction ? `Next action: ${nextAction}` : ''].filter(Boolean) },
          { label: 'Missing context', value: missingContext.length > 0 ? missingContext : ['No major missing context detected.'] },
          { label: 'Draft follow-up', value: answer.answer || 'Memoire does not have enough context to draft confidently.' },
        ],
        ctas: commonCtas,
      }],
    };
  }

  if (context.scope === 'opportunity' || normalized.includes('opportunity') || normalized.includes('deal stuck') || normalized.includes('blocking this')) {
    return {
      ...answer,
      cards: [{
        kind: 'opportunity',
        title: opportunity ? `${account?.name || 'Account'} / ${opportunity.title}` : 'Selected opportunity',
        fields: [
          { label: 'Deal status', value: opportunity ? `${opportunity.title} (${opportunity.stage})` : 'Opportunity context missing' },
          { label: 'Blocker', value: blocker || 'No blocker captured yet', tone: blocker ? 'warning' : 'default' },
          { label: 'Evidence', value: [latestInteraction ? `Last interaction: ${latestInteraction.summary}` : '', blocker ? `Blocker: ${blocker}` : '', nextAction ? `Next action: ${nextAction}` : 'No open next action found'].filter(Boolean) },
          { label: 'Missing context', value: missingContext.length > 0 ? missingContext : ['No major missing context detected.'] },
          { label: 'Suggested fix', value: answer.suggestedNextAction || nextAction || 'Create or confirm a follow-up action.', tone: 'warning' },
          { label: 'Next action', value: nextAction || 'Memoire does not know the next action yet.' },
        ],
        ctas: commonCtas,
      }],
    };
  }

  if (context.scope === 'account' || normalized.includes('account') || normalized.includes('memoire know') || normalized.includes('last time') || normalized.includes('what should i do next')) {
    return {
      ...answer,
      cards: [{
        kind: 'account',
        title: account?.name || 'Selected account',
        fields: [
          { label: 'Current story', value: account?.summary || latestInteraction?.summary || 'Memoire does not have enough account story yet.' },
          { label: 'Why this account may go silent', value: blocker || (!nextAction ? 'Missing follow-up' : 'No major silent-deal risk detected.'), tone: blocker || !nextAction ? 'warning' : 'good' },
          { label: 'Based on', value: [latestInteraction ? `Last interaction: ${latestInteraction.summary}` : '', opportunity ? `Opportunity: ${opportunity.title}` : '', openObjections.length > 0 ? `Open objection: ${openObjections.map((item) => item.title).join('; ')}` : '', nextAction ? `Next action: ${nextAction}` : ''].filter(Boolean) },
          { label: 'Memoire knows', value: [account?.name ? `Account: ${account.name}` : '', opportunity?.title ? `Opportunity: ${opportunity.title}` : '', blocker ? `Blocker: ${blocker}` : '', latestInteraction ? 'Recent interaction captured' : ''].filter(Boolean) },
          { label: 'Memoire does not know', value: missingContext.length > 0 ? missingContext : ['No major missing context detected.'] },
          { label: 'Suggested next move', value: answer.suggestedNextAction || nextAction || 'Create or confirm a follow-up action.', tone: 'warning' },
        ],
        ctas: commonCtas,
      }],
    };
  }

  return answer;
}

function normalizeMissing(items: string[]) {
  return unique(items.flatMap((item) => {
    if (item.toLowerCase().includes('decision maker') && item.toLowerCase().includes('timeline')) {
      return ['Decision maker', 'Decision timeline'];
    }
    return [item];
  }));
}


function getContextLabel(
  scope: AskMemoireContext['scope'],
  selectedAccountId: string,
  selectedOpportunityId: string,
  accounts: Account[],
  opportunities: Opportunity[]
) {
  if (scope === 'all') return 'All Memory';
  if (scope === 'account') {
    return accounts.find((account) => account.id === selectedAccountId)?.name || 'Select Account';
  }
  return opportunities.find((opportunity) => opportunity.id === selectedOpportunityId)?.title || 'Select Opportunity';
}



function answerFromAttention({
  context,
  accounts,
  opportunities,
  actions,
  brokenLoops,
  memoryHealth,
  objections,
  focus,
}: {
  context: AskMemoireContext;
  accounts: Account[];
  opportunities: Opportunity[];
  actions: SalesAction[];
  brokenLoops: BrokenLoop[];
  memoryHealth: ReturnType<typeof calculateMemoryHealth>[];
  objections: Objection[];
  focus: AttentionFocus;
}): AskMemoireAnswer {
  // "There is an open objection or blocker in memory" is what the health engine
  // knows. The objection itself was written down somewhere, and naming it is the
  // difference between a signal and an answer.
  //
  // Three somewheres, because `hasOpenObjection` counts all of them: an
  // Objection record, an interaction carrying objection text, or the deal's own
  // blocker field. This workspace holds zero Objection records and every
  // objection on the interactions, so looking only at the first store found
  // nothing and printed the generic sentence.
  const openObjections = objections.filter((objection) => objection.status === 'open');
  const objectionInteractions = (context.includedData.interactions || [])
    .filter((interaction) => Boolean(interaction.objection))
    .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  const objectionTitleFor = (accountId?: string | null, opportunityId?: string | null) => {
    const record = openObjections.find((objection) => (opportunityId && objection.opportunity_id === opportunityId))
      || openObjections.find((objection) => (accountId && objection.account_id === accountId));
    if (record) return `${record.title}${record.severity === 'high' ? ' (high severity)' : ''}`;
    const fromInteraction = objectionInteractions.find((interaction) => (opportunityId && interaction.opportunity_id === opportunityId))
      || objectionInteractions.find((interaction) => (accountId && interaction.account_id === accountId));
    if (fromInteraction?.objection) return fromInteraction.objection;
    const deal = opportunityId ? opportunityById.get(opportunityId) : undefined;
    return deal?.blocker || '';
  };
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const opportunityById = new Map(opportunities.map((opportunity) => [opportunity.id, opportunity]));
  const openActionsByAccount = firstBy(actions.filter((action) => action.status === 'open'), (action) => action.account_id || '');
  const openActionsByOpportunity = firstBy(actions.filter((action) => action.status === 'open'), (action) => action.opportunity_id || '');
  const seen = new Set<string>();

  const loopItems = brokenLoops.map((loop) => ({
    id: `loop-${loop.id}`,
    rank: loop.priority === 'P0' ? 0 : loop.priority === 'P1' ? 1 : 2,
    entityKey: loop.opportunityId ? `opportunity-${loop.opportunityId}` : loop.accountId ? `account-${loop.accountId}` : `${loop.entityType}-${loop.entityId}`,
    entityName: loop.affectedEntity,
    reason: `${loop.issue}: ${loop.whyItMatters}`,
    signalSource: 'Stuck Deal Queue',
    suggestedNextAction: loop.suggestedFix,
    missingContext: [] as string[],
    accountId: loop.accountId,
    opportunityId: loop.opportunityId,
    issue: loop.issue,
    whyItMatters: loop.whyItMatters,
    // Two facts the focused questions need, recorded once here rather than
    // re-derived from the prose of `reason` at read time.
    hasNextAction: Boolean(loop.opportunityId
      ? openActionsByOpportunity.get(loop.opportunityId)
      : loop.accountId ? openActionsByAccount.get(loop.accountId) : undefined),
    isObjection: OBJECTION_TEXT.test(`${loop.issue} ${loop.whyItMatters}`),
    // The line that made this an objection. Filtering on one reason and
    // displaying another made the objections answer look arbitrary: it named a
    // deal and then explained it with "No recent interaction is available."
    objectionReason: OBJECTION_TEXT.test(loop.issue) ? loop.issue : loop.whyItMatters,
  }));

  const healthItems = memoryHealth
    .filter((health) => health.status === 'broken' || health.status === 'needs_attention')
    .map((health) => {
      const opportunity = health.entityType === 'opportunity' ? opportunityById.get(health.entityId) : undefined;
      const account = health.entityType === 'account'
        ? accountById.get(health.entityId)
        : accountById.get(opportunity?.account_id || '');
      const linkedAction = health.entityType === 'opportunity'
        ? openActionsByOpportunity.get(health.entityId)
        : openActionsByAccount.get(health.entityId);

      return {
        id: `health-${health.entityType}-${health.entityId}`,
        rank: health.status === 'broken' ? 3 : 4,
        entityKey: `${health.entityType}-${health.entityId}`,
        entityName: opportunity ? `${account?.name || opportunity.account?.name || opportunity.account_name || 'Unknown account'} / ${opportunity.title}` : account?.name || 'Unknown account',
        reason: health.reasons[0] || (health.status === 'broken' ? 'This deal may go silent.' : 'Account context needs more detail.'),
        signalSource: 'Context Health',
        suggestedNextAction: linkedAction?.title || health.suggestedFixes[0] || 'Create or confirm the next action.',
        missingContext: health.missingContext,
        accountId: account?.id,
        opportunityId: opportunity?.id,
        issue: health.status === 'broken' ? 'Deal at risk' : 'Weak context',
        whyItMatters: health.reasons[0] || 'Memoire does not have enough context to help you act confidently.',
        hasNextAction: Boolean(linkedAction),
        isObjection: health.reasons.some((reason) => OBJECTION_TEXT.test(reason)),
        objectionReason: health.reasons.find((reason) => OBJECTION_TEXT.test(reason)) || '',
      };
    });

  const displayReason = (item: { reason: string; objectionReason: string; accountId?: string | null; opportunityId?: string | null }) =>
    (focus === 'objections' && (objectionTitleFor(item.accountId, item.opportunityId) || item.objectionReason))
    || item.reason;

  const whyLine = (item: { reason: string; objectionReason: string; whyItMatters: string; accountId?: string | null; opportunityId?: string | null }) => {
    const shown = displayReason(item);
    const why = item.whyItMatters || item.reason;
    return why === shown ? '' : why;
  };

  const matchesFocus = (item: { hasNextAction: boolean; isObjection: boolean }) => {
    if (focus === 'objections') return item.isObjection;
    if (focus === 'no_next_action') return !item.hasNextAction;
    return true;
  };

  const rankedItems = [...loopItems, ...healthItems]
    .sort((a, b) => a.rank - b.rank)
    .filter(matchesFocus)
    .filter((item) => {
      // Accounts are the unit for the account question, so two deals at the
      // same customer are one row rather than two.
      const key = focus === 'accounts' ? `account-${item.accountId || item.entityKey}` : item.entityKey;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);

  if (rankedItems.length === 0) {
    return {
      answer: attentionEmptyAnswers[focus],
      contextUsed: ['All Deals', 'Stuck Deal Queue', 'Context Health'],
      missingContext: [],
      suggestedQuestions: presetsForScope(context.scope).slice(0, 4),
    };
  }

  return {
    answer: `${attentionHeadings[focus]}\n${rankedItems.map((item, index) => [
      `${index + 1}. ${item.entityName}`,
      `   Issue: ${displayReason(item)}`,
      `   Evidence: ${item.signalSource}`,
      `   Suggested fix: ${item.suggestedNextAction}`,
    ].join('\n')).join('\n\n')}`,
    contextUsed: ['All Deals', `${brokenLoops.length} stuck-deal signal(s)`, `${memoryHealth.length} Context Health signal(s)`],
    suggestedNextAction: rankedItems[0]?.suggestedNextAction,
    missingContext: unique(rankedItems.flatMap((item) => item.missingContext)).slice(0, 5),
    suggestedQuestions: presetsForScope(context.scope).slice(0, 4),
    cards: rankedItems.slice(0, 5).map((item): AskMemoireAnswerCard => ({
      kind: 'stuck_deal',
      title: item.entityName,
      fields: [
        { label: 'Issue', value: displayReason(item) || item.issue, tone: 'warning' },
        // Printing the same sentence twice under two labels says nothing the
        // first one did not - the "(Won, Won)" tic in a different costume.
        ...(whyLine(item) ? [{ label: attentionWhyLabels[focus], value: whyLine(item), tone: 'warning' as const }] : []),
        { label: 'Evidence', value: [item.signalSource] },
        { label: 'Missing context', value: item.missingContext.length > 0 ? item.missingContext : ['No additional missing context detected.'] },
        { label: 'Suggested fix', value: item.suggestedNextAction, tone: 'warning' },
      ],
      ctas: [
        item.accountId ? { label: 'Open Account', href: `/app/accounts?accountId=${encodeURIComponent(item.accountId)}` } : null,
        item.opportunityId ? { label: 'Open Opportunity', href: `/app/opportunities` } : null,
        item.accountId ? { label: 'Draft Follow-up', href: `/app/accounts?accountId=${encodeURIComponent(item.accountId)}`, note: 'Open Account Memory to draft from context.' } : null,
        { label: 'Capture Update', href: '/app/capture' },
      ].filter(Boolean) as AskMemoireAnswerCard['ctas'],
    })),
  };
}

/**
 * `namedRecord` is set when the question mentioned a customer or deal that
 * exists in the workspace while the scope is still All Memory. "What changed at
 * Amorim Cork this week?" listed overdue actions belonging to other customers
 * without ever saying the answer was not about Amorim Cork. The digest is
 * workspace-wide by construction, so the fix is to say so rather than to imply
 * a filter that was never applied.
 */
function answerFromChanges(changes: MemoryChange[], context: AskMemoireContext, namedRecord?: string): AskMemoireAnswer {
  const scopeNote = namedRecord && context.scope === 'all'
    ? `\n\nThis is every recent change in the workspace, not only ${namedRecord}. Pick it in the context selector to narrow the answer.`
    : '';
  if (changes.length === 0) {
    return {
      answer: 'No major changes yet. Capture interactions and Memoire will summarize what changed here.',
      contextUsed: ['What Changed Digest', context.scope === 'all' ? 'All Memory' : context.scope],
      missingContext: context.missingContext,
      suggestedQuestions: presetsForScope(context.scope).slice(0, 4),
    };
  }

  return {
    answer: `Recent meaningful changes:\n${changes.map((change) => `- [${formatMemoryChangeSeverity(change.severity)}] ${change.title}: ${change.description}`).join('\n')}${scopeNote}`,
    contextUsed: ['What Changed Digest', `${changes.length} recent changes`, context.scope === 'all' ? 'All Memory' : context.scope],
    suggestedNextAction: changes.find((change) => change.suggestedReviewAction)?.suggestedReviewAction,
    missingContext: context.missingContext,
    suggestedQuestions: presetsForScope(context.scope).slice(0, 4),
  };
}

function answerFromPatterns(patterns: SalesPattern[], context: AskMemoireContext): AskMemoireAnswer {
  if (patterns.length === 0) {
    return {
      answer: 'No clear pattern detected yet. Capture more interactions and actions so Memoire can learn from your sales activity.',
      contextUsed: ['Sales Pattern Detector', context.scope === 'all' ? 'All Memory' : context.scope],
      missingContext: context.missingContext,
      suggestedQuestions: presetsForScope(context.scope).slice(0, 4),
    };
  }

  return {
    answer: patterns.slice(0, 3).map((pattern) => [
      `[${salesPatternSeverityLabel(pattern.severity)}] ${pattern.title}`,
      pattern.insight,
      `Evidence: ${pattern.evidence.slice(0, 3).join('; ')}`,
      `Suggested behavior: ${pattern.suggestedBehavior}`,
    ].join('\n')).join('\n\n'),
    contextUsed: ['Sales Pattern Detector', `${patterns.length} pattern(s) detected`, context.scope === 'all' ? 'All Memory' : context.scope],
    suggestedNextAction: patterns[0]?.suggestedBehavior,
    missingContext: context.missingContext,
    suggestedQuestions: presetsForScope(context.scope).slice(0, 4),
  };
}

/**
 * One record the answer is about, as a tinted card whose tint is the kind of
 * answer - a stuck deal reads amber, a follow-up green - the same full-tint
 * treatment Daylight gives every status row.
 */
function AnswerCard({ card }: { card: AskMemoireAnswerCard }) {
  const tone = {
    stuck_deal: { ground: 'bg-tint-amber-bg', label: 'text-tint-amber-solid' },
    account: { ground: 'bg-tint-blue-bg', label: 'text-tint-blue-ink' },
    opportunity: { ground: 'bg-tint-violet-bg', label: 'text-tint-violet-ink' },
    follow_up: { ground: 'bg-tint-green-bg', label: 'text-tint-green-solid' },
    insight: { ground: 'bg-tint-blue-bg', label: 'text-tint-blue-ink' },
  }[card.kind];

  return (
    <article className={`rounded-2xl px-[18px] py-4 ${tone.ground}`}>
      <p className={`text-[10.5px] font-bold uppercase tracking-[0.12em] ${tone.label}`}>{card.kind.replace('_', ' ')}</p>
      <h3 className="mt-1 font-display text-base font-bold leading-snug text-ink">{card.title}</h3>
      <div className="mt-3 grid gap-2.5 md:grid-cols-2">
        {card.fields.map((field) => (
          <CardField key={field.label} field={field} />
        ))}
      </div>
      {card.ctas && card.ctas.length > 0 && (
        <div className="mt-3.5 flex flex-wrap gap-2">
          {card.ctas.map((cta) => cta.href ? (
            <Link
              key={`${cta.label}-${cta.href}`}
              to={cta.href}
              title={cta.note}
              className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-gray-700 shadow-seg transition hover:-translate-y-px hover:text-brand-blue"
            >
              {cta.label}
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          ) : (
            <span key={cta.label} className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-tint-neutral-ink">
              {cta.label}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}

function CardField({ field }: { field: AskMemoireAnswerCard['fields'][number] }) {
  const tone = {
    default: 'bg-white/85 text-ink',
    warning: 'bg-white text-tint-amber-ink ring-1 ring-[#F6D9A8]',
    good: 'bg-white text-tint-green-ink ring-1 ring-[#BFE8D0]',
  }[field.tone || 'default'];
  const values = Array.isArray(field.value) ? field.value.filter(Boolean) : [field.value].filter(Boolean);

  return (
    <div className={`rounded-xl px-3 py-2.5 ${tone}`}>
      <p className="text-[10.5px] font-bold uppercase tracking-[0.1em] opacity-70">{field.label}</p>
      {values.length > 1 ? (
        <ul className="mt-1.5 space-y-1 text-[13px] leading-6">
          {values.map((value) => (
            <li key={value} className="flex gap-2">
              <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-50" />
              <span>{value}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1.5 whitespace-pre-line text-[13px] leading-6">{values[0] || 'Memoire does not know yet.'}</p>
      )}
    </div>
  );
}

/** Where an answer came from, as chips - the record behind every claim. */
function AnswerBlock({ title, items, tone = 'gray' }: { title: string; items: string[]; tone?: 'gray' | 'blue' | 'amber' }) {
  const chip = {
    gray: { ground: 'bg-chip text-tint-neutral-ink', dot: 'bg-brand-blue' },
    blue: { ground: 'bg-tint-blue-bg text-tint-blue-ink', dot: 'bg-brand-blue' },
    amber: { ground: 'bg-tint-amber-pill text-tint-amber-solid', dot: 'bg-[#E8891A]' },
  }[tone];

  return (
    <div>
      <MicroLabel as="p">{title}</MicroLabel>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {items.map((item) => (
          <span key={item} className={`inline-flex items-center gap-[7px] rounded-full px-3 py-1.5 text-[11.5px] font-semibold ${chip.ground}`}>
            <span aria-hidden="true" className={`h-[7px] w-[7px] shrink-0 rounded-full ${chip.dot}`} />
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function firstBy<T>(items: T[], getKey: (item: T) => string) {
  const result = new Map<string, T>();
  items.forEach((item) => {
    const key = getKey(item);
    if (key && !result.has(key)) result.set(key, item);
  });
  return result;
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}
