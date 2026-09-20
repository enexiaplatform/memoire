import { supabaseClient } from '../lib/supabaseClient.ts';

const activated=new Set<string>();
/** Refuse a covered cloud write until the server confirms its baseline trigger is installed. */
export async function requireCloudHistoricalIntegrity(userId:string):Promise<void>{
  if(activated.has(userId))return;
  if(!supabaseClient)throw new Error('Account connection is unavailable. Historical state remains in this browser.');
  const {data,error}=await supabaseClient.rpc('activate_commercial_history');
  if(error||!data||!Number.isFinite(Date.parse(String(data))))
    throw new Error('Historical-integrity migration is unavailable. This change remains in this browser until it is deployed.');
  activated.add(userId);
}
