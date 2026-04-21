import { useState, useMemo, useEffect } from 'react';
import { useCaptures, Capture } from './useCaptures';
import { CaptureCard } from './CaptureCard';
import { HistoryFilters } from './HistoryFilters';
import { startOfDay, differenceInDays, format } from 'date-fns';
import { Link } from 'react-router-dom';

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

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters(prev => ({ ...prev, search: searchInput }));
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { captures, loading, hasMore, loadMore } = useCaptures(filters);

  // Group by date
  const groupedCaptures = useMemo(() => {
    const groups: Record<string, Capture[]> = {};
    captures.forEach(c => {
      const label = getDateGroupLabel(c.created_at);
      if (!groups[label]) groups[label] = [];
      groups[label].push(c);
    });
    return groups;
  }, [captures]);

  return (
    <div className="max-w-3xl mx-auto pb-24">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-gray-900">History</h1>
      </div>

      <div className="relative mb-6">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <span className="text-gray-400">🔍</span>
        </div>
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search captures..."
          className="block w-full pl-10 pr-10 py-3 border border-gray-200 rounded-xl leading-5 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:text-sm transition-colors shadow-sm"
        />
        {searchInput && (
          <button 
            onClick={() => setSearchInput('')}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      <HistoryFilters filters={filters} setFilters={setFilters} />

      {!loading && captures.length === 0 ? (
        <div className="text-center py-20 bg-white border border-gray-100 rounded-2xl shadow-sm mt-8">
          <div className="text-4xl mb-4">📝</div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            {filters.search ? `No captures match "${filters.search}"` : 'Nothing captured yet.'}
          </h3>
          <p className="text-gray-500 mb-6 max-w-sm mx-auto">
            {filters.search 
              ? 'Try a different word or clear search.'
              : 'Start by writing your first note about a meeting, call, or insight from today.'}
          </p>
          {!filters.search ? (
            <Link to="/app/capture" className="inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 transition-colors shadow-sm">
              Capture something &rarr;
            </Link>
          ) : (
            <button
              onClick={() => setSearchInput('')}
              className="text-indigo-600 font-medium hover:text-indigo-800"
            >
              Clear search
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(groupedCaptures).map(([label, groupCaptures]) => (
            <div key={label}>
              <div className="flex items-center gap-4 mb-4">
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">{label}</h3>
                <div className="flex-1 h-px bg-gray-100"></div>
              </div>
              <div>
                {groupCaptures.map(capture => (
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
            <div className="text-center pt-4">
              <button
                onClick={loadMore}
                className="px-6 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                disabled={loading}
              >
                {loading ? 'Loading...' : 'Load more'}
              </button>
            </div>
          )}
        </div>
      )}

      <footer className="mt-12 pt-4 border-t border-gray-100 text-center pb-8">
        <p className="text-[12px] text-gray-500">
          Personal knowledge tool — not a hiring signal.{' '}
          <Link to="/app/settings" className="hover:text-navy hover:underline transition-colors">View boundaries &rarr;</Link>
        </p>
      </footer>
    </div>
  );
}
