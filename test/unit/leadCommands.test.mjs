import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// The lead commands write through the real localStorage-backed stores, so the
// tests get the same minimal browser stub the kernel command tests use. What is
// under test is that a lead's record survives every transition it goes through
// - the whole promise of "one continuous commercial record".
class MemoryStorage {
  #data = new Map();
  getItem(key) { return this.#data.has(key) ? this.#data.get(key) : null; }
  setItem(key, value) { this.#data.set(key, String(value)); }
  removeItem(key) { this.#data.delete(key); }
  clear() { this.#data.clear(); }
  key(index) { return [...this.#data.keys()][index] ?? null; }
  get length() { return this.#data.size; }
}

const storage = new MemoryStorage();
globalThis.window = {
  localStorage: storage,
  dispatchEvent: () => true,
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
const { buildLeadQueue, selectLeads, selectQualifiedPipeline, disqualifiedLeadIds } = await import('../../src/utils/leadQueue.ts');

beforeEach(() => storage.clear());

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
