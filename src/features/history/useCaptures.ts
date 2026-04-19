import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { subDays } from 'date-fns';

export interface CaptureEntity {
  id: string;
  name: string;
  entity_type: 'contact' | 'company' | 'deal' | 'meeting' | 'insight' | 'competitor';
}

export interface Capture {
  id: string;
  raw_text: string;
  created_at: string;
  tags: string[];
  entities: CaptureEntity[];
}

export function useCaptures(filters: { search: string; entityId: string | null; tag: string | null; dateRange: string }) {
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);

  const PAGE_SIZE = 20;

  const fetchCaptures = async (currentOffset: number, reset: boolean) => {
    try {
      setLoading(true);
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;

      let selectString = `
        id,
        raw_text,
        created_at,
        tags,
        capture_entities${filters.entityId ? '!inner' : ''} (
          entity_id,
          entities (
            id,
            name,
            entity_type
          )
        )
      `;

      let query = supabase
        .from('captures')
        .select(selectString)
        .eq('user_id', userData.user.id)
        .order('created_at', { ascending: false })
        .range(currentOffset, currentOffset + PAGE_SIZE - 1);

      if (filters.search) {
        query = query.ilike('raw_text', `%${filters.search}%`);
      }

      if (filters.entityId) {
        query = query.eq('capture_entities.entity_id', filters.entityId);
      }

      if (filters.tag) {
        query = query.contains('tags', [filters.tag]);
      }

      const ranges: Record<string, string | null> = {
        'this_week': subDays(new Date(), 7).toISOString(),
        'this_month': subDays(new Date(), 30).toISOString(),
        'all_time': null,
      };

      if (ranges[filters.dateRange]) {
        query = query.gte('created_at', ranges[filters.dateRange]!);
      }

      const { data, error } = await query;
      if (error) throw error;

      const formattedData: Capture[] = (data || []).map((row: any) => ({
        id: row.id,
        raw_text: row.raw_text,
        created_at: row.created_at,
        tags: row.tags || [],
        entities: (row.capture_entities || []).map((ce: any) => ce.entities).filter(Boolean),
      }));

      // if filtering by entity, supabase !inner enforces row presence, but we may only get back the filtered entity.
      // We accept this limitation for the MVP and just show the matched entity.

      if (reset) {
        setCaptures(formattedData);
      } else {
        setCaptures((prev) => [...prev, ...formattedData]);
      }

      setHasMore(formattedData.length === PAGE_SIZE);
    } catch (error) {
      console.error('Error fetching captures:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setOffset(0);
    fetchCaptures(0, true);
  }, [filters.search, filters.entityId, filters.tag, filters.dateRange]);

  const loadMore = () => {
    const nextOffset = offset + PAGE_SIZE;
    setOffset(nextOffset);
    fetchCaptures(nextOffset, false);
  };

  return { captures, loading, hasMore, loadMore };
}
