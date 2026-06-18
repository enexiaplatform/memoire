# Memoire Early Access Lead Operations

Date: 2026-06-16

Roadmap link: Gate A5 - Request Access operator workflow

## Purpose

Memoire can collect early-access requests privately, but commercialization requires an operator workflow:

- retrieve new leads,
- assign an owner,
- follow up within a clear SLA,
- approve or decline cohort fit,
- retain or remove old lead records intentionally.

This runbook turns `early_access_requests` from a passive inbox into a controlled cohort queue.

## Data Model

New migration:

- `supabase/migrations/20260616113000_early_access_operator_workflow.sql`

Static contract verifier:

- `scripts/verify-lead-operations-contract.mjs`
- `docs/product/lead-operations-contract-coverage-2026-06-17.md`

It adds:

- `operator_owner`
- `follow_up_due_at`
- `contacted_at`
- `decided_at`
- `operator_note`
- `status_updated_at`
- `operator_early_access_queue`

The public browser still cannot read or update lead records. Operator access remains service-role only.

## Status Workflow

| Status | Meaning | Required Operator Action |
| --- | --- | --- |
| `new` | Request was submitted and has not been contacted. | Claim an owner and set `follow_up_due_at`. |
| `contacted` | First reply was sent. | Schedule next follow-up or decide. |
| `approved` | Good fit for cohort invite. | Send invite/onboarding instructions and record next due date. |
| `declined` | Not a fit for the current cohort. | Send polite closeout when appropriate. |
| `archived` | No longer active or retained only for audit. | Review for deletion after retention window. |

Default SLA:

- New lead claimed within 1 business day.
- First follow-up sent within 2 business days.
- Approved leads invited only after A1-A4 and A7 evidence is present.
- Declined or archived leads reviewed after 90 days.

## Daily Operator Loop

0. Run `npm run verify:lead-ops` before collecting release evidence.
1. Run query 4 in `docs/product/operator-funnel-queries-2026-06-16.sql`.
2. Claim each `new` lead with query 6.
3. Send follow-up using the cohort outreach template.
4. Mark contacted with query 7.
5. Approve, decline, or archive with queries 8 or 9.
6. Record a short `operator_note` with no sensitive customer content.
7. Review the 90-day retention queue weekly with query 10.

## Evidence Required For A5

A5 can move from "improved" to "operational evidence exists" when the operator captures:

- Production row exists in `early_access_requests`.
- `operator_early_access_queue` returns the row.
- The row is claimed with `operator_owner`.
- `follow_up_due_at` is set.
- `contacted_at` is set after first reply.
- Status moves to `approved`, `declined`, or `archived`.
- Retention/deletion policy is acknowledged for old leads.

## Privacy Rules

- Do not store secrets, credentials, or full customer sales content in `operator_note`.
- Keep lead contact details in `early_access_requests` only.
- Do not join anonymous funnel events to lead emails.
- Export or screenshot only the minimum evidence needed for gate review.

## Remaining Gap

This runbook and migration do not prove production operation by themselves. The migration must be applied to Supabase, and one production or protected-preview lead must be run through the workflow before A5 is considered operationally evidenced.
