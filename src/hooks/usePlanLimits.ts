import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

export const PLAN_LIMITS = {
  free: {
    captures_per_month: 30,
    max_entities: 50,
    ai_search: false,
  },
  personal: {
    captures_per_month: Infinity,
    max_entities: Infinity,
    ai_search: true,
  },
  team: {
    captures_per_month: Infinity,
    max_entities: Infinity,
    ai_search: true,
  },
} as const;

export type Tier = keyof typeof PLAN_LIMITS;

export function usePlanLimits() {
  const { user } = useAuth();
  const [currentTier, setCurrentTier] = useState<Tier>('free');
  const [capturesThisMonth, setCapturesThisMonth] = useState(0);
  const [entityCount, setEntityCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchUsage() {
      if (!user) {
        setLoading(false);
        return;
      }

      // 1. Get tier from user_profiles
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('subscription_tier')
        .eq('id', user.id)
        .single();
      
      const tier = (profile?.subscription_tier as Tier) || 'free';
      setCurrentTier(tier);

      // 2. Local fetch limits context if free
      if (tier === 'free') {
        const monthStr = new Date().toISOString().slice(0, 7); // 'YYYY-MM'
        const { data: usage } = await supabase
          .from('usage_monthly')
          .select('capture_count')
          .eq('user_id', user.id)
          .eq('month', monthStr)
          .single();
        
        setCapturesThisMonth(usage?.capture_count || 0);

        const { count } = await supabase
          .from('entities')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id);
        
        setEntityCount(count || 0);
      }
      
      setLoading(false);
    }
    fetchUsage();
  }, [user]);

  const capsLimit = PLAN_LIMITS[currentTier].captures_per_month;
  const entLimit = PLAN_LIMITS[currentTier].max_entities;

  const isNearCaptureLimit = capsLimit !== Infinity && capturesThisMonth >= capsLimit - 5;
  const isAtCaptureLimit = capsLimit !== Infinity && capturesThisMonth >= capsLimit;

  const canCapture = capsLimit === Infinity || capturesThisMonth < capsLimit;
  const canSearch = PLAN_LIMITS[currentTier].ai_search;
  const canCreateEntity = entLimit === Infinity || entityCount < entLimit;

  return {
    currentTier,
    capturesThisMonth,
    entityCount,
    canCapture,
    canSearch,
    canCreateEntity,
    isNearCaptureLimit,
    isAtCaptureLimit,
    loading
  };
}
