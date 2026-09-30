# M19 — governed Commercial API v1

Starting green SHA: `76eb09b650da2aa2de8280b2fb20c270e5504b6e`.

The API audit found verified Supabase user authentication, owner RLS, existing event/commitment codecs and the deterministic recommendation engine. M19 exposes a narrow versioned interface using those systems. Authenticated commitment reads return stable DTOs and bounded cursor pages. Commitment recommendations reuse existing rules, disclose their page scope and never write. The only public write command is unaccepted observation receipt, sharing validation, identity and event serialization with local Capture. Consequential commercial commands remain in existing human-confirmed app flows; authentication is not blanket authority to create truth.

Every query uses the verified caller's JWT plus explicit owner filters. Request fields cannot select another owner, raw table, sample scope or arbitrary command. Unknown schema versions and command fields fail closed. An insert-ignore/read-back flow preserves first receipt time under retries, compares actual stored content and returns conflict for changed source meaning. API failures do not expose database internals. Responses are uncached; address and authenticated-owner quotas reuse the existing rate limiter.

No new canonical entity, table, migration, backup format or navigation is introduced. Existing receipt/commitment RLS, revisions and export/restore apply. The browser-side receipt command and HTTP command share pure receipt preparation rather than maintaining two interpretation engines. The public contract and its limitations are in `docs/architecture/commercial-api-v1.md`.

Six API tests exercise the real full migrated database through a PostgREST-shaped test transport: authorization, two-owner RLS, pagination, read-only recommendations, idempotent receipt, changed-version conflict, payload validation and failures. Browser HTTP verification passed authorization, receipt, retry, ownership override rejection and uncached reads with fixture authentication. Existing local receipt durability tests passed. Full `npm run check` passed with **1,938 tests**, build, API typecheck, lint and all repository contracts.

**GO for M20** from this report's commit. Production remains **PRODUCTION DEPLOYMENT PENDING**. Current cloud reads exclude unsynchronized browser edits. Recommendation pages are commitment-only, not the entire Today portfolio. Rate limits remain process-local. Live authentication/deployment and additional consequential command authority are not claimed by this local verification.
