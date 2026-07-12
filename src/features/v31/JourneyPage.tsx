import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CheckCircle2, Circle, Clock3, PauseCircle } from 'lucide-react';
import { DEMO_USER_ID } from '../../lib/demoMode';
import { useAuth } from '../../hooks/useAuth';
import type { Account, Contact, Interaction, MemoryHealth, Objection, Opportunity, SalesAction } from '../../types/v31';
import { detectBrokenLoops } from './brokenLoops';
import type { BrokenLoop, CaptureMemory } from './brokenLoops';
import { calculateMemoryHealth, memoryHealthLabel } from './memoryHealth';
import { RouteLoadingFallback } from './RouteLoadingFallback';
import { useSlowLoadingFallback } from './useSlowLoadingFallback';
import { hasLocalSampleData } from '../../utils/dataMode';
import { loadSalesWorkspaceData, type SalesWorkspaceData } from '../../services/workspaceData';
import { adaptWorkspaceToV31 } from './workspaceAdapter';
import { buildCommercialJourneySnapshot, formatJourneyCommitment, type CommercialJourneySnapshot } from '../../utils/commercialJourney';
import { getWorkspaceLens } from '../../utils/workspaceLens';
import { isValidBusinessDate } from '../../utils/safeDate';

type FlowState = 'Active' | 'Completed' | 'Missing' | 'Later';

interface FlowStep {
  key: 'activity' | 'context' | 'state' | 'action' | 'outcome' | 'review' | 'learning';
  label: string;
  description: string;
}

interface JourneyCard {
  id: string;
  accountName: string;
  contactName: string;
  opportunityName: string;
  lastInteraction: string;
  blocker: string;
  nextAction: string;
  currentStage: string;
  memoryHealth: MemoryHealth;
  moneyStatus?: string;
  riskStatus?: string;
}

const flowSteps: FlowStep[] = [
  {
    key: 'activity',
    label: 'Activity',
    description: 'A commercial activity is captured - meeting, quote, payment, outreach',
  },
  {
    key: 'context',
    label: 'Context',
    description: 'It is linked to the account, opportunity, or initiative it moves',
  },
  {
    key: 'state',
    label: 'Commercial state',
    description: 'The activity changes a state - stage, quote, money, risk',
  },
  {
    key: 'action',
    label: 'Next action',
    description: 'A clear next step is dated and owned',
  },
  {
    key: 'outcome',
    label: 'Outcome',
    description: 'The result is recorded - won, lost, paid, or delivered',
  },
  {
    key: 'review',
    label: 'Review',
    description: 'The week is reviewed for money, wins, and stalls',
  },
  {
    key: 'learning',
    label: 'Learning',
    description: 'Measured history sharpens the next call - calibration, playbook',
  },
];

export function JourneyPage() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [actions, setActions] = useState<SalesAction[]>([]);
  const [objections, setObjections] = useState<Objection[]>([]);
  const [captures, setCaptures] = useState<CaptureMemory[]>([]);
  const [journeySnapshots, setJourneySnapshots] = useState<Map<string, CommercialJourneySnapshot>>(new Map());
  const [loopStates, setLoopStates] = useState<Map<FlowStep['key'], FlowState>>(new Map());
  const [loading, setLoading] = useState(true);
  const slowLoading = useSlowLoadingFallback(loading);
  const sampleDataActive = hasLocalSampleData();

  const loadJourney = useCallback(async () => {
    setLoading(true);
    try {
      const workspace = await loadSalesWorkspaceData(sampleDataActive ? undefined : user?.id);
      const memory = adaptWorkspaceToV31(workspace, user?.id || DEMO_USER_ID);
      setAccounts(memory.accounts);
      setContacts(memory.contacts);
      setOpportunities(memory.opportunities);
      setInteractions(memory.interactions);
      setActions(memory.actions);
      setObjections(memory.objections);
      setCaptures([]);
      // The commercial journey read-model (7.3) is derived from the raw
      // workspace, keyed by opportunity id (adaptWorkspaceToV31 preserves ids).
      const snapshots = new Map<string, CommercialJourneySnapshot>();
      workspace.opportunities
        .filter((opportunity) => opportunity.status === 'Active')
        .forEach((opportunity) => {
          snapshots.set(opportunity.id, buildCommercialJourneySnapshot({
            opportunity,
            quotes: workspace.quotes,
            activities: workspace.activities,
            objections: workspace.objections,
          }));
        });
      setJourneySnapshots(snapshots);
      setLoopStates(deriveOperatingLoopStates(workspace));
    } catch (error) {
      if (import.meta.env.DEV) {
        console.debug('[Journey] workspace load failed', {
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
      setAccounts([]);
      setContacts([]);
      setOpportunities([]);
      setInteractions([]);
      setActions([]);
      setObjections([]);
      setCaptures([]);
      setJourneySnapshots(new Map());
      setLoopStates(new Map());
    } finally {
      setLoading(false);
    }
  }, [sampleDataActive, user]);

  useEffect(() => {
    loadJourney();
  }, [loadJourney]);

  const accountById = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts]);
  const contactByAccountId = useMemo(() => firstBy(contacts, (contact) => contact.account_id || ''), [contacts]);
  const openActions = useMemo(() => actions.filter((action) => action.status === 'open'), [actions]);
  const activeOpportunities = useMemo(
    () => opportunities.filter((opportunity) => !['won', 'lost'].includes(opportunity.stage)),
    [opportunities]
  );
  const brokenLoops = useMemo(() => {
    return detectBrokenLoops({ accounts, opportunities, interactions, actions, objections, captures });
  }, [accounts, actions, captures, interactions, objections, opportunities]);

  const activeJourneys = useMemo(() => {
    const lens = getWorkspaceLens();
    const latestInteractionByAccount = latestBy(interactions, (item) => item.account_id || '');
    const latestInteractionByOpportunity = latestBy(interactions, (item) => item.opportunity_id || '');
    const openActionByOpportunity = firstBy(openActions, (item) => item.opportunity_id || '');

    const opportunityCards = activeOpportunities.map((opportunity): JourneyCard => {
      const account = opportunity.account_id ? accountById.get(opportunity.account_id) : null;
      const latestInteraction = latestInteractionByOpportunity.get(opportunity.id)
        || (opportunity.account_id ? latestInteractionByAccount.get(opportunity.account_id) : null);
      const action = openActionByOpportunity.get(opportunity.id);
      const hasNextAction = Boolean(action || opportunity.next_action_text);
      const memoryHealth = calculateMemoryHealth(
        { entityType: 'opportunity', entity: opportunity },
        { accounts, contacts, opportunities, interactions, actions, objections, brokenLoops }
      );

      // Where this deal stands, from the commercial journey read-model - the
      // real position (money flow or stage), money, risk, blocker, and next
      // commitment. Falls back to the legacy stage when no snapshot exists.
      const snapshot = journeySnapshots.get(opportunity.id);
      const nextCommitment = snapshot ? formatJourneyCommitment(snapshot.nextCommitment) : '';

      return {
        id: opportunity.id,
        accountName: account?.name || 'No account linked',
        contactName: opportunity.account_id ? contactByAccountId.get(opportunity.account_id)?.name || 'No contact linked' : 'No contact linked',
        opportunityName: opportunity.title,
        lastInteraction: snapshot?.lastTouch?.summary || latestInteraction?.summary || 'No interaction captured yet',
        blocker: snapshot?.blocker || opportunity.blocker || latestInteraction?.objection || 'No blocker captured',
        nextAction: (nextCommitment && nextCommitment !== 'No next commitment' ? nextCommitment : '')
          || action?.title || opportunity.next_action_text || 'Missing follow-up',
        currentStage: snapshot
          ? (lens === 'solo' ? snapshot.soloPosition : snapshot.position)
          : getJourneyStage(Boolean(latestInteraction), Boolean(account), true, hasNextAction),
        memoryHealth,
        moneyStatus: snapshot?.moneyStatus,
        riskStatus: snapshot?.riskStatus,
      };
    });

    const accountOnlyCards = accounts
      .filter((account) => !activeOpportunities.some((opportunity) => opportunity.account_id === account.id))
      .map((account): JourneyCard => {
        const latestInteraction = latestInteractionByAccount.get(account.id);
        const action = openActions.find((item) => item.account_id === account.id);
        const memoryHealth = calculateMemoryHealth(
          { entityType: 'account', entity: account },
          { accounts, contacts, opportunities, interactions, actions, objections, brokenLoops }
        );

        return {
          id: account.id,
          accountName: account.name,
          contactName: contactByAccountId.get(account.id)?.name || 'No contact linked',
          opportunityName: 'No opportunity linked',
          lastInteraction: latestInteraction?.summary || 'No interaction captured yet',
          blocker: account.objections[0] || latestInteraction?.objection || 'No blocker captured',
        nextAction: action?.title || 'Missing follow-up',
          currentStage: getJourneyStage(Boolean(latestInteraction), true, false, Boolean(action)),
          memoryHealth,
        };
      });

    return [...opportunityCards, ...accountOnlyCards].slice(0, 12);
  }, [accountById, accounts, actions, activeOpportunities, brokenLoops, contactByAccountId, contacts, interactions, journeySnapshots, objections, openActions, opportunities]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Journey</p>
          {sampleDataActive && (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">
              Demo Mode
            </span>
          )}
        </div>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-navy">Commercial operating loop</h1>
        <p className="mt-2 max-w-2xl text-sm text-gray-500">
          See where each stage of the loop is working or broken: activity to context to commercial state to next action to outcome to review to learning.
        </p>
        <p className="mt-2 max-w-2xl text-xs leading-5 text-gray-500">
          A stuck deal is missing its next action, recent context, or a clear fix. Each stage below reflects your actual captured data.
        </p>
      </header>

      <section className="mb-6 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-bold text-navy">Operating loop map</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-7">
          {flowSteps.map((step, index) => (
            <FlowStepCard
              key={step.key}
              step={step}
              index={index}
              state={loopStates.get(step.key) || 'Missing'}
            />
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-bold text-navy">Active Journeys</h2>
            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-500">{activeJourneys.length}</span>
          </div>

          {loading ? (
            slowLoading ? <RouteLoadingFallback onRetry={loadJourney} /> : <p className="text-sm text-gray-500">Loading journeys...</p>
          ) : activeJourneys.length === 0 ? (
            <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-5">
              <p className="text-sm font-semibold text-navy">Start by capturing an interaction.</p>
              <p className="mt-1 text-sm leading-6 text-gray-600">
                Memoire will turn it into account memory, opportunity context, and next action.
              </p>
              <Link
                to="/app/capture"
                className="mt-4 inline-flex rounded-full bg-white px-3 py-1.5 text-xs font-bold text-brand-blue ring-1 ring-blue-100 hover:ring-brand-blue/30"
              >
                Go to Quick Capture
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {activeJourneys.map((journey) => (
                <article key={journey.id} className="rounded-lg border border-gray-100 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-navy">{journey.accountName}</p>
                      <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-gray-400">{journey.opportunityName}</p>
                      <p className="mt-1 text-xs text-gray-500">{journey.contactName}</p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <MemoryHealthBadge health={journey.memoryHealth} />
                      <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-brand-blue">{journey.currentStage}</span>
                    </div>
                  </div>
                  <div className="mt-4 space-y-2 text-sm text-gray-600">
                    <JourneyLine label="Last interaction" value={journey.lastInteraction} />
                    {journey.moneyStatus && <JourneyLine label="Money" value={journey.moneyStatus} />}
                    {journey.riskStatus && <JourneyLine label="Risk" value={journey.riskStatus} />}
                    <JourneyLine label="Current blocker" value={journey.blocker} />
                    <JourneyLine label="Next action" value={journey.nextAction} />
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-bold text-navy">Stuck Deals</h2>
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">{brokenLoops.length}</span>
          </div>

          {loading ? (
            slowLoading ? <RouteLoadingFallback onRetry={loadJourney} /> : <p className="text-sm text-gray-500">Checking loops...</p>
          ) : brokenLoops.length === 0 ? (
            <div className="rounded-lg border border-green-100 bg-green-50 p-4 text-sm text-green-800">
              No stuck deals detected. Your accounts have enough context for now.
            </div>
          ) : (
            <div className="space-y-3">
              {brokenLoops.map((loop) => (
                <div key={loop.id} className="rounded-lg border border-amber-100 bg-amber-50/70 p-4">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${priorityClass(loop.priority)}`}>{loop.priority}</span>
                        <p className="text-sm font-bold text-amber-950">{loop.issue}</p>
                      </div>
                      <p className="mt-1 text-xs text-amber-800">{loop.affectedEntity}</p>
                      <p className="mt-2 text-xs leading-5 text-amber-900">{loop.whyItMatters}</p>
                      <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-amber-900">
                        <ArrowRight className="h-3.5 w-3.5" />
                        {loop.suggestedFix}
                      </p>
                      <Link
                        to={loopTarget(loop)}
                        className="mt-3 inline-flex rounded-full bg-white px-3 py-1.5 text-xs font-bold text-amber-900 ring-1 ring-amber-200 hover:bg-amber-100"
                      >
                        {loop.actionLabel}
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function MemoryHealthBadge({ health }: { health: MemoryHealth }) {
  const tone = {
    healthy: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    needs_attention: 'border-amber-200 bg-amber-50 text-amber-700',
    broken: 'border-red-200 bg-red-50 text-red-700',
  }[health.status];

  return (
    <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${tone}`}>
      {memoryHealthLabel(health.status)}
    </span>
  );
}

function priorityClass(priority: BrokenLoop['priority']) {
  if (priority === 'P0') return 'bg-red-100 text-red-700';
  if (priority === 'P1') return 'bg-amber-100 text-amber-700';
  return 'bg-gray-100 text-gray-600';
}

function loopTarget(loop: BrokenLoop) {
  if (loop.actionLabel === 'Open Account' && loop.accountId) return `/app/accounts?accountId=${encodeURIComponent(loop.accountId)}`;
  if (loop.actionLabel === 'Open Opportunity') return '/app/opportunities';
  return '/app/capture';
}

function FlowStepCard({ step, index, state }: { step: FlowStep; index: number; state: FlowState }) {
  const stateClass = {
    Active: 'border-blue-200 bg-blue-50/70 text-brand-blue',
    Completed: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    Missing: 'border-gray-200 bg-gray-50 text-gray-500',
    Later: 'border-gray-200 bg-white text-gray-400',
  }[state];

  return (
    <div className={`rounded-lg border p-4 ${stateClass}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-wide">Step {index + 1}</span>
        {state === 'Later' ? <PauseCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
      </div>
      <p className="mt-2 text-sm font-bold text-gray-900">{step.label}</p>
      <p className="mt-1 min-h-[40px] text-xs leading-5 text-gray-600">{step.description}</p>
      <span className="mt-3 inline-flex rounded-full bg-white/70 px-2.5 py-1 text-xs font-bold">{state}</span>
    </div>
  );
}

function JourneyLine({ label, value }: { label: string; value: string }) {
  const isMissing = value.toLowerCase().startsWith('no ');
  return (
    <div className="flex gap-2">
      {isMissing ? <Circle className="mt-0.5 h-4 w-4 shrink-0 text-gray-300" /> : <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-gray-300" />}
      <p>
        <span className="font-semibold text-gray-900">{label}: </span>
        {value}
      </p>
    </div>
  );
}

function latestBy<T extends { occurred_at?: string; updated_at?: string }>(items: T[], getKey: (item: T) => string) {
  const result = new Map<string, T>();
  items.forEach((item) => {
    const key = getKey(item);
    if (!key) return;
    const current = result.get(key);
    const itemDate = item.occurred_at || item.updated_at || '';
    const currentDate = current?.occurred_at || current?.updated_at || '';
    if (!current || itemDate > currentDate) result.set(key, item);
  });
  return result;
}

function firstBy<T>(items: T[], getKey: (item: T) => string) {
  const result = new Map<string, T>();
  items.forEach((item) => {
    const key = getKey(item);
    if (key && !result.has(key)) result.set(key, item);
  });
  return result;
}

/**
 * Operating-loop state from the real captured workspace (direction 3): each
 * stage reads whether the data behind it exists, so the map reflects the
 * seller's actual loop, not a fixed demo. Learning is active whenever there
 * is measured history to learn from - never "later".
 */
function deriveOperatingLoopStates(workspace: SalesWorkspaceData): Map<FlowStep['key'], FlowState> {
  const activities = workspace.activities || [];
  const opportunities = workspace.opportunities || [];
  const activeOpportunities = opportunities.filter((opportunity) => opportunity.status === 'Active');
  const quotes = (workspace.quotes || []).filter((quote) => !quote.__deleted);
  const outcomes = workspace.opportunityOutcomes || [];

  const hasActivities = activities.length > 0;
  const hasContext = activities.some((activity) => activity.linkStatus === 'Linked') || opportunities.length > 0;
  const hasState = activeOpportunities.length > 0 || quotes.length > 0;
  const hasNextAction = activeOpportunities.some((opportunity) => isValidBusinessDate(opportunity.nextActionDate))
    || quotes.some((quote) => Boolean((quote.nextAction || '').trim()));
  const hasOutcome = outcomes.length > 0;

  return new Map<FlowStep['key'], FlowState>([
    ['activity', hasActivities ? 'Completed' : 'Active'],
    ['context', hasContext ? 'Completed' : hasActivities ? 'Active' : 'Missing'],
    ['state', hasState ? 'Completed' : hasActivities ? 'Active' : 'Missing'],
    ['action', hasNextAction ? 'Active' : 'Missing'],
    ['outcome', hasOutcome ? 'Completed' : hasState ? 'Active' : 'Missing'],
    ['review', hasActivities || opportunities.length > 0 ? 'Active' : 'Missing'],
    ['learning', hasOutcome ? 'Active' : 'Missing'],
  ]);
}

function getJourneyStage(hasInteraction: boolean, hasAccount: boolean, hasOpportunity: boolean, hasAction: boolean) {
  if (!hasInteraction) return 'Missing: Capture';
  if (!hasAccount) return 'Missing: Account';
  if (!hasOpportunity) return 'Missing: Opportunity';
  if (!hasAction) return 'Missing: Action';
  return 'Active: Ask Memoire ready';
}
