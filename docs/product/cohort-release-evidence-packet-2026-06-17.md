# Memoire Controlled Cohort Release Evidence Packet

Date: 2026-06-17

Roadmap slice: Gate A operational evidence packet

## Decision

Current cohort invite decision: HOLD.

Memoire should not invite the first 5-10 person controlled early-access cohort until the required Gate A evidence below is attached or explicitly accepted as risk by the operator.

This packet is the single pre-invite signoff record. It links the infrastructure, data isolation, auth, monitoring, support, legal-boundary, cohort, and activation evidence that is otherwise spread across the roadmap.

2026-07-01 update: static/local cohort gate evidence was refreshed after the solo-operator positioning expansion. See `docs/qa/controlled-cohort-gate-evidence-2026-07-01.md`. All relevant local verifiers and `npm run build` passed. Later the same day, `api/health.ts` was added and `verify:health-runtime` was strengthened to invoke the real handler locally. `api/client-log.ts` was also added and `verify:production-readiness` now invokes it locally for allowlisted events, arbitrary-event rejection, sanitization, quiet rate limiting, and the deployment-log marker. The cohort decision remains HOLD because production/protected-preview, two-account, demo-isolation, auth, monitoring-owner, support-owner, and signed-in activation evidence is still missing.

## Release Scope

Allowed if this packet passes:

- Invite 5-10 known early-access users.
- Keep the product positioned as early access.
- Keep noindex active.
- Keep paid checkout inactive.
- Use manual onboarding, support, and weekly review.

Not allowed from this packet:

- Paid checkout.
- Unrestricted public selling.
- Removing noindex.
- Team selling, enterprise commitments, CRM writeback, or public SLA promises.

## Required Pre-Invite Evidence

| Gate | Evidence Required | Source Artifact | Status | Evidence Link Or Notes |
| --- | --- | --- | --- | --- |
| A1 | Production `/api/health` returns HTTP 200 with `ok: true`; required env vars are confirmed in deployment dashboard. | `api/health.ts`, `docs/deployment/production-readiness-health-check-2026-06-16.md`, `docs/deployment/production-readiness-contract-coverage-2026-06-17.md`, `docs/deployment/health-runtime-contract-coverage-2026-06-17.md`, `scripts/verify-production-readiness-contract.mjs`, `scripts/verify-health-runtime-contract.mjs` | Health endpoint exists; static readiness contract and local handler runtime contract verified; missing production `/api/health` and dashboard evidence | 2026-07-01 local refresh passed: `verify:production-readiness`, `verify:health-runtime`, `npm run build`. Later update added real `api/health.ts` handler proof. See `docs/qa/controlled-cohort-gate-evidence-2026-07-01.md`. |
| A2 | Expensive AI endpoints have distributed rate limit, Firewall, deployment protection, or equivalent access control; one deployed app-level 429 proof is captured. | `docs/deployment/production-infrastructure-controls-2026-06-16.md`, `docs/deployment/vercel-firewall-cohort-rules.json`, `docs/deployment/app-rate-limit-contract-2026-06-17.md`, `docs/deployment/ai-endpoint-rate-limit-coverage-2026-06-17.md`, `docs/deployment/rate-limit-runtime-contract-coverage-2026-06-17.md`, `scripts/verify-ai-rate-limit-coverage.mjs`, `scripts/verify-rate-limit-runtime-contract.mjs` | Static app-level route coverage and local runtime helper contract verified; missing active distributed rule evidence and deployed endpoint 429 proof | 2026-07-01 local refresh passed: `verify:ai-rate-limits`, `verify:rate-limit-runtime`. Distributed protection evidence still required. |
| A3 | Two-account QA proves no cross-account read, write, export, deletion, or cache resurrection. | `docs/qa/two-account-data-isolation-qa-2026-06-16.md`, `docs/qa/export-integrity-guard-2026-06-16.md`, `docs/qa/data-isolation-contract-coverage-2026-06-17.md`, `docs/qa/data-isolation-runtime-contract-coverage-2026-06-17.md`, `scripts/verify-data-isolation-contract.mjs`, `scripts/verify-data-isolation-runtime-contract.mjs` | Static data-isolation contract and local export contamination runtime contract verified; missing operational two-account QA | 2026-07-01 local refresh passed: `verify:data-isolation`, `verify:data-isolation-runtime`. Operational QA-01 through QA-18 still required. |
| A4 | Demo data cannot contaminate signed-in accounts after demo, signup/login, reset, reload, and export. | `docs/qa/two-account-data-isolation-qa-2026-06-16.md`, `docs/product/core-workflow-reliability-pass-2026-06-16.md`, `docs/qa/data-isolation-contract-coverage-2026-06-17.md`, `docs/qa/data-isolation-runtime-contract-coverage-2026-06-17.md`, `scripts/verify-data-isolation-contract.mjs`, `scripts/verify-data-isolation-runtime-contract.mjs` | Static demo/account contamination guards and local export contamination runtime contract verified; missing operational demo-to-account QA | 2026-07-01 local refresh passed: `verify:data-isolation`, `verify:data-isolation-runtime`. Browser demo isolation QA still required. |
| A5 | Request Access submissions are privately stored; operator queue retrieval and one lead workflow are completed. | `docs/product/early-access-lead-operations-2026-06-16.md`, `docs/product/operator-funnel-queries-2026-06-16.sql`, `docs/product/lead-operations-contract-coverage-2026-06-17.md`, `docs/product/lead-operations-runtime-contract-coverage-2026-06-17.md`, `scripts/verify-lead-operations-contract.mjs`, `scripts/verify-lead-operations-runtime-contract.mjs` | Static lead-operations contract and local runtime payload contract verified; missing production/protected-preview workflow evidence | 2026-07-01 local refresh passed: `verify:lead-ops`, `verify:lead-ops-runtime`. One deployed lead workflow still required. |
| A6 | Email verification, reset password, and Google OAuth redirects work on the production or protected preview domain. | `api/health.ts`, `docs/qa/auth-recovery-production-qa-2026-06-17.md`, `docs/qa/auth-recovery-contract-coverage-2026-06-17.md`, `docs/deployment/health-runtime-contract-coverage-2026-06-17.md`, `scripts/verify-auth-recovery-contract.mjs`, `scripts/verify-health-runtime-contract.mjs`, `/api/health` auth redirect output | Static auth recovery contract and local health redirect handler verified; missing production auth QA and Supabase redirect allowlist evidence | 2026-07-01 local refresh passed: `verify:auth-recovery`, `verify:health-runtime`. Production/protected-preview auth QA still required. |
| A7 | Monitoring is ready for health, API errors, auth failures, cloud-write failures, lead submissions, funnel metrics, and AI spend. | `api/client-log.ts`, `docs/deployment/operator-monitoring-signals-2026-06-16.md`, `docs/deployment/production-readiness-contract-coverage-2026-06-17.md`, `docs/deployment/health-runtime-contract-coverage-2026-06-17.md`, `docs/operations/weekly-operating-review-template-2026-06-17.md`, `docs/operations/commercial-operating-loop-contract-coverage-2026-06-17.md`, `scripts/verify-production-readiness-contract.mjs`, `scripts/verify-health-runtime-contract.mjs`, `scripts/verify-commercial-operating-loop-contract.mjs` | Health and client-log endpoints exist; local health and client-log runtime contracts verified; missing dashboard/log owner, AI cost, Supabase, and first weekly-review evidence | 2026-07-01 local refresh passed: `verify:production-readiness`, `verify:health-runtime`, `verify:commercial-operating-loop`. Later update added real `api/client-log.ts` handler proof. Live monitoring evidence still required. |
| A8 | Privacy, Terms, Product Boundaries, and AI disclosure match early-access product behavior; legal risk is reviewed or accepted. | `docs/product/ai-disclosure-boundary-hardening-2026-06-17.md`, `docs/product/trust-boundary-contract-coverage-2026-06-17.md`, `scripts/verify-trust-boundary-contract.mjs`, public legal routes | Static trust-boundary contract verified; missing legal review or accepted risk and deployed UX QA | 2026-07-01 local refresh passed: `verify:trust-boundary`. Legal review or accepted risk still required. |
| A9 | Cohort qualification, invite, support, feedback, tracker, stop/go process, inbox, and owner are ready. | `docs/product/cohort-validation-system-2026-06-16.md`, `docs/product/cohort-feedback-tracker-2026-06-16.csv`, `docs/product/cohort-outreach-templates-2026-06-16.md`, `docs/operations/early-access-support-incident-runbook-2026-06-17.md`, `docs/product/cohort-support-contract-coverage-2026-06-17.md`, `scripts/verify-support-cohort-contract.mjs` | Static support/cohort contract verified; missing live support inbox, named owners, and test support request evidence | 2026-07-01 local refresh passed: `verify:cohort`, `verify:support-cohort`. Support ownership and test request still required. |
| A10 | Signed-in activation path is verified: create/import pipeline, create brief, save Review Pack, reload/login, and find saved work. | `docs/product/first-run-activation-hardening-2026-06-16.md`, `docs/product/core-workflow-reliability-pass-2026-06-16.md`, `docs/product/activation-workflow-contract-coverage-2026-06-17.md`, `docs/product/cloud-json-runtime-contract-coverage-2026-06-17.md`, `scripts/verify-activation-workflow-contract.mjs`, `scripts/verify-cloud-json-runtime-contract.mjs` | Static activation workflow contract and local cloud JSON runtime contract verified; missing signed-in workflow QA on deployment domain | 2026-07-01 local refresh passed: `verify:activation-workflow`, `verify:cloud-json-runtime`. Signed-in deployment QA still required. |

## Hard Stop Rules

Do not invite the cohort if any of these are unresolved:

- Any known or suspected cross-account data exposure.
- Production `/api/health` is failing required checks.
- No effective protection exists for expensive AI endpoints.
- Export or deletion path fails for a signed-in test user.
- Demo/sample data appears in a signed-in account workspace.
- Support inbox or incident owner is not confirmed.
- Paid checkout is enabled before B1-B6 pass.

## Risk Acceptance

Only these gates can be accepted as manual risk for the first tiny cohort:

- A5 if the operator has a manual lead follow-up process and agrees to record every contact.
- A8 if the operator accepts that legal copy is product-accurate early-access copy, not final legal advice.

Risk acceptance format:

| Gate | Accepted Risk | Why Acceptable For Cohort 1 | Owner | Expiry Date | Reversal Trigger |
| --- | --- | --- | --- | --- | --- |
| TBD | TBD | TBD | TBD | TBD | TBD |

Do not risk-accept A1, A2, A3, A4, A6, A7, or A10 for real user data without a separate written go/no-go decision.

## Operator Run Order

1. Run `npm run verify:production-readiness`, `npm run verify:health-runtime`, and `npm run verify:commercial-operating-loop`, then run production or protected-preview `/api/health` and save the result.
2. Confirm noindex remains active.
3. Confirm `BILLING_CHECKOUT_ENABLED=false`, then run `npm run verify:commercial` and `npm run verify:billing-paid-readiness`.
4. Run `npm run verify:ai-rate-limits` and `npm run verify:rate-limit-runtime`, then apply or verify the expensive-endpoint protection strategy and capture one deployed endpoint 429 proof.
5. Run `npm run verify:data-isolation` and `npm run verify:data-isolation-runtime`, then run the two-account QA matrix.
6. Run `npm run verify:auth-recovery`, then run auth recovery QA on the deployment domain.
7. Run `npm run verify:trust-boundary`, then record legal review or accepted-risk decision for A8.
8. Run `npm run verify:lead-ops` and `npm run verify:lead-ops-runtime`, then submit one Request Access test and process it through the operator queue.
9. Run `npm run verify:support-cohort`, then confirm support inbox, primary owner, backup owner, SEV0/SEV1 escalation owner, and one test support request.
10. Confirm funnel event rows for demo, request access, signup, import, brief, and Review Pack where applicable, then use the operator funnel query pack in the first weekly review.
11. Run `npm run verify:activation-workflow` and `npm run verify:cloud-json-runtime`, then run signed-in activation QA from create/import to saved Review Pack return.
12. Fill the evidence table above with links, screenshots, or notes.
13. Record the final decision below.

## Final Go/No-Go Record

Decision options:

- GO: Invite controlled cohort.
- HOLD: Required evidence is missing.
- GO WITH ACCEPTED RISK: Only A5 and/or A8 risk is accepted for cohort 1.

Current decision: HOLD.

| Field | Value |
| --- | --- |
| Decision date | 2026-07-01 static/local refresh |
| Decision owner | TBD |
| Cohort size approved | TBD |
| Deployment URL | TBD |
| Support inbox | TBD |
| Primary support owner | TBD |
| Backup support owner | TBD |
| AI spend alert owner | TBD |
| Weekly review cadence | TBD |
| Open risks accepted | None |
| Next review date | TBD |

## Gate Impact

This packet does not close Gate A by itself.

It gives Memoire one operator-ready place to prove Gate A and prevents cohort invite decisions from being made from scattered notes. Gate A remains closed until the evidence table is filled and the final decision changes from HOLD to GO or GO WITH ACCEPTED RISK under the rules above.
