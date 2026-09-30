# Connector boundary, version 1

Connectors provide unaccepted observations. Commercial commands alone own business interpretation. The transport-independent adapter contract accepts bounded exports from CRM, email, calendar, ERP and finance sources. No vendor SDK, token, polling cursor, webhook authentication or inferred commercial status enters a Kernel record. Vendor-specific authentication, rate limits and field mapping belong upstream of this interface.

`previewConnectorExport` is pure and validates an entire export before returning a preview. It rejects unknown fields (including credentials, ownership and command fields), unknown formats, invalid dates, duplicate source versions, more than 50 records and input over 128,000 UTF-8 bytes. It does not fetch URLs or execute source content. React renders original text as text.

Example adapter output:

```json
{
  "format": "memoire.connector-export",
  "version": 1,
  "kind": "finance",
  "namespace": "source-tenant-reference",
  "records": [{
    "id": "payment-record-42",
    "version": "source-revision-3",
    "reportedAt": "2026-09-01T10:00:00Z",
    "title": "Source reports a payment",
    "text": "Original bounded source statement, not accepted payment evidence."
  }]
}
```

Kinds are `crm`, `email`, `calendar`, `erp`, `finance`. All five use the same source-only profile. Finance maps to the existing ERP source category with a distinct `finance:` namespace; it does not create a Money concept. Namespace must be stable per source tenant/mailbox, never derived from a display name that can change. Source identity/version must be stable; adapters must supply a new version when source text changes, never use the import time as a version. `reportedAt` is a source-reported ISO timestamp or null, not a canonical event time. An adapter may minimize source text before preparing the export; omitted text is not recoverable from Memoire.

Capture presents the validated export for review. Explicit receipt uses M17's existing durable, idempotent path, owned by the active workspace; the file cannot choose an owner. Batch receipt is sequential, not transactional. If a receipt fails, the UI reports exact new/duplicate counts and retains successful earlier receipts. Retrying is safe. Full received observations use the existing event backup/restore and RLS contracts. Preview, credentials and connection configuration are not persisted.

This milestone delivers adapter architecture and a working file transport, not live provider integrations. There is no background polling, OAuth token store, delivery cursor or vendor availability claim. Future live transports must prove authenticated source/tenant binding and safe credential handling before invoking the same receipt path. Existing CSV parsing and human-confirmed Capture interpretation remain separate and unchanged.
