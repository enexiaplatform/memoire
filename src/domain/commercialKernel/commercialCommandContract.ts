import { isExternalObservationReceipt, normalizeExternalObservation, prepareExternalObservationReceipt } from './externalObservation.ts';
import type { CommercialEvent } from './types.ts';

const receiptCommand = 'receive-observation';

/** Uses the verified storage owner selected by the API's workspace resolver. */
export async function prepareCommercialCommand(input: unknown, ownerId: string) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { status: 'invalid_command' } as const;
  }
  const body = input as Record<string, unknown>;
  if (Object.keys(body).sort().join(',') !== 'command,observation,version'
    || body.version !== 1 || body.command !== receiptCommand) {
    return { status: 'invalid_command' } as const;
  }
  if (new TextEncoder().encode(JSON.stringify(body)).byteLength > 128_000) {
    return { status: 'payload_too_large' } as const;
  }

  try {
    const event = await prepareExternalObservationReceipt({ userId: ownerId, sampleDataActive: false }, body.observation);
    // Receipt intake records provenance only. The command's effect identity is
    // the Kernel event idempotency key. Accepting evidence requires a separate
    // user-confirmed Kernel action and is outside this command.
    return { status: 'prepared', command: receiptCommand, effectId: event.id, event } as const;
  } catch {
    return { status: 'invalid_observation' } as const;
  }
}

type PreparedReceipt = Extract<Awaited<ReturnType<typeof prepareCommercialCommand>>, { status: 'prepared' }>;

/** Classify the existing canonical event before acknowledging an effect. */
export function evaluateCommercialReceipt(prepared: PreparedReceipt, stored: CommercialEvent | null | undefined) {
  if (!stored || stored.id !== prepared.effectId || stored.userId !== prepared.event.userId
    || stored.isSample || !isExternalObservationReceipt(stored)) {
    return { status: 'invalid_stored_receipt' } as const;
  }
  const observation = normalizeExternalObservation(stored.structuredPayload);
  if (JSON.stringify(observation) !== JSON.stringify(prepared.event.structuredPayload)) {
    return { status: 'source_version_conflict' } as const;
  }

  return { status: 'acknowledged', receipt: {
    id: stored.id,
    receivedAt: stored.recordedAt,
    observation,
    acceptedCommercialTruth: false,
  } } as const;
}
