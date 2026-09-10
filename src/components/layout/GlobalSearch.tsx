import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Compass, CornerDownLeft, Search, X } from 'lucide-react';
import { useAuthContext } from '../../auth/authContext';
import { hasLocalSampleData } from '../../utils/dataMode';
import { getCachedSalesWorkspaceData, loadSalesWorkspaceData } from '../../services/workspaceData';
import { matchesSearchQuery } from '../../utils/textSearch';
import { featureRegistry } from '../../config/featureRegistry';
import type { SalesWorkspaceData } from '../../services/workspaceData';

/**
 * Search Memoire - the one place you type a name instead of remembering a page.
 *
 * ## Why this is a global action and not a destination
 *
 * "Search & Insights" was a rail row, which meant finding a customer began by
 * navigating to the place where finding things happens. That is a filing system
 * asking to be operated. Search is something you do from wherever you are
 * standing, so it lives in the top bar and on Cmd/Ctrl+K, and it is the reason
 * eight surfaces could leave the rail without becoming unreachable.
 *
 * ## What it searches
 *
 * The workspace the app has already loaded - customers, deals - plus the
 * surfaces themselves, so "collections", "margin", "settings" and "vault" are
 * one keystroke away from anywhere without any of them being a nav row. It
 * reads the same cached workspace every page reads; it fetches nothing of its
 * own and computes no second answer.
 *
 * ## What it deliberately is not
 *
 * A chatbot. The product does no AI, and dressing a deterministic index in an
 * assistant's clothes would promise something the code does not do - so the
 * icon is a compass and the empty state names what it can actually find. A
 * question longer than a lookup is handed to the existing deterministic insight
 * engine on /app/ask rather than answered here.
 */

type Hit = {
  id: string;
  kind: 'account' | 'opportunity' | 'surface';
  label: string;
  detail: string;
  to: string;
};

/** Surfaces worth reaching by name. Read from the registry, never hand-listed. */
/**
 * What each relocated surface is called now, and where it lands.
 *
 * The registry keeps the id and the historical label - `stakeholders`,
 * `business-lens`, `cash-collection` - because those are record-keeping facts
 * about the product's history and several contracts read them. What a searcher
 * should be offered is the current name and the current place: somebody typing
 * "stakeholders" is looking for the people at a customer, and telling them the
 * Stakeholders module still exists teaches them a word the interface no longer
 * uses anywhere else.
 */
const SURFACE_LABELS: Record<string, string> = {
  'search-insights': 'Ask your records',
  activity: 'How you worked',
  'business-lens': 'The business picture',
  'cost-analysis': 'Margin',
  'cash-collection': 'Collections',
  stakeholders: 'People',
  'business-vault': 'Business memory',
};

const SURFACE_HINTS: Record<string, string> = {
  'search-insights': 'Ask a question of your own records',
  activity: 'Review · Learning & Analytics',
  'business-lens': 'Review · Learning & Analytics',
  'cost-analysis': 'Money · Margin',
  'cash-collection': 'Money · Collections',
  stakeholders: 'On a customer, under People',
  'business-vault': 'On a customer, under Memory',
  settings: 'Workspace, account, billing, data',
};

/**
 * Words that should still find a surface after it was renamed.
 *
 * Matched against, never shown. Removing a rail row must not make a capability
 * unfindable by the name the operator learned it under - which is the entire
 * argument for reducing the rail in the first place.
 */
const SURFACE_ALIASES: Record<string, string> = {
  activity: 'activity ledger touches history log',
  'business-lens': 'dashboard business lens pipeline concentration analytics',
  'cost-analysis': 'cost analysis margin landed cost profitability',
  'cash-collection': 'cash collection receivable overdue payment collections',
  stakeholders: 'stakeholders people contacts champion buyer decision maker',
  'business-vault': 'business vault memory knowledge graph facts',
  settings: 'settings preferences currency export delete billing plan profile',
};

export function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const sampleDataActive = hasLocalSampleData();
  const dataUserId = sampleDataActive ? undefined : user?.id;

  const [query, setQuery] = useState('');
  const [workspace, setWorkspace] = useState<SalesWorkspaceData | null>(
    () => getCachedSalesWorkspaceData(dataUserId),
  );
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Loaded only once the dialog is opened: the top bar is on every screen and
  // this must cost nothing until somebody actually searches.
  useEffect(() => {
    if (!open || workspace) return;
    let alive = true;
    void loadSalesWorkspaceData(dataUserId)
      .then((data) => { if (alive) setWorkspace(data); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [dataUserId, open, workspace]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    // The field is the whole interface; landing focus anywhere else means the
    // first thing a keyboard user does is press Tab.
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const { body } = document;
    const previous = body.style.overflow;
    body.style.overflow = 'hidden';
    return () => { body.style.overflow = previous; };
  }, [open]);

  const hits = useMemo<Hit[]>(() => {
    const term = query.trim();
    if (!term) return [];

    const accounts: Hit[] = (workspace?.accounts || [])
      .filter((account) => matchesSearchQuery(account.accountName, term))
      .slice(0, 5)
      .map((account) => ({
        id: `account:${account.id}`,
        kind: 'account',
        label: account.accountName,
        detail: account.industry || 'Customer',
        to: `/app/accounts?accountName=${encodeURIComponent(account.accountName)}`,
      }));

    const opportunities: Hit[] = (workspace?.opportunities || [])
      .filter((opportunity) => matchesSearchQuery(
        `${opportunity.opportunityName} ${opportunity.accountName}`,
        term,
      ))
      .slice(0, 5)
      .map((opportunity) => ({
        id: `opportunity:${opportunity.id}`,
        kind: 'opportunity',
        label: opportunity.opportunityName,
        detail: `${opportunity.accountName} · ${opportunity.stage}`,
        to: `/app/opportunities?opportunityId=${encodeURIComponent(opportunity.id)}`,
      }));

    const surfaces: Hit[] = featureRegistry
      .filter((feature) => feature.route && (feature.status === 'core' || feature.status === 'global'))
      .filter((feature) => matchesSearchQuery(
        `${SURFACE_LABELS[feature.id] || feature.label} ${feature.label} ${SURFACE_HINTS[feature.id] || ''} ${SURFACE_ALIASES[feature.id] || ''}`,
        term,
      ))
      .slice(0, 4)
      .map((feature) => ({
        id: `surface:${feature.id}`,
        kind: 'surface',
        label: SURFACE_LABELS[feature.id] || feature.label,
        detail: SURFACE_HINTS[feature.id] || 'Go to',
        to: feature.route as string,
      }));

    return [...accounts, ...opportunities, ...surfaces];
  }, [query, workspace]);

  // A question is longer than a lookup, and the deterministic insight engine
  // already answers those. Offered rather than guessed at.
  const askable = query.trim().length > 0;

  const go = (to: string) => {
    onClose();
    navigate(to);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') { onClose(); return; }
    const total = hits.length + (askable ? 1 : 0);
    if (total === 0) return;
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive((i) => (i + 1) % total); }
    if (event.key === 'ArrowUp') { event.preventDefault(); setActive((i) => (i - 1 + total) % total); }
    if (event.key === 'Enter') {
      event.preventDefault();
      const hit = hits[active];
      if (hit) go(hit.to);
      else go(`/app/ask?q=${encodeURIComponent(query.trim())}`);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center p-4 pt-[10vh] sm:pt-[14vh]">
      <button
        type="button"
        aria-label="Close search"
        onClick={onClose}
        className="fixed inset-0 bg-slate-950/45 backdrop-blur-[1px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search Memoire"
        className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
      >
        <div className="flex items-center gap-2.5 border-b border-gray-100 px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => { setQuery(event.target.value); setActive(0); }}
            onKeyDown={onKeyDown}
            placeholder="Search customers, deals and everywhere else"
            aria-label="Search Memoire"
            className="min-w-0 flex-1 border-0 bg-transparent text-[15px] outline-none placeholder:text-gray-400"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[52vh] overflow-y-auto overscroll-contain p-2">
          {!query.trim() && (
            <p className="px-3 py-6 text-center text-sm leading-6 text-gray-500">
              Type a customer, a deal, or where you want to go.
              <br />
              <span className="text-xs">Everything is searched on this device.</span>
            </p>
          )}

          {query.trim() && hits.length === 0 && (
            <p className="px-3 py-4 text-sm text-gray-500">
              Nothing matched that name.
            </p>
          )}

          {hits.map((hit, index) => (
            <button
              key={hit.id}
              type="button"
              onClick={() => go(hit.to)}
              onMouseEnter={() => setActive(index)}
              aria-current={index === active}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left ${
                index === active ? 'bg-gray-100' : 'hover:bg-gray-50'
              }`}
            >
              <span className="w-[86px] shrink-0 text-[11px] font-bold uppercase tracking-wide text-gray-400">
                {hit.kind === 'surface' ? 'Go to' : hit.kind}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-navy">{hit.label}</span>
                <span className="block truncate text-xs text-gray-500">{hit.detail}</span>
              </span>
            </button>
          ))}

          {askable && (
            <button
              type="button"
              onClick={() => go(`/app/ask?q=${encodeURIComponent(query.trim())}`)}
              onMouseEnter={() => setActive(hits.length)}
              aria-current={hits.length === active}
              className={`mt-1 flex w-full items-center gap-3 rounded-lg border-t border-gray-100 px-3 py-2.5 text-left ${
                hits.length === active ? 'bg-gray-100' : 'hover:bg-gray-50'
              }`}
            >
              <Compass className="h-4 w-4 shrink-0 text-brand-blue" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-sm text-gray-700">
                Ask your records: <span className="font-semibold text-navy">{query.trim()}</span>
              </span>
              <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
