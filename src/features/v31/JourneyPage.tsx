/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, Circle, Clock3 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { isDemoMode } from '../../lib/demoMode';
import { useAuth } from '../../hooks/useAuth';
import type { Account, Interaction, Opportunity, SalesAction } from '../../types/v31';
import { readLocalMemory } from './localStore';

interface CaptureMemory {
  id: string;
  raw_text: string;
  structured_data: Record<string, unknown> | null;
  status: string | null;
  created_at: string;
}

interface JourneyCard {
  id: string;
  accountName: string;
  opportunityName: string;
  lastInteraction: string;
  blocker: string;
  nextAction: string;
  status: string;
}

interface BrokenLoop {
  id: string;
  problem: string;
  affected: string;
  suggestedFix: string;
}

const staleDays = 14;

const flowSteps = [
  { label: 'Quick Capture', description: 'Save the raw customer note.' },
  { label: 'Structure', description: 'Turn the note into sales memory fields.' },
  { label: 'Account', description: 'Attach memory to the customer account.' },
  { label: 'Opportunity', description: 'Connect the work to an active revenue motion.' },
  { label: 'Action', description: 'Create the next follow-up or task.' },
  { label: 'Ask Memoire', description: 'Use the memory to answer sales questions.' },
  { label: 'Learning', description: 'Later: reusable playbook knowledge.', later: true },
];

export function JourneyPage() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [actions, setActions] = useState<SalesAction[]>([]);
  const [captures, setCaptures] = useState<CaptureMemory[]>([]);
  const [loading, setLoading] = useState(true);

  const loadJourney = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    if (isDemoMode) {
      const memory = readLocalMemory();
      setAccounts(memory.accounts);
      setOpportunities(memory.opportunities);
      setInteractions(memory.interactions);
      setActions(memory.actions);
      setCaptures(memory.captures.map((capture) => ({
        ...capture,
        structured_data: capture.structured_data as unknown as Record<string, unknown>,
      })));
      setLoading(false);
      return;
    }

    const [accountResult, opportunityResult, interactionResult, actionResult, captureResult] = await Promise.all([
      supabase.from('accounts').select('*').eq('user_id', user.id).order('updated_at', { ascending: false }),
      supabase.from('opportunities').select('*').eq('user_id', user.id).order('updated_at', { ascending: false }),
      supabase.from('interactions').select('*').eq('user_id', user.id).order('occurred_at', { ascending: false }).limit(80),
      supabase.from('actions').select('*').eq('user_id', user.id).order('due_date', { ascending: true, nullsFirst: false }),
      supabase.from('captures').select('id,raw_text,structured_data,status,created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(80),
    ]);

    if (!accountResult.error) setAccounts((accountResult.data || []) as Account[]);
    if (!opportunityResult.error) setOpportunities((opportunityResult.data || []) as Opportunity[]);
    if (!interactionResult.error) setInteractions((interactionResult.data || []) as Interaction[]);
    if (!actionResult.error) setActions((actionResult.data || []) as SalesAction[]);
    if (!captureResult.error) setCaptures((captureResult.data || []) as CaptureMemory[]);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadJourney();
  }, [loadJourney]);

  const accountById = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts]);
  const openActions = actions.filter((action) => action.status === 'open');

  const activeJourneys = useMemo(() => {
    const latestInteractionByAccount = latestBy(interactions, (item) => item.account_id || '');
    const openActionByOpportunity = firstBy(openActions, (item) => item.opportunity_id || '');

    const opportunityCards = opportunities
      .filter((opportunity) => !['won', 'lost'].includes(opportunity.stage))
      .map((opportunity): JourneyCard => {
        const account = opportunity.account_id ? accountById.get(opportunity.account_id) : null;
        const latestInteraction = opportunity.account_id ? latestInteractionByAccount.get(opportunity.account_id) : null;
        const action = openActionByOpportunity.get(opportunity.id);
        return {
          id: opportunity.id,
          accountName: account?.name || 'No account linked',
          opportunityName: opportunity.title,
          lastInteraction: latestInteraction?.summary || 'No interaction captured yet',
          blocker: opportunity.blocker || latestInteraction?.objection || 'No blocker captured',
          nextAction: action?.title || opportunity.next_action_text || 'No next action',
          status: getJourneyStatus(Boolean(latestInteraction), Boolean(opportunity), Boolean(action || opportunity.next_action_text)),
        };
      });

    const accountOnlyCards = accounts
      .filter((account) => !opportunities.some((opportunity) => opportunity.account_id === account.id))
      .map((account): JourneyCard => {
        const latestInteraction = latestInteractionByAccount.get(account.id);
        const action = openActions.find((item) => item.account_id === account.id);
        return {
          id: account.id,
          accountName: account.name,
          opportunityName: 'No opportunity linked',
          lastInteraction: latestInteraction?.summary || 'No interaction captured yet',
          blocker: account.objections[0] || latestInteraction?.objection || 'No blocker captured',
          nextAction: action?.title || 'No next action',
          status: getJourneyStatus(Boolean(latestInteraction), false, Boolean(action)),
        };
      });

    return [...opportunityCards, ...accountOnlyCards].slice(0, 12);
  }, [accountById, accounts, interactions, openActions, opportunities]);

  const brokenLoops = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const staleCutoff = new Date();
    staleCutoff.setDate(staleCutoff.getDate() - staleDays);
    const latestInteractionByAccount = latestBy(interactions, (item) => item.account_id || '');
    const openActionByOpportunity = firstBy(openActions, (item) => item.opportunity_id || '');
    const openActionByInteraction = firstBy(openActions, (item) => item.interaction_id || '');
    const sourceCaptureIdsWithAction = new Set(
      interactions
        .filter((interaction) => openActionByInteraction.has(interaction.id))
        .map((interaction) => interaction.source_capture_id)
        .filter(Boolean)
    );

    const loops: BrokenLoop[] = [];

    accounts.forEach((account) => {
      const latestInteraction = latestInteractionByAccount.get(account.id);
      if (!latestInteraction || new Date(latestInteraction.occurred_at) < staleCutoff) {
        loops.push({
          id: `stale-account-${account.id}`,
          problem: 'Account has no recent interaction',
          affected: account.name,
          suggestedFix: 'Capture the latest customer touch or plan a follow-up.',
        });
      }
    });

    opportunities.forEach((opportunity) => {
      if (!['won', 'lost'].includes(opportunity.stage) && !opportunity.next_action_text && !openActionByOpportunity.has(opportunity.id)) {
        loops.push({
          id: `missing-action-${opportunity.id}`,
          problem: 'Opportunity has no next action',
          affected: `${accountById.get(opportunity.account_id || '')?.name || 'Unknown account'} / ${opportunity.title}`,
          suggestedFix: 'Add the next customer-facing follow-up.',
        });
      }
    });

    openActions.forEach((action) => {
      if (action.due_date && action.due_date < today) {
        loops.push({
          id: `overdue-action-${action.id}`,
          problem: 'Action is overdue',
          affected: action.title,
          suggestedFix: 'Complete it or capture the latest outcome.',
        });
      }
    });

    interactions.forEach((interaction) => {
      if (interaction.objection && !openActionByInteraction.has(interaction.id)) {
        loops.push({
          id: `objection-no-action-${interaction.id}`,
          problem: 'Interaction has an objection but no follow-up action',
          affected: accountById.get(interaction.account_id || '')?.name || interaction.summary,
          suggestedFix: 'Create a follow-up action that addresses the objection.',
        });
      }
    });

    captures.forEach((capture) => {
      if (capture.status === 'processed' && !sourceCaptureIdsWithAction.has(capture.id)) {
        loops.push({
          id: `capture-no-action-${capture.id}`,
          problem: 'Capture created memory but no action',
          affected: String(capture.structured_data?.account || capture.raw_text.slice(0, 60)),
          suggestedFix: 'Add a next action if this memory needs follow-up.',
        });
      }
    });

    return loops.slice(0, 20);
  }, [accountById, accounts, captures, interactions, openActions, opportunities]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <header className="mb-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Journey</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-navy">Sales memory loop</h1>
        <p className="mt-2 max-w-2xl text-sm text-gray-500">
          See where customer memory is flowing, what is missing, and what needs the next action.
        </p>
      </header>

      <section className="mb-6 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-bold text-navy">Sales Memory Flow Map</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-7">
          {flowSteps.map((step, index) => (
            <div key={step.label} className={`rounded-lg border p-4 ${step.later ? 'border-gray-200 bg-gray-50 opacity-75' : 'border-blue-100 bg-blue-50/40'}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wide text-brand-blue">{step.later ? 'Later' : `Step ${index + 1}`}</span>
                {!step.later && <CheckCircle2 className="h-4 w-4 text-brand-blue" />}
              </div>
              <p className="mt-2 text-sm font-bold text-gray-900">{step.label}</p>
              <p className="mt-1 text-xs leading-5 text-gray-500">{step.description}</p>
            </div>
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
            <p className="text-sm text-gray-500">Loading journeys...</p>
          ) : activeJourneys.length === 0 ? (
            <p className="text-sm text-gray-500">No active journey yet. Capture a customer interaction from Today.</p>
          ) : (
            <div className="space-y-3">
              {activeJourneys.map((journey) => (
                <article key={journey.id} className="rounded-lg border border-gray-100 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-navy">{journey.accountName}</p>
                      <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-gray-400">{journey.opportunityName}</p>
                    </div>
                    <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-brand-blue">{journey.status}</span>
                  </div>
                  <div className="mt-4 space-y-2 text-sm text-gray-600">
                    <JourneyLine label="Last interaction" value={journey.lastInteraction} />
                    <JourneyLine label="Blocker" value={journey.blocker} />
                    <JourneyLine label="Next action" value={journey.nextAction} />
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-bold text-navy">Broken Loops</h2>
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">{brokenLoops.length}</span>
          </div>

          {loading ? (
            <p className="text-sm text-gray-500">Checking loops...</p>
          ) : brokenLoops.length === 0 ? (
            <div className="rounded-lg border border-green-100 bg-green-50 p-4 text-sm text-green-800">
              No broken loops detected from current memory.
            </div>
          ) : (
            <div className="space-y-3">
              {brokenLoops.map((loop) => (
                <div key={loop.id} className="rounded-lg border border-amber-100 bg-amber-50/70 p-4">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                    <div>
                      <p className="text-sm font-bold text-amber-950">{loop.problem}</p>
                      <p className="mt-1 text-xs text-amber-800">{loop.affected}</p>
                      <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-amber-900">
                        <ArrowRight className="h-3.5 w-3.5" />
                        {loop.suggestedFix}
                      </p>
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

function getJourneyStatus(hasInteraction: boolean, hasOpportunity: boolean, hasAction: boolean) {
  if (!hasInteraction) return 'Needs interaction';
  if (!hasOpportunity) return 'Needs opportunity';
  if (!hasAction) return 'Needs action';
  return 'Loop active';
}
