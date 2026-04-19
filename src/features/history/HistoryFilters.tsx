import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

interface HistoryFiltersProps {
  filters: { search: string; entityId: string | null; tag: string | null; dateRange: string };
  setFilters: (filters: any) => void;
}

export function HistoryFilters({ filters, setFilters }: HistoryFiltersProps) {
  const [entities, setEntities] = useState<any[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  
  useEffect(() => {
    const fetchSelectable = async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;

      const { data: entData } = await supabase
        .from('entities')
        .select('id, name')
        .eq('user_id', userData.user.id)
        .order('updated_at', { ascending: false })
        .limit(20);
        
      if (entData) setEntities(entData);

      // fetch distinct tags from captures
      const { data: capData } = await supabase
        .from('captures')
        .select('tags')
        .eq('user_id', userData.user.id)
        .order('created_at', { ascending: false })
        .limit(50);
        
      if (capData) {
        const uniqueTags = Array.from(new Set(capData.flatMap(c => c.tags || [])));
        setTags(uniqueTags);
      }
    };
    fetchSelectable();
  }, []);

  const hasActiveFilters = filters.entityId !== null || filters.tag !== null || filters.dateRange !== 'all_time';

  return (
    <div className="flex flex-wrap items-center gap-3 mb-8">
      <select 
        value={filters.dateRange}
        onChange={e => setFilters({ ...filters, dateRange: e.target.value })}
        className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        <option value="all_time">All time</option>
        <option value="this_week">This week</option>
        <option value="this_month">This month</option>
      </select>

      <select
        value={filters.entityId || ''}
        onChange={e => setFilters({ ...filters, entityId: e.target.value || null })}
        className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 max-w-[200px] truncate"
      >
        <option value="">All entities</option>
        {entities.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
      </select>

      <select
        value={filters.tag || ''}
        onChange={e => setFilters({ ...filters, tag: e.target.value || null })}
        className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        <option value="">All tags</option>
        {tags.map(t => <option key={t} value={t}>{t}</option>)}
      </select>

      {hasActiveFilters && (
        <button 
          onClick={() => setFilters({ ...filters, entityId: null, tag: null, dateRange: 'all_time' })}
          className="ml-auto text-sm text-gray-500 hover:text-gray-900 font-medium px-3 py-2"
        >
          Clear filters &times;
        </button>
      )}
    </div>
  );
}
