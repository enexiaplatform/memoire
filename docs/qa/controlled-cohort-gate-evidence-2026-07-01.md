# Controlled Cohort Gate Evidence

Date: 2026-07-01

Roadmap slice: Gate A static/local evidence refresh after solo-operator positioning expansion.

## Decision

Current cohort invite decision: HOLD.

This evidence refresh confirms that Memoire's static contracts, local runtime guards, and build are intact after the solo-operator positioning expansion. It does not prove production readiness, active distributed endpoint protection, two-account isolation, demo-to-account isolation, auth recovery, monitoring, lead queue operation, support ownership, or signed-in activation on a deployment domain.

Update later on 2026-07-01: the health evidence was strengthened from readiness-helper proof to a real `api/health.ts` endpoint plus handler-level runtime verification. `npm run typecheck:api`, `npm run verify:health-runtime`, and `npm run verify:production-readiness` passed after the endpoint was added.

Second update later on 2026-07-01: the monitoring evidence was strengthened from client telemetry intent to a real `api/client-log.ts` endpoint plus local runtime verification for allowlisted events, arbitrary-event rejection, sanitization, quiet rate limiting, and the deployment-log marker. `npm run typecheck:api`, `npm run verify:production-readiness`, and `npm run verify:accessibility-failure-state` passed after the endpoint was added.

## Evidence Captured

All commands below passed locally on 2026-07-01:

| Area | Command | Result |
| --- | --- | --- |
| Public checkout/noindex posture | `npm run verify:commercial` | Pass |
| Cohort packet structure and HOLD posture | `npm run verify:cohort` | Pass |
| Production readiness static/runtime contract | `npm run verify:production-readiness` | Pass; now checks `api/health.ts` and invokes `api/client-log.ts` locally |
| Health endpoint local runtime contract | `npm run verify:health-runtime` | Pass; now invokes the real `api/health.ts` handler locally |
| AI endpoint rate-limit coverage | `npm run verify:ai-rate-limits` | Pass |
| Rate-limit helper local runtime contract | `npm run verify:rate-limit-runtime` | Pass |
| Data isolation static contract | `npm run verify:data-isolation` | Pass |
| Data isolation local runtime contract | `npm run verify:data-isolation-runtime` | Pass |
| Auth recovery static contract | `npm run verify:auth-recovery` | Pass |
| Trust boundary static contract | `npm run verify:trust-boundary` | Pass |
| Lead operations static contract | `npm run verify:lead-ops` | Pass |
| Lead operations local runtime contract | `npm run verify:lead-ops-runtime` | Pass |
| Support/cohort static contract | `npm run verify:support-cohort` | Pass |
| Activation workflow static contract | `npm run verify:activation-workflow` | Pass |
| Cloud JSON local runtime contract | `npm run verify:cloud-json-runtime` | Pass |
| Commercial operating-loop static contract | `npm run verify:commercial-operating-loop` | Pass |
| Production build | `npm run build` | Pass |

## Gate A Status

| Gate | 2026-07-01 Status | Evidence Captured | Still Required Before Cohort Invite |
| --- | --- | --- | --- |
| A1 Production health | Endpoint exists; static/local handler pass; operational evidence missing | `api/health.ts`, `verify:production-readiness`, `verify:health-runtime`, `npm run build` | Production or protected-preview `/api/health` HTTP 200 with `ok: true`; deployment env dashboard confirmation; auth redirect URLs matched to Supabase settings. |
| A2 AI endpoint protection | Static/local pass; operational evidence missing | `verify:ai-rate-limits`, `verify:rate-limit-runtime` | Active Vercel Firewall/rate-limit/deployment protection or equivalent; one deployed expensive endpoint 429 proof with rate-limit headers. |
| A3 Two-account isolation | Static/local pass; operational evidence missing | `verify:data-isolation`, `verify:data-isolation-runtime` | QA-01 through QA-18 from the two-account matrix, direct RLS negative tests, export inspection, deletion cascade proof, and service-role row counts. |
| A4 Demo isolation | Static/local pass; operational evidence missing | `verify:data-isolation`, `verify:data-isolation-runtime` | Browser QA proving demo load/reset/signup/login cannot contaminate signed-in cloud or export state. |
| A5 Lead operations | Static/local pass; operational evidence missing | `verify:lead-ops`, `verify:lead-ops-runtime` | Submit one production/protected-preview Request Access test and process it through the operator queue. |
| A6 Auth recovery | Static/local handler pass; operational evidence missing | `api/health.ts`, `verify:auth-recovery`, `verify:health-runtime` | Production/protected-preview email verification, reset password, and Google OAuth redirect QA. |
| A7 Monitoring | Health and client-log endpoints exist; static/local handler pass; operational evidence missing | `api/health.ts`, `api/client-log.ts`, `verify:production-readiness`, `verify:health-runtime`, `verify:commercial-operating-loop` | Deployment log filter proof for `/api/client-log`, API/auth/cloud-write/lead/AI-cost monitoring evidence, named owner, and first weekly review evidence. |
| A8 Legal/trust boundaries | Static pass; legal/operator evidence missing | `verify:trust-boundary` | Legal review or accepted-risk record for early-access copy, plus deployed UX QA of disclosures. |
| A9 Cohort/support readiness | Static pass; operator evidence missing | `verify:cohort`, `verify:support-cohort` | Support inbox, primary/backup owner, escalation owner, and one test support request. |
| A10 Activation return usage | Static/local pass; operational evidence missing | `verify:activation-workflow`, `verify:cloud-json-runtime` | Signed-in create/import -> brief -> save Review Pack -> reload/logout/login -> direct Review Pack route QA on deployment domain. |

## Manual QA Evidence Note

The two-account and demo-isolation manual QA run was not executed in this local implementation pass because the session did not include:

- Production or protected-preview deployment URL.
- Two real test accounts with email/OAuth access.
- Supabase dashboard or SQL editor access for direct RLS/service-role evidence.
- Vercel dashboard/log access for firewall, health, and client-log evidence.

No P0 isolation bug was found by the static/local verifier suite in this pass. That is not enough to invite real users; A3 and A4 remain open until the operational QA matrix passes.

## Next Operator Run

Use `docs/qa/two-account-data-isolation-qa-2026-06-16.md` as the execution checklist. Record the production/protected-preview run with:

- Deployment URL and timestamp.
- Test User A and Test User B identifiers.
- Export manifests for both users.
- Direct RLS negative select/update/insert results.
- Demo load/reset/signup/login evidence.
- Post-delete service-role row counts.

Only update the cohort packet from HOLD to GO after A1-A4, A6, A7, and A10 have real deployment evidence. A5 and A8 may be accepted as limited manual risk only under the packet's existing risk-acceptance rules.
