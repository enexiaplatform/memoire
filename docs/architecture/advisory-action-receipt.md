# Advisory action receipt V1

The private SDK exposes `@memoire/commercial-sdk/agent-action-receipt`. Its synchronous evaluator calls the PR #11 policy with fresh host context and compares the result with an optional historical receipt. It returns an evaluation, an exact retry, a conflict, or a rejection. Every returned receipt has `executionOutcome: 'unknown'`. A policy allow describes eligibility at evaluation time.

## Inputs and binding

The untrusted request is the existing two-field action reference `{ id, revision }`. The authenticated host supplies the principal, the resolved effective workspace, the registered action, the clock, and any grant or human approval. An agent ID is the host's configured label under the authenticated account. Default workspace identity is `null` with the account as data owner. Named workspaces carry both the workspace ID and its distinct effective data owner.

The retry identity is a canonical JSON tuple over schema version, scope, action and applicable approval. It excludes the timestamp and decision so a retry can be evaluated freshly. The scope tuple contains account, agent, workspace and data owner. The action tuple contains action ID, revision, target revision, payload revision, command, classification and source namespace. An explicit `null` means an absent component. Non-read commands require a payload revision. Consequential commands also require a target revision. Use opaque, non-secret host revisions that change with their corresponding content.

PR #11 has a trusted approval snapshot without stable approval identity. This entry point extends that snapshot with `identity: { id, revision }` and the exact action target and payload revisions. The approval tuple contains identity, revision, human reviewer, status and expiration. The host must supply those fields from the trusted review channel. Grant and approval expirations use ISO timestamps with an explicit zone. The existing evaluator and M23 API retain their input contracts.

## Decision table

| Input | Result |
| --- | --- |
| No prior receipt and valid context | `evaluated` with the current policy decision. Missing approval denies consequential actions. |
| Same binding and unchanged current authorization decision | `retry` with the current timestamp and the same retry identity. Concurrent calls with the same snapshots produce the same result. |
| Reused action ID with a different revision, target, payload, command or namespace | `conflict`. Scope changes and approval changes have distinct conflict reasons. |
| Expiry with unchanged approval fields or a grant becoming inactive | Fresh policy evaluation denies. A change from the previous decision is an authorization conflict. |
| Revoked or consumed approval | Denied on first evaluation. Its changed status produces a conflict when compared with the earlier binding. |
| Missing approval identity, mismatched approval action, malformed receipt or unavailable action | `rejected`, with no receipt. |
| Prior evaluation newer than the supplied clock | `conflict` with `stale_evaluation`. |

## Trust boundary and future requirements

The SDK verifies the shape and internal consistency of historical receipts. The host must load the prior receipt from trusted, scope-aware history. A caller can omit or fabricate a syntactically valid history object, so a retry classification alone provides no proof that an earlier evaluation happened. Every returned receipt reflects fresh authorization. The policy still denies internal modifications and consequential writes even with a valid human approval. Retry identity is a comparison value, not a bearer credential.

This module never dispatches, reserves budget, consumes an approval, calls a backend or persists records. A future authorized executor would need authenticated server-side context resolution, durable uniqueness for action IDs in the intended scope, current policy and reviewer checks, atomic replay protection, budget reservation and approval consumption. Verified execution would require its own transaction or externally reconciled result. Unknown outcomes require reconciliation before any retry of a real effect.
