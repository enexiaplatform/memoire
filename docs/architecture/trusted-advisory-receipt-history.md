# Trusted advisory receipt history V1

The server helper adapts authenticated, scope-bound receipt history to the PR #17 evaluator. It has no route or runtime caller. The V1 history repository and current-action provider are trusted server dependencies. The fixture in `test/unit/trustedAdvisoryHistory.test.mjs` is the only adapter in this change.

~~~mermaid
flowchart LR
    Request["Untrusted request: bearer, workspace selector, action ID and revision"]
    Host["Server-configured account and agent"]
    Auth["Existing Auth and workspace ownership checks"]
    Resolver["Trusted history resolver"]
    Repository["Read-only scoped repository"]
    Policy["Trusted current action, grant and approval"]
    Evaluator["PR #17 advisory evaluator"]
    Result["History status and advisory decision"]
    Request --> Auth
    Host --> Auth
    Auth --> Resolver
    Resolver -->|"Full authorized partition key"| Repository
    Repository -->|"Stored partition and V1 receipt"| Resolver
    Resolver --> Policy
    Resolver -->|"Recheck Auth and effective owner"| Auth
    Resolver --> Evaluator
    Policy --> Evaluator
    Evaluator --> Result
~~~

## Boundary

Provision the resolver for one host-configured account and agent label. A request cannot choose its agent identity. Verify the bearer for that account with the existing server Auth helper. Use the existing workspace directory and effective-owner checks for named workspaces. The omitted native workspace header means the account's default workspace. Verify both account and workspace again after the awaited reads. A failed recheck returns a single scope-unavailable result. Each attempt retains its own captured selector.

The only untrusted action input is the bounded `{ id, revision }` reference. The repository reads by account, agent, workspace, effective data owner and action ID. It must return the actual partition of the stored row. Looking up the latest row by action ID across revisions lets the evaluator distinguish a changed revision from absent history. The current action, grant and approval are supplied by the trusted host and read after historical lookup. History cannot supply or override any of those fields.

## Results

| History condition | Resolver result |
| --- | --- |
| No authorized row | `resolved` with `missing` and the fresh advisory evaluation. |
| Valid V1 row in the same partition | `resolved` with `found` and the PR #17 result. |
| Same partition with a changed revision, binding, current decision or future-dated evaluation | `resolved` with `stale` and the PR #17 conflict reason. |
| Wrong partition or readable foreign receipt binding | Same result as a missing row. No foreign metadata is returned. |
| Invalid or unsupported receipt in the authorized partition | `history_corrupted`. |
| Repository failure or unverifiable partition metadata | `history_unavailable`. |
| Invalid current action reference, binding or policy input | The original evaluator result with history `not_used`. |

Missing history is distinct from unavailable or corrupted history. The resolver never retries a failed read and never treats it as an initial evaluation. Every receipt remains an advisory decision with unknown execution outcome.

## Storage and concurrency limits

The existing M23 maps are per-runtime proposal and intake state. Kernel observation receipts are ingestion events, and the Plan completion table proposed in PR #8 is scoped to committed Plan/Activity links. None is a trustworthy store for V1 advisory policy history. No production adapter, schema, route, cache, dispatch or reservation is added.

The adapter must enforce the full partition at the data source, return an immutable snapshot, and bound its read time. The helper uses no shared in-flight result. Auth, workspace and repository reads are separate operations. The post-read check suppresses changes visible to the existing Auth and scope APIs, including a different effective owner. It cannot close a race after the final check, guarantee instantaneous session revocation, or provide a transactional authorization snapshot. No time-to-live policy is assumed. A future production integration needs an approved authoritative store and an independently reviewed consistency and revocation contract.
