# M14 — attention budget

Starting green SHA: `c6bd10d5b55875149a1f415abe4be264659bf2d1`.

## Audit and domain decision

The Kernel already generates and ranks recommendations by named urgency, unblocking, evidence and value dimensions. Commitment dates, known timing exceptions and money context already feed this reading. Today also has an older operational three-move compositor. M14 does not introduce a third ranking engine: it adds a bounded human review selection to the existing CommercialRiskPanel in Review and its deeper analytics reading. The daily operational compositor remains outside this change.

The recommendation engine now derives a review suggestion from each recorded open Incident in the matching owner and sample scope. The Incident remains its own canonical record. An undated incident is not declared overdue or guaranteed to unblock a deal; a closed Opportunity does not implicitly dismiss its open response. Suggestions retain source references and human-recorded material impact.

## Architecture, persistence and UX

`allocateAttention` partitions the existing ordered candidates into explicitly chosen, suggested and outside-budget items. It neither sorts nor scores them. Capacity is 0–20 review items, not an invented time estimate. No candidate is selected automatically. Users can review all candidates, choose outside the suggested set and reduce capacity without silently losing their choices. Resolved or unavailable choices are explained without claiming completion.

The session-only selection resets on page reload or workspace scope change. It creates no canonical entity, assignment, Plan entry, Decision, Revision or telemetry record of individual choices. Therefore no migration or new backup/export schema is warranted. Existing Incident durability and RLS remain the authority boundary. Errors loading Incidents mark the reading incomplete rather than implying there are none.

The Daylight panel replaces its fixed display limit with budget controls in the existing Review context. It exposes the ordering rules and preserves each candidate's rationale. There is no new top-level navigation. Real team delegation and organizational allocation remain later milestones, not implied by choosing a review item.

## Verification and release

`npm run check` passed with **1,889 tests**, zero failures, build, API typecheck, lint and all repository contracts. This includes the full-chain PostgreSQL fresh/upgrade, owner RLS, backup/restore and required-history suites; M14 adds no database objects. New domain tests cover zero/invalid capacity, explicit overrides, over-capacity preservation, owner/sample filtering, undated incident ranking, closed-Opportunity coordination and nonmutation. Existing ranking contracts pass with the new declared rule.

The attention-budget browser check passed explicit selection, zero budget, visible over-capacity, unchanged canonical records/history, reload reset, narrow viewport and unreadable-Incident handling. Production deployment remains **PENDING** under P1. **GO for M15** from the commit containing this report. Remaining architectural debt: the pre-existing Today operational compositor and Kernel review ranking are distinct; this phase reuses the latter rather than pretending they have been unified.
