import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import type { EntityWithMeta } from './types';

export function useEntities() {
  const { user } = useAuth();
  const [entities, setEntities] = useState<EntityWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEntities = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);

    try {
      const { data: rawEntities, error: fetchError } = await supabase
        .from('entities')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });

      if (fetchError) throw fetchError;

      const { data: capturesData, error: capturesError } = await supabase
        .from('captures')
        .select('entity_ids')
        .eq('user_id', user.id);

      if (capturesError) throw capturesError;

      // Compute capture counts
      const counts: Record<string, number> = {};
      capturesData?.forEach(cap => {
        cap.entity_ids?.forEach((id: string) => {
          counts[id] = (counts[id] || 0) + 1;
        });
      });

      const processed = (rawEntities || []).map(ent => ({
        ...ent,
        capture_count: counts[ent.id] || 0
      }));

      setEntities(processed);
    } catch (err: any) {
      console.error(err);
      setError('Failed to load entities.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEntities();
  }, [user]);

  return { entities, loading, error, refetch: fetchEntities };
}
