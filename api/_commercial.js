import {createClient} from '@supabase/supabase-js';
import {getBearerToken,verifyUserToken} from './_auth.js';
import {getSupabaseAnonKey,getSupabaseUrl} from './_env.js';
import {enforceRateLimit} from './_rateLimit.js';
import {prepareExternalObservationReceipt,normalizeExternalObservation} from '../src/domain/commercialKernel/externalObservation.ts';
import {eventCodec} from '../src/services/commercialKernel/eventStore.ts';
import {commitmentCodec} from '../src/services/commercialKernel/commitmentStore.ts';
import {evaluateCommercialPolicies} from '../src/domain/commercialKernel/policyEngine.ts';

const bodyKeys=['version','command','observation'];
function commitmentView(record){return {id:record.id,accountId:record.accountId,opportunityId:record.opportunityId,party:record.commitmentParty,
 responsiblePerson:record.ownerLabel,promise:record.commitmentText,dueDate:record.currentDueDate||null,status:record.status,updatedAt:record.updatedAt};}
function receiptView(event){return {id:event.id,receivedAt:event.recordedAt,observation:normalizeExternalObservation(event.structuredPayload),acceptedCommercialTruth:false};}

/** Narrow v1 API. All queries use the caller's JWT and the existing RLS, never service authority. */
export function createCommercialHandler({verify=verifyUserToken,clientForToken=token=>createClient(getSupabaseUrl(),getSupabaseAnonKey(),{global:{headers:{Authorization:`Bearer ${token}`}}}),rateLimit=enforceRateLimit}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  const reply=(status,body)=>res.status(status).json({version:1,...body});
  if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return reply(405,{error:'method_not_allowed'});}
  const preflight=rateLimit(req,'commercial-api-address','',120);if(!preflight.allowed){res.setHeader('Retry-After',String(preflight.retryAfterSeconds));return reply(429,{error:'rate_limited'});}
  try{
   const token=getBearerToken(req.headers),user=await verify(token,undefined,{requireUserId:false});if(!user)return reply(401,{error:'unauthorized'});
   const quota=rateLimit(req,'commercial-api-owner',user.id,60);if(!quota.allowed){res.setHeader('Retry-After',String(quota.retryAfterSeconds));return reply(429,{error:'rate_limited'});}
   const client=clientForToken(token);
   if(req.method==='GET'){
    const query=req.query||{},resource=query.resource||'commitments',limit=query.limit===undefined?50:Number(query.limit),after=query.after;
    if(Object.keys(query).some(key=>!['resource','limit','after'].includes(key))||!['commitments','commitment-recommendations'].includes(resource)
     ||!Number.isInteger(limit)||limit<1||limit>100||query.limit!==undefined&&typeof query.limit!=='string'||after!==undefined&&(typeof after!=='string'||!after||after.length>200))return reply(400,{error:'invalid_query'});
    let request=client.from('commercial_commitments').select('*').eq('user_id',user.id).order('id',{ascending:true}).limit(limit+1);
    if(after)request=request.gt('id',after);
    const {data,error}=await request;if(error||!Array.isArray(data))return reply(503,{error:'storage_unavailable'});
    const records=data.map(row=>commitmentCodec.fromRow(row));
    if(records.some(record=>!record||record.userId!==user.id||record.isSample))return reply(503,{error:'invalid_stored_scope'});
    const page=records.slice(0,limit),nextCursor=records.length>limit?page.at(-1).id:null;
    const items=resource==='commitments'?page.map(commitmentView):evaluateCommercialPolicies({commitments:page,threads:[],opportunities:[],quotes:[],includeSampleRecords:false});
    return reply(200,{resource,scope:'authenticated-owner',basis:'commitments-in-this-page',items,nextCursor});
   }
   const body=req.body;
   if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length!==bodyKeys.length||Object.keys(body).some(key=>!bodyKeys.includes(key))||body.version!==1||body.command!=='receive-observation')return reply(400,{error:'invalid_command'});
   if(new TextEncoder().encode(JSON.stringify(body)).byteLength>128000)return reply(413,{error:'payload_too_large'});
   let event;try{event=await prepareExternalObservationReceipt({userId:user.id,sampleDataActive:false},body.observation);}catch{return reply(400,{error:'invalid_observation'});}
   // Ignore an existing identity during insert; then compare stored content. This is safe under concurrent retries.
   const result=await client.from('commercial_events').upsert(eventCodec.toRow(event,user.id),{onConflict:'user_id,id',ignoreDuplicates:true}).select('*');
   if(result.error)return reply(503,{error:'receipt_not_confirmed',retrySafe:true});
   const stored=await client.from('commercial_events').select('*').eq('user_id',user.id).eq('id',event.id).maybeSingle();
   if(stored.error||!stored.data)return reply(503,{error:'receipt_not_confirmed',retrySafe:true});
   const receipt=eventCodec.fromRow(stored.data);
   if(!receipt||receipt.userId!==user.id||receipt.eventType!=='external_observation_received')return reply(503,{error:'invalid_stored_receipt'});
   if(JSON.stringify(normalizeExternalObservation(receipt.structuredPayload))!==JSON.stringify(event.structuredPayload))return reply(409,{error:'source_version_conflict'});
   const duplicate=!result.data?.length;return reply(duplicate?200:201,{command:'receive-observation',duplicate,receipt:receiptView(receipt)});
  }catch{return reply(503,{error:'service_unavailable'});}
 };
}
