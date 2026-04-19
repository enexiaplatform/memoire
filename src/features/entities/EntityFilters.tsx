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
            className={`whitespace-nowrap px-4 py-1.5 rounded-full text-[14px] font-semibold font-body transition-colors ${
              currentType === t.id 
                ? 'bg-brand-blue text-white' 
                : 'bg-transparent border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-900'
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
