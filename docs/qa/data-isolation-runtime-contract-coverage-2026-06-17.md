# Data Isolation Runtime Contract Coverage

Date: 2026-06-17

Roadmap slice: A3 account isolation, A4 demo-to-account contamination guard, and R2 cross-account export risk.

## What This Verifies

`scripts/verify-data-isolation-runtime-contract.mjs` transpiles `api/export.ts` locally and executes the pure export isolation helpers.

The verifier confirms:

- The export table contract includes every expected account-owned table.
- `user_profiles` uses `id` as the owner column.
- All other exported account tables use `user_id` as the owner column.
- Rows owned by the requested user pass the contamination guard.
- Rows owned by another user produce an `owner_mismatch` finding.
- `user_profiles` rows with a different `id` produce an `owner_mismatch` finding.
- Non-object rows produce `row_not_object` findings.
- Tables with query warnings are not trusted as complete row sets and are skipped by the contamination scan.
- Mixed clean and contaminated result sets report only the contaminated rows.

## Relationship To Existing A3/A4 Evidence

This complements `scripts/verify-data-isolation-contract.mjs`.

- `npm run verify:data-isolation` confirms export, deletion, demo cleanup, cloud JSON, RLS migration, QA docs, release gate, and cohort packet references stay aligned.
- `npm run verify:data-isolation-runtime` confirms the export contamination guard behaves correctly against owned, mismatched, malformed, warning, and mixed row sets.
- The production operator must still run the two-account QA matrix on production or protected preview.
- The production operator must still inspect real export contents, deletion behavior, service-role row counts, local cache ownership, and demo-to-account browser behavior.

## Gate Impact

A3 improves from static export owner-column coverage to static coverage plus local runtime contamination proof.

A4 improves indirectly because export contamination would catch demo/sample or stale local records if they reached the signed-in cloud export response with the wrong owner shape.

R2 improves because future changes that remove an export table, change an owner column, or weaken contamination detection will fail `npm run check`.

A3 and A4 remain open until operational two-account QA, direct RLS negative tests, export inspection, deletion cascade proof, and demo-to-account browser evidence are captured.

## Operator Command

Run before two-account QA and after changing `api/export.ts`:

```bash
npm run verify:data-isolation-runtime
```

`npm run check` also runs this verifier.
