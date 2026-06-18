# Memoire Lead Operations Contract Coverage

Date: 2026-06-17

Roadmap slice: Gate A5 lead operations contract verification

## Decision

Memoire now has automated static and local runtime verifiers for the Request Access and early-access lead workflow contract.

This does not close A5. It proves the public lead form, server endpoint, private lead storage, operator workflow migration, query pack, runbook, and request payload builders still contain the expected operational guardrails. A5 remains open until one production or protected-preview lead is processed through the workflow.

## Covered Contracts

| Surface | Contract | Current Static Status |
| --- | --- | --- |
| Request Access page | Shows confidentiality guidance, consent, privacy link, 2-business-day expectation, honeypot field, and submission event tracking. | Covered by verifier |
| `/api/request-access` lead path | Allows only POST, validates required fields and consent, rate limits by work email, accepts honeypot spam quietly, and inserts with service role. | Covered by verifier |
| `/api/request-access` event path | Accepts only allowlisted privacy-minimized funnel events, rate limits by anonymous ID, and returns `202` quietly on analytics failure. | Covered by verifier |
| `early_access_requests` base migration | Stores contact details privately, enables RLS, revokes anon/authenticated access, and grants service-role access only. | Covered by verifier |
| Lead workflow migration | Adds owner, due date, contacted, decision, note, status timestamp, operator queue, daily status view, overdue follow-up count, and service-role-only views. | Covered by verifier |
| Operator query pack | Includes queue, claim, contacted, approve, decline/archive, and 90-day retention review queries. | Covered by verifier |
| Lead operations runbook | Defines statuses, SLA, privacy rules, evidence requirements, and remaining production gap. | Covered by verifier |

## Automated Guard

Added:

- `scripts/verify-lead-operations-contract.mjs`
- `scripts/verify-lead-operations-runtime-contract.mjs`
- `npm run verify:lead-ops`
- `npm run verify:lead-ops-runtime`

Included in:

- `npm run check`

The static verifier checks that code, migrations, SQL query pack, runbook, release gate, and cohort release packet stay aligned around A5.

The runtime verifier checks Request Access payload behavior:

- Lead fields are trimmed, normalized, capped, and mapped to private storage columns.
- Honeypot submissions are classified for quiet success without storage.
- Raw consent and honeypot website values are not included in the insert payload.
- Product funnel events are allowlisted, privacy-minimized, route-cleaned, and data-mode checked.

## Runtime Evidence Still Required

Before inviting the first cohort, capture:

| Evidence | Pass Rule |
| --- | --- |
| Request submission | One production or protected-preview Request Access submission creates a row in `early_access_requests`. |
| Queue retrieval | `operator_early_access_queue` returns the submitted row. |
| Claim workflow | Operator sets `operator_owner` and `follow_up_due_at`. |
| Contact workflow | Operator records `contacted_at` after first reply. |
| Decision workflow | Status moves to `approved`, `declined`, or `archived` with `decided_at`. |
| Retention acknowledgement | Operator confirms the 90-day retention review path for declined or archived leads. |
| Privacy proof | No customer sales content, secrets, or credentials are stored in `operator_note`. |

## Gate Impact

A5 improves from "operator workflow schema and runbook added" to "lead operations contract plus runtime payload behavior verified automatically."

A5 remains open because the migration must be applied and one real lead must be processed through the operator workflow before cohort invite.
