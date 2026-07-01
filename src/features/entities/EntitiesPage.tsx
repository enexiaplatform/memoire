import { useState, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FileText, Search } from 'lucide-react';
import { useEntities } from './useEntities';
import { EntityCard } from './EntityCard';
import { EntityFilters } from './EntityFilters';

export function EntitiesPage() {
  const { entities, loading } = useEntities();
  const [searchParams, setSearchParams] = useSearchParams();

  const currentType = searchParams.get('type') || 'all';
  const [currentSort, setCurrentSort] = useState('recent');
  const [searchQuery, setSearchQuery] = useState('');

  const handleTypeChange = (type: string) => {
    if (type === 'all') {
      searchParams.delete('type');
    } else {
      searchParams.set('type', type);
    }
    setSearchParams(searchParams);
  };

  const filteredAndSorted = useMemo(() => {
    let result = entities;

    if (currentType !== 'all') {
      result = result.filter((entity) => entity.entity_type === currentType);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((entity) => (
        entity.name.toLowerCase().includes(query) ||
        Boolean(entity.description && entity.description.toLowerCase().includes(query))
      ));
    }

    return [...result].sort((a, b) => {
      if (currentSort === 'alphabetical') return a.name.localeCompare(b.name);
      if (currentSort === 'captures') return (b.capture_count || 0) - (a.capture_count || 0);
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
  }, [entities, currentType, currentSort, searchQuery]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <h1 className="font-display text-[24px] font-bold tracking-tight text-navy">Your Memory</h1>
        <div className="flex w-full items-center gap-4 sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Filter by name..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="w-full rounded-full border-[1.5px] border-gray-200 bg-white py-2 pl-10 pr-4 font-body text-[14px] transition-all focus:border-brand-blue focus:outline-none focus:shadow-[0_0_0_3px_rgba(25,118,210,0.10)]"
            />
          </div>
          <Link
            to="/app/capture"
            className="whitespace-nowrap rounded-full bg-brand-blue px-4 py-2 font-display text-[15px] font-semibold text-white transition-all hover:bg-brand-blue-dark"
          >
            Capture evidence
          </Link>
        </div>
      </div>

      <EntityFilters
        currentType={currentType}
        onTypeChange={handleTypeChange}
        currentSort={currentSort}
        onSortChange={setCurrentSort}
        entityCount={filteredAndSorted.length}
      />

      {loading ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[...Array(8)].map((_, index) => (
            <div key={index} className="h-32 animate-pulse rounded-xl bg-gray-100" />
          ))}
        </div>
      ) : filteredAndSorted.length > 0 ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredAndSorted.map((entity) => (
            <EntityCard key={entity.id} entity={entity} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border-2 border-dashed border-gray-200 py-20 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-50 text-gray-300">
            <FileText className="h-5 w-5" />
          </div>
          <h3 className="mb-2 text-lg font-medium text-gray-900">No entities found</h3>
          <p className="mx-auto max-w-sm text-gray-500">
            {searchQuery
              ? `No results for "${searchQuery}" in this view.`
              : 'Capture a note mentioning a person or company to create entities automatically.'}
          </p>
        </div>
      )}

      <footer className="mt-12 border-t border-gray-100 pt-4 pb-8 text-center">
        <p className="text-[12px] text-gray-500">
          Personal sales memory - not a CRM replacement or public scoring system.{' '}
          <a href="/app/settings" className="transition-colors hover:text-navy hover:underline">
            View boundaries -&gt;
          </a>
        </p>
      </footer>
    </div>
  );
}
