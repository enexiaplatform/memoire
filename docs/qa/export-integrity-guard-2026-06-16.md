# Memoire Export Integrity Guard

Date: 2026-06-16

Roadmap link: Session 4 - Two-Account Auth, RLS, And Data Isolation QA

## Purpose

Export is part of Memoire's trust posture. A signed-in user must not receive another user's rows in a workspace export, and QA needs a clear manifest to compare expected row counts.

This pass adds a defense-in-depth guard to the signed-in export endpoint.

## What Changed

### Server Export Guard

`api/export.ts` now checks every returned cloud row before responding.

For each exported table, the endpoint verifies:

- The row is an object.
- The configured owner column matches the authenticated `userId`.

If any row fails, the endpoint logs a structured server error and returns:

```json
{
  "error": "Export failed integrity checks. Please contact support before using this export."
}
```

The export response also includes a `manifest` with:

- `complete`
- `table_count`
- `row_count`
- per-table owner column
- per-table row count
- per-table warning, when present

### UI Behavior

`src/features/settings/ExportTab.tsx` now stops the signed-in export when `/api/export` returns an error.

Before this pass, a failed cloud export could still create a browser-only ZIP with a warning. That was acceptable for ordinary cloud unavailability, but not strong enough for an integrity guard because it could make QA miss a serious export failure.

## QA Evidence To Capture

During two-account QA:

1. Export User A.
2. Open `memoire-workspace-export.json`.
3. Confirm `cloudData.user_id` equals User A.
4. Confirm `cloudData.manifest.complete` is `true`.
5. Confirm `cloudData.manifest.tables` includes every expected table.
6. Search the exported JSON for every User B unique label.
7. Repeat in reverse for User B.

Expected result:

- No cross-user labels.
- No owner mismatch.
- Manifest row counts match service-role verification queries.

## Remaining Gap

This guard cannot prove live production RLS by itself. It only prevents Memoire from returning an export if an unexpected row reaches the endpoint.

A3 still requires two real test users, production or protected preview auth, and service-role row-count evidence.
