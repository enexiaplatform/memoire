# Cloud JSON Runtime Contract Coverage

Date: 2026-06-17

Roadmap slice: A10 signed-in activation return path, R2 local cache ownership, and R9 demo-to-account contamination risk.

## What This Verifies

`scripts/verify-cloud-json-runtime-contract.mjs` transpiles `src/services/cloudJsonCollectionStore.ts` locally and executes the pure merge and local ownership helpers used by Review Packs, Sales Assets, and Action Outcomes.

The verifier confirms:

- User records merge from cloud and local sources.
- Newer local records win over older cloud records.
- Newer cloud records win over older local records.
- Demo records are filtered from cloud merge.
- Sample records are filtered from cloud merge.
- Newer tombstones remove stale records.
- Older tombstones do not remove newer records.
- `createdAt` is used when `updatedAt` is missing.
- Local collection owner markers are written per table.
- Same-owner local collections can be claimed.
- Different-owner local collections are not claimed, preventing stale browser data from joining another account workspace.

## Relationship To Existing A10 Evidence

This complements `scripts/verify-activation-workflow-contract.mjs`.

- `npm run verify:activation-workflow` confirms the activation UI path, Review Pack save/return surfaces, trial checklist, docs, and direct route stay wired.
- `npm run verify:cloud-json-runtime` confirms the cloud-aware merge and local ownership behavior that makes saved Review Packs safe to return to.
- The production operator must still run signed-in activation QA on production or protected preview.

## Gate Impact

A10 improves from static activation wiring coverage to static wiring coverage plus local runtime cloud-merge proof.

R2 improves because stale browser cache ownership is checked at local runtime.

R9 improves because demo/sample records are proven to be excluded from cloud merge behavior.

A10 remains open until signed-in create/import -> brief -> save Review Pack -> reload -> logout/login -> direct pack route QA passes on production or protected preview.

## Operator Command

Run before signed-in activation QA and after changes to `src/services/cloudJsonCollectionStore.ts`:

```bash
npm run verify:cloud-json-runtime
```

`npm run check` also runs this verifier.
