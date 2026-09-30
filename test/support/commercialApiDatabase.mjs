import {setAuthenticatedOwner} from '../../scripts/release-database-harness.mjs';
/** Exercise the HTTP handler against real PostgreSQL tables/RLS via a small PostgREST-shaped test transport. */
export function databaseClient(db,owner){return {from(table){
 if(!['commercial_events','commercial_commitments'].includes(table))throw new Error('Unexpected API table');
 const filters=[],params=[];let row=null,size=null,ordered=false,single=false;
 const query={select(){return query;},eq(column,value){filters.push(`${column}=$${params.push(value)}`);return query;},gt(column,value){filters.push(`${column}>$${params.push(value)}`);return query;},order(column){if(column!=='id')throw new Error('Unexpected ordering');ordered=true;return query;},limit(value){size=value;return query;},maybeSingle(){single=true;return query;},upsert(value,options){if(options.onConflict!=='user_id,id'||!options.ignoreDuplicates)throw new Error('Unsafe receipt insert');row=value;return query;},then(resolve,reject){return (async()=>{
  await setAuthenticatedOwner(db,owner);
  try{let result;if(row){const columns=Object.keys(row);result=await db.query(`INSERT INTO ${table}(${columns.join(',')}) VALUES(${columns.map((_,i)=>'$'+(i+1)).join(',')}) ON CONFLICT(user_id,id) DO NOTHING RETURNING *`,Object.values(row));}
  else result=await db.query(`SELECT * FROM ${table}${filters.length?' WHERE '+filters.join(' AND '):''}${ordered?' ORDER BY id':''}${size!==null?' LIMIT '+size:''}`,params);
  const rows=result.rows.map(record=>Object.fromEntries(Object.entries(record).map(([key,value])=>[key,value instanceof Date?(key.endsWith('_date')?value.toISOString().slice(0,10):value.toISOString()):value]))); return {data:single?rows[0]||null:rows,error:null};}catch(error){return {data:null,error};}
 })().then(resolve,reject);}};return query;
 }};}
export async function callHandler(handler,request){const response={code:200,headers:{},body:null,setHeader(key,value){this.headers[key]=value;},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};await handler({method:'GET',headers:{authorization:'Bearer owner-a'},...request},response);return response;}
