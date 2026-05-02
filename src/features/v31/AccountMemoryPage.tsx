/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CircleAlert, Clock3, ContactRound, Target } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { isDemoMode } from '../../lib/demoMode';
import type { Account, Contact, Interaction, Opportunity, SalesAction } from '../../types/v31';
import { readLocalMemory } from './localStore';

export function AccountMemoryPage() {
  const { accountId } = useParams<{ accountId: string }>();
  const { user } = useAuth();
  const [account, setAccount] = useState<Account | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [actions, setActions] = useState<SalesAction[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAccountMemory = useCallback(async () => {
    if (!user || !accountId) return;
    setLoading(true);

    if (isDemoMode) {
      const memory = readLocalMemory();
      setAccount(memory.accounts.find((item) => item.id === accountId) || null);
      setContacts(memory.contacts.filter((item) => item.account_id === accountId));
      setOpportunities(memory.opportunities.filter((item) => item.account_id === accountId));
      setInteractions(memory.interactions
        .filter((item) => item.account_id === accountId)
        .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)));
      setActions(memory.actions.filter((item) => item.account_id === accountId && item.status === 'open'));
      setLoading(false);
      return;
    }

    const [accountResult, contactsResult, opportunitiesResult, interactionsResult, actionsResult] = await Promise.all([
      supabase.from('accounts').select('*').eq('user_id', user.id).eq('id', accountId).single(),
      supabase.from('contacts').select('*').eq('user_id', user.id).eq('account_id', accountId).order('updated_at', { ascending: false }),
      supabase.from('opportunities').select('*').eq('user_id', user.id).eq('account_id', accountId).order('updated_at', { ascending: false }),
      supabase.from('interactions').select('*').eq('user_id', user.id).eq('account_id', accountId).order('occurred_at', { ascending: false }).limit(12),
      supabase.from('actions').select('*').eq('user_id', user.id).eq('account_id', accountId).eq('status', 'open').order('due_date', { ascending: true, nullsFirst: false }),
    ]);

    if (!accountResult.error) setAccount(accountResult.data as Account);
    if (!contactsResult.error) setContacts((contactsResult.data || []) as Contact[]);
    if (!opportunitiesResult.error) setOpportunities((opportunitiesResult.data || []) as Opportunity[]);
    if (!interactionsResult.error) setInteractions((interactionsResult.data || []) as Interaction[]);
    if (!actionsResult.error) setActions((actionsResult.data || []) as SalesAction[]);
    setLoading(false);
  }, [accountId, user]);

  useEffect(() => {
    loadAccountMemory();
  }, [loadAccountMemory]);

  if (loading) {
    return <div className="mx-auto max-w-5xl px-6 py-8 text-sm text-gray-500">Loading account memory...</div>;
  }

  if (!account) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-8">
        <Link to="/app/accounts" className="inline-flex items-center gap-2 text-sm font-semibold text-gray-500 hover:text-navy">
          <ArrowLeft className="h-4 w-4" />
          Back to accounts
        </Link>
        <p className="mt-6 text-sm text-gray-500">Account not found.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <Link to="/app/accounts" className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-gray-500 hover:text-navy">
        <ArrowLeft className="h-4 w-4" />
        Back to accounts
      </Link>

      <header className="mb-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Living memory card</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-navy">{account.name}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-600">{account.summary || 'Capture more interactions to grow this account memory.'}</p>
      </header>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="space-y-5">
          <MemorySection title="Contacts" icon={<ContactRound className="h-4 w-4" />}>
            {contacts.length === 0 ? <EmptyLine text="No contacts yet." /> : contacts.map((contact) => (
              <div key={contact.id} className="rounded-lg border border-gray-100 p-3">
                <p className="text-sm font-semibold text-gray-900">{contact.name}</p>
                <p className="text-xs text-gray-500">{contact.role || 'Role unknown'}</p>
              </div>
            ))}
          </MemorySection>

          <MemorySection title="Open actions" icon={<Clock3 className="h-4 w-4" />}>
            {actions.length === 0 ? <EmptyLine text="No open actions." /> : actions.map((action) => (
              <div key={action.id} className="rounded-lg border border-blue-100 bg-blue-50/50 p-3">
                <p className="text-sm font-semibold text-gray-900">{action.title}</p>
                <p className="text-xs text-gray-500">{action.due_date || 'No due date'}</p>
              </div>
            ))}
          </MemorySection>

          <MemorySection title="Pain points and objections" icon={<CircleAlert className="h-4 w-4" />}>
            <TagList title="Pain points" items={account.pain_points} />
            <TagList title="Objections" items={account.objections} warm />
          </MemorySection>
        </div>

        <div className="space-y-5">
          <MemorySection title="Opportunities" icon={<Target className="h-4 w-4" />}>
            {opportunities.length === 0 ? <EmptyLine text="No opportunities linked yet." /> : opportunities.map((opportunity) => (
              <div key={opportunity.id} className={`rounded-lg border p-4 ${opportunity.next_action_text ? 'border-gray-100' : 'border-amber-200 bg-amber-50/60'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-gray-900">{opportunity.title}</p>
                    <p className="mt-1 text-xs text-gray-500">{opportunity.stage} / {opportunity.confidence} confidence</p>
                  </div>
                  <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600">{opportunity.urgency}</span>
                </div>
                <p className="mt-3 text-xs text-gray-600">{opportunity.next_action_text || 'At risk: no next action'}</p>
              </div>
            ))}
          </MemorySection>

          <MemorySection title="Latest interactions" icon={<Clock3 className="h-4 w-4" />}>
            {interactions.length === 0 ? <EmptyLine text="No interactions yet." /> : interactions.map((interaction) => (
              <div key={interaction.id} className="border-l-2 border-brand-blue/30 pl-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  {new Date(interaction.occurred_at).toLocaleDateString()} / {interaction.interaction_type}
                </p>
                <p className="mt-1 text-sm leading-6 text-gray-800">{interaction.summary}</p>
              </div>
            ))}
          </MemorySection>
        </div>
      </div>
    </div>
  );
}

function MemorySection({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-gray-50 text-brand-blue">{icon}</span>
        <h2 className="text-base font-bold text-navy">{title}</h2>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <p className="text-sm text-gray-500">{text}</p>;
}

function TagList({ title, items, warm = false }: { title: string; items: string[]; warm?: boolean }) {
  return (
    <div>
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">{title}</p>
      <div className="flex flex-wrap gap-2">
        {items.length === 0 ? (
          <span className="text-sm text-gray-500">None captured.</span>
        ) : items.map((item) => (
          <span key={item} className={`rounded-full px-2.5 py-1 text-xs font-medium ${warm ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-700'}`}>
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
