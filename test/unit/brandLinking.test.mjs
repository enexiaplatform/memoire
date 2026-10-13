import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
const data = new Map();
let refused = '';
const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => { if (key === refused) throw new Error('Quota'); data.set(key, String(value)); }, removeItem: key => data.delete(key), key: i => [...data.keys()][i], get length() { return data.size; } };
globalThis.window = { localStorage: storage, dispatchEvent: () => true, addEventListener: () => {}, removeEventListener: () => {} };
globalThis.localStorage = storage;
globalThis.CustomEvent = class { constructor(type) { this.type = type; } };
const { createOpportunity, updateOpportunity, emptyOpportunityInput, opportunityToFormInput } = await import('../../src/services/opportunityStore.ts');
const { createLead, qualifyLead } = await import('../../src/services/leadCommands.ts');
const { savePortfolio, readPortfolio, registerLegacyBrand, PORTFOLIO_STORAGE_KEY } = await import('../../src/services/portfolioStore.ts');
const { portfolioAssignments, portfolioNodes } = await import('../../src/domain/portfolio/portfolioCatalog.ts');
const scope = { userId: null, sampleDataActive: true }, tag = { source: 'demo', isSample: true };
const brand = name => ({ kind: 'brand', name, code: '', description: '', status: 'active', parentId: null, brandId: null, groupId: null, aliases: [] });
const input = extra => ({ ...emptyOpportunityInput, accountName: 'Acme', opportunityName: 'Project', ...extra });
beforeEach(() => { data.clear(); refused = ''; });

test('a refused journal prevents both writes; retry after reload keeps optional input fields and one identity', async () => {
  const {BRAND_WRITE_JOURNAL_KEY, pendingBrandWrites} = await import('../../src/services/brandWriteJournal.ts');
  const {retryPendingOpportunityBrandWrites} = await import('../../src/services/opportunityStore.ts');
  await savePortfolio(scope,{id:'b',state:brand('Tailin'),expectedVersion:0});
  const commandInput=input({brand:'Tailin',brandCatalogId:'b',accountId:undefined});
  refused=BRAND_WRITE_JOURNAL_KEY;
  await assert.rejects(()=>createOpportunity(commandInput,null,tag));
  assert.equal(portfolioAssignments(readPortfolio(scope)).length,0);
  refused='memoire.opportunities.v1';
  await assert.rejects(()=>createOpportunity(commandInput,null,tag));
  const id=pendingBrandWrites(scope)[0].opportunityId;
  refused='';await retryPendingOpportunityBrandWrites(scope);
  assert.equal(JSON.parse(storage.getItem('memoire.opportunities.v1'))[0].id,id);
  assert.equal(portfolioAssignments(readPortfolio(scope)).length,1);
  assert.equal(pendingBrandWrites(scope).length,0);
});

test('pending Brand commands refuse a foreign account and demo commands are excluded from native restore', async () => {
  const {beginBrandWrite,pendingBrandWrites,BRAND_WRITE_JOURNAL_KEY}=await import('../../src/services/brandWriteJournal.ts');
  const {buildRestorePlan}=await import('../../src/utils/workspaceBackup.ts');
  beginBrandWrite(scope,input({brand:'Tailin',brandCatalogId:'b'}));
  storage.setItem('memoire.local-workspace-owner.v1','owner-a');
  assert.throws(()=>pendingBrandWrites({userId:'owner-b',sampleDataActive:false}),/Workspace changed/);
  const plan=buildRestorePlan({exportedAt:stampForBackup(),localBrowserData:{[BRAND_WRITE_JOURNAL_KEY]:JSON.parse(storage.getItem(BRAND_WRITE_JOURNAL_KEY))}});
  assert.equal(plan.droppedSampleRecords,1);
});
function stampForBackup(){return new Date().toISOString();}

test('Leads select a catalog ID, aliases resolve, and qualification keeps the link after rename', async () => {
  await savePortfolio(scope, { id: 'b', state: { ...brand('Tailin'), aliases: ['TL'] }, expectedVersion: 0 });
  const lead = await createLead({ accountName: 'Acme', brand: 'TL', brandCatalogId: 'b' }, null, tag);
  assert.equal(lead.opportunity.brand, 'Tailin');
  assert.equal(portfolioAssignments(readPortfolio(scope))[0].brandId, 'b');
  await savePortfolio(scope, { id: 'b', state: brand('Tailin renamed'), expectedVersion: 1 });
  await qualifyLead(lead.opportunity, null);
  assert.equal(portfolioAssignments(readPortfolio(scope))[0].brandId, 'b');
  assert.equal(portfolioAssignments(readPortfolio(scope))[0].version, 1);
});

test('manual and imported names share Others while preserving each entered name', async () => {
  const a = await createOpportunity(input({ brand: 'Custom A', brandCatalogId: '__others__' }), null, tag);
  const b = await createOpportunity(input({ brand: 'Custom B' }), null, tag);
  const records = readPortfolio(scope), assignments = portfolioAssignments(records);
  assert.equal(portfolioNodes(records).length, 1);
  assert.equal(portfolioNodes(records)[0].name, 'Others');
  assert.equal(assignments[0].brandId, assignments[1].brandId);
  assert.equal(a.opportunity.brand, 'Custom A'); assert.equal(b.opportunity.brand, 'Custom B');
  assert.equal(assignments[1].originalBrand, 'Custom B');
  await assert.rejects(createOpportunity(input({ brandCatalogId: '__others__' }), null, tag), /Enter a brand name/);
});

test('concurrent intake shares one Others catalog identity and links every record', async () => {
  const results = await Promise.all(['Imported A','Imported B','Imported C'].map((brand, index) =>
    createOpportunity(input({opportunityName:`Import ${index}`,brand}),null,tag)));
  const records=readPortfolio(scope), assignments=portfolioAssignments(records);
  assert.equal(portfolioNodes(records).filter(row=>row.name==='Others').length,1);
  assert.equal(assignments.length,3);
  assert.equal(new Set(assignments.map(row=>row.brandId)).size,1);
  assert.ok(results.every(row=>!row.warning));
});

test('unrelated edits preserve accepted manual classification, explicit clearing removes only Brand', async () => {
  await savePortfolio(scope, { id: 'b', state: brand('PMM'), expectedVersion: 0 });
  const { opportunity } = await createOpportunity(input({ brand: 'Legacy' }), null, tag);
  const old = portfolioAssignments(readPortfolio(scope))[0];
  await savePortfolio(scope, { id: old.id, expectedVersion: old.version, opportunity, state: { ...old, brandId: 'b', originalBrand: 'Different original' } });
  const result = await updateOpportunity(opportunity, { ...opportunityToFormInput(opportunity), nextAction: 'Call' }, null);
  assert.equal(portfolioAssignments(readPortfolio(scope))[0].brandId, 'b');
  assert.equal(portfolioAssignments(readPortfolio(scope))[0].originalBrand, 'Different original');
  assert.equal(portfolioAssignments(readPortfolio(scope))[0].version, 2);
  await updateOpportunity(result.opportunity, { ...opportunityToFormInput(result.opportunity), brand: '', brandCatalogId: '' }, null);
  assert.equal(portfolioAssignments(readPortfolio(scope))[0].brandId, null);
});

test('legacy acceptance links exact names and Leads once, keeps existing classifications and rejects retired targets', async () => {
  const at = '2026-10-08T00:00:00.000Z';
  const opportunities = ['Tailin', 'tailin', 'Tailin Labs'].map((name, i) => ({ ...emptyOpportunityInput, id: `legacy-${i}`, brand: name, source: 'demo', isSample: true, stage: 'Lead', createdAt: at, updatedAt: at }));
  await registerLegacyBrand(scope, 'Tailin', opportunities);
  await registerLegacyBrand(scope, 'Tailin', opportunities);
  assert.equal(portfolioAssignments(readPortfolio(scope)).length, 2);
  assert.ok(portfolioAssignments(readPortfolio(scope)).every(row => row.version === 1));
  const node = portfolioNodes(readPortfolio(scope))[0];
  await savePortfolio(scope, { id: node.id, state: { ...node, status: 'retired' }, expectedVersion: node.version });
  await assert.rejects(createOpportunity(input({ brand: 'Tailin', brandCatalogId: node.id }), null, tag), /active Brand/);
});

test('a refused Brand write rejects before saving the deal, and retry keeps one identity', async () => {
  refused = PORTFOLIO_STORAGE_KEY;
  const form=input({ brand: 'Custom', brandCatalogId: '__others__' });
  await assert.rejects(createOpportunity(form,null,tag),/Save is not complete/);
  assert.equal(JSON.parse(data.get('memoire.opportunities.v1') || '[]').length,0);
  assert.equal(readPortfolio(scope).length, 0);
  const command=JSON.parse(data.get('memoire.brandWriteJournal.v1'))[0];
  refused='';
  const result=await createOpportunity(form,null,tag);
  assert.equal(result.opportunity.id,command.opportunityId);
  assert.equal(portfolioAssignments(readPortfolio(scope)).length,1);
  assert.equal(JSON.parse(data.get('memoire.opportunities.v1')).length,1);
  assert.equal(JSON.parse(data.get('memoire.brandWriteJournal.v1')).length,0);
});

test('a refused deal write preserves its Brand command and completes once through catalog retry',async()=>{
  refused='memoire.opportunities.v1';
  const form=input({brand:'Manual',brandCatalogId:'__others__'});
  await assert.rejects(createOpportunity(form,null,tag),/Save is not complete/);
  const command=JSON.parse(data.get('memoire.brandWriteJournal.v1'))[0];
  assert.equal(portfolioAssignments(readPortfolio(scope))[0].opportunityId,command.opportunityId);
  refused='';
  const {retryPendingOpportunityBrandWrites}=await import('../../src/services/opportunityStore.ts');
  await retryPendingOpportunityBrandWrites(scope);
  await retryPendingOpportunityBrandWrites(scope);
  assert.equal(JSON.parse(data.get('memoire.opportunities.v1')).length,1);
  assert.equal(JSON.parse(data.get('memoire.brandWriteJournal.v1')).length,0);
});

test('classification cannot unlink a recorded Brand or accept unnamed Others', async () => {
  const {opportunity}=await createOpportunity(input({brand:'Manual Brand'}),null,tag);
  const current=portfolioAssignments(readPortfolio(scope))[0];
  await assert.rejects(savePortfolio(scope,{id:current.id,expectedVersion:current.version,opportunity,state:{...current,brandId:null}}),/must keep a catalog link/);
  await assert.rejects(savePortfolio(scope,{id:current.id,expectedVersion:current.version,opportunity,state:{...current,originalBrand:''}}),/manual brand name/);
  assert.equal(portfolioAssignments(readPortfolio(scope))[0].brandId,current.brandId);
});
