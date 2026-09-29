# M13 — commercial incidents

Starting green SHA: `893ae4833a9e8e66e0002eb6a56889b8b3f73fa9`.

## Domain and architecture

The architecture audit found explicit Policies, Requirement readings, canonical Revisions and contextual Opportunity controls already sufficient to establish a material deviation. M13 adds a human-confirmed response to an unmet Policy. A candidate is derived; it becomes an Incident only when a human records the material impact and response coordinator. One Policy can have at most one open Incident. An Incident creates no task, commitment, recommendation, financial consequence or automatic alert.

The opening snapshot preserves the exact Policy version, reading reason and source references. Updates record coordinated response; closure is either addressed or explicitly dismissed. Addressed requires the current rule to be satisfied or no longer applicable. Unavailable or unmet rules cannot be represented as addressed. A dismissed response does not imply the underlying requirement was fulfilled. Closed records and opening facts are immutable.

## Persistence and ownership

The new `commercial_incidents` aggregate uses existing Kernel storage, required Revisions, owner RLS and the transactional backup restore. Policies and Incidents share a strict versioned-store adapter, removing duplicated synchronization logic without creating another event or history engine. Offline versions replay consecutively; conflicting versions and corrupt storage surface errors. Cloud refresh cannot silently replace a concurrent edit or divergent local history. Incident synchronization first synchronizes its referenced Policy.

The additive migration checks parent ownership, Opportunity scope, accepted opening Policy version, sequential updates and unique open responses. Required Revision failure rolls back the canonical write. Anonymous access and hard deletion are denied. The coordinator is a human-entered response label, not a multi-user permission grant; actual organizational authority remains later roadmap work.

Backup format 13 includes Incidents and validates references. Restore accepts older formats, preserves legacy lineage identity when the new source is empty, restores parents first, and can validate an older opening Policy against incoming accepted Revisions. Sample records remain excluded from real-account export and synchronization. No production migration has been applied.

## UX and history

Opportunity policies contain a contextual incident response section. Escalation and every response require confirmation. Existing responses show their material impact, coordinator, source basis and disposition. Time Machine reads only the incident version available at its cutoff and exposes no mutation controls. There is no new top-level navigation.

## Validation

Domain tests cover explicit confirmation, scope, stale versions, unmet-policy eligibility, duplicate escalation, truthful closure and sample isolation. Full-chain database tests cover fresh schema, populated M12 upgrade preserving source/revision/coverage rows, RLS, anonymous access, immutable opening facts, version sequencing, required-history rollback, legacy lineage and format-13 restoration with an older opening Policy. Shared-store, backup and durability tests run in the complete repository suite.

All four local browser checks passed: R1 commercial flow, Time Machine, Policies and Incidents. Incident verification includes reload, no automatic task/commitment/decision creation, blocked false resolution, explicit dismissal, cutoff reconstruction and narrow viewport.

Production deployment remains **PENDING** under the documented P1 recovery and shared-schema gate. Local results do not assert production readiness. The final repository result and commit identity are recorded with this phase's commit; the next phase starts at that exact SHA.

Final verification: `npm run check` passed with **1,883 tests**, zero failures, build, API typecheck, lint and all repository contracts. The four browser scripts passed. **GO for M14** from the commit containing this report.
