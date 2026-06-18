# Activation Workflow Contract Coverage

Date: 2026-06-17

Roadmap slice: A10 signed-in activation readiness

## Decision

Memoire now has an automated static verifier for the core activation workflow plus a local runtime verifier for the cloud JSON merge behavior behind Review Pack return usage:

Import or add pipeline -> create Pipeline Defense Brief -> save Review Pack -> return later and find the Review Pack.

This improves the A10 gate, but it does not prove the workflow with a real signed-in user. A10 remains open until protected-preview or production QA confirms the full create/import, brief, Review Pack save, reload, logout/login, and return path.

## What The Verifier Covers

`scripts/verify-activation-workflow-contract.mjs` checks that:

- Dashboard still routes empty and returning users toward Import CSV, Add Opportunity, Demo, Pipeline Defense, latest Review Pack, and the trial activation checklist.
- Opportunities still supports one-shot `/app/opportunities?import=csv` and `/app/opportunities?new=1` entry points, clears query params, marks activation checklist progress, and tracks `pipeline_defense_brief_created`.
- Trial activation checklist still follows the key first-run steps: load demo/import CSV, review opportunity, capture update, import starter asset pack, generate defense brief, and copy manager summary.
- Review Pack storage still loads signed-in workspace packs through cloud-aware merge with local fallback, keeps demo mode local, saves packs, deletes through tombstones when sync is enabled, and preserves manager-summary content.
- Pipeline Defense still loads Review Packs through the workspace-aware loader, saves Review Packs with signed-in cloud sync when appropriate, keeps demo packs local/sample-marked, tracks `review_pack_saved`, and links to the direct Review Pack route.
- Direct Review Pack route still checks browser and workspace sync before showing not-found, supports copying the manager summary and Markdown, and returns to Pipeline Defense after deletion.
- First-run and core-workflow docs still record the intended path and the remaining signed-in QA limit.

`scripts/verify-cloud-json-runtime-contract.mjs` checks that:

- Cloud and local records merge by newest timestamp.
- Demo and sample records are excluded from cloud merge.
- Tombstones remove stale records without removing newer records.
- Local owner markers prevent one user's browser data from being claimed by a different account.

## Runtime Evidence Still Required

Signed-in activation QA is still required.

A10 remains open until signed-in activation QA records:

- New or clean test account.
- Import CSV path or manual opportunity creation path.
- Pipeline Defense Brief creation.
- Review Pack save.
- Browser reload confirms the saved Review Pack still appears.
- Logout/login or second browser profile confirms the signed-in Review Pack return path.
- Direct Review Pack URL opens the saved pack.
- Demo-created Review Packs do not appear in the signed-in workspace.

## Operator Command

Run before cohort signoff and after activation workflow changes:

```bash
npm run verify:activation-workflow
npm run verify:cloud-json-runtime
```

`npm run check` also runs this verifier so activation workflow drift is caught with the rest of the commercial release gates.
