# Commercial API v1

`/api/commercial` exposes an intentionally narrow versioned surface over existing Kernel concepts. Responses carry `version: 1` and `Cache-Control: no-store`. Authenticate with `Authorization: Bearer <Supabase user access token>`. The server verifies the token and uses the same token for database requests, retaining RLS. The body cannot select a user, workspace, role, sample mode or arbitrary table. There is no service-role bypass, cookie authentication or unauthenticated read.

## Reads

`GET /api/commercial?resource=commitments&limit=50&after=<record-id>` returns `items` and nullable `nextCursor`. Limit is 1–100, default 50. IDs order each page. These are current cloud records; unsynchronized browser edits are not included. Pages are not a historical snapshot. Public commitment fields are `id`, `accountId`, `opportunityId`, `party`, `responsiblePerson`, `promise`, `dueDate`, `status`, `updatedAt`. Raw persistence names and private source metadata are not part of this DTO.

`resource=commitment-recommendations` runs the existing deterministic Commercial Policy engine over the same commitment page, retaining explanation, source identities and thresholds. The response explicitly says `basis: commitments-in-this-page`; follow every cursor for all commitments. This is not the complete Today portfolio (which also considers threads, Opportunity, Evidence, money, timing and incidents). Reads make no Decisions, tasks, Revisions or writes.

## Commands

`POST /api/commercial` accepts only:

```json
{"version":1,"command":"receive-observation","observation":{"schemaVersion":1,"sourceKind":"crm","sourceNamespace":"tenant-reference","sourceEventId":"source-42","sourceVersion":"3","observedAt":null,"summary":"Source claim","rawText":"Unaccepted original statement"}}
```

The command shares the local receipt preparation/validation, event codec, owner RLS and immutable receipt table contract. Idempotency is the required tuple of authenticated owner, source kind, source namespace, source record and source version. Same-content retries return the original receipt (`200`, `duplicate: true`); a new receipt returns `201`. Reusing a tuple for changed content returns `409 source_version_conflict`. Insert-ignore followed by a scoped read handles concurrent identical retries without overwriting the original receipt time. A `503 receipt_not_confirmed` may follow a successful write whose acknowledgement was lost: retry the same envelope safely.

This is an ingestion command, not authority to accept source claims. The result carries `acceptedCommercialTruth: false`. Consequential commands such as changing a promise, accepting Evidence or recording a Decision remain in existing human-confirmed application flows. They are not exposed through v1 simply because a caller can authenticate. M21/M23 own later shared and agent authority boundaries.

## Failure and deployment semantics

`400` invalid command/query/observation; `401` unverified identity; `405` unsupported method; `409` source version conflict; `413` oversized payload; `429` rate limit with `Retry-After`; `503` unavailable authentication/storage or invalid stored scope. Database details and credentials are never returned. The existing rate limiter limits each authenticated owner and caller address; it is process-local and not a distributed quota guarantee. Production transport protections remain the deployment's responsibility.

No new canonical table, migration or backup format is introduced. Received events retain export/restore and sample isolation. The API does not accept sample writes. Local verification exercises real migrated PostgreSQL RLS through a PostgREST-shaped test transport and browser HTTP requests with fixture authentication; it does not claim live Supabase authentication or production deployment has been verified. P1 remains pending.
