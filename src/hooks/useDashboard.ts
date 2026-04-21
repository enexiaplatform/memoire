import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { HeatmapCell, EntityCount } from '../types/dashboard';
import type { Capture } from '../types';

export function useDashboard() {
  const [loading, setLoading] = useState(true);
  const [heatmap, setHeatmap] = useState<HeatmapCell[]>([]);
  const [inventory, setInventory] = useState<EntityCount[]>([]);
  const [recentCaptures, setRecentCaptures] = useState<Capture[]>([]);

  useEffect(() => {
    async function loadDashboard() {
      setLoading(true);
      
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;

      if (!userId) {
         setLoading(false);
         return;
      }

      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      
      const { data: capturesData } = await supabase
        .from('captures')
        .select('created_at')
        .gte('created_at', ninetyDaysAgo.toISOString());

      const heatmapMap = new Map<string, number>();
      if (capturesData) {
        capturesData.forEach((c: any) => {
           const day = c.created_at.split('T')[0];
           heatmapMap.set(day, (heatmapMap.get(day) || 0) + 1);
        });
      }
      
      const heatmapCells: HeatmapCell[] = [];
      for (let i = 89; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dayStr = d.toISOString().split('T')[0];
        heatmapCells.push({ date: dayStr, count: heatmapMap.get(dayStr) || 0 });
      }

      const types: ('contact' | 'deal' | 'insight' | 'meeting')[] = ['contact', 'deal', 'insight', 'meeting'];
      const counts: EntityCount[] = [];
      
      await Promise.all(types.map(async (t) => {
        const { count } = await supabase
          .from('entities')
          .select('*', { count: 'exact', head: true })
          .eq('entity_type', t);
        
        counts.push({ type: (t + 's') as any, count: count || 0 });
      }));

      const { data: recent } = await supabase
        .from('captures')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

      setHeatmap(heatmapCells);
      setInventory(counts);
      setRecentCaptures((recent as Capture[]) || []);
      
      setLoading(false);
    }
    
    loadDashboard();
  }, []);

  return { heatmap, inventory, recentCaptures, loading };
}
