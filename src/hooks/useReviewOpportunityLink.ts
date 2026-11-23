import { useEffect, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { captureLocalWorkspaceScope } from '../services/localWorkspaceOwner';
import { supabaseClient } from '../lib/supabaseClient';

export function useReviewOpportunityLink(ownerId: string | undefined, accessToken: string | undefined) {
  const location = useLocation();
  const [params] = useSearchParams();
  const owner = location.state?.reviewOpportunityOwner;
  const id = params.get('opportunityId');
  const [checked, setChecked] = useState<{ key: string; token: string; available: boolean }>();
  const scoped = typeof owner === 'string' && ownerId === owner && Boolean(id) && Boolean(accessToken);

  useEffect(() => {
    if (!scoped || !ownerId || !id || !accessToken) return;
    const controller = new AbortController();
    const isCurrentScope = captureLocalWorkspaceScope(ownerId);
    const client = supabaseClient;
    const check = async () => {
      let available = false;
      try {
        if (client) {
          const { data, error } = await client.from('opportunities').select('id,user_id')
            .eq('id', id).eq('user_id', ownerId).abortSignal(controller.signal).maybeSingle();
          available = !error && data?.id === id && data?.user_id === ownerId;
        }
      } catch {
        // An offline or unavailable server cannot confirm this link.
      }
      if (!controller.signal.aborted && isCurrentScope()) {
        setChecked({ key: location.key, token: accessToken, available });
      }
    };
    void check();
    return () => controller.abort();
  }, [scoped, ownerId, id, location.key, accessToken]);

  if (owner === undefined) return 'ordinary';
  if (!scoped) return 'unavailable';
  if (checked?.key !== location.key || checked.token !== accessToken) return 'checking';
  return checked.available ? 'available' : 'unavailable';
}
