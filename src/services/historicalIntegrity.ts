import { applyLocalRestore } from './restoreJournal.ts';

/** M8 source manifest. Derived projections and the M7 Decision snapshot are not revisions. */
export const historicalSources = {
  opportunities: {key:'memoire.opportunities.v1'},
  commercial_conditions: {key:'memoire.commercialConditions.v1'},
  commercial_evidence: {key:'memoire.commercialEvidence.v1'},
  commercial_outcome_requirements: {key:'memoire.outcomeRequirements.v1'},
  commercial_dependencies: {key:'memoire.commercialDependencies.v1'},
  commercial_timing_assertions: {key:'memoire.commercialTiming.v1'},
  commercial_commitments: {key:'memoire.commercialCommitments.v1'},
} as const;
/** Reconstruction coverage, separate from selective semantic Commercial Events. */
export const historicallyDerivedProjections = {
  conditionEpistemics: {sources:['commercial_conditions','commercial_evidence'],complete:true},
  requirementResolution: {sources:['commercial_outcome_requirements','commercial_conditions','commercial_evidence'],complete:true},
  nextBlockingQuestion: {sources:['commercial_outcome_requirements','commercial_conditions','commercial_evidence','commercial_dependencies'],complete:true},
  knownBlockers: {sources:['commercial_outcome_requirements','commercial_conditions','commercial_evidence','commercial_dependencies'],complete:true},
  buyerProgress: {sources:['opportunities','commercial_commitments','commercial_outcome_requirements','commercial_conditions','commercial_evidence','commercial_dependencies'],complete:false,
    gap:'PO and payment Events are not revision-covered; quote/receivable alternatives are mutable and unversioned; edited or deleted Activities cannot be reconstructed'},
  commercialTime: {sources:['opportunities','commercial_outcome_requirements','commercial_conditions','commercial_evidence','commercial_dependencies','commercial_timing_assertions','commercial_commitments'],complete:true},
  forecastDefensibility: {sources:['opportunities','commercial_outcome_requirements','commercial_conditions','commercial_evidence','commercial_dependencies','commercial_timing_assertions','commercial_commitments'],complete:true},
} as const;
export type HistoricalSource = keyof typeof historicalSources;
export const HISTORICAL_REVISIONS_KEY='memoire.stateRevisions.v1';
export const HISTORICAL_COVERAGE_KEY='memoire.historyCoverage.v1';
export const REVISION_SCHEMA_VERSION=1;
export type StateRevision={id:string;scope:string;entityType:HistoricalSource;entityId:string;revisionNo:number;
  mutationId:string;operation:'baseline'|'create'|'update'|'delete';recordedAt:string;schemaVersion:1;state:Record<string,unknown>|null};
export type HistoryCoverage={scope:string;historyGuaranteedFrom:string;schemaVersion:1;lineageId?:string};
export type HistoryRead={status:'available';revision:StateRevision|null;coverage:HistoryCoverage}
  |{status:'pre_coverage'|'not_activated'|'corrupt'|'unsupported_schema'|'sequence_gap';revision:null;coverage:HistoryCoverage|null};
type Row=Record<string,unknown>&{id:string;userId?:string|null;isSample?:boolean;source?:string};
const parse=<T,>(storage:Storage,key:string,fallback:T):T=>{const raw=storage.getItem(key);return raw?JSON.parse(raw) as T:fallback;};
const browserStorage=():Storage=>{
  const storage=(typeof window!=='undefined'?window.localStorage:undefined)||(typeof localStorage!=='undefined'?localStorage:undefined);
  if(!storage)throw new Error('This browser has no local storage available for historical state.');
  return storage;
};
const scopeOf=(row:Row)=>row.isSample===true||row.source==='demo'?'sample':row.userId||'guest';
const identity=(row:Row)=>`${scopeOf(row)}:${row.id}`;
const id=()=>typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(36).slice(2)}`;
const sourceState=(type:HistoricalSource,row:Row):Record<string,unknown>=>{
  const source=historicalSources[type];
  void source;
  const {storageMode: _storageMode,...state}=row;
  void _storageMode;
  return JSON.parse(JSON.stringify(state)) as Record<string,unknown>;
};
const semanticState=(type:HistoricalSource,row:Row)=>{
  const {updatedAt: _updatedAt,...state}=sourceState(type,row);void _updatedAt;return state;
};
const semanticSnapshot=(state:Record<string,unknown>)=>{
  const {updatedAt: _updatedAt,...semantic}=state;void _updatedAt;return semantic;
};
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const stable=(value:unknown):string=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)
  ?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))):item);
const readRows=(storage:Storage,key:string):Row[]=>{
  const value=parse<unknown>(storage,key,[]);
  if(!Array.isArray(value))throw new Error(`${key}: historical source is unreadable.`);
  if(value.some(row=>!row||typeof row!=='object'||Array.isArray(row)||typeof row.id!=='string'||!row.id))
    throw new Error(`${key}: historical source has an invalid identity.`);
  return value as Row[];
};
function validateChain(rows:StateRevision[],coverage:HistoryCoverage[],scope:string){
  const boundary=coverage.find(c=>c.scope===scope);
  if(!boundary)return;
  if(boundary.schemaVersion!==1)throw new Error('Unsupported historical coverage schema.');
  const counters=new Map<string,number>();
  for(const row of rows.filter(r=>r.scope===scope)){
    if(row.schemaVersion!==1)throw new Error('Unsupported revision schema version.');
    const key=`${row.entityType}:${row.entityId}`;
    const expected=(counters.get(key)||0)+1;
    if(row.revisionNo!==expected)throw new Error('Historical revision sequence has a gap.');
    counters.set(key,expected);
  }
}
function baselineFor(storage:Storage,scope:string,at:string):StateRevision[]{
  const result:StateRevision[]=[];
  for(const [entityType,source] of Object.entries(historicalSources) as [HistoricalSource,{key:string}][]){
    for(const row of readRows(storage,source.key).filter(r=>scopeOf(r)===scope)){
      result.push({id:id(),scope,entityType,entityId:row.id,revisionNo:1,mutationId:id(),operation:'baseline',
        recordedAt:at,schemaVersion:1,state:sourceState(entityType,row)});
    }
  }
  return result;
}
export function buildHistoricalBaselineFromCollections(collections:Record<string,unknown>,scope:string,at:string){
  const revisions:StateRevision[]=[];
  for(const [entityType,source] of Object.entries(historicalSources) as [HistoricalSource,{key:string}][]){
    const rows=collections[source.key];
    if(rows!==undefined&&!Array.isArray(rows))throw new Error(`${source.key}: expected canonical records for historical baseline.`);
    for(const row of (rows||[]) as Row[]){
      if(!row||typeof row.id!=='string'||!row.id)throw new Error(`${source.key}: invalid historical baseline identity.`);
      if(scopeOf(row)!==scope)continue;
      revisions.push({id:id(),scope,entityType,entityId:row.id,revisionNo:1,mutationId:id(),operation:'baseline',
        recordedAt:at,schemaVersion:1,state:sourceState(entityType,row)});
    }
  }
  return {coverage:[{scope,historyGuaranteedFrom:at,schemaVersion:1,lineageId:id()}] as HistoryCoverage[],revisions};
}
export function validateHistoricalBundle(revisions:StateRevision[],coverage:HistoryCoverage[],collections:Record<string,unknown>){
  if(!Array.isArray(revisions)||!Array.isArray(coverage))throw new Error('Historical bundle must contain revision and coverage lists.');
  const scopes=new Set<string>(),ids=new Set<string>(),mutations=new Set<string>();
  for(const marker of coverage){
    if(!marker||typeof marker.scope!=='string'||!marker.scope||marker.schemaVersion!==1
      ||!Number.isFinite(Date.parse(marker.historyGuaranteedFrom))||scopes.has(marker.scope))
      throw new Error('Invalid or duplicate historical coverage boundary.');
    scopes.add(marker.scope);
  }
  const grouped=new Map<string,StateRevision[]>();
  for(const row of revisions){
    if(!row||!scopes.has(row.scope)||!Object.hasOwn(historicalSources,row.entityType)||!row.entityId
      ||!row.id||!row.mutationId||ids.has(row.id)||mutations.has(`${row.scope}:${row.mutationId}`)
      ||row.schemaVersion!==1||!['baseline','create','update','delete'].includes(row.operation)
      ||!Number.isFinite(Date.parse(row.recordedAt))||row.operation==='delete'&&row.state!==null
      ||row.operation!=='delete'&&(!row.state||typeof row.state!=='object'||Array.isArray(row.state)))
      throw new Error('Invalid historical revision.');
    ids.add(row.id);mutations.add(`${row.scope}:${row.mutationId}`);
    const marker=coverage.find(c=>c.scope===row.scope)!;
    if(row.recordedAt<marker.historyGuaranteedFrom)throw new Error('Revision precedes verified history boundary.');
    const key=`${row.scope}:${row.entityType}:${row.entityId}`;const group=grouped.get(key)||[];group.push(row);grouped.set(key,group);
  }
  for(const rows of grouped.values()){
    rows.sort((a,b)=>a.revisionNo-b.revisionNo);
    for(let i=0;i<rows.length;i++){
      if(rows[i].revisionNo!==i+1||i&&Date.parse(rows[i].recordedAt)<Date.parse(rows[i-1].recordedAt))
        throw new Error('Historical revision sequence is incomplete or out of order.');
    }
    if(!['baseline','create'].includes(rows[0].operation))throw new Error('Historical entity has no baseline or creation.');
  }
  for(const [entityType,source] of Object.entries(historicalSources) as [HistoricalSource,{key:string}][]){
    const current=collections[source.key];if(current===undefined)continue;
    if(!Array.isArray(current))throw new Error('Historical current-state collection is malformed.');
    const live=new Set<string>();
    for(const row of current as Row[]){
      const key=`${scopeOf(row)}:${entityType}:${row.id}`;
      live.add(key);
      if(!scopes.has(scopeOf(row)))continue;
      const latest=grouped.get(key)?.at(-1);
      if(!latest||latest.state===null||stable(semanticSnapshot(latest.state))!==stable(semanticState(entityType,row)))
        throw new Error(`Historical revision does not match current ${entityType} state.`);
    }
    for(const [key,revisions] of grouped){
      if(!key.includes(`:${entityType}:`)||!scopes.has(key.slice(0,key.indexOf(':'))))continue;
      if(revisions.at(-1)?.state!==null&&!live.has(key))
        throw new Error(`Historical revision has no current ${entityType} state.`);
    }
  }
}
/** First activation is a single rollback-journal transaction across baseline and marker. */
export function activateLocalHistoricalIntegrity(scope:string,storage:Storage=browserStorage(),
  clock:()=>string=()=>new Date().toISOString()):HistoryCoverage{
  const coverage=parse<HistoryCoverage[]>(storage,HISTORICAL_COVERAGE_KEY,[]);
  const revisions=parse<StateRevision[]>(storage,HISTORICAL_REVISIONS_KEY,[]);
  const found=coverage.find(c=>c.scope===scope);if(found){validateChain(revisions,coverage,scope);return found;}
  if(revisions.some(r=>r.scope===scope))throw new Error('Orphan historical revisions require recovery.');
  const at=clock();const marker:HistoryCoverage={scope,historyGuaranteedFrom:at,schemaVersion:1,lineageId:id()};
  const baseline=baselineFor(storage,scope,at);
  applyLocalRestore(storage,{
    [HISTORICAL_REVISIONS_KEY]:JSON.stringify([...revisions,...baseline]),
    [HISTORICAL_COVERAGE_KEY]:JSON.stringify([...coverage,marker]),
  });
  return marker;
}
/** Canonical state and required revisions commit together or both roll back. */
export function commitLocalHistoricalCollection(type:HistoricalSource,nextRows:Row[],storage:Storage=browserStorage(),
  clock:()=>string=()=>new Date().toISOString()):void{
  const key=historicalSources[type].key;
  const previous=readRows(storage,key),revisions=parse<StateRevision[]>(storage,HISTORICAL_REVISIONS_KEY,[]);
  const coverage=parse<HistoryCoverage[]>(storage,HISTORICAL_COVERAGE_KEY,[]);
  const oldById=new Map(previous.map(row=>[identity(row),row]));
  const newById=new Map(nextRows.map(row=>[identity(row),row]));
  const changed=[...new Set([...oldById.keys(),...newById.keys()])].filter(k=>!same(
    oldById.get(k)?semanticState(type,oldById.get(k)!):null,newById.get(k)?semanticState(type,newById.get(k)!):null));
  if(changed.length===0){
    // Cosmetic writes are still canonical; no reconstruction-relevant revision is needed.
    applyLocalRestore(storage,{[key]:JSON.stringify(nextRows)});return;
  }
  const active=[...coverage],all=[...revisions];
  for(const scope of [...new Set(changed.map(k=>k.slice(0,k.indexOf(':'))))]){
    validateChain(all,active,scope);
    if(!active.some(c=>c.scope===scope)){
      if(all.some(r=>r.scope===scope))throw new Error('Orphan historical revisions require recovery.');
      const at=clock();active.push({scope,historyGuaranteedFrom:at,schemaVersion:1,lineageId:id()});
      all.push(...baselineFor(storage,scope,at));
    }
  }
  for(const keyId of changed){
    const old=oldById.get(keyId),next=newById.get(keyId),row=next||old!;
    const scope=scopeOf(row),prior=all.filter(r=>r.scope===scope&&r.entityType===type&&r.entityId===row.id);
    const last=prior.at(-1),from=Date.parse(last?.recordedAt||active.find(c=>c.scope===scope)!.historyGuaranteedFrom);
    const recordedAt=new Date(Math.max(Date.parse(clock()),from+1)).toISOString();
    all.push({id:id(),scope,entityType:type,entityId:row.id,revisionNo:(last?.revisionNo||0)+1,mutationId:id(),
      operation:!next?'delete':!old?'create':'update',recordedAt,schemaVersion:1,state:next?sourceState(type,next):null});
  }
  applyLocalRestore(storage,{[HISTORICAL_REVISIONS_KEY]:JSON.stringify(all),
    [HISTORICAL_COVERAGE_KEY]:JSON.stringify(active),[key]:JSON.stringify(nextRows)});
}
export function readLocalHistoryAt(type:HistoricalSource,entityId:string,scope:string,at:string,
  storage:Storage=browserStorage()):HistoryRead{
  try{
    const coverage=parse<HistoryCoverage[]>(storage,HISTORICAL_COVERAGE_KEY,[]).find(c=>c.scope===scope)||null;
    if(!coverage)return {status:'not_activated',revision:null,coverage:null};
    if(coverage.schemaVersion!==1)return {status:'unsupported_schema',revision:null,coverage};
    const cutoff=Date.parse(at);
    if(!Number.isFinite(cutoff))return {status:'corrupt',revision:null,coverage};
    if(cutoff<Date.parse(coverage.historyGuaranteedFrom))return {status:'pre_coverage',revision:null,coverage};
    const rows=parse<StateRevision[]>(storage,HISTORICAL_REVISIONS_KEY,[])
      .filter(r=>r.scope===scope&&r.entityType===type&&r.entityId===entityId)
      .sort((a,b)=>a.revisionNo-b.revisionNo);
    for(let i=0;i<rows.length;i++){
      if(rows[i].schemaVersion!==1)return {status:'unsupported_schema',revision:null,coverage};
      if(rows[i].revisionNo!==i+1)return {status:'sequence_gap',revision:null,coverage};
      if(!rows[i].recordedAt||!Number.isFinite(Date.parse(rows[i].recordedAt)))return {status:'corrupt',revision:null,coverage};
    }
    return {status:'available',revision:rows.filter(r=>Date.parse(r.recordedAt)<=cutoff).at(-1)||null,coverage};
  }catch{return {status:'corrupt',revision:null,coverage:null};}
}
export function removeSampleHistoricalIntegrity(storage:Storage=browserStorage()){
  const rows=parse<StateRevision[]>(storage,HISTORICAL_REVISIONS_KEY,[]).filter(r=>r.scope!=='sample');
  const coverage=parse<HistoryCoverage[]>(storage,HISTORICAL_COVERAGE_KEY,[]).filter(c=>c.scope!=='sample');
  applyLocalRestore(storage,{[HISTORICAL_REVISIONS_KEY]:JSON.stringify(rows),[HISTORICAL_COVERAGE_KEY]:JSON.stringify(coverage)});
}
