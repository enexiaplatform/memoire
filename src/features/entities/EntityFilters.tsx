interface EntityFiltersProps {
  currentType: string;
  onTypeChange: (type: string) => void;
  currentSort: string;
  onSortChange: (sort: string) => void;
  entityCount: number;
}

export function EntityFilters({ currentType, onTypeChange, currentSort, onSortChange, entityCount }: EntityFiltersProps) {
  const types = [
    { id: 'all', label: 'All' },
    { id: 'contact', label: '👤 Contacts' },
    { id: 'company', label: '🏢 Companies' },
    { id: 'deal', label: '💼 Deals' },
    { id: 'meeting', label: '📅 Meetings' },
    { id: 'insight', label: '💡 Insights' },
    { id: 'competitor', label: '⚔️ Competitors' },
  ];

  return (
    <div className="mb-8">
      <div className="flex overflow-x-auto pb-4 mb-4 gap-2 scrollbar-hide border-b border-gray-200">
        {types.map(t => (
          <button
            key={t.id}
            onClick={() => onTypeChange(t.id)}
            className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              currentType === t.id 
                ? 'bg-gray-900 text-white' 
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <select 
          value={currentSort}
          onChange={(e) => onSortChange(e.target.value)}
          className="bg-transparent border-none text-sm font-medium text-gray-700 cursor-pointer focus:ring-0 px-0"
        >
          <option value="recent">Recently updated ▾</option>
          <option value="alphabetical">Alphabetical A-Z ▾</option>
          <option value="captures">Most captures ▾</option>
        </select>

        <span className="text-sm text-gray-500 font-medium">
          {entityCount} {entityCount === 1 ? 'entity' : 'entities'}
        </span>
      </div>
    </div>
  );
}
