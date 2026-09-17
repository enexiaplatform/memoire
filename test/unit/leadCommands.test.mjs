import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The lead commands write through the real localStorage-backed stores, so the
// tests get the same minimal browser stub the kernel command tests use. What is
// under test is that a lead's record survives every transition it goes through
// - the whole promise of "one continuous commercial record".
class MemoryStorage {
  #data = new Map();
  refusedKeys = new Set();
  getItem(key) { return this.#data.has(key) ? this.#data.get(key) : null; }
  setItem(key, value) {
    if (this.refusedKeys.has(key)) throw Object.assign(new Error('Storage full'), { name: 'QuotaExceededError' });
    this.#data.set(key, String(value));
  }
  removeItem(key) { this.#data.delete(key); }
  clear() { this.#data.clear(); this.refusedKeys.clear(); }
  key(index) { return [...this.#data.keys()][index] ?? null; }
  get length() { return this.#data.size; }
}

const storage = new MemoryStorage();
const emitted = [];
globalThis.window = {
  localStorage: storage,
  dispatchEvent: event => { emitted.push(event.type); return true; },
  addEventListener: () => {},
  removeEventListener: () => {},
};
globalThis.localStorage = storage;
globalThis.CustomEvent = class CustomEvent {
  constructor(type, init) { this.type = type; this.detail = init?.detail; }
};

const { createLead, qualifyLead, nurtureLead, disqualifyLead } = await import('../../src/services/leadCommands.ts');
const { loadOpportunities, opportunityToFormInput, updateOpportunity } = await import('../../src/services/opportunityStore.ts');
const { loadOpportunityOutcomes } = await import('../../src/services/opportunityOutcomeStore.ts');
const { loadStakeholders } = await import('../../src/services/stakeholderStore.ts');
const { loadEvents, EVENT_STORAGE_KEY } = await import('../../src/services/commercialKernel/eventStore.ts');
const { buildRestorePlan } = await import('../../src/utils/workspaceBackup.ts');
const { createOpportunity, emptyOpportunityInput, OPPORTUNITY_STORAGE_KEY } = await import('../../src/services/opportunityStore.ts');
const { buildLeadQueue, selectLeads, selectQualifiedPipeline, disqualifiedLeadIds } = await import('../../src/utils/leadQueue.ts');

beforeEach(() => { storage.clear(); emitted.length = 0; });

/** A fresh read from storage - never the object the command returned. */
async function reread(id) {
  const all = await loadOpportunities(null);
  return all.find((item) => item.id === id);
}

async function abcPharma() {
  const { opportunity } = await createLead({
    accountName: 'ABC Pharma',
    opportunityName: 'New QC laboratory',
    contactName: 'Minh',
    contactRole: 'QA Manager',
    leadSource: 'Trade show',
    leadSourceDetail: 'Pharmedi 2026',
    nextAction: 'Follow up on rapid microbial testing',
    nextActionDate: '2026-09-22',
    evidence: 'New microbiology laboratory planned for 2027. Currently uses Merck.',
  }, null);
  return opportunity;
}

describe('creating a lead', () => {
  test('it is an opportunity at the Lead stage, with its source and next step', async () => {
    const lead = await reread((await abcPharma()).id);
    assert.equal(lead.stage, 'Lead');
    assert.equal(lead.status, 'Active');
    assert.equal(lead.leadSource, 'Trade show');
    assert.equal(lead.leadSourceDetail, 'Pharmedi 2026');
    assert.equal(lead.nextActionDate, '2026-09-22');
  });

  test('the person met becomes a stakeholder with an unknown role, not the decision maker', async () => {
    const lead = await abcPharma();
    const people = await loadStakeholders(null);
    assert.equal(people.length, 1);
    assert.equal(people[0].name, 'Minh');
    assert.equal(people[0].roleTitle, 'QA Manager');
    assert.equal(people[0].stakeholderRole, 'Unknown');
    assert.equal(people[0].opportunityId, lead.id);
    assert.equal((await reread(lead.id)).decisionMaker, '');
  });

  test('a source outside the controlled list is not stored as one', async () => {
    const { opportunity } = await createLead({ accountName: 'X', leadSource: 'Webinar' }, null);
    assert.equal((await reread(opportunity.id)).leadSource, '');
  });

  test('a lead needs a customer', async () => {
    await assert.rejects(() => createLead({ accountName: '   ' }, null));
  });
});

describe('qualifying', () => {
  test('Lead -> Discovery, and everything else on the record is unchanged', async () => {
    const lead = await abcPharma();
    const before = await reread(lead.id);
    await qualifyLead(before, null);
    const after = await reread(lead.id);

    assert.equal(after.id, before.id, 'the same record, not a copy');
    assert.equal(after.stage, 'Discovery');
    for (const field of [
      'accountName', 'opportunityName', 'leadSource', 'leadSourceDetail', 'nextAction',
      'nextActionDate', 'evidence', 'currency', 'createdAt',
    ]) {
      assert.deepEqual(after[field], before[field], `qualifying changed ${field}`);
    }
    assert.equal((await loadOpportunities(null)).length, 1, 'no second record was created');
  });

  test('it leaves Leads and appears in the qualified pipeline', async () => {
    const lead = await abcPharma();
    assert.equal(selectLeads(await loadOpportunities(null)).length, 1);
    await qualifyLead(await reread(lead.id), null);
    const book = await loadOpportunities(null);
    assert.equal(selectLeads(book).length, 0);
    assert.deepEqual(selectQualifiedPipeline(book).map((item) => item.id), [lead.id]);
  });

  test('the person stays attached to the same record', async () => {
    const lead = await abcPharma();
    await qualifyLead(await reread(lead.id), null);
    const people = await loadStakeholders(null);
    assert.equal(people[0].opportunityId, lead.id);
  });

  test('only a lead can be qualified', async () => {
    const lead = await abcPharma();
    await qualifyLead(await reread(lead.id), null);
    await assert.rejects(() => qualifyLead(storageRecord(lead.id), null));
  });

  test('a parked lead is no longer parked once qualified', async () => {
    const lead = await abcPharma();
    await nurtureLead(await reread(lead.id), { nurturedUntil: '2026-12-01', nurtureReason: 'Budget next FY' }, null);
    await qualifyLead(await reread(lead.id), null);
    const after = await reread(lead.id);
    assert.equal(after.nurturedUntil, '');
    assert.equal(after.nurtureReason, '');
  });
});

describe('nurturing', () => {
  test('keeps it a lead, keeps its data, and schedules the revisit', async () => {
    const lead = await abcPharma();
    await nurtureLead(await reread(lead.id), { nurturedUntil: '2026-12-01', nurtureReason: 'Budget next FY' }, null);
    const after = await reread(lead.id);
    assert.equal(after.stage, 'Lead');
    assert.equal(after.status, 'Active');
    assert.equal(after.nurturedUntil, '2026-12-01');
    assert.equal(after.nurtureReason, 'Budget next FY');
    assert.equal(after.leadSourceDetail, 'Pharmedi 2026');

    const parked = buildLeadQueue({ opportunities: [after], today: '2026-09-16' });
    assert.equal(parked.rows[0].state, 'nurture');
    const due = buildLeadQueue({ opportunities: [after], today: '2026-11-29' });
    assert.equal(due.rows[0].state, 'needs-action', 'it comes back on its own before the date');
  });

  test('an empty date brings it back and clears the reason', async () => {
    const lead = await abcPharma();
    await nurtureLead(await reread(lead.id), { nurturedUntil: '2026-12-01', nurtureReason: 'Budget' }, null);
    await nurtureLead(await reread(lead.id), { nurturedUntil: '', nurtureReason: 'ignored' }, null);
    const after = await reread(lead.id);
    assert.equal(after.nurturedUntil, '');
    assert.equal(after.nurtureReason, '');
  });
});

describe('disqualifying', () => {
  test('writes the reason on a Lost close-out that remembers it was a lead', async () => {
    const lead = await abcPharma();
    await disqualifyLead(await reread(lead.id), { reason: 'No budget', note: 'Frozen until 2028' }, null);

    const after = await reread(lead.id);
    assert.equal(after.status, 'Lost');
    assert.ok(after.closedOn, 'the day it closed is recorded');
    assert.equal(after.leadSource, 'Trade show', 'the record is kept, with its source');

    const outcomes = loadOpportunityOutcomes();
    assert.equal(outcomes.length, 1);
    assert.equal(outcomes[0].outcome, 'Lost');
    assert.equal(outcomes[0].stageBeforeOutcome, 'Lead');
    assert.equal(outcomes[0].reasonCategory, 'Budget');
    assert.equal(outcomes[0].reasonText, 'No budget - Frozen until 2028');
  });

  test('it stays on Leads under Disqualified and never reaches the pipeline', async () => {
    const lead = await abcPharma();
    await disqualifyLead(await reread(lead.id), { reason: 'Poor fit', note: '' }, null);
    const book = await loadOpportunities(null);
    const disqualified = disqualifiedLeadIds(loadOpportunityOutcomes());
    assert.equal(selectQualifiedPipeline(book, disqualified).length, 0);
    const queue = buildLeadQueue({ opportunities: book, opportunityOutcomes: loadOpportunityOutcomes() });
    assert.equal(queue.total, 0);
    assert.equal(queue.closedCount, 1);
  });
});

describe('the save round-trip carries every field', () => {
  test('an unrelated edit through the form does not blank the lead fields or the close date', async () => {
    // Four write paths rebuild a deal through opportunityToFormInput before
    // saving it. While that function listed fields by hand it dropped
    // everything it did not name.
    const lead = await abcPharma();
    await nurtureLead(await reread(lead.id), { nurturedUntil: '2026-12-01', nurtureReason: 'Budget next FY' }, null);
    const before = await reread(lead.id);
    await updateOpportunity(before, { ...opportunityToFormInput(before), closedOn: '2026-09-01', nextAction: 'Changed' }, null);
    const edited = await reread(lead.id);
    await updateOpportunity(edited, { ...opportunityToFormInput(edited), nextAction: 'Changed again' }, null);
    const after = await reread(lead.id);

    assert.equal(after.nextAction, 'Changed again');
    assert.equal(after.leadSource, 'Trade show');
    assert.equal(after.leadSourceDetail, 'Pharmedi 2026');
    assert.equal(after.nurturedUntil, '2026-12-01');
    assert.equal(after.nurtureReason, 'Budget next FY');
    assert.equal(after.closedOn, '2026-09-01');
  });

  test('the form input has every field of the record except identity and storage', async () => {
    const record = await reread((await abcPharma()).id);
    const input = opportunityToFormInput(record);
    for (const key of ['id', 'userId', 'createdAt', 'updatedAt', 'storageMode', 'source', 'isSample']) {
      assert.equal(key in input, false, `${key} is identity or storage, not input`);
    }
    for (const key of Object.keys(record)) {
      if (['id', 'userId', 'createdAt', 'updatedAt', 'storageMode', 'source', 'isSample'].includes(key)) continue;
      assert.ok(key in input, `opportunityToFormInput dropped ${key}`);
    }
  });
});

function storageRecord(id) {
  const raw = JSON.parse(storage.getItem('memoire.opportunities.v1') || '[]');
  return raw.find((item) => item.id === id);
}

describe('qualification persistence failures', () => {
  test('a refused canonical write rejects before UI success or a stage event', async () => {
    const lead = await abcPharma();
    const before = storage.getItem(OPPORTUNITY_STORAGE_KEY);
    const events = storage.getItem(EVENT_STORAGE_KEY);
    storage.refusedKeys.add(OPPORTUNITY_STORAGE_KEY);
    emitted.length = 0;
    let successReached = false;
    await assert.rejects(async () => {
      await qualifyLead(lead, null);
      successReached = true; // The UI only replaces the record after await resolves.
    }, /space|saved/i);
    assert.equal(successReached, false);
    assert.equal(storage.getItem(OPPORTUNITY_STORAGE_KEY), before);
    assert.equal((await reread(lead.id)).stage, 'Lead');
    assert.equal(storage.getItem(EVENT_STORAGE_KEY), events);
    assert.equal(emitted.includes('memoire:commercial-events-updated'), false);
    storage.refusedKeys.clear();
    await qualifyLead(lead, null);
    assert.equal((await reread(lead.id)).stage, 'Discovery');
    assert.equal(loadEvents().filter(e => e.eventType === 'opportunity_stage_changed').length, 1);
  });

  test('history failure warns without rolling back state; stale retry does not transition again', async () => {
    const lead = await abcPharma();
    storage.refusedKeys.add(EVENT_STORAGE_KEY);
    emitted.length = 0;
    const result = await qualifyLead(lead, null);
    assert.equal(result.opportunity.stage, 'Discovery');
    assert.match(result.warning, /saved.*history/i);
    const accepted = storage.getItem(OPPORTUNITY_STORAGE_KEY);
    assert.equal((await reread(lead.id)).stage, 'Discovery');
    assert.equal(loadEvents().length, 0);
    assert.equal(emitted.includes('memoire:commercial-events-updated'), false);
    storage.refusedKeys.clear();
    await assert.rejects(() => qualifyLead(lead, null), /saved lead/);
    assert.equal(storage.getItem(OPPORTUNITY_STORAGE_KEY), accepted);
    assert.equal(loadEvents().length, 0, 'retry does not invent a second transition or silently repair history');
  });

  test('unavailable local storage rejects instead of claiming acceptance', async () => {
    const saved = globalThis.localStorage;
    delete globalThis.localStorage;
    delete globalThis.window.localStorage;
    try {
      await assert.rejects(() => createLead({ accountName: 'Unavailable' }, null), /storage/i);
    } finally {
      globalThis.localStorage = saved;
      globalThis.window.localStorage = saved;
    }
  });
});

describe('explicit workspace isolation for every creation entry', () => {
  for (const sample of [false, true]) {
    const workspace = { source: sample ? 'demo' : 'user', isSample: sample };
    test(`Add Lead and Capture shared command: sample=${sample}`, async () => {
      const { opportunity, stakeholder } = await createLead({
        accountName: 'Same customer name', contactName: 'Recorded person',
        evidence: 'Original captured need', leadSource: 'Trade show', leadSourceDetail: 'Recorded event',
      }, 'signed-in-owner', workspace);
      const stored = await reread(opportunity.id);
      assert.equal(stored.isSample, sample);
      assert.equal(stored.source, workspace.source);
      assert.equal(stored.evidence, 'Original captured need');
      assert.equal(stored.leadSource, 'Trade show');
      assert.equal(stakeholder.isSample, sample);
      assert.equal(stakeholder.source, workspace.source);
      const plan = buildRestorePlan({ exportedAt: new Date().toISOString(), localBrowserData: { [OPPORTUNITY_STORAGE_KEY]: [stored] } });
      assert.equal(plan.droppedSampleRecords, sample ? 1 : 0);
      assert.equal(plan.restoredRecords, sample ? 0 : 1);
      await qualifyLead(stored, sample ? undefined : 'signed-in-owner');
      assert.equal((await reread(stored.id)).isSample, sample);
      assert.equal(loadEvents()[0].isSample === true, sample);
      assert.equal(loadEvents()[0].sourceType, 'manual', 'existing event provenance vocabulary is unchanged');
    });
    test(`shared Opportunity editor/import creation: sample=${sample}`, async () => {
      const result = await createOpportunity({ ...emptyOpportunityInput, accountName: 'A', opportunityName: 'Imported lead', stage: 'Lead' }, 'owner', workspace);
      const stored = await reread(result.opportunity.id);
      assert.equal(stored.isSample, sample);
      assert.equal(stored.source, workspace.source);
      if (sample) assert.equal(stored.userId, undefined);
    });
  }

  test('demo scope wins over a contradictory false sample flag', async () => {
    const { opportunity, stakeholder } = await createLead({ accountName: 'A', contactName: 'Person' }, 'owner', { source: 'demo', isSample: false });
    assert.equal(opportunity.isSample, true);
    assert.equal(stakeholder.isSample, true);
  });

  test('failed sample creation returns no lead and does not create its person', async () => {
    storage.refusedKeys.add(OPPORTUNITY_STORAGE_KEY);
    await assert.rejects(() => createLead({ accountName: 'A', contactName: 'Person' }, null, { source: 'demo', isSample: true }));
    assert.equal((await loadOpportunities(null)).length, 0);
    assert.equal((await loadStakeholders(null)).length, 0);
  });
});

test('qualification preserves source data and linked records byte-for-byte', async () => {
  const lead = await abcPharma();
  const enriched = (await updateOpportunity(lead, { ...opportunityToFormInput(lead), estimatedValue: 12345, channel: 'Referral', sourceSystem: 'import-system', externalSourceKey: 'source-row-7', nurturedUntil: '2026-12-01', nurtureReason: 'Later' }, null)).opportunity;
  const linked = {
    'memoire.salesActivities.v1': [{ id: 'activity-proof', linkedOpportunityId: lead.id, rawNote: 'Original customer words', linkedAccountName: lead.accountName }],
    'memoire.commercialEvidence.v1': [{ id: 'evidence-proof', opportunityId: lead.id, sourceType: 'capture', sourceId: 'activity-proof', threadId: 'thread-proof' }],
  };
  for (const [key, records] of Object.entries(linked)) storage.setItem(key, JSON.stringify(records));
  const peopleBefore = JSON.stringify(await loadStakeholders(null));
  const eventsBefore = loadEvents();
  const after = (await qualifyLead(enriched, null)).opportunity;
  for (const key of ['id', 'createdAt', 'accountName', 'evidence', 'estimatedValue', 'currency', 'leadSource', 'leadSourceDetail', 'channel', 'sourceSystem', 'externalSourceKey', 'source', 'isSample']) {
    assert.deepEqual(after[key], enriched[key], key);
  }
  for (const [key, records] of Object.entries(linked)) assert.equal(storage.getItem(key), JSON.stringify(records));
  assert.equal(JSON.stringify(await loadStakeholders(null)), peopleBefore);
  for (const event of eventsBefore) assert.ok(loadEvents().some(e => e.id === event.id));
  assert.equal(after.nurturedUntil, '');
  assert.equal(after.nurtureReason, '');
});

test('current UI creation callers forward explicit workspace scope to the shared services', () => {
  for (const file of ['leads/LeadsPage.tsx', 'dailyCapture/DailyCapturePage.tsx']) {
    const source = readFileSync(new URL(`../../src/features/${file}`, import.meta.url), 'utf8');
    assert.match(source, /await createLead\(/, file);
    assert.match(source, /source: sampleDataActive \? 'demo' : 'user', isSample: sampleDataActive/, file);
  }
  const opportunities = readFileSync(new URL('../../src/features/opportunities/OpportunitiesPage.tsx', import.meta.url), 'utf8');
  const calls = opportunities.split('\n').filter(line => line.includes('createOpportunity('));
  assert.equal(calls.length, 3, 'editor and both existing import entry paths');
  for (const call of calls) assert.match(call, /isSample: sampleDataActive/);
});
