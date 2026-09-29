import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';

class Storage {
  data = new Map();
  refuse = () => false;
  get length() { return this.data.size; }
  key(i) { return [...this.data.keys()][i] ?? null; }
  getItem(k) { return this.data.get(k) ?? null; }
  setItem(k, v) { if (this.refuse(k, v)) throw new DOMException('Full', 'QuotaExceededError'); this.data.set(k, String(v)); }
  removeItem(k) { this.data.delete(k); }
}
const storage = new Storage();
const requests = [];
let rejectedTable = '';
globalThis.window = { localStorage: storage, dispatchEvent: () => true, addEventListener: () => {}, removeEventListener: () => {} };
globalThis.localStorage = storage;
globalThis.CustomEvent = class { constructor(type, options) { this.type = type; this.detail = options?.detail; } };
globalThis.__durabilityCloud = {
  auth: { getUser: async () => ({ data: { user: { id: 'owner' } }, error: null }) },
  from(table) { return { async upsert(rows, options) {
    requests.push({ table, rows: Array.isArray(rows) ? rows : [rows], options });
    return { error: table === rejectedTable ? { message: 'Account write refused' } : null };
  } }; },
};
// Replace only the network boundary. All codecs, stores, commands and restore code are real.
registerHooks({ load(url, context, next) {
  if (url.endsWith('/lib/supabaseClient.ts')) return { format: 'module', shortCircuit: true,
    source: 'export const supabaseClient = globalThis.__durabilityCloud; export const isPipelineSupabaseConfigured = true;' };
  return next(url, context);
} });
const { kernelCodecs, canonicalContracts, archiveOnlyTables } = await import('../../src/services/canonicalDurability.ts');
const { buildRestorePlan, parseBackupFile } = await import('../../src/utils/workspaceBackup.ts');
const { restoreWorkspace, undoRestore } = await import('../../src/services/workspaceRestore.ts');
const { applyLocalRestore, recoverInterruptedRestore, RESTORE_JOURNAL_KEY } = await import('../../src/services/restoreJournal.ts');
const commands = await import('../../src/domain/commercialKernel/commands.ts');
const { appendEvent, loadEvents } = await import('../../src/services/commercialKernel/eventStore.ts');
const { writeLocal } = await import('../../src/services/commercialKernel/kernelRepository.ts');
const { projectCurrentEvidence } = await import('../../src/domain/commercialKernel/commercialEvidence.ts');
const conditionCommands = await import('../../src/domain/commercialKernel/conditionCommands.ts');
const { conditionReferenceIndex } = await import('../../src/domain/commercialKernel/conditionReferences.ts');
const { projectCommercialConditions } = await import('../../src/domain/commercialKernel/commercialCondition.ts');
const requirementCommands = await import('../../src/domain/commercialKernel/requirementCommands.ts');
const dependencyCommands = await import('../../src/domain/commercialKernel/dependencyCommands.ts');
const timingCommands = await import('../../src/domain/commercialKernel/timingCommands.ts');
const moneyGateCommands = await import('../../src/domain/commercialKernel/moneyGateCommands.ts');
const at = '2026-08-12T10:30:00.000Z';
const later = '2026-09-10T12:30:00.000Z';
const base = { userId: 'owner', accountId: 'a', accountName: 'Acme', opportunityId: 'o', threadId: 't',
  sourceType: 'email', sourceId: 'mail-73', sourceUrl: 'https://example.com/mail/73', sourceUpdatedAt: at,
  createdAt: at, updatedAt: later, occurredAt: at, recordedAt: later };
const fixtures = [
  { ...base, id: 't', title: 'Renewal', objective: 'Keep business', status: 'active', currentMoneyState: 'quoted', currentWaitingParty: 'customer', lastActivityAt: at },
  { ...base, id: 'c', commitmentParty: 'customer', ownerLabel: 'Buyer', commitmentText: 'Send PO', originalDueDate: '2026-08-14', currentDueDate: '2026-08-20', status: 'open', impactType: 'none',
    dueDateHistory: [{ from: '2026-08-14', to: '2026-08-20', changedAt: later, reason: 'Buyer travel' }], sourceEventId: 'e', silenceThresholdDays: 3 },
  { ...base, id: 'e', eventType: 'commitment_created', commitmentId: 'c', summary: 'Buyer promised', structuredPayload: { evidence: 'mail-73' }, idempotencyKey: 'promise-73' },
  { ...base, id: 'ev', category: 'technical_outcome', direction: 'positive', evidenceText: 'Retest passed', summary: 'Passed', observedAt: '2026-08-11', sourceActivityId: 'activity-1' },
  { ...base, id: 'v', outcomeType: 'payment_recovered', userAssessment: 'protected_revenue_or_payment', recommendationId: 'rec-1', impactAmount: 3200, impactCurrency: 'USD', confidence: 0.75, note: 'Buyer paid' },
  { ...base, id: 'condition', statement: 'Technical fit is accepted.', conditionCategory: 'technical', intent: 'hypothesis', lifecycle: 'active', validFrom: null, evidenceLinks: [] },
  { ...base, id: 'requirement', expectedOutcome: 'Know who approves budget', question: 'Who approves budget?', conditionId: null, role: 'required_now', lifecycle: 'active' },
  { ...base, id: 'dependency', dependentRequirementId: 'requirement', prerequisiteRequirementId: 'prerequisite', basis: 'The prerequisite is needed before approval can be known.', lifecycle: 'active', sourceType:'manual' },
  { ...base, id:'timing', kind:'duration', requirementId:'requirement', basis:'Buyer process stated', lifecycle:'active', durationDays:3, durationUnit:'calendar_days', epistemic:'supported', sourceKind:'customer_or_supplier', sourceReference:'Buyer email 73', evidenceId:null, commitmentId:null, sourceType:'manual' },
  { ...base,id:'money-gate',moneySourceType:'opportunity_value',moneySourceId:'o',requirementId:'requirement',
    basisKind:'operator_confirmed_structure',basis:'Buyer process requires approval',lifecycle:'active',sourceType:'manual' },
  { id:'decision',userId:'owner',accountId:'a',opportunityId:'o',question:'How should QA be resolved?',context:'QA acceptance is unclear.',
    basisSnapshot:{version:1,capturedAt:later,forecast:{verdict:'conditional',claim:null,timingEvaluation:'incomplete',reasonCodes:[]},premises:[],blockers:[],openQuestions:[],nextQuestion:null,timing:null,sourceRecordIds:['o']},
    options:[{id:'option-a',order:1,label:'Ask QA director',interventionIntent:'Resolve QA ambiguity',expectedConsequence:'Know whether acceptance is complete',tradeoffs:''}],
    selectedOptionId:'option-a',rationale:'QA director owns acceptance.',expectedConsequence:'Know whether acceptance is complete',
    intervention:{id:'intervention',intent:'Resolve QA ambiguity',targetKind:'opportunity',targetRequirementId:null,expectedChange:'Know whether acceptance is complete'},
    executionLinks:[],supersedesDecisionId:null,sourceType:'manual',decidedAt:later,createdAt:later,updatedAt:later },
  {id:'observation',userId:'owner',accountId:'a',opportunityId:'o',decisionId:'decision',observationCutoff:later,elapsedDays:0,
    snapshot:{version:1,derivedWithCurrentRules:true,opportunity:{id:'o',name:'Renewal',stage:'Proposal',status:'Active',targetDate:null,value:1000,currency:'USD'},
      target:{kind:'opportunity',requirementId:null,label:null,role:null,state:'unavailable',conditionState:null,sourceEvidenceIds:[]},
      blockers:[],forecast:{verdict:'conditional',timingEvaluation:'incomplete',reasonCodes:[]},timing:null,money:[],execution:[],buyerProgress:null,
      sourceRecordIds:['o'],coverage:{core:'full',target:'unavailable',buyerProgress:'partial',moneyConsequences:'partial'}},
    operatorNote:'Reviewed later state.',sourceType:'manual',finalizedAt:later,createdAt:later},
  {id:'policy',userId:'owner',opportunityId:'o',version:1,title:'Approval required',rationale:'Explicit customer process',requirementId:'requirement',
    appliesWhen:'always',amount:null,currency:null,lifecycle:'active',sourceType:'manual',createdAt:at,updatedAt:later},
  {id:'incident',userId:'owner',opportunityId:'o',policyId:'policy',version:1,summary:'Approval deviation',materialImpact:'Finance and sales need to coordinate',coordinator:'Recorded coordinator',responseNote:'',status:'open',disposition:null,closedAt:null,
    basisSnapshot:{version:1,capturedAt:later,policy:{id:'policy',userId:'owner',opportunityId:'o',version:1,title:'Approval required',rationale:'Explicit customer process',requirementId:'requirement',
      appliesWhen:'always',amount:null,currency:null,lifecycle:'active',sourceType:'manual',createdAt:at,updatedAt:later},reason:'Required outcome is unresolved',sourceRecordIds:['policy','o','requirement']},sourceType:'manual',createdAt:later,updatedAt:later},
  {id:'contract-obligation',userId:'owner',opportunityId:'o',version:1,contractReference:'Contract 42',contractVersion:'Signed v1',acceptedOn:'2026-01-01',acceptanceReference:'Signed copy 42',clause:'Deliver accepted scope',requirementId:'requirement',commitmentId:'c',revisionReason:'Confirmed mapping',lifecycle:'active',sourceType:'manual',createdAt:at,updatedAt:later},
].map((fixture, i) => kernelCodecs[i].sanitize(fixture));
const backup = localBrowserData => ({ formatVersion: 8, exportedAt: later, localBrowserData });
const kernelBackup = () => backup(Object.fromEntries(kernelCodecs.slice(0, 5).map((codec, i) => [codec.storageKey, [fixtures[i]]])));
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
beforeEach(async () => { await tick(); storage.data.clear(); storage.refuse = () => false; requests.length = 0; rejectedTable = ''; delete globalThis.__durabilityCloud.rpc; });

test('diverged account history rejects covered restore and rolls back the browser copy', async () => {
  globalThis.__durabilityCloud.rpc=async()=>({data:{status:'diverged'},error:null});
  storage.setItem('memoire.accounts.v1', '[{"id":"original"}]');
  await assert.rejects(restoreWorkspace(kernelBackup(), { userId: 'owner' }), /newer or different accepted revisions/);
  assert.equal(storage.getItem('memoire.accounts.v1'), '[{"id":"original"}]');
  assert.equal(requests.length, 0);
});
test('transactional account history restore handles covered rows through one RPC without replaying Events', async () => {
  const calls=[];
  globalThis.__durabilityCloud.rpc=async(name,args)=>{calls.push({name,args});return {data:{status:'restored',lineage_id:'lineage'},error:null};};
  const result=await restoreWorkspace(kernelBackup(),{userId:'owner'});
  assert.equal(result.ok,true);
  assert.equal(calls.length,1);
  assert.equal(calls[0].name,'restore_commercial_history');
  assert.equal(calls[0].args.payload.sources.commercial_commitments.length,1);
  assert.equal(requests.some(request=>request.table==='commercial_commitments'),false);
  assert.equal(requests.some(request=>request.table==='commercial_events'),true,
    'the legacy Event archive is merged as data but no new mutation Event is emitted');
});

test('Dependency restore rejects cycles, missing endpoints and cross-owner endpoints before any write', async()=>{
  const parents={
    'memoire.accounts.v1':[{id:'a',userId:'owner',accountName:'Acme'}],
    'memoire.opportunities.v1':[{id:'o',userId:'owner',accountName:'Acme'}],
    [kernelCodecs[6].storageKey]:[fixtures[6],{...fixtures[6],id:'prerequisite',expectedOutcome:'Complete QA'}],
  };
  const forward=fixtures[7],reverse={...forward,id:'reverse',dependentRequirementId:'prerequisite',prerequisiteRequirementId:'requirement'};
  const invalid=[
    {...parents,[kernelCodecs[7].storageKey]:[forward,reverse]},
    {...parents,[kernelCodecs[7].storageKey]:[{...forward,prerequisiteRequirementId:'missing'}]},
    {...parents,[kernelCodecs[6].storageKey]:[fixtures[6],{...fixtures[6],id:'prerequisite',userId:'other'}],[kernelCodecs[7].storageKey]:[forward]},
  ];
  for(const localBrowserData of invalid){
    const file=backup(localBrowserData);
    assert.equal(parseBackupFile(JSON.stringify(file)).ok,false);
    await assert.rejects(restoreWorkspace(file));
    assert.equal(storage.length,0);
  }
});

test('Dependency command persists state before event and refuses stale retire',()=>{
  storage.setItem('memoire.accounts.v1',JSON.stringify([{id:'a',userId:'owner',accountName:'Acme'}]));
  storage.setItem('memoire.opportunities.v1',JSON.stringify([{id:'o',userId:'owner',accountId:'a',accountName:'Acme'}]));
  storage.setItem(kernelCodecs[6].storageKey,JSON.stringify([fixtures[6],{...fixtures[6],id:'prerequisite',expectedOutcome:'Complete QA'}]));
  const result=dependencyCommands.createCommercialDependency({userId:'owner',sampleDataActive:false},{opportunityId:'o',dependentRequirementId:'requirement',prerequisiteRequirementId:'prerequisite',basis:'QA must finish first.'});
  assert.equal(result.ok,true);assert.equal(JSON.parse(storage.getItem(kernelCodecs[7].storageKey)).length,1);
  assert.equal(dependencyCommands.retireCommercialDependency({userId:'owner',sampleDataActive:false},result.value.id,'stale').ok,false);
  const retired=dependencyCommands.retireCommercialDependency({userId:'owner',sampleDataActive:false},result.value.id,result.value.updatedAt);
  assert.equal(retired.ok,true);assert.equal(retired.value.lifecycle,'retired');
});
test('Dependency rejected state emits no history; sample edge stays out of cloud',async()=>{
  const scoped=[{...fixtures[6],isSample:true},{...fixtures[6],id:'prerequisite',expectedOutcome:'Complete QA',isSample:true}];
  storage.setItem(kernelCodecs[6].storageKey,JSON.stringify(scoped));
  const input={opportunityId:'o',dependentRequirementId:'requirement',prerequisiteRequirementId:'prerequisite',basis:'QA first'};
  storage.refuse=key=>key===kernelCodecs[7].storageKey;
  const rejected=dependencyCommands.createCommercialDependency({userId:'owner',sampleDataActive:true},input);
  assert.equal(rejected.ok,false);assert.equal(storage.getItem(kernelCodecs[2].storageKey),null);
  storage.refuse=()=>false;
  const accepted=dependencyCommands.createCommercialDependency({userId:'owner',sampleDataActive:true},input);
  assert.equal(accepted.ok,true);assert.equal(accepted.value.isSample,true);
  await tick();assert.equal(requests.filter(request=>request.table==='commercial_dependencies').length,0);
});
test('Timing command writes assertion before history, rejects quota and stale retirement',async()=>{
  const refs={opportunities:[{id:'o',userId:'owner',accountId:'a',accountName:'Acme',expectedClosePeriod:'2026-09-30'}],
    requirements:[fixtures[6]],commitments:[fixtures[1]],evidence:[]};
  const scope={userId:'owner',sampleDataActive:false};
  const input={kind:'duration',opportunityId:'o',requirementId:'requirement',basis:'Buyer email',durationDays:3,
    durationUnit:'calendar_days',epistemic:'supported',sourceKind:'customer_or_supplier',sourceReference:'Buyer email 73'};
  storage.refuse=key=>key===kernelCodecs[8].storageKey;
  assert.equal(timingCommands.createCommercialTiming(scope,input,refs).ok,false);
  assert.equal(storage.getItem(kernelCodecs[2].storageKey),null);
  storage.refuse=()=>false;
  const created=timingCommands.createCommercialTiming(scope,input,refs);
  assert.equal(created.ok,true);assert.equal(JSON.parse(storage.getItem(kernelCodecs[8].storageKey)).length,1);
  assert.equal(timingCommands.retireCommercialTiming(scope,created.value.id,'stale',refs).ok,false);
  const retired=timingCommands.retireCommercialTiming(scope,created.value.id,created.value.updatedAt,refs);
  assert.equal(retired.ok,true);assert.equal(retired.value.lifecycle,'retired');
  assert.equal(JSON.parse(storage.getItem(kernelCodecs[8].storageKey))[0].id,created.value.id);
});
test('Timing restore rejects missing and foreign Requirement references before mutation',async()=>{
  const parents={'memoire.accounts.v1':[{id:'a',userId:'owner',accountName:'Acme'}],
    'memoire.opportunities.v1':[{id:'o',userId:'owner',accountId:'a',accountName:'Acme'}]};
  for(const localBrowserData of [
    {...parents,[kernelCodecs[8].storageKey]:[fixtures[8]]},
    {...parents,[kernelCodecs[6].storageKey]:[{...fixtures[6],userId:'other'}],[kernelCodecs[8].storageKey]:[fixtures[8]]},
  ]){
    const file=backup(localBrowserData);
    assert.equal(parseBackupFile(JSON.stringify(file)).ok,false);
    await assert.rejects(restoreWorkspace(file));
    assert.equal(storage.length,0);
  }
});

test('Money Gate command persists canonical state before Event and enforces stale retirement',()=>{
  const refs={opportunities:[{id:'o',userId:'owner',accountId:'a',accountName:'Acme',status:'Active',estimatedValue:1200,currency:'USD'}],
    quotes:[],requirements:[fixtures[6]]};
  const scope={userId:'owner',sampleDataActive:false};
  const input={opportunityId:'o',moneySourceType:'opportunity_value',moneySourceId:'o',requirementId:'requirement',
    basisKind:'operator_confirmed_structure',basis:'Buyer process requires approval'};
  storage.refuse=key=>key===kernelCodecs[9].storageKey;
  assert.equal(moneyGateCommands.createCommercialMoneyGate(scope,input,refs).ok,false);
  assert.equal(storage.getItem(kernelCodecs[2].storageKey),null);
  storage.refuse=key=>key===kernelCodecs[2].storageKey;
  const created=moneyGateCommands.createCommercialMoneyGate(scope,input,refs);
  assert.equal(created.ok,true);assert.match(created.warning,/Do not repeat/);
  assert.equal(JSON.parse(storage.getItem(kernelCodecs[9].storageKey)).length,1);
  assert.equal(moneyGateCommands.retireCommercialMoneyGate(scope,created.value.id,'stale',refs).ok,false);
  storage.refuse=()=>false;
  assert.equal(moneyGateCommands.retireCommercialMoneyGate(scope,created.value.id,created.value.updatedAt,refs).ok,true);
});

test('sample Money Gate remains in its sample workspace and never reaches cloud',async()=>{
  const sampleRequirement={...fixtures[6],isSample:true};
  const refs={opportunities:[{id:'o',userId:'owner',accountId:'a',accountName:'Acme',status:'Active',estimatedValue:1200,currency:'USD',isSample:true}],
    quotes:[],requirements:[sampleRequirement]};
  const result=moneyGateCommands.createCommercialMoneyGate({userId:'owner',sampleDataActive:true},{opportunityId:'o',moneySourceType:'opportunity_value',
    moneySourceId:'o',requirementId:'requirement',basisKind:'customer_process',basis:'Buyer process'},refs);
  assert.equal(result.ok,true);assert.equal(result.value.isSample,true);await tick();
  assert.equal(requests.some(request=>request.table==='commercial_money_gates'),false);
});

for (const [i, codec] of kernelCodecs.entries()) {
  test(`${codec.table}: actual cloud codec → backup → restore → actual codec preserves history and provenance`, async () => {
    const original = fixtures[i];
    const row = codec.toRow(original, 'owner');
    const file = { ...backup({}), cloudData: { user_id: 'owner', manifest: { complete: true }, data: { [codec.table]: [row] } } };
    if (codec.table === 'commercial_conditions' || codec.table === 'commercial_outcome_requirements' || codec.table === 'commercial_dependencies' || codec.table === 'commercial_timing_assertions' || codec.table === 'commercial_money_gates' || codec.table === 'commercial_decisions' || codec.table === 'commercial_decision_observations' || codec.table === 'commercial_policies' || codec.table === 'commercial_incidents' || codec.table === 'commercial_contract_obligations') {
      file.localBrowserData['memoire.accounts.v1'] = [{ id: 'a', userId: 'owner', accountName: 'Acme' }];
      file.localBrowserData['memoire.opportunities.v1'] = [{ id: 'o', userId: 'owner', accountId:'a',accountName: 'Acme' }];
      if (codec.table === 'commercial_dependencies') file.localBrowserData[kernelCodecs[6].storageKey]=[fixtures[6],{...fixtures[6],id:'prerequisite',expectedOutcome:'Know technical approver'}];
      if (codec.table === 'commercial_timing_assertions') file.localBrowserData[kernelCodecs[6].storageKey]=[fixtures[6]];
      if (codec.table === 'commercial_contract_obligations') { file.localBrowserData[kernelCodecs[1].storageKey]=[fixtures[1]]; file.localBrowserData[kernelCodecs[6].storageKey]=[fixtures[6]]; }
      if (codec.table === 'commercial_incidents') { file.localBrowserData[kernelCodecs[12].storageKey]=[fixtures[12]]; file.localBrowserData[kernelCodecs[6].storageKey]=[fixtures[6]]; }
      if (codec.table === 'commercial_policies') file.localBrowserData[kernelCodecs[6].storageKey]=[fixtures[6]];
      if (codec.table === 'commercial_money_gates') file.localBrowserData[kernelCodecs[6].storageKey]=[fixtures[6]];
      if (codec.table === 'commercial_decision_observations') file.localBrowserData[kernelCodecs[10].storageKey]=[fixtures[10]];
    }
    const parsed = parseBackupFile(JSON.stringify(file));
    assert.equal(parsed.ok, true, parsed.message);
    const result = await restoreWorkspace(parsed.envelope, { userId: 'owner' });
    assert.equal(result.ok, true);
    const restored = codec.sanitize(JSON.parse(storage.getItem(codec.storageKey))[0]);
    assert.deepEqual(restored, original);
    assert.deepEqual(requests.find(r => r.table === codec.table).rows[0], row);
    await restoreWorkspace(file, { userId: 'owner' });
    assert.equal(JSON.parse(storage.getItem(codec.storageKey)).length, 1, 'retry preserves identity');
  });
}

test('cloud restore sends existing Plan execution before its Decision link',async()=>{
  const decision={...fixtures[10],executionLinks:[{kind:'action',recordId:'plan',linkedAt:later}]};
  const file=backup({
    'memoire.accounts.v1':[{id:'a',userId:'owner',accountName:'Acme'}],
    'memoire.opportunities.v1':[{id:'o',userId:'owner',accountId:'a',accountName:'Acme'}],
    'memoire.planItems.v1':[{id:'plan',date:'2026-09-20',label:'Call QA',tag:'',done:false,
      linkedOpportunityId:'o',createdAt:at,updatedAt:later,source:'user'}],
    [kernelCodecs[10].storageKey]:[decision],
  });
  const result=await restoreWorkspace(file,{userId:'owner'});assert.equal(result.ok,true);
  assert.ok(requests.findIndex(r=>r.table==='plan_items')<requests.findIndex(r=>r.table==='commercial_decisions'));
});

test('local full kernel round-trip preserves both evidence observations and all linkages', async () => {
  const file = kernelBackup();
  file.localBrowserData[kernelCodecs[3].storageKey].push({ ...fixtures[3], id: 'ev-old', direction: 'negative', observedAt: '2026-08-01' });
  const result = await restoreWorkspace(file);
  assert.equal(result.restoredRecords, 6);
  for (const [key, records] of Object.entries(file.localBrowserData)) assert.deepEqual(JSON.parse(storage.getItem(key)), records);
});

test('preflight rejects malformed identity, enum, timestamp, history and future versions without mutation', async () => {
  storage.setItem('memoire.accounts.v1', '[{"id":"original"}]');
  const before = [...storage.data];
  for (const patch of [{ id: '' }, { sourceType: 'unknown' }, { createdAt: 'not-a-date' }, { observedAt: '2026-02-30' }]) {
    const file = backup({ [kernelCodecs[3].storageKey]: [{ ...fixtures[3], ...patch }] });
    assert.equal(parseBackupFile(JSON.stringify(file)).ok, false);
    await assert.rejects(restoreWorkspace(file));
    assert.deepEqual([...storage.data], before);
  }
  for (const version of [0, -1, 1.5, '3', 999]) assert.equal(parseBackupFile(JSON.stringify({ ...kernelBackup(), formatVersion: version })).ok, false);
  const malformed = backup({ [kernelCodecs[1].storageKey]: [{ ...fixtures[1], dueDateHistory: [{ to: 'bad', changedAt: at }] }] });
  assert.equal(parseBackupFile(JSON.stringify(malformed)).ok, false);
});

test('invalid source enum in a cloud row is rejected before fromRow can default to manual', () => {
  const row = { ...kernelCodecs[3].toRow(fixtures[3], 'owner'), source_type: 'unknown' };
  assert.throws(() => buildRestorePlan({ ...backup({}), cloudData: { user_id: 'owner', data: { commercial_evidence: [row] } } }), /sourceType/);
});

test('legacy v1/v2 records with absent modern optional fields remain readable', () => {
  for (const version of [undefined, 1, 2]) {
    const parsed = parseBackupFile(JSON.stringify({ ...backup({ 'memoire.accounts.v1': [{ id: 'legacy', accountName: 'Old account' }] }), formatVersion: version }));
    assert.equal(parsed.ok, true);
  }
});

test('sample records and session/owner flags cannot cross restore into live data', async () => {
  const file = kernelBackup();
  for (const records of Object.values(file.localBrowserData)) records.push({ ...records[0], id: 'sample', isSample: true });
  file.localBrowserData['memoire.supabase.auth'] = 'foreign token';
  file.localBrowserData['memoire.sampleData.loaded'] = 'true';
  file.localBrowserData['memoire.local-workspace-owner.v1'] = 'foreign owner';
  storage.setItem('memoire.local-workspace-owner.v1', 'owner');
  const result = await restoreWorkspace(file, { userId: 'owner' });
  assert.equal(result.droppedSampleRecords, 5);
  assert.equal(storage.getItem('memoire.local-workspace-owner.v1'), 'owner');
  assert.equal(storage.getItem('memoire.supabase.auth'), null);
  assert.ok(requests.every(request => request.rows.every(row => row.id !== 'sample')));
});

test('third collection failure rolls back byte-for-byte; nothing reaches cloud', async () => {
  storage.setItem('memoire.accounts.v1', '[{"id":"original"}]');
  const before = [...storage.data];
  let writes = 0;
  storage.refuse = key => key !== RESTORE_JOURNAL_KEY && ++writes === 3;
  await assert.rejects(restoreWorkspace(kernelBackup(), { userId: 'owner' }), /previous workspace was restored/);
  assert.deepEqual([...storage.data], before);
  assert.equal(requests.length, 0);
});

test('refused journal leaves workspace untouched; unchanged prior value needs no rollback write', () => {
  storage.setItem('memoire.accounts.v1', 'before');
  storage.refuse = key => key === RESTORE_JOURNAL_KEY;
  assert.throws(() => applyLocalRestore(storage, { 'memoire.accounts.v1': 'after' }));
  assert.equal(storage.getItem('memoire.accounts.v1'), 'before');
  storage.refuse = key => key !== RESTORE_JOURNAL_KEY;
  assert.throws(() => applyLocalRestore(storage, { 'memoire.accounts.v1': 'after' }), /previous workspace was restored/);
  assert.equal(storage.getItem(RESTORE_JOURNAL_KEY),null);
  storage.refuse = () => false;
  assert.equal(recoverInterruptedRestore(storage), true);
  assert.equal(storage.getItem('memoire.accounts.v1'), 'before');
});

test('partial cloud rejection is reported per collection; local recovery and retry keep IDs', async () => {
  rejectedTable = 'commercial_evidence';
  const first = await restoreWorkspace(kernelBackup(), { userId: 'owner' });
  assert.equal(first.ok, false);
  assert.equal(first.cloudFailedCount, 1);
  assert.equal(first.cloudPushedCount, 4);
  assert.deepEqual(JSON.parse(storage.getItem(kernelCodecs[3].storageKey))[0], fixtures[3]);
  rejectedTable = '';
  assert.equal((await restoreWorkspace(kernelBackup(), { userId: 'owner' })).ok, true);
  assert.equal(JSON.parse(storage.getItem(kernelCodecs[3].storageKey)).length, 1);
});

test('undo is local-only and uses the rollback boundary', async () => {
  storage.setItem('memoire.accounts.v1', '[{"id":"old"}]');
  const result = await restoreWorkspace(kernelBackup(), { userId: 'owner' });
  const networkCount = requests.length;
  assert.equal(undoRestore(result.snapshot), true);
  assert.equal(storage.getItem('memoire.accounts.v1'), '[{"id":"old"}]');
  assert.equal(storage.getItem(kernelCodecs[0].storageKey), null);
  assert.equal(requests.length, networkCount);
});

test('state rejection emits no event; history rejection returns accepted-with-warning', async () => {
  storage.refuse = key => key === kernelCodecs[3].storageKey;
  const input = { accountName: 'Acme', category: 'technical_outcome', direction: 'positive', summary: 'Passed', evidenceText: 'Trial passed', observedAt: '2026-08-10' };
  const failed = commands.recordCommercialEvidence({}, input);
  assert.equal(failed.ok, false);
  assert.equal(storage.getItem(kernelCodecs[2].storageKey), null);
  storage.refuse = key => key === kernelCodecs[2].storageKey;
  const accepted = commands.recordCommercialEvidence({}, input);
  assert.equal(accepted.ok, true);
  assert.match(accepted.warning, /Do not repeat/);
  assert.equal(JSON.parse(storage.getItem(kernelCodecs[3].storageKey)).length, 1);
  assert.equal(accepted.event, undefined);
});

test('value outcome rejection does not return a phantom record', () => {
  storage.refuse = key => key === kernelCodecs[4].storageKey;
  assert.equal(commands.recordValueOutcome({}, { outcomeType: 'payment_recovered', userAssessment: 'protected_revenue_or_payment' }).ok, false);
  assert.equal(storage.getItem(kernelCodecs[4].storageKey), null);
});

test('retry cannot build a replacement from a partially rolled-back workspace', async () => {
  storage.setItem(RESTORE_JOURNAL_KEY, JSON.stringify({ version: 1, before: { 'memoire.accounts.v1': '[{"id":"old"}]' } }));
  const before = [...storage.data];
  await assert.rejects(restoreWorkspace(kernelBackup()), /Reload to recover/);
  assert.equal(undoRestore({}), false);
  assert.deepEqual([...storage.data], before);
  assert.equal(recoverInterruptedRestore(storage), true);
  await restoreWorkspace(kernelBackup());
  assert.equal(storage.getItem('memoire.accounts.v1'), null, 'the recovered old collection is cleared by replacement');
});

test('evidence supersession is identical across backup ordering, including observation-date ties', async () => {
  const records = [
    { ...fixtures[3], id: 'old', observedAt: '2026-08-01' },
    { ...fixtures[3], id: 'middle', recordedAt: at },
    { ...fixtures[3], id: 'newest' },
  ];
  for (const order of [[0,1,2], [2,1,0], [1,2,0], [1,0,2]]) {
    await restoreWorkspace(backup({ [kernelCodecs[3].storageKey]: order.map(i => records[i]) }));
    const restored = JSON.parse(storage.getItem(kernelCodecs[3].storageKey));
    const projection = projectCurrentEvidence(restored);
    assert.equal(projection.supersededBy.get('old'), 'newest');
    assert.equal(projection.supersededBy.get('middle'), 'newest');
    assert.equal([...projection.currentByScope.values()][0][0].id, 'newest');
  }
});

test('currency, opening balance and raw preferences survive in the representation their readers expect', async () => {
  const { getReportingCurrency } = await import('../../src/utils/money.ts');
  const file = { ...backup({ memoire_reporting_currency: 'SGD', memoire_opening_cash_balance: 250000,
    'memoire.preference.v1': 'compact' }), localBrowserRawData: { 'memoire.preference.v1': 'compact' } };
  await restoreWorkspace(file);
  assert.equal(getReportingCurrency(), 'SGD');
  assert.equal(storage.getItem('memoire_opening_cash_balance'), '250000');
  assert.equal(storage.getItem('memoire.preference.v1'), 'compact');
});

for (const [i, codec] of kernelCodecs.entries()) {
  test(`${codec.table}: quota and unavailable storage reject authoritative writes`, () => {
    storage.refuse = () => true;
    assert.throws(() => writeLocal(codec, [fixtures[i]]));
    assert.equal(storage.getItem(codec.storageKey), null);
    const browser = globalThis.window;
    delete globalThis.window;
    try { assert.throws(() => writeLocal(codec, [fixtures[i]]), /no local storage/); }
    finally { globalThis.window = browser; }
  });
}

test('completion does not create an event before the commitment is persisted', () => {
  storage.setItem(kernelCodecs[1].storageKey, JSON.stringify([fixtures[1]]));
  storage.refuse = key => key === kernelCodecs[1].storageKey;
  assert.equal(commands.completeCommitment({}, { commitmentId: 'c', evidence: 'PO arrived' }).ok, false);
  assert.equal(loadEvents().length, 0);
  assert.equal(JSON.parse(storage.getItem(kernelCodecs[1].storageKey))[0].status, 'open');
  storage.refuse = key => key === kernelCodecs[2].storageKey;
  const accepted = commands.completeCommitment({}, { commitmentId: 'c', evidence: 'PO arrived' });
  assert.equal(accepted.ok, true);
  assert.ok(accepted.warning);
  assert.equal(JSON.parse(storage.getItem(kernelCodecs[1].storageKey))[0].status, 'completed');
});

test('event idempotency returns the previously persisted identity', () => {
  const first = commands.recordCommercialEvent({}, { eventType: 'commitment_created', summary: 'Created', idempotencyKey: 'same' });
  const second = commands.recordCommercialEvent({}, { eventType: 'commitment_created', summary: 'Created', idempotencyKey: 'same' });
  assert.equal(first.id, second.id);
  assert.equal(loadEvents().length, 1);
});

test('target sample edits preserve the live period and rejected targets emit no history', () => {
  assert.equal(commands.setCommercialTarget({}, { period: 'Q1', fiscalYear: 2026, amount: 200 }).ok, true);
  assert.equal(commands.setCommercialTarget({ sampleDataActive: true }, { period: 'Q1', fiscalYear: 2026, amount: 100 }).ok, true);
  const targets = JSON.parse(storage.getItem('memoire.commercialTargets.v1'));
  assert.equal(targets.find(t => !t.isSample).amount, 200);
  assert.equal(targets.find(t => t.isSample).amount, 100);
  const before = loadEvents().length;
  storage.refuse = key => key === 'memoire.commercialTargets.v1';
  assert.equal(commands.setCommercialTarget({}, { period: 'Q1', fiscalYear: 2026, amount: 300 }).ok, false);
  assert.equal(loadEvents().length, before);
});

test('all JSON collections retain payloads, money/outcome links and tombstones through cloud recovery', async () => {
  for (const contract of canonicalContracts.filter(c => c.kind === 'json')) {
    const record = { id: `record-${contract.table}`, createdAt: at, updatedAt: later, source: 'user',
      accountId: 'a', opportunityId: 'o', quoteId: 'q', outcomeId: 'outcome-1', __deleted: true };
    const cloudRow = contract.encode(record, 'owner');
    const file = { ...backup({}), cloudData: { user_id: 'owner', data: { [contract.table]: [cloudRow] } } };
    assert.equal((await restoreWorkspace(file, { userId: 'owner' })).ok, true);
    assert.deepEqual(JSON.parse(storage.getItem(contract.key))[0], record);
    assert.deepEqual(requests.at(-1).rows[0].payload, record);
  }
});

test('account and activity actual row codecs retain imported metadata and explicit linkage', async () => {
  const rows = {
    accounts: [{ id: 'a', user_id: 'owner', account_name: 'Acme', account_code: 'ACC-001',
      source_system: 'erp', external_source_key: 'erp-73', territory: 'South', strategy: 'Renewal',
      key_stakeholders: ['Buyer'], tags: ['imported'], created_at: at, updated_at: later }],
    sales_activities: [{ id: 'activity-1', user_id: 'owner', activity_date: '2026-08-11', raw_note: 'Trial passed',
      activity_type: 'Meeting', account_name: 'Acme', tags: ['source:email'], link_status: 'Linked',
      linked_opportunity_id: 'o', linked_opportunity_name: 'Renewal', linked_account_name: 'Acme', created_at: at, updated_at: later }],
  };
  assert.equal((await restoreWorkspace({ ...backup({}), cloudData: { user_id: 'owner', data: rows } }, { userId: 'owner' })).ok, true);
  const account = JSON.parse(storage.getItem('memoire.accounts.v1'))[0];
  assert.equal(account.externalSourceKey, 'erp-73');
  assert.equal(account.createdAt, at);
  const activity = JSON.parse(storage.getItem('memoire.salesActivities.v1'))[0];
  assert.equal(activity.linkedOpportunityId, 'o');
  assert.equal(activity.activityDate, '2026-08-11');
  assert.equal(requests.find(r => r.table === 'accounts').rows[0].source_system, 'erp');
  assert.equal(requests.find(r => r.table === 'sales_activities').rows[0].linked_opportunity_id, 'o');
});

test('incomplete exports, duplicate identities, foreign ownership and demo-mode restore are refused', async () => {
  await assert.rejects(restoreWorkspace({ ...kernelBackup(), cloudData: { manifest: { complete: false }, data: {} } }));
  const duplicate = kernelBackup();
  duplicate.localBrowserData[kernelCodecs[0].storageKey].push(fixtures[0]);
  await assert.rejects(restoreWorkspace(duplicate), /duplicate/);
  await assert.rejects(restoreWorkspace({ ...backup({}), cloudData: { user_id: 'someone-else', data: { commercial_events: [kernelCodecs[2].toRow(fixtures[2], 'someone-else')] } } }, { userId: 'owner' }), /another account/);
  storage.setItem('memoire.sampleData.loaded', 'true');
  await assert.rejects(restoreWorkspace(kernelBackup()), /sample workspace/);
  assert.equal(requests.length, 0);
});

test('sample thread and target writes stay local', async () => {
  const thread = commands.createCommercialThread({ userId: 'owner', sampleDataActive: true }, { accountId: 'a', accountName: 'Acme', title: 'Sample', objective: '' });
  assert.equal(thread.ok, true);
  assert.equal(thread.value.isSample, true);
  assert.equal(commands.setCommercialTarget({ userId: 'owner', sampleDataActive: true }, { period: 'Q1', fiscalYear: 2026, amount: 100 }).ok, true);
  await tick();
  assert.equal(requests.length, 0);
});

test('accepted local event history is not truncated to the UI window', () => {
  const codec = kernelCodecs[2];
  const many = Array.from({ length: 2001 }, (_, i) => ({ ...fixtures[2], id: `e-${i}`, idempotencyKey: `key-${i}` }));
  storage.setItem(codec.storageKey, JSON.stringify(many));
  appendEvent({ ...fixtures[2], id: 'final', idempotencyKey: 'final' }, { syncCloud: false });
  assert.equal(loadEvents().length, 2002);
});

test('registry covers every exported dataset and all kernel/JSON table unions', () => {
  const api = readFileSync(new URL('../../api/export.ts', import.meta.url), 'utf8');
  const tables = [...api.matchAll(/\{ table: '([^']+)', ownerColumn:/g)].map(m => m[1]);
  const covered = [...canonicalContracts.map(c => c.table), ...archiveOnlyTables];
  assert.deepEqual([...new Set(covered)].sort(), [...new Set(tables)].sort());
  for (const path of ['commercialKernel/kernelRepository.ts', 'cloudJsonCollectionStore.ts']) {
    const source = readFileSync(new URL(`../../src/services/${path}`, import.meta.url), 'utf8');
    const union = source.match(/export type (?:KernelTable|CloudJsonCollectionTable) =\s*([\s\S]*?);/)[1];
    for (const match of union.matchAll(/'([a-z_]+)'/g)) assert.ok(canonicalContracts.some(c => c.table === match[1]), match[1]);
  }
});


test('Condition command accepts durable state before history; failed state creates no event or phantom record', async () => {
  const scope = { userId: 'owner' };
  const index = conditionReferenceIndex([{id:'a',userId:'owner'}],[{id:'o',userId:'owner',accountId:'a'}],[]);
  const input = { accountId:'a',opportunityId:'o',statement:'QA accepts the remaining shelf life.',conditionCategory:'technical',intent:'hypothesis' };
  const conditionKey = kernelCodecs[5].storageKey, eventKey=kernelCodecs[2].storageKey;
  storage.refuse = key => key === conditionKey;
  const rejected=conditionCommands.createCommercialCondition(scope,input,index);
  assert.equal(rejected.ok,false); assert.equal(storage.getItem(eventKey),null);
  storage.refuse = key => key === eventKey;
  const accepted=conditionCommands.createCommercialCondition(scope,input,index);
  assert.equal(accepted.ok,true); assert.match(accepted.warning,/Do not repeat/);
  assert.equal(JSON.parse(storage.getItem(conditionKey))[0].id,accepted.value.id);
  assert.equal(accepted.event,undefined);
});

test('Condition explicit links survive cloud codec, backup and restore with stable IDs, provenance, dates and scope', async () => {
  const condition=kernelCodecs[5].sanitize({...fixtures[5],sourceType:'email',sourceId:'mail-73',validFrom:'2026-08-01',
    evidenceLinks:[{evidenceId:'ev',assessment:'supports',recordedAt:later}]});
  const file=backup({ 'memoire.accounts.v1':[{id:'a',userId:'owner',accountName:'Acme'}],
    'memoire.opportunities.v1':[{id:'o',userId:'owner',accountName:'Acme',accountId:'a'}],
    [kernelCodecs[3].storageKey]:[fixtures[3]], [kernelCodecs[5].storageKey]:[condition] });
  const parsed=parseBackupFile(JSON.stringify(file)); assert.equal(parsed.ok,true,parsed.message);
  const result=await restoreWorkspace(parsed.envelope,{userId:'owner'}); assert.equal(result.ok,true);
  assert.deepEqual(JSON.parse(storage.getItem(kernelCodecs[5].storageKey))[0],condition);
  assert.equal(projectCommercialConditions([condition],[fixtures[3]]).get(condition.id).state,'supported');
  const cloudRequest=requests.find(request=>request.table==='commercial_conditions');
  assert.equal(cloudRequest.rows[0].evidence_links[0].evidenceId,'ev');
  assert.equal(cloudRequest.rows[0].valid_from,'2026-08-01');
  assert.equal(cloudRequest.rows[0].source_id,'mail-73');
});

test('Condition restore refuses missing/foreign evidence and absent canonical account before mutating anything',async()=>{
  const original=kernelCodecs[5].sanitize({...fixtures[5],evidenceLinks:[{evidenceId:'ev',assessment:'supports',recordedAt:later}]});
  const parents={'memoire.accounts.v1':[{id:'a',userId:'owner',accountName:'Acme'}],
    'memoire.opportunities.v1':[{id:'o',userId:'owner',accountName:'Acme',accountId:'a'}]};
  for (const localBrowserData of [
    {...parents,[kernelCodecs[5].storageKey]:[original]},
    {...parents,[kernelCodecs[3].storageKey]:[{...fixtures[3],userId:'other'}],[kernelCodecs[5].storageKey]:[original]},
    {'memoire.opportunities.v1':parents['memoire.opportunities.v1'],[kernelCodecs[3].storageKey]:[fixtures[3]],[kernelCodecs[5].storageKey]:[original]},
  ]) {
    const before=[...storage.data];
    assert.equal(parseBackupFile(JSON.stringify(backup(localBrowserData))).ok,false);
    await assert.rejects(restoreWorkspace(backup(localBrowserData)));
    assert.deepEqual([...storage.data],before);
  }
});

test('sample Condition and its evidence stay local and are dropped from live restore',async()=>{
  const scope={userId:'owner',sampleDataActive:true};
  const index=conditionReferenceIndex([{id:'a',userId:'owner',isSample:true}],[{id:'o',userId:'owner',accountId:'a',isSample:true}],[]);
  const result=conditionCommands.createCommercialCondition(scope,{accountId:'a',opportunityId:'o',statement:'Sample proposition.',conditionCategory:'other',intent:'assumed'},index);
  assert.equal(result.ok,true); assert.equal(result.value.isSample,true);
  await tick(); assert.equal(requests.find(r=>r.table==='commercial_conditions'),undefined);
  const file=backup({[kernelCodecs[5].storageKey]:[result.value]});
  const plan=buildRestorePlan(file); assert.equal(plan.droppedSampleRecords,1);
});

test('Condition command rejects an empty proposition and mismatched account without recording an event',()=>{
  const scope={userId:'owner'};
  const index=conditionReferenceIndex([{id:'a',userId:'owner'}],[{id:'o',userId:'owner',accountId:'a'}],[]);
  for(const input of [
    {accountId:'a',opportunityId:'o',statement:' ',conditionCategory:'technical',intent:'assumed'},
    {accountId:'other',opportunityId:'o',statement:'Technical fit is accepted.',conditionCategory:'technical',intent:'assumed'},
  ]) assert.equal(conditionCommands.createCommercialCondition(scope,input,index).ok,false);
  assert.equal(storage.getItem(kernelCodecs[5].storageKey),null);
  assert.equal(storage.getItem(kernelCodecs[2].storageKey),null);
});

test('Requirement command rejects failed state before history, and warns when only history fails',()=>{
  const scope={userId:'owner'};
  const refs=requirementCommands.requirementReferenceIndex([{id:'a',userId:'owner'}],[{id:'o',userId:'owner',accountId:'a'}],[]);
  const input={accountId:'a',opportunityId:'o',expectedOutcome:'Know final approver',role:'required_now'};
  const key=kernelCodecs[6].storageKey,eventKey=kernelCodecs[2].storageKey;
  storage.refuse=k=>k===key;
  const rejected=requirementCommands.createOutcomeRequirement(scope,input,refs);
  assert.equal(rejected.ok,false);assert.equal(storage.getItem(eventKey),null);
  storage.refuse=k=>k===eventKey;
  const accepted=requirementCommands.createOutcomeRequirement(scope,input,refs);
  assert.equal(accepted.ok,true);assert.match(accepted.warning,/Do not repeat/);
  assert.equal(JSON.parse(storage.getItem(key))[0].id,accepted.value.id);
});

test('Requirement restore rejects missing parent, foreign Condition and sample leakage before mutation',()=>{
  const r={...fixtures[6],conditionId:'condition'};
  const parents={'memoire.accounts.v1':[{id:'a',userId:'owner'}],
    'memoire.opportunities.v1':[{id:'o',userId:'owner',accountId:'a'}]};
  for(const data of [
    {...parents,[kernelCodecs[6].storageKey]:[r]},
    {...parents,[kernelCodecs[5].storageKey]:[{...fixtures[5],userId:'other'}],[kernelCodecs[6].storageKey]:[r]},
    {'memoire.accounts.v1':parents['memoire.accounts.v1'],[kernelCodecs[6].storageKey]:[fixtures[6]]},
  ]) assert.equal(parseBackupFile(JSON.stringify(backup(data))).ok,false);
  const sample={...fixtures[6],isSample:true};
  const plan=buildRestorePlan(backup({[kernelCodecs[6].storageKey]:[sample]}));
  assert.equal(plan.droppedSampleRecords,1);
});

test('Requirement starts unknown, links a later Condition, changes role and retires without losing identity',()=>{
  const scope={userId:'owner'};
  const refs=requirementCommands.requirementReferenceIndex([{id:'a',userId:'owner'}],[{id:'o',userId:'owner',accountId:'a'}],[]);
  const created=requirementCommands.createOutcomeRequirement(scope,{accountId:'a',opportunityId:'o',expectedOutcome:'Know final approver',role:'required_now'},refs);
  assert.equal(created.ok,true);assert.equal(created.value.conditionId,null);
  const condition=conditionCommands.createCommercialCondition(scope,{accountId:'a',opportunityId:'o',statement:'Jane approves.',conditionCategory:'decision',intent:'assumed'},
    conditionReferenceIndex([{id:'a',userId:'owner'}],[{id:'o',userId:'owner',accountId:'a'}],[]));
  assert.equal(condition.ok,true);
  const linked=requirementCommands.changeOutcomeRequirement(scope,created.value.id,created.value.updatedAt,{kind:'link',conditionId:condition.value.id},
    requirementCommands.requirementReferenceIndex([{id:'a',userId:'owner'}],[{id:'o',userId:'owner',accountId:'a'}],[condition.value]));
  assert.equal(linked.ok,true);assert.equal(linked.value.conditionId,condition.value.id);
  const changed=requirementCommands.changeOutcomeRequirement(scope,linked.value.id,linked.value.updatedAt,{kind:'role',role:'required_later'},
    requirementCommands.requirementReferenceIndex([{id:'a',userId:'owner'}],[{id:'o',userId:'owner',accountId:'a'}],[condition.value]));
  assert.equal(changed.ok,true);assert.equal(changed.value.role,'required_later');
  const retired=requirementCommands.changeOutcomeRequirement(scope,changed.value.id,changed.value.updatedAt,{kind:'retire'},
    requirementCommands.requirementReferenceIndex([{id:'a',userId:'owner'}],[{id:'o',userId:'owner',accountId:'a'}],[condition.value]));
  assert.equal(retired.ok,true);assert.equal(retired.value.id,created.value.id);assert.equal(retired.value.lifecycle,'retired');
  assert.equal(requirementCommands.changeOutcomeRequirement(scope,retired.value.id,retired.value.updatedAt,{kind:'role',role:'context'},refs).ok,false);
});

test('sample Requirement stays out of the cloud write path',async()=>{
  const scope={userId:'owner',sampleDataActive:true};
  const refs=requirementCommands.requirementReferenceIndex([{id:'a',userId:'owner',isSample:true}],[{id:'o',userId:'owner',accountId:'a',isSample:true}],[]);
  const created=requirementCommands.createOutcomeRequirement(scope,{accountId:'a',opportunityId:'o',expectedOutcome:'Demo approval',role:'required_now'},refs);
  assert.equal(created.ok,true);assert.equal(created.value.isSample,true);
  await tick();assert.equal(requests.find(r=>r.table==='commercial_outcome_requirements'),undefined);
});
