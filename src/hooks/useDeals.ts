import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';
import type { Deal } from '../types/Deal';

export function useDeals(filters?: { outcome?: string; revenue_band?: string }) {
  const { user } = useAuth();
  const outcomeFilter = filters?.outcome;
  const revenueBandFilter = filters?.revenue_band;
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDeals = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);

    try {
      let query = supabase
        .from('deals')
        .select(`
          *,
          contact:contact_id(id, name)
        `)
        .eq('user_id', user.id)
        .order('close_date', { ascending: false });

      if (outcomeFilter) {
        query = query.eq('outcome', outcomeFilter);
      }
      if (revenueBandFilter) {
        query = query.eq('revenue_band', revenueBandFilter);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;
      setDeals(data || []);
    } catch (err: any) {
      console.error(err);
      setError('Failed to load deals.');
    } finally {
      setLoading(false);
    }
  }, [outcomeFilter, revenueBandFilter, user]);

  useEffect(() => {
    void fetchDeals();
  }, [fetchDeals]);

  return { deals, loading, error, refetch: fetchDeals };
}

export function useDeal(dealId: string | undefined) {
  const { user } = useAuth();
  const [deal, setDeal] = useState<Deal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDeal = useCallback(async () => {
    if (!user || !dealId) return;
    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('deals')
        .select(`
          *,
          contact:contact_id(id, name, entity_type, attributes)
        `)
        .eq('id', dealId)
        .eq('user_id', user.id)
        .single();

      if (fetchError) throw fetchError;
      setDeal(data);
    } catch (err: any) {
      console.error(err);
      setError('Failed to load deal.');
    } finally {
      setLoading(false);
    }
  }, [dealId, user]);

  useEffect(() => {
    void fetchDeal();
  }, [fetchDeal]);

  return { deal, loading, error, refetch: fetchDeal };
}

export function useDealMutations() {
  const { user } = useAuth();

  const createDeal = async (deal: Partial<Deal>) => {
    if (!user) return { data: null, error: 'User not authenticated' };
    const { data, error } = await supabase
      .from('deals')
      .insert({ ...deal, user_id: user.id })
      .select()
      .single();
    return { data, error };
  };

  const updateDeal = async (id: string, updates: Partial<Deal>) => {
    if (!user) return { error: 'User not authenticated' };
    const { error } = await supabase
      .from('deals')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', user.id);
    return { error };
  };

  const deleteDeal = async (id: string) => {
    if (!user) return { error: 'User not authenticated' };
    const { error } = await supabase
      .from('deals')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);
    return { error };
  };

  return { createDeal, updateDeal, deleteDeal };
}
