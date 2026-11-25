import { useEffect, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { captureLocalWorkspaceScope } from '../services/localWorkspaceOwner';
import { supabaseClient } from '../lib/supabaseClient';
import { rowToOpportunity, type CrmLiteOpportunity } from '../services/opportunityStore';

type LinkStatus = 'ordinary' | 'checking' | 'available' | 'unavailable';

export function useReviewOpportunityLink(ownerId: string | undefined, accessToken: string | undefined) {
  const location = useLocation();
  const [params] = useSearchParams();
  const owner = location.state?.reviewOpportunityOwner;
  const id = params.get('opportunityId');
  const [checked, setChecked] = useState<{ key: string; token: string; attempt: number; opportunity: CrmLiteOpportunity | null }>();
  const [attempt, setAttempt] = useState(0);
  const scoped = typeof owner === 'string' && ownerId === owner && Boolean(id) && Boolean(accessToken);

  useEffect(() => {
    if (!scoped || !ownerId || !id || !accessToken) return;
    const controller = new AbortController();
    const isCurrentScope = captureLocalWorkspaceScope(ownerId);
    const client = supabaseClient;
    const check = async () => {
      let opportunity = null;
      try {
        if (client) {
          const { data, error } = await client.from('opportunities').select('*,account:account_id(id,name,account_name)')
            .eq('id', id).eq('user_id', ownerId).abortSignal(controller.signal).maybeSingle();
          if (!error && data?.id === id && data?.user_id === ownerId) opportunity = rowToOpportunity(data);
        }
      } catch {
        // An offline or unavailable server cannot confirm this link.
      }
      if (!controller.signal.aborted && isCurrentScope()) {
        setChecked({ key: location.key, token: accessToken, attempt, opportunity });
      }
    };
    void check();
    return () => controller.abort();
  }, [scoped, ownerId, id, location.key, accessToken, attempt]);

  const current = checked?.key === location.key && checked.token === accessToken && checked.attempt === attempt;
  let status: LinkStatus = 'ordinary';
  if (owner !== undefined) {
    if (!scoped) status = 'unavailable';
    else if (!current) status = 'checking';
    else status = checked.opportunity ? 'available' : 'unavailable';
  }
  return {
    status,
    opportunity: status === 'available' ? checked?.opportunity : null,
    retry: scoped && status === 'unavailable' ? () => setAttempt(value => value + 1) : undefined,
  };
}
