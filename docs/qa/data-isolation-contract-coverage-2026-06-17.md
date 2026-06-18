# Memoire Data Isolation Contract Coverage

Date: 2026-06-17

Roadmap slice: Gate A3 / A4 data isolation contract verification

## Decision

Memoire now has automated static and local runtime verifiers for the account-isolation, export-integrity, account-deletion, and demo-to-account guardrails that protect the first cohort.

This does not close A3 or A4. It proves that the code and schema contracts still contain the expected isolation guardrails, and that the export contamination helper behaves correctly against representative row sets. A3 and A4 remain open until two-account operational QA passes on production or protected preview.

## Covered Contracts

| Surface | Contract | Current Static Status |
| --- | --- | --- |
| `/api/export` | Auth token must belong to requested `userId`; every table is filtered by owner column; contamination guard blocks mismatched rows before response. | Covered by verifier |
| `/api/export` | Export response includes manifest, owner columns, table count, row count, warnings, and the expanded cloud table set. | Covered by verifier |
| Settings export UI | Signed-in cloud export errors stop the export instead of silently producing browser-only output. | Covered by verifier |
| `/api/delete-account` | User token is checked before service-role deletion; mismatched user IDs return `403`. | Covered by verifier |
| Auth provider | Password login, signup, and OAuth completion call demo cleanup before entering account workspace. | Covered by verifier |
| Demo mode cleanup | Demo workspace mode and sample dataset flags are cleared without blocking successful account auth. | Covered by verifier |
| Cloud JSON store | Demo/sample records are filtered from cloud sync; tombstones prevent deleted records from resurrecting; local owner markers are stored by user. | Covered by verifier |
| Review Pack store | Demo/sample Review Packs are marked, filtered before user cloud merge, and deletion uses cloud tombstones for signed-in users. | Covered by verifier |
| Cloud JSON migration | Review Packs, Sales Assets, and Action Outcomes are keyed by `(user_id, id)`, use RLS, enforce `WITH CHECK`, and revoke anon access. | Covered by verifier |

## Automated Guard

Added:

- `scripts/verify-data-isolation-contract.mjs`
- `scripts/verify-data-isolation-runtime-contract.mjs`
- `npm run verify:data-isolation`
- `npm run verify:data-isolation-runtime`

Included in:

- `npm run check`

The static verifier checks that code, migrations, QA docs, release gate, and cohort release packet stay aligned around A3/A4 trust boundaries.

The runtime verifier checks that the export table contract and contamination guard behave correctly for owned rows, owner mismatches, malformed rows, warning rows, `user_profiles.id`, and mixed result sets.

## Runtime Evidence Still Required

Before inviting the first cohort, capture:

| Evidence | Pass Rule |
| --- | --- |
| Two-account QA | QA-01 through QA-18 pass in `docs/qa/two-account-data-isolation-qa-2026-06-16.md`. |
| Direct RLS negative tests | User B token cannot select, update, or insert User A rows. |
| Export User A/User B | Each export manifest is complete and contains no other user's labels. |
| Demo-to-account QA | Demo/sample records disappear after signup/login and do not appear in signed-in cloud data. |
| Account deletion QA | Deleting User A removes User A rows and leaves User B rows unchanged. |
| Service-role row counts | Row counts match expected owners before and after deletion. |

## Gate Impact

A3 improves from "static audit/protocol plus export integrity guard" to "static data-isolation contract plus local runtime export contamination proof verified automatically."

A4 improves from "demo contamination guard exists" to "demo cleanup and demo/sample cloud-sync filters verified automatically."

A3 remains open because live RLS, two-account UI behavior, export contents, deletion cascade, and service-role row counts still need operational evidence.

A4 remains open because demo-to-account and demo-reset flows still need browser QA on the deployment environment.
