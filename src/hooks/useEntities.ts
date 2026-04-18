import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Entity, EntityType } from '../types';

export function useEntities() {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEntities = useCallback(async (entityType?: EntityType) => {
    setLoading(true);
    setError(null);

    let query = supabase.from('entities').select('*').order('created_at', { ascending: false });

    if (entityType) {
      query = query.eq('entity_type', entityType);
    }

    const { data, error: fetchError } = await query;

    if (fetchError) {
      setError(fetchError.message);
      setLoading(false);
      return;
    }

    setEntities(data as Entity[]);
    setLoading(false);
  }, []);

  const createEntity = useCallback(
    async (entity: Omit<Entity, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => {
      setError(null);
      const { data, error: createError } = await supabase
        .from('entities')
        .insert(entity)
        .select()
        .single();

      if (createError) {
        setError(createError.message);
        return null;
      }

      setEntities((prev) => [data as Entity, ...prev]);
      return data as Entity;
    },
    []
  );

  const updateEntity = useCallback(
    async (id: string, updates: Partial<Pick<Entity, 'name' | 'description' | 'attributes' | 'tags'>>) => {
      setError(null);
      const { data, error: updateError } = await supabase
        .from('entities')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (updateError) {
        setError(updateError.message);
        return null;
      }

      setEntities((prev) => prev.map((e) => (e.id === id ? (data as Entity) : e)));
      return data as Entity;
    },
    []
  );

  const deleteEntity = useCallback(async (id: string) => {
    setError(null);
    const { error: deleteError } = await supabase.from('entities').delete().eq('id', id);

    if (deleteError) {
      setError(deleteError.message);
      return false;
    }

    setEntities((prev) => prev.filter((e) => e.id !== id));
    return true;
  }, []);

  return {
    entities,
    loading,
    error,
    fetchEntities,
    createEntity,
    updateEntity,
    deleteEntity,
  };
}
