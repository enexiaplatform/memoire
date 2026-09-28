import { supabaseClient } from '../lib/supabaseClient.ts';
import { canonicalContracts, type RecordData } from './canonicalDurability.ts';
import { historicalSources } from './historicalIntegrity.ts';
import type { BackupEnvelope, RestorePlan } from '../utils/workspaceBackup.ts';

type CloudSection={user_id?:string;data?:Record<string,RecordData[]>};
export type HistoricalCloudRestoreResult={status:'restored'|'no_op';lineage_id?:string};
const coveredTables=Object.keys(historicalSources);

/** One server transaction owns current covered rows, original revisions, and coverage. */
export async function restoreCloudHistoricalScope(envelope:BackupEnvelope,plan:RestorePlan,userId:string):Promise<HistoricalCloudRestoreResult>{
  if(!supabaseClient)throw new Error('Account connection is unavailable. Nothing was restored to the account.');
  const cloud=envelope.cloudData as CloudSection|undefined;
  if(cloud?.user_id&&cloud.user_id!==userId)throw new Error('This historical backup belongs to another account.');
  const byKey=new Map(plan.writes.map(write=>[write.key,write.value]));
  const sources:Record<string,RecordData[]>={};
  for(const table of coveredTables){
    const raw=cloud?.data?.[table];
    if(raw){sources[table]=raw;continue;}
    if(cloud?.data)throw new Error(`The cloud backup is missing ${table}; historical restore was not started.`);
    const contract=canonicalContracts.find(item=>item.table===table)!;
    const local=byKey.get(contract.key);
    sources[table]=local?(JSON.parse(local) as RecordData[]).map(record=>contract.encode(record,userId)):[];
  }
  const coverage=cloud?.data?.commercial_history_coverage;
  const revisions=cloud?.data?.commercial_state_revisions;
  if(Boolean(coverage)!==Boolean(revisions))throw new Error('Cloud history coverage and revisions must be backed up together.');
  if(coverage&&coverage.length>1)throw new Error('The backup has more than one history boundary.');
  if(coverage?.length===0&&revisions?.length)throw new Error('The backup has revisions without a verified boundary.');
  if(!coverage?.length&&(byKey.has('memoire.stateRevisions.v1')||byKey.has('memoire.historyCoverage.v1')))
    throw new Error('Browser-only historical revisions cannot be restored to an account without their original cloud rows.');
  const accounts=cloud?.data?.accounts||(() => {
    const contract=canonicalContracts.find(item=>item.table==='accounts')!;
    const local=byKey.get(contract.key);
    return local?(JSON.parse(local) as RecordData[]).map(record=>contract.encode(record,userId)):[];
  })();
  const quoteContract=canonicalContracts.find(item=>item.table==='quotes')!;
  const localQuotes=byKey.get(quoteContract.key);
  const quotes=cloud?.data?.quotes||(localQuotes?(JSON.parse(localQuotes) as RecordData[]).map(record=>quoteContract.encode(record,userId)):[]);
  const requiredQuoteIds=new Set(sources.commercial_money_gates.filter(gate=>gate.money_source_type==='quote_value').map(gate=>gate.money_source_id));
  const quoteParents=quotes.filter(quote=>requiredQuoteIds.has(quote.id));
  if(quoteParents.length!==requiredQuoteIds.size)throw new Error('The backup is missing a Quote referenced by a Money Gate. Nothing was restored to the account.');
  const payload={user_id:userId,format_version:envelope.formatVersion||1,exported_at:envelope.exportedAt,
    coverage:coverage?.[0]||null,revisions:revisions||[],sources,parents:accounts,quote_parents:quoteParents};
  const {data,error}=await supabaseClient.rpc('restore_commercial_history',{payload});
  if(error)throw new Error(`Account history restore failed; no covered account state was applied. ${error.message}`);
  const result=data as HistoricalCloudRestoreResult|{status?:string}|null;
  if(result?.status==='different_lineage')throw new Error('Account history belongs to a different verified workspace lineage. Nothing was changed.');
  if(result?.status==='diverged')throw new Error('Account history has newer or different accepted revisions. Nothing was changed.');
  if(result?.status!=='restored'&&result?.status!=='no_op')throw new Error('Account history restore returned an unknown result. Keep the backup and retry.');
  return result as HistoricalCloudRestoreResult;
}
