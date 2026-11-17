# Workspace isolation tests

## Verified in this branch

A login may own the original book plus separate named books. The Data API binds requests to the login and checks that the selected data owner belongs to it. The local tests use synthetic identities and records.

| Boundary | Regression and result |
| --- | --- |
| Browser cache and stale responses | `test/unit/workspaceOwnerRace.test.mjs` covers a delayed quotation load, failure fallback, switch away and back, stale currency hydration, same-owner continuity, cache invalidation, relational account response and settings single-flight. The pre-change quotation response demonstrably replaced the new account's collection. |
| Persistent owner and sample boundary | `localWorkspaceOwner.test.mjs` checks account claim, currency removal, adoptable guest data and retained auth. Kernel owner tests cover event selection, exact owner fallback and prevention of republishing another owner’s records. |
| Relational link authority | `nativeWorkspaceDataScope.test.mjs` checks rejected links between distinct data owners, copied contact dependency and new same-owner opportunity links against migrated tables. |
| Shared commitment authority | `commercialWorkspaceDatabase.test.mjs` tests the real migrated SQL role procedures. Invitation, acceptance, scope projection, reader/reviewer capabilities, revocation and restore epoch are checked. This is a publication scope over selected commitments. |
| Reports, dashboards, AI, automation and export | Existing storage, database, AI, automation and export tests check owner direct access and scoped API contracts. A second SQL test creates two named books under one login and reads their automation snapshots through the real pre-request function in A → B → A order. It checks accounts, opportunities, quotes, activities, receivables, reports and reporting currency. Coverage includes stale browser report/dashboard loads and two-owner automation/SQL claims. |
| Local browser | The local workspace preview rendered without relevant console warnings/errors. Contacts automatically selected Accounts. Create required explicit confirmation and asked again after the destination changed. The new book displayed copied contacts and zero pipeline, quote, order and sales totals. Switching back displayed the untouched sample source. |

Run focused tests from the worktree with Node 22 or newer.

```powershell
node --test test/unit/workspaceOwnerRace.test.mjs test/unit/nativeWorkspaceDataScope.test.mjs test/unit/personalWorkspaceDatabase.test.mjs test/unit/localWorkspaceOwner.test.mjs test/unit/kernelOwnerIsolation.test.mjs test/unit/commercialWorkspaceDatabase.test.mjs test/unit/reportStorage.test.mjs test/unit/dashboardStorage.test.mjs
npm run check
```

## Extended workspace acceptance

The migration fixture checks two books under the same login with the same quote and report references. A separate fixture checks a foreign login. The following scenarios need broader authenticated browser or hosted coverage.

| Scenario | Required assertion |
| --- | --- |
| Existing owner upgrade | All original counts, IDs, relationships, history, preferences, API outputs and restore semantics carry into the original personal workspace. |
| Switch A → B → A | Every route remains reachable. The new scope gets only its rows, aggregates, search results and AI context, including first paint, deep links, tab concurrency, offline fallback and delayed writes. Returning to A preserves A’s unsynced drafts. |
| Forged access | Direct table reads and mutations, RPCs, mismatched role and scope, guessed record IDs, service handlers, background jobs and connector inputs fail closed. Test omitted, unknown, foreign and stale scope. |
| Cross-workspace link | Server rejects links to an account, opportunity, quote, order or attachment from another workspace, including JSON payload references. |
| Export, restore and automation | Exports carry and validate the active scope. A restore cannot accidentally target a different book. Worker claims, retries and outputs use only the tested workspace. |
| Selective copy | Preview shows exact rows and required dependencies. Require explicit confirmation and bind it to an unchanged preview. Confirm source stability, new identities, rewritten references, collision handling, a durable audit receipt, and idempotence under retries and concurrent confirmations. |

The database fixtures exercise scope and the browser preview exercises the copy interaction with samples. Authenticated cross-device restore, stale tab transitions and receiver-specific authorization require separate evidence.
