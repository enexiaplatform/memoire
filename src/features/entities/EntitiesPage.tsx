import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
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

    // Filter by type
    if (currentType !== 'all') {
      result = result.filter(e => e.entity_type === currentType);
    }

    // Filter by search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(e => e.name.toLowerCase().includes(q) || (e.description && e.description.toLowerCase().includes(q)));
    }

    // Sort
    result.sort((a, b) => {
      if (currentSort === 'alphabetical') {
        return a.name.localeCompare(b.name);
      }
      if (currentSort === 'captures') {
        return (b.capture_count || 0) - (a.capture_count || 0);
      }
      // default: recent
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });

    return result;
  }, [entities, currentType, currentSort, searchQuery]);

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Your Memory</h1>
        <div className="flex items-center gap-4 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <input
              type="text"
              placeholder="Filter by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-memoire-500"
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
          </div>
          <button className="whitespace-nowrap px-4 py-2 bg-gray-900 text-white font-medium rounded-lg hover:bg-gray-800 text-sm">
            + New Entity
          </button>
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-32 bg-gray-100 rounded-xl animate-pulse"></div>
          ))}
        </div>
      ) : filteredAndSorted.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredAndSorted.map(entity => (
            <EntityCard key={entity.id} entity={entity} />
          ))}
        </div>
      ) : (
        <div className="text-center py-20 border-2 border-dashed border-gray-200 rounded-xl">
          <div className="text-4xl mb-4 text-gray-300">📂</div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No entities found</h3>
          <p className="text-gray-500 max-w-sm mx-auto">
            {searchQuery 
              ? `No results for "${searchQuery}" in this view.`
              : 'Capture a note mentioning a person or company to create entities automatically.'}
          </p>
        </div>
      )}
    </div>
  );
}
