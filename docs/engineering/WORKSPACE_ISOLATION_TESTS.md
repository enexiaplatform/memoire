# Workspace isolation tests

## Verified in this branch

The current system has one underlying commercial book per authenticated owner. The local tests use synthetic identities and records.

| Boundary | Regression and result |
| --- | --- |
| Browser cache and stale responses | `test/unit/workspaceOwnerRace.test.mjs` covers a delayed quotation load, failure fallback, switch away and back, stale currency hydration, same-owner continuity, cache invalidation, relational account response and settings single-flight. The pre-change quotation response demonstrably replaced the new account's collection. |
| Persistent owner and sample boundary | `localWorkspaceOwner.test.mjs` checks account claim, currency removal, adoptable guest data and retained auth. Kernel owner tests cover event selection, exact owner fallback and prevention of republishing another owner’s records. |
| Relational link authority | `opportunityAccountOwnerDatabase.test.mjs` applies migrations over populated fictional rows. It checks foreign-account link rejection for an authenticated actor and a privileged database writer, own links, unchanged legacy linkage, an optional empty link and account deletion. |
| Shared commitment authority | `commercialWorkspaceDatabase.test.mjs` tests the real migrated SQL role procedures. Invitation, acceptance, scope projection, reader/reviewer capabilities, revocation and restore epoch are checked. This is a publication scope over selected commitments. |
| Reports, dashboards, AI, automation and export | Existing storage, database, AI, automation and export tests continue to check their single-owner direct access and contract boundaries. Coverage includes stale browser report/dashboard loads and two-owner automation/SQL claims. |
| Local browser | Review rendered without relevant console warnings/errors. Adding a fictional member to the disclosure preview updated the count. Save stayed disabled without the required selection and confirmation. Refresh stayed disabled in local demo mode. The separate signed-out protected-route probe redirected to Sign in. |

Run focused tests from the worktree with Node 22 or newer.

```powershell
node --test test/unit/workspaceOwnerRace.test.mjs test/unit/opportunityAccountOwnerDatabase.test.mjs test/unit/localWorkspaceOwner.test.mjs test/unit/kernelOwnerIsolation.test.mjs test/unit/commercialWorkspaceDatabase.test.mjs test/unit/reportStorage.test.mjs test/unit/dashboardStorage.test.mjs
npm run check
```

## Required same-account acceptance

Status **open**. A fixture must create two workspace identities under one authenticated actor, plus a second actor who belongs to neither. Populate both books with independently named accounts, stakeholders, events, opportunities, quotes, catalog entries, orders and receipts. Use deliberately similar labels and references to catch wrong-scope ID and name matching. Exercise the app and the actual migrated database with normal entry points.

| Scenario | Required assertion |
| --- | --- |
| Existing owner upgrade | All original counts, IDs, relationships, history, preferences, API outputs and restore semantics carry into the original personal workspace. |
| Switch A → B → A | Every route remains reachable. The new scope gets only its rows, aggregates, search results and AI context, including first paint, deep links, tab concurrency, offline fallback and delayed writes. Returning to A preserves A’s unsynced drafts. |
| Forged access | Direct table reads and mutations, RPCs, mismatched role and scope, guessed record IDs, service handlers, background jobs and connector inputs fail closed. Test omitted, unknown, foreign and stale scope. |
| Cross-workspace link | Server rejects links to an account, opportunity, quote, order or attachment from another workspace, including JSON payload references. |
| Export, restore and automation | Exports carry and validate the active scope. A restore cannot accidentally target a different book. Worker claims, retries and outputs use only the tested workspace. |
| Selective copy | Preview shows exact rows and required dependencies. Require explicit confirmation and bind it to an unchanged preview. Confirm source stability, new identities, rewritten references, collision handling, a durable audit receipt, and idempotence under retries and concurrent confirmations. |

Rehearse populated upgrades, including a legacy backup, in isolated PostgreSQL before enabling same-account creation and switching. Current browser owner keys and worker owner-only queries cannot prove these invariants.
