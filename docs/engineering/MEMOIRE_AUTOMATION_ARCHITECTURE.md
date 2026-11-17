# Memoire automation architecture

Status as of 2026-11-17. The owner-scoped scheduled engine described below exists in the baseline. This development branch adds workspace-boundary safeguards. The event-triggered extension and commercial approvals are pending.

## Implemented execution path

1. Settings calls the `automations` resource on the existing Commercial endpoint. The handler verifies the bearer identity, applies address and owner limits, and reads settings and history with the caller's Supabase token. Configuration revisions guard simultaneous edits. Preview reads a bounded confirmed-cloud snapshot and computes candidate work without writes.
2. The scheduled worker verifies the scheduler secret and processes enabled owners in bounded batches. The Run now action uses the same execution function after verifying the requesting owner and enabled settings.
3. PostgreSQL gives a run a two-minute lease with an attempt limit of three per run identity. The worker reads the captured sources and settings revision, evaluates the deterministic engine and proposes Plan changes and prepared outputs.
4. The finish RPC rechecks the lease, settings revision and source fingerprint. It atomically records the receipt and accepted changes. Changed sources produce a retryable result. Repeated completion returns the stored summary. Deterministic task identities, tombstones and the daily cap constrain repeats, and seller edits take precedence.
5. Settings surfaces run status and outputs. Today, Capture, Plan, Review, Accounts, margin, reports and dashboards display relevant prepared work through their existing entry points.

The engine can prepare information and create opted-in low-risk Plan items. It does not have executors for external messaging, evidence acceptance, payment, record deletion or commercial approval. The October receipt is historical evidence for the scheduled rollout. This branch was verified locally with synthetic data.

## Reusable primitives

| Need | Existing implementation | Extension boundary |
| --- | --- | --- |
| Business event and provenance | Commercial Events, stable idempotency keys, history revisions and state sources | Record a business action once from its canonical write command. Define how user-authored activity and subsequent system guidance are linked. |
| Rule evaluation | `src/domain/automation` and `shared/automation.js` | Add versioned event and scheduled rule definitions when workspace scope is available throughout the worker. |
| Dispatch and retries | `api/_automation.js` and claim/read/finish SQL RPCs | Reuse the worker. Claim by workspace and event or schedule identity. Record failure, next retry and terminal disposition in durable history. |
| Approval and evidence | Commercial policy, evidence, decision and revision primitives | Implement a separately attributable quote approval transition bound to an immutable revision and evaluated policy. Reviewers of a Shared Workspace currently have only promise-review authority. |
| Prepared outputs | Prepared output store and Settings controls | Surface read-only suggestion, editable draft or pending decision in the relevant existing screen. |

## Pending operator controls

- **Suggest only** returns a reviewable finding with source and rule references.
- **Prepare draft** creates a reversible draft under the active workspace. Applying it requires a new user action.
- **Automatic** uses a narrow allowlist of internal actions. Existing opted-in Plan reminder creation is the only demonstrated category in this branch.
- **Require approval** creates an explicit pending decision. Require an authenticated authorized approver, current revision, correct workspace and an idempotent transition. Store the actor, policy version, decision, time and comment. A worker or model cannot approve.

## Dependencies for event dispatch

First pass the full same-account isolation gate in [Workspace isolation tests](WORKSPACE_ISOLATION_TESTS.md). Then attach the event to the successful business mutation in the same durable transaction where the store permits it. For offline commands, retain the same mutation identity through reconciliation. Scope the run ledger, counters, source fingerprint, source resolution, prepared IDs and execution history to the workspace. Check authorization and current policy again at execution so a revoked or stale action cannot replay.

Reuse the existing Vercel and Supabase scheduler. There is no repository evidence that an additional orchestration service is needed for the planned bounded workflows.

[Existing implementation plan](../product/automation-execution-plan-2026-10-21.md) · [Historical deployment receipt](../deployment/automation-whole-product-production-2026-10-21.md)
