# Master roadmap final completion gate

**MEMOIRE ROADMAP COMPLETE — local implementation and development verification through M28.** P1 remains **PRODUCTION DEPLOYMENT PENDING**. No production release is certified by this statement. The authorized P1 exception allowed roadmap development to continue while access/recovery remained unavailable. This gate ends the roadmap; there is no M29.

M28 starts at exact green SHA `a2bac32e737af09703b12bc89d4f325eed969065`. The final SHA is the green commit containing this gate, M28 implementation, conformance fixture, protocol specification and architecture map; the completion response reports its full identifier. It can also be recovered with `git log -1 --format=%H -- docs/qa/master-roadmap-final-completion-2026-10-01.md`. The working tree is clean at handoff. No push or deployment is part of this local completion gate.

## Phase checkpoints

| Phase | Implemented bounded result | Green checkpoint |
|---|---|---|
| P1 | Actual target audit and recovery/access gate; deployment pending | `e5e58d0` |
| Prerequisite repairs | Current-format history restore and quote Money Gate recovery | `6dea56d`, `d24e8d1` |
| M12 | Explicit versioned commercial policy | `893ae48` |
| M13 | Governed material incidents | `c6bd10d` |
| M14 | Explainable human attention budget | `4872520` |
| M15 | Accepted clauses linked to operational obligations | `8540283` |
| M16 | Internal coordination and derived team review | `218e399` |
| M17 | Immutable external observations and owner isolation | `8313c50` |
| M18 | Bounded reviewed connector export adapters | `76eb09b` |
| M19 | Governed commercial read/receipt API | `e84b9d0` |
| M20 | Signed change notifications and operational retry queue | `cf3e291` |
| M21 | Consented selected-promise sharing and actor reviews | `e63e2b6` |
| M22 | Independent typed API SDK | `de7c99a` |
| M23 | Bounded host-governed agent observation/proposals/receipts | `e3c2be5` |
| M24 | Minimal external promise declarations | `3ab4b09` |
| M25 | Scoped integrity capsules and optional agreed-key verification | `c977ea1` |
| M26 | Bounded two-party federation with independent local state | `23ca511` |
| M27 | Existing canonical prerequisite projection with local authority | `a2bac32` |
| M28 | Ten-concept interoperable protocol, checked receipt and final audit | Commit containing this record |

Individual phase evidence remains in `docs/qa/m12-*` through `m28-*`; the earlier M2–M11 release record remains separate. Checkpoints were committed in order from each preceding green state. This gate does not rewrite earlier verification counts or imply earlier reports certified production.

## Final audit and evidence

`npm run check` completed with exit 0 after the final protocol/history/scope refinements: build/prerender, API typecheck, SDK/agent declarations, lint, **2,028 tests, 2,028 passed, zero failures**, and all repository contracts. Thirteen tests are new M28 conformance/durability/database checks. Protocol and existing M25 crypto checks also passed together. The new deterministic public fixture is compared byte-for-byte after normalization. No database migration or backup format change is needed for M28.

| Required gate | Verified scope and evidence | Result |
|---|---|---|
| Architecture | Source/code audit of canonical durability, 12 historical sources, receipt/publication codecs, sharing RPCs, API/SDK/agent/notification interfaces and M24–M28 wire authority. Corrected stale foundational comments claiming no workspace table and universal Event-to-state-change equivalence. No second business resolver, new mutable M28 entity or new primary destination. | Local GO |
| Full tests | Complete check above, including every existing domain, storage, integration and contract suite. | 2,028 passed |
| Migrations | Actual 64-file repository chain replayed from zero in Supabase-compatible embedded PostgreSQL. Existing release/phase suites also exercise populated pre-M2/R1 and per-phase upgrades, preserve legacy data and exact prior history, and validate final schema/constraints. This is not a reconciliation proof for the production target. | Local GO |
| RLS/permissions | Actual migrated roles and `auth.uid()` fixtures: two-owner read/write matrix, foreign writes refused, anonymous denial, actor invitations/acceptance, bounded reader/reviewer views, role/revocation/retirement and restored-epoch refusal. Declared protocol parties cannot grant table access. | Local GO |
| History/Time Machine | Consecutive required revisions, transactional/failed-write rollback, original coverage/lineage, pre-coverage uncertainty, no future leakage, invalid/timezone cutoff handling and read-only historical views. Protocol receipts revalidate immutable source identities and use local recordedAt; conflicts/predecessor gaps do not select accepted truth. | Local GO |
| Backup/restore/export | Current format 15, legacy compatible envelopes, original versions, divergent/orphaned/malformed refusal, source/codec/export inventory, sample exclusion, local rollback, fresh database immutable fact recovery and exact retries. Restored sharing consent and executable notification jobs are not revived. | Local GO |
| API/webhooks/SDK/agents | Authenticated owner DTOs and caller-token RLS; receipt-only writes, conflict/unknown-ack semantics; scheduler-only queue/signatures/retries/leases; compiled independent SDK; pinned agent token, default denied execution, host receipt allowance, expiry/budget/revoke and immutable original envelope. | Local GO |
| Cross-company privacy/authority | Selected public aliases, exact field allowlists, scope/size bounds, retained source claims, full/nested signature/integrity checks, independent key mismatch/tamper refusal, recipient-local nonmutation and unconfirmed shared outcomes. Signatures never prove company identity or accepted Evidence. | Local GO |
| Browser E2E | Eighteen scripts listed below passed against actual local product or HTTP/migrated-database fixture paths, including reload, narrow layout and independent shared actor behavior. | Local GO |
| Architecture map | [Final system architecture](../architecture/memoire-final-system-map.md), [M28 boundary](../architecture/commercial-protocol.md), [normative protocol and fixture](../protocol/commercial-v1.md). | Delivered |
| Production | October 1 CLI project listing still fails with `AccessTokenRequiredError`; environment has no access token, direct DB URL, project link, pg_dump or Docker. No new target catalog, backup, recovery rehearsal, dry-run or authenticated live verification is claimed. | Deployment PENDING |

The final browser matrix reran `scripts/verify-<name>-browser.mjs` for: `next-gen`, `time-machine`, `money-consequence`, `commercial-policies`, `commercial-incidents`, `attention-budget`, `contract-obligations`, `team-coordination`, `external-observations`, `connector-adapters`, `commercial-api`, `commercial-webhooks`, `shared-workspaces`, `shared-members`, `commercial-sdk`, `external-promises`, `federated-threads` and `cross-company`. The last script includes M28 download, tampering/key refusal, browser signature checks, check-before-confirm, receipt/retry, unchanged canonical state and narrow durable reload. SDK verification exercises the built SDK/agent runtime over HTTP backed by actual migrated PostgreSQL. External transport tests use injected fixtures and make no real outbound commercial sends. Temporary browser fixtures/downloads are removed by their scripts.

Verification logs are local ignored `.codex-roadmap-final-*.log` artifacts. Reproducible source tests/scripts and this evidence record are committed. Documentation additions after the green code check do not change executable behavior; final diff validation and clean-tree verification are performed before handoff.

## Production release blockers

The [September 28 P1 audit](../deployment/p1-production-audit-2026-09-28.md) identified the configured Supabase project `mlmpcpkucurylkrobain`, Memoire/Helm coexistence in public schema, a divergent historical migration ledger, absent R1 tables and missing recovery access. Those catalog/backup observations are dated evidence, not an October 1 live re-certification. The current access probe confirms that the existing local CLI/recovery route is still unavailable.

Production requires deployment-grade target access; a restorable full backup of Memoire and Helm with roles/schema/data/migration history; an isolated recovery rehearsal; evidenced schema/ledger reconciliation preserving Helm; reviewed additive migration sequencing and target-baseline dry-run; then the exact-SHA deployment and live RLS/authenticated-browser/export/recovery gates. No blind `db push`, migration-ledger repair, password reset, plan upgrade or release was performed. Public HTTP health or a prior Vercel deployment cannot prove the required schema. A Git push that might automatically deploy is not a substitute for this gate.

## Technical debt and deferred scope

Known debt: legacy Quote/Receivable/Activity historical coverage remains incomplete; affected historical projections report gaps. The existing Today compositor and Kernel review ranking remain separate. API rate limits are process-local, and paginated/agent reads are not an atomic snapshot. Cross-company previews conservatively invalidate on any owned Evidence change. Shared access is bounded; revocation cannot retract already copied information. Host agent grants/proposals are ephemeral, with no distributed quota or durable agent audit ledger.

Deliberate limits: connector file/export intake instead of live OAuth/polling; deployment-managed, currently unconfigured webhook endpoints/schedule and public-IPv4-only outbound transport; private unpublished SDK; small selected-promise reader/reviewer sharing instead of universal organization administration; operational clauses instead of legal interpretation or contract document authentication; manual bounded exchange instead of automatic commercial sending; host-managed optional keys instead of verified company identities/certificate custody; issuer-local declarations instead of shared accepted truth/consensus; no autonomous consequential actions or money transfers. Protocol Condition/Money declarations are supported, but the product adapter leaves undisclosed facts empty. Existing explicit human acceptance and decision boundaries remain required.

All authorized local implementation and final development gates are complete. Stop at M28. Production release remains pending the concrete recovery/access gates above.
