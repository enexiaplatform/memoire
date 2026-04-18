import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';

export function useEntityUpdate(entityId: string) {
  const { user } = useAuth();

  const updateEntity = async (updates: Record<string, any>) => {
    if (!user || !entityId) return false;

    try {
      const { error } = await supabase
        .from('entities')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', entityId)
        .eq('user_id', user.id);

      if (error) throw error;
      return true;
    } catch (err) {
      console.error('Update failed:', err);
      return false;
    }
  };

  const deleteEntity = async () => {
    if (!user || !entityId) return false;
    
    try {
      const { error } = await supabase
        .from('entities')
        .delete()
        .eq('id', entityId)
        .eq('user_id', user.id);
      
      if (error) throw error;
      return true;
    } catch (err) {
      console.error('Delete failed:', err);
      return false;
    }
  };

  return { updateEntity, deleteEntity };
}
