import assert from 'node:assert/strict';
import { test } from 'node:test';
import { prepareCommercialCommand, evaluateCommercialReceipt } from '../../src/domain/commercialKernel/commercialCommandContract.ts';

const owner = '11111111-1111-4111-8111-111111111111';
const otherOwner = '22222222-2222-4222-8222-222222222222';
const observation = {
  schemaVersion: 1, sourceKind: 'crm', sourceNamespace: 'fixture', sourceEventId: 'statement-42',
  sourceVersion: '1', observedAt: '2026-11-17T12:00:00.000Z', summary: 'Reported decision', rawText: 'Unverified source statement.',
};
const body = { version: 1, command: 'receive-observation', observation };

test('agent proposal fixtures cannot assign authority, accept truth or request additional commands', async () => {
  const fixtures = [
    { ...body, actorId: otherOwner },
    { ...body, workspaceId: otherOwner },
    { ...body, idempotencyKey: 'model-chosen-key' },
    { ...body, grant: { allowed: true } },
    { ...body, approval: { approved: true } },
    { ...body, permissions: ['commercial:write'] },
    { ...body, command: 'complete-commitment' },
    { ...body, command: 'accept-evidence' },
    { ...body, version: 2 },
  ];
  for (const candidate of fixtures) {
    assert.deepEqual(await prepareCommercialCommand(candidate, owner), { status: 'invalid_command' });
  }
  const untrustedFields = {
    actorId: otherOwner,
    workspaceId: otherOwner,
    approval: { approved: true },
    grant: { allowed: true },
    permissions: ['commercial:write'],
    acceptedCommercialTruth: true,
  };
  for (const [field, value] of Object.entries(untrustedFields)) {
    assert.deepEqual(await prepareCommercialCommand({ ...body, observation: { ...observation, [field]: value } }, owner),
      { status: 'invalid_observation' }, field);
  }
  for (const field of ['summary', 'rawText']) {
    assert.deepEqual(await prepareCommercialCommand({ ...body, observation: { ...observation, [field]: untrustedFields } }, owner),
      { status: 'invalid_observation' }, field);
  }
  assert.deepEqual(await prepareCommercialCommand({ ...body, observation: { ...observation, rawText: '€'.repeat(43_000) } }, owner),
    { status: 'payload_too_large' });
});

test('canonical action identity follows source version and trusted storage owner, not JSON field order or source text', async () => {
  const prepared = await prepareCommercialCommand(body, owner);
  assert.equal(prepared.status, 'prepared');
  assert.match(prepared.effectId, /^observation:[a-f0-9]{64}$/);
  assert.equal(prepared.effectId, prepared.event.idempotencyKey);
  const variations = [
    ['reordered', { observation: { ...observation }, command: body.command, version: 1 }, owner, true],
    ['changed content', { ...body, observation: { ...observation, rawText: 'Claim changed' } }, owner, true],
    ['new source version', { ...body, observation: { ...observation, sourceVersion: '2' } }, owner, false],
    ['separate book', body, otherOwner, false],
  ];
  for (const [label, input, scope, matches] of variations) {
    const candidate = await prepareCommercialCommand(input, scope);
    assert.equal(candidate.status, 'prepared', label);
    assert.equal(candidate.effectId === prepared.effectId, matches, label);
  }
});

test('receipt acknowledgment requires canonical event provenance and never promotes commercial truth', async () => {
  const prepared = await prepareCommercialCommand(body, owner);
  const stamp = '2026-11-17T12:34:56.000Z';
  const stored = { ...prepared.event, occurredAt: stamp, recordedAt: stamp, createdAt: stamp };
  const acknowledged = evaluateCommercialReceipt(prepared, stored);
  assert.deepEqual(acknowledged, {
    status: 'acknowledged',
    receipt: { id: prepared.effectId, receivedAt: stamp, observation, acceptedCommercialTruth: false },
  });
  assert.deepEqual(evaluateCommercialReceipt(await prepareCommercialCommand({
    ...body, observation: { ...observation, rawText: 'Changed while keeping source version' },
  }, owner), stored), { status: 'source_version_conflict' });

  for (const row of [null, { ...stored, userId: otherOwner }, { ...stored, id: 'another-id' },
    { ...stored, idempotencyKey: 'forged' }, { ...stored, isSample: true },
    { ...stored, opportunityId: 'promoted-deal' }, { ...stored, eventType: 'commitment_completed' }]) {
    assert.deepEqual(evaluateCommercialReceipt(prepared, row), { status: 'invalid_stored_receipt' });
  }
});
