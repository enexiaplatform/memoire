# M18 — source connector adapters

Starting green SHA: `8313c50372602c0390e5c5341f439514bc29a384`.

The architecture audit found M17's versioned observations and existing CSV/Capture interpretation. M18 keeps the former as the only receipt path and leaves existing CSV parsing intact. A pure adapter boundary validates transport-independent CRM, email, calendar, ERP and finance exports. Vendor credentials and commercial interpretation stay outside that boundary. Finance retains a distinct source namespace while reusing the existing ERP source category.

Only received M17 events persist. Export preview is transient, no connection configuration is stored, and there is no new canonical entity, migration or backup version. Existing receipt RLS, immutable identity, backup/restore and owner/sample isolation remain applicable. An export cannot select the receiving owner or submit commercial commands.

Capture's existing source intake gains a folded file review. It validates the complete bounded batch, previews source statements and requires an explicit receipt action. Partial storage failures report exact completed/duplicate counts, keep saved receipts and permit safe retry. No commercial claim becomes accepted through this flow. The version 1 contract and example are documented in `docs/architecture/connector-adapters.md`.

Four adapter tests cover all source profiles, field allowlists, identity/version preservation and bounds. The receipt domain/database/durability matrix passed. Browser verification passed preview without writes, explicit receipt, retry, partial-failure reporting, invalid-file rejection, unchanged commercial state, reload and narrow layout. Full `npm run check` passed with 1,932 tests, build, API typecheck, lint and all repository contracts.

**GO for M19** from this report's commit. Production remains **PRODUCTION DEPLOYMENT PENDING**. This phase provides adapter architecture and a working file transport; provider-specific OAuth, polling, live webhooks and vendor SDK implementations are not claimed. Future transports must bind source identity to their authenticated tenant and reuse the same governed receipt boundary.
