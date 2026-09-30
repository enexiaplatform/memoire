# M22 — Developer SDK

Starting green SHA: `e63e2b636078171351c781855db1187801239b1c`.

The architecture audit identified M19's authenticated, versioned API as the stable boundary. M22 adds an independent TypeScript/ESM package around its three operations: commitment pages, explained commitment recommendations and immutable external observation receipts. No raw internal persistence types or alternative policy engine are exposed. Public types retain the page-only recommendation basis and acceptedCommercialTruth=false receipt contract.

The client obtains credentials per call, restricts origins, refuses redirects, omits cookies and caches, propagates cancellation and reports sanitized errors, quota delays and uncertain acknowledgements. It does not retry or authorize consequential changes. Same-envelope retries preserve the existing server identity contract. No new canonical state, migration, RLS policy, backup field or product navigation is needed; received Events continue through the existing durable server path.

Validation covers the real migration chain and owner RLS through the API, paginated reads, existing policy recommendations, immutable receipt retries/conflicts, invalid configuration, missing credentials, quota responses, token refresh, response-version rejection and uncertain transport outcomes. Browser verification uses the compiled SDK over HTTP against that migrated database. Package declarations are built as part of the full repository gate.

Full repository verification passed: application build, SDK declarations/build, API type checking, lint, all 1,964 unit/database tests and every contract check. Compiled SDK browser verification also passed. **GO for M23**. Production remains **PRODUCTION DEPLOYMENT PENDING**. The package is private/unpublished, supports ESM and modern fetch hosts, and has no automatic pagination or live subscriptions. Cross-origin deployment CORS and real production authentication remain deployment concerns. The bounded public API does not expose M21 member RPCs or high-consequence writes. See `packages/memoire-sdk/README.md` for use and failure semantics.
