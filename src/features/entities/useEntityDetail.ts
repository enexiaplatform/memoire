import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import type { EntityWithMeta, RelationshipDetails } from './types';

export function useEntityDetail(entityId: string) {
  const { user } = useAuth();
  const [entity, setEntity] = useState<EntityWithMeta | null>(null);
  const [relationships, setRelationships] = useState<RelationshipDetails[]>([]);
  const [captures, setCaptures] = useState<any[]>([]);
  const [deals, setDeals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDetail = useCallback(async () => {
    if (!user || !entityId) return;
    setLoading(true);
    setError(null);

    try {
      // 1. Fetch Entity
      const { data: entData, error: entError } = await supabase
        .from('entities')
        .select('*')
        .eq('id', entityId)
        .eq('user_id', user.id)
        .single();
      
      if (entError) throw entError;
      setEntity(entData);

      // 2. Fetch Relationships
      const { data: relData, error: relError } = await supabase
        .from('relationships')
        .select(`
          id, source_entity_id, target_entity_id, relationship_type, created_at,
          source:source_entity_id(id, name, entity_type),
          target:target_entity_id(id, name, entity_type)
        `)
        .or(`source_entity_id.eq.${entityId},target_entity_id.eq.${entityId}`)
        .eq('user_id', user.id);

      if (relError) throw relError;

      const formattedRels = (relData || []).map(r => {
        const isSource = r.source_entity_id === entityId;
        const related = isSource ? r.target : r.source;
        return {
          id: r.id,
          source_entity_id: r.source_entity_id,
          target_entity_id: r.target_entity_id,
          relationship_type: r.relationship_type,
          created_at: r.created_at,
          related_entity: Array.isArray(related) ? related[0] : related
        } as RelationshipDetails;
      });
      setRelationships(formattedRels);

      // 3. Fetch Captures timeline
      const { data: capData, error: capError } = await supabase
        .from('captures')
        .select('id, raw_text, captured_at, entity_ids')
        .contains('entity_ids', [entityId])
        .eq('user_id', user.id)
        .order('captured_at', { ascending: false });

      if (capError) throw capError;
      setCaptures(capData || []);

      // 4. Fetch Related Deals
      const { data: dealData, error: dealError } = await supabase
        .from('deals')
        .select('*')
        .or(`contact_id.eq.${entityId},stakeholder_contact_ids.cs.{${entityId}}`)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (dealError) {
        console.error('Failed to fetch deals:', dealError);
      }
      setDeals(dealData || []);

    } catch (err) {
      console.error(err);
      setError('Could not load entity details.');
    } finally {
      setLoading(false);
    }
  }, [entityId, user]);

  useEffect(() => {
    void fetchDetail();
  }, [fetchDetail]);

  return { entity, relationships, captures, deals, loading, error, refetch: fetchDetail };
}
