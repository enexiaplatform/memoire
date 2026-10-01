# Memoire Commercial SDK

An independent, dependency-free TypeScript/ESM client for Commercial API v1. Build from the repository with `npm run build:sdk`. This private package is not published. Its compiled entry and declarations are under `dist/`; it has no imports from Memoire's internal stores, database schema or policy implementation.

```ts
import {createMemoireClient, MemoireError} from '@memoire/commercial-sdk';

const memoire = createMemoireClient({
  origin: 'https://your-trusted-memoire-deployment.example',
  getAccessToken: async () => getCurrentUserAccessToken(),
});
const first = await memoire.listCommitments({limit: 50});
// A page is current cloud state, not a historical snapshot.
if (first.nextCursor) {
  const next = await memoire.listCommitments({after: first.nextCursor, limit: 50});
  console.log(next.items);
}
const recommendations = await memoire.listCommitmentRecommendations();
// Recommendations cover only commitments in this page, not the whole Today portfolio.
console.log(recommendations.basis);

try {
  const result = await memoire.receiveObservation({
    schemaVersion: 1, sourceKind: 'crm', sourceNamespace: 'my-tenant',
    sourceEventId: 'record-42', sourceVersion: '1', observedAt: null,
    summary: 'Reported signature', rawText: 'Unaccepted original source claim',
  });
  console.log(result.receipt.acceptedCommercialTruth); // always false
} catch (error) {
  if (error instanceof MemoireError) {
    // outcomeUnknown means the server may have received the observation.
    // If retrySafe, retry the exact same envelope after resolving the cause.
    // Reusing its source identity with changed content produces a 409 conflict.
    console.log(error.code, error.status, error.retryAfterSeconds, error.outcomeUnknown);
  }
}
```

The application supplies and refreshes its own user token. The SDK requests it per call, stores no credentials, omits cookies, refuses redirects and sends no credentials in URLs. Use only a trusted deployment origin. HTTP is refused except explicit `allowLocalHttp: true` for loopback development. Cross-origin browser callers still require deployment CORS configuration; the SDK does not bypass it. `fetch` may be injected for supported hosts and testing; the caller owns that transport's security.

Each operation accepts an `AbortSignal` (`{signal}`; page calls also take `limit`/`after`). There are no implicit retries, background subscriptions or automatic pagination. A transport failure or aborted write has an uncertain outcome; cancellation does not roll back a received observation. `retrySafe` concerns identity safety, not a guarantee that retry will succeed. API errors are sanitized and expose status and numeric Retry-After when present.

Authenticated owner scope, RLS, validation and immutable source-version identity remain server authority. A receipt is an Event, not Evidence or a State Revision. The SDK cannot accept claims, complete promises, create Decisions, grant membership, transfer ownership or run arbitrary database operations. Server authorization must never be replaced by client checks. New public commands require a separately versioned authority review.

No persistence, migration, backup schema or primary navigation is introduced. Production availability remains pending P1. Local verification uses the built module in Chromium and the real migrated database behind a fixture-authenticated HTTP server; it does not prove production authentication or deployment.

M28 [Commercial Protocol v1](../../docs/protocol/commercial-v1.md) can travel as an ordinary observation envelope through `receiveObservation`. Verify/normalize the public message against that protocol and independently agreed recipient/key policy before interpreting it. The SDK transports the envelope and returns an unaccepted receipt; it does not certify protocol content or promote it to commercial truth. The protocol's conformance example and wire/signature rules are public, and no application store is imported into this package.
