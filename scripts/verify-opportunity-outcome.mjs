import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  isTerminalStage,
  reconcileOpportunityOutcome,
  stageForStatus,
  statusForStage,
} from '../src/utils/opportunityOutcome.ts';

// A deal has one outcome and two fields that can name it. Nothing reconciled
// them, so `stage: 'Won'` with `status: 'Active'` was a storable record - and
// the product then disagreed with itself: six modules count by status, three
// accept either. Drag a deal to Won and forget the Status field, and half the
// app banks the revenue while the other half keeps nagging you to follow it up.

// 1. One side closed, the other Active: the closed answer is the deliberate one.
{
  assert.deepEqual(
    reconcileOpportunityOutcome('Won', 'Active'),
    { stage: 'Won', status: 'Won' },
    'a deal dragged to the Won stage is won',
  );
  assert.deepEqual(
    reconcileOpportunityOutcome('Negotiation', 'Lost'),
    { stage: 'Lost', status: 'Lost' },
    'a deal marked Lost is not still in Negotiation',
  );
  assert.deepEqual(reconcileOpportunityOutcome('Proposal', 'Active'), { stage: 'Proposal', status: 'Active' });
}

// 2. Both closed and disagreeing: status wins, because status is what every
// money figure in the product already counts by - so no workspace's reported
// revenue moves on the day this rule ships.
{
  assert.deepEqual(reconcileOpportunityOutcome('Won', 'Lost'), { stage: 'Lost', status: 'Lost' });
  assert.deepEqual(reconcileOpportunityOutcome('Lost', 'Won'), { stage: 'Won', status: 'Won' });
}

// 3. Reconciling is idempotent - a second pass never moves a record again.
for (const [stage, status] of [['Won', 'Active'], ['Negotiation', 'Lost'], ['Won', 'Lost'], ['Demo', 'Active']]) {
  const once = reconcileOpportunityOutcome(stage, status);
  const twice = reconcileOpportunityOutcome(once.stage, once.status);
  assert.deepEqual(twice, once, `reconciling ${stage}/${status} twice must be stable`);
}

// 4. The editor keeps the pair in step, in both directions, so the
// both-closed-and-disagreeing case above stays a legacy-only concern.
{
  assert.equal(statusForStage('Won', 'Active'), 'Won');
  assert.equal(statusForStage('Lost', 'Active'), 'Lost');
  assert.equal(statusForStage('On hold', 'Active'), 'On hold');
  // Moving a closed deal back into the pipeline re-opens it.
  assert.equal(statusForStage('Negotiation', 'Won'), 'Active');
  assert.equal(statusForStage('Negotiation', 'Active'), 'Active');

  assert.equal(stageForStatus('Won', 'Proposal'), 'Won');
  assert.equal(stageForStatus('Lost', 'Demo'), 'Lost');
  // Re-opening must not strand the deal on the Won stage, and must not throw
  // away a real pipeline stage either.
  assert.equal(stageForStatus('Active', 'Won'), 'Negotiation');
  assert.equal(stageForStatus('Active', 'Proposal'), 'Proposal');
}

// 5. Terminal stages are exactly the three that mean "closed".
{
  for (const stage of ['Won', 'Lost', 'On hold']) assert.ok(isTerminalStage(stage), `${stage} is terminal`);
  for (const stage of ['Lead', 'Discovery', 'Qualification', 'Technical discussion', 'Demo', 'Proposal', 'Negotiation', 'Procurement']) {
    assert.equal(isTerminalStage(stage), false, `${stage} is a position, not an outcome`);
  }
}

// 6. Applied at the boundary, not left to 89 readers. Both read paths matter as
// much as the write: a workspace already holds records that disagree, and
// reconciling on read repairs them with no migration.
{
  const store = readFileSync('src/services/opportunityStore.ts', 'utf8');
  assert.ok(store.includes('reconcileOpportunityOutcome'), 'the store must import the rule');
  assert.equal(
    (store.match(/reconciledOutcome\(/g) || []).length >= 4,
    true,
    'reconciliation must cover the local read, the cloud read and the write normalizer',
  );
  assert.equal(
    /status: normalizeStatus\(/.test(store),
    false,
    'status must never be normalized without its stage',
  );

  const page = readFileSync('src/features/opportunities/OpportunitiesPage.tsx', 'utf8');
  assert.ok(page.includes('statusForStage(') && page.includes('stageForStatus('),
    'the deal editor must keep Stage and Status in step in both directions');
}

console.log('Opportunity outcome contract verified: one outcome, reconciled on every read and write.');
