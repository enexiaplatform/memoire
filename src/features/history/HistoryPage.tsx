import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { startOfDay, differenceInDays, format } from 'date-fns';
import { FileText, Search, X } from 'lucide-react';
import { useCaptures } from './useCaptures';
import type { Capture } from './useCaptures';
import { CaptureCard } from './CaptureCard';
import { HistoryFilters } from './HistoryFilters';

function getDateGroupLabel(dateStr: string): string {
  const date = new Date(dateStr);
  const today = startOfDay(new Date());
  const diff = differenceInDays(today, startOfDay(date));

  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return format(date, 'EEEE');
  return format(date, 'MMM d, yyyy');
}

export function HistoryPage() {
  const [filters, setFilters] = useState({
    search: '',
    entityId: null as string | null,
    tag: null as string | null,
    dateRange: 'all_time',
  });

  const [searchInput, setSearchInput] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFilters((prev) => ({ ...prev, search: searchInput }));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const { captures, loading, hasMore, loadMore } = useCaptures(filters);

  const groupedCaptures = useMemo(() => {
    const groups: Record<string, Capture[]> = {};
    captures.forEach((capture) => {
      const label = getDateGroupLabel(capture.created_at);
      if (!groups[label]) groups[label] = [];
      groups[label].push(capture);
    });
    return groups;
  }, [captures]);

  return (
    <div className="mx-auto max-w-3xl pb-24">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">History</h1>
      </div>

      <div className="relative mb-6">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
          <Search className="h-4 w-4 text-gray-400" />
        </div>
        <input
          type="text"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Search captures..."
          className="block w-full rounded-xl border border-gray-200 bg-white py-3 pl-10 pr-10 text-sm leading-5 shadow-sm transition-colors placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        {searchInput && (
          <button
            type="button"
            onClick={() => setSearchInput('')}
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
            aria-label="Clear search"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <HistoryFilters filters={filters} setFilters={setFilters} />

      {!loading && captures.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-gray-100 bg-white py-20 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-50 text-gray-400">
            <FileText className="h-5 w-5" />
          </div>
          <h3 className="mb-2 text-lg font-semibold text-gray-900">
            {filters.search ? `No captures match "${filters.search}"` : 'Nothing captured yet.'}
          </h3>
          <p className="mx-auto mb-6 max-w-sm text-gray-500">
            {filters.search
              ? 'Try a different word or clear search.'
              : 'Start by writing your first note about a meeting, call, or insight from today.'}
          </p>
          {!filters.search ? (
            <Link
              to="/app/capture"
              className="inline-flex items-center justify-center rounded-lg border border-transparent bg-indigo-600 px-6 py-3 text-base font-medium text-white shadow-sm transition-colors hover:bg-indigo-700"
            >
              Capture something -&gt;
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => setSearchInput('')}
              className="font-medium text-indigo-600 hover:text-indigo-800"
            >
              Clear search
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(groupedCaptures).map(([label, groupCaptures]) => (
            <div key={label}>
              <div className="mb-4 flex items-center gap-4">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400">{label}</h3>
                <div className="h-px flex-1 bg-gray-100" />
              </div>
              <div>
                {groupCaptures.map((capture) => (
                  <CaptureCard
                    key={capture.id}
                    capture={capture}
                    onEntityClick={(id) => setFilters({ ...filters, entityId: id })}
                    onTagClick={(tag) => setFilters({ ...filters, tag })}
                  />
                ))}
              </div>
            </div>
          ))}

          {hasMore && captures.length > 0 && (
            <div className="pt-4 text-center">
              <button
                type="button"
                onClick={loadMore}
                className="rounded-lg border border-gray-300 bg-white px-6 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                disabled={loading}
              >
                {loading ? 'Loading more captures...' : 'Load more'}
              </button>
            </div>
          )}
        </div>
      )}

      <footer className="mt-12 border-t border-gray-100 pt-4 pb-8 text-center">
        <p className="text-[12px] text-gray-500">
          Personal sales memory - not a CRM replacement or public scoring system.{' '}
          <Link to="/app/settings" className="transition-colors hover:text-navy hover:underline">
            View boundaries -&gt;
          </Link>
        </p>
      </footer>
    </div>
  );
}
