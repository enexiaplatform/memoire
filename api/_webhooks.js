import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {lookup} from 'node:dns/promises';
import {request} from 'node:https';
import {createClient} from '@supabase/supabase-js';
import {getSupabaseUrl,getSupabaseServiceRoleKey} from './_env.js';

const digest=value=>createHash('sha256').update(value).digest();
export function webhookSignature(secret,timestamp,body){return 'v1='+createHmac('sha256',secret).update(timestamp+'.'+body).digest('hex');}
export function verifyWebhookSignature({secret,timestamp,body,signature,now=Math.floor(Date.now()/1000)}){
 if(typeof body!=='string'||!Number.isFinite(now)||typeof timestamp!=='string'||!/^\d{10}$/.test(timestamp)||Math.abs(now-Number(timestamp))>300||typeof signature!=='string'||!/^v1=[a-f0-9]{64}$/.test(signature)||typeof secret!=='string'||secret.length<32)return false;
 return timingSafeEqual(digest(signature),digest(webhookSignature(secret,timestamp,body)));
}
export function publicIPv4(address){
 if(!/^\d{1,3}(\.\d{1,3}){3}$/.test(address))return false;
 const [a,b,c,...rest]=address.split('.').map(Number);if([a,b,c,...rest].some(part=>part>255))return false;
 return !(a===0||a===10||a===127||a>=224||a===100&&b>=64&&b<=127||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===0||b===168)||a===198&&(b===18||b===19||b===51&&c===100)||a===203&&b===0&&c===113);
}
export function readWebhookTargets(env){
 if(!env.COMMERCIAL_WEBHOOK_TARGETS)return [];
 const targets=JSON.parse(env.COMMERCIAL_WEBHOOK_TARGETS);if(!Array.isArray(targets)||targets.length>3)throw new Error('Invalid webhook targets');
 const ids=new Set();return targets.map(target=>{
  if(!target||Object.keys(target).sort().join(',')!=='id,ownerId,secretEnv,since,url'||!/^\w[\w-]{0,63}$/.test(target.id)||ids.has(target.id)||!/^[-a-f0-9]{36}$/i.test(target.ownerId)
   ||typeof target.since!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(target.since)||!Number.isFinite(Date.parse(target.since))||typeof target.secretEnv!=='string'||!/^COMMERCIAL_WEBHOOK_SECRET_[A-Z0-9_]+$/.test(target.secretEnv))throw new Error('Invalid webhook target');
  const url=new URL(target.url),secret=env[target.secretEnv];if(url.protocol!=='https:'||url.username||url.password||url.hash||url.port&&url.port!=='443'||typeof secret!=='string'||secret.length<32)throw new Error('Invalid webhook target');
  ids.add(target.id);return {...target,url:url.href,secret,targetHash:digest(url.href).toString('hex')};
 });
}

/** Pin DNS to a validated public IPv4 address, retain TLS hostname verification, never follow redirects. */
export async function postSignedWebhook(url,body,headers,{resolve=lookup,send=request}={}){
 const destination=new URL(url);if(destination.protocol!=='https:'||destination.username||destination.password||destination.port&&destination.port!=='443')throw new Error('Invalid webhook destination');
 let dnsTimer;const addresses=await Promise.race([resolve(destination.hostname,{all:true,family:4}),new Promise((_,reject)=>{dnsTimer=setTimeout(()=>reject(new Error('Webhook DNS timeout')),3000);})]).finally(()=>clearTimeout(dnsTimer));if(!addresses.length||addresses.some(item=>!publicIPv4(item.address)))throw new Error('Webhook destination is not public IPv4');
 return new Promise((resolvePromise,reject)=>{
  const outbound=send(destination,{method:'POST',headers:{...headers,'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)},
   lookup:(_host,options,callback)=>options.all?callback(null,[{address:addresses[0].address,family:4}]):callback(null,addresses[0].address,4),servername:destination.hostname},response=>{const status=response.statusCode||0;response.destroy();resolvePromise(status);});
  const timer=setTimeout(()=>outbound.destroy(new Error('Webhook timeout')),3000);outbound.on('error',reject);outbound.on('close',()=>clearTimeout(timer));outbound.end(body);
 });
}

export function createWebhookWorker({env=process.env,clientFactory=()=>createClient(getSupabaseUrl(),getSupabaseServiceRoleKey(),{auth:{persistSession:false}}),deliver=postSignedWebhook}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'method_not_allowed'});}
  const supplied=req.headers?.authorization,expected=env.CRON_SECRET;
  if(!expected||typeof supplied!=='string'||!timingSafeEqual(digest(supplied),digest('Bearer '+expected)))return res.status(401).json({error:'unauthorized'});
  try{const targets=readWebhookTargets(env);if(!targets.length)return res.status(503).json({error:'webhooks_not_configured'});
   const client=clientFactory();let attempted=0,acknowledged=0;
   for(const target of targets){const claimed=await client.rpc('claim_commercial_webhook_batch',{p_owner:target.ownerId,p_endpoint:target.id,p_target_hash:target.targetHash,p_since:target.since});
    if(claimed.error||!Array.isArray(claimed.data))return res.status(503).json({error:'delivery_queue_unavailable',attempted,acknowledged});
    for(const job of claimed.data){if(job.user_id!==target.ownerId||job.endpoint_id!==target.id||job.target_hash!==target.targetHash)throw new Error('Invalid queued scope');
     const body=JSON.stringify(job.notification),timestamp=String(Math.floor(Date.now()/1000));let status=0;attempted++;
     try{status=await deliver(target.url,body,{'Memoire-Notification-Id':job.notification.id,'Memoire-Timestamp':timestamp,'Memoire-Signature':webhookSignature(target.secret,timestamp,body)});}catch{status=0;}
     const completed=await client.rpc('finish_commercial_webhook_attempt',{p_id:job.id,p_lease:job.lease_token,p_status:status});
     if(completed.error||completed.data!==true)return res.status(503).json({error:'delivery_acknowledgement_unconfirmed',attempted,acknowledged});
     if(status>=200&&status<300)acknowledged++;
    }
   }return res.status(200).json({attempted,acknowledged});
  }catch{return res.status(503).json({error:'webhook_worker_unavailable'});}
 };
}
