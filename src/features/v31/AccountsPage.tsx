import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, ChevronRight, Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { isDemoMode } from '../../lib/demoMode';
import type { Account } from '../../types/v31';
import { readLocalMemory } from './localStore';
import { RouteLoadingFallback } from './RouteLoadingFallback';
import { useSlowLoadingFallback } from './useSlowLoadingFallback';

export function AccountsPage() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const slowLoading = useSlowLoadingFallback(loading);

  const loadAccounts = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    if (isDemoMode) {
      setAccounts(readLocalMemory().accounts.sort((a, b) => b.updated_at.localeCompare(a.updated_at)));
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    if (!error) setAccounts((data || []) as Account[]);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  const visibleAccounts = accounts.filter((account) =>
    account.name.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <header className="mb-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Accounts</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-navy">Living Account Memory</h1>
        <p className="mt-2 max-w-2xl text-sm text-gray-500">
          Every account keeps the customer story, people, pains, objections, Next Actions, and opportunity context together.
        </p>
      </header>

      <div className="mb-5 flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
        <Search className="h-4 w-4 text-gray-400" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search accounts"
          className="w-full bg-transparent text-sm outline-none"
        />
      </div>

      {loading ? (
        slowLoading ? <RouteLoadingFallback onRetry={loadAccounts} /> : <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-500">Loading Account Memory...</div>
      ) : visibleAccounts.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <Building2 className="mx-auto h-8 w-8 text-gray-300" />
          <p className="mt-3 text-sm font-semibold text-gray-900">No Account Memory yet</p>
          <p className="mt-1 text-sm text-gray-500">Your accounts will become Living Memory pages once you capture interactions or import account data.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {visibleAccounts.map((account) => (
            <Link
              key={account.id}
              to={`/app/accounts/${account.id}`}
              className="group rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition hover:border-brand-blue/40 hover:shadow-md"
            >
              <div className="flex items-start gap-4">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-brand-blue">
                  <Building2 className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-lg font-bold text-navy">{account.name}</h2>
                  <p className="mt-1 line-clamp-2 text-sm text-gray-500">{account.summary || 'Capture an interaction to build this Living Memory.'}</p>
                </div>
                <ChevronRight className="h-5 w-5 text-gray-300 transition group-hover:text-brand-blue" />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {account.pain_points.slice(0, 2).map((pain) => (
                  <span key={pain} className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">{pain}</span>
                ))}
                {account.objections.slice(0, 2).map((objection) => (
                  <span key={objection} className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">{objection}</span>
                ))}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
