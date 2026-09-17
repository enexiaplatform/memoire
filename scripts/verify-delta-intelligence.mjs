import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import {
  deriveCommercialDelta,
  DELTA_WINDOW_DAYS,
  deltaConditionByReason,
  deltaProvenances,
  OBSERVED_PROVENANCES,
} from '../src/domain/commercialKernel/deriveDelta.ts';
import {
  diffOpportunityState,
  recordOpportunityStateChanges,
} from '../src/domain/commercialKernel/opportunityChanges.ts';
import { selectOwedCloudRecords } from '../src/services/commercialKernel/kernelRepository.ts';
import { reasonCodes } from '../src/domain/commercialKernel/policyEngine.ts';
import { commercialEventTypes } from '../src/domain/commercialKernel/types.ts';

/*
 * Delta Intelligence has one failure mode that matters more than every other
 * one combined, and the product has already shipped it once.
 *
 * `updated_at` says a record changed. It does not say WHICH field changed, or
 * what it changed from. The previous "what changed" digest read
 * `opportunity.updated_at`, found it recent, and printed "Opportunity stage
 * updated" - a sentence asserting a transition nobody observed, on every deal
 * touched that fortnight. A seller who checks one of those and finds the stage
 * untouched stops believing the whole panel, and they are right to.
 *
 * These assertions are behavioural wherever they can be: they build a workspace
 * with the exact shape that produced the bug and require the engine to stay
 * silent, rather than grepping for a string somebody can rename.
 */

const TODAY = new Date('2026-09-05T00:00:00.000Z');
const ACCOUNT = 'Harbour Analytics';
const OPPORTUNITY_ID = 'opp-1';
const ago = (days) => new Date(TODAY.getTime() - days * 86_400_000).toISOString();
const agoDate = (days) => ago(days).slice(0, 10);

const subject = { kind: 'opportunity', id: OPPORTUNITY_ID, name: 'Rollout', accountName: ACCOUNT };

const derive = (patch = {}) => deriveCommercialDelta({
  subject,
  events: [],
  commitments: [],
  planItems: [],
  objections: [],
  stakeholders: [],
  activities: [],
  opportunityOutcomes: [],
  recommendations: [],
  observedFrom: null,
  today: TODAY,
  ...patch,
});

/**
 * Comments explain the bug; they are not the bug.
 *
 * Every file below documents the `updated_at` mistake in prose, so a plain
 * substring check over the raw source passes or fails on the explanation rather
 * than on the code. Textual assertions read the stripped form.
 */
const codeOf = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

const readCode = (file) => codeOf(readFileSync(file, 'utf8'));

const deltaSource = readFileSync('src/domain/commercialKernel/deriveDelta.ts', 'utf8');
const deltaCode = codeOf(deltaSource);
const panelCode = readCode('src/features/threads/DeltaPanel.tsx');

// ---------------------------------------------------------------- Contract A
// No fake transitions. A recent edit is not an observed change.
{
  // The exact bug shape: a deal that exists, was edited an hour ago, sits at a
  // stage, carries an amount and a close date - and has no recorded history.
  const justEdited = derive({
    events: [],
    // Nothing here records a transition. Everything here has an `updated_at`.
    objections: [{
      id: 'obj-1', accountId: '', accountName: ACCOUNT, opportunityId: OPPORTUNITY_ID,
      opportunityName: 'Rollout', stakeholderId: '', stakeholderName: '', sourceActivityId: '',
      objectionType: 'Price', objectionText: 'Terms', impact: 'Medium', status: 'Resolved',
      requiredProof: '', responsePlan: '', resolutionNote: '', dueDate: '', resolvedAt: '',
      tags: [], createdAt: ago(200), updatedAt: ago(0.04), storageMode: 'local',
    }],
  });

  assert.deepEqual(
    justEdited.changes,
    [],
    'a recently edited record with no recorded history must produce no observed change',
  );

  // An event that only knows the destination cannot prove a move.
  const halfKnown = derive({
    events: [{
      id: 'e-1', userId: null, eventType: 'opportunity_stage_changed', occurredAt: ago(2),
      recordedAt: ago(2), accountId: null, opportunityId: OPPORTUNITY_ID, threadId: null,
      commitmentId: null, summary: '', structuredPayload: { to: 'Negotiation' },
      idempotencyKey: null, sourceType: 'manual', sourceId: null, sourceUrl: null,
      sourceUpdatedAt: null, createdAt: ago(2),
    }],
  });
  assert.deepEqual(halfKnown.changes, [], 'an event without a recorded `from` proves no transition');

  // Setting a field for the first time is not a move from somewhere.
  assert.deepEqual(
    diffOpportunityState(
      { id: OPPORTUNITY_ID, accountName: ACCOUNT, opportunityName: 'Rollout', stage: '', expectedClosePeriod: '', estimatedValue: null, status: 'Active' },
      { stage: 'Proposal', expectedClosePeriod: 'Q4', estimatedValue: 100, status: 'Active' },
    ),
    [],
    'an initial value has no observed predecessor and must not be written as a transition',
  );

  // Every transition row must carry a provenance that can actually observe one.
  const observed = derive({
    commitments: [{
      id: 'c-1', userId: null, threadId: 't-1', accountId: '', accountName: ACCOUNT,
      opportunityId: OPPORTUNITY_ID, commitmentParty: 'customer', ownerLabel: 'Ana',
      commitmentText: 'Send the PO', originalDueDate: agoDate(20), currentDueDate: agoDate(2),
      silenceThresholdDays: 3, status: 'open', impactType: 'none',
      dueDateHistory: [{ from: agoDate(20), to: agoDate(2), changedAt: ago(3) }],
      sourceType: 'manual', createdAt: ago(60), updatedAt: ago(3),
    }],
  });
  assert.ok(observed.changes.length > 0, 'record-preserved history must still produce changes');
  for (const item of observed.changes) {
    assert.equal(item.observation, 'transition', 'the changes list holds only transitions');
    assert.ok(
      OBSERVED_PROVENANCES.includes(item.provenance),
      `a change may not come from provenance "${item.provenance}"`,
    );
  }

  // And the derivation must have no reason to read a last-edited timestamp.
  assert.equal(
    /\bupdatedAt\b|\bupdated_at\b/.test(deltaCode),
    false,
    'deriveDelta must not read a record\'s last-edited timestamp for anything',
  );
}

// ---------------------------------------------------------------- Contract B
// Evidence traceability. Nothing is asserted that cannot be checked.
{
  const rich = derive({
    events: [{
      id: 'e-1', userId: null, eventType: 'opportunity_close_period_changed', occurredAt: ago(3),
      recordedAt: ago(3), accountId: null, opportunityId: OPPORTUNITY_ID, threadId: null,
      commitmentId: null, summary: '', structuredPayload: { from: 'Q3', to: 'Q4' },
      idempotencyKey: null, sourceType: 'manual', sourceId: null, sourceUrl: null,
      sourceUpdatedAt: null, createdAt: ago(3),
    }],
    planItems: [{
      id: 'plan-1', date: agoDate(2), label: 'Send the pack', tag: '', done: true, doneAt: ago(1),
      linkedOpportunityId: OPPORTUNITY_ID, linkedAccountName: ACCOUNT,
      createdAt: ago(6), updatedAt: ago(1),
    }],
    recommendations: [{
      id: 'rec-1', reasonCode: 'THREAD_SILENT', reasonText: 'Nothing has happened for 21 days.',
      sourceRecordIds: ['thread-1'], threshold: 10, severity: 'medium',
      recommendedAction: 'Make contact.', calculatedAt: TODAY.toISOString(), accountName: ACCOUNT,
      threadId: 't-1', opportunityId: OPPORTUNITY_ID, href: '/app/opportunities',
    }],
  });

  assert.ok(rich.changes.length >= 2 && rich.conditions.length >= 1, 'the fixture must exercise both lists');
  for (const item of [...rich.changes, ...rich.conditions]) {
    assert.ok(
      Array.isArray(item.sourceRecordIds) && item.sourceRecordIds.length > 0,
      `a ${item.kind} row names no record that proves it`,
    );
    assert.ok(item.statement.trim().length > 0, `a ${item.kind} row says nothing`);
    if (item.observation === 'transition') {
      assert.ok(item.occurredAt, `an observed ${item.kind} must know when it happened`);
    } else {
      assert.equal(item.occurredAt, null, 'a condition is true now, not "at" a time');
    }
    if (item.transition) {
      assert.ok(item.transition.from && item.transition.to, 'a transition needs both halves');
    }
  }

  // The reading may only rest on rows that are actually in the result.
  if (rich.interpretation) {
    const ids = new Set([...rich.changes, ...rich.conditions].map((item) => item.id));
    for (const id of rich.interpretation.basis) {
      assert.ok(ids.has(id), `the reading cites ${id}, which is not in the result`);
    }
  }
}

// ---------------------------------------------------------------- Contract C
// Determinism. Same workspace, same clock, same answer.
{
  const inputs = {
    objections: [{
      id: 'obj-1', accountId: '', accountName: ACCOUNT, opportunityId: OPPORTUNITY_ID,
      opportunityName: 'Rollout', stakeholderId: '', stakeholderName: '', sourceActivityId: '',
      objectionType: 'Technical fit', objectionText: 'Needs validation', impact: 'High',
      status: 'Open', requiredProof: '', responsePlan: '', resolutionNote: '', dueDate: '',
      resolvedAt: '', tags: [], createdAt: ago(2), updatedAt: ago(2), storageMode: 'local',
    }],
    activities: [
      { id: 'a-1', accountName: ACCOUNT, opportunityName: '', activityType: 'Customer meeting', summary: '', nextAction: '', dueDate: '', tags: [], rawNote: '', activityDate: agoDate(40), linkedOpportunityId: OPPORTUNITY_ID, linkedOpportunityName: '', linkedAccountName: ACCOUNT, linkStatus: 'Linked', createdAt: ago(40), updatedAt: ago(40), storageMode: 'local' },
      { id: 'a-2', accountName: ACCOUNT, opportunityName: '', activityType: 'Customer meeting', summary: '', nextAction: '', dueDate: '', tags: [], rawNote: '', activityDate: agoDate(2), linkedOpportunityId: OPPORTUNITY_ID, linkedOpportunityName: '', linkedAccountName: ACCOUNT, linkStatus: 'Linked', createdAt: ago(2), updatedAt: ago(2), storageMode: 'local' },
    ],
    observedFrom: ago(120),
  };

  assert.equal(
    JSON.stringify(derive(inputs)),
    JSON.stringify(derive(inputs)),
    'delta derivation must not depend on wall-clock time or on iteration order',
  );

  // The clock is injected, so a caller can pin it. A `new Date()` reached for
  // inside the derivation would make the answer un-pinnable and untestable.
  assert.ok(
    /today\?: Date/.test(deltaCode),
    'the derivation must accept an injected clock',
  );
  assert.equal(
    (deltaCode.match(/new Date\(\)/g) || []).length,
    1,
    'exactly one `new Date()` is allowed: the default for the injected clock',
  );
}

// ---------------------------------------------------------------- Contract D
// Purity. Delta reads; it never writes.
{
  for (const line of deltaCode.split('\n')) {
    const match = line.match(/^import\s+(type\s+)?.*from\s+'([^']+)'/);
    if (!match) continue;
    const [, isType, specifier] = match;
    if (!specifier.includes('/services/')) continue;
    assert.ok(
      isType,
      `deriveDelta imports a service at runtime (${specifier}); it may only import their types`,
    );
  }

  for (const forbidden of ['localStorage', 'supabase', 'appendEvent', 'writeLocal', 'saveCommitment', 'recordCommercialEvent']) {
    assert.equal(
      deltaCode.includes(forbidden),
      false,
      `deriveDelta must not reach a write path: ${forbidden}`,
    );
  }
}

// ---------------------------------------------------------------- Contract E
// One recommendation engine. Delta points at the policy engine's answer.
{
  const existing = {
    id: 'rec-1', reasonCode: 'QUOTE_EXPIRING', reasonText: 'Quote Q-1 is valid for 3 more days.',
    sourceRecordIds: ['quote-1'], threshold: 7, severity: 'medium',
    recommendedAction: 'Chase the decision, or extend the validity.',
    calculatedAt: TODAY.toISOString(), accountName: ACCOUNT, threadId: null,
    opportunityId: OPPORTUNITY_ID, href: '/app/quotes',
  };
  const delta = derive({ recommendations: [existing] });

  assert.equal(delta.recommendation, existing, 'Delta must hand back the policy engine\'s own object');
  assert.equal(
    delta.conditions[0].statement,
    existing.reasonText,
    'a condition must keep the rule\'s own words rather than paraphrase it',
  );

  // Every rule the policy engine can raise has a declared meaning here, derived
  // from the engine's own union rather than from a second hand-written list.
  for (const code of reasonCodes) {
    assert.ok(deltaConditionByReason[code], `no delta meaning declared for policy rule ${code}`);
  }
  assert.deepEqual(
    Object.keys(deltaConditionByReason).sort(),
    [...reasonCodes].sort(),
    'the condition map and the policy rules must be the same set',
  );

  // The panel renders the kernel's answer; it does not compute one.
  for (const forbidden of ['evaluateCommercialPolicies', 'policyThresholds', 'severityWeight', 'score']) {
    assert.equal(
      panelCode.includes(forbidden),
      false,
      `the delta panel must not rank or re-derive recommendations: ${forbidden}`,
    );
  }
}

// ---------------------------------------------------------------- Contract F
// Honest history coverage. Incomplete may never read as complete.
{
  assert.equal(derive({ observedFrom: null }).historyCoverage.complete, false,
    'a workspace with no recorded events has no observed history to claim');
  assert.equal(derive({ observedFrom: ago(DELTA_WINDOW_DAYS - 1) }).historyCoverage.complete, false,
    'observation beginning inside the window covers only part of it');
  assert.equal(derive({ observedFrom: ago(DELTA_WINDOW_DAYS + 1) }).historyCoverage.complete, true,
    'observation beginning before the window covers it');

  // And the interface has to say so. A panel that renders coverage only when it
  // is complete tells the operator nothing on exactly the day it matters.
  assert.ok(
    /!delta\.historyCoverage\.complete/.test(panelCode),
    'the panel must render a coverage note when history is incomplete',
  );
  assert.ok(
    /started tracking|tracked since/.test(panelCode),
    'the coverage note must say when tracking began',
  );
}

// ---------------------------------------------------------------- Contract G
// No seventh destination. Delta is a panel inside surfaces that already exist.
{
  const app = readCode('src/App.tsx');
  assert.equal(app.includes('DeltaPanel'), false, 'Delta must not become a route');
  assert.equal(
    readCode('src/config/featureRegistry.ts').includes('delta'),
    false,
    'Delta must not become a navigable feature',
  );

  const surfaces = [
    ['src/features/accounts/AccountsPage.tsx', 'Accounts'],
    ['src/features/opportunities/OpportunitiesPage.tsx', 'Opportunities'],
  ];
  for (const [file, name] of surfaces) {
    assert.ok(
      readCode(file).includes('<DeltaPanel'),
      `${name} must show what changed on the record it has open`,
    );
  }
}

// ---------------------------------------------------------------- Contract H
// The old digest stays frozen, and stays honest.
{
  const digest = readCode('src/features/v31/whatChangedDigest.ts');

  assert.equal(
    /type: 'opportunity_stage_changed'/.test(digest),
    false,
    'the stage row built from `updated_at` must not come back - it asserts a move nobody observed',
  );
  assert.equal(
    /isRecent\(\s*opportunity\.updated_at/.test(digest),
    false,
    'no row may be built from an opportunity\'s last-edited timestamp',
  );
  assert.equal(
    /became overdue/.test(digest),
    false,
    'an overdue action is a state read from a due date, not a transition anybody watched',
  );

  // Frozen: the kernel must never come to depend on the v31 shadow model.
  for (const file of [
    'src/domain/commercialKernel/deriveDelta.ts',
    'src/domain/commercialKernel/opportunityChanges.ts',
    'src/features/threads/useCommercialDelta.ts',
    'src/features/threads/DeltaPanel.tsx',
  ]) {
    const source = readCode(file);
    assert.equal(
      /features\/v31|types\/v31/.test(source),
      false,
      `${file} must not read the v31 shadow model`,
    );
  }
}

// ---------------------------------------------------------------- Contract I
// Instrumentation: observed where it is free, and nowhere it would be noise.
{
  const store = readCode('src/services/opportunityStore.ts');
  assert.ok(
    store.includes('recordOpportunityStateChanges'),
    'updating a deal must note which watched fields moved - it is the only moment the previous value exists',
  );

  // History is a by-product. It must never be able to fail the operator's save.
  const updateBlock = store.slice(
    store.indexOf('export async function updateOpportunity'),
    store.indexOf('export async function deleteOpportunity'),
  );
  assert.ok(updateBlock.length > 0, 'updateOpportunity must be findable');
  for (const write of ['saveLocalOpportunityRecord', 'updateCloudOpportunity']) {
    assert.ok(
      updateBlock.indexOf(write) < updateBlock.indexOf('noteObservedChanges()'),
      `the record must be written before history is noted (${write})`,
    );
  }
  assert.ok(
    /catch(?:\s*\([^)]*\))?\s*{[^}]*}/.test(updateBlock.slice(updateBlock.indexOf('const noteObservedChanges'))),
    'a failure to record history must not surface as a failed save',
  );

  // The event types the diff emits must all be real kernel events.
  const changes = diffOpportunityState(
    { id: 'o', accountName: ACCOUNT, opportunityName: 'Rollout', stage: 'Proposal', expectedClosePeriod: 'Q3', estimatedValue: 400, status: 'Active' },
    { stage: 'Negotiation', expectedClosePeriod: 'Q4', estimatedValue: 200, status: 'Won' },
  );
  assert.equal(changes.length, 4, 'all four watched fields must be observed');
  for (const change of changes) {
    assert.ok(
      commercialEventTypes.includes(change.eventType),
      `${change.eventType} is not a Commercial Kernel event type`,
    );
  }

  // A repeat of the same save must not write the same history twice.
  const store2 = readCode('src/domain/commercialKernel/opportunityChanges.ts');
  assert.ok(
    store2.includes('idempotencyKey'),
    'a repeated save or sync must not duplicate a transition',
  );

  // Bounded reading. The event log is the one collection that grows forever.
  const events = readCode('src/services/commercialKernel/eventStore.ts');
  assert.ok(
    /EVENT_WINDOW_DAYS\s*=\s*\d+/.test(events) && /EVENT_WINDOW_LIMIT\s*=\s*\d+/.test(events),
    'the event read must declare both a time window and a row cap',
  );
  assert.equal(
    /loadRecentEvents[\s\S]*?fetchAllRows/.test(events),
    false,
    'the delta read must never fall back to reading the whole event history',
  );
}


// ---------------------------------------------------------------- Contract J
// A retry writes one event; two genuine transitions write two.
{
  const previousWindow = globalThis.window;
  const persisted = new Map();
  globalThis.window = {
    localStorage: { getItem: key => persisted.get(key) ?? null, setItem: (key, value) => persisted.set(key, value) },
    dispatchEvent: () => true,
  };
  const version = (stage, updatedAt) => ({
    id: 'opp-1', accountName: ACCOUNT, opportunityName: 'Rollout',
    stage, expectedClosePeriod: 'Q4', estimatedValue: 400, status: 'Active', updatedAt,
  });
  const keyOf = (previous, next) => recordOpportunityStateChanges(
    { userId: null }, previous, next, { occurredAt: '2026-09-05T12:00:00.000Z' },
  )[0].idempotencyKey;

  const t0 = version('Proposal', '2026-09-05T09:00:00.000Z');
  const t1 = version('Negotiation', '2026-09-05T11:30:00.000Z');
  const t2 = version('Proposal', '2026-09-05T15:45:00.000Z');

  assert.equal(
    keyOf(t0, t1),
    keyOf(t0, t1),
    'the same logical mutation, retried, must carry the same key',
  );
  assert.notEqual(
    keyOf(t0, t1),
    keyOf(t2, version('Negotiation', '2026-09-05T17:00:00.000Z')),
    'two genuine same-day moves in the same direction must not collapse into one event',
  );

  // The identity is the revision the mutation started from - an existing record
  // stamp, not a random id, which would make every retry a new row.
  const changesCode = readCode('src/domain/commercialKernel/opportunityChanges.ts');
  assert.ok(
    /previous\.updatedAt/.test(changesCode),
    'idempotency must key on the revision the mutation started from',
  );
  for (const forbidden of ['randomUUID', 'Math.random', 'crypto.getRandomValues']) {
    assert.equal(
      changesCode.includes(forbidden),
      false,
      `a random idempotency key destroys retry safety: ${forbidden}`,
    );
  }
  assert.equal(JSON.parse(persisted.get('memoire.commercialEvents.v1')).length, 2,
    'the two genuine transitions must be persisted, with a retry deduplicated');
  globalThis.window = previousWindow;
}

// ---------------------------------------------------------------- Contract K
// A failed cloud write becomes a durable retry, not a lost transition.
{
  const event = (id, createdAt) => ({ id, createdAt, updatedAt: createdAt });

  assert.deepEqual(
    selectOwedCloudRecords(
      [event('evt-1', '2026-09-05T09:00:00.000Z'), event('evt-2', '2026-09-05T10:00:00.000Z')],
      [event('evt-1', '2026-09-05T09:00:00.000Z')],
    ).map((item) => item.id),
    ['evt-2'],
    'an event the cloud never received must be offered again',
  );
  assert.deepEqual(
    selectOwedCloudRecords(
      [event('evt-1', '2026-09-05T09:00:00.000Z')],
      [event('evt-1', '2026-09-05T09:00:00.000Z')],
    ),
    [],
    'and a successful write must clear the retry rather than re-uploading forever',
  );

  // The retry is the local record itself. No second list to go stale.
  const events = readCode('src/services/commercialKernel/eventStore.ts');
  assert.ok(
    events.includes('selectOwedCloudRecords'),
    'the windowed read must offer the cloud the in-window events it is missing',
  );
  for (const forbidden of ['outbox', 'retryQueue', 'pendingEvents', 'setInterval', 'setTimeout']) {
    assert.equal(
      events.includes(forbidden),
      false,
      `durability comes from the local-first record, not from new machinery: ${forbidden}`,
    );
  }

  // And the canonical save is never at the mercy of any of it.
  const store = readCode('src/services/opportunityStore.ts');
  const updateBlock = store.slice(
    store.indexOf('export async function updateOpportunity'),
    store.indexOf('export async function deleteOpportunity'),
  );
  assert.ok(
    /catch(?:\s*\([^)]*\))?\s*{[^}]*}/.test(updateBlock.slice(updateBlock.indexOf('const noteObservedChanges'))),
    'a failure to record history must never surface as a failed save',
  );
}

// ---------------------------------------------------------------- Contract L
// No new table. The event log this work reads is the one that already existed.
{
  const migrations = readdirSync('supabase/migrations').filter((file) => file.endsWith('.sql'));
  const sql = migrations
    .map((file) => readFileSync(`supabase/migrations/${file}`, 'utf8'))
    .join('\n')
    .toLowerCase();

  for (const speculative of [
    'delta_events', 'change_log', 'audit_log', 'opportunity_history',
    'event_outbox', 'pending_events', 'event_queue',
  ]) {
    assert.equal(
      sql.includes(speculative),
      false,
      `Delta and ranking must reuse commercial_events, not add ${speculative}`,
    );
  }
  assert.equal(
    (sql.match(/create table if not exists public\.commercial_events/g) || []).length,
    1,
    'commercial_events is created once, by the original kernel migration',
  );
}

// ---------------------------------------------------------------- vocabulary
{
  assert.deepEqual(
    [...OBSERVED_PROVENANCES].sort(),
    ['event', 'record_history', 'record_occurrence'],
    'only these three provenances may support a past-tense claim',
  );
  assert.ok(
    deltaProvenances.includes('policy'),
    'conditions must be distinguishable from observations by provenance alone',
  );
}

console.log('Delta Intelligence verified: no transition is claimed without evidence, and coverage is stated honestly.');
